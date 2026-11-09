// GAIPO CALC — servidor da IA (Cloudflare Worker).
// Recebe foto / desenho / texto da questão, pede ao Claude a leitura + resolução passo a passo
// e devolve JSON. A chave da Anthropic fica só aqui (segredo do Worker), nunca no app.
import Anthropic from '@anthropic-ai/sdk';

const MODELO = 'claude-opus-5-5';
const MAX_IMAGEM = 7_000_000; // caracteres base64 (~5 MB)
const LIMITE_HORA_PADRAO = 60;

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lido', 'latex', 'tipo', 'resposta_latex', 'resposta_texto', 'passos', 'observacao'],
  properties: {
    lido: { type: 'string', description: 'O enunciado exatamente como foi lido/entendido, em texto simples.' },
    latex: { type: 'string', description: 'A conta/equação principal em LaTeX simples (veja as regras). Vazio se for só texto.' },
    tipo: { type: 'string', description: 'Tipo do problema em português, ex.: "Equação do 2º grau", "Integral", "Porcentagem".' },
    resposta_latex: { type: 'string', description: 'Resposta final em LaTeX.' },
    resposta_texto: { type: 'string', description: 'Resposta final em uma frase curta em português.' },
    passos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'explicacao', 'latex'],
        properties: {
          titulo: { type: 'string' },
          explicacao: { type: 'string' },
          latex: { type: 'string' },
        },
      },
    },
    observacao: { type: 'string', description: 'Avisos (ex.: parte da foto ilegível, mais de uma questão na foto). Vazio se nada.' },
  },
};

const NIVEIS = {
  fundamental: 'aluno do ensino fundamental: linguagem bem simples, passos pequenos, sem pular contas',
  medio: 'aluno do ensino médio: linguagem clara, mostre as fórmulas usadas e por quê',
  faculdade: 'estudante universitário: pode usar termos técnicos, mas mostre cada técnica e cada passo de cálculo',
};

function sistema(nivel) {
  return `Você é o professor de matemática do app GAIPO CALC. Fale sempre em português do Brasil.
Explique para um ${NIVEIS[nivel] || NIVEIS.medio}.

Regras:
- Resolva com cuidado e confira a resposta antes de responder (substitua de volta quando der).
- Cada passo: um título curto, uma explicação do PORQUÊ (ensine, não só mostre) e a conta em LaTeX.
- Números decimais com vírgula: escreva 3{,}5 no LaTeX.
- O campo "latex" é a questão em LaTeX simples, para a calculadora conferir: use só \\frac{}{}, \\sqrt{}, \\sqrt[n]{}, ^{}, \\cdot, \\div, parênteses \\left( \\right), \\sin \\cos \\tan \\ln \\log_{b}, \\pi, e, \\int ... \\,dx, \\int_{a}^{b} ... \\,dx, \\frac{d}{dx}\\left(...\\right), \\lim_{x\\to a}, \\infty, \\le \\ge, sistemas com \\begin{cases} ... \\\\ ... \\end{cases}. Sem texto dentro do LaTeX. Se a questão for um problema em palavras, coloque em "latex" a conta/equação que resolve o problema.
- Se houver várias questões na imagem, resolva a primeira (ou a que estiver destacada) e avise em "observacao".
- Se não der para ler a imagem, diga em "observacao" o que está ilegível e deixe "latex" vazio.`;
}

function cors(origem) {
  return {
    'Access-Control-Allow-Origin': origem || '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Gaipo-Chave',
    'Access-Control-Max-Age': '86400',
  };
}

function json(obj, status = 200, origem) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origem) } });
}

// limite simples por IP (por instância do Worker; é uma proteção básica)
const contagem = new Map();
function passouLimite(ip, limite) {
  const hora = Math.floor(Date.now() / 3_600_000);
  const k = ip + ':' + hora;
  const n = (contagem.get(k) || 0) + 1;
  contagem.set(k, n);
  if (contagem.size > 5000) contagem.clear();
  return n > limite;
}

function iguaisSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export default {
  async fetch(req, env) {
    const origem = req.headers.get('Origin') || '*';
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origem) });
    if (url.pathname === '/saude') return json({ ok: true, app: 'gaipocalc', modelo: MODELO }, 200, origem);
    if (url.pathname !== '/resolver' || req.method !== 'POST') return json({ ok: false, erro: 'Rota não encontrada.' }, 404, origem);

    if (!env.ANTHROPIC_API_KEY) return json({ ok: false, erro: 'Servidor sem chave da IA configurada.' }, 500, origem);
    if (env.CHAVE_APP && !iguaisSeguro(req.headers.get('X-Gaipo-Chave') || '', env.CHAVE_APP)) {
      return json({ ok: false, erro: 'Código do app inválido.' }, 401, origem);
    }
    const ip = req.headers.get('CF-Connecting-IP') || 'x';
    if (passouLimite(ip, Number(env.LIMITE_POR_HORA) || LIMITE_HORA_PADRAO)) {
      return json({ ok: false, erro: 'Muitas perguntas seguidas. Espere um pouco e tente de novo.' }, 429, origem);
    }

    let corpo;
    try { corpo = await req.json(); } catch { return json({ ok: false, erro: 'Pedido inválido.' }, 400, origem); }
    const modo = corpo.modo;
    const nivel = NIVEIS[corpo.nivel] ? corpo.nivel : 'medio';
    const conteudo = [];
    if (modo === 'imagem' || modo === 'tinta') {
      const img = String(corpo.imagem || '');
      const tipo = ['image/jpeg', 'image/png', 'image/webp'].includes(corpo.mime) ? corpo.mime : 'image/jpeg';
      if (!img || img.length > MAX_IMAGEM) return json({ ok: false, erro: 'Imagem vazia ou grande demais.' }, 400, origem);
      conteudo.push({ type: 'image', source: { type: 'base64', media_type: tipo, data: img } });
      conteudo.push({ type: 'text', text: modo === 'tinta'
        ? 'Esta é uma conta escrita à mão na tela do celular. Leia com atenção (pode ter letra feia), resolva e explique passo a passo.'
        : 'Esta é a foto de uma questão de matemática (caderno, livro ou prova). Leia, resolva e explique passo a passo.' });
    } else if (modo === 'texto') {
      const t = String(corpo.texto || '').slice(0, 4000);
      if (!t.trim()) return json({ ok: false, erro: 'Texto vazio.' }, 400, origem);
      conteudo.push({ type: 'text', text: `Questão: ${t}\n\nResolva e explique passo a passo.` });
    } else if (modo === 'explicar') {
      const lt = String(corpo.latex || '').slice(0, 4000);
      const resp = String(corpo.resposta || '').slice(0, 2000);
      if (!lt.trim()) return json({ ok: false, erro: 'Questão vazia.' }, 400, origem);
      conteudo.push({ type: 'text', text: `Questão (LaTeX): ${lt}\n${resp ? `A calculadora encontrou: ${resp}\n` : ''}\nExplique a resolução passo a passo, com calma, como numa aula particular. Se a resposta da calculadora estiver errada, corrija e avise em "observacao".` });
    } else {
      return json({ ok: false, erro: 'Modo desconhecido.' }, 400, origem);
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const resposta = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
        system: sistema(nivel),
        messages: [{ role: 'user', content: conteudo }],
      });
      if (resposta.stop_reason === 'refusal') return json({ ok: false, erro: 'A IA não pôde responder essa questão.' }, 422, origem);
      if (resposta.stop_reason === 'max_tokens') return json({ ok: false, erro: 'A explicação ficou longa demais. Tente uma questão por vez.' }, 422, origem);
      const texto = resposta.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      let dados;
      try { dados = JSON.parse(texto); } catch { return json({ ok: false, erro: 'A IA respondeu num formato inesperado. Tente de novo.' }, 502, origem); }
      return json({ ok: true, ...dados }, 200, origem);
    } catch (e) {
      const status = e && e.status;
      if (status === 429 || status === 529) return json({ ok: false, erro: 'A IA está ocupada agora. Tente de novo em alguns segundos.' }, 503, origem);
      if (status === 401) return json({ ok: false, erro: 'Chave da IA inválida no servidor.' }, 500, origem);
      return json({ ok: false, erro: 'Falha ao falar com a IA.' }, 502, origem);
    }
  },
};
