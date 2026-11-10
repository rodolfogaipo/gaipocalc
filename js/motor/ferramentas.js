// MMC, MDC e fatoração em primos — com o "método da escadinha".
import { Q, ErroMat, fatorar, mdcBig, mmcBig } from './racional.js';
import * as A from './ast.js';
import { deAST } from './poli.js';

function inteiros(args) {
  return args.map((a) => {
    const p = deAST(a);
    if (!p.eQ || !p.q.isInt) throw new ErroMat('MMC, MDC e fatoração só com números inteiros.');
    return p.q.n < 0n ? -p.q.n : p.q.n;
  });
}

function escadinha(nums) {
  // divide todos pelos primos em ordem, como no caderno
  const linhas = [];
  let atual = nums.slice();
  let guard = 0;
  while (atual.some((n) => n > 1n) && guard++ < 200) {
    const primos = [...new Set(atual.flatMap((n) => [...fatorar(n).keys()]))].sort((a, b) => (a < b ? -1 : 1));
    const p = primos[0];
    linhas.push({ nums: atual.slice(), p, todos: atual.every((n) => n % p === 0n) });
    atual = atual.map((n) => (n % p === 0n ? n / p : n));
  }
  linhas.push({ nums: atual.slice(), p: null });
  return linhas;
}

function tabelaLatex(linhas) {
  const n = linhas[0].nums.length;
  const rows = linhas.map((l) => `${l.nums.join(',\\ ')} & ${l.p ? (l.todos && n > 1 ? `\\boxed{${l.p}}` : l.p) : ''}`);
  return `\\begin{array}{r|l}${rows.join('\\\\')}\\end{array}`;
}

function potencias(f) {
  return [...f.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([p, e]) => (e > 1 ? `${p}^{${e}}` : `${p}`)).join('\\cdot ');
}

import { estatistica } from './estatistica.js';
import { combinatoria } from './extras.js';

const ESTAT = { media: 'media', mediana: 'mediana', moda: 'moda', variancia: 'variancia', desvio: 'desvio', amplitude: 'amplitude', estatistica: 'tudo' };

export function ferramenta(node) {
  const nome = node.n;
  if (ESTAT[nome]) {
    const xs = node.args.map((a) => { const p = deAST(a); if (!p.eQ) throw new ErroMat('Estatística só com números.'); return p.q; });
    return estatistica(xs, ESTAT[nome]);
  }
  if (nome === 'comb' || nome === 'arranjo' || nome === 'perm') {
    const xs = node.args.map((a) => { const p = deAST(a); if (!p.eQ) throw new ErroMat('Use números inteiros.'); return p.q; });
    if (nome !== 'perm' && xs.length !== 2) throw new ErroMat(`Use ${nome}(n; p).`);
    return combinatoria(nome, xs[0], xs[1]);
  }
  const nums = inteiros(node.args);
  if (nome === 'fatorar') {
    if (nums.length !== 1) throw new ErroMat('Use fatorar(n) com um número só.');
    const n = nums[0];
    if (n < 2n) throw new ErroMat('Fatoração em primos é para números maiores que 1.');
    const lin = escadinha([n]);
    const f = fatorar(n);
    const passos = [
      { titulo: 'Divisões sucessivas', texto: 'Dividimos pelo menor primo possível até chegar em 1.', latex: tabelaLatex(lin) },
      { titulo: 'Juntando os primos', texto: 'O número é o produto dos primos da coluna da direita.', latex: `${n}=${potencias(f)}` },
    ];
    const primo = f.size === 1 && [...f.values()][0] === 1;
    return { tipo: 'ferramenta', titulo: 'Fatoração em primos', entrada: A.latex(node), resposta: primo ? `${n}\\text{ é primo}` : `${n}=${potencias(f)}`, passos };
  }
  if (nums.length < 2) throw new ErroMat(`Use ${nome}(a; b) com pelo menos dois números.`);
  if (nums.some((x) => x === 0n)) throw new ErroMat('Use números diferentes de zero.');
  const lin = escadinha(nums);
  if (nome === 'mmc') {
    const m = nums.reduce((a, b) => mmcBig(a, b));
    const fat = lin.filter((l) => l.p).map((l) => l.p);
    const passos = [
      { titulo: 'Escadinha', texto: 'Dividimos todos os números pelos primos, um de cada vez, até todos virarem 1. Quem não divide desce igual.', latex: tabelaLatex(lin) },
      { titulo: 'Multiplicando os primos', texto: 'O MMC é o produto de todos os primos da direita.', latex: `\\operatorname{mmc}=${fat.join('\\cdot ')}=${m}` },
    ];
    return { tipo: 'ferramenta', titulo: 'MMC (mínimo múltiplo comum)', entrada: A.latex(node), resposta: `\\operatorname{mmc}(${nums.join(';\\ ')})=${m}`, passos };
  }
  if (nome === 'mdc') {
    const g = nums.reduce((a, b) => mdcBig(a, b));
    const comuns = lin.filter((l) => l.p && l.todos).map((l) => l.p);
    const passos = [
      { titulo: 'Escadinha', texto: 'Fazemos a escadinha e marcamos os primos que dividiram TODOS os números ao mesmo tempo.', latex: tabelaLatex(lin) },
      { titulo: 'Primos comuns', texto: 'O MDC é o produto só dos primos marcados.', latex: comuns.length ? `\\operatorname{mdc}=${comuns.join('\\cdot ')}=${g}` : '\\operatorname{mdc}=1' },
    ];
    if (nums.length === 2) {
      // Euclides
      let [a, b] = nums[0] >= nums[1] ? nums : [nums[1], nums[0]];
      const div = [];
      while (b) { div.push(`${a}=${a / b}\\cdot ${b}+${a % b}`); [a, b] = [b, a % b]; }
      passos.push({ titulo: 'Conferindo por Euclides', texto: 'Divisões sucessivas: o último resto diferente de zero é o MDC.', latex: `\\begin{array}{l}${div.join('\\\\')}\\end{array}` });
    }
    return { tipo: 'ferramenta', titulo: 'MDC (máximo divisor comum)', entrada: A.latex(node), resposta: `\\operatorname{mdc}(${nums.join(';\\ ')})=${g}`, passos };
  }
  throw new ErroMat('Ferramenta desconhecida.');
}
