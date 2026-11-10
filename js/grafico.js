// Gráficos desenhados no próprio app (offline): funções, estatística e barras.
import { avaliar } from './motor/ast.js';
import { formatNum } from './motor/racional.js';

const CORES = ['#1f6fff', '#e8590c', '#12a866', '#8a3ffc', '#d6336c', '#0c8599'];
const num = (x) => formatNum(Math.abs(x) < 1e-10 ? 0 : x, 3);

function passoBonito(alcance, alvo = 8) {
  const bruto = alcance / alvo;
  const p = Math.pow(10, Math.floor(Math.log10(bruto)));
  const r = bruto / p;
  return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * p;
}

export class GraficoFuncoes {
  constructor(canvas, { interativo = true } = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.funcoes = [];
    this.marcas = [];
    this.vista = { cx: 0, cy: 0, ux: 40 }; // centro e pixels por unidade
    this.toque = null;
    this.ponteiros = new Map();
    this.ro = new ResizeObserver(() => this.desenhar());
    this.ro.observe(canvas);
    if (interativo) this.ligarGestos();
  }
  definir(funcoes, marcas = []) {
    this.funcoes = funcoes.map((f, i) => ({ cor: CORES[i % CORES.length], ...f, calc: compilar(f.ast, f.v || 'x') }));
    this.marcas = marcas;
    this.enquadrar();
  }
  // escolhe uma janela boa: centraliza raízes, vértice e corte no eixo y
  enquadrar() {
    const xs = [0, ...this.marcas.map((m) => m.x)];
    for (const f of this.funcoes) for (const r of raizes(f.calc, -30, 30)) xs.push(r);
    let x0 = Math.min(...xs), x1 = Math.max(...xs);
    if (x1 - x0 < 6) { const c = (x0 + x1) / 2; x0 = c - 3.5; x1 = c + 3.5; }
    const pad = (x1 - x0) * 0.35; x0 -= pad; x1 += pad;
    const ys = [0, ...this.marcas.map((m) => m.y)];
    const amostras = [];
    for (const f of this.funcoes) for (let k = 0; k <= 120; k++) { const y = f.calc(x0 + ((x1 - x0) * k) / 120); if (isFinite(y)) amostras.push(y); }
    amostras.sort((a, b) => a - b);
    if (amostras.length) { ys.push(amostras[Math.floor(amostras.length * 0.1)], amostras[Math.ceil(amostras.length * 0.85) - 1]); }
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (y1 - y0 < 4) { const c = (y0 + y1) / 2; y0 = c - 2.5; y1 = c + 2.5; }
    const py = (y1 - y0) * 0.18; y0 -= py; y1 += py;
    const r = this.cv.getBoundingClientRect();
    const W = r.width || 360, H = r.height || 260;
    let ux = W / (x1 - x0), uy = H / (y1 - y0);
    if (uy / ux < 2.5 && ux / uy < 2.5) { const u = Math.min(ux, uy); ux = u; uy = u; } // proporção real quando dá
    this.vista = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, ux, uy };
    this.desenhar();
  }
  zoom(fator, px, py) {
    const r = this.cv.getBoundingClientRect();
    const W = r.width, H = r.height;
    px = px ?? W / 2; py = py ?? H / 2;
    const [wx, wy] = this.paraMundo(px, py);
    this.vista.ux *= fator; this.vista.uy = (this.vista.uy || this.vista.ux) * fator;
    const [nx, ny] = this.paraMundo(px, py);
    this.vista.cx += wx - nx; this.vista.cy += wy - ny;
    this.desenhar();
  }
  paraTela(x, y) {
    const r = this.cv.getBoundingClientRect();
    const uy = this.vista.uy || this.vista.ux;
    return [r.width / 2 + (x - this.vista.cx) * this.vista.ux, r.height / 2 - (y - this.vista.cy) * uy];
  }
  paraMundo(px, py) {
    const r = this.cv.getBoundingClientRect();
    const uy = this.vista.uy || this.vista.ux;
    return [this.vista.cx + (px - r.width / 2) / this.vista.ux, this.vista.cy - (py - r.height / 2) / uy];
  }
  ligarGestos() {
    const cv = this.cv;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.ponteiros.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      this.inicio = { vista: { ...this.vista }, pts: new Map(this.ponteiros), t: Date.now(), moveu: false };
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.ponteiros.has(e.pointerId)) return;
      this.ponteiros.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      const ini = this.inicio; if (!ini) return;
      const atuais = [...this.ponteiros.values()], antes = [...ini.pts.values()];
      if (atuais.length === 1 && antes.length === 1) {
        const dx = atuais[0].x - antes[0].x, dy = atuais[0].y - antes[0].y;
        if (Math.hypot(dx, dy) > 6) ini.moveu = true;
        if (!ini.moveu) return;
        this.vista.cx = ini.vista.cx - dx / ini.vista.ux;
        this.vista.cy = ini.vista.cy + dy / (ini.vista.uy || ini.vista.ux);
        this.toque = null;
        this.desenhar();
      } else if (atuais.length >= 2 && antes.length >= 2) {
        ini.moveu = true;
        const d0 = Math.hypot(antes[0].x - antes[1].x, antes[0].y - antes[1].y) || 1;
        const d1 = Math.hypot(atuais[0].x - atuais[1].x, atuais[0].y - atuais[1].y) || 1;
        this.vista = { ...ini.vista };
        const mx = (atuais[0].x + atuais[1].x) / 2, my = (atuais[0].y + atuais[1].y) / 2;
        this.zoom(d1 / d0, mx, my);
      }
    });
    const fim = (e) => {
      const ini = this.inicio;
      this.ponteiros.delete(e.pointerId);
      if (ini && !ini.moveu && this.ponteiros.size === 0 && Date.now() - ini.t < 500) {
        const [x] = this.paraMundo(e.offsetX, e.offsetY);
        this.toque = { x };
        this.desenhar();
      }
      if (this.ponteiros.size) this.inicio = { vista: { ...this.vista }, pts: new Map(this.ponteiros), t: Date.now(), moveu: true };
      else this.inicio = null;
    };
    cv.addEventListener('pointerup', fim);
    cv.addEventListener('pointercancel', fim);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.offsetX, e.offsetY); }, { passive: false });
  }
  desenhar() {
    const cv = this.cv, r = cv.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const c = this.ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width, H = r.height;
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
    const [xa, ya] = this.paraMundo(0, H), [xb, yb] = this.paraMundo(W, 0);
    const sx = passoBonito(xb - xa), sy = passoBonito(yb - ya);
    // grade
    c.lineWidth = 1; c.strokeStyle = '#eef1f7';
    for (let x = Math.ceil(xa / sx) * sx; x <= xb; x += sx) { const [px] = this.paraTela(x, 0); c.beginPath(); c.moveTo(px, 0); c.lineTo(px, H); c.stroke(); }
    for (let y = Math.ceil(ya / sy) * sy; y <= yb; y += sy) { const [, py] = this.paraTela(0, y); c.beginPath(); c.moveTo(0, py); c.lineTo(W, py); c.stroke(); }
    // eixos
    const [ox, oy] = this.paraTela(0, 0);
    c.strokeStyle = '#8b94aa'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(0, oy); c.lineTo(W, oy); c.moveTo(ox, 0); c.lineTo(ox, H); c.stroke();
    // números
    c.fillStyle = '#6b748c'; c.font = '11px Nunito, sans-serif';
    const ly = Math.min(Math.max(oy + 13, 12), H - 4), lx = Math.min(Math.max(ox + 4, 4), W - 30);
    c.textAlign = 'center';
    for (let x = Math.ceil(xa / sx) * sx; x <= xb; x += sx) { if (Math.abs(x) < sx / 2) continue; const [px] = this.paraTela(x, 0); c.fillText(num(x), px, ly); }
    c.textAlign = 'left';
    for (let y = Math.ceil(ya / sy) * sy; y <= yb; y += sy) { if (Math.abs(y) < sy / 2) continue; const [, py] = this.paraTela(0, y); c.fillText(num(y), lx, py - 3); }
    // curvas
    for (const f of this.funcoes) {
      c.strokeStyle = f.cor; c.lineWidth = 2.6; c.lineJoin = 'round';
      c.beginPath();
      let ant = null;
      for (let px = 0; px <= W; px += 1) {
        const [x] = this.paraMundo(px, 0);
        const y = f.calc(x);
        if (!isFinite(y)) { ant = null; continue; }
        const [, py] = this.paraTela(x, y);
        if (ant !== null && Math.abs(py - ant) < H * 1.5 && py > -H && py < 2 * H) c.lineTo(px, py);
        else c.moveTo(px, Math.max(-H, Math.min(2 * H, py)));
        ant = py;
      }
      c.stroke();
    }
    // marcas automáticas: raízes e corte no eixo y
    const pontos = [...this.marcas];
    for (const f of this.funcoes) {
      for (const x of raizes(f.calc, xa, xb)) pontos.push({ x, y: 0, cor: f.cor, rotulo: '' });
      const y0 = f.calc(0); if (isFinite(y0)) pontos.push({ x: 0, y: y0, cor: f.cor, rotulo: '' });
    }
    const usados = [], feitos = [];
    // marcas com nome (vértice) primeiro
    pontos.sort((a, b) => (b.rotulo ? 1 : 0) - (a.rotulo ? 1 : 0));
    for (const m of pontos) {
      const [px, py] = this.paraTela(m.x, m.y);
      if (px < -10 || px > W + 10 || py < -10 || py > H + 10) continue;
      if (feitos.some(([a, b]) => Math.hypot(a - px, b - py) < 3)) continue;
      feitos.push([px, py]);
      c.fillStyle = '#fff'; c.strokeStyle = m.cor || '#151c33'; c.lineWidth = 2.2;
      c.beginPath(); c.arc(px, py, 4.5, 0, 7); c.fill(); c.stroke();
      c.font = '700 11.5px Nunito, sans-serif'; c.textAlign = 'left';
      const txt = `${m.rotulo ? m.rotulo + ' ' : ''}(${num(m.x)}; ${num(m.y)})`;
      const w = c.measureText(txt).width + 6;
      // tenta quatro posições em volta do ponto
      const opcoes = [[px + 7, py - 18], [px + 7, py + 6], [px - w - 7, py - 18], [px - w - 7, py + 6]];
      const livre = opcoes.find(([x, y]) => x >= 0 && x + w <= W && y >= 0 && y + 15 <= H && !usados.some((u) => x < u[0] + u[2] && x + w > u[0] && y < u[1] + 15 && y + 15 > u[1]));
      if (!livre) continue;
      usados.push([livre[0], livre[1], w]);
      c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(livre[0], livre[1], w, 15);
      c.fillStyle = '#151c33'; c.fillText(txt, livre[0] + 3, livre[1] + 11.5);
    }
    // toque: valor da função naquele x
    if (this.toque) {
      const x = this.toque.x;
      const [px] = this.paraTela(x, 0);
      c.strokeStyle = 'rgba(21,28,51,.35)'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(px, 0); c.lineTo(px, H); c.stroke(); c.setLineDash([]);
      let ty = 18;
      for (const f of this.funcoes) {
        const y = f.calc(x);
        if (!isFinite(y)) continue;
        const [, py] = this.paraTela(x, y);
        c.fillStyle = f.cor; c.beginPath(); c.arc(px, py, 5, 0, 7); c.fill();
        const txt = `x = ${num(x)}  →  y = ${num(y)}`;
        c.font = '700 12.5px Nunito, sans-serif';
        const w = c.measureText(txt).width + 16;
        const bx = Math.min(Math.max(px + 10, 6), W - w - 6);
        c.fillStyle = 'rgba(255,255,255,.95)'; c.strokeStyle = f.cor; c.lineWidth = 1.5;
        c.beginPath(); c.roundRect ? c.roundRect(bx, ty - 14, w, 22, 8) : c.rect(bx, ty - 14, w, 22); c.fill(); c.stroke();
        c.fillStyle = '#151c33'; c.fillText(txt, bx + 8, ty + 1);
        ty += 28;
      }
    }
  }
}

function compilar(ast, v) {
  return (x) => { try { return avaliar(ast, { [v]: x }); } catch { return NaN; } };
}

export function raizes(f, a, b, n = 600) {
  const out = [];
  let px = a, pf = f(a);
  for (let k = 1; k <= n; k++) {
    const x = a + ((b - a) * k) / n, fx = f(x);
    if (isFinite(pf) && isFinite(fx)) {
      if (fx === 0) out.push(x);
      else if (pf * fx < 0 && Math.abs(fx - pf) < 1e6) {
        let lo = px, hi = x, flo = pf;
        for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2, fm = f(mid); if (!isFinite(fm)) break; if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; } }
        const r = (lo + hi) / 2;
        if (Math.abs(f(r)) < 1e-6 * (1 + Math.abs(pf) + Math.abs(fx))) out.push(Math.abs(r - Math.round(r)) < 1e-9 ? Math.round(r) : r);
      }
    }
    px = x; pf = fx;
  }
  return out.filter((x, i) => i === 0 || Math.abs(x - out[i - 1]) > 1e-6);
}

// ---------- estatística: histograma + caixa ----------
export function desenharEstatistica(canvas, d) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height;
  c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
  const vals = d.valores, min = vals[0], max = vals[vals.length - 1];
  // barras: por valor (se poucos distintos) ou por classes
  let barras;
  if (d.freq.length <= 16) barras = d.freq.map(([v, f]) => ({ rot: num(v), f, a: v, b: v }));
  else {
    const k = Math.ceil(1 + 3.3 * Math.log10(vals.length)); const h = (max - min) / k || 1;
    barras = Array.from({ length: k }, (_, i) => ({ a: min + i * h, b: min + (i + 1) * h, f: 0 }));
    for (const v of vals) barras[Math.min(k - 1, Math.floor((v - min) / h))].f++;
    barras.forEach((b) => (b.rot = `${num(b.a)}–${num(b.b)}`));
  }
  const topo = 26, baseY = H * 0.62, esq = 34, dir = W - 12;
  const fMax = Math.max(...barras.map((b) => b.f));
  c.fillStyle = '#151c33'; c.font = '700 13px Nunito, sans-serif'; c.fillText('Frequência', esq, 16);
  const bw = (dir - esq) / barras.length;
  c.font = '11px Nunito, sans-serif'; c.textAlign = 'center';
  barras.forEach((b, i) => {
    const h = ((baseY - topo) * b.f) / fMax;
    const x = esq + i * bw + bw * 0.12;
    c.fillStyle = '#1f6fff'; c.fillRect(x, baseY - h, bw * 0.76, h);
    c.fillStyle = '#151c33'; c.fillText(String(b.f), x + bw * 0.38, baseY - h - 4);
    c.fillStyle = '#6b748c'; if (barras.length <= 12 || i % 2 === 0) c.fillText(b.rot, x + bw * 0.38, baseY + 13);
  });
  c.strokeStyle = '#8b94aa'; c.beginPath(); c.moveTo(esq, baseY); c.lineTo(dir, baseY); c.stroke();
  // gráfico de caixa
  const by = H * 0.84, X = (v) => esq + ((v - min) / (max - min || 1)) * (dir - esq);
  c.textAlign = 'left'; c.fillStyle = '#151c33'; c.font = '700 13px Nunito, sans-serif'; c.fillText('Gráfico de caixa', esq, H * 0.72);
  c.strokeStyle = '#151c33'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(X(min), by); c.lineTo(X(max), by); c.stroke();
  for (const v of [min, max]) { c.beginPath(); c.moveTo(X(v), by - 8); c.lineTo(X(v), by + 8); c.stroke(); }
  if (d.q1 != null) {
    c.fillStyle = '#e6eeff'; c.fillRect(X(d.q1), by - 14, X(d.q3) - X(d.q1), 28); c.strokeRect(X(d.q1), by - 14, X(d.q3) - X(d.q1), 28);
  }
  c.strokeStyle = '#e8590c'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(X(d.mediana), by - 14); c.lineTo(X(d.mediana), by + 14); c.stroke();
  c.fillStyle = '#12a866'; c.beginPath(); c.arc(X(d.media), by, 4.5, 0, 7); c.fill();
  c.font = '11px Nunito, sans-serif'; c.fillStyle = '#6b748c'; c.textAlign = 'center';
  c.fillText(num(min), X(min), by + 26); c.fillText(num(max), X(max), by + 26);
  c.textAlign = 'left'; c.fillStyle = '#e8590c'; c.fillText('— mediana', W - 150, H * 0.72); c.fillStyle = '#12a866'; c.fillText('● média', W - 72, H * 0.72);
}

// ---------- barras simples (juros) ----------
export function desenharBarras(canvas, d) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width, H = r.height;
  c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
  const esq = 12, dir = W - 12, topo = 30, base = H - 22;
  const vMax = Math.max(...d.pares.map((p) => p[1]));
  c.fillStyle = '#151c33'; c.font = '700 13px Nunito, sans-serif'; c.fillText(d.titulo || '', esq, 18);
  const bw = (dir - esq) / d.pares.length;
  c.textAlign = 'center'; c.font = '10.5px Nunito, sans-serif';
  d.pares.forEach(([k, v], i) => {
    const h = ((base - topo) * v) / vMax;
    c.fillStyle = i === d.pares.length - 1 ? '#12a866' : '#1f6fff';
    c.fillRect(esq + i * bw + bw * 0.15, base - h, bw * 0.7, h);
    c.fillStyle = '#6b748c'; if (d.pares.length <= 14 || i % Math.ceil(d.pares.length / 12) === 0) c.fillText(String(k), esq + i * bw + bw / 2, base + 13);
  });
  const ult = d.pares[d.pares.length - 1][1];
  c.fillStyle = '#12a866'; c.font = '700 12px Nunito, sans-serif'; c.textAlign = 'right'; c.fillText('R$ ' + ult.toFixed(2).replace('.', ','), dir, topo - 8);
}
