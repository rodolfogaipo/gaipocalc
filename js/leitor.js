// Leitura de letra à mão 100% no aparelho (grátis, sem internet).
// Usa o modelo aberto CoMER via projeto ink-on (Apache-2.0) e ONNX Runtime Web.
import { ort, InferenceEngine, preprocessStrokes, isStrokeMeaningful, loadVocab } from '../vendor/tinta/tinta.js';

const BASE = new URL('../vendor/tinta/', import.meta.url).href;
ort.env.wasm.wasmPaths = { mjs: BASE + 'ort-wasm-simd-threaded.js', wasm: BASE + 'ort-wasm-simd-threaded.wasm' };
ort.env.wasm.numThreads = 1;

let motor = null, vocab = null, carregando = null;

export function preparar() {
  if (!carregando) {
    carregando = (async () => {
      vocab = await loadVocab(BASE + 'modelo/vocab.json');
      const m = new InferenceEngine({ encoderUrl: BASE + 'modelo/encoder_int8.onnx', decoderUrl: BASE + 'modelo/decoder_int8.onnx', beamWidth: 3, executionProvider: 'wasm' });
      await m.init();
      motor = m;
    })().catch((e) => { carregando = null; throw e; });
  }
  return carregando;
}

// LaTeX do modelo ("2 x + 3 = 7") → LaTeX limpo para o teclado
export function limpar(latex) {
  return String(latex || '')
    .replace(/\\(left|right)(?![a-zA-Z])\s*/g, '')
    .replace(/\s*([{}^_()=+\-])\s*/g, '$1')
    .replace(/\\times/g, '\\cdot ')
    .replace(/\\div/g, '\\div ')
    .replace(/\s+/g, ' ')
    .replace(/(\d) (\d)/g, '$1$2')
    // índice numérico depois de letra quase sempre é expoente escrito baixo: x_{2} → x^{2}
    .replace(/(?<!\\[a-zA-Z]*)([a-zA-Z)])_\{?(\d)\}?/g, '$1^{$2}')
    .trim();
}

export async function lerTracos(tracos, valida) {
  return (await lerTracosMelhor(tracos, valida)).melhor.latex;
}

// escolhe a leitura mais provável entre as direções testadas
// valida(latex) → 0 (não é conta), 1 (conta válida) ou 1.5 (conta que o motor resolve)
export async function lerTracosMelhor(tracos, valida = () => 1) {
  const { cands, nGrupos, barra } = await lerTracosEmTodasDirecoes(tracos);
  const lidos = [];
  const ler = async (c) => {
    motor.__confianca = undefined;
    const r = await motor.recognize(preprocessStrokes(c.s), vocab, 'auto');
    const latex = limpar(r.latex);
    let p = (motor.__confianca ?? -5);
    if (!latex) p -= 10; else p += valida(latex);
    if (nGrupos >= 2) p -= 0.25 * Math.abs(simbolos(latex) - nGrupos);
    if (c.nome === 'normal') p += 0.15;
    if (!barra && /\\frac/.test(latex)) p -= 0.6; // não desenhou traço de fração
    lidos.push({ nome: c.nome, latex, pontos: p });
  };
  for (const c of cands.filter((c) => !c.depois)) await ler(c);
  // as versões giradas só se nenhuma leitura fez sentido
  if (Math.max(...lidos.map((l) => l.pontos)) < 1.35) for (const c of cands.filter((c) => c.depois)) await ler(c);
  const ord = lidos.sort((a, b) => b.pontos - a.pontos);
  return { melhor: ord[0], todas: ord };
}

// ---------- escrita em qualquer direção ----------
function caixa(strokes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const p of s.points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
const mover = (s, dx, dy) => ({ ...s, points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) });
function girar(strokes, sentido) {
  // sentido 1: 90° horário; -1: anti-horário
  return strokes.map((s) => ({ ...s, points: s.points.map((p) => (sentido > 0 ? { x: -p.y, y: p.x } : { x: p.y, y: -p.x })) }));
}
// separa a escrita em "linhas" de cima para baixo (símbolos empilhados)
export function gruposVerticais(strokes) {
  const itens = strokes.map((s) => ({ s, b: caixa([s]) })).sort((a, b) => a.b.y0 - b.b.y0);
  let grupos = [];
  for (const it of itens) {
    const g = grupos.find((g) => it.b.y0 <= g.y1 && it.b.y1 >= g.y0);
    if (g) { g.itens.push(it); g.y0 = Math.min(g.y0, it.b.y0); g.y1 = Math.max(g.y1, it.b.y1); }
    else grupos.push({ itens: [it], y0: it.b.y0, y1: it.b.y1 });
  }
  // junta grupos que se encostam (ex.: os dois traços do "=")
  grupos.sort((a, b) => a.y0 - b.y0);
  const alturas = grupos.map((g) => g.y1 - g.y0).sort((a, b) => a - b);
  const med = Math.max(12, alturas[Math.floor(alturas.length / 2)] || 12);
  const out = [];
  for (const g of grupos) {
    const u = out[out.length - 1];
    const fino = (h) => h < med * 0.35;
    if (u && g.y0 - u.y1 < med * 0.45 && (fino(g.y1 - g.y0) || fino(u.y1 - u.y0))) { u.itens.push(...g.itens); u.y1 = Math.max(u.y1, g.y1); }
    else out.push({ ...g, itens: [...g.itens] });
  }
  return out.map((g) => g.itens.map((i) => i.s));
}
// coloca os grupos empilhados lado a lado, numa linha só
function emLinha(grupos) {
  const caixas = grupos.map(caixa);
  const altura = Math.max(...caixas.map((c) => c.h), 10);
  let cursor = 0;
  const out = [];
  grupos.forEach((g, i) => {
    const c = caixas[i];
    const dx = cursor - c.x0, dy = altura / 2 - (c.y0 + c.h / 2);
    for (const s of g) out.push(mover(s, dx, dy));
    cursor += c.w + altura * 0.35;
  });
  return out;
}
// tem um traço de fração? (traço horizontal bem mais largo que todos os outros)
function temBarraDeFracao(strokes) {
  const cx = strokes.map((s) => caixa([s]));
  return cx.some((c, i) => {
    if (c.h > c.w * 0.25 || c.w < 20) return false;
    const outros = cx.filter((_, j) => j !== i).map((o) => o.w);
    return outros.length > 0 && c.w > Math.max(...outros) * 1.25;
  });
}
const simbolos = (l) => l.replace(/\\(left|right)/g, '').replace(/\\[a-zA-Z]+/g, '#').replace(/[{}\s^_]/g, '').length;

export async function lerTracosEmTodasDirecoes(tracos) {
  const strokes = tracos.map((t) => ({ points: t.pts.map((p) => ({ x: p.x, y: p.y })), lineWidth: Math.max(3, t.esp * 0.8) }));
  if (!isStrokeMeaningful(strokes)) throw new Error('Escreva a conta um pouco maior.');
  await preparar();
  const b = caixa(strokes);
  const cands = [{ nome: 'normal', s: strokes }];
  let nGrupos = 0, barra = true;
  if (b.h > b.w * 1.15) {
    // escrita "em pé": pode ser em coluna (um símbolo embaixo do outro) ou de lado
    const g = gruposVerticais(strokes);
    nGrupos = g.length;
    barra = temBarraDeFracao(strokes);
    if (g.length >= 2) cands.push({ nome: 'coluna', s: emLinha(g) });
    cands.push({ nome: 'girada-direita', s: girar(strokes, -1), depois: true }, { nome: 'girada-esquerda', s: girar(strokes, 1), depois: true });
  }
  return { cands, nGrupos, barra };
}

// ---------- foto ----------
const MODEL_H = 256, TARGET_H = 128, MAX_W = 1024, MIN_W = 128, PAD = 16;

// 1) reduz a foto  2) compensa sombra/iluminação  3) separa a tinta  4) acha a conta
// 5) afina os traços e redesenha com grossura uniforme (igual à caneta do app)
export function prepararFoto(src, maxLado = 1000) {
  const esc0 = Math.min(1, maxLado / Math.max(src.width, src.height));
  const W = Math.max(1, Math.round(src.width * esc0)), H = Math.max(1, Math.round(src.height * esc0));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(src, 0, 0, W, H);
  const px = cx.getImageData(0, 0, W, H).data;
  const N = W * H;
  const L0 = new Float32Array(N);
  for (let i = 0; i < N; i++) L0[i] = px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114;
  const L = L0;
  // fundo local: máximo aproximado (média dos pontos claros) numa janela grande
  const r = Math.max(10, Math.round(Math.min(W, H) / 22));
  const fundo = mediaJanela(L, W, H, r);
  const fundo2 = mediaJanela(fundo, W, H, Math.round(r / 2));
  // tinta = bem mais escura que o fundo ao redor, num lugar claro (papel)
  const tinta = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const f = Math.max(fundo2[i], 1);
    tinta[i] = L[i] < f * 0.8 && f > 60 && f - L[i] > 14 ? 1 : 0;
  }
  // linhas do caderno: azul-claro (mais claras que a caneta) ...
  for (let i = 0; i < N; i++) {
    if (!tinta[i]) continue;
    const rr = px[i * 4], gg = px[i * 4 + 1], bb = px[i * 4 + 2];
    if (bb - rr > 25 && L[i] > 135 && L[i] > fundo2[i] * 0.62) tinta[i] = 0;
  }
  // ... e corridas horizontais longas (atravessam a folha), menos onde um traço cruza
  const corrida = Math.max(40, W * 0.18);
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!tinta[y * W + x]) { x++; continue; }
      let fim = x, falha = 0;
      while (fim + 1 < W && (tinta[y * W + fim + 1] || (falha < 3 && ++falha))) { if (tinta[y * W + fim + 1]) falha = 0; fim++; }
      if (fim - x + 1 >= corrida) {
        for (let k = x; k <= fim; k++) {
          const cima = y > 2 && tinta[(y - 3) * W + k], baixo = y < H - 3 && tinta[(y + 3) * W + k];
          if (!(cima && baixo)) tinta[y * W + k] = 0;
        }
      }
      x = fim + 1;
    }
  }
  // componentes: descarta borda da foto, manchas grandes/cheias e pontinhos
  const comps = componentes(tinta, W, H);
  const alturas = comps.filter((c) => c.n >= 12).map((c) => c.y1 - c.y0 + 1).sort((a, b) => a - b);
  const hMed = Math.max(6, alturas[Math.floor(alturas.length / 2)] || 6);
  const bons = comps.filter((c) => {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    if (c.n < Math.max(8, hMed * 0.6)) return false;
    const naBorda = c.x0 <= 1 || c.y0 <= 1 || c.x1 >= W - 2 || c.y1 >= H - 2;
    if (naBorda && (h > hMed * 2 || w > hMed * 4 || c.n / (w * h) > 0.4)) return false; // borda do papel, dedo, fundo
    if (h > H * 0.45 || (w > W * 0.7 && h > hMed * 1.5)) return false; // grande demais
    const cheio = c.n / (w * h);
    if (cheio > 0.55 && w * h > hMed * hMed * 2) return false; // mancha cheia (sombra, dedo)
    const grossura = c.n / Math.max(w, h);
    if (grossura > hMed * 0.6) return false;
    return true;
  });
  if (!bons.length) throw new Error('Não encontrei escrita na foto. Tente com mais luz e chegue mais perto da conta.');
  // junta componentes próximos e fica com o maior grupo (a conta)
  const gap = hMed * 1.6;
  const grupos = [];
  for (const c of bons.sort((a, b) => a.x0 - b.x0)) {
    let g = grupos.find((g) => c.x0 <= g.x1 + gap && c.x1 >= g.x0 - gap && c.y0 <= g.y1 + gap && c.y1 >= g.y0 - gap);
    if (!g) { g = { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, n: 0, cs: [] }; grupos.push(g); }
    g.cs.push(c); g.n += c.n; g.x0 = Math.min(g.x0, c.x0); g.y0 = Math.min(g.y0, c.y0); g.x1 = Math.max(g.x1, c.x1); g.y1 = Math.max(g.y1, c.y1);
  }
  // une grupos que se sobrepõem depois de crescer
  for (let mudou = true; mudou;) {
    mudou = false;
    for (let i = 0; i < grupos.length && !mudou; i++) for (let j = i + 1; j < grupos.length && !mudou; j++) {
      const a = grupos[i], b = grupos[j];
      if (b.x0 <= a.x1 + gap && b.x1 >= a.x0 - gap && b.y0 <= a.y1 + gap && b.y1 >= a.y0 - gap) {
        a.cs.push(...b.cs); a.n += b.n; a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0); a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1);
        grupos.splice(j, 1); mudou = true;
      }
    }
  }
  grupos.sort((a, b) => b.n - a.n);
  const g = grupos[0];
  // máscara só da conta
  const gw = g.x1 - g.x0 + 1, gh = g.y1 - g.y0 + 1;
  const m = new Uint8Array(gw * gh);
  const ids = new Set(g.cs.map((c) => c.id));
  for (const c of g.cs) for (const k of c.pix) { const x = k % W, y = (k - x) / W; m[(y - g.y0) * gw + (x - g.x0)] = 1; }
  void ids;
  const esq = afinar(m, gw, gh);
  return { esqueleto: esq, w: gw, h: gh, caixa: { x: g.x0 / esc0, y: g.y0 / esc0, w: gw / esc0, h: gh / esc0 } };
}

// tensor no formato do modelo (traços brancos uniformes em fundo preto)
export function imagemParaEntrada(src) {
  const { esqueleto, w, h } = prepararFoto(src);
  const raw = { w: w + PAD * 2, h: h + PAD * 2 };
  const esc = Math.min(TARGET_H / raw.h, MAX_W / raw.w);
  const dw = Math.max(1, Math.round(raw.w * esc)), dh = Math.max(1, Math.round(raw.h * esc));
  const canvasW = Math.min(MAX_W, Math.max(MIN_W, Math.ceil((dw + PAD) / 64) * 64));
  const alvo = document.createElement('canvas'); alvo.width = canvasW; alvo.height = MODEL_H;
  const ac = alvo.getContext('2d', { willReadFrequently: true });
  ac.fillStyle = '#000'; ac.fillRect(0, 0, canvasW, MODEL_H);
  ac.fillStyle = '#fff';
  const raio = 1.35; // como a caneta do app depois de reduzida
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (esqueleto[y * w + x]) {
    ac.beginPath(); ac.arc((x + PAD) * esc, (y + PAD) * esc, raio, 0, 6.2832); ac.fill();
  }
  const pxs = ac.getImageData(0, 0, canvasW, MODEL_H).data;
  const tensor = new Float32Array(canvasW * MODEL_H);
  for (let i = 0; i < tensor.length; i++) tensor[i] = pxs[i * 4] / 255;
  const mask = new Uint8Array(MODEL_H * canvasW);
  for (let y = 0; y < MODEL_H; y++) for (let x = 0; x < canvasW; x++) mask[y * canvasW + x] = y < dh && x < dw ? 0 : 1;
  return { tensor, height: MODEL_H, width: canvasW, mask, maskHeight: MODEL_H, maskWidth: canvasW, _canvas: alvo };
}

function mediaJanela(A, W, H, r) {
  const S = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let lin = 0; for (let x = 0; x < W; x++) { lin += A[y * W + x]; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + lin; } }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
      out[y * W + x] = (S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

function componentes(m, W, H) {
  const lab = new Int32Array(W * H);
  const pilha = new Int32Array(W * H);
  const out = [];
  let id = 0;
  for (let i = 0; i < W * H; i++) {
    if (!m[i] || lab[i]) continue;
    id++;
    let topo = 0; pilha[topo++] = i; lab[i] = id;
    const pix = [];
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    while (topo) {
      const k = pilha[--topo]; pix.push(k);
      const x = k % W, y = (k - x) / W;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (m[j] && !lab[j]) { lab[j] = id; pilha[topo++] = j; }
      }
    }
    out.push({ id, n: pix.length, pix, x0, y0, x1, y1 });
  }
  return out;
}

// afinamento Zhang-Suen: deixa o traço com 1 pixel de largura
function afinar(img, W, H) {
  const m = new Uint8Array(img);
  const P = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : m[y * W + x]);
  let mudou = true, guarda = 0;
  const apagar = [];
  while (mudou && guarda++ < 60) {
    mudou = false;
    for (let passo = 0; passo < 2; passo++) {
      apagar.length = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!m[y * W + x]) continue;
        const p2 = P(x, y - 1), p3 = P(x + 1, y - 1), p4 = P(x + 1, y), p5 = P(x + 1, y + 1), p6 = P(x, y + 1), p7 = P(x - 1, y + 1), p8 = P(x - 1, y), p9 = P(x - 1, y - 1);
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
        if (A !== 1) continue;
        if (passo === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
        apagar.push(y * W + x);
      }
      for (const k of apagar) m[k] = 0;
      if (apagar.length) mudou = true;
    }
  }
  return m;
}

export async function lerImagem(canvas) {
  await preparar();
  const r = await motor.recognize(imagemParaEntrada(canvas), vocab, 'auto');
  return limpar(r.latex);
}
