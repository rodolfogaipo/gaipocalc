// GAIPO CALC — interface
import { MathfieldElement, convertLatexToMarkup } from '../vendor/mathlive/mathlive.min.js';
import { resolver, ErroMat, analisar } from './motor/index.js';
import { criarCAS } from './motor/cas.js';
import { avaliar, variaveis } from './motor/ast.js';
import { falaParaExpressao } from './voz.js';
import { Caneta } from './caneta.js';
import * as IA from './ia.js';
import { VERSAO } from './config.js';

const $ = (id) => document.getElementById(id);
const Cap = window.Capacitor;
const nativo = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const plugin = (n) => (nativo && Cap.Plugins && Cap.Plugins[n]) || null;
const cas = criarCAS(window.nerdamer);

// ---------- MathLive ----------
MathfieldElement.decimalSeparator = ',';
MathfieldElement.soundsDirectory = null;
MathfieldElement.fractionNavigationOrder = 'numerator-denominator';
const mf = $('campo');
mf.placeholder = '\\text{Digite a conta}';
mf.smartFence = true;
mf.mathVirtualKeyboardPolicy = 'auto';
mf.menuItems = [];
configurarTeclado();

function configurarTeclado() {
  const kb = window.mathVirtualKeyboard;
  if (!kb) return;
  const t = (latex, extra) => ({ latex, ...extra });
  const txt = (label, insert, extra) => ({ label, insert, class: 'small', ...extra });
  kb.layouts = [
    {
      label: '123', tooltip: 'Números e operações',
      rows: [
        ['7', '8', '9', t('\\div'), '(', ')', 'x', '[backspace]'],
        ['4', '5', '6', t('\\times', { insert: '\\cdot' }), t('\\frac{#@}{#?}'), t('#@^{2}'), t('#@^{#?}'), t('\\sqrt{#0}')],
        ['1', '2', '3', '-', '=', '<', '>', 'y'],
        ['0', t('{,}', { label: ',' }), t('\\pi'), '+', t('\\%'), '!', '[left]', '[right]'],
      ],
    },
    {
      label: 'f(x)', tooltip: 'Funções, cálculo e mais',
      rows: [
        [t('\\sin(#0)', { label: 'sen' }), t('\\cos(#0)', { label: 'cos' }), t('\\tan(#0)', { label: 'tg' }), t('\\ln(#0)', { label: 'ln' }), t('\\log_{#?}(#0)', { label: 'log' }), t('e^{#?}'), t('\\left|#0\\right|'), '[backspace]'],
        [txt('∫', '\\int #0\\,dx'), txt('∫ₐᵇ', '\\int_{#?}^{#?} #0\\,dx'), txt('d/dx', '\\frac{d}{dx}\\left(#0\\right)'), txt('lim', '\\lim_{x\\to #?} #0'), t('\\infty'), t('\\sqrt[#?]{#0}'), t('\\le'), t('\\ge')],
        ['x', 'y', 'z', 't', 'a', 'b', t('^{\\circ}', { label: '°' }), t('\\ne')],
        [txt('mmc', '\\operatorname{mmc}\\left(#0;#?\\right)'), txt('mdc', '\\operatorname{mdc}\\left(#0;#?\\right)'), txt('primos', '\\operatorname{fatorar}\\left(#0\\right)'), txt('sistema', '\\begin{cases}#0\\\\#?\\end{cases}'), ';', '(', '[left]', '[right]'],
      ],
    },
    'alphabetic',
  ];
}

// ---------- estado ----------
let aba = 'teclado';
let ultimo = null; // último resultado mostrado
let fotoB64 = null, fotoMime = 'image/jpeg', fotoRot = 0, fotoOriginal = null;
const caneta = new Caneta($('papel'));
caneta.onMudou = () => {};

// ---------- utilidades de tela ----------
function mat(el, latex, display = true) {
  if (!latex) { el.innerHTML = ''; return; }
  try { el.innerHTML = convertLatexToMarkup((display ? '\\displaystyle ' : '') + latex); }
  catch { el.textContent = latex; }
}
let toastT;
function toast(msg, erro = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (erro ? ' erro' : '');
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.hidden = true), erro ? 5200 : 3000);
}
function carregando(txt) {
  $('carregando').hidden = !txt;
  if (txt) { $('carregandoTxt').textContent = txt; $('carregando').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  $('btnResolver').disabled = !!txt;
}
function opts() { return { cas, graus: IA.config().angulo === 'graus' }; }

function atualizarStatus() {
  const s = $('status');
  const on = IA.online();
  if (!on) { s.textContent = 'offline'; s.className = 'chip'; s.title = 'Sem internet: o teclado e a voz funcionam; foto e caneta precisam da IA.'; }
  else if (!IA.iaConfigurada()) { s.textContent = 'IA não configurada'; s.className = 'chip ia-off'; s.title = 'Configure o servidor da IA em Configurações.'; }
  else { s.textContent = 'online · IA'; s.className = 'chip on'; s.title = 'Conectado: IA disponível.'; }
}
window.addEventListener('online', atualizarStatus);
window.addEventListener('offline', atualizarStatus);

// ---------- abas ----------
document.querySelectorAll('.abas button').forEach((b) => b.addEventListener('click', () => trocarAba(b.dataset.aba)));
function trocarAba(nova) {
  aba = nova;
  document.querySelectorAll('.abas button').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === nova));
  document.querySelectorAll('.painel').forEach((p) => (p.hidden = p.dataset.painel !== nova));
  if (nova !== 'teclado') window.mathVirtualKeyboard?.hide?.();
  if (nova === 'caneta') caneta.ajustar();
  $('btnResolver').textContent = nova === 'caneta' ? 'Ler e resolver' : nova === 'foto' ? 'Ler foto e resolver' : 'Resolver';
}

// atalhos acima do teclado
document.querySelectorAll('#atalhos button').forEach((b) => b.addEventListener('click', () => {
  mf.focus();
  mf.executeCommand(['insert', b.dataset.ins, { insertionMode: 'replaceSelection', selectionMode: 'placeholder', focus: true }]);
}));

mf.addEventListener('beforeinput', (ev) => { if (ev.inputType === 'insertLineBreak') { ev.preventDefault(); resolverAtual(); } });
mf.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); resolverAtual(); } });

$('btnResolver').addEventListener('click', resolverAtual);
$('btnLimparTudo').addEventListener('click', () => {
  if (aba === 'caneta') caneta.limpar();
  else if (aba === 'foto') limparFoto();
  else { mf.value = ''; mf.focus(); }
  $('resultado').hidden = true;
});
$('canDesfazer').addEventListener('click', () => caneta.desfazer());
$('canLimpar').addEventListener('click', () => caneta.limpar());
$('canEsp').addEventListener('input', (e) => (caneta.esp = Number(e.target.value)));

async function resolverAtual() {
  if (aba === 'caneta') return lerCaneta();
  if (aba === 'foto') return lerFoto();
  return resolverLatex(mf.value);
}

// ---------- motor offline ----------
function resolverLatex(latex, origem = 'aparelho') {
  latex = (latex || '').trim();
  if (!latex) { toast('Digite (ou fale) uma conta primeiro.'); return; }
  let r;
  try {
    r = resolver(latex, opts());
  } catch (e) {
    const amigavel = e instanceof ErroMat || e?.name === 'ErroMat';
    if (!amigavel) console.error(e);
    mostrarFalha(latex, amigavel ? e.message : 'Não consegui resolver essa no aparelho.');
    return;
  }
  mostrarResultado(r, origem);
}

function mostrarFalha(latex, msg) {
  ultimo = { latex, resposta: '', passos: [], local: null };
  $('resultado').hidden = false;
  $('resTipo').textContent = 'Não resolvido offline';
  $('resOrigem').textContent = '';
  $('resOrigem').className = 'origem';
  mat($('resQuestao'), latex);
  $('resResposta').innerHTML = '';
  $('resDecimal').textContent = '';
  $('resConjunto').innerHTML = '';
  const av = $('resAviso');
  av.hidden = false;
  av.className = 'aviso erro';
  av.textContent = msg + (IA.iaConfigurada() ? ' Toque em “Explicar com IA” para a IA resolver.' : '');
  $('btnPassos').hidden = true;
  $('passos').hidden = true;
  $('iaBloco').hidden = true;
  $('btnIA').hidden = false;
  $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function mostrarResultado(r, origem) {
  ultimo = { latex: r.entrada, resposta: r.resposta, passos: r.passos, local: r };
  $('resultado').hidden = false;
  $('resTipo').textContent = r.titulo || 'Resultado';
  $('resOrigem').textContent = origem === 'aparelho' ? '✓ calculado no aparelho' : origem;
  $('resOrigem').className = 'origem ok';
  mat($('resQuestao'), r.entrada);
  mat($('resResposta'), r.resposta);
  $('resDecimal').textContent = r.decimal ? r.decimal : '';
  mat($('resConjunto'), r.conjunto || '', false);
  const av = $('resAviso');
  const avisos = [];
  if (r.aproximado) avisos.push('Resultado aproximado (cálculo numérico).');
  if (r.extra) avisos.push(r.extra);
  if (r.dica) avisos.push(r.dica);
  av.hidden = !avisos.length;
  av.className = 'aviso';
  av.textContent = avisos.join(' ');
  $('btnPassos').hidden = false;
  $('btnPassos').textContent = 'Ver passo a passo';
  $('btnIA').hidden = false;
  desenharPassos($('passos'), r.passos.map((p) => ({ titulo: p.titulo, texto: p.texto, latex: p.latex, detalhes: p.detalhes })));
  $('passos').hidden = true;
  $('iaBloco').hidden = true;
  salvarHistorico(r.entrada, r.resposta, r.titulo);
  $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function desenharPassos(ol, passos) {
  ol.innerHTML = '';
  for (const p of passos) {
    const li = document.createElement('li');
    const h = document.createElement('h4'); h.textContent = p.titulo || ''; li.append(h);
    if (p.texto) { const t = document.createElement('p'); t.textContent = p.texto; li.append(t); }
    if (p.latex) { const m = document.createElement('div'); m.className = 'mat'; mat(m, p.latex); li.append(m); }
    const det = (p.detalhes || []).filter((d) => d.texto || d.latex);
    if (det.length) {
      const d = document.createElement('details');
      const s = document.createElement('summary'); s.textContent = 'Como fez essa conta?'; d.append(s);
      for (const x of det) {
        const box = document.createElement('div'); box.className = 'det';
        if (x.texto) { const t = document.createElement('p'); t.textContent = x.texto; box.append(t); }
        if (x.latex) { const m = document.createElement('div'); m.className = 'mat'; mat(m, x.latex); box.append(m); }
        d.append(box);
      }
      li.append(d);
    }
    ol.append(li);
  }
}

$('btnPassos').addEventListener('click', () => {
  const ol = $('passos');
  ol.hidden = !ol.hidden;
  $('btnPassos').textContent = ol.hidden ? 'Ver passo a passo' : 'Esconder passo a passo';
  if (!ol.hidden) ol.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---------- IA ----------
$('btnIA').addEventListener('click', async () => {
  if (!ultimo) return;
  if (!IA.iaConfigurada()) { toast('A IA ainda não foi configurada. Veja Configurações.', true); return; }
  if (!IA.online()) { toast('Sem internet: a explicação com IA precisa de conexão.', true); return; }
  carregando('A IA está preparando a explicação…');
  try {
    const d = await IA.explicar(ultimo.latex, ultimo.resposta);
    mostrarIA(d, !ultimo.local);
  } catch (e) { toast(e.message, true); }
  finally { carregando(null); }
});

function mostrarIA(d, substituirResposta) {
  if (substituirResposta) {
    $('resTipo').textContent = d.tipo || 'Resultado';
    mat($('resResposta'), d.resposta_latex);
    $('resDecimal').textContent = d.resposta_texto || '';
    $('resOrigem').textContent = 'resolvido pela IA';
    $('resOrigem').className = 'origem';
    $('resAviso').hidden = true;
  }
  const box = $('iaConteudo');
  box.innerHTML = '';
  if (d.observacao) { const a = document.createElement('div'); a.className = 'aviso'; a.textContent = d.observacao; box.append(a); }
  const ol = document.createElement('ol'); ol.className = 'passos';
  desenharPassos(ol, (d.passos || []).map((p) => ({ titulo: p.titulo, texto: p.explicacao, latex: p.latex })));
  box.append(ol);
  if (d.resposta_texto) { const p = document.createElement('p'); p.className = 'decimal'; p.textContent = 'Resposta: ' + d.resposta_texto; box.append(p); }
  $('iaBloco').hidden = false;
  $('iaBloco').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// resultado que veio da IA (foto/caneta/texto): confere com o motor do aparelho
function mostrarResultadoIA(d, como) {
  if (d.latex) mf.value = d.latex;
  let local = null;
  if (d.latex) { try { local = resolver(d.latex, opts()); } catch { local = null; } }
  ultimo = { latex: d.latex || d.lido, resposta: d.resposta_latex, passos: [], local };
  $('resultado').hidden = false;
  $('resTipo').textContent = d.tipo || 'Resultado';
  if (d.latex) mat($('resQuestao'), d.latex); else $('resQuestao').textContent = d.lido || '';
  mat($('resResposta'), d.resposta_latex);
  $('resDecimal').textContent = d.resposta_texto || '';
  $('resConjunto').innerHTML = '';
  const conf = conferir(d, local);
  $('resOrigem').textContent = `${como} · ${conf.rotulo}`;
  $('resOrigem').className = 'origem' + (conf.ok ? ' ok' : '');
  const av = $('resAviso');
  const avisos = [];
  if (d.observacao) avisos.push(d.observacao);
  if (conf.aviso) avisos.push(conf.aviso);
  av.hidden = !avisos.length;
  av.className = 'aviso' + (conf.ok === false ? ' erro' : '');
  av.textContent = avisos.join(' ');
  // passo a passo: o da IA (mais completo para foto/caneta)
  desenharPassos($('passos'), (d.passos || []).map((p) => ({ titulo: p.titulo, texto: p.explicacao, latex: p.latex })));
  $('passos').hidden = true;
  $('btnPassos').hidden = false;
  $('btnPassos').textContent = 'Ver passo a passo';
  $('btnIA').hidden = true;
  $('iaBloco').hidden = true;
  salvarHistorico(d.latex || d.lido, d.resposta_latex, d.tipo);
  $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function numerosDe(latex) {
  if (!latex) return [];
  const partes = latex.split(/\\quad|\\qquad|\\text\{[^}]*\}|;|\\\\|,(?![^{]*\})/);
  const out = [];
  for (let p of partes) {
    p = p.replace(/\\left|\\right/g, '').trim();
    const k = Math.max(p.lastIndexOf('='), p.lastIndexOf('\\approx'));
    if (k >= 0) p = p.slice(p.lastIndexOf('=') >= p.lastIndexOf('\\approx') ? k + 1 : k + 7);
    p = p.replace(/\+C\s*$/, '').replace(/^[{(\s]+|[})\s.]+$/g, '').trim();
    if (!p) continue;
    try {
      const a = analisar(p);
      if (variaveis(a).size) continue;
      const v = avaliar(a, {}, { graus: false });
      if (isFinite(v)) out.push(v);
    } catch { /* ignora */ }
  }
  return out;
}

function conferir(d, local) {
  if (!d.latex) return { rotulo: 'lido pela IA', ok: null };
  if (!local) return { rotulo: 'resolvido pela IA', ok: null, aviso: '' };
  const norm = (s) => (s || '').replace(/\\left|\\right|\\,|\\;|\\!|\s|\\quad|\\qquad|\\text\{[^}]*\}|\{,\}/g, '').replace(/\\dfrac/g, '\\frac');
  if (norm(d.resposta_latex) === norm(local.resposta)) return { rotulo: '✓ conferido no aparelho', ok: true };
  const a = numerosDe(d.resposta_latex).sort((x, y) => x - y), b = numerosDe(local.resposta).sort((x, y) => x - y);
  if (a.length && b.length) {
    const iguais = a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= 1e-6 * (1 + Math.abs(x)));
    if (iguais) return { rotulo: '✓ conferido no aparelho', ok: true };
    return { rotulo: '⚠ confira', ok: false, aviso: 'Atenção: a IA e o motor do aparelho chegaram em respostas diferentes. O aparelho calculou: ' + local.resposta.replace(/\\[a-z]+|[{}]/g, ' ').replace(/\s+/g, ' ').trim() + '. Confira a leitura da questão.' };
  }
  return { rotulo: 'resolvido pela IA', ok: null };
}

// ---------- caneta ----------
async function lerCaneta() {
  if (caneta.vazio) { toast('Escreva a conta no papel primeiro.'); return; }
  if (!IA.online()) { toast('Sem internet: para ler a letra, a caneta precisa da IA. Use o teclado ou a voz.', true); return; }
  if (!IA.iaConfigurada()) { toast('A IA ainda não foi configurada. Veja Configurações.', true); return; }
  carregando('Lendo sua letra e resolvendo…');
  try {
    const d = await IA.resolverImagem(caneta.imagem(), 'image/png', 'tinta');
    mostrarResultadoIA(d, 'lido da caneta');
  } catch (e) { toast(e.message, true); }
  finally { carregando(null); }
}

// ---------- foto ----------
$('fotoCamera').addEventListener('click', () => pegarFoto('CAMERA'));
$('fotoGaleria').addEventListener('click', () => pegarFoto('PHOTOS'));
$('fotoArquivo').addEventListener('change', (e) => arquivoFoto(e.target.files[0]));
$('fotoArquivoCam').addEventListener('change', (e) => arquivoFoto(e.target.files[0]));
$('fotoGirar').addEventListener('click', () => { fotoRot = (fotoRot + 90) % 360; prepararFoto(); });

async function pegarFoto(fonte) {
  const cam = plugin('Camera');
  if (cam) {
    try {
      const f = await cam.getPhoto({ quality: 85, resultType: 'base64', source: fonte, correctOrientation: true, width: 2000, allowEditing: false, saveToGallery: false });
      fotoOriginal = `data:image/${f.format || 'jpeg'};base64,${f.base64String}`;
      fotoRot = 0;
      prepararFoto();
    } catch (e) {
      if (!/cancel/i.test(String(e && e.message))) toast('Não consegui abrir a câmera: ' + (e.message || e), true);
    }
    return;
  }
  (fonte === 'CAMERA' ? $('fotoArquivoCam') : $('fotoArquivo')).click();
}
function arquivoFoto(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => { fotoOriginal = r.result; fotoRot = 0; prepararFoto(); };
  r.readAsDataURL(file);
}
function prepararFoto() {
  const img = new Image();
  img.onload = () => {
    const max = 1600;
    const esc = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * esc), h = Math.round(img.height * esc);
    const c = document.createElement('canvas');
    const vira = fotoRot % 180 !== 0;
    c.width = vira ? h : w; c.height = vira ? w : h;
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((fotoRot * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    const url = c.toDataURL('image/jpeg', 0.85);
    fotoB64 = url.split(',')[1];
    fotoMime = 'image/jpeg';
    $('fotoImg').src = url;
    $('fotoPrevia').hidden = false;
  };
  img.onerror = () => toast('Não consegui abrir essa imagem.', true);
  img.src = fotoOriginal;
}
function limparFoto() { fotoB64 = null; fotoOriginal = null; $('fotoPrevia').hidden = true; $('fotoArquivo').value = ''; $('fotoArquivoCam').value = ''; }

async function lerFoto() {
  if (!fotoB64) { toast('Tire uma foto ou escolha uma imagem primeiro.'); return; }
  if (!IA.online()) { toast('Sem internet: a leitura de foto precisa da IA.', true); return; }
  if (!IA.iaConfigurada()) { toast('A IA ainda não foi configurada. Veja Configurações.', true); return; }
  carregando('Lendo a foto e resolvendo…');
  try {
    const d = await IA.resolverImagem(fotoB64, fotoMime, 'imagem');
    mostrarResultadoIA(d, 'lido da foto');
  } catch (e) { toast(e.message, true); }
  finally { carregando(null); }
}

// ---------- voz ----------
$('btnMic').addEventListener('click', ouvir);
async function ouvir() {
  const sr = plugin('SpeechRecognition');
  const btn = $('btnMic');
  const txt = $('vozTexto');
  try {
    let frases = [];
    if (sr) {
      const disp = await sr.available().catch(() => ({ available: false }));
      if (!disp.available) { toast('O reconhecimento de voz não está disponível neste celular (instale/ative o app Google).', true); return; }
      let perm = await sr.checkPermissions().catch(() => ({}));
      if (perm.speechRecognition !== 'granted') perm = await sr.requestPermissions();
      if (perm.speechRecognition !== 'granted') { toast('Permita o uso do microfone para falar a conta.', true); return; }
      btn.classList.add('ouvindo'); txt.textContent = 'Ouvindo…';
      const r = await sr.start({ language: 'pt-BR', maxResults: 5, prompt: 'Fale a conta', partialResults: false, popup: true });
      frases = (r && r.matches) || [];
    } else {
      const W = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!W) { toast('Este navegador não tem reconhecimento de voz. No app Android funciona.', true); return; }
      frases = await new Promise((ok, falha) => {
        const rec = new W();
        rec.lang = 'pt-BR'; rec.maxAlternatives = 5; rec.interimResults = false;
        rec.onresult = (e) => ok([...e.results[0]].map((a) => a.transcript));
        rec.onerror = (e) => falha(new Error(e.error === 'not-allowed' ? 'Permita o microfone.' : e.error === 'network' ? 'Reconhecimento de voz precisa de internet neste navegador.' : 'Não entendi. Tente de novo.'));
        rec.onend = () => ok([]);
        btn.classList.add('ouvindo'); txt.textContent = 'Ouvindo…';
        rec.start();
      });
    }
    btn.classList.remove('ouvindo');
    if (!frases.length) { txt.innerHTML = 'Não ouvi nada. Toque e fale de novo.'; return; }
    // usa a primeira alternativa que vira uma conta válida
    for (const f of frases) {
      const exp = falaParaExpressao(f);
      try {
        const a = analisar(exp);
        void a;
        txt.innerHTML = `Ouvi: “${escapar(f)}”`;
        mf.value = exp.includes('\\') ? exp : paraLatex(exp);
        resolverLatex(mf.value);
        return;
      } catch { /* tenta a próxima */ }
    }
    txt.innerHTML = `Ouvi: “${escapar(frases[0])}”`;
    if (IA.online() && IA.iaConfigurada()) {
      carregando('Entendendo a pergunta com a IA…');
      try { mostrarResultadoIA(await IA.resolverTexto(frases[0]), 'entendido pela IA'); }
      catch (e) { toast(e.message, true); }
      finally { carregando(null); }
    } else toast('Não consegui transformar a fala em conta. Tente falar mais devagar ou use o teclado.', true);
  } catch (e) {
    btn.classList.remove('ouvindo');
    if (!/cancel/i.test(String(e && e.message))) toast(e.message || 'Erro no microfone.', true);
    txt.innerHTML = 'Toque no microfone e fale a conta.';
  }
}
function paraLatex(exp) {
  try {
    const a = analisar(exp);
    return latexDe(a);
  } catch { return exp; }
}
import { latex as latexDe } from './motor/ast.js';
function escapar(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------- histórico ----------
function lerHistorico() { try { return JSON.parse(localStorage.getItem('gaipo.historico') || '[]'); } catch { return []; } }
function salvarHistorico(latex, resposta, tipo) {
  if (!latex) return;
  try {
    const h = lerHistorico().filter((x) => x.latex !== latex);
    h.unshift({ latex, resposta, tipo, t: Date.now() });
    localStorage.setItem('gaipo.historico', JSON.stringify(h.slice(0, 40)));
  } catch { /* sem armazenamento */ }
}
$('btnHistorico').addEventListener('click', () => {
  const ul = $('listaHistorico');
  ul.innerHTML = '';
  const h = lerHistorico();
  if (!h.length) { const li = document.createElement('li'); li.className = 'vazio'; li.textContent = 'Nada por aqui ainda.'; ul.append(li); }
  for (const x of h) {
    const li = document.createElement('li');
    const m = document.createElement('div'); mat(m, x.latex, false); li.append(m);
    const s = document.createElement('small'); s.textContent = `${x.tipo || ''} · ${new Date(x.t).toLocaleString('pt-BR')}`; li.append(s);
    li.addEventListener('click', () => { $('dlgHistorico').close(); trocarAba('teclado'); mf.value = x.latex; resolverLatex(x.latex); });
    ul.append(li);
  }
  $('dlgHistorico').showModal();
});
$('histLimpar').addEventListener('click', () => { try { localStorage.removeItem('gaipo.historico'); } catch { } $('dlgHistorico').close(); toast('Histórico apagado.'); });

// ---------- configurações ----------
$('btnConfig').addEventListener('click', () => {
  const c = IA.config();
  $('cfgNivel').value = c.nivel;
  $('cfgAngulo').value = c.angulo;
  $('cfgServidor').value = c.servidor;
  $('cfgChave').value = c.chave;
  $('cfgTesteRes').textContent = '';
  $('dlgConfig').showModal();
});
$('dlgConfig').addEventListener('close', () => {
  if ($('dlgConfig').returnValue !== 'ok') return;
  IA.salvarConfig({ nivel: $('cfgNivel').value, angulo: $('cfgAngulo').value, servidor: $('cfgServidor').value.trim(), chave: $('cfgChave').value });
  atualizarStatus();
  toast('Configurações salvas.');
});
$('cfgTestar').addEventListener('click', async () => {
  IA.salvarConfig({ servidor: $('cfgServidor').value.trim(), chave: $('cfgChave').value });
  $('cfgTesteRes').textContent = 'Testando…';
  $('cfgTesteRes').textContent = await IA.testar();
  atualizarStatus();
});
$('versao').textContent = 'v' + VERSAO;

// ---------- início ----------
atualizarStatus();
setTimeout(() => $('abertura').classList.add('some'), 650);
setTimeout(() => $('abertura').remove(), 1300);
if (!nativo && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__gaipo = { resolverLatex, mf };
