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

// canvas (recorte da foto) → tensor no formato do modelo (tinta branca em fundo preto)
export function imagemParaEntrada(src) {
  const W = src.width, H = src.height;
  const g = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const cinza = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) cinza[i] = g[i * 4] * 0.299 + g[i * 4 + 1] * 0.587 + g[i * 4 + 2] * 0.114;
  // limiar adaptativo (média local por imagem integral)
  const S = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let lin = 0; for (let x = 0; x < W; x++) { lin += cinza[y * W + x]; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + lin; } }
  const r = Math.max(8, Math.round(Math.min(W, H) / 12));
  const tinta = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
      const soma = S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0];
      const media = soma / ((x1 - x0) * (y1 - y0));
      tinta[y * W + x] = cinza[y * W + x] < media - 18 && cinza[y * W + x] < 170 ? 1 : 0;
    }
  }
  // tira linhas do caderno (faixas horizontais longas e finas)
  for (let y = 0; y < H; y++) {
    let n = 0; for (let x = 0; x < W; x++) n += tinta[y * W + x];
    if (n > W * 0.55) {
      for (let x = 0; x < W; x++) {
        const cima = y > 2 ? tinta[(y - 3) * W + x] : 0, baixo = y < H - 3 ? tinta[(y + 3) * W + x] : 0;
        if (!cima && !baixo) tinta[y * W + x] = 0;
      }
    }
  }
  // tira manchinhas (componentes muito pequenos)
  removerPontos(tinta, W, H, Math.max(6, Math.round(W * H * 0.00004)));
  // recorta a área com tinta
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tinta[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error('Não encontrei escrita na foto. Tente com mais luz ou recorte só a conta.');
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const bruto = document.createElement('canvas');
  bruto.width = cw + PAD * 2; bruto.height = ch + PAD * 2;
  const bc = bruto.getContext('2d');
  const id = bc.createImageData(bruto.width, bruto.height);
  for (let i = 0; i < id.data.length; i += 4) { id.data[i + 3] = 255; }
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (tinta[(y + y0) * W + x + x0]) {
    const k = ((y + PAD) * bruto.width + x + PAD) * 4; id.data[k] = id.data[k + 1] = id.data[k + 2] = 255;
  }
  bc.putImageData(id, 0, 0);
  // espessura parecida com a da caneta depois de reduzir
  const esc = Math.min(TARGET_H / bruto.height, MAX_W / bruto.width);
  const grossura = Math.round(2.2 / Math.max(esc, 0.05) / 2.5);
  let fonte = bruto;
  if (grossura >= 1 && esc < 0.6) fonte = engrossar(bruto, Math.min(grossura, 6));
  const dw = Math.max(1, Math.round(fonte.width * esc)), dh = Math.max(1, Math.round(fonte.height * esc));
  const canvasW = Math.min(MAX_W, Math.max(MIN_W, Math.ceil((dw + PAD) / 64) * 64));
  const alvo = document.createElement('canvas');
  alvo.width = canvasW; alvo.height = MODEL_H;
  const ac = alvo.getContext('2d', { willReadFrequently: true });
  ac.fillStyle = '#000'; ac.fillRect(0, 0, canvasW, MODEL_H);
  ac.imageSmoothingQuality = 'high';
  ac.drawImage(fonte, 0, 0, dw, dh);
  const px = ac.getImageData(0, 0, canvasW, MODEL_H).data;
  const tensor = new Float32Array(canvasW * MODEL_H);
  for (let i = 0; i < tensor.length; i++) tensor[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;
  const mask = new Uint8Array(MODEL_H * canvasW);
  for (let y = 0; y < MODEL_H; y++) for (let x = 0; x < canvasW; x++) mask[y * canvasW + x] = y < dh && x < dw ? 0 : 1;
  return { tensor, height: MODEL_H, width: canvasW, mask, maskHeight: MODEL_H, maskWidth: canvasW };
}

function engrossar(c, r) {
  const o = document.createElement('canvas');
  o.width = c.width; o.height = c.height;
  const ctx = o.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, o.width, o.height);
  ctx.globalCompositeOperation = 'lighten';
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) ctx.drawImage(c, dx, dy);
  return o;
}

function removerPontos(m, W, H, minimo) {
  const vis = new Uint8Array(W * H);
  const pilha = [];
  for (let i = 0; i < W * H; i++) {
    if (!m[i] || vis[i]) continue;
    const comp = [];
    pilha.push(i); vis[i] = 1;
    while (pilha.length) {
      const k = pilha.pop(); comp.push(k);
      const x = k % W, y = (k - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (m[j] && !vis[j]) { vis[j] = 1; pilha.push(j); }
      }
    }
    if (comp.length < minimo) for (const k of comp) m[k] = 0;
  }
}

export async function lerImagem(canvas) {
  await preparar();
  const r = await motor.recognize(imagemParaEntrada(canvas), vocab, 'auto');
  return limpar(r.latex);
}
