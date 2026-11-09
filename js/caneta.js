// Papel de caderno para escrever com o dedo ou caneta (stylus).
export class Caneta {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.tracos = [];
    this.atual = null;
    this.esp = 4;
    this.ajustar();
    new ResizeObserver(() => this.ajustar()).observe(canvas);
    canvas.addEventListener('pointerdown', (e) => this.inicio(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(ev, () => this.fim());
  }
  ajustar() {
    const r = this.cv.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.cv.width = Math.round(r.width * dpr);
    this.cv.height = Math.round(r.height * dpr);
    this.dpr = dpr;
    this.redesenhar();
  }
  pos(e) {
    const r = this.cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure && e.pointerType === 'pen' ? e.pressure : 0.5 };
  }
  inicio(e) {
    e.preventDefault();
    this.cv.setPointerCapture?.(e.pointerId);
    this.atual = { esp: this.esp, pts: [this.pos(e)] };
    this.tracos.push(this.atual);
    this.redesenhar();
  }
  move(e) {
    if (!this.atual) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) this.atual.pts.push(this.pos(ev));
    this.redesenhar();
  }
  fim() { this.atual = null; this.onMudou?.(); }
  desfazer() { this.tracos.pop(); this.redesenhar(); this.onMudou?.(); }
  limpar() { this.tracos = []; this.redesenhar(); this.onMudou?.(); }
  get vazio() { return this.tracos.length === 0; }
  fundo(ctx, w, h, linhas = true) {
    ctx.fillStyle = '#fbfbf6';
    ctx.fillRect(0, 0, w, h);
    if (!linhas) return;
    ctx.strokeStyle = '#cfdcf3';
    ctx.lineWidth = 1;
    for (let y = 34; y < h; y += 34) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
    ctx.strokeStyle = '#f2b8b8';
    ctx.beginPath(); ctx.moveTo(38.5, 0); ctx.lineTo(38.5, h); ctx.stroke();
  }
  desenharTracos(ctx) {
    ctx.strokeStyle = '#13213d';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const t of this.tracos) {
      const p = t.pts;
      if (p.length === 1) { ctx.fillStyle = '#13213d'; ctx.beginPath(); ctx.arc(p[0].x, p[0].y, t.esp / 2, 0, 7); ctx.fill(); continue; }
      ctx.lineWidth = t.esp;
      ctx.beginPath();
      ctx.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length - 1; i++) {
        const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
        ctx.quadraticCurveTo(p[i].x, p[i].y, mx, my);
      }
      ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
      ctx.stroke();
    }
  }
  redesenhar() {
    const { ctx } = this;
    ctx.setTransform(this.dpr || 1, 0, 0, this.dpr || 1, 0, 0);
    const w = this.cv.width / (this.dpr || 1), h = this.cv.height / (this.dpr || 1);
    this.fundo(ctx, w, h, true);
    this.desenharTracos(ctx);
  }
  // imagem só com a escrita (sem linhas do caderno), recortada, para a IA ler
  imagem() {
    if (this.vazio) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const t of this.tracos) for (const p of t.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const m = 24;
    x0 -= m; y0 -= m; x1 += m; y1 += m;
    const esc = Math.min(2, 1400 / Math.max(1, x1 - x0));
    const c = document.createElement('canvas');
    c.width = Math.round((x1 - x0) * esc); c.height = Math.round((y1 - y0) * esc);
    const ctx = c.getContext('2d');
    ctx.setTransform(esc, 0, 0, esc, -x0 * esc, -y0 * esc);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    this.desenharTracos(ctx);
    return c.toDataURL('image/png').split(',')[1];
  }
}
