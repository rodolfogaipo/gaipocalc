// Contas com números, passo a passo na ordem da escola:
// 1) parênteses  2) potências e raízes  3) multiplicações e divisões  4) somas e subtrações
import { Q, ErroMat, mmcBig, mdcBig, raizSimplificada, formatNum } from './racional.js';
import * as A from './ast.js';
import { deAST } from './poli.js';

const L = A.latex;
const lit = (n) => n && n.t === 'num';
const qn = (q, dec) => A.num(q, dec);

const CLASSE = { '^': 1, sqrt: 1, fn: 1, fact: 1, pct: 1, abs: 1, grau: 1, '*': 2, '/': 2, '+': 3, '-': 3 };
const NOME_CLASSE = { 1: 'Potências, raízes e funções', 2: 'Multiplicações e divisões', 3: 'Somas e subtrações' };

export function resolverAritmetica(ast, opts = {}) {
  const passos = [];
  let atual = dobrarNeg(ast);
  const inicio = L(atual);
  let guarda = 0;
  let exato = true;
  while (!lit(atual) && guarda++ < 60) {
    const r = umPasso(atual, opts);
    if (!r) { exato = false; break; }
    atual = dobrarNeg(r.node);
    passos.push({ titulo: r.titulo, texto: r.texto, latex: L(atual), detalhes: r.detalhes });
  }
  let resposta, decimal = null, aproximado = false;
  if (lit(atual)) {
    const q = atual.v;
    resposta = L(atual);
    if (!q.isInt) {
      const d = q.toDecimal(10);
      decimal = (d.exata ? '' : '≈ ') + d.txt;
      if (atual.dec && d.exata) resposta = d.txt.replace(',', '{,}');
      if (!atual.dec && !q.isInt && d.exata && passos.length === 0) {
        passos.push({ titulo: 'Em decimal', texto: 'Dividindo o numerador pelo denominador:', latex: `${q.toLatex()}=${d.txt.replace(',', '{,}')}` });
      }
    }
    if (atual.dec) {
      const d = q.toDecimal(10);
      if (d.exata) { resposta = d.txt.replace(',', '{,}'); decimal = null; }
    }
  } else {
    // terminou com raiz/π/função não exata: simplifica de forma exata e dá o valor aproximado
    let p = null;
    try { p = deAST(atual, opts); } catch (e) { if (!(e instanceof ErroMat)) throw e; throw e; }
    const simp = p.toAST();
    const ls = L(simp);
    if (ls !== L(atual)) passos.push({ titulo: 'Simplificando', texto: 'Juntando e simplificando o que sobrou (forma exata):', latex: ls });
    resposta = ls;
    const v = A.avaliar(simp, {}, opts);
    if (!isFinite(v) || isNaN(v)) throw new ErroMat('O resultado não é um número real.');
    if (!lit(simp)) { decimal = '≈ ' + formatNum(v, 8); aproximado = true; }
  }
  return { tipo: 'aritmetica', titulo: 'Cálculo', entrada: inicio, resposta, decimal, passos, aproximado };
}

function dobrarNeg(n) {
  // -(número) vira número negativo; mantém a árvore
  if (!n || typeof n !== 'object') return n;
  const c = { ...n };
  for (const k of ['l', 'r', 'a', 'idx', 'base']) if (n[k]) c[k] = dobrarNeg(n[k]);
  if (c.t === 'neg' && lit(c.a)) return qn(c.a.v.neg(), c.a.dec);
  if (c.t === '/' && c.frac && lit(c.l) && lit(c.r) && c.l.v.isInt && c.r.v.isInt && !c.l.dec && !c.r.dec) {
    // fração escrita: é um número, mas mostramos a simplificação como passo
    if (c.r.v.isZero) throw new ErroMat('Divisão por zero não existe.');
    const q = c.l.v.div(c.r.v);
    if (q.n === c.l.v.n && q.d === c.r.v.n) return qn(q);
  }
  return c;
}

// cadeia de mesma classe com folhas numéricas? (1+2-3+4 ou 2·3÷4)
function cadeiaPronta(n, cls) {
  if (lit(n)) return true;
  if (CLASSE[n.t] !== cls || (n.t === '/' && n.frac && cls === 2 && false)) return false;
  return cadeiaPronta(n.l, cls) && cadeiaPronta(n.r, cls);
}

function pronto(n) {
  const c = CLASSE[n.t];
  if (!c) return false;
  if (c === 3 || c === 2) return cadeiaPronta(n, c);
  if (n.t === '^') return lit(n.l) && lit(n.r);
  if (n.t === 'sqrt') return lit(n.a) && (!n.idx || lit(n.idx));
  if (n.t === 'fn') return lit(n.a) && (!n.base || lit(n.base));
  return lit(n.a);
}

function umPasso(raiz, opts) {
  // acha a menor classe entre operações prontas
  const prontos = [];
  (function visita(n, pai) {
    if (!n || typeof n !== 'object' || lit(n)) return;
    if (pronto(n)) { prontos.push({ n, pai }); return; }
    for (const k of ['l', 'r', 'a', 'idx', 'base']) if (n[k]) visita(n[k], n);
  })(raiz, null);
  if (!prontos.length) return null;
  const cls = Math.min(...prontos.map((p) => CLASSE[p.n.t]));
  const escolhidos = prontos.filter((p) => CLASSE[p.n.t] === cls);
  const detalhes = [];
  const subs = new Map();
  let falhou = false;
  for (const { n } of escolhidos) {
    const r = calcular(n, opts);
    if (!r) { falhou = true; continue; }
    subs.set(n, r.node);
    detalhes.push(...r.det);
  }
  if (!subs.size) return null;
  const novo = trocar(raiz, subs);
  const dentro = escolhidos.some(({ pai }) => pai && (CLASSE[pai.t] < cls || pai.t === 'fn' || pai.t === 'sqrt' || pai.t === 'abs' || (pai.t === '^')) && CLASSE[pai.t] !== undefined);
  let titulo = NOME_CLASSE[cls];
  if (dentro) titulo = 'Primeiro, dentro dos parênteses: ' + titulo.toLowerCase();
  let texto = cls === 3 ? 'Fazemos as somas e subtrações, da esquerda para a direita.'
    : cls === 2 ? 'Fazemos as multiplicações e divisões, da esquerda para a direita.'
      : 'Resolvemos potências, raízes e funções antes das outras operações.';
  if (falhou && !subs.size) return null;
  return { node: novo, titulo, texto, detalhes };
}

function trocar(n, subs) {
  if (subs.has(n)) return subs.get(n);
  if (!n || typeof n !== 'object') return n;
  const c = { ...n };
  for (const k of ['l', 'r', 'a', 'idx', 'base']) if (n[k]) c[k] = trocar(n[k], subs);
  return c;
}

// ---------- operações com explicação ----------
function calcular(n, opts) {
  const det = [];
  const ehDec = (x) => x.dec;
  switch (n.t) {
    case '+': case '-': {
      const folhas = [];
      (function col(x, s) {
        if (lit(x)) { folhas.push({ q: s < 0 ? x.v.neg() : x.v, dec: x.dec }); return; }
        col(x.l, s);
        col(x.r, x.t === '-' ? -s : s);
      })(n, 1);
      const temFracao = folhas.some((f) => !f.q.isInt && !f.dec);
      let soma = Q.ZERO;
      for (const f of folhas) soma = soma.add(f.q);
      const dec = folhas.every((f) => f.dec || f.q.isInt) && folhas.some((f) => f.dec);
      if (temFracao) {
        let m = 1n;
        for (const f of folhas) m = mmcBig(m, f.q.d);
        const partes = folhas.map((f, i) => {
          const num = f.q.n * (m / f.q.d);
          return (i === 0 ? (num < 0n ? '-' : '') : num < 0n ? '-' : '+') + `\\frac{${num < 0n ? -num : num}}{${m}}`;
        }).join('');
        det.push({ texto: `Frações com denominadores diferentes: usamos o MMC dos denominadores, que é ${m}. Cada fração vira uma fração equivalente com denominador ${m}.`, latex: `${L(n)}=${partes}=\\frac{${soma.n * (m / soma.d)}}{${m}}` });
        if (soma.d !== m) {
          const g = m / soma.d;
          det.push({ texto: `Simplificamos dividindo numerador e denominador por ${g}.`, latex: `\\frac{${soma.n * g}}{${m}}=${soma.toLatex()}` });
        }
      } else {
        det.push({ texto: '', latex: `${L(n)}=${dec ? decLatex(soma) : soma.toLatex()}` });
      }
      return { node: qn(soma, dec), det };
    }
    case '*': case '/': {
      if (n.t === '/' && n.frac && lit(n.l) && lit(n.r) && n.l.v.isInt && n.r.v.isInt && !n.l.dec && !n.r.dec) {
        if (n.r.v.isZero) throw new ErroMat('Divisão por zero não existe.');
        const r = n.l.v.div(n.r.v);
        const g = mdcBig(n.l.v.n, n.r.v.n);
        det.push({ texto: g > 1n ? `Simplificamos a fração dividindo numerador e denominador por ${g} (o MDC entre eles).` : 'Ajustamos o sinal da fração.', latex: `${L(n)}=${r.toLatex()}` });
        return { node: qn(r), det };
      }
      // cadeia da esquerda para a direita
      const ops = [];
      (function col(x, op) {
        if (lit(x)) { ops.push({ op, x }); return; }
        col(x.l, op);
        col(x.r, x.t === '/' ? '/' : '*');
        if (x.t === '/' && x.frac) ops[ops.length - 1].fracao = true;
      })(n, '*');
      let acc = ops[0].x.v;
      let dec = ops.every((o) => o.x.dec || o.x.v.isInt) && ops.some((o) => o.x.dec);
      for (let i = 1; i < ops.length; i++) {
        const b = ops[i].x.v;
        if (ops[i].op === '/') {
          if (b.isZero) throw new ErroMat('Divisão por zero não existe.');
          const r = acc.div(b);
          if (!acc.isInt || !b.isInt) {
            if (!dec) det.push({ texto: 'Para dividir frações, mantemos a primeira e multiplicamos pelo inverso da segunda.', latex: `${acc.toLatex()}\\div ${par(b.toLatex(), b)}=${acc.toLatex()}\\cdot ${par(b.inv().toLatex(), b.inv())}=${r.toLatex()}` });
          } else if (!r.isInt && !dec) {
            const g = mdcBig(acc.n, b.n);
            det.push({ texto: g > 1n ? `A divisão não é exata: fica a fração ${r.toLatex()} (simplificada por ${g < 0n ? -g : g}).` : `A divisão não é exata: o resultado é a fração ${r.toLatex()}.`, latex: `${acc.toLatex()}\\div ${par(b.toLatex(), b)}=${r.toLatex()}` });
          }
          acc = r;
        } else {
          const r = acc.mul(b);
          if ((!acc.isInt || !b.isInt) && !dec) det.push({ texto: 'Multiplicamos numerador com numerador e denominador com denominador.', latex: `${par(acc.toLatex(), acc)}\\cdot ${par(b.toLatex(), b)}=${r.toLatex()}` });
          acc = r;
        }
      }
      if (!det.length) det.push({ texto: '', latex: `${L(n)}=${dec ? decLatex(acc) : acc.toLatex()}` });
      if (dec && !acc.toDecimal(12).exata) dec = false;
      return { node: qn(acc, dec), det };
    }
    case '^': {
      const b = n.l.v, e = n.r.v;
      if (e.isInt) {
        if (b.isZero && e.sign() <= 0) throw new ErroMat(e.isZero ? '0⁰ é uma indeterminação.' : 'Zero elevado a expoente negativo é divisão por zero.');
        const r = b.powInt(e.n);
        const k = Number(e.n);
        if (k >= 2 && k <= 6) {
          const base = par(b.toLatex(), b);
          det.push({ texto: `Potência: multiplicar a base ${k} vezes por ela mesma.`, latex: `${L(n)}=${Array(k).fill(base).join('\\cdot ')}=${r.toLatex()}` });
        } else if (k < 0) {
          det.push({ texto: 'Expoente negativo: invertemos a base e trocamos o sinal do expoente.', latex: `${L(n)}=${par(b.inv().toLatex(), b.inv())}^{${-k}}=${r.toLatex()}` });
        } else if (k === 0) {
          det.push({ texto: 'Todo número (diferente de zero) elevado a zero é 1.', latex: `${L(n)}=1` });
        } else det.push({ texto: '', latex: `${L(n)}=${r.toLatex()}` });
        return { node: qn(r, n.l.dec && r.toDecimal(12).exata), det };
      }
      // expoente fracionário: vira raiz
      const dentro = e.n === 1n ? b : b.powInt(e.n);
      const raiz = A.sqrt(A.num(dentro), e.d === 2n ? undefined : A.num(e.d));
      det.push({ texto: 'Expoente em forma de fração é uma raiz: o denominador vira o índice da raiz.', latex: `${L(n)}=${L(raiz)}` });
      const r2 = calcular(raiz, opts);
      if (r2) return { node: r2.node, det: det.concat(r2.det) };
      return { node: raiz, det };
    }
    case 'sqrt': {
      const a = n.a.v;
      const k = n.idx ? n.idx.v : Q.TWO;
      if (!k.isInt || k.sign() <= 0) throw new ErroMat('O índice da raiz deve ser inteiro positivo.');
      const K = k.n;
      if (a.isNeg && K % 2n === 0n) throw new ErroMat('Raiz quadrada (ou de índice par) de número negativo não existe nos números reais.');
      const sinal = a.isNeg ? -1n : 1n;
      const aa = a.abs();
      const rn = raizSimplificada(aa.n, Number(K)), rd = raizSimplificada(aa.d, Number(K));
      if (rn.dentro === 1n && rd.dentro === 1n) {
        const r = new Q(sinal * rn.fora, rd.fora);
        det.push({ texto: `Raiz exata: ${r.toLatex().includes('frac') ? 'o resultado' : r.toString()} elevado a ${K} dá ${a.toString()}.`, latex: `${L(n)}=${r.toLatex()}\\quad\\text{pois }${par(r.toLatex(), r)}^{${K}}=${a.toLatex()}` });
        return { node: qn(r), det };
      }
      if (aa.isInt && rn.fora > 1n) {
        const quad = rn.fora ** K;
        const idx = K === 2n ? '' : `[${K}]`;
        det.push({ texto: `Não é raiz exata. Simplificamos tirando da raiz o fator ${quad}, que tem raiz exata.`, latex: `${L(n)}=\\sqrt${idx}{${quad}\\cdot ${rn.dentro}}=${sinal < 0n ? '-' : ''}${rn.fora}\\sqrt${idx}{${rn.dentro}}` });
        const novo = A.mul(A.num(sinal < 0n ? -rn.fora : rn.fora), A.sqrt(A.num(rn.dentro), n.idx), true);
        novo.irr = true;
        return { node: novo, det };
      }
      return null;
    }
    case 'fact': {
      const a = n.a.v;
      if (!a.isInt || a.isNeg) throw new ErroMat('Fatorial só existe para inteiros não negativos.');
      if (a.n > 2000n) throw new ErroMat('Fatorial grande demais.');
      let f = 1n; for (let i = 2n; i <= a.n; i++) f *= i;
      const k = Number(a.n);
      det.push({ texto: 'Fatorial: multiplicar todos os inteiros de 1 até o número.', latex: k <= 8 && k >= 2 ? `${k}!=${Array.from({ length: k }, (_, i) => k - i).join('\\cdot ')}=${f}` : `${k}!=${f}` });
      return { node: qn(new Q(f)), det };
    }
    case 'pct': {
      const a = n.a.v;
      const r = a.div(100);
      det.push({ texto: 'Porcentagem: dividir por 100.', latex: `${L(n)}=\\frac{${a.toLatex()}}{100}=${decOuFrac(r)}` });
      return { node: qn(r, r.toDecimal(12).exata), det };
    }
    case 'abs': {
      const a = n.a.v;
      det.push({ texto: 'Módulo (valor absoluto): a distância até o zero, sempre positiva.', latex: `${L(n)}=${a.abs().toLatex()}` });
      return { node: qn(a.abs(), n.a.dec), det };
    }
    case 'grau': return null;
    case 'fn': {
      // valores notáveis via forma normal
      try {
        const p = deAST(n, opts);
        if (p.eQ) {
          const r = p.q;
          const notavel = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc'].includes(n.n);
          det.push({ texto: notavel ? 'Valor de ângulo notável (tabela trigonométrica).' : n.n === 'ln' || n.n === 'log' ? 'Logaritmo: o expoente que a base precisa para dar o número.' : '', latex: `${L(n)}=${r.toLatex()}` });
          return { node: qn(r), det };
        }
      } catch (e) { if (!(e instanceof ErroMat)) throw e; throw e; }
      return null;
    }
  }
  return null;
}

function par(s, q) { return q.isNeg || !q.isInt ? `\\left(${s}\\right)` : s; }
function decLatex(q) { const d = q.toDecimal(12); return d.exata ? d.txt.replace(',', '{,}') : q.toLatex(); }
function decOuFrac(q) { const d = q.toDecimal(12); return d.exata ? d.txt.replace(',', '{,}') : q.toLatex(); }
