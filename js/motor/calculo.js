// Derivadas, integrais e limites — passo a passo.
import { Q, ErroMat, formatNum } from './racional.js';
import * as A from './ast.js';
import { P, deAST, divPoli } from './poli.js';
import { latexConst, raizesNumericas } from './equacoes.js';

const L = A.latex;
const ZERO = () => A.num(0), UM = () => A.num(1);

function simp(n, v) {
  try { return deAST(n).toASTBonito(v); } catch (e) { if (e instanceof ErroMat) return n; throw e; }
}
// limpa ×1, +0 etc. sem reordenar (para mostrar a regra)
function limpar(n) {
  if (!n || typeof n !== 'object') return n;
  const c = { ...n };
  for (const k of ['l', 'r', 'a']) if (n[k]) c[k] = limpar(n[k]);
  const z = (x) => x.t === 'num' && x.v.isZero, u = (x) => x.t === 'num' && x.v.isOne;
  switch (c.t) {
    case '*': if (z(c.l) || z(c.r)) return ZERO(); if (u(c.l)) return c.r; if (u(c.r)) return c.l; break;
    case '+': if (z(c.l)) return c.r; if (z(c.r)) return c.l; break;
    case '-': if (z(c.r)) return c.l; if (z(c.l)) return A.neg(c.r); break;
    case '/': if (u(c.r)) return c.l; if (z(c.l)) return ZERO(); break;
    case '^': if (u(c.r)) return c.l; break;
    case 'neg': if (z(c.a)) return ZERO(); if (c.a.t === 'neg') return c.a.a; break;
  }
  return c;
}
const dd = (v, n) => `\\frac{d}{d${v}}\\left[${L(n)}\\right]`;

// ================= DERIVADAS =================
export function derivarComPassos(f, v, ordem = 1) {
  const passos = [];
  let atual = f;
  for (let k = 1; k <= ordem; k++) {
    if (ordem > 1) passos.push({ titulo: `Derivada de ordem ${k}`, texto: k === 1 ? 'Começamos pela primeira derivada.' : 'Derivamos de novo o resultado anterior.', latex: dd(v, atual) });
    const ctx = { v, passos, n: 0 };
    const d = D(atual, ctx);
    const s = simp(d, v);
    if (L(s) !== L(limpar(d))) passos.push({ titulo: 'Simplificando', texto: 'Organizamos e juntamos os termos.', latex: `${ordem > 1 ? `f^{(${k})}` : `f'`}(${v})=${L(s)}` });
    atual = s;
  }
  return { tipo: 'derivada', titulo: ordem > 1 ? `Derivada de ordem ${ordem}` : 'Derivada', entrada: L({ t: 'deriv', f, v, ordem }), resposta: `${ordem === 1 ? "f'" : ordem === 2 ? "f''" : `f^{(${ordem})}`}(${v})=${L(atual)}`, respostaExpr: atual, passos };
}

export function derivar(f, v) { return simp(D(f, { v, passos: null, n: 0 }), v); }

function reg(ctx, titulo, texto, n, res, pos) {
  if (!ctx.passos || ctx.n > 30) return;
  ctx.n++;
  const p = { titulo, texto, latex: `${dd(ctx.v, n)}=${L(limpar(res))}` };
  if (pos === undefined) ctx.passos.push(p); else ctx.passos.splice(pos, 0, p);
}
const pos0 = (ctx) => (ctx.passos ? ctx.passos.length : 0);

function D(n, ctx) {
  const v = ctx.v;
  if (!A.temVar(n, v)) return ZERO();
  switch (n.t) {
    case 'var': return UM();
    case 'neg': { const d = D(n.a, ctx); return A.neg(d); }
    case '+': case '-': {
      const r = A.bin(n.t, dSim(n.l, ctx, true), dSim(n.r, ctx, true));
      reg(ctx, n.t === '+' ? 'Regra da soma' : 'Regra da diferença', 'A derivada de uma soma/diferença é a soma/diferença das derivadas.', n, r);
      // agora cada termo
      const dl = D(n.l, ctx), dr = D(n.r, ctx);
      return A.bin(n.t, dl, dr);
    }
    case '*': {
      const cl = !A.temVar(n.l, v), cr = !A.temVar(n.r, v);
      if (cl || cr) {
        const c = cl ? n.l : n.r, g = cl ? n.r : n.l;
        const ps = pos0(ctx);
        const dg = D(g, ctx);
        const r = A.mul(c, dg);
        reg(ctx, 'Constante multiplicando', `A constante ${L(c)} sai da derivada.`, n, r, ps);
        return r;
      }
      const ps = pos0(ctx);
      const df = D(n.l, ctx), dg = D(n.r, ctx);
      const r = A.add(A.mul(simp(df, v), n.r), A.mul(n.l, simp(dg, v)));
      reg(ctx, 'Regra do produto', `(f·g)' = f'·g + f·g', com f = ${L(n.l)} e g = ${L(n.r)}. Abaixo, as derivadas de cada parte.`, n, r, ps);
      return r;
    }
    case '/': {
      if (!A.temVar(n.r, v)) {
        const df = D(n.l, ctx);
        const r = A.dvd(simp(df, v), n.r);
        reg(ctx, 'Dividido por constante', `Dividir por ${L(n.r)} é uma constante: ela continua dividindo.`, n, r);
        return r;
      }
      if (!A.temVar(n.l, v)) {
        // c/g → -c·g'/g²
        const dg = D(n.r, ctx);
        const r = A.neg(A.dvd(A.mul(n.l, simp(dg, v)), A.pow(n.r, A.num(2))));
        reg(ctx, 'Regra do quociente', "(c/g)' = −c·g'/g²", n, r);
        return r;
      }
      const ps = pos0(ctx);
      const df = D(n.l, ctx), dg = D(n.r, ctx);
      const r = A.dvd(A.sub(A.mul(simp(df, v), n.r), A.mul(n.l, simp(dg, v))), A.pow(n.r, A.num(2)));
      reg(ctx, 'Regra do quociente', `(f/g)' = (f'·g − f·g')/g², com f = ${L(n.l)} e g = ${L(n.r)}.`, n, r, ps);
      return r;
    }
    case '^': {
      const b = n.l, e = n.r;
      const bv = A.temVar(b, v), ev = A.temVar(e, v);
      if (bv && !ev) {
        const novo = A.pow(b, simp(A.sub(e, UM())));
        if (b.t === 'var') {
          const r = A.mul(e, novo);
          reg(ctx, 'Regra da potência', "(xⁿ)' = n·xⁿ⁻¹: o expoente desce multiplicando e diminui 1.", n, r);
          return r;
        }
        const ps = pos0(ctx);
        const db = D(b, ctx);
        const r = A.mul(A.mul(e, novo), simp(db, v));
        reg(ctx, 'Regra da cadeia (potência)', `(uⁿ)' = n·uⁿ⁻¹·u': derivamos a potência e multiplicamos pela derivada de dentro (u = ${L(b)}).`, n, r, ps);
        return r;
      }
      if (!bv && ev) {
        const de = D(e, ctx);
        const ehE = b.t === 'const' && b.n === 'e';
        const r = ehE ? A.mul(n, simp(de, v)) : A.mul(A.mul(n, A.fn('ln', b)), simp(de, v));
        reg(ctx, ehE ? 'Exponencial' : 'Exponencial de base a', ehE ? "(eᵘ)' = eᵘ·u'" : "(aᵘ)' = aᵘ·ln(a)·u'", n, r);
        return r;
      }
      // u^w = e^{w ln u}
      const g = A.mul(e, A.fn('ln', b));
      const dg = D(g, ctx);
      const r = A.mul(n, simp(dg, v));
      reg(ctx, 'Base e expoente com variável', "Escrevemos uʷ = e^{w·ln u} e derivamos.", n, r);
      return r;
    }
    case 'sqrt': {
      if (n.idx) return D(A.pow(n.a, A.dvd(UM(), n.idx)), ctx);
      const ps = pos0(ctx);
      const da = D(n.a, ctx);
      const r = A.dvd(simp(da, v), A.mul(A.num(2), n, true));
      reg(ctx, 'Derivada da raiz', "(√u)' = u'/(2√u)", n, r, ps);
      return r;
    }
    case 'fn': {
      const u = n.a;
      const ps = pos0(ctx);
      const du = simp(D(u, ctx), v);
      const cadeia = u.t !== 'var';
      let fl; let nome;
      switch (n.n) {
        case 'sin': fl = A.fn('cos', u); nome = "(sen u)' = cos u · u'"; break;
        case 'cos': fl = A.neg(A.fn('sin', u)); nome = "(cos u)' = −sen u · u'"; break;
        case 'tan': fl = A.pow(A.fn('sec', u), A.num(2)); nome = "(tg u)' = sec² u · u'"; break;
        case 'cot': fl = A.neg(A.pow(A.fn('csc', u), A.num(2))); nome = "(cotg u)' = −cossec² u · u'"; break;
        case 'sec': fl = A.mul(A.fn('sec', u), A.fn('tan', u)); nome = "(sec u)' = sec u · tg u · u'"; break;
        case 'csc': fl = A.neg(A.mul(A.fn('csc', u), A.fn('cot', u))); nome = "(cossec u)' = −cossec u · cotg u · u'"; break;
        case 'ln': fl = A.dvd(UM(), u); nome = "(ln u)' = u'/u"; break;
        case 'log': fl = A.dvd(UM(), A.mul(u, A.fn('ln', n.base || A.num(10)))); nome = "(logₐ u)' = u'/(u·ln a)"; break;
        case 'exp': fl = n; nome = "(eᵘ)' = eᵘ·u'"; break;
        case 'asin': fl = A.dvd(UM(), A.sqrt(A.sub(UM(), A.pow(u, A.num(2))))); nome = "(arcsen u)' = u'/√(1−u²)"; break;
        case 'acos': fl = A.neg(A.dvd(UM(), A.sqrt(A.sub(UM(), A.pow(u, A.num(2)))))); nome = "(arccos u)' = −u'/√(1−u²)"; break;
        case 'atan': fl = A.dvd(UM(), A.add(UM(), A.pow(u, A.num(2)))); nome = "(arctg u)' = u'/(1+u²)"; break;
        case 'sinh': fl = A.fn('cosh', u); nome = "(senh u)' = cosh u · u'"; break;
        case 'cosh': fl = A.fn('sinh', u); nome = "(cosh u)' = senh u · u'"; break;
        case 'tanh': fl = A.dvd(UM(), A.pow(A.fn('cosh', u), A.num(2))); nome = "(tgh u)' = u'/cosh² u"; break;
        default: throw new ErroMat(`Não sei derivar ${n.n}.`);
      }
      const r = cadeia ? (du.t === 'num' || du.t === 'var' || (du.t === '*' && du.l.t === 'num') || du.t === '^' ? A.mul(du, fl) : A.mul(fl, du)) : fl;
      reg(ctx, cadeia ? 'Regra da cadeia' : 'Derivada de função', nome + (cadeia ? ` — aqui u = ${L(u)}` : ''), n, r, ps);
      return r;
    }
    case 'abs': {
      const du = simp(D(n.a, ctx), v);
      const r = A.mul(A.dvd(n.a, n), du);
      reg(ctx, 'Derivada do módulo', "(|u|)' = (u/|u|)·u'  (não existe onde u = 0)", n, r);
      return r;
    }
    case 'const': return ZERO();
    case 'num': return ZERO();
  }
  throw new ErroMat('Não sei derivar essa expressão.');
}
// derivada só para mostrar na regra da soma (sem registrar passos)
function dSim(n, ctx, mostrar) { return { t: 'raw', s: dd(ctx.v, n) }; }

// ================= INTEGRAIS =================
export function integrarComPassos(no, opts = {}) {
  const { f, v, a, b } = no;
  const passos = [];
  let F = null;
  let viaCAS = false;
  try { F = primitiva(f, v, passos, 0); } catch (e) { if (!(e instanceof ErroMat)) throw e; F = null; }
  if (!F && opts.cas) {
    const r = opts.cas.integrar(f, v);
    if (r && confereprimitiva(r, f, v)) {
      F = r; viaCAS = true;
      passos.push({ titulo: 'Motor simbólico', texto: 'Esta integral foi resolvida pelo motor simbólico do app e conferida derivando o resultado (dá a função original). Para ver a técnica explicada em detalhes, toque em “Explicar com IA”.', latex: `\\int ${L(f)}\\,d${v}=${L(r)}+C` });
    }
  }
  if (!a) {
    if (!F) throw new ErroMat('Não consegui achar essa integral no modo offline. Toque em “Explicar com IA”.');
    const Fs = simp(F, v);
    if (!viaCAS && L(Fs) !== L(F)) passos.push({ titulo: 'Simplificando', texto: '', latex: `${L(Fs)}+C` });
    passos.push({ titulo: 'Constante de integração', texto: 'Na integral indefinida sempre somamos uma constante C (a derivada de uma constante é zero).', latex: `\\int ${L(f)}\\,d${v}=${L(Fs)}+C` });
    return { tipo: 'integral', titulo: 'Integral indefinida', entrada: L(no), resposta: `${L(Fs)}+C`, respostaExpr: Fs, passos };
  }
  // definida
  const num = simpson(f, v, a, b, opts);
  if (F) {
    const Fs = simp(F, v);
    try {
      const Fb = deAST(A.substituir(Fs, v, b), opts), Fa = deAST(A.substituir(Fs, v, a), opts);
      const res = Fb.sub(Fa);
      const val = A.avaliar(res.toAST(), {});
      if (isFinite(val) && (isNaN(num) || Math.abs(val - num) < 1e-6 * (1 + Math.abs(num)))) {
        passos.push({ titulo: 'Teorema Fundamental do Cálculo', texto: 'Calculamos a primitiva no limite de cima menos no limite de baixo: F(b) − F(a).', latex: `\\left[${L(Fs)}\\right]_{${L(a)}}^{${L(b)}}=\\left(${latexConst(Fb)}\\right)-\\left(${latexConst(Fa)}\\right)=${latexConst(res)}` });
        return { tipo: 'integral', titulo: 'Integral definida', entrada: L(no), resposta: latexConst(res), decimal: res.eQ && res.q.isInt ? null : '≈ ' + formatNum(val, 8), passos };
      }
    } catch (e) { if (!(e instanceof ErroMat)) throw e; }
  }
  if (!isFinite(num)) throw new ErroMat('Essa integral não converge (ou a função não está definida em todo o intervalo).');
  passos.push({ titulo: 'Cálculo numérico', texto: 'Calculamos a área aproximada pela regra de Simpson (dividindo o intervalo em muitas partes).', latex: `\\int_{${L(a)}}^{${L(b)}} ${L(f)}\\,d${v}\\approx ${formatNum(num, 8).replace(',', '{,}')}` });
  const q = Q.fromFloat(num, 1000n);
  return { tipo: 'integral', titulo: 'Integral definida', entrada: L(no), resposta: q && Math.abs(q.toNumber() - num) < 1e-9 ? q.toLatex() : `\\approx ${formatNum(num, 8).replace(',', '{,}')}`, aproximado: true, passos };
}

function confereprimitiva(F, f, v) {
  try {
    const dF = derivar(F, v);
    let ok = 0;
    for (const x of [0.37, 1.3, 2.1, -0.6, 0.9, 3.7]) {
      const a = A.avaliar(dF, { [v]: x }), b = A.avaliar(f, { [v]: x });
      if (!isFinite(a) || !isFinite(b)) continue;
      if (Math.abs(a - b) > 1e-6 * (1 + Math.abs(b))) return false;
      ok++;
    }
    return ok >= 2;
  } catch { return false; }
}

function simpson(f, v, a, b, opts) {
  let A0, B0;
  try { A0 = A.avaliar(a, {}, opts); B0 = A.avaliar(b, {}, opts); } catch { return NaN; }
  if (!isFinite(A0) || !isFinite(B0)) return NaN;
  const g = (x) => A.avaliar(f, { [v]: x }, opts);
  const S = (lo, hi, n) => {
    const h = (hi - lo) / n;
    let s = g(lo) + g(hi);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * g(lo + i * h);
    return (s * h) / 3;
  };
  try {
    const s1 = S(A0, B0, 2000), s2 = S(A0, B0, 4000);
    if (!isFinite(s2) || Math.abs(s1 - s2) > 1e-6 * (1 + Math.abs(s2))) return NaN;
    return s2;
  } catch { return NaN; }
}

// linear em v? retorna {a, b} (a·v + b), a ≠ 0
function linearEm(u, v) {
  try {
    const p = deAST(u);
    const c = p.coefsP(v);
    if (!c || c.length !== 2 || !c[1].constante || !c[0].constante) return null;
    return { a: c[1], b: c[0] };
  } catch { return null; }
}

// Primitiva com passos. Retorna AST ou null.
function primitiva(f, v, passos, prof) {
  if (prof > 4) return null;
  if (!A.temVar(f, v)) {
    passos.push({ titulo: 'Integral de constante', texto: `A integral de uma constante k é k·${v}.`, latex: `\\int ${L(f)}\\,d${v}=${L(A.mul(f, A.vr(v)))}` });
    return A.mul(f, A.vr(v), true);
  }
  // expande em termos
  let p;
  try { p = deAST(f); } catch (e) { if (e instanceof ErroMat) return null; throw e; }
  const termos = p.ordenados(v);
  if (termos.length > 1) {
    passos.push({ titulo: 'Linearidade', texto: 'A integral de uma soma é a soma das integrais, e constantes saem para fora.', latex: `\\int ${L(f)}\\,d${v}=${termos.map((t, i) => { const tl = new P().addTerm(t); const s = `\\int ${L(tl.toAST(v))}\\,d${v}`; return i && !t.c.isNeg ? '+' + s : s; }).join('')}` });
    const partes = [];
    for (const t of termos) {
      const r = primitivaTermo(new P().addTerm(t), v, passos, prof);
      if (!r) return null;
      partes.push(r);
    }
    return partes.reduce((a, b) => A.add(a, b));
  }
  return primitivaTermo(p, v, passos, prof, f);
}

function primitivaTermo(pt, v, passos, prof, original) {
  const t = pt.termos[0];
  if (!t) return ZERO();
  const c = t.c;
  const ast = original || pt.toAST(v);
  // separa constante × resto
  const restoM = t.m;
  const resto = P.mono(restoM);
  const temCoef = !c.isOne;
  const corpo = resto.toAST(v);
  const cte = (r) => (temCoef ? A.mul(A.num(c), r) : r);
  // 1) potência de v: v^n
  const fv = restoM.filter(([k]) => k === 'v:' + v);
  const outros = restoM.filter(([k]) => k !== 'v:' + v);
  const outrosConst = outros.every(([k]) => !P.atomo(k).temVar(v));
  if (outrosConst) {
    const kc = P.mono(outros).mulQ(c); // constante
    const n = fv.length ? fv[0][1] : Q.ZERO;
    if (n.eq(-1)) {
      const r = A.mul(kc.toAST(), A.fn('ln', { t: 'abs', a: A.vr(v) }));
      passos.push({ titulo: 'Integral de 1/x', texto: `∫ 1/${v} d${v} = ln|${v}|`, latex: `\\int ${L(ast)}\\,d${v}=${L(limpar(simpConst(r, kc)))}` });
      return simpConst(r, kc);
    }
    const n1 = n.add(1);
    const r = A.dvd(A.mul(kc.toAST(), A.pow(A.vr(v), A.num(n1))), A.num(n1));
    const rs = simp(r, v);
    passos.push({ titulo: 'Regra da potência', texto: `∫ ${v}ⁿ d${v} = ${v}ⁿ⁺¹/(n+1): somamos 1 no expoente e dividimos pelo novo expoente.`, latex: `\\int ${L(ast)}\\,d${v}=${L(rs)}` });
    return rs;
  }
  // 2) constante × função de (a·v+b)
  if (fv.length === 0 && outros.length === 1 || (outros.length >= 1 && outros.filter(([k]) => P.atomo(k).temVar(v)).length === 1 && fv.length === 0)) {
    const kc = P.mono(outros.filter(([k]) => !P.atomo(k).temVar(v))).mulQ(c);
    const [k, e] = outros.find(([k]) => P.atomo(k).temVar(v));
    const atomo = P.atomo(k).toAST(v); // e^{..}, sin(..), (ax+b)^{-1}...
    const base = P.atomo(k, Q.ONE);
    const r = tabela(atomo, e, v, kc, passos, ast);
    if (r) return r;
  }
  // 3) substituição
  const sub = substituicao(ast, v, passos, prof);
  if (sub) return sub;
  // 4) por partes
  const pp = porPartes(ast, pt, v, passos, prof);
  if (pp) return pp;
  return null;
}

function simpConst(r, kc) { return kc.eQ && kc.q.isOne ? limpar(r) : r; }

function tabela(atomo, e, v, kc, passos, ast) {
  // atomo pode ser fn(...), sqrt/pow de caixa, etc. e = expoente racional
  const K = (r) => simp(A.mul(kc.toAST(), r), v);
  const reg = (titulo, texto, r) => { passos.push({ titulo, texto, latex: `\\int ${L(ast)}\\,d${v}=${L(r)}` }); return r; };
  // função de linear
  let node = atomo, ex = e;
  if (node.t === 'fn' && ex.isOne) {
    const lin = linearEm(node.a, v);
    if (!lin) return null;
    const a = lin.a.toAST();
    const div = (r) => (lin.a.eQ && lin.a.q.isOne ? r : A.dvd(r, a));
    const u = node.a;
    const ehLin = !(lin.a.eQ && lin.a.q.isOne && lin.b.vazio);
    const extra = ehLin ? ` (como o argumento é ${L(u)}, dividimos por ${L(a)})` : '';
    switch (node.n) {
      case 'exp': return reg('Integral da exponencial', `∫ eᵘ du = eᵘ${extra}.`, K(div(A.fn('exp', u))));
      case 'sin': return reg('Integral do seno', `∫ sen u du = −cos u${extra}.`, K(div(A.neg(A.fn('cos', u)))));
      case 'cos': return reg('Integral do cosseno', `∫ cos u du = sen u${extra}.`, K(div(A.fn('sin', u))));
      case 'sinh': return reg('Integral', `∫ senh u du = cosh u${extra}.`, K(div(A.fn('cosh', u))));
      case 'cosh': return reg('Integral', `∫ cosh u du = senh u${extra}.`, K(div(A.fn('sinh', u))));
      case 'tan': return reg('Integral da tangente', `∫ tg u du = −ln|cos u|${extra}.`, K(div(A.neg(A.fn('ln', { t: 'abs', a: A.fn('cos', u) })))));
      case 'ln': {
        if (!ehLin) return reg('Integral do logaritmo', '∫ ln x dx = x·ln x − x (sai por partes).', K(A.sub(A.mul(A.vr(v), A.fn('ln', A.vr(v))), A.vr(v))));
        return null;
      }
      case 'sec': return null;
    }
    return null;
  }
  // (a·v+b)^n  — caixa de base linear
  if (node.t === 'sqrt' || node.t === '^' || node.t === '+' || node.t === '-') {
    // recupera a base e o expoente reais
    let base = node, n = ex;
    if (node.t === 'sqrt' && !node.idx) { base = node.a; n = ex.mul(new Q(1n, 2n)); }
    else if (node.t === 'sqrt' && node.idx && node.idx.t === 'num') { base = node.a; n = ex.mul(node.idx.v.inv()); if (base.t === '^' && base.r.t === 'num') { n = n.mul(base.r.v); base = base.l; } }
    else if (node.t === '^' && node.r.t === 'num') { base = node.l; n = ex.mul(node.r.v); }
    const lin = linearEm(base, v);
    if (lin) {
      const a = lin.a.toAST();
      if (n.eq(-1)) return reg('Integral de 1/(ax+b)', `∫ 1/u du = ln|u|${lin.a.eQ && lin.a.q.isOne ? '' : `, dividindo por ${L(a)}`}.`, K(A.dvd(A.fn('ln', { t: 'abs', a: base }), a)));
      const n1 = n.add(1);
      return reg('Potência de (ax+b)', `∫ uⁿ du = uⁿ⁺¹/(n+1)${lin.a.eQ && lin.a.q.isOne ? '' : `, dividindo por ${L(a)}`}.`, K(A.dvd(A.pow(base, A.num(n1)), A.mul(A.num(n1), a))));
    }
    // 1/(1+x²) e 1/√(1−x²)
    try {
      const pb = deAST(base);
      const cq = pb.coefsQ(v);
      if (cq && cq.length === 3 && cq[1].isZero) {
        const [c0, , c2] = cq;
        if (n.eq(-1) && c0.sign() > 0 && c2.sign() > 0) {
          // 1/(c0 + c2 x²) = (1/c0)·1/(1+(k x)²), k = √(c2/c0)
          const k = P.c(c2.div(c0)).pow(new Q(1n, 2n));
          const r = A.dvd(A.fn('atan', A.mul(k.toAST(), A.vr(v), true)), A.mul(A.num(c0), k.toAST()));
          return reg('Integral do arco-tangente', '∫ 1/(1+u²) du = arctg u.', K(r));
        }
        if (n.eq(new Q(-1n, 2n)) && c0.sign() > 0 && c2.sign() < 0) {
          const k = P.c(c2.neg().div(c0)).pow(new Q(1n, 2n));
          const r = A.dvd(A.fn('asin', A.mul(k.toAST(), A.vr(v), true)), A.mul(P.c(c0).pow(new Q(1n, 2n)).toAST(), k.toAST()));
          return reg('Integral do arco-seno', '∫ 1/√(1−u²) du = arcsen u.', K(r));
        }
      }
    } catch { /* segue */ }
  }
  // a^x (base constante)
  if (node.t === '^' && !A.temVar(node.l, v) && ex.isOne) {
    const lin = linearEm(node.r, v);
    if (lin) {
      const r = A.dvd(node, A.mul(A.fn('ln', node.l), lin.a.toAST()));
      return reg('Exponencial de base a', '∫ aᵘ du = aᵘ/ln a.', K(r));
    }
  }
  return null;
}

// candidatos a u: argumentos de funções, bases de potências, expoentes
function candidatosU(n, v, out = []) {
  if (!n || typeof n !== 'object') return out;
  if (n.t === 'fn' && A.temVar(n.a, v) && n.a.t !== 'var') out.push(n.a);
  if (n.t === 'sqrt' && A.temVar(n.a, v) && n.a.t !== 'var') out.push(n.a);
  if (n.t === '^' && A.temVar(n.l, v) && n.l.t !== 'var') out.push(n.l);
  if (n.t === '^' && A.temVar(n.r, v) && n.r.t !== 'var') out.push(n.r);
  if (n.t === '/' && A.temVar(n.r, v) && n.r.t !== 'var') out.push(n.r);
  if (n.t === 'fn' && n.n === 'ln' && n.a.t === 'var') out.push(n);
  for (const k of ['l', 'r', 'a']) if (n[k]) candidatosU(n[k], v, out);
  return out;
}

function trocaSub(n, alvo, por) {
  if (!n || typeof n !== 'object') return n;
  if (L(n) === alvo) return por;
  const c = { ...n };
  for (const k of ['l', 'r', 'a', 'idx', 'base']) if (n[k]) c[k] = trocaSub(n[k], alvo, por);
  return c;
}

function substituicao(f, v, passos, prof) {
  const cands = candidatosU(f, v);
  const vistos = new Set();
  for (const u0 of cands) {
    let u;
    try { u = deAST(u0).toAST(v); } catch { continue; }
    const lu = L(u);
    if (vistos.has(lu) || linearEm(u, v)) continue;
    vistos.add(lu);
    const du = derivar(u, v);
    let r;
    try { r = deAST(A.dvd(f, du)).toASTBonito(v); } catch { continue; }
    const g = trocaSub(r, lu, A.vr('u'));
    // também tenta casar com a forma normal de u dentro de caixas (ex.: (x²+1)^-1)
    if (A.temVar(g, v)) continue;
    const sub = [];
    const G = primitiva(simp(g, 'u'), 'u', sub, prof + 1);
    if (!G) continue;
    const res = A.substituir(G, 'u', u);
    passos.push({ titulo: 'Substituição (mudança de variável)', texto: `Chamamos u = ${lu}. Então du = ${L(du)}·d${v}, e a integral fica só em u.`, latex: `u=${lu},\\quad du=${L(du)}\\,d${v}\\;\\Rightarrow\\;\\int ${L(f)}\\,d${v}=\\int ${L(simp(g, 'u'))}\\,du` });
    passos.push(...sub);
    passos.push({ titulo: 'Voltando para ' + v, texto: `Trocamos u de volta por ${lu}.`, latex: `${L(G)}\\;\\Rightarrow\\;${L(simp(res, v))}` });
    return simp(res, v);
  }
  return null;
}

// por partes: polinômio × (exp, sen, cos) ou polinômio × ln
function porPartes(f, pt, v, passos, prof) {
  if (prof > 3) return null;
  const t = pt.termos[0];
  if (!t) return null;
  const kv = 'v:' + v;
  const pot = t.m.filter(([k]) => k === kv);
  const resto = t.m.filter(([k]) => k !== kv);
  if (resto.length !== 1) return null;
  const [k, e] = resto[0];
  if (!e.isOne) return null;
  const atom = P.atomo(k).toAST(v);
  if (atom.t !== 'fn') return null;
  const n = pot.length ? pot[0][1] : Q.ZERO;
  const c = A.num(t.c);
  const xn = n.isZero ? null : A.pow(A.vr(v), A.num(n));
  if (['exp', 'sin', 'cos'].includes(atom.n) && n.isInt && !n.isNeg && !n.isZero && linearEm(atom.a, v)) {
    // u = xⁿ, dv = atom dx
    const sub = [];
    const V = primitiva(atom, v, sub, prof + 1);
    if (!V) return null;
    const du = simp(A.mul(A.num(n), A.pow(A.vr(v), A.num(n.sub(1)))), v);
    passos.push({ titulo: 'Integração por partes', texto: `∫u dv = u·v − ∫v du. Escolhemos u = ${L(xn)} (fica mais simples ao derivar) e dv = ${L(atom)} d${v}.`, latex: `u=${L(xn)},\\; du=${L(du)}\\,d${v},\\quad dv=${L(atom)}\\,d${v},\\; v=${L(V)}` });
    const integrando = simp(A.mul(V, du), v);
    const sub2 = [];
    const I2 = primitiva(integrando, v, sub2, prof + 1);
    if (!I2) return null;
    passos.push({ titulo: 'Aplicando a fórmula', texto: 'Falta calcular a nova integral (mais simples).', latex: `\\int ${L(f)}\\,d${v}=${L(A.mul(c, A.sub(A.mul(xn, V), { t: 'raw', s: `\\int ${L(integrando)}\\,d${v}` })))}` });
    passos.push(...sub2);
    return simp(A.mul(c, A.sub(A.mul(xn, V), I2)), v);
  }
  if (atom.n === 'ln' && atom.a.t === 'var' && atom.a.n === v && !n.eq(-1)) {
    const n1 = n.add(1);
    const V = A.dvd(A.pow(A.vr(v), A.num(n1)), A.num(n1));
    passos.push({ titulo: 'Integração por partes', texto: `Escolhemos u = ln ${v} (a derivada fica simples: 1/${v}) e dv = ${xn ? L(xn) : '1'} d${v}.`, latex: `u=\\ln ${v},\\; du=\\frac{1}{${v}}d${v},\\quad v=${L(simp(V, v))}` });
    const integrando = simp(A.dvd(V, A.vr(v)), v);
    const I2 = primitiva(integrando, v, [], prof + 1);
    if (!I2) return null;
    const r = simp(A.mul(c, A.sub(A.mul(A.fn('ln', A.vr(v)), V), I2)), v);
    passos.push({ titulo: 'Aplicando a fórmula', texto: 'u·v − ∫v du', latex: `\\int ${L(f)}\\,d${v}=${L(r)}` });
    return r;
  }
  return null;
}

// ================= LIMITES =================
export function limiteComPassos(no, opts = {}) {
  const { f, v, to, lado } = no;
  const passos = [];
  const infinito = to.t === 'const' && to.n === 'inf' || (to.t === 'neg' && to.a.t === 'const' && to.a.n === 'inf');
  const sinalInf = infinito ? (to.t === 'neg' ? -1 : 1) : 0;
  const ev = (x) => A.avaliar(f, { [v]: x }, opts);
  const fim = (resp, aprox) => ({ tipo: 'limite', titulo: 'Limite', entrada: L(no), resposta: resp, passos, aproximado: !!aprox });

  if (!infinito) {
    const a = A.avaliar(to, {}, opts);
    // 1) substituição direta
    try {
      const sub = deAST(A.substituir(f, v, to), opts);
      const val = A.avaliar(sub.toAST(), {});
      if (isFinite(val) && continuaPerto(ev, a, val, lado)) {
        passos.push({ titulo: 'Substituição direta', texto: `A função é contínua em ${v} = ${L(to)}: basta trocar ${v} pelo valor.`, latex: `\\lim_{${v}\\to ${L(to)}} ${L(f)}=${latexConst(sub)}` });
        return fim(latexConst(sub));
      }
    } catch (e) { if (!(e instanceof ErroMat)) throw e; }
    // 2) fração de polinômios 0/0: fatorar
    try {
      let N, D;
      if (f.t === '/') { N = deAST(f.l, opts); D = deAST(f.r, opts); }
      else ({ N, D } = deAST(f, opts).fracao());
      const cN = N.coefsQ(v), cD = D.coefsQ(v);
      if (cN && cD && !D.eQ) {
        const aq = deAST(to, opts);
        if (aq.eQ) {
          const r = aq.q;
          const valN = avaliarQ(cN, r), valD = avaliarQ(cD, r);
          if (valN.isZero && valD.isZero) {
            let n2 = cN, d2 = cD, k = 0;
            while (avaliarQ(n2, r).isZero && avaliarQ(d2, r).isZero && k++ < 10) {
              n2 = divPoli(n2, [r.neg(), Q.ONE]).q; d2 = divPoli(d2, [r.neg(), Q.ONE]).q;
            }
            passos.push({ titulo: 'Indeterminação 0/0', texto: `Substituindo ${v} = ${r.toString()}, numerador e denominador dão zero. Então (${v} − ${r.toString()}) é fator dos dois.`, latex: `\\frac{${N.latex(v)}}{${D.latex(v)}}\\to\\frac{0}{0}` });
            const fat = `(${P.dePoli([r.neg(), Q.ONE], v).latex(v)})`;
            const fr = (a, b) => (b.length === 1 && b[0].isOne ? P.dePoli(a, v).latex(v) : `\\frac{${P.dePoli(a, v).latex(v)}}{${P.dePoli(b, v).latex(v)}}`);
            passos.push({ titulo: 'Fatorando e simplificando', texto: `Dividimos numerador e denominador por ${fat} (Briot-Ruffini) e cancelamos.`, latex: `\\frac{${N.latex(v)}}{${D.latex(v)}}=${fr(n2, d2)}` });
            const vn = avaliarQ(n2, r), vd = avaliarQ(d2, r);
            if (!vd.isZero) {
              const res = vn.div(vd);
              passos.push({ titulo: 'Substituindo agora', texto: `Agora podemos trocar ${v} por ${r.toString()}.`, latex: `\\lim_{${v}\\to ${L(to)}}${fr(n2, d2)}=${res.toLatex()}` });
              return fim(res.toLatex());
            }
            return limiteInfinitoLateral(ev, a, lado, passos, fim, v, to);
          }
          if (!valN.isZero && valD.isZero) {
            passos.push({ titulo: 'Número dividido por zero', texto: `O numerador vai para ${valN.toString()} e o denominador para 0: o limite vai para infinito (ou não existe). Olhamos os lados.`, latex: `\\frac{${valN.toLatex()}}{0}` });
            return limiteInfinitoLateral(ev, a, lado, passos, fim, v, to);
          }
        }
      }
    } catch (e) { if (!(e instanceof ErroMat)) throw e; }
    // 3) L'Hôpital
    const lh = lhopital(f, v, to, passos, opts, 0);
    if (lh) return fim(lh);
    // 4) numérico
    return limiteNumerico(ev, a, lado, passos, fim, v, to);
  }

  // x → ±∞
  try {
    const p = deAST(f, opts);
    const { N, D } = p.fracao();
    const cN = N.coefsQ(v), cD = D.coefsQ(v);
    if (cN && cD) {
      const gN = cN.length - 1, gD = cD.length - 1;
      const lN = cN[gN], lD = cD[gD];
      passos.push({ titulo: 'Maior grau manda', texto: `Quando ${v} vai para ${sinalInf > 0 ? '+' : '−'}∞, em cada polinômio só importa o termo de maior grau.`, latex: `\\lim\\frac{${N.latex(v)}}{${D.latex(v)}}=\\lim\\frac{${P.dePoli([...Array(gN).fill(Q.ZERO), lN], v).latex(v)}}{${P.dePoli([...Array(gD).fill(Q.ZERO), lD], v).latex(v)}}` });
      if (gN < gD) { passos.push({ titulo: 'Grau de baixo maior', texto: 'O denominador cresce mais rápido: a fração vai para zero.', latex: '=0' }); return fim('0'); }
      if (gN === gD) { const r = lN.div(lD); passos.push({ titulo: 'Graus iguais', texto: 'O limite é a divisão dos coeficientes dos termos de maior grau.', latex: `=\\frac{${lN.toLatex()}}{${lD.toLatex()}}=${r.toLatex()}` }); return fim(r.toLatex()); }
      const s = lN.div(lD).sign() * (((gN - gD) % 2 === 1) ? sinalInf : 1);
      passos.push({ titulo: 'Grau de cima maior', texto: 'O numerador cresce mais rápido: a fração vai para infinito.', latex: `=${s > 0 ? '+' : '-'}\\infty` });
      return fim(`${s > 0 ? '+' : '-'}\\infty`);
    }
  } catch (e) { if (!(e instanceof ErroMat)) throw e; }
  const lh = lhopital(f, v, to, passos, opts, 0);
  if (lh) return fim(lh);
  // numérico no infinito
  const xs = [1e3, 1e4, 1e5, 1e6, 1e7].map((x) => x * sinalInf);
  const ys = xs.map((x) => { try { return ev(x); } catch { return NaN; } });
  const ult = ys[ys.length - 1];
  if (ys.every(isFinite) && Math.abs(ult - ys[ys.length - 2]) < 1e-5 * (1 + Math.abs(ult))) {
    const q = Q.fromFloat(ult, 1000n);
    const txt = q && Math.abs(q.toNumber() - ult) < 1e-5 ? q.toLatex() : formatNum(ult, 6).replace(',', '{,}');
    passos.push({ titulo: 'Estimativa numérica', texto: `Calculamos a função para ${v} cada vez maior e os valores se aproximam de um número.`, latex: `\\begin{array}{l}${xs.map((x, i) => `f(${formatNum(x).replace(',', '{,}')})\\approx ${formatNum(ys[i], 6).replace(',', '{,}')}`).join('\\\\')}\\end{array}` });
    return fim(txt, true);
  }
  if (ys.every(isFinite) && Math.abs(ult) > 1e6) { const s = Math.sign(ult) > 0 ? '+' : '-'; passos.push({ titulo: 'Estimativa numérica', texto: 'Os valores crescem sem parar.', latex: `${s}\\infty` }); return fim(`${s}\\infty`, true); }
  passos.push({ titulo: 'Não converge', texto: 'Os valores oscilam ou não se aproximam de um número.', latex: '' });
  return fim('\\text{Não existe}', true);
}

function avaliarQ(c, r) { let s = Q.ZERO; for (let i = c.length - 1; i >= 0; i--) s = s.mul(r).add(c[i]); return s; }

function continuaPerto(ev, a, val, lado) {
  const hs = [1e-4, 1e-6];
  for (const h of hs) {
    for (const s of lado === '+' ? [1] : lado === '-' ? [-1] : [1, -1]) {
      let y; try { y = ev(a + s * h); } catch { return false; }
      if (!isFinite(y) || Math.abs(y - val) > 1e-2 * (1 + Math.abs(val))) return false;
    }
  }
  return true;
}

function limiteInfinitoLateral(ev, a, lado, passos, fim, v, to) {
  const ld = (s) => { const ys = [1e-4, 1e-6, 1e-8].map((h) => { try { return ev(a + s * h); } catch { return NaN; } }); return ys; };
  const dir = ld(1), esq = ld(-1);
  const tipo = (ys) => (ys.every((y) => y > 1e3) && ys[2] > ys[0] ? '+\\infty' : ys.every((y) => y < -1e3) && ys[2] < ys[0] ? '-\\infty' : null);
  const td = tipo(dir), te = tipo(esq);
  if (lado === '+') { passos.push({ titulo: 'Pela direita', texto: `Valores de ${v} um pouco maiores que ${L(to)}.`, latex: `\\lim_{${v}\\to ${L(to)}^{+}}=${td || '?'}` }); return fim(td || '\\text{Não existe}', !td); }
  if (lado === '-') { passos.push({ titulo: 'Pela esquerda', texto: `Valores de ${v} um pouco menores que ${L(to)}.`, latex: `\\lim_{${v}\\to ${L(to)}^{-}}=${te || '?'}` }); return fim(te || '\\text{Não existe}', !te); }
  passos.push({ titulo: 'Limites laterais', texto: 'Comparamos chegando pela esquerda e pela direita.', latex: `\\lim_{${v}\\to ${L(to)}^{-}}=${te || '?'},\\quad \\lim_{${v}\\to ${L(to)}^{+}}=${td || '?'}` });
  if (td && td === te) return fim(td);
  passos.push({ titulo: 'Conclusão', texto: 'Os limites laterais são diferentes, então o limite não existe.', latex: '' });
  return fim('\\text{Não existe (laterais diferentes)}');
}

function limiteNumerico(ev, a, lado, passos, fim, v, to) {
  const lados = lado === '+' ? [1] : lado === '-' ? [-1] : [1, -1];
  const res = lados.map((s) => [1e-3, 1e-5, 1e-7].map((h) => { try { return ev(a + s * h); } catch { return NaN; } }));
  const fins = res.map((ys) => ys[2]);
  if (res.every((ys) => ys.every(isFinite)) && fins.every((y) => Math.abs(y - fins[0]) < 1e-4 * (1 + Math.abs(y))) && res.every((ys) => Math.abs(ys[2] - ys[1]) < 1e-3 * (1 + Math.abs(ys[2])))) {
    const y = fins[0];
    const q = Q.fromFloat(y, 1000n);
    const txt = q && Math.abs(q.toNumber() - y) < 1e-5 ? q.toLatex() : formatNum(y, 6).replace(',', '{,}');
    passos.push({ titulo: 'Estimativa numérica', texto: `Calculamos a função com ${v} cada vez mais perto de ${L(to)} e os valores se aproximam de ${txt}.`, latex: `\\begin{array}{l}${res[0].map((yy, i) => `f(${L(to)}\\pm 10^{-${[3, 5, 7][i]}})\\approx ${formatNum(yy, 7).replace(',', '{,}')}`).join('\\\\')}\\end{array}` });
    return fim(txt, true);
  }
  return limiteInfinitoLateral(ev, a, lado, passos, fim, v, to);
}

function lhopital(f, v, to, passos, opts, k) {
  if (k > 3 || f.t !== '/') return null;
  const lim = (g) => {
    try {
      if (to.t === 'const' || to.t === 'neg') {
        const s = to.t === 'neg' ? -1 : 1;
        const y = A.avaliar(g, { [v]: s * 1e8 }, opts);
        return Math.abs(y) > 1e6 ? Infinity : y;
      }
      return A.avaliar(A.substituir(g, v, to), {}, opts);
    } catch { return NaN; }
  };
  const n0 = lim(f.l), d0 = lim(f.r);
  const zz = Math.abs(n0) < 1e-12 && Math.abs(d0) < 1e-12;
  const ii = !isFinite(n0) && !isFinite(d0) && !isNaN(n0) && !isNaN(d0);
  if (!zz && !ii) return null;
  const dn = derivar(f.l, v), dd2 = derivar(f.r, v);
  passos.push({ titulo: "Regra de L'Hôpital", texto: `Deu ${zz ? '0/0' : '∞/∞'}: derivamos o numerador e o denominador separadamente.`, latex: `\\lim\\frac{${L(f.l)}}{${L(f.r)}}=\\lim\\frac{${L(dn)}}{${L(dd2)}}` });
  const nova = A.dvd(dn, dd2);
  try {
    const sub = to.t === 'const' || to.t === 'neg' ? null : deAST(A.substituir(nova, v, to), opts);
    if (sub) {
      const val = A.avaliar(sub.toAST(), {});
      if (isFinite(val)) {
        passos.push({ titulo: 'Substituindo', texto: '', latex: `=${latexConst(sub)}` });
        return latexConst(sub);
      }
    }
  } catch (e) { if (!(e instanceof ErroMat)) throw e; }
  const s = simp(nova, v);
  return lhopital(s.t === '/' ? s : nova, v, to, passos, opts, k + 1);
}
