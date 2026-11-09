// GAIPO CALC — interface
import { MathfieldElement, convertLatexToMarkup } from '../vendor/mathlive/mathlive.min.js';
import { resolver, ErroMat, analisar } from './motor/index.js';
import { criarCAS } from './motor/cas.js';
import { latex as latexDe, temVar } from './motor/ast.js';
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
const kb = window.mathVirtualKeyboard;

// ---------- MathLive ----------
MathfieldElement.decimalSeparator = ',';
MathfieldElement.soundsDirectory = null;
MathfieldElement.fractionNavigationOrder = 'numerator-denominator';
const mf = $('campo');
mf.placeholder = '0';
mf.smartFence = true;
mf.mathVirtualKeyboardPolicy = 'manual';
mf.menuItems = [];
configurarTeclado();

function configurarTeclado() {
  if (!kb) return;
  const t = (latex, extra) => ({ latex, ...extra });
  const txt = (label, insert, extra) => ({ label, insert, class: 'small', ...extra });
  const apagar = { label: '⌫', command: ['performWithFeedback', 'deleteBackward'], class: 'action', width: 1 };
  const esq = { label: '◂', command: ['performWithFeedback', 'moveToPreviousChar'], class: 'action', width: 1 };
  const dir = { label: '▸', command: ['performWithFeedback', 'moveToNextChar'], class: 'action', width: 1 };
  kb.layouts = [
    {
      label: '123', tooltip: 'Números', displayEditToolbar: false, id: 'gc-123',
      layers: [{ id: 'gc-camada-123', rows: [
        ['7', '8', '9', t('\\div'), '(', ')', 'x', apagar],
        ['4', '5', '6', t('\\times', { insert: '\\cdot ' }), t('\\frac{#@}{#?}'), t('#@^{2}'), t('#@^{#?}'), t('\\sqrt{#0}')],
        ['1', '2', '3', '-', '=', '<', '>', 'y'],
        ['0', t('{,}', { label: ',' }), t('\\pi'), '+', t('\\%'), '!', esq, dir],
      ] }],
    },
    {
      label: 'f(x)', tooltip: 'Funções e cálculo', displayEditToolbar: false, id: 'gc-fx',
      layers: [{ id: 'gc-camada-fx', rows: [
        [txt('sen', '\\sin\\left(#0\\right)'), txt('cos', '\\cos\\left(#0\\right)'), txt('tg', '\\tan\\left(#0\\right)'), txt('ln', '\\ln\\left(#0\\right)'), txt('log', '\\log_{#?}\\left(#0\\right)'), t('e^{#?}', { label: 'eˣ', class: 'small' }), txt('|x|', '\\left|#0\\right|'), apagar],
        [{ label: '∫', insert: '\\int #0\\,dx' }, txt('∫ₐᵇ', '\\int_{#?}^{#?} #0\\,dx'), txt('d/dx', '\\frac{d}{dx}\\left(#0\\right)'), txt('lim', '\\lim_{x\\to #?} #0'), t('\\infty'), txt('ⁿ√', '\\sqrt[#?]{#0}'), t('\\le'), t('\\ge')],
        ['x', 'y', 'z', 't', 'a', 'b', t('^{\\circ}', { label: '°' }), t('\\ne')],
        [txt('mmc', '\\operatorname{mmc}\\left(#0;#?\\right)'), txt('mdc', '\\operatorname{mdc}\\left(#0;#?\\right)'), txt('fat', '\\operatorname{fatorar}\\left(#0\\right)'), txt('{ }', '\\begin{cases}#0\\\\#?\\end{cases}'), ';', txt('f(x)', 'f\\left(x\\right)='), esq, dir],
      ] }],
    },
    'alphabetic',
  ];
  kb.container = $('doca');
  kb.addEventListener?.('geometrychange', ajustarDoca);
}
function ajustarDoca() {
  const h = kb?.boundingRect?.height;
  if (h && aba === 'teclado') $('doca').style.height = Math.round(h) + 'px';
}

// ---------- estado ----------
let aba = 'teclado';
let ultimo = null;
let fotoCanvas = null, fotoRot = 0, fotoOriginal = null, fotoRecorte = null;
const caneta = new Caneta($('papel'), $('folha'));

// ---------- utilidades ----------
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
  toastT = setTimeout(() => (t.hidden = true), erro ? 5000 : 3200);
}
function carregando(txt) {
  $('carregando').hidden = !txt;
  if (txt) $('carregandoTxt').textContent = txt;
}
function lerConfig() { try { return JSON.parse(localStorage.getItem('gaipo.config') || '{}'); } catch { return {}; } }
function salvarConfig(c) { try { localStorage.setItem('gaipo.config', JSON.stringify({ ...lerConfig(), ...c })); } catch { /* sem armazenamento */ } }
function opts() { return { cas, graus: (lerConfig().angulo || 'graus') === 'graus' }; }

// ---------- orientação da tela ----------
async function orientacao(modo) {
  const so = plugin('ScreenOrientation');
  try {
    if (so) { if (modo === 'livre') await so.unlock(); else await so.lock({ orientation: modo }); return; }
    if (modo === 'landscape') { await document.documentElement.requestFullscreen?.(); await screen.orientation?.lock?.('landscape'); }
    else { screen.orientation?.unlock?.(); if (document.fullscreenElement) await document.exitFullscreen(); }
  } catch { /* nem todo aparelho deixa travar */ }
}

// ---------- navegação ----------
document.querySelectorAll('.navbar button').forEach((b) => b.addEventListener('click', () => trocarAba(b.dataset.aba)));
function trocarAba(nova) {
  aba = nova;
  document.querySelectorAll('.navbar button').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === nova));
  document.querySelectorAll('.tela').forEach((p) => (p.hidden = p.dataset.tela !== nova));
  if (nova === 'teclado') mostrarTeclado(); else kb?.hide({ animate: false });
  if (nova === 'caneta') requestAnimationFrame(() => caneta.ajustar());
  if (nova === 'caneta' || nova === 'foto') leitor().then((m) => m.preparar()).catch(() => {});
}
function mostrarTeclado() {
  if (!kb) return;
  mf.focus({ preventScroll: true });
  kb.show({ animate: false });
  requestAnimationFrame(ajustarDoca);
  setTimeout(ajustarDoca, 120);
}

// ---------- calcular ----------
mf.addEventListener('beforeinput', (ev) => { if (ev.inputType === 'insertLineBreak') { ev.preventDefault(); resolverLatex(mf.value); } });
mf.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); resolverLatex(mf.value); } });
mf.addEventListener('focus', () => { if (aba === 'teclado') kb?.show({ animate: false }); });
let previaT;
mf.addEventListener('input', () => { clearTimeout(previaT); previaT = setTimeout(atualizarPrevia, 120); });
function atualizarPrevia() {
  const l = mf.value.trim();
  $('exemplos').hidden = !!l;
  const p = $('previa');
  if (!l) { p.innerHTML = ''; return; }
  try {
    const a = analisar(l);
    // prévia ao vivo só para contas com números (rápidas)
    if (['eq', 'sys', 'deriv', 'int', 'lim', 'call', 'func'].includes(a.t) || temVar(a)) { p.innerHTML = ''; return; }
    const r = resolver(a, opts());
    const txt = r.decimal && !/^≈/.test(r.decimal) && r.resposta.includes('frac') ? r.resposta : r.resposta;
    mat(p, '=' + txt + (r.decimal ? `\\;\\text{(${r.decimal.replace('≈ ', '≈')})}` : ''), false);
  } catch { p.innerHTML = ''; }
}
$('btnResolver').addEventListener('click', () => resolverLatex(mf.value));
$('btnLimpar').addEventListener('click', () => { mf.value = ''; atualizarPrevia(); mostrarTeclado(); });

function resolverLatex(latex, origem = '✓ calculado no aparelho') {
  latex = (latex || '').trim();
  if (!latex) { toast('Digite uma conta primeiro.'); return; }
  let r;
  try {
    r = resolver(latex, opts());
  } catch (e) {
    const amigavel = e instanceof ErroMat || e?.name === 'ErroMat';
    if (!amigavel) console.error(e);
    mostrarFalha(latex, amigavel ? e.message : 'Não consegui resolver essa no aparelho.');
    return;
  }
  mostrarSolucao(r, origem);
}

// ---------- tela da solução ----------
function abrirSolucao() {
  $('solucao').hidden = false;
  $('solucao').querySelector('.sol-corpo').scrollTop = 0;
  kb?.hide({ animate: false });
  if (!history.state?.sol) history.pushState({ sol: 1 }, '');
}
function fecharSolucao() {
  $('solucao').hidden = true;
  if (aba === 'teclado') mostrarTeclado();
}
$('solVoltar').addEventListener('click', () => (history.state?.sol ? history.back() : fecharSolucao()));
$('solEditar').addEventListener('click', () => { if (history.state?.sol) history.back(); else fecharSolucao(); trocarAba('teclado'); });
window.addEventListener('popstate', () => {
  if (!$('solucao').hidden) fecharSolucao();
  if ($('canetaCaixa').classList.contains('cheia')) telaCheia(false, true);
});

function mostrarFalha(latex, msg) {
  ultimo = { latex, resposta: '' };
  $('resTipo').textContent = 'Não consegui resolver';
  $('resOrigem').textContent = '';
  mat($('resQuestao'), latex);
  $('resResposta').innerHTML = '—';
  $('resDecimal').textContent = '';
  $('resConjunto').innerHTML = '';
  const av = $('resAviso');
  av.hidden = false; av.className = 'aviso erro'; av.textContent = msg;
  $('btnPassos').hidden = true;
  $('passos').hidden = true;
  abrirSolucao();
}

function mostrarSolucao(r, origem) {
  ultimo = { latex: r.entrada, resposta: r.resposta };
  $('resTipo').textContent = r.titulo || 'Resultado';
  $('resOrigem').textContent = origem;
  $('resOrigem').className = 'origem' + (origem.startsWith('✓') ? ' ok' : '');
  mat($('resQuestao'), r.entrada);
  mat($('resResposta'), r.resposta);
  $('resResposta').classList.toggle('multi', /^\\begin\{array\}/.test(r.resposta) || r.resposta.length > 70);
  $('resDecimal').textContent = r.decimal || '';
  mat($('resConjunto'), r.conjunto || '', false);
  const avisos = [];
  if (r.aproximado) avisos.push('Resultado aproximado (cálculo numérico).');
  if (r.extra) avisos.push(r.extra);
  const av = $('resAviso');
  av.hidden = !avisos.length; av.className = 'aviso'; av.textContent = avisos.join(' ');
  $('btnPassos').hidden = !r.passos.length;
  $('btnPassos').querySelector('span').textContent = 'Ver passo a passo';
  desenharPassos($('passos'), r.passos);
  $('passos').hidden = true;
  salvarHistorico(r.entrada, r.resposta, r.titulo);
  abrirSolucao();
}

function desenharPassos(ol, passos) {
  ol.innerHTML = '';
  for (const p of passos) {
    const li = document.createElement('li');
    const h = document.createElement('h4'); h.textContent = (p.titulo || '').trim(); li.append(h);
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
  $('btnPassos').querySelector('span').textContent = ol.hidden ? 'Ver passo a passo' : 'Esconder passo a passo';
  if (!ol.hidden) setTimeout(() => ol.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
});
$('btnCopiar').addEventListener('click', async () => {
  const txt = ($('resResposta').innerText || '').replace(/\s+/g, ' ').trim();
  try { await navigator.clipboard.writeText(txt); toast('Resposta copiada.'); } catch { toast(txt); }
});

// o que foi lido (caneta/foto/voz) vai para o visor; se der para resolver, abre a solução
function usarLeitura(latex, de) {
  if (!latex) { toast('Não consegui ler. Escreva maior e com os símbolos separados.', true); return; }
  let ok = true;
  try { analisar(latex); } catch { ok = false; }
  mf.value = latex;
  atualizarPrevia();
  if (!ok) {
    trocarAba('teclado');
    toast(`Não li direito a ${de}. Corrija no teclado e toque em Resolver.`, true);
    return;
  }
  resolverLatex(latex, `lido da ${de} — confira`);
}

// ---------- escrever ----------
$('canDesfazer').addEventListener('click', () => caneta.desfazer());
$('canLimpar').addEventListener('click', () => caneta.limpar());
$('canResolver').addEventListener('click', lerCaneta);
$('canCheia').addEventListener('click', () => telaCheia(!$('canetaCaixa').classList.contains('cheia')));
const ICO_CHEIA = '<path d="M8 3H3v5M21 8V3h-5M16 21h5v-5M3 16v5h5"/>';
const ICO_SAIR = '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>';
function telaCheia(sim, porVoltar = false) {
  $('canetaCaixa').classList.toggle('cheia', sim);
  $('icoCheia').innerHTML = sim ? ICO_SAIR : ICO_CHEIA;
  if (sim) { history.pushState({ cheia: 1 }, ''); orientacao('landscape'); }
  else { orientacao('portrait'); if (!porVoltar && history.state?.cheia) history.back(); }
  setTimeout(() => caneta.ajustar(), 350);
}
async function lerCaneta() {
  if (caneta.vazio) { toast('Escreva a conta na folha primeiro.'); return; }
  carregando('Lendo sua letra…');
  try {
    const m = await leitor();
    const latex = await m.lerTracos(caneta.ultimaConta());
    if ($('canetaCaixa').classList.contains('cheia')) telaCheia(false);
    usarLeitura(latex, 'caneta');
  } catch (e) { console.error(e); toast(e.message || 'Não consegui ler a escrita.', true); }
  finally { carregando(null); }
}

// ---------- foto ----------
$('fotoCamera').addEventListener('click', () => pegarFoto('CAMERA'));
$('fotoGaleria').addEventListener('click', () => pegarFoto('PHOTOS'));
$('fotoNova').addEventListener('click', () => limparFoto());
$('fotoArquivo').addEventListener('change', (e) => arquivoFoto(e.target.files[0]));
$('fotoArquivoCam').addEventListener('change', (e) => arquivoFoto(e.target.files[0]));
$('fotoGirar').addEventListener('click', () => { fotoRot = (fotoRot + 90) % 360; prepararFoto(); });
$('fotoTudo').addEventListener('click', () => { fotoRecorte = null; $('fotoSel').hidden = true; toast('Vou usar a foto inteira.'); });
$('fotoResolver').addEventListener('click', lerFoto);

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
    $('fotoVazia').hidden = true;
    $('fotoPrevia').hidden = false;
    toast('Arraste o dedo sobre a conta para marcar só ela.');
  };
  img.onerror = () => toast('Não consegui abrir essa imagem.', true);
  img.src = fotoOriginal;
}
function limparFoto() {
  fotoCanvas = null; fotoOriginal = null; fotoRecorte = null;
  $('fotoPrevia').hidden = true; $('fotoVazia').hidden = false;
  $('fotoArquivo').value = ''; $('fotoArquivoCam').value = '';
}
(() => {
  const area = document.querySelector('.foto-area'), sel = $('fotoSel');
  let ini = null;
  const pos = (e) => {
    const r = $('fotoImg').getBoundingClientRect(), a = area.getBoundingClientRect();
    return { x: Math.min(Math.max(e.clientX - r.left, 0), r.width), y: Math.min(Math.max(e.clientY - r.top, 0), r.height), r, ox: r.left - a.left, oy: r.top - a.top };
  };
  area.addEventListener('pointerdown', (e) => { if (!fotoCanvas) return; e.preventDefault(); area.setPointerCapture(e.pointerId); ini = pos(e); });
  area.addEventListener('pointermove', (e) => {
    if (!ini) return;
    const p = pos(e);
    const x = Math.min(ini.x, p.x), y = Math.min(ini.y, p.y), w = Math.abs(p.x - ini.x), h = Math.abs(p.y - ini.y);
    Object.assign(sel.style, { left: p.ox + x + 'px', top: p.oy + y + 'px', width: w + 'px', height: h + 'px' });
    sel.hidden = false;
    const k = fotoCanvas.width / p.r.width;
    fotoRecorte = w > 12 && h > 12 ? { x: x * k, y: y * k, w: w * k, h: h * k } : null;
  });
  const fim = () => { ini = null; if (!fotoRecorte) sel.hidden = true; };
  area.addEventListener('pointerup', fim);
  area.addEventListener('pointercancel', fim);
})();
async function lerFoto() {
  if (!fotoCanvas) { toast('Tire uma foto primeiro.'); return; }
  let c = fotoCanvas;
  if (fotoRecorte) {
    const r = fotoRecorte;
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(r.w)); c.height = Math.max(1, Math.round(r.h));
    c.getContext('2d', { willReadFrequently: true }).drawImage(fotoCanvas, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  }
  carregando('Lendo a foto…');
  try {
    const m = await leitor();
    usarLeitura(await m.lerImagem(c), 'foto');
  } catch (e) { console.error(e); toast(e.message || 'Não consegui ler a foto.', true); }
  finally { carregando(null); }
}

// ---------- falar ----------
$('btnMic').addEventListener('click', ouvir);
async function ouvir() {
  const sr = plugin('SpeechRecognition');
  const btn = $('btnMic');
  const txt = $('vozTexto');
  try {
    let frases = [];
    if (sr) {
      const disp = await sr.available().catch(() => ({ available: false }));
      if (!disp.available) { toast('O reconhecimento de voz não está disponível neste celular (ative o app Google).', true); return; }
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
        rec.onerror = (e) => falha(new Error(e.error === 'not-allowed' ? 'Permita o microfone.' : 'Não entendi. Tente de novo.'));
        rec.onend = () => ok([]);
        btn.classList.add('ouvindo'); txt.textContent = 'Ouvindo…';
        rec.start();
      });
    }
    btn.classList.remove('ouvindo');
    if (!frases.length) { txt.textContent = 'Não ouvi nada. Toque e fale de novo.'; return; }
    for (const f of frases) {
      const exp = falaParaExpressao(f);
      try {
        const a = analisar(exp);
        txt.textContent = `“${f}”`;
        const lt = exp.includes('\\') ? exp : latexDe(a);
        mf.value = lt;
        atualizarPrevia();
        resolverLatex(lt, 'entendido pela voz — confira');
        return;
      } catch { /* tenta a próxima */ }
    }
    txt.textContent = `“${frases[0]}”`;
    toast('Não consegui transformar a fala em conta. Fale mais devagar ou use o teclado.', true);
  } catch (e) {
    btn.classList.remove('ouvindo');
    if (!/cancel/i.test(String(e && e.message))) toast(e.message || 'Erro no microfone.', true);
    txt.textContent = 'Toque e fale a conta';
  }
}

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
  if (!h.length) { const li = document.createElement('li'); li.className = 'vazio'; li.textContent = 'Suas contas resolvidas aparecem aqui.'; ul.append(li); }
  for (const x of h) {
    const li = document.createElement('li');
    const m = document.createElement('div'); mat(m, x.latex, false); li.append(m);
    const s = document.createElement('small'); s.textContent = `${x.tipo || ''} · ${new Date(x.t).toLocaleString('pt-BR')}`; li.append(s);
    li.addEventListener('click', () => { $('dlgHistorico').close(); trocarAba('teclado'); mf.value = x.latex; atualizarPrevia(); resolverLatex(x.latex); });
    ul.append(li);
  }
  kb?.hide({ animate: false });
  $('dlgHistorico').showModal();
});
$('dlgHistorico').addEventListener('close', () => { if (aba === 'teclado' && $('solucao').hidden) mostrarTeclado(); });
$('histLimpar').addEventListener('click', () => { try { localStorage.removeItem('gaipo.historico'); } catch { } $('dlgHistorico').close(); toast('Histórico apagado.'); });

// ---------- configurações ----------
$('btnConfig').addEventListener('click', () => {
  $('cfgAngulo').value = lerConfig().angulo || 'graus';
  kb?.hide({ animate: false });
  $('dlgConfig').showModal();
});
$('dlgConfig').addEventListener('close', () => {
  if ($('dlgConfig').returnValue === 'ok') { salvarConfig({ angulo: $('cfgAngulo').value }); toast('Configurações salvas.'); }
  if (aba === 'teclado' && $('solucao').hidden) mostrarTeclado();
});
for (const d of [$('dlgConfig'), $('dlgHistorico')]) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
$('versao').textContent = 'v' + VERSAO;

// ---------- exemplos ----------
const EXEMPLOS = [
  ['2º grau', 'x^2-5x+6=0'],
  ['Frações', '\\frac{1}{2}+\\frac{2}{3}'],
  ['Derivada', '\\frac{d}{dx}\\left(x^2\\sin x\\right)'],
  ['Integral', '\\int_{0}^{1}x^2\\,dx'],
  ['Sistema', '\\begin{cases}x+y=5\\\\x-y=1\\end{cases}'],
  ['Porcentagem', '20\\%\\cdot 150'],
  ['Função', 'F\\left(x,y\\right)=\\frac{x^2}{1-x^2-y^2}'],
  ['Limite', '\\lim_{x\\to0}\\frac{\\sin x}{x}'],
];
for (const [rot, lt] of EXEMPLOS) {
  const b = document.createElement('button');
  b.className = 'ex';
  const s1 = document.createElement('small'); s1.textContent = rot; b.append(s1);
  const m = document.createElement('div'); m.className = 'mat'; mat(m, lt, false); b.append(m);
  b.addEventListener('click', () => { mf.value = lt; atualizarPrevia(); resolverLatex(lt); });
  $('exGrade').append(b);
}

// ---------- início ----------
orientacao('portrait');
trocarAba('teclado');
setTimeout(() => $('abertura').classList.add('some'), 650);
setTimeout(() => { $('abertura').remove(); if (aba === 'teclado') mostrarTeclado(); }, 1300);
if (!nativo && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__gaipo = { resolverLatex, mf };
window.__gaipoCaneta = caneta;
