// Folha de caderno rolável para escrever com o dedo ou caneta (stylus).
// - um dedo (ou a caneta) escreve; dois dedos rolam a folha
// - se usar caneta stylus, o dedo passa a só rolar (não risca com a palma da mão)
const ALTURA_FOLHA = 1800;
const LINHA = 40;

export class Caneta {
  constructor(canvas, rolagem) {
    this.cv = canvas;
    this.rol = rolagem;
    this.ctx = canvas.getContext('2d');
    this.tracos = [];
    this.atual = null;
    this.esp = 4;
    this.toques = new Map();
    this.usouStylus = false;
    this.pan = null;
    this.ajustar();
    new ResizeObserver(() => this.ajustar()).observe(rolagem);
    canvas.addEventListener('pointerdown', (e) => this.baixo(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, (e) => this.cima(e));
  }
  ajustar() {
    const vis = this.rol.clientWidth;
    if (!vis) return;
    // a folha cresce para o lado se o que foi escrito (ex.: com o celular deitado) for mais largo que a tela
    let maxX = 0;
    for (const t of this.tracos) for (const p of t.pts) if (p.x > maxX) maxX = p.x;
    const w = Math.max(vis, Math.ceil(maxX + 40));
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.cv.style.height = ALTURA_FOLHA + 'px';
    this.cv.style.width = w + 'px';
    if (this.cv.width === Math.round(w * dpr) && this.dpr === dpr) return;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(ALTURA_FOLHA * dpr);
    this.dpr = dpr;
    this.redesenhar();
  }
  pos(e) {
    const r = this.cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  baixo(e) {
    e.preventDefault();
    if (e.pointerType === 'pen') this.usouStylus = true;
    this.cv.setPointerCapture?.(e.pointerId);
    this.toques.set(e.pointerId, { x: e.clientX, y: e.clientY, tipo: e.pointerType });
    const dedos = [...this.toques.values()].filter((t) => t.tipo === 'touch').length;
    const soRola = e.pointerType === 'touch' && (this.usouStylus || dedos >= 2);
    if (soRola) {
      // segundo dedo: cancela o traço que tinha começado e passa a rolar
      if (this.atual && this.atual.tipo === 'touch') { this.tracos.pop(); this.atual = null; this.redesenhar(); }
      this.pan = { y: this.mediaY(), x: this.mediaX(), top: this.rol.scrollTop, left: this.rol.scrollLeft };
      return;
    }
    if (this.pan) return;
    this.atual = { esp: this.esp, pts: [this.pos(e)], id: e.pointerId, tipo: e.pointerType };
    this.tracos.push(this.atual);
    this.redesenhar();
  }
  mediaY() { const v = [...this.toques.values()].filter((t) => t.tipo === 'touch'); return v.reduce((s, t) => s + t.y, 0) / Math.max(1, v.length); }
  mediaX() { const v = [...this.toques.values()].filter((t) => t.tipo === 'touch'); return v.reduce((s, t) => s + t.x, 0) / Math.max(1, v.length); }
  move(e) {
    if (this.toques.has(e.pointerId)) this.toques.set(e.pointerId, { x: e.clientX, y: e.clientY, tipo: e.pointerType });
    if (this.pan && e.pointerType === 'touch') {
      e.preventDefault();
      this.rol.scrollTop = this.pan.top - (this.mediaY() - this.pan.y);
      this.rol.scrollLeft = this.pan.left - (this.mediaX() - this.pan.x);
      return;
    }
    if (!this.atual || e.pointerId !== this.atual.id) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) this.atual.pts.push(this.pos(ev));
    this.redesenhar();
  }
  cima(e) {
    this.toques.delete(e.pointerId);
    if (this.atual && e.pointerId === this.atual.id) { this.atual = null; this.onMudou?.(); }
    const dedos = [...this.toques.values()].filter((t) => t.tipo === 'touch').length;
    if (this.pan && dedos === 0) this.pan = null;
    else if (this.pan) this.pan = { y: this.mediaY(), x: this.mediaX(), top: this.rol.scrollTop, left: this.rol.scrollLeft };
  }
  desfazer() { this.tracos.pop(); this.redesenhar(); this.onMudou?.(); }
  limpar() { this.tracos = []; this.rol.scrollTop = 0; this.rol.scrollLeft = 0; this.ajustar(); this.redesenhar(); this.onMudou?.(); }
  get vazio() { return this.tracos.length === 0; }

  // só os traços da última conta escrita (agrupa pela altura, a partir do último traço)
  ultimaConta() {
    if (!this.tracos.length) return [];
    const caixa = (t) => { let a = Infinity, b = -Infinity; for (const p of t.pts) { a = Math.min(a, p.y); b = Math.max(b, p.y); } return [a, b]; };
    const cx = this.tracos.map(caixa);
    let [lo, hi] = cx[cx.length - 1];
    const dentro = new Set([this.tracos.length - 1]);
    const folga = LINHA * 0.9;
    for (let mudou = true; mudou;) {
      mudou = false;
      cx.forEach(([a, b], i) => {
        if (dentro.has(i)) return;
        if (b >= lo - folga && a <= hi + folga) { dentro.add(i); lo = Math.min(lo, a); hi = Math.max(hi, b); mudou = true; }
      });
    }
    return this.tracos.filter((_, i) => dentro.has(i));
  }

  fundo(ctx, w, h) {
    ctx.fillStyle = '#fffef9';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d6e2f5';
    ctx.lineWidth = 1;
    for (let y = LINHA; y < h; y += LINHA) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
    ctx.strokeStyle = '#f4c2c2';
    ctx.beginPath(); ctx.moveTo(36.5, 0); ctx.lineTo(36.5, h); ctx.stroke();
  }
  desenharTracos(ctx, lista = this.tracos) {
    ctx.strokeStyle = '#1b2a55';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const t of lista) {
      const p = t.pts;
      if (p.length === 1) { ctx.fillStyle = '#1b2a55'; ctx.beginPath(); ctx.arc(p[0].x, p[0].y, t.esp / 2, 0, 7); ctx.fill(); continue; }
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
    const d = this.dpr || 1;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const w = this.cv.width / d, h = this.cv.height / d;
    this.fundo(ctx, w, h);
    this.desenharTracos(ctx);
  }
}
