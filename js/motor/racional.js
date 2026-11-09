// Números racionais exatos (frações) com BigInt — nada de erro de arredondamento.
const abs = (a) => (a < 0n ? -a : a);
export function mdcBig(a, b) {
  a = abs(a); b = abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

export class Q {
  constructor(n, d = 1n) {
    n = BigInt(n); d = BigInt(d);
    if (d === 0n) throw new ErroMat('Divisão por zero não existe.');
    if (d < 0n) { n = -n; d = -d; }
    const g = mdcBig(n, d) || 1n;
    this.n = n / g; this.d = d / g;
  }
  static of(x) {
    if (x instanceof Q) return x;
    if (typeof x === 'bigint') return new Q(x, 1n);
    if (Number.isInteger(x)) return new Q(BigInt(x), 1n);
    return Q.fromDecimal(String(x));
  }
  static fromDecimal(s) {
    s = String(s).replace(',', '.');
    let neg = false;
    if (s.startsWith('-')) { neg = true; s = s.slice(1); }
    let exp = 0;
    const em = s.match(/^(.*)e([+-]?\d+)$/i);
    if (em) { s = em[1]; exp = parseInt(em[2], 10); }
    const [i, f = ''] = s.split('.');
    let n = BigInt((i || '0') + f);
    let d = 10n ** BigInt(f.length);
    if (exp > 0) n *= 10n ** BigInt(exp); else if (exp < 0) d *= 10n ** BigInt(-exp);
    return new Q(neg ? -n : n, d);
  }
  // Converte um número de ponto flutuante em fração só se for "limpa" (ex.: 0.25)
  static fromFloat(x, maxDen = 1000000n) {
    if (!isFinite(x)) return null;
    if (Number.isInteger(x) && Math.abs(x) < 1e15) return new Q(BigInt(x));
    // frações contínuas
    let h0 = 0n, h1 = 1n, k0 = 1n, k1 = 0n, v = x;
    for (let i = 0; i < 40; i++) {
      const a = Math.floor(v);
      const A = BigInt(a);
      [h0, h1] = [h1, A * h1 + h0];
      [k0, k1] = [k1, A * k1 + k0];
      if (k1 > maxDen) return null;
      if (Math.abs(Number(h1) / Number(k1) - x) < 1e-12 * Math.max(1, Math.abs(x))) return new Q(h1, k1);
      const r = v - a;
      if (r < 1e-15) break;
      v = 1 / r;
    }
    if (k1 && k1 <= maxDen && Math.abs(Number(h1) / Number(k1) - x) < 1e-12 * Math.max(1, Math.abs(x))) return new Q(h1, k1);
    return null;
  }
  get isInt() { return this.d === 1n; }
  get isZero() { return this.n === 0n; }
  get isOne() { return this.n === 1n && this.d === 1n; }
  get isNeg() { return this.n < 0n; }
  sign() { return this.n === 0n ? 0 : this.n < 0n ? -1 : 1; }
  add(o) { o = Q.of(o); return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = Q.of(o); return new Q(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = Q.of(o); return new Q(this.n * o.n, this.d * o.d); }
  div(o) {
    o = Q.of(o);
    if (o.isZero) throw new ErroMat('Divisão por zero não existe.');
    return new Q(this.n * o.d, this.d * o.n);
  }
  neg() { return new Q(-this.n, this.d); }
  abs() { return new Q(abs(this.n), this.d); }
  inv() { return Q.ONE.div(this); }
  powInt(k) {
    k = BigInt(k);
    if (k === 0n) {
      if (this.isZero) throw new ErroMat('0⁰ é uma indeterminação.');
      return Q.ONE;
    }
    if (k < 0n) {
      if (this.isZero) throw new ErroMat('Zero elevado a expoente negativo é divisão por zero.');
      return new Q(this.d ** -k, this.n ** -k);
    }
    if (k > 4000n) throw new ErroMat('Expoente grande demais para calcular exatamente.');
    return new Q(this.n ** k, this.d ** k);
  }
  cmp(o) { o = Q.of(o); const x = this.n * o.d - o.n * this.d; return x === 0n ? 0 : x < 0n ? -1 : 1; }
  eq(o) { return this.cmp(o) === 0; }
  toNumber() {
    const n = Number(this.n), d = Number(this.d);
    if (isFinite(n) && isFinite(d)) return n / d;
    // números enormes
    const s = this.n.toString().length - this.d.toString().length;
    const scale = 10n ** BigInt(Math.max(0, 300 - Math.max(0, s)));
    return Number((this.n * scale) / this.d) / Number(scale);
  }
  toString() { return this.isInt ? this.n.toString() : `${this.n}/${this.d}`; }
  toLatex() {
    if (this.isInt) return this.n.toString();
    const s = this.n < 0n ? '-' : '';
    return `${s}\\frac{${abs(this.n)}}{${this.d}}`;
  }
  // Representação decimal: exata se terminar, senão arredonda
  toDecimal(casas = 10) {
    let d = this.d;
    while (d % 2n === 0n) d /= 2n;
    while (d % 5n === 0n) d /= 5n;
    const exata = d === 1n;
    const neg = this.n < 0n;
    const N = abs(this.n);
    const inteira = N / this.d;
    let resto = N % this.d;
    let frac = '';
    for (let i = 0; i < casas && resto !== 0n; i++) {
      resto *= 10n;
      frac += (resto / this.d).toString();
      resto %= this.d;
    }
    let txt = inteira.toString() + (frac ? ',' + frac : '');
    if (!exata) {
      txt = formatNum(this.toNumber(), casas);
      return { txt, exata: false };
    }
    return { txt: (neg ? '-' : '') + txt, exata: true };
  }
}
Q.ZERO = new Q(0n);
Q.ONE = new Q(1n);
Q.TWO = new Q(2n);
Q.MINUS_ONE = new Q(-1n);

export class ErroMat extends Error {
  constructor(msg) { super(msg); this.name = 'ErroMat'; }
}

// Formata número decimal no padrão brasileiro (vírgula)
export function formatNum(x, casas = 8) {
  if (!isFinite(x)) return x > 0 ? '∞' : x < 0 ? '-∞' : 'indefinido';
  if (Math.abs(x) < 1e-12) return '0';
  const ax = Math.abs(x);
  if (ax >= 1e15 || ax < 1e-6) {
    const [m, e] = x.toExponential(6).split('e');
    return `${trimZeros(m).replace('.', ',')}·10^${parseInt(e, 10)}`;
  }
  return trimZeros(x.toFixed(casas)).replace('.', ',');
}
function trimZeros(s) {
  if (!s.includes('.')) return s;
  s = s.replace(/0+$/, '');
  return s.endsWith('.') ? s.slice(0, -1) : s;
}

// Fatoração de inteiros (para MMC, MDC, raízes)
export function fatorar(n) {
  n = abs(BigInt(n));
  const f = new Map();
  if (n < 2n) return f;
  for (const p of [2n, 3n, 5n]) {
    while (n % p === 0n) { f.set(p, (f.get(p) || 0) + 1); n /= p; }
  }
  let p = 7n;
  const inc = [4n, 2n, 4n, 2n, 4n, 6n, 2n, 6n];
  let i = 0, guard = 0;
  while (p * p <= n) {
    while (n % p === 0n) { f.set(p, (f.get(p) || 0) + 1); n /= p; }
    p += inc[i++ % 8];
    if (++guard > 3000000) break; // números enormes: para e devolve o resto como "primo"
  }
  if (n > 1n) f.set(n, (f.get(n) || 0) + 1);
  return f;
}

// √n = a·√b com b livre de quadrados
export function raizSimplificada(n, indice = 2) {
  n = BigInt(n);
  const k = BigInt(indice);
  let fora = 1n, dentro = 1n;
  for (const [p, e] of fatorar(n)) {
    const E = BigInt(e);
    fora *= p ** (E / k);
    dentro *= p ** (E % k);
  }
  return { fora, dentro };
}

export function mmcBig(a, b) { a = abs(a); b = abs(b); if (!a || !b) return 0n; return (a / mdcBig(a, b)) * b; }
