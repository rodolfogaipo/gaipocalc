// Teste local do Worker com a API simulada (não gasta créditos): node teste.mjs
import worker from './src/index.js';
let enviado = null;
globalThis.fetch = async (url, init) => {
  enviado = { url: String(url), headers: Object.fromEntries(new Headers(init.headers)), body: JSON.parse(init.body) };
  const dados = { lido: '2x+3=7', latex: '2x+3=7', tipo: 'Equação do 1º grau', resposta_latex: 'x=2', resposta_texto: 'x vale 2', passos: [{ titulo: 'Isolar', explicacao: 'Subtrai 3', latex: '2x=4' }], observacao: '' };
  return new Response(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(dados) }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_1' } });
};
const env = { ANTHROPIC_API_KEY: 'sk-teste', CHAVE_APP: 'abc123' };
const pedir = (corpo, chave = 'abc123') => worker.fetch(new Request('https://x/resolver', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gaipo-Chave': chave }, body: JSON.stringify(corpo) }), env);
let r = await pedir({ modo: 'texto', texto: '2x+3=7', nivel: 'fundamental' });
console.log('status', r.status, await r.json());
console.log('url', enviado.url, '\nbeta', enviado.headers['anthropic-beta'], '\nmodelo', enviado.body.model, 'fallbacks', enviado.body.fallbacks, '\noutput_config', JSON.stringify(enviado.body.output_config).slice(0, 120), '\nbetas no corpo?', 'betas' in enviado.body);
r = await pedir({ modo: 'imagem', imagem: 'AAAA', mime: 'image/png' });
console.log('imagem', r.status, enviado.body.messages[0].content[0].type, enviado.body.messages[0].content[0].source.media_type);
r = await pedir({ modo: 'texto', texto: 'x' }, 'errada');
console.log('chave errada', r.status, (await r.json()).erro);
r = await worker.fetch(new Request('https://x/saude'), env);
console.log('saude', r.status, await r.json());
