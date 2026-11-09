// GAIPO CALC — interface
import { MathfieldElement, convertLatexToMarkup } from '../vendor/mathlive/mathlive.min.js';
import { resolver, ErroMat, analisar } from './motor/index.js';
import { criarCAS } from './motor/cas.js';
import { latex as latexDe } from './motor/ast.js';
import { falaParaExpressao } from './voz.js';
import { Caneta } from './caneta.js';
import { VERSAO } from './config.js';

// leitor de letra à mão: carregado só quando precisa (é pesado)
let leitorMod = null;
const leitor = () => (leitorMod ||= import('./leitor.js'));

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
let fotoCanvas = null, fotoRot = 0, fotoOriginal = null, fotoRecorte = null;
const caneta = new Caneta($('papel'), $('folha'));
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
function lerConfig() { try { return JSON.parse(localStorage.getItem('gaipo.config') || '{}'); } catch { return {}; } }
function salvarConfig(c) { try { localStorage.setItem('gaipo.config', JSON.stringify({ ...lerConfig(), ...c })); } catch { /* sem armazenamento */ } }
function opts() { return { cas, graus: (lerConfig().angulo || 'graus') === 'graus' }; }

// ---------- abas ----------
document.querySelectorAll('.abas button').forEach((b) => b.addEventListener('click', () => trocarAba(b.dataset.aba)));
function trocarAba(nova) {
  aba = nova;
  document.querySelectorAll('.abas button').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === nova));
  document.querySelectorAll('.painel').forEach((p) => (p.hidden = p.dataset.painel !== nova));
  if (nova !== 'teclado') window.mathVirtualKeyboard?.hide?.();
  if (nova === 'caneta') caneta.ajustar();
  if (nova === 'caneta' || nova === 'foto') leitor().then((m) => m.preparar()).catch(() => {});
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
  $('exemplos').hidden = false;
});
$('canDesfazer').addEventListener('click', () => caneta.desfazer());
$('canLimpar').addEventListener('click', () => caneta.limpar());
$('cheiaDesfazer').addEventListener('click', () => caneta.desfazer());
$('cheiaLimpar').addEventListener('click', () => caneta.limpar());
function telaCheia(sim) {
  $('canetaCaixa').classList.toggle('cheia', sim);
  document.body.style.overflow = sim ? 'hidden' : '';
  requestAnimationFrame(() => caneta.ajustar());
}
$('canCheia').addEventListener('click', () => telaCheia(true));
$('cheiaFechar').addEventListener('click', () => telaCheia(false));
$('cheiaLer').addEventListener('click', () => { telaCheia(false); lerCaneta(); });
window.addEventListener('popstate', () => telaCheia(false));
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
  $('exemplos').hidden = true;
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
  av.textContent = msg;
  $('btnPassos').hidden = true;
  $('btnCopiar').hidden = true;
  $('passos').hidden = true;
  $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function mostrarResultado(r, origem) {
  $('exemplos').hidden = true;
  ultimo = { latex: r.entrada, resposta: r.resposta, passos: r.passos, local: r };
  $('resultado').hidden = false;
  $('resTipo').textContent = r.titulo || 'Resultado';
  $('resOrigem').textContent = origem === 'aparelho' ? '✓ calculado no aparelho' : origem;
  $('resOrigem').className = 'origem ok';
  mat($('resQuestao'), r.entrada);
  mat($('resResposta'), r.resposta);
  $('resResposta').classList.toggle('multi', /^\\begin\{array\}/.test(r.resposta) || r.resposta.length > 70);
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
  $('btnCopiar').hidden = false;
  desenharPassos($('passos'), r.passos.map((p) => ({ titulo: p.titulo, texto: p.texto, latex: p.latex, detalhes: p.detalhes })));
  $('passos').hidden = true;
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

$('btnCopiar').addEventListener('click', async () => {
  if (!ultimo) return;
  const txt = ($('resResposta').innerText || '').replace(/\s+/g, ' ').trim();
  try { await navigator.clipboard.writeText(txt); toast('Resposta copiada.'); } catch { toast(txt); }
});

// mostra no teclado o que foi lido (para conferir) e resolve
function usarLeitura(latex, de) {
  if (!latex) { toast('Não consegui ler. Tente escrever maior e mais separado.', true); return; }
  mf.value = latex;
  trocarAba('teclado');
  toast(`Li da ${de}: confira no campo. Se algo estiver errado, corrija e toque em Resolver.`);
  resolverLatex(latex);
}

// ---------- caneta ----------
async function lerCaneta() {
  if (caneta.vazio) { toast('Escreva a conta no papel primeiro.'); return; }
  carregando('Lendo sua letra (no celular)…');
  try {
    const m = await leitor();
    usarLeitura(await m.lerTracos(caneta.ultimaConta()), 'caneta');
  } catch (e) { console.error(e); toast(e.message || 'Não consegui ler a escrita.', true); }
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
      const f = await cam.getPhoto({ quality: 90, resultType: 'base64', source: fonte, correctOrientation: true, width: 2000, allowEditing: false, saveToGallery: false });
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
    const max = 1800;
    const esc = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * esc), h = Math.round(img.height * esc);
    const c = document.createElement('canvas');
    const vira = fotoRot % 180 !== 0;
    c.width = vira ? h : w; c.height = vira ? w : h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((fotoRot * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    fotoCanvas = c;
    fotoRecorte = null;
    $('fotoSel').hidden = true;
    $('fotoImg').src = c.toDataURL('image/jpeg', 0.85);
    $('fotoPrevia').hidden = false;
  };
  img.onerror = () => toast('Não consegui abrir essa imagem.', true);
  img.src = fotoOriginal;
}
function limparFoto() { fotoCanvas = null; fotoOriginal = null; fotoRecorte = null; $('fotoPrevia').hidden = true; $('fotoArquivo').value = ''; $('fotoArquivoCam').value = ''; }
$('fotoTudo').addEventListener('click', () => { fotoRecorte = null; $('fotoSel').hidden = true; toast('Vou usar a foto inteira.'); });

// arrastar para marcar só a conta
(() => {
  const area = document.querySelector('.foto-area'), sel = $('fotoSel');
  let ini = null;
  const pos = (e) => { const r = $('fotoImg').getBoundingClientRect(); return { x: Math.min(Math.max(e.clientX - r.left, 0), r.width), y: Math.min(Math.max(e.clientY - r.top, 0), r.height), r }; };
  area.addEventListener('pointerdown', (e) => { if (!fotoCanvas) return; e.preventDefault(); area.setPointerCapture(e.pointerId); ini = pos(e); });
  area.addEventListener('pointermove', (e) => {
    if (!ini) return;
    const p = pos(e);
    const x = Math.min(ini.x, p.x), y = Math.min(ini.y, p.y), w = Math.abs(p.x - ini.x), h = Math.abs(p.y - ini.y);
    Object.assign(sel.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    sel.hidden = false;
    const k = fotoCanvas.width / p.r.width;
    fotoRecorte = w > 12 && h > 12 ? { x: x * k, y: y * k, w: w * k, h: h * k } : null;
  });
  const fim = () => { ini = null; if (!fotoRecorte) sel.hidden = true; };
  area.addEventListener('pointerup', fim);
  area.addEventListener('pointercancel', fim);
})();

async function lerFoto() {
  if (!fotoCanvas) { toast('Tire uma foto ou escolha uma imagem primeiro.'); return; }
  let c = fotoCanvas;
  if (fotoRecorte) {
    const r = fotoRecorte;
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(r.w)); c.height = Math.max(1, Math.round(r.h));
    c.getContext('2d', { willReadFrequently: true }).drawImage(fotoCanvas, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  }
  carregando('Lendo a foto (no celular)…');
  try {
    const m = await leitor();
    usarLeitura(await m.lerImagem(c), 'foto');
  } catch (e) { console.error(e); toast(e.message || 'Não consegui ler a foto.', true); }
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
    toast('Não consegui transformar a fala em conta. Tente falar mais devagar ou use o teclado.', true);
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
  $('cfgAngulo').value = lerConfig().angulo || 'graus';
  $('dlgConfig').showModal();
});
$('dlgConfig').addEventListener('close', () => {
  if ($('dlgConfig').returnValue !== 'ok') return;
  salvarConfig({ angulo: $('cfgAngulo').value });
  toast('Configurações salvas.');
});
$('versao').textContent = 'v' + VERSAO;

// ---------- exemplos para experimentar ----------
const EXEMPLOS = [
  ['Equação do 2º grau', 'x^2-5x+6=0', 'c1'],
  ['Frações', '\\frac{1}{2}+\\frac{2}{3}', 'c3'],
  ['Derivada', '\\frac{d}{dx}\\left(x^2\\sin x\\right)', 'c2'],
  ['Integral', '\\int_{0}^{1}x^2\\,dx', 'c4'],
  ['Sistema', '\\begin{cases}x+y=5\\\\x-y=1\\end{cases}', 'c2'],
  ['Porcentagem', '20\\%\\cdot 150', 'c3'],
  ['Função de 2 variáveis', 'F\\left(x,y\\right)=\\frac{x^2}{1-x^2-y^2}', 'c1'],
  ['Limite', '\\lim_{x\\to0}\\frac{\\sin x}{x}', 'c4'],
];
for (const [rot, lt, cor] of EXEMPLOS) {
  const b = document.createElement('button');
  b.className = 'ex ' + cor;
  const s1 = document.createElement('small'); s1.textContent = rot; b.append(s1);
  const m = document.createElement('div'); m.className = 'mat'; mat(m, lt, false); b.append(m);
  b.addEventListener('click', () => { trocarAba('teclado'); mf.value = lt; resolverLatex(lt); });
  $('exGrade').append(b);
}

// ---------- início ----------
setTimeout(() => $('abertura').classList.add('some'), 650);
setTimeout(() => $('abertura').remove(), 1300);
if (!nativo && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__gaipo = { resolverLatex, mf };
window.__gaipoCaneta = caneta;
