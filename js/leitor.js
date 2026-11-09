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

export async function lerTracos(tracos) {
  const strokes = tracos.map((t) => ({ points: t.pts.map((p) => ({ x: p.x, y: p.y })), lineWidth: Math.max(3, t.esp * 0.8) }));
  if (!isStrokeMeaningful(strokes)) throw new Error('Escreva a conta um pouco maior.');
  await preparar();
  const r = await motor.recognize(preprocessStrokes(strokes), vocab, 'auto');
  return limpar(r.latex);
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
