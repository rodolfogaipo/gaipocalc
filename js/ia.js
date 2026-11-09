// Conversa com o servidor da IA (Cloudflare Worker).
import { SERVIDOR_IA, CHAVE_APP } from './config.js';

export function config() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem('gaipo.config') || '{}'); } catch { c = {}; }
  return {
    servidor: (c.servidor || SERVIDOR_IA || '').trim().replace(/\/+$/, ''),
    chave: c.chave || CHAVE_APP || '',
    nivel: c.nivel || 'medio',
    angulo: c.angulo || 'graus',
  };
}
export function salvarConfig(novo) {
  try { localStorage.setItem('gaipo.config', JSON.stringify({ ...lerCru(), ...novo })); } catch { /* sem armazenamento */ }
}
function lerCru() { try { return JSON.parse(localStorage.getItem('gaipo.config') || '{}'); } catch { return {}; } }

export function iaConfigurada() { return !!config().servidor; }
export function online() { return navigator.onLine !== false; }

async function post(corpo, ms = 120000) {
  const c = config();
  if (!c.servidor) throw new Error('A IA ainda não foi configurada neste aparelho (Configurações → Servidor da IA).');
  if (!online()) throw new Error('Sem internet. A IA precisa de conexão; o teclado funciona offline.');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  let r;
  try {
    r = await fetch(c.servidor + '/resolver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Gaipo-Chave': c.chave },
      body: JSON.stringify({ ...corpo, nivel: c.nivel }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'A IA demorou demais para responder. Tente de novo.' : 'Não consegui falar com o servidor da IA. Confira a internet.');
  } finally { clearTimeout(t); }
  let dados;
  try { dados = await r.json(); } catch { throw new Error('Resposta inválida do servidor da IA.'); }
  if (!r.ok || !dados.ok) throw new Error(dados.erro || `Erro ${r.status} no servidor da IA.`);
  return dados;
}

export const resolverImagem = (base64, mime, modo = 'imagem') => post({ modo, imagem: base64, mime });
export const resolverTexto = (texto) => post({ modo: 'texto', texto });
export const explicar = (latex, resposta) => post({ modo: 'explicar', latex, resposta });

export async function testar() {
  const c = config();
  if (!c.servidor) return 'Sem endereço configurado.';
  try {
    const r = await fetch(c.servidor + '/saude');
    const d = await r.json();
    return d.ok ? 'Conectado ✓' : 'Servidor respondeu com erro.';
  } catch { return 'Não conectou. Confira o endereço e a internet.'; }
}
