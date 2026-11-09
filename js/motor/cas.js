// Adaptador para o nerdamer (motor simbólico de apoio, offline).
// Só é usado quando o motor passo a passo não dá conta; todo resultado é conferido.
import * as A from './ast.js';
import { analisar } from './parser.js';

function q(n) { return n.v.isInt ? `(${n.v.n})` : `(${n.v.n}/${n.v.d})`; }

export function paraNerd(n) {
  const r = paraNerd;
  switch (n.t) {
    case 'num': return q(n);
    case 'var': return n.n;
    case 'const': return { pi: 'pi', e: 'e' }[n.n] || (() => { throw new Error('const'); })();
    case '+': return `(${r(n.l)}+${r(n.r)})`;
    case '-': return `(${r(n.l)}-${r(n.r)})`;
    case '*': return `(${r(n.l)}*${r(n.r)})`;
    case '/': return `(${r(n.l)}/${r(n.r)})`;
    case '^': return `(${r(n.l)})^(${r(n.r)})`;
    case 'neg': return `(-${r(n.a)})`;
    case 'sqrt': return n.idx ? `(${r(n.a)})^(1/${r(n.idx)})` : `sqrt(${r(n.a)})`;
    case 'abs': return `abs(${r(n.a)})`;
    case 'fn': {
      const a = r(n.a);
      if (n.n === 'ln') return `log(${a})`;
      if (n.n === 'log') return `(log(${a})/log(${n.base ? r(n.base) : '10'}))`;
      if (n.n === 'exp') return `e^(${a})`;
      return `${n.n}(${a})`;
    }
    default: throw new Error('Não convertível: ' + n.t);
  }
}

export function deNerd(s) {
  if (/integrate|limit|diff|\bi\b|Infinity|NaN|undefined/.test(s)) return null;
  const t = s.replace(/\blog\(/g, 'ln(').replace(/\babs\(/g, 'abs(');
  try { return analisar(t); } catch { return null; }
}

export function criarCAS(nerdamer) {
  if (!nerdamer) return null;
  return {
    integrar(f, v) {
      try {
        const res = nerdamer(`integrate(${paraNerd(f)},${v})`).toString();
        return deNerd(res);
      } catch { return null; }
    },
    resolver(eq, v) {
      try {
        const s = nerdamer.solve(`${paraNerd(eq.l)}=${paraNerd(eq.r)}`, v).toString();
        return s;
      } catch { return null; }
    },
  };
}
