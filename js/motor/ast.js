// Árvore da expressão (AST): construtores, LaTeX e avaliação numérica.
import { Q, ErroMat, formatNum } from './racional.js';

export const num = (v, dec = false) => ({ t: 'num', v: Q.of(v), dec });
export const vr = (n) => ({ t: 'var', n });
export const cst = (n) => ({ t: 'const', n });
export const bin = (t, l, r, extra) => ({ t, l, r, ...(extra || {}) });
export const add = (l, r) => bin('+', l, r);
export const sub = (l, r) => bin('-', l, r);
export const mul = (l, r, impl = false) => bin('*', l, r, impl ? { impl: true } : undefined);
export const dvd = (l, r, frac = true) => bin('/', l, r, { frac });
export const pow = (l, r) => bin('^', l, r);
export const neg = (a) => ({ t: 'neg', a });
export const fn = (n, a, base) => (base ? { t: 'fn', n, a, base } : { t: 'fn', n, a });
export const sqrt = (a, idx) => (idx ? { t: 'sqrt', a, idx } : { t: 'sqrt', a });

export const FUNCOES = {
  sin: '\\sin', cos: '\\cos', tan: '\\tan', cot: '\\cot', sec: '\\sec', csc: '\\csc',
  asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan',
  sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
  ln: '\\ln', log: '\\log', exp: '\\exp',
};

export function isNum(n) { return n && n.t === 'num'; }
export function isConstExpr(n) { return !temVar(n); }

export function temVar(n, v) {
  if (!n || typeof n !== 'object') return false;
  if (n.t === 'var') return v ? n.n === v : true;
  for (const k of ['l', 'r', 'a', 'idx', 'base', 'f']) if (n[k] && temVar(n[k], v)) return true;
  if (n.args) return n.args.some((x) => temVar(x, v));
  return false;
}

export function variaveis(n, s = new Set()) {
  if (!n || typeof n !== 'object') return s;
  if (n.t === 'var') s.add(n.n);
  for (const k of ['l', 'r', 'a', 'idx', 'base', 'f']) if (n[k]) variaveis(n[k], s);
  if (n.args) n.args.forEach((x) => variaveis(x, s));
  if (n.eqs) n.eqs.forEach((x) => variaveis(x, s));
  return s;
}

// ---------- LaTeX ----------
const PREC = { '+': 1, '-': 1, neg: 2, '*': 3, '/': 3, '^': 5, fact: 6, pct: 6, grau: 6 };
function prec(n) {
  if (n.t === 'num') return n.v.isNeg ? 2 : n.v.isInt || n.dec ? 9 : 3;
  return PREC[n.t] ?? 9;
}
const paren = (s) => `\\left(${s}\\right)`;

function numLatex(n) {
  if (n.dec) {
    const d = n.v.toDecimal(12);
    if (d.exata) return d.txt.replace(',', '{,}');
  }
  return n.v.toLatex();
}

export function latex(n) {
  if (!n) return '';
  switch (n.t) {
    case 'num': return numLatex(n);
    case 'var': return n.n.length > 1 ? `\\mathrm{${n.n}}` : n.n;
    case 'const': return { pi: '\\pi', e: 'e', i: 'i', inf: '\\infty' }[n.n] || n.n;
    case '+': {
      const L = latex(n.l);
      const R = latex(n.r);
      if (R.startsWith('-')) return `${L}+${paren(R)}`;
      return `${L}+${R}`;
    }
    case '-': {
      const L = latex(n.l);
      let R = latex(n.r);
      if (prec(n.r) <= 2 || R.startsWith('-')) R = paren(R);
      return `${L}-${R}`;
    }
    case '*': {
      let L = latex(n.l), R = latex(n.r);
      const lNeg = n.l.t === 'neg' || (isNum(n.l) && n.l.v.isNeg);
      if (prec(n.l) < 3 && !lNeg) L = paren(L);
      if (lNeg && prec(n.l.t === 'neg' ? n.l.a : n.l) < 3 && n.l.t === 'neg') L = `-${paren(latex(n.l.a))}`;
      const rParen = prec(n.r) <= 2 || R.startsWith('-');
      if (rParen) R = paren(R);
      const lb = n.l.t === 'neg' ? n.l.a : n.l;
      const lParen = L.endsWith('\\right)');
      if (!isNum(n.r) && (rParen ? ['num', 'var', 'const', '/', '^', '*'].includes(lb.t) || lParen : justaposto(lb, n.r) || (lParen && !isNum(n.r)))) return `${L}${R}`;
      return `${L}\\cdot ${R}`;
    }
    case '/': {
      if (n.frac === false) {
        let L = latex(n.l), R = latex(n.r);
        if (prec(n.l) < 3) L = paren(L);
        if (prec(n.r) <= 3) R = paren(R);
        return `${L}\\div ${R}`;
      }
      return `\\frac{${latex(n.l)}}{${latex(n.r)}}`;
    }
    case '^': {
      let B = latex(n.l);
      const base = n.l;
      const simples = (base.t === 'num' && base.v.isInt && !base.v.isNeg) || base.t === 'var' || base.t === 'const';
      if (!simples) B = paren(B);
      if (isNum(n.r) && n.r.v.eq(new Q(1n, 2n)) && false) return `\\sqrt{${latex(n.l)}}`;
      return `${B}^{${latex(n.r)}}`;
    }
    case 'neg': {
      const A = latex(n.a);
      if (prec(n.a) <= 2) return `-${paren(A)}`;
      return `-${A}`;
    }
    case 'fn': {
      if (n.n === 'log' && n.base) return `\\log_{${latex(n.base)}}${paren(latex(n.a))}`;
      if (n.n === 'exp') return `e^{${latex(n.a)}}`;
      const nome = FUNCOES[n.n] || `\\operatorname{${n.n}}`;
      return `${nome}${paren(latex(n.a))}`;
    }
    case 'sqrt': return n.idx ? `\\sqrt[${latex(n.idx)}]{${latex(n.a)}}` : `\\sqrt{${latex(n.a)}}`;
    case 'abs': return `\\left|${latex(n.a)}\\right|`;
    case 'fact': return `${prec(n.a) < 9 ? paren(latex(n.a)) : latex(n.a)}!`;
    case 'pct': return `${prec(n.a) < 9 ? paren(latex(n.a)) : latex(n.a)}\\%`;
    case 'grau': return `${prec(n.a) < 9 ? paren(latex(n.a)) : latex(n.a)}^{\\circ}`;
    case 'eq': return `${latex(n.l)}${{ '=': '=', '<': '<', '>': '>', '<=': '\\le ', '>=': '\\ge ', '!=': '\\ne ' }[n.op]}${latex(n.r)}`;
    case 'sys': return `\\begin{cases}${n.eqs.map(latex).join('\\\\')}\\end{cases}`;
    case 'deriv': return `\\frac{${n.ordem > 1 ? `d^{${n.ordem}}` : 'd'}}{d${n.v}${n.ordem > 1 ? `^{${n.ordem}}` : ''}}${paren(latex(n.f))}`;
    case 'int': {
      const lim = n.a ? `_{${latex(n.a)}}^{${latex(n.b)}}` : '';
      return `\\int${lim} ${prec(n.f) <= 2 ? paren(latex(n.f)) : latex(n.f)}\\,d${n.v}`;
    }
    case 'lim': {
      const lado = n.lado ? `^{${n.lado}}` : '';
      return `\\lim_{${n.v}\\to ${latex(n.to)}${lado}} ${prec(n.f) <= 2 ? paren(latex(n.f)) : latex(n.f)}`;
    }
    case 'call': return `\\operatorname{${n.n}}${paren(n.args.map(latex).join(';\\ '))}`;
    case 'pm': return `${latex(n.l)}\\pm ${latex(n.r)}`;
    case 'raw': return n.s;
    default: throw new Error('latex: tipo desconhecido ' + n.t);
  }
}

// a·b escrito colado (2x, 3\sqrt{2}, x\sin(x))?
function justaposto(l, r) {
  if (r.t === 'num') return false;
  if (r.t === 'neg') return false;
  if (l.t === 'num' || l.t === 'var' || l.t === 'const' || l.t === '/' || (l.t === '^' && l.l.t !== 'num') || l.t === '*') {
    if (r.t === 'var' || r.t === 'const' || r.t === 'fn' || r.t === 'sqrt' || r.t === 'abs') return true;
    if (r.t === '^' && (r.l.t === 'var' || r.l.t === 'const' || r.l.t === 'fn')) return true;
    if (r.t === '*' && justaposto(l, r.l)) return true;
  }
  if (r.t === '+' || r.t === '-') return true; // 2(x+1) — vai entre parênteses
  return false;
}

// ---------- avaliação numérica ----------
export function avaliar(n, amb = {}, opts = {}) {
  const g = opts.graus ? Math.PI / 180 : 1;
  const ev = (x) => avaliar(x, amb, opts);
  switch (n.t) {
    case 'num': return n.v.toNumber();
    case 'var':
      if (n.n in amb) return amb[n.n];
      throw new ErroMat(`A variável ${n.n} não tem valor.`);
    case 'const': return { pi: Math.PI, e: Math.E, inf: Infinity }[n.n] ?? NaN;
    case '+': return ev(n.l) + ev(n.r);
    case '-': return ev(n.l) - ev(n.r);
    case '*': return ev(n.l) * ev(n.r);
    case '/': return ev(n.l) / ev(n.r);
    case '^': {
      const b = ev(n.l), e = ev(n.r);
      if (b < 0 && !Number.isInteger(e)) {
        // raiz ímpar de negativo: (-8)^(1/3) = -2
        const q = Q.fromFloat(e, 1000n);
        if (q && q.d % 2n === 1n) {
          const r = Math.pow(-b, e);
          return q.n % 2n === 0n ? r : -r;
        }
        return NaN;
      }
      return Math.pow(b, e);
    }
    case 'neg': return -ev(n.a);
    case 'sqrt': {
      const a = ev(n.a);
      if (!n.idx) return a < 0 ? NaN : Math.sqrt(a);
      const k = ev(n.idx);
      if (a < 0 && Number.isInteger(k) && k % 2 === 1) return -Math.pow(-a, 1 / k);
      return a < 0 ? NaN : Math.pow(a, 1 / k);
    }
    case 'abs': return Math.abs(ev(n.a));
    case 'fact': {
      const a = ev(n.a);
      if (!Number.isInteger(a) || a < 0) return gamma(a + 1);
      let r = 1; for (let i = 2; i <= a; i++) r *= i; return r;
    }
    case 'pct': return ev(n.a) / 100;
    case 'grau': return (ev(n.a) * Math.PI) / 180 / g;
    case 'fn': {
      const a = ev(n.a);
      switch (n.n) {
        case 'sin': return Math.sin(a * g);
        case 'cos': return Math.cos(a * g);
        case 'tan': return Math.tan(a * g);
        case 'cot': return 1 / Math.tan(a * g);
        case 'sec': return 1 / Math.cos(a * g);
        case 'csc': return 1 / Math.sin(a * g);
        case 'asin': return Math.asin(a) / g;
        case 'acos': return Math.acos(a) / g;
        case 'atan': return Math.atan(a) / g;
        case 'sinh': return Math.sinh(a);
        case 'cosh': return Math.cosh(a);
        case 'tanh': return Math.tanh(a);
        case 'ln': return a <= 0 ? NaN : Math.log(a);
        case 'log': {
          const b = n.base ? ev(n.base) : 10;
          return a <= 0 ? NaN : Math.log(a) / Math.log(b);
        }
        case 'exp': return Math.exp(a);
      }
      throw new ErroMat(`Função ${n.n} desconhecida.`);
    }
    default: throw new ErroMat('Não sei calcular isso numericamente.');
  }
}

function gamma(z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

export function substituir(n, v, por) {
  if (!n || typeof n !== 'object') return n;
  if (n.t === 'var' && n.n === v) return por;
  const c = { ...n };
  for (const k of ['l', 'r', 'a', 'idx', 'base', 'f']) if (n[k]) c[k] = substituir(n[k], v, por);
  if (n.args) c.args = n.args.map((x) => substituir(x, v, por));
  return c;
}

export function iguais(a, b) { return latex(a) === latex(b); }
export { formatNum };
