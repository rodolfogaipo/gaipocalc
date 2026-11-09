// Forma normal: soma de termos  c · ∏ átomo^expoente.
// Átomos: variáveis (x), primos sob raiz (√2 = 2^(1/2)), π, e, i e "caixas" (sen(x), (x+1)^(-1), ...).
// Serve para simplificar, expandir, juntar termos semelhantes e comparar expressões.
import { Q, ErroMat, fatorar } from './racional.js';
import * as A from './ast.js';

const ATOMOS = new Map(); // chave → { tipo, ... }

function atomoVar(n) { const k = 'v:' + n; if (!ATOMOS.has(k)) ATOMOS.set(k, { tipo: 'var', n }); return k; }
function atomoNum(p) { const k = 'n:' + p; if (!ATOMOS.has(k)) ATOMOS.set(k, { tipo: 'num', p: BigInt(p) }); return k; }
function atomoConst(n) { const k = 'c:' + n; if (!ATOMOS.has(k)) ATOMOS.set(k, { tipo: 'const', n }); return k; }
function atomoCaixa(node, base) {
  const k = 'f:' + A.latex(node);
  if (!ATOMOS.has(k)) ATOMOS.set(k, { tipo: 'caixa', node, base });
  return k;
}
export function infoAtomo(k) { return ATOMOS.get(k); }

const LIMITE_TERMOS = 400;

export class P {
  constructor() { this.t = new Map(); }
  static c(q) { const p = new P(); q = Q.of(q); if (!q.isZero) p.t.set('', { c: q, m: [] }); return p; }
  static atomo(k, e = Q.ONE) { const p = new P(); return p.addTerm({ c: Q.ONE, m: [[k, Q.of(e)]] }); }
  static var(n) { return P.atomo(atomoVar(n)); }
  clone() { const p = new P(); for (const [k, v] of this.t) p.t.set(k, { c: v.c, m: v.m }); return p; }
  get vazio() { return this.t.size === 0; }
  get termos() { return [...this.t.values()]; }

  addTerm(term) {
    const n = normalizarTermo(term);
    if (!n) return this;
    if (n.extra) { // termo virou soma (expansão de caixa)
      for (const tt of n.extra.termos) this.addTerm(tt);
      return this;
    }
    const k = chaveMono(n.m);
    const ex = this.t.get(k);
    if (ex) {
      const c = ex.c.add(n.c);
      if (c.isZero) this.t.delete(k); else this.t.set(k, { c, m: ex.m });
    } else if (!n.c.isZero) this.t.set(k, n);
    if (this.t.size > LIMITE_TERMOS) throw new ErroMat('A expressão ficou grande demais para expandir.');
    return this;
  }
  add(o) { const p = this.clone(); for (const tt of o.termos) p.addTerm(tt); return p; }
  neg() { const p = new P(); for (const [k, v] of this.t) p.t.set(k, { c: v.c.neg(), m: v.m }); return p; }
  sub(o) { return this.add(o.neg()); }
  mulQ(q) { q = Q.of(q); if (q.isZero) return new P(); const p = new P(); for (const [k, v] of this.t) p.t.set(k, { c: v.c.mul(q), m: v.m }); return p; }
  mul(o) {
    let p = new P();
    for (const a of this.termos) for (const b of o.termos) p.addTerm({ c: a.c.mul(b.c), m: juntar(a.m, b.m) });
    return p;
  }
  // constante racional?
  get eQ() { return this.t.size === 0 || (this.t.size === 1 && this.t.has('')); }
  get q() { return this.t.size === 0 ? Q.ZERO : this.t.get('')?.c ?? null; }
  get eMono() { return this.t.size === 1; }

  temAtomo(pred) { for (const tt of this.termos) for (const [k] of tt.m) if (pred(k, ATOMOS.get(k))) return true; return false; }
  temVar(v) {
    return this.temAtomo((k, info) => (info.tipo === 'var' && (!v || info.n === v)) || (info.tipo === 'caixa' && A.temVar(info.node, v)));
  }
  get constante() { return !this.temVar(); }

  pow(q) {
    q = Q.of(q);
    if (q.isZero) {
      if (this.vazio) throw new ErroMat('0⁰ é uma indeterminação.');
      return P.c(1);
    }
    if (this.vazio) {
      if (q.isNeg) throw new ErroMat('Divisão por zero não existe.');
      return new P();
    }
    if (this.eMono) {
      const t = this.termos[0];
      const cpow = potenciaCoef(t.c, q);
      return cpow.mul(P.mono(t.m.map(([k, e]) => [k, e.mul(q)])));
    }
    if (q.isInt && !q.isNeg) {
      const n = Number(q.n);
      if (n > 40) throw new ErroMat('Expoente grande demais para expandir.');
      let r = P.c(1), b = this.clone(), e = n;
      while (e > 0) { if (e & 1) r = r.mul(b); e >>= 1; if (e) b = b.mul(b); }
      return r;
    }
    // soma elevada a expoente negativo/fracionário: vira caixa
    const pos = this.positivo();
    const k = atomoCaixa(pos.p.toAST(), pos.p);
    let r = P.atomo(k, q);
    if (pos.sinal < 0) {
      if (!q.isInt) {
        if (q.d % 2n === 0n) throw new ErroMat('Raiz de índice par de número negativo não é real.');
      }
      if (q.isInt ? q.n % 2n !== 0n : q.n % 2n !== 0n) r = r.neg();
    }
    return r;
  }

  // normaliza o sinal: faz o primeiro termo ficar positivo
  positivo() {
    const ord = this.ordenados();
    if (ord.length && ord[0].c.isNeg) return { p: this.neg(), sinal: -1 };
    return { p: this, sinal: 1 };
  }

  static mono(m) { const p = new P(); return p.addTerm({ c: Q.ONE, m }); }

  div(o) {
    if (o.vazio) throw new ErroMat('Divisão por zero não existe.');
    if (o.eMono) return this.mul(o.pow(-1));
    // tenta divisão exata de polinômios em uma variável
    const vs = [...new Set([...this.vars(), ...o.vars()])];
    if (vs.length === 1) {
      const v = vs[0];
      const a = this.coefsQ(v), b = o.coefsQ(v);
      if (a && b) {
        const g = mdcPoli(a, b);
        if (g.length > 1) {
          const a2 = divPoli(a, g).q, b2 = divPoli(b, g).q;
          const N = P.dePoli(a2, v), D = P.dePoli(b2, v);
          if (D.eMono) return N.mul(D.pow(-1));
          return N.mul(D.pow(-1));
        }
      }
    }
    return this.mul(o.pow(-1));
  }

  vars() { const s = new Set(); for (const tt of this.termos) for (const [k] of tt.m) { const i = ATOMOS.get(k); if (i.tipo === 'var') s.add(i.n); } return s; }

  // coeficientes racionais do polinômio em v (grau → Q), ou null se não for polinômio racional em v
  coefsQ(v) {
    const kv = 'v:' + v;
    const arr = [];
    for (const tt of this.termos) {
      let g = 0;
      for (const [k, e] of tt.m) {
        if (k !== kv) return null;
        if (!e.isInt || e.isNeg) return null;
        g = Number(e.n);
      }
      if (g > 60) return null;
      while (arr.length <= g) arr.push(Q.ZERO);
      arr[g] = arr[g].add(tt.c);
    }
    while (arr.length > 1 && arr[arr.length - 1].isZero) arr.pop();
    if (!arr.length) arr.push(Q.ZERO);
    return arr;
  }

  // coeficientes (em P, sem v) do polinômio em v; null se v aparece de outro jeito
  coefsP(v) {
    const kv = 'v:' + v;
    const map = new Map();
    for (const tt of this.termos) {
      let g = 0;
      const resto = [];
      for (const [k, e] of tt.m) {
        if (k === kv) {
          if (!e.isInt || e.isNeg) return null;
          g = Number(e.n);
        } else {
          const info = ATOMOS.get(k);
          if (info.tipo === 'caixa' && A.temVar(info.node, v)) return null;
          resto.push([k, e]);
        }
      }
      if (!map.has(g)) map.set(g, new P());
      map.get(g).addTerm({ c: tt.c, m: resto });
    }
    const grau = Math.max(0, ...map.keys());
    const arr = [];
    for (let i = 0; i <= grau; i++) arr.push(map.get(i) || new P());
    return arr;
  }

  static dePoli(arr, v) {
    let p = new P();
    arr.forEach((c, i) => { if (!c.isZero) p.addTerm({ c, m: i ? [[atomoVar(v), new Q(BigInt(i))]] : [] }); });
    return p;
  }

  grauEm(v) {
    let g = 0;
    for (const tt of this.termos) for (const [k, e] of tt.m) if (k === 'v:' + v) g = Math.max(g, e.toNumber());
    return g;
  }

  ordenados(vPrincipal) {
    const vp = vPrincipal || [...this.vars()].sort()[0];
    const grau = (tt) => {
      let g = 0;
      for (const [k, e] of tt.m) { const i = ATOMOS.get(k); if (i.tipo === 'var' && i.n === vp) g += e.toNumber() * 1000; else if (i.tipo === 'var') g += e.toNumber(); else if (i.tipo === 'caixa') g += 0.5; }
      return g;
    };
    return this.termos.sort((a, b) => grau(b) - grau(a) || (chaveMono(a.m) < chaveMono(b.m) ? -1 : 1));
  }

  toAST(vPrincipal) {
    const ts = this.ordenados(vPrincipal);
    if (!ts.length) return A.num(0);
    let r = null;
    for (const tt of ts) {
      const neg = tt.c.isNeg;
      const node = termoAST({ c: neg ? tt.c.neg() : tt.c, m: tt.m });
      if (!r) r = neg ? (node.t === 'num' ? A.num(tt.c) : A.neg(node)) : node;
      else r = neg ? A.sub(r, node) : A.add(r, node);
    }
    return r;
  }
  latex(v) { return A.latex(this.toAST(v)); }

  // tem denominador com variável (x^-1, (x+1)^-1)?
  temDenominador() {
    return this.termos.some((tt) => tt.m.some(([k, e]) => {
      const i = ATOMOS.get(k);
      return e.isNeg && (i.tipo === 'var' || (i.tipo === 'caixa' && i.base));
    }));
  }

  // junta tudo numa fração só: N/D (com cancelamento quando dá)
  fracao() {
    const maxNeg = new Map();
    for (const tt of this.termos) for (const [k, e] of tt.m) {
      const i = ATOMOS.get(k);
      if (e.isNeg && e.isInt && (i.tipo === 'var' || (i.tipo === 'caixa' && i.base))) {
        const a = e.neg();
        if (!maxNeg.has(k) || maxNeg.get(k).cmp(a) < 0) maxNeg.set(k, a);
      }
    }
    if (!maxNeg.size) return { N: this, D: P.c(1) };
    let D = P.c(1);
    let N = this;
    for (const [k, e] of maxNeg) {
      const i = ATOMOS.get(k);
      D = D.mul(i.tipo === 'var' ? P.atomo(k, e) : i.base.pow(e));
      const N2 = new P();
      for (const tt of N.termos) N2.addTerm({ c: tt.c, m: juntar(tt.m, [[k, e]]) });
      N = N2;
    }
    // cancela fator comum (uma variável, coeficientes racionais)
    const vs = [...new Set([...N.vars(), ...D.vars()])];
    if (vs.length === 1) {
      const v = vs[0];
      const a = N.coefsQ(v), b = D.coefsQ(v);
      if (a && b) {
        const g = mdcPoli(a, b);
        if (g.length > 1) { N = P.dePoli(divPoli(a, g).q, v); D = P.dePoli(divPoli(b, g).q, v); }
        // deixa o denominador com coeficiente líder positivo e inteiros
        const bb = D.coefsQ(v);
        if (bb) {
          const lc = bb[bb.length - 1];
          let f = lc.isNeg ? Q.MINUS_ONE : Q.ONE;
          let den = 1n;
          for (const c of [...bb, ...(N.coefsQ(v) || [])]) den = den * c.d / mdcBigLocal(den, c.d);
          f = f.mul(new Q(den));
          N = N.mulQ(f); D = D.mulQ(f);
          const nb = D.coefsQ(v), na = N.coefsQ(v);
          let g2 = 0n;
          for (const c of [...nb, ...(na || [])]) g2 = mdcBigLocal(g2, c.n);
          if (g2 > 1n) { N = N.mulQ(new Q(1n, g2)); D = D.mulQ(new Q(1n, g2)); }
        }
      }
    }
    if (D.eQ) return { N: N.mulQ(D.q.inv()), D: P.c(1) };
    return { N, D };
  }

  // AST bonito: fração única quando há denominadores com variável
  toASTBonito(v) {
    if (!this.temDenominador()) return this.toAST(v);
    const { N, D } = this.fracao();
    if (D.eQ) return N.toAST(v);
    return A.dvd(N.toAST(v), D.toAST(v), true);
  }
  igual(o) { return this.sub(o).vazio; }

  // valor numérico (todos os átomos constantes)
  numero(amb = {}) { return A.avaliar(this.toAST(), amb); }
}

function mdcBigLocal(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; }

function chaveMono(m) { return m.map(([k, e]) => k + '^' + e.toString()).join('*'); }

function juntar(a, b) {
  const map = new Map(a.map(([k, e]) => [k, e]));
  for (const [k, e] of b) map.set(k, (map.get(k) || Q.ZERO).add(e));
  return [...map.entries()];
}

// coeficiente racional elevado a q: pode gerar raízes (átomos numéricos)
function potenciaCoef(c, q) {
  if (q.isInt) return P.c(c.powInt(q.n));
  if (c.isZero) { if (q.isNeg) throw new ErroMat('Divisão por zero não existe.'); return new P(); }
  let sinal = 1;
  if (c.isNeg) {
    if (q.d % 2n === 0n) throw new ErroMat('Raiz de índice par de número negativo não é real.');
    c = c.neg();
    if (q.n % 2n !== 0n) sinal = -1;
  }
  const m = [];
  if (c.n > 10n ** 15n || c.d > 10n ** 15n) {
    // grande demais para fatorar: caixa numérica
    const k = atomoCaixa(A.num(c), null);
    return P.atomo(k, q).mulQ(sinal);
  }
  for (const [p, e] of fatorar(c.n)) m.push([atomoNum(p), q.mul(e)]);
  for (const [p, e] of fatorar(c.d)) m.push([atomoNum(p), q.mul(-e)]);
  return P.mono(m).mulQ(sinal);
}

// Normaliza um termo: junta expoentes, tira raízes inteiras para o coeficiente, i² = -1, expande caixas
function normalizarTermo({ c, m }) {
  if (c.isZero) return null;
  const map = new Map();
  for (const [k, e] of m) map.set(k, (map.get(k) || Q.ZERO).add(e));
  let coef = c;
  const out = [];
  let extra = null;
  for (let [k, e] of map) {
    if (e.isZero) continue;
    const info = ATOMOS.get(k);
    if (info.tipo === 'num') {
      // p^(a/b) → p^floor · p^(resto)
      const fl = floorQ(e);
      if (fl !== 0n) { coef = coef.mul(new Q(info.p).powInt(fl)); e = e.sub(new Q(fl)); }
      if (e.isZero) continue;
    } else if (info.tipo === 'const' && info.n === 'i') {
      if (e.isInt) {
        const r = ((e.n % 4n) + 4n) % 4n;
        if (r === 2n || r === 3n) coef = coef.neg();
        if (r === 0n || r === 2n) continue;
        e = Q.ONE;
      }
    } else if (info.tipo === 'caixa' && info.base && e.isInt && !e.isNeg) {
      // (soma)^n com n inteiro positivo: expande
      const b = info.base.pow(e);
      extra = extra ? extra.mul(b) : b;
      continue;
    }
    out.push([k, e]);
  }
  out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (extra) {
    const p = new P().addTerm({ c: coef, m: out });
    return { extra: p.mul(extra) };
  }
  return { c: coef, m: out };
}

function floorQ(q) {
  const f = q.n / q.d;
  return q.n < 0n && f * q.d !== q.n ? f - 1n : f;
}

// ---------- termo → AST ----------
function termoAST({ c, m }) {
  const numF = [], denF = [];
  // raízes numéricas agrupadas por índice
  const raizes = new Map(); // índice → produto
  for (const [k, e] of m) {
    const info = ATOMOS.get(k);
    if (info.tipo === 'num') {
      const idx = e.d; // e em (0,1)
      const v = info.p ** e.n;
      raizes.set(idx, (raizes.get(idx) || 1n) * v);
    }
  }
  for (const [idx, v] of [...raizes.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    numF.push(A.sqrt(A.num(v), idx === 2n ? undefined : A.num(idx)));
  }
  const ordemTipo = { const: 1, var: 2, caixa: 3 };
  const resto = m.filter(([k]) => ATOMOS.get(k).tipo !== 'num')
    .sort((a, b) => ordemTipo[ATOMOS.get(a[0]).tipo] - ordemTipo[ATOMOS.get(b[0]).tipo] || (a[0] < b[0] ? -1 : 1));
  for (const [k, e] of resto) {
    const info = ATOMOS.get(k);
    const base = info.tipo === 'var' ? A.vr(info.n) : info.tipo === 'const' ? A.cst(info.n) : info.node;
    const alvo = e.isNeg ? denF : numF;
    const ee = e.abs();
    alvo.push(potAST(base, ee));
  }
  const cn = new Q(c.n), cd = new Q(c.d);
  const prod = (fs) => fs.reduce((a, b) => (a ? A.mul(a, b, true) : b), null);
  let N = prod(numF), D = prod(denF);
  if (!cd.isOne) D = D ? A.mul(A.num(cd), D, true) : A.num(cd);
  if (!N) N = A.num(cn);
  else if (!cn.isOne) N = A.mul(A.num(cn), N, true);
  if (D) return A.dvd(N, D, true);
  return N;
}

function potAST(base, e) {
  if (e.isOne) return base;
  if (e.eq(new Q(1n, 2n))) return A.sqrt(base);
  if (e.n === 1n && e.d <= 9n) return A.sqrt(base, A.num(e.d));
  if (!e.isInt && e.d <= 9n) return A.sqrt(A.pow(base, A.num(e.n)), e.d === 2n ? undefined : A.num(e.d));
  return A.pow(base, A.num(e));
}

// ---------- AST → forma normal ----------
export function deAST(node, opts = {}) {
  const r = (n) => deAST(n, opts);
  switch (node.t) {
    case 'num': return P.c(node.v);
    case 'var': return P.var(node.n);
    case 'const':
      if (node.n === 'inf') throw new ErroMat('Infinito não é um número: use-o só em limites.');
      return P.atomo(atomoConst(node.n));
    case '+': return r(node.l).add(r(node.r));
    case '-': return r(node.l).sub(r(node.r));
    case '*': return r(node.l).mul(r(node.r));
    case '/': return r(node.l).div(r(node.r));
    case 'neg': return r(node.a).neg();
    case '^': {
      const b = r(node.l), e = r(node.r);
      if (e.eQ) return b.pow(e.q);
      // e^(algo)
      if (b.eMono && b.termos[0].c.isOne && b.termos[0].m.length === 1 && b.termos[0].m[0][0] === 'c:e' && b.termos[0].m[0][1].isOne) {
        return funcao('exp', e, opts);
      }
      // 2^(1/2+x) etc.: caixa
      const no = A.pow(b.toAST(), e.toAST());
      return P.atomo(atomoCaixa(no, null));
    }
    case 'sqrt': {
      const a = r(node.a);
      if (!node.idx) return a.pow(new Q(1n, 2n));
      const k = r(node.idx);
      if (!k.eQ || !k.q.isInt || k.q.sign() <= 0) throw new ErroMat('O índice da raiz deve ser um inteiro positivo.');
      return a.pow(new Q(1n, k.q.n));
    }
    case 'pct': return r(node.a).mulQ(new Q(1n, 100n));
    case 'grau': return r(node.a).mul(P.atomo(atomoConst('pi'))).mulQ(new Q(1n, 180n));
    case 'abs': {
      const a = r(node.a);
      if (a.constante) {
        const v = a.numero();
        if (!isFinite(v)) throw new ErroMat('Valor indefinido.');
        return v < 0 ? a.neg() : a;
      }
      return P.atomo(atomoCaixa({ t: 'abs', a: a.toAST() }, null));
    }
    case 'fact': {
      const a = r(node.a);
      if (a.eQ && a.q.isInt && !a.q.isNeg) {
        if (a.q.n > 3000n) throw new ErroMat('Fatorial grande demais.');
        let f = 1n; for (let i = 2n; i <= a.q.n; i++) f *= i;
        return P.c(f);
      }
      throw new ErroMat('Fatorial só de números inteiros não negativos.');
    }
    case 'fn': {
      let a = r(node.a);
      if (opts.graus && ['sin', 'cos', 'tan', 'cot', 'sec', 'csc'].includes(node.n) && !a.temAtomo((k) => k === 'c:pi') && !temGrau(node.a)) {
        a = a.mul(P.atomo(atomoConst('pi'))).mulQ(new Q(1n, 180n));
      }
      return funcao(node.n, a, opts, node.base ? r(node.base) : null);
    }
    default:
      throw new ErroMat('Isso não é uma expressão simples (é uma equação, integral ou limite).');
  }
}

function temGrau(n) {
  if (!n || typeof n !== 'object') return false;
  if (n.t === 'grau') return true;
  return ['l', 'r', 'a'].some((k) => n[k] && temGrau(n[k]));
}

// valores exatos de seno/cosseno em múltiplos de π/6 e π/4
const SEN = { '0': [0n, 1n, 1n], '1/6': [1n, 2n, 1n], '1/4': [1n, 2n, 2n], '1/3': [1n, 2n, 3n], '1/2': [1n, 1n, 1n], '2/3': [1n, 2n, 3n], '3/4': [1n, 2n, 2n], '5/6': [1n, 2n, 1n] };
// [a, b, r] = (a/b)·√r
function valorTrig(nome, a) {
  let k = null;
  if (a.vazio) k = Q.ZERO;
  else if (a.eMono && a.termos[0].m.length === 1 && a.termos[0].m[0][0] === 'c:pi' && a.termos[0].m[0][1].isOne) k = a.termos[0].c;
  if (!k) return null;
  const mod2 = (u) => u.sub(new Q(floorQ(u.div(2)) * 2n));
  const senDe = (u) => {
    u = mod2(u);
    let s = 1;
    if (u.cmp(1) >= 0) { u = u.sub(1); s = -1; }
    const e = SEN[u.toString()];
    if (!e) return null;
    let p = P.c(new Q(e[0], e[1]));
    if (e[2] !== 1n) p = p.mul(P.c(e[2]).pow(new Q(1n, 2n)));
    return s < 0 ? p.neg() : p;
  };
  const S = senDe(k), C = senDe(k.add(new Q(1n, 2n)));
  if (S === null || C === null) return null;
  switch (nome) {
    case 'sin': return S;
    case 'cos': return C;
    case 'tan': if (C.vazio) throw new ErroMat('Tangente não existe nesse ângulo (cosseno zero).'); return S.div(C);
    case 'cot': if (S.vazio) throw new ErroMat('Cotangente não existe nesse ângulo.'); return C.div(S);
    case 'sec': if (C.vazio) throw new ErroMat('Secante não existe nesse ângulo.'); return C.pow(-1);
    case 'csc': if (S.vazio) throw new ErroMat('Cossecante não existe nesse ângulo.'); return S.pow(-1);
  }
  return null;
}

function funcao(nome, a, opts, base) {
  if (['sin', 'cos', 'tan', 'cot', 'sec', 'csc'].includes(nome)) {
    const v = valorTrig(nome, a);
    if (v) return v;
  }
  if (nome === 'exp') {
    if (a.vazio) return P.c(1);
    // e^(ln u) = u
    if (a.eMono && a.termos[0].c.isOne && a.termos[0].m.length === 1) {
      const info = ATOMOS.get(a.termos[0].m[0][0]);
      if (info.tipo === 'caixa' && info.node.t === 'fn' && info.node.n === 'ln' && a.termos[0].m[0][1].isOne) return deAST(info.node.a, opts);
    }
    if (a.eQ && a.q.isInt) return P.atomo(atomoConst('e'), a.q);
    const k = atomoCaixa(A.fn('exp', a.toAST()), null);
    return P.atomo(k);
  }
  if (nome === 'ln' || nome === 'log') {
    if (a.eQ && a.q.sign() <= 0) throw new ErroMat('Logaritmo só existe para números positivos.');
    if (a.eQ && a.q.isOne) return new P();
    const b = nome === 'ln' ? P.atomo(atomoConst('e')) : base || P.c(10);
    if (nome === 'ln' && a.eMono && a.termos[0].c.isOne && a.termos[0].m.length === 1 && a.termos[0].m[0][0] === 'c:e') return P.c(a.termos[0].m[0][1]);
    if (a.constante && b.eQ) {
      // log_b(a) racional? testa b^k = a
      const v = Math.log(a.numero()) / Math.log(b.q.toNumber());
      const k = Q.fromFloat(v, 100n);
      if (k && b.pow(k).igual(a)) return P.c(k);
    }
    if (b.eQ && (b.q.sign() <= 0 || b.q.isOne)) throw new ErroMat('A base do logaritmo deve ser positiva e diferente de 1.');
    const no = nome === 'ln' ? A.fn('ln', a.toAST()) : base ? A.fn('log', a.toAST(), b.toAST()) : A.fn('log', a.toAST());
    return P.atomo(atomoCaixa(no, null));
  }
  if (['asin', 'acos', 'atan'].includes(nome) && a.eQ) {
    const v = a.q;
    const tab = { asin: { '0': '0', '1/2': '1/6', '1': '1/2', '-1/2': '-1/6', '-1': '-1/2' }, acos: { '1': '0', '1/2': '1/3', '0': '1/2', '-1/2': '2/3', '-1': '1' }, atan: { '0': '0', '1': '1/4', '-1': '-1/4' } };
    const k = tab[nome][v.toString()];
    if (k !== undefined) {
      const [n, d] = k.split('/');
      const kk = new Q(BigInt(n), BigInt(d || 1));
      return P.atomo(atomoConst('pi')).mulQ(kk);
    }
  }
  const no = A.fn(nome, a.toAST());
  return P.atomo(atomoCaixa(no, null));
}

// ---------- polinômios em uma variável (coeficientes Q, índice = grau) ----------
export function divPoli(a, b) {
  a = a.slice(); const q = [];
  const db = b.length - 1;
  if (db < 0 || (db === 0 && b[0].isZero)) throw new ErroMat('Divisão por zero.');
  const lb = b[db];
  for (let i = a.length - 1 - db; i >= 0; i--) {
    const c = a[i + db].div(lb);
    q[i] = c;
    for (let j = 0; j <= db; j++) a[i + j] = a[i + j].sub(c.mul(b[j]));
  }
  for (let i = 0; i < q.length; i++) if (!q[i]) q[i] = Q.ZERO;
  let r = a.slice(0, Math.max(1, db));
  while (r.length > 1 && r[r.length - 1].isZero) r.pop();
  if (!q.length) q.push(Q.ZERO);
  return { q, r };
}
export function mdcPoli(a, b) {
  const lim = (p) => { p = p.slice(); while (p.length > 1 && p[p.length - 1].isZero) p.pop(); return p; };
  a = lim(a); b = lim(b);
  while (!(b.length === 1 && b[0].isZero)) {
    const { r } = divPoli(a, b);
    a = b; b = lim(r);
  }
  const lc = a[a.length - 1];
  return a.map((c) => c.div(lc));
}

export function polyDeAST(node, opts) { return deAST(node, opts); }
export function simplificarAST(node, opts = {}, v) { return deAST(node, opts).toAST(v); }
