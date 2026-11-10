// Estatística: média, mediana, moda, variância, desvio padrão, quartis — passo a passo.
import { Q, ErroMat, formatNum } from './racional.js';
import { P } from './poli.js';

const ql = (q) => q.toLatex();
const dec = (q) => { const d = q.toDecimal(6); return (d.exata ? '' : '\\approx ') + d.txt.replace(',', '{,}'); };
const mostra = (q) => (q.isInt ? ql(q) : q.toDecimal(6).exata ? q.toDecimal(6).txt.replace(',', '{,}') : `${ql(q)}\\approx ${q.toDecimal(4).txt.replace(',', '{,}')}`);
const lista = (xs, max = 30) => (xs.length > max ? xs.slice(0, max).map(mostra).join(';\\ ') + ';\\ \\ldots' : xs.map(mostra).join(';\\ '));

function raiz(q) {
  // √q exato (quando dá) e aproximado
  const p = P.c(q).pow(new Q(1n, 2n));
  const exato = p.latex();
  const v = Math.sqrt(q.toNumber());
  return { latex: p.eQ ? exato : `${exato}\\approx ${formatNum(v, 4).replace(',', '{,}')}`, num: v };
}

function mediana(ord) {
  const n = ord.length;
  if (n % 2) return { v: ord[(n - 1) / 2], pos: [(n + 1) / 2] };
  return { v: ord[n / 2 - 1].add(ord[n / 2]).div(2), pos: [n / 2, n / 2 + 1] };
}

export function estatistica(xs, foco = 'tudo') {
  if (!xs.length) throw new ErroMat('Digite os números separados por ponto e vírgula. Ex.: media(4; 7; 7; 10)');
  if (xs.length > 2000) throw new ErroMat('Lista grande demais (máximo 2000 números).');
  const n = xs.length;
  const passos = [];
  const ord = [...xs].sort((a, b) => a.cmp(b));
  passos.push({ titulo: 'Organizando os dados', texto: `São ${n} valores. Em ordem crescente (rol):`, latex: lista(ord) });

  // média
  let soma = Q.ZERO; for (const x of xs) soma = soma.add(x);
  const media = soma.div(n);
  passos.push({ titulo: 'Média aritmética', texto: 'Somamos todos os valores e dividimos pela quantidade.', latex: `\\bar{x}=\\frac{${xs.length <= 12 ? xs.map(mostra).join('+') : '\\text{soma}'}}{${n}}=\\frac{${mostra(soma)}}{${n}}=${mostra(media)}` });

  // mediana
  const md = mediana(ord);
  passos.push({ titulo: 'Mediana', texto: n % 2 ? `Com ${n} valores (ímpar), a mediana é o valor do meio: a posição ${md.pos[0]} do rol.` : `Com ${n} valores (par), a mediana é a média dos dois valores do meio (posições ${md.pos[0]} e ${md.pos[1]}).`, latex: n % 2 ? `Md=${mostra(md.v)}` : `Md=\\frac{${mostra(ord[n / 2 - 1])}+${mostra(ord[n / 2])}}{2}=${mostra(md.v)}` });

  // moda
  const freq = new Map();
  for (const x of ord) { const k = x.toString(); freq.set(k, { q: x, f: (freq.get(k)?.f || 0) + 1 }); }
  const maxF = Math.max(...[...freq.values()].map((v) => v.f));
  const modas = [...freq.values()].filter((v) => v.f === maxF).map((v) => v.q);
  let modaTxt, modaLatex;
  if (maxF === 1) { modaTxt = 'Nenhum valor se repete: a lista é amodal (não tem moda).'; modaLatex = 'Mo:\\ \\text{não tem (amodal)}'; }
  else if (modas.length === freq.size) { modaTxt = 'Todos os valores aparecem o mesmo número de vezes: não há moda.'; modaLatex = 'Mo:\\ \\text{não tem}'; }
  else { modaTxt = `${modas.length > 1 ? 'Os valores que mais aparecem' : 'O valor que mais aparece'} (${maxF} vezes)${modas.length > 1 ? (modas.length === 2 ? ' — lista bimodal' : ' — lista multimodal') : ''}.`; modaLatex = `Mo=${modas.map(mostra).join(';\\ ')}`; }
  passos.push({ titulo: 'Moda', texto: modaTxt, latex: modaLatex });

  // amplitude
  const amp = ord[n - 1].sub(ord[0]);
  passos.push({ titulo: 'Amplitude', texto: 'Maior valor menos o menor valor.', latex: `A=${mostra(ord[n - 1])}-${mostra(ord[0])}=${mostra(amp)}` });

  // variância e desvio padrão
  let sq = Q.ZERO;
  const desvios = xs.map((x) => { const d = x.sub(media); sq = sq.add(d.mul(d)); return d; });
  const varPop = sq.div(n);
  const varAm = n > 1 ? sq.div(n - 1) : null;
  passos.push({ titulo: 'Variância', texto: 'Quanto os valores se espalham em volta da média: média dos quadrados das diferenças para a média.', latex: `\\sigma^{2}=\\frac{${xs.length <= 8 ? desvios.map((d) => `(${mostra(d)})^{2}`).join('+') : '\\sum(x_i-\\bar{x})^{2}'}}{${n}}=\\frac{${mostra(sq)}}{${n}}=${mostra(varPop)}` });
  const dp = raiz(varPop);
  passos.push({ titulo: 'Desvio padrão', texto: 'É a raiz quadrada da variância (fica na mesma unidade dos dados).', latex: `\\sigma=\\sqrt{${mostra(varPop)}}=${dp.latex}` });
  let dpA = null;
  if (varAm) {
    dpA = raiz(varAm);
    passos.push({ titulo: 'Para amostras', texto: 'Se os dados são uma amostra (e não a população toda), divide-se por n − 1.', latex: `s^{2}=\\frac{${mostra(sq)}}{${n - 1}}=${mostra(varAm)},\\quad s=${dpA.latex}` });
  }
  // quartis (método das metades)
  let q1 = null, q3 = null;
  if (n >= 4) {
    const inf = ord.slice(0, Math.floor(n / 2)), sup = ord.slice(Math.ceil(n / 2));
    q1 = mediana(inf).v; q3 = mediana(sup).v;
    passos.push({ titulo: 'Quartis', texto: 'Q1 é a mediana da metade de baixo e Q3 a mediana da metade de cima. Entre Q1 e Q3 ficam 50% dos dados.', latex: `Q_1=${mostra(q1)},\\quad Q_2=Md=${mostra(md.v)},\\quad Q_3=${mostra(q3)}` });
  }
  if (!media.isZero) {
    const cv = (dp.num / Math.abs(media.toNumber())) * 100;
    passos.push({ titulo: 'Coeficiente de variação', texto: 'Desvio padrão em relação à média (quanto menor, mais homogêneos os dados).', latex: `CV=\\frac{\\sigma}{\\bar{x}}\\cdot 100\\%\\approx ${formatNum(cv, 2).replace(',', '{,}')}\\%` });
  }
  const linhas = {
    media: `\\bar{x}=${mostra(media)}`,
    mediana: `Md=${mostra(md.v)}`,
    moda: modaLatex,
    variancia: `\\sigma^{2}=${mostra(varPop)}`,
    desvio: `\\sigma=${dp.latex}`,
    amplitude: `A=${mostra(amp)}`,
  };
  const ordem = ['media', 'mediana', 'moda', 'desvio', 'variancia', 'amplitude'];
  const prim = linhas[foco] ? [foco, ...ordem.filter((k) => k !== foco)] : ordem;
  const resposta = foco !== 'tudo' && linhas[foco] && n < 3 ? linhas[foco] : `\\begin{array}{l}${prim.map((k) => linhas[k]).join('\\\\')}\\end{array}`;
  return {
    tipo: 'estatistica',
    titulo: foco === 'tudo' ? 'Estatística' : { media: 'Média', mediana: 'Mediana', moda: 'Moda', variancia: 'Variância', desvio: 'Desvio padrão', amplitude: 'Amplitude' }[foco] || 'Estatística',
    entrada: `\\left\\{${lista(xs, 20)}\\right\\}`,
    resposta,
    passos,
    grafico: { tipo: 'estatistica', valores: ord.map((q) => q.toNumber()), freq: [...freq.values()].map((v) => [v.q.toNumber(), v.f]), media: media.toNumber(), mediana: md.v.toNumber(), q1: q1?.toNumber(), q3: q3?.toNumber() },
  };
}

// lê números de um texto: "4; 7,5; 10" ou "4 7.5 10" ou um por linha
export function lerNumeros(txt) {
  const t = String(txt).trim();
  if (!t) return [];
  const temPontoVirgula = /;/.test(t) || /\n/.test(t);
  const partes = temPontoVirgula ? t.split(/[;\n]+/) : /,\s/.test(t) || !/\d,\d/.test(t) ? t.split(/[,\s]+/) : t.split(/\s+/);
  const out = [];
  for (let p of partes) {
    p = p.trim();
    if (!p) continue;
    // "7x3" = valor 7 três vezes
    const rep = p.match(/^(-?[\d.,]+)\s*[x×*]\s*(\d+)$/i);
    if (rep) { const v = Q.fromDecimal(rep[1].replace(',', '.')); for (let i = 0; i < Number(rep[2]); i++) out.push(v); continue; }
    if (!/^-?\d+([.,]\d+)?$/.test(p)) throw new ErroMat(`Não entendi o valor “${p}”. Use números separados por ponto e vírgula.`);
    out.push(Q.fromDecimal(p.replace(',', '.')));
  }
  return out;
}
