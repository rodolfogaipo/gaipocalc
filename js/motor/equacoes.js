// Equações, inequações e sistemas — passo a passo.
import { Q, ErroMat, formatNum, mmcBig, mdcBig } from './racional.js';
import * as A from './ast.js';
import { P, deAST, divPoli } from './poli.js';

const L = A.latex;
const RELS = { '=': '=', '<': '<', '>': '>', '<=': '\\le ', '>=': '\\ge ', '!=': '\\ne ' };

// ---------- utilidades ----------
export function escolherVar(ast) {
  const vs = [...A.variaveis(ast)];
  if (!vs.length) return null;
  for (const v of ['x', 'y', 't', 'z', 'n', 'a']) if (vs.includes(v)) return v;
  return vs.sort()[0];
}

// constante (P sem variáveis) em LaTeX bonito, juntando numa fração só: (-5+√13)/2
export function latexConst(p) {
  if (!p.constante) return p.latex();
  let d = 1n;
  for (const t of p.termos) d = mmcBig(d, t.c.d);
  if (d === 1n || p.eMono) return p.latex();
  const N = p.mulQ(new Q(d));
  return `\\frac{${N.latex()}}{${d}}`;
}

function numero(p) {
  try { return A.avaliar(p.toAST(), {}); } catch { return NaN; }
}

function fmt(x) { return formatNum(x, 6).replace(',', '{,}'); }

function eqLatex(l, op, r) { return `${l}${RELS[op] || op}${r}`; }

function inverterOp(op) { return { '<': '>', '>': '<', '<=': '>=', '>=': '<=', '=': '=', '!=': '!=' }[op]; }

// coeficientes inteiros de uma lista de Q (multiplica pelo MMC dos denominadores)
function inteirar(coefs) {
  let m = 1n;
  for (const c of coefs) m = mmcBig(m, c.d);
  return { k: m, c: coefs.map((c) => c.mul(new Q(m))) };
}

// ---------- equação ----------
export function resolverEquacao(ast, opts = {}) {
  if (ast.op !== '=') return resolverInequacao(ast, opts);
  const v = opts.var || escolherVar(ast);
  const passos = [];
  if (!v) {
    // sem variável: verifica se é verdadeira
    const a = deAST(ast.l, opts), b = deAST(ast.r, opts);
    const ok = a.sub(b).vazio || Math.abs(numero(a) - numero(b)) < 1e-12;
    return { tipo: 'verificacao', titulo: 'Verificação', entrada: L(ast), resposta: ok ? '\\text{Verdadeiro}' : '\\text{Falso}', passos: [{ titulo: 'Calculando os dois lados', texto: '', latex: `${latexConst(a)}\\;${ok ? '=' : '\\ne'}\\;${latexConst(b)}` }] };
  }
  const outras = [...A.variaveis(ast)].filter((x) => x !== v);
  const PL = deAST(ast.l, opts), PR = deAST(ast.r, opts);
  let D = PL.sub(PR);
  let excluir = [];

  // denominadores com x: multiplica tudo
  if (D.temDenominador()) {
    const { N, D: den } = D.fracao();
    const raizesDen = raizesReais(den, v);
    excluir = raizesDen.map((r) => r.num);
    passos.push({
      titulo: 'Tirando os denominadores',
      texto: `Juntamos tudo numa fração só e multiplicamos pelo denominador ${raizesDen.length ? `(lembrando que ${v} não pode ser ${raizesDen.map((r) => r.latex).join(' nem ')}, porque zeraria o denominador)` : ''}.`,
      latex: `\\frac{${N.latex(v)}}{${den.latex(v)}}=0\\;\\Rightarrow\\;${N.latex(v)}=0`,
      latexIsTeX: true,
    });
    D = N;
  }

  const coefs = D.coefsP(v);
  let res = null;
  if (coefs) {
    const grau = coefs.length - 1;
    const todosQ = coefs.every((c) => c.eQ);
    if (grau === 0) {
      const ok = coefs[0].vazio;
      passos.push({ titulo: 'Simplificando', texto: ok ? `O ${v} some e sobra uma igualdade sempre verdadeira.` : `O ${v} some e sobra uma igualdade falsa.`, latex: `${coefs[0].latex()}=0` });
      return { tipo: 'equacao', titulo: 'Equação', entrada: L(ast), resposta: ok ? `\\text{Qualquer número real (infinitas soluções)}` : `\\text{Não tem solução}`, conjunto: ok ? 'S=\\mathbb{R}' : 'S=\\varnothing', passos };
    }
    if (grau === 1) res = linear(ast, PL, PR, coefs, v, passos, opts);
    else if (grau === 2 && todosQ) res = quadratica(ast, coefs.map((c) => c.q), v, passos, opts, D);
    else if (todosQ && ocorrencias(ast, v) !== 1) res = polinomial(ast, coefs.map((c) => c.q), v, passos, opts);
  }
  if (!res && ocorrencias(ast, v) === 1 && !outras.length) {
    res = isolar(ast, v, passos, opts);
  }
  if (!res && coefs && coefs.length - 1 >= 3 && coefs.every((c) => c.eQ)) res = polinomial(ast, coefs.map((c) => c.q), v, passos, opts);
  if (!res) {
    if (outras.length) throw new ErroMat(`Não consegui isolar ${v} com as outras letras (${outras.join(', ')}). Tente “Explicar com IA”.`);
    res = numerica(ast, v, passos, opts);
  }
  // tira soluções proibidas
  if (excluir.length && res.raizes) {
    const antes = res.raizes.length;
    res.raizes = res.raizes.filter((r) => !excluir.some((e) => Math.abs(e - r.num) < 1e-9));
    if (res.raizes.length !== antes) passos.push({ titulo: 'Condição de existência', texto: 'Descartamos a solução que zera o denominador.', latex: res.raizes.length ? res.raizes.map((r) => `${v}=${r.latex}`).join(',\\;') : '\\varnothing' });
  }
  return montarResposta(ast, v, res, passos);
}

function montarResposta(ast, v, res, passos) {
  const rz = res.raizes || [];
  let resposta;
  if (!rz.length) resposta = res.semRaizTexto || '\\text{Não tem solução real}';
  else resposta = rz.map((r) => `${v}${r.aprox ? '\\approx ' : '='}${r.latex}`).join(rz.length > 1 ? '\\quad\\text{ou}\\quad ' : '');
  const conjunto = rz.length ? `S=\\left\\{${rz.map((r) => r.latex).join(';\\ ')}\\right\\}` : 'S=\\varnothing';
  const decimais = rz.filter((r) => !r.aprox && !Number.isInteger(r.num) && isFinite(r.num)).map((r) => `${v} ≈ ${formatNum(r.num, 6)}`);
  return { tipo: 'equacao', titulo: res.titulo || 'Equação', entrada: L(ast), resposta, conjunto, decimal: decimais.join('  ·  ') || null, passos, aproximado: rz.some((r) => r.aprox), extra: res.extra };
}

function ocorrencias(n, v) {
  if (!n || typeof n !== 'object') return 0;
  if (n.t === 'var') return n.n === v ? 1 : 0;
  let c = 0;
  for (const k of ['l', 'r', 'a', 'idx', 'base']) if (n[k]) c += ocorrencias(n[k], v);
  return c;
}

function raiz(p, aprox = false) { return { p, latex: p ? latexConst(p) : '', num: p ? numero(p) : NaN, aprox }; }

// ---------- 1º grau ----------
function linear(ast, PL, PR, coefs, v, passos, opts) {
  const a = coefs[1], b = coefs[0]; // a·v + b = 0
  const cL = PL.coefsP(v), cR = PR.coefsP(v);
  const vx = P.var(v);
  const ladoL = (cL && cL.length <= 2) ? cL : null, ladoR = (cR && cR.length <= 2) ? cR : null;
  if (ladoL && ladoR) {
    const aL = ladoL[1] || new P(), bL = ladoL[0], aR = ladoR[1] || new P(), bR = ladoR[0];
    const reduzL = aL.mul(vx).add(bL), reduzR = aR.mul(vx).add(bR);
    const jaReduzido = L(A.latex ? ast.l : ast.l) === reduzL.latex(v) && L(ast.r) === reduzR.latex(v);
    if (!jaReduzido) passos.push({ titulo: 'Arrumando cada lado', texto: 'Fazemos as distributivas e juntamos os termos parecidos em cada lado.', latex: eqLatex(reduzL.latex(v), '=', reduzR.latex(v)) });
    // termos com x para a esquerda, números para a direita
    const esq = [], dir = [];
    if (!aL.vazio) esq.push(aL.mul(vx).latex(v));
    if (!aR.vazio) esq.push(aR.neg().mul(vx).latex(v));
    if (!bR.vazio) dir.push(bR.latex());
    if (!bL.vazio) dir.push(bL.neg().latex());
    const junta = (arr) => arr.length ? arr.map((s, i) => (i && !s.startsWith('-') ? '+' + s : s)).join('') : '0';
    if (!aR.vazio || !bL.vazio) passos.push({ titulo: `Separando ${v} dos números`, texto: `Passamos os termos com ${v} para a esquerda e os números para a direita. Quem muda de lado troca o sinal.`, latex: eqLatex(junta(esq), '=', junta(dir)) });
    const A1 = aL.sub(aR), B1 = bR.sub(bL);
    if (esq.length > 1 || dir.length > 1) passos.push({ titulo: 'Juntando', texto: 'Somamos os termos de cada lado.', latex: eqLatex(A1.mul(vx).latex(v), '=', B1.latex()) });
    return isolarCoef(A1, B1, v, passos, ast, opts);
  }
  return isolarCoef(a, b.neg(), v, passos, ast, opts);
}

function isolarCoef(a, b, v, passos, ast, opts) {
  // a·v = b
  let x;
  if (a.eQ) {
    if (!a.q.isOne) {
      x = b.mulQ(a.q.inv());
      passos.push({ titulo: `Isolando ${v}`, texto: a.q.eq(-1) ? `Multiplicamos os dois lados por −1.` : `Dividimos os dois lados por ${a.q.isNeg ? '(' + a.q.toString().replace('/', '÷') + ')' : a.q.toString().replace('/', '÷')}.`, latex: a.q.eq(-1) ? `${v}=${latexConst(x)}` : `${v}=\\frac{${b.latex()}}{${a.latex()}}=${latexConst(x)}` });
    } else x = b;
  } else {
    x = b.div(a);
    passos.push({ titulo: `Isolando ${v}`, texto: `Dividimos os dois lados por ${'$'}.`.replace('$', '') + '', latex: `${v}=\\frac{${b.latex()}}{${a.latex()}}=${x.toASTBonito ? L(x.toASTBonito()) : x.latex()}` });
    return { titulo: 'Equação do 1º grau (literal)', raizes: [{ p: x, latex: L(x.toASTBonito()), num: NaN }] };
  }
  verificar(ast, v, [x], passos, opts);
  return { titulo: 'Equação do 1º grau', raizes: [raiz(x)] };
}

function verificar(ast, v, xs, passos, opts) {
  for (const x of xs) {
    if (!x.constante) continue;
    try {
      const subL = deAST(A.substituir(ast.l, v, x.toAST()), opts), subR = deAST(A.substituir(ast.r, v, x.toAST()), opts);
      const ok = subL.sub(subR).vazio || Math.abs(numero(subL) - numero(subR)) < 1e-9 * (1 + Math.abs(numero(subL)));
      if (ok) passos.push({ titulo: 'Conferindo', texto: `Trocando ${v} por ${latexConst(x)} na equação original, os dois lados dão o mesmo resultado.`, latex: `${latexConst(subL)}=${latexConst(subR)}\\;\\checkmark` });
    } catch { /* ignora verificação */ }
  }
}

// ---------- 2º grau ----------
function quadratica(ast, c, v, passos, opts, D) {
  let [cc, bb, aa] = c;
  // forma padrão
  const forma = P.dePoli(c, v);
  passos.push({ titulo: 'Forma geral', texto: `Passamos tudo para um lado para ficar na forma a${v}²+b${v}+c=0.`, latex: `${forma.latex(v)}=0` });
  if ([aa, bb, cc].some((q) => !q.isInt)) {
    const t = inteirar([cc, bb, aa]);
    [cc, bb, aa] = t.c;
    passos.push({ titulo: 'Tirando as frações', texto: `Multiplicamos tudo por ${t.k} para trabalhar só com inteiros.`, latex: `${P.dePoli([cc, bb, aa], v).latex(v)}=0` });
  }
  // divide por fator comum
  const g = mdcBig(mdcBig(aa.n, bb.n), cc.n);
  if (g > 1n) {
    [cc, bb, aa] = [cc, bb, aa].map((q) => q.div(new Q(g)));
    passos.push({ titulo: 'Simplificando', texto: `Todos os coeficientes são divisíveis por ${g}: dividimos a equação por ${g}.`, latex: `${P.dePoli([cc, bb, aa], v).latex(v)}=0` });
  }
  if (aa.isNeg) {
    [cc, bb, aa] = [cc, bb, aa].map((q) => q.neg());
    passos.push({ titulo: 'Deixando o a positivo', texto: 'Multiplicamos por −1 (não muda as soluções).', latex: `${P.dePoli([cc, bb, aa], v).latex(v)}=0` });
  }
  const ql = (q) => q.toLatex();
  passos.push({ titulo: 'Coeficientes', texto: 'Identificamos a, b e c.', latex: `a=${ql(aa)},\\quad b=${ql(bb)},\\quad c=${ql(cc)}` });
  const V = P.var(v);
  if (cc.isZero) {
    // a x² + b x = 0 → x(ax+b) = 0
    const x2 = P.c(bb.neg().div(aa));
    passos.push({ titulo: `Colocando ${v} em evidência`, texto: `Como c = 0, colocamos ${v} em evidência. Um produto é zero quando um dos fatores é zero.`, latex: `${v}\\left(${P.dePoli([bb, aa], v).latex(v)}\\right)=0\\;\\Rightarrow\\;${v}=0\\;\\text{ ou }\\;${P.dePoli([bb, aa], v).latex(v)}=0` });
    passos.push({ titulo: 'Resolvendo', texto: '', latex: `${v}_1=0,\\quad ${v}_2=${latexConst(x2)}` });
    const rs = [raiz(new P()), raiz(x2)].sort((a, b) => a.num - b.num);
    return { titulo: 'Equação do 2º grau (incompleta)', raizes: dedup(rs) };
  }
  if (bb.isZero) {
    const k = cc.neg().div(aa);
    passos.push({ titulo: `Isolando ${v}²`, texto: `Como b = 0, isolamos ${v}².`, latex: `${v}^{2}=${k.toLatex()}` });
    if (k.isNeg) {
      passos.push({ titulo: 'Sem solução real', texto: `Nenhum número real ao quadrado dá negativo.`, latex: `${v}^{2}=${k.toLatex()}<0` });
      const im = P.c(k.neg()).pow(new Q(1n, 2n));
      return { titulo: 'Equação do 2º grau (incompleta)', raizes: [], semRaizTexto: '\\text{Não tem solução real}', extra: `Nos complexos: ${v} = ±${latexConst(im)}i` };
    }
    const r = P.c(k).pow(new Q(1n, 2n));
    passos.push({ titulo: 'Tirando a raiz', texto: 'Tiramos a raiz quadrada dos dois lados; lembre do ±.', latex: `${v}=\\pm\\sqrt{${k.toLatex()}}=\\pm ${latexConst(r)}` });
    return { titulo: 'Equação do 2º grau (incompleta)', raizes: [raiz(r.neg()), raiz(r)] };
  }
  const delta = bb.mul(bb).sub(aa.mul(cc).mul(4));
  passos.push({ titulo: 'Calculando o Δ (delta)', texto: 'Fórmula: Δ = b² − 4·a·c', latex: `\\Delta=${par(bb)}^{2}-4\\cdot ${par(aa)}\\cdot ${par(cc)}=${bb.mul(bb).toLatex()}${aa.mul(cc).mul(4).isNeg ? '+' + aa.mul(cc).mul(4).neg().toLatex() : '-' + aa.mul(cc).mul(4).toLatex()}=${delta.toLatex()}` });
  const den = aa.mul(2);
  if (delta.isNeg) {
    passos.push({ titulo: 'Δ negativo', texto: 'Como Δ < 0, a equação não tem raízes reais (a parábola não corta o eixo x).', latex: `\\Delta=${delta.toLatex()}<0` });
    const re = P.c(bb.neg().div(den)), im = P.c(delta.neg()).pow(new Q(1n, 2n)).mulQ(den.inv());
    return { titulo: 'Equação do 2º grau', raizes: [], semRaizTexto: '\\text{Não tem solução real}\\;(\\Delta<0)', extra: `Nos números complexos: ${v} = ${latexConst(re)} ± ${latexConst(im)}·i` };
  }
  const sd = P.c(delta).pow(new Q(1n, 2n));
  const formula = `${v}=\\frac{-b\\pm\\sqrt{\\Delta}}{2a}=\\frac{${bb.neg().toLatex()}\\pm\\sqrt{${delta.toLatex()}}}{2\\cdot ${par(aa)}}`;
  if (delta.isZero) {
    const x = P.c(bb.neg().div(den));
    passos.push({ titulo: 'Fórmula de Bhaskara', texto: 'Como Δ = 0, as duas raízes são iguais (uma raiz dupla).', latex: `${formula}=${latexConst(x)}` });
    return { titulo: 'Equação do 2º grau', raizes: [raiz(x)] };
  }
  passos.push({ titulo: 'Fórmula de Bhaskara', texto: `Δ > 0: duas raízes reais diferentes.${sd.eQ ? '' : ' √Δ não é exata, então simplificamos a raiz.'}`, latex: `${formula}=\\frac{${bb.neg().toLatex()}\\pm ${latexConst(sd)}}{${den.toLatex()}}` });
  const x1 = P.c(bb.neg()).add(sd).mulQ(den.inv());
  const x2 = P.c(bb.neg()).sub(sd).mulQ(den.inv());
  passos.push({ titulo: 'As duas raízes', texto: 'Uma com + e outra com −.', latex: `${v}_1=\\frac{${bb.neg().toLatex()}+${latexConst(sd)}}{${den.toLatex()}}=${latexConst(x1)},\\qquad ${v}_2=\\frac{${bb.neg().toLatex()}-${latexConst(sd)}}{${den.toLatex()}}=${latexConst(x2)}` });
  const rs = [raiz(x1), raiz(x2)].sort((a, b) => a.num - b.num);
  if (sd.eQ) passos.push({ titulo: 'Dica: soma e produto', texto: 'Confira: a soma das raízes é −b/a e o produto é c/a.', latex: `${v}_1+${v}_2=${bb.neg().div(aa).toLatex()},\\quad ${v}_1\\cdot ${v}_2=${cc.div(aa).toLatex()}` });
  return { titulo: 'Equação do 2º grau', raizes: rs };
}

function par(q) { return q.isNeg || !q.isInt ? `\\left(${q.toLatex()}\\right)` : q.toLatex(); }
function dedup(rs) { const o = []; for (const r of rs) if (!o.some((x) => Math.abs(x.num - r.num) < 1e-12)) o.push(r); return o; }

// ---------- grau 3 ou mais ----------
function polinomial(ast, c, v, passos, opts) {
  const forma = P.dePoli(c, v);
  passos.push({ titulo: 'Forma geral', texto: 'Passamos tudo para um lado.', latex: `${forma.latex(v)}=0` });
  let co = inteirar(c).c;
  if (c.some((q) => !q.isInt)) passos.push({ titulo: 'Tirando as frações', texto: 'Multiplicamos tudo pelo MMC dos denominadores.', latex: `${P.dePoli(co, v).latex(v)}=0` });
  const raizes = [];
  // x em evidência
  let k = 0;
  while (co.length > 1 && co[0].isZero) { co = co.slice(1); k++; }
  if (k) {
    passos.push({ titulo: `Colocando ${v} em evidência`, texto: `Todos os termos têm ${v}${k > 1 ? '^' + k : ''}: então ${v} = 0 é uma raiz.`, latex: `${v}${k > 1 ? `^{${k}}` : ''}\\left(${P.dePoli(co, v).latex(v)}\\right)=0` });
    raizes.push(raiz(new P()));
  }
  // raízes racionais + Briot-Ruffini
  let guard = 0;
  while (co.length - 1 > 2 && guard++ < 10) {
    const r = raizRacional(co);
    if (!r) break;
    const { q } = divPoli(co, [r.neg(), Q.ONE]);
    passos.push({ titulo: 'Achando uma raiz', texto: `Testando divisores do termo independente divididos pelos divisores do coeficiente líder, ${v} = ${r.toString()} zera o polinômio.`, latex: `p(${r.toLatex()})=0` });
    passos.push({ titulo: 'Briot-Ruffini', texto: `Dividimos por (${v} ${r.isNeg ? '+' : '−'} ${r.abs().toString()}) e o grau diminui.`, latex: ruffini(co, r) + `\\;\\Rightarrow\\;${P.dePoli(q, v).latex(v)}=0` });
    raizes.push(raiz(P.c(r)));
    co = q;
  }
  if (co.length - 1 === 2) {
    const sub = quadratica(ast, co, v, passos, opts);
    raizes.push(...sub.raizes);
    const rs = dedup(raizes).sort((a, b) => a.num - b.num);
    return { titulo: 'Equação polinomial', raizes: rs, extra: sub.extra };
  }
  if (co.length - 1 === 1) {
    const x = P.c(co[0].neg().div(co[1]));
    passos.push({ titulo: 'Último fator', texto: '', latex: `${P.dePoli(co, v).latex(v)}=0\\Rightarrow ${v}=${latexConst(x)}` });
    raizes.push(raiz(x));
    return { titulo: 'Equação polinomial', raizes: dedup(raizes).sort((a, b) => a.num - b.num) };
  }
  // sobrou grau ≥ 3 sem raiz racional: numérico
  const num = raizesNumericas((x) => horner(co, x));
  passos.push({ titulo: 'Raízes aproximadas', texto: 'Este polinômio não tem raízes racionais. Calculamos as raízes reais por aproximação numérica (método de Newton).', latex: num.length ? num.map((x) => `${v}\\approx ${fmt(x)}`).join(',\\;') : '\\text{sem raízes reais}' });
  for (const x of num) raizes.push({ p: null, latex: fmt(x), num: x, aprox: true });
  return { titulo: 'Equação polinomial', raizes: dedup(raizes).sort((a, b) => a.num - b.num) };
}

function horner(co, x) { let r = 0; for (let i = co.length - 1; i >= 0; i--) r = r * x + co[i].toNumber(); return r; }

function divisores(n) {
  n = n < 0n ? -n : n;
  const d = [];
  if (n > 10n ** 12n) return [1n];
  for (let i = 1n; i * i <= n; i++) if (n % i === 0n) { d.push(i); if (i * i !== n) d.push(n / i); }
  return d;
}
function raizRacional(co) {
  const a0 = co[0].n, an = co[co.length - 1].n;
  if (a0 === 0n) return Q.ZERO;
  const ps = divisores(a0), qs = divisores(an);
  const cand = [];
  for (const p of ps) for (const q of qs) { cand.push(new Q(p, q)); cand.push(new Q(-p, q)); }
  cand.sort((a, b) => Math.abs(a.toNumber()) - Math.abs(b.toNumber()) || a.cmp(b));
  for (const r of cand) {
    let s = Q.ZERO;
    for (let i = co.length - 1; i >= 0; i--) s = s.mul(r).add(co[i]);
    if (s.isZero) return r;
  }
  return null;
}
function ruffini(co, r) {
  const n = co.length - 1;
  const top = [], bot = [];
  let acc = Q.ZERO;
  for (let i = n; i >= 0; i--) {
    top.push(co[i].toLatex());
    acc = i === n ? co[i] : acc.mul(r).add(co[i]);
    bot.push(acc.toLatex());
  }
  return `\\begin{array}{c|${'c'.repeat(n + 1)}}${r.toLatex()} & ${top.join(' & ')}\\\\ & ${bot.join(' & ')}\\end{array}`;
}

// ---------- isolando com operações inversas ----------
function isolar(ast, v, passos, opts) {
  let ramos = [{ l: ast.l, r: ast.r }];
  if (!A.temVar(ast.l, v)) ramos = [{ l: ast.r, r: ast.l }];
  const final = [];
  let titulo = 'Equação';
  const simp = (n) => { try { return deAST(n, opts).toAST(); } catch (e) { if (e instanceof ErroMat) throw e; return n; } };
  let guard = 0;
  while (ramos.length && guard++ < 40) {
    const nov = [];
    for (const ramo of ramos) {
      const { l, r } = ramo;
      if (l.t === 'var') { final.push(r); continue; }
      const st = passoInverso(l, r, v);
      if (!st) throw new ErroMat('Não consegui isolar a variável.');
      if (st.titulo) titulo = st.titulo;
      if (st.falha) { passos.push({ titulo: st.nome, texto: st.texto, latex: st.latex || '' }); continue; }
      const ns = st.novos.map((x) => ({ l: x.l, r: simp(x.r) }));
      passos.push({ titulo: st.nome, texto: st.texto, latex: ns.map((x) => eqLatex(L(x.l), '=', L(x.r))).join('\\quad\\text{ou}\\quad ') });
      nov.push(...ns);
    }
    ramos = nov;
  }
  const raizes = [];
  for (const r of final) {
    let p;
    try { p = deAST(r, opts); } catch (e) { if (e instanceof ErroMat) { passos.push({ titulo: 'Sem solução nesse caso', texto: e.message, latex: '' }); continue; } throw e; }
    const num = numero(p);
    if (!isFinite(num)) continue;
    // confere na original (descarta soluções estranhas, ex.: elevar ao quadrado)
    let ok = true;
    try {
      const lv = A.avaliar(ast.l, { [v]: num }, opts), rv = A.avaliar(ast.r, { [v]: num }, opts);
      ok = Math.abs(lv - rv) <= 1e-7 * (1 + Math.abs(lv) + Math.abs(rv));
    } catch { ok = false; }
    if (!ok) { passos.push({ titulo: 'Conferindo', texto: `${v} = ${latexConst(p)} não serve: não satisfaz a equação original.`, latex: '' }); continue; }
    raizes.push(raiz(p));
  }
  return { titulo, raizes: dedup(raizes).sort((a, b) => a.num - b.num) };
}

function passoInverso(l, r, v) {
  const tem = (n) => A.temVar(n, v);
  const um = (nl, nr, nome, texto, titulo) => ({ novos: [{ l: nl, r: nr }], nome, texto, titulo });
  switch (l.t) {
    case '+':
      if (tem(l.l) && !tem(l.r)) return um(l.l, A.sub(r, l.r), 'Passando para o outro lado', `Subtraímos ${L(l.r)} dos dois lados.`);
      if (tem(l.r) && !tem(l.l)) return um(l.r, A.sub(r, l.l), 'Passando para o outro lado', `Subtraímos ${L(l.l)} dos dois lados.`);
      return null;
    case '-':
      if (tem(l.l) && !tem(l.r)) return um(l.l, A.add(r, l.r), 'Passando para o outro lado', `Somamos ${L(l.r)} aos dois lados.`);
      if (tem(l.r) && !tem(l.l)) return um(l.r, A.sub(l.l, r), 'Passando para o outro lado', `Isolamos o termo com ${v}.`);
      return null;
    case 'neg': return um(l.a, A.neg(r), 'Trocando o sinal', 'Multiplicamos os dois lados por −1.');
    case '*':
      if (tem(l.l) && !tem(l.r)) return um(l.l, A.dvd(r, l.r), 'Dividindo', `Dividimos os dois lados por ${L(l.r)}.`);
      if (tem(l.r) && !tem(l.l)) return um(l.r, A.dvd(r, l.l), 'Dividindo', `Dividimos os dois lados por ${L(l.l)}.`);
      return null;
    case '/':
      if (tem(l.l) && !tem(l.r)) return um(l.l, A.mul(r, l.r), 'Multiplicando', `Multiplicamos os dois lados por ${L(l.r)}.`);
      if (tem(l.r) && !tem(l.l)) return um(l.r, A.dvd(l.l, r), 'Invertendo', `O ${v} está no denominador: trocamos de lugar com o outro lado.`);
      return null;
    case '^': {
      if (tem(l.l) && !tem(l.r)) {
        // x^n = r
        let e;
        try { e = deAST(l.r); } catch { return null; }
        if (e.eQ && e.q.isInt && e.q.n % 2n === 0n) {
          const n = e.q;
          let rv; try { rv = A.avaliar(r, {}); } catch { rv = NaN; }
          if (rv < 0) return { falha: true, nome: 'Sem solução real', texto: `Potência de expoente par nunca dá negativo.`, latex: `${L(l)}=${L(r)}` };
          const raizN = n.n === 2n ? A.sqrt(r) : A.sqrt(r, A.num(n));
          return { novos: [{ l: l.l, r: raizN }, { l: l.l, r: A.neg(raizN) }], nome: 'Tirando a raiz', texto: `Tiramos a raiz ${n.n === 2n ? 'quadrada' : 'de índice ' + n.toString()} dos dois lados (expoente par: vale + e −).` };
        }
        if (e.eQ && e.q.isInt) return um(l.l, A.sqrt(r, A.num(e.q)), 'Tirando a raiz', `Tiramos a raiz de índice ${e.q.toString()} dos dois lados.`);
        return um(l.l, A.pow(r, A.dvd(A.num(1), l.r)), 'Elevando ao inverso', `Elevamos os dois lados a 1/(${L(l.r)}).`);
      }
      if (tem(l.r) && !tem(l.l)) {
        // b^f = r → f = log_b(r)
        let rv; try { rv = A.avaliar(r, {}); } catch { rv = NaN; }
        if (rv <= 0) return { falha: true, nome: 'Sem solução', texto: 'Uma potência de base positiva nunca dá zero ou negativo.', latex: `${L(l)}=${L(r)}`, titulo: 'Equação exponencial' };
        // tenta escrever r como potência de b
        try {
          const pb = deAST(l.l), pr = deAST(r);
          if (pb.eQ && pr.eQ) {
            const k = Q.fromFloat(Math.log(pr.q.toNumber()) / Math.log(pb.q.toNumber()), 1000n);
            if (k && pb.pow(k).igual(pr)) {
              return { novos: [{ l: l.r, r: A.num(k) }], nome: 'Mesma base', texto: `Escrevemos ${L(r)} como potência de ${L(l.l)}: ${L(r)} = ${L(l.l)}^{${k.toString()}}. Bases iguais ⇒ expoentes iguais.`, titulo: 'Equação exponencial' };
            }
          }
        } catch { /* segue */ }
        const ehE = l.l.t === 'const' && l.l.n === 'e';
        return um(l.r, ehE ? A.fn('ln', r) : A.fn('log', r, l.l), 'Aplicando logaritmo', ehE ? 'Aplicamos ln (logaritmo natural) dos dois lados.' : `Aplicamos logaritmo na base ${L(l.l)} dos dois lados.`, 'Equação exponencial');
      }
      return null;
    }
    case 'sqrt': {
      let rv; try { rv = A.avaliar(r, {}); } catch { rv = NaN; }
      if (rv < 0 && !l.idx) return { falha: true, nome: 'Sem solução real', texto: 'A raiz quadrada nunca é negativa.', latex: `${L(l)}=${L(r)}`, titulo: 'Equação irracional' };
      const k = l.idx || A.num(2);
      return um(l.a, A.pow(r, k), 'Elevando os dois lados', `Elevamos os dois lados ${L(k) === '2' ? 'ao quadrado' : 'à potência ' + L(k)} para sumir com a raiz.`, 'Equação irracional');
    }
    case 'fn': {
      const a = l.a;
      switch (l.n) {
        case 'ln': return um(a, A.pow(A.cst('e'), r), 'Tirando o logaritmo', 'Pela definição de logaritmo: ln(u) = k ⇔ u = eᵏ.', 'Equação logarítmica');
        case 'log': return um(a, A.pow(l.base || A.num(10), r), 'Tirando o logaritmo', `Pela definição: log${l.base ? '_' + L(l.base) : ''}(u) = k ⇔ u = ${l.base ? L(l.base) : '10'}ᵏ.`, 'Equação logarítmica');
        case 'exp': return um(a, A.fn('ln', r), 'Aplicando ln', 'Aplicamos ln dos dois lados.', 'Equação exponencial');
        case 'sin': case 'cos': case 'tan': {
          let rv; try { rv = A.avaliar(r, {}); } catch { rv = NaN; }
          if ((l.n !== 'tan') && Math.abs(rv) > 1) return { falha: true, nome: 'Sem solução', texto: `${l.n === 'sin' ? 'Seno' : 'Cosseno'} só vai de −1 a 1.`, latex: '' };
          const inv = { sin: 'asin', cos: 'acos', tan: 'atan' }[l.n];
          return um(a, A.fn(inv, r), 'Função inversa', `Usamos a função inversa (arco). Esta é a solução principal; somando voltas completas (2π) há outras.`, 'Equação trigonométrica');
        }
      }
      return null;
    }
    case 'abs': return { novos: [{ l: l.a, r }, { l: l.a, r: A.neg(r) }], nome: 'Tirando o módulo', texto: 'Módulo igual a k: o que está dentro vale k ou −k.', titulo: 'Equação modular' };
  }
  return null;
}

// ---------- numérico ----------
export function raizesNumericas(f, a = -1000, b = 1000) {
  const xs = [];
  const pts = [];
  // malha mais densa perto de zero
  for (let i = -2000; i <= 2000; i++) { const t = i / 2000; pts.push(Math.sign(t) * Math.pow(Math.abs(t), 3) * (b - a) / 2); }
  let px = pts[0], pf = seguro(f, px);
  for (let i = 1; i < pts.length; i++) {
    const x = pts[i], fx = seguro(f, x);
    if (isFinite(fx) && Math.abs(fx) < 1e-12) xs.push(x);
    else if (isFinite(pf) && isFinite(fx) && pf * fx < 0) {
      const r = bissecao(f, px, x);
      if (r !== null && Math.abs(seguro(f, r)) < 1e-6 * (1 + Math.abs(pf) + Math.abs(fx))) xs.push(r);
    }
    px = x; pf = fx;
  }
  const lim = xs.map((x) => (Math.abs(x - Math.round(x)) < 1e-9 ? Math.round(x) : x)).sort((a, b) => a - b);
  return lim.filter((x, i) => i === 0 || Math.abs(x - lim[i - 1]) > 1e-7);
}
function seguro(f, x) { try { const y = f(x); return typeof y === 'number' ? y : NaN; } catch { return NaN; } }
function bissecao(f, a, b) {
  let fa = seguro(f, a);
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2, fm = seguro(f, m);
    if (!isFinite(fm)) return null;
    if (fm === 0 || (b - a) / 2 < 1e-14 * (1 + Math.abs(m))) return m;
    if (fa * fm < 0) b = m; else { a = m; fa = fm; }
  }
  return (a + b) / 2;
}

function numerica(ast, v, passos, opts) {
  const f = (x) => A.avaliar(ast.l, { [v]: x }, opts) - A.avaliar(ast.r, { [v]: x }, opts);
  const xs = raizesNumericas(f);
  passos.push({ titulo: 'Solução numérica', texto: `Não há um jeito algébrico simples de isolar ${v}. Procuramos onde os dois lados ficam iguais (troca de sinal de f(${v}) = lado esquerdo − lado direito) e refinamos pelo método da bisseção.`, latex: xs.length ? xs.map((x) => `${v}\\approx ${fmt(x)}`).join(',\\;') : '\\text{nenhuma solução real encontrada entre }-1000\\text{ e }1000' });
  return { titulo: 'Equação (solução numérica)', raizes: xs.map((x) => { const q = Q.fromFloat(x, 1000n); return q && Math.abs(f(q.toNumber())) < 1e-12 ? raiz(P.c(q)) : { p: null, latex: fmt(x), num: x, aprox: true }; }) };
}

// raízes reais (para condições de existência e estudo de sinal)
export function raizesReais(p, v) {
  const c = p.coefsQ(v);
  if (!c) return [];
  if (c.length - 1 === 0) return [];
  if (c.length - 1 === 1) { const x = P.c(c[0].neg().div(c[1])); return [raiz(x)]; }
  if (c.length - 1 === 2) {
    const [cc, bb, aa] = c;
    const d = bb.mul(bb).sub(aa.mul(cc).mul(4));
    if (d.isNeg) return [];
    const sd = P.c(d).pow(new Q(1n, 2n));
    const den = aa.mul(2).inv();
    const r1 = P.c(bb.neg()).sub(sd).mulQ(den), r2 = P.c(bb.neg()).add(sd).mulQ(den);
    return dedup([raiz(r1), raiz(r2)]).sort((a, b) => a.num - b.num);
  }
  // fatores racionais + numérico
  let co = inteirar(c).c;
  const out = [];
  let k = 0;
  while (co.length > 1 && co[0].isZero) { co = co.slice(1); k++; }
  if (k) out.push(raiz(new P()));
  let g = 0;
  while (co.length - 1 > 2 && g++ < 10) {
    const r = raizRacional(co);
    if (!r) break;
    out.push(raiz(P.c(r)));
    co = divPoli(co, [r.neg(), Q.ONE]).q;
  }
  if (co.length - 1 <= 2) out.push(...raizesReais(P.dePoli(co, v), v));
  else for (const x of raizesNumericas((t) => horner(co, t))) out.push({ p: null, latex: fmt(x), num: x, aprox: true });
  return dedup(out).sort((a, b) => a.num - b.num);
}

// ---------- inequações ----------
export function resolverInequacao(ast, opts = {}) {
  const v = escolherVar(ast);
  if (!v) throw new ErroMat('A desigualdade não tem variável.');
  if (A.variaveis(ast).size > 1) throw new ErroMat('Inequação com mais de uma letra ainda não é aceita no modo offline.');
  let op = ast.op;
  if (op === '!=') throw new ErroMat('Use = para equações ou <, >, ≤, ≥ para inequações.');
  const passos = [];
  const D = deAST(ast.l, opts).sub(deAST(ast.r, opts));
  const coefs = D.temDenominador() ? null : D.coefsQ(v);
  // 1º grau: passo a passo clássico
  if (coefs && coefs.length === 2) {
    const PL = deAST(ast.l, opts), PR = deAST(ast.r, opts);
    const cL = PL.coefsQ(v) || [Q.ZERO], cR = PR.coefsQ(v) || [Q.ZERO];
    const aL = cL[1] || Q.ZERO, bL = cL[0], aR = cR[1] || Q.ZERO, bR = cR[0];
    const a = aL.sub(aR), b = bR.sub(bL);
    const ax = P.dePoli([Q.ZERO, a], v).latex(v);
    passos.push({ titulo: `Separando ${v} dos números`, texto: `Como numa equação: termos com ${v} para a esquerda e números para a direita, trocando o sinal de quem muda de lado.`, latex: eqLatex(ax, op, b.toLatex()) });
    const x = b.div(a);
    if (a.isNeg) {
      op = inverterOp(op);
      passos.push({ titulo: 'Atenção: dividindo por negativo', texto: `Dividimos os dois lados por ${a.toString()}. Quando multiplicamos ou dividimos uma desigualdade por número negativo, o sinal INVERTE.`, latex: eqLatex(v, op, x.toLatex()) });
    } else if (!a.isOne) passos.push({ titulo: `Isolando ${v}`, texto: `Dividimos os dois lados por ${a.toString()} (positivo: o sinal continua igual).`, latex: eqLatex(v, op, x.toLatex()) });
    const inter = intervaloSimples(op, x.toLatex());
    return { tipo: 'inequacao', titulo: 'Inequação do 1º grau', entrada: L(ast), resposta: eqLatex(v, op, x.toLatex()), conjunto: `S=\\left\\{${v}\\in\\mathbb{R}\\mid ${eqLatex(v, op, x.toLatex())}\\right\\}=${inter}`, decimal: x.isInt ? null : `${v} ${{ '<': '<', '>': '>', '<=': '≤', '>=': '≥' }[op]} ${x.toDecimal(6).txt}`, passos };
  }
  // geral: estudo do sinal de f = N/D
  const { N, D: Den } = D.fracao();
  const cN = N.coefsQ(v), cD = Den.coefsQ(v);
  if (!cN || !cD) return inequacaoNumerica(ast, v, op, passos, opts);
  passos.push({ titulo: 'Tudo de um lado', texto: 'Passamos tudo para a esquerda e comparamos com zero.', latex: eqLatex(Den.eQ ? N.latex(v) : `\\frac{${N.latex(v)}}{${Den.latex(v)}}`, op, '0') });
  const rN = raizesReais(N, v), rD = raizesReais(Den, v);
  if (cN.length === 3) {
    const [cc, bb, aa] = cN;
    const delta = bb.mul(bb).sub(aa.mul(cc).mul(4));
    passos.push({ titulo: 'Raízes', texto: 'Achamos onde a expressão vale zero (Bhaskara).', latex: `\\Delta=${delta.toLatex()}${rN.length ? ',\\quad ' + rN.map((r, i) => `${v}_${i + 1}=${r.latex}`).join(',\\;') : '\\;(\\text{sem raízes reais})'}` });
    passos.push({ titulo: 'Estudo do sinal', texto: aa.isNeg ? 'a < 0: a parábola tem a boca para baixo — positiva entre as raízes e negativa fora delas.' : 'a > 0: a parábola tem a boca para cima — negativa entre as raízes e positiva fora delas.', latex: '' });
  } else {
    passos.push({ titulo: 'Pontos críticos', texto: 'Achamos onde o numerador zera (e onde o denominador zera, que ficam de fora).', latex: [...rN.map((r) => `${v}=${r.latex}`), ...rD.map((r) => `${v}\\ne ${r.latex}`)].join(',\\;') || '\\text{nenhum}' });
  }
  const f = (x) => A.avaliar(N.toAST(), { [v]: x }) / A.avaliar(Den.toAST(), { [v]: x });
  const pontos = [...rN.map((r) => ({ ...r, den: false })), ...rD.map((r) => ({ ...r, den: true }))].sort((a, b) => a.num - b.num);
  const inter = intervalosSinal(f, pontos, op);
  passos.push({ titulo: 'Testando cada intervalo', texto: 'Escolhemos um número dentro de cada intervalo e vemos o sinal.', latex: inter.tabela });
  return { tipo: 'inequacao', titulo: 'Inequação', entrada: L(ast), resposta: inter.latex, conjunto: `S=${inter.latex}`, passos };
}

function intervaloSimples(op, x) {
  return { '<': `\\left]-\\infty;\\ ${x}\\right[`, '<=': `\\left]-\\infty;\\ ${x}\\right]`, '>': `\\left]${x};\\ +\\infty\\right[`, '>=': `\\left[${x};\\ +\\infty\\right[` }[op];
}

function intervalosSinal(f, pontos, op) {
  const quer = (s) => (op === '>' || op === '>=' ? s > 0 : s < 0);
  const inclui = op === '<=' || op === '>=';
  const xs = pontos.map((p) => p.num);
  const testes = [];
  if (!xs.length) testes.push(0);
  else {
    testes.push(xs[0] - 1);
    for (let i = 0; i + 1 < xs.length; i++) testes.push((xs[i] + xs[i + 1]) / 2);
    testes.push(xs[xs.length - 1] + 1);
  }
  const sinais = testes.map((t) => Math.sign(f(t)));
  const partes = [];
  const tab = [];
  for (let i = 0; i < testes.length; i++) {
    const esq = i === 0 ? '-\\infty' : pontos[i - 1].latex;
    const dir = i === testes.length - 1 ? '+\\infty' : pontos[i].latex;
    tab.push(`${v_(esq, dir)}:\\ ${sinais[i] > 0 ? '+' : sinais[i] < 0 ? '-' : '0'}`);
    if (quer(sinais[i])) {
      const fechEsq = i > 0 && inclui && !pontos[i - 1].den;
      const fechDir = i < testes.length - 1 && inclui && !pontos[i].den;
      partes.push({ esq, dir, fechEsq, fechDir, i });
    }
  }
  // pontos isolados (raiz dupla com ≥ / ≤)
  const isolados = [];
  if (inclui) pontos.forEach((p, k) => {
    if (p.den) return;
    const dentro = partes.some((pt) => (pt.i === k && pt.fechEsq) || (pt.i === k + 1 && pt.fechDir) || pt.i === k + 1 || pt.i === k);
    if (!dentro) isolados.push(p.latex);
  });
  // junta intervalos vizinhos
  const fund = [];
  for (const pt of partes) {
    const ult = fund[fund.length - 1];
    if (ult && ult.i + 1 === pt.i && ult.fechDir) { ult.dir = pt.dir; ult.fechDir = pt.fechDir; ult.i = pt.i; }
    else fund.push({ ...pt });
  }
  const txt = fund.map((p) => `\\left${p.fechEsq ? '[' : ']'}${p.esq};\\ ${p.dir}\\right${p.fechDir ? ']' : '['}`);
  if (isolados.length) txt.push(`\\left\\{${isolados.join(';\\ ')}\\right\\}`);
  return { latex: txt.length ? txt.join('\\cup ') : '\\varnothing', tabela: `\\begin{array}{l}${tab.join('\\\\')}\\end{array}` };
}
function v_(a, b) { return `\\left]${a};\\ ${b}\\right[`; }

function inequacaoNumerica(ast, v, op, passos, opts) {
  const f = (x) => A.avaliar(ast.l, { [v]: x }, opts) - A.avaliar(ast.r, { [v]: x }, opts);
  const xs = raizesNumericas(f);
  const pontos = xs.map((x) => ({ latex: fmt(x), num: x, den: false }));
  const inter = intervalosSinal(f, pontos, op);
  passos.push({ titulo: 'Estudo numérico do sinal', texto: 'Achamos (aproximadamente) onde os dois lados se igualam e testamos o sinal entre esses pontos.', latex: inter.tabela });
  return { tipo: 'inequacao', titulo: 'Inequação (aproximada)', entrada: L(ast), resposta: inter.latex, conjunto: `S\\approx ${inter.latex}`, passos, aproximado: true };
}

// ---------- sistemas lineares ----------
export function resolverSistema(ast, opts = {}) {
  const eqs = ast.eqs;
  if (eqs.some((e) => e.t !== 'eq' || e.op !== '=')) throw new ErroMat('No sistema, cada linha deve ser uma equação com “=”.');
  const vs = [...A.variaveis(ast)].sort();
  if (!vs.length) throw new ErroMat('O sistema não tem incógnitas.');
  if (vs.length > 6) throw new ErroMat('Sistema grande demais.');
  const passos = [];
  // cada linha: Σ a_j·v_j = b
  const linhas = eqs.map((e) => {
    const d = deAST(e.l, opts).sub(deAST(e.r, opts));
    const row = [];
    let resto = d;
    for (const v of vs) {
      const c = resto.coefsP(v);
      if (!c || c.length > 2 || (c[1] && !c[1].eQ)) throw new ErroMat('Sistema não linear: use “Explicar com IA”.');
      row.push(c[1] ? c[1].q : Q.ZERO);
      resto = c[0];
    }
    if (!resto.eQ) throw new ErroMat('Sistema não linear: use “Explicar com IA”.');
    row.push(resto.q.neg());
    return row;
  });
  const sysLatex = (M) => `\\begin{cases}${M.map((r) => linhaLatex(r, vs)).join('\\\\')}\\end{cases}`;
  passos.push({ titulo: 'Organizando', texto: 'Escrevemos cada equação com as letras à esquerda e o número à direita.', latex: sysLatex(linhas) });
  const M = linhas.map((r) => r.slice());
  const n = vs.length, m = M.length;
  let lin = 0;
  const pivos = [];
  for (let col = 0; col < n && lin < m; col++) {
    let p = -1;
    for (let i = lin; i < m; i++) if (!M[i][col].isZero && (p < 0 || M[i][col].abs().cmp(1) === 0)) { p = i; if (M[i][col].abs().cmp(1) === 0) break; }
    if (p < 0) continue;
    if (p !== lin) { [M[p], M[lin]] = [M[lin], M[p]]; }
    let mudou = false;
    for (let i = lin + 1; i < m; i++) {
      if (M[i][col].isZero) continue;
      const k = M[i][col].div(M[lin][col]);
      M[i] = M[i].map((x, j) => x.sub(k.mul(M[lin][j])));
      const kk = k.abs().isOne ? '' : `${k.abs().toString().replace('/', '÷')} vezes `;
      passos.push({ titulo: `Eliminando ${vs[col]}`, texto: `Método da adição: ${k.isNeg ? 'somamos' : 'subtraímos'} ${kk}a equação ${lin + 1} ${k.isNeg ? 'à' : 'da'} equação ${i + 1}, para sumir com ${vs[col]}.`, latex: sysLatex(M) });
      mudou = true;
    }
    pivos.push({ lin, col });
    lin++;
    void mudou;
  }
  // inconsistência / infinitas
  for (const r of M) {
    if (r.slice(0, n).every((x) => x.isZero)) {
      if (!r[n].isZero) {
        passos.push({ titulo: 'Contradição', texto: 'Apareceu 0 = número diferente de zero.', latex: `0=${r[n].toLatex()}` });
        return { tipo: 'sistema', titulo: 'Sistema linear', entrada: L(ast), resposta: '\\text{Sistema impossível (sem solução)}', conjunto: 'S=\\varnothing', passos };
      }
    }
  }
  if (pivos.length < n) {
    passos.push({ titulo: 'Infinitas soluções', texto: 'Sobraram menos equações independentes do que incógnitas.', latex: '' });
    return { tipo: 'sistema', titulo: 'Sistema linear', entrada: L(ast), resposta: '\\text{Sistema possível e indeterminado (infinitas soluções)}', passos };
  }
  // substituição de trás para frente
  const sol = new Array(n).fill(null);
  for (let k = pivos.length - 1; k >= 0; k--) {
    const { lin: i, col } = pivos[k];
    let b = M[i][n];
    const partes = [];
    for (let j = col + 1; j < n; j++) if (!M[i][j].isZero) { b = b.sub(M[i][j].mul(sol[j])); partes.push(vs[j]); }
    const x = b.div(M[i][col]);
    sol[col] = x;
    passos.push({ titulo: `Achando ${vs[col]}`, texto: partes.length ? `Substituímos ${partes.join(', ')} já encontrado(s) na equação e isolamos ${vs[col]}.` : `Isolamos ${vs[col]}.`, latex: `${linhaLatex(M[i], vs)}\\;\\Rightarrow\\;${vs[col]}=${x.toLatex()}` });
  }
  const resp = vs.map((v, i) => `${v}=${sol[i].toLatex()}`).join(',\\quad ');
  return { tipo: 'sistema', titulo: 'Sistema linear', entrada: L(ast), resposta: resp, conjunto: `S=\\left\\{\\left(${sol.map((s) => s.toLatex()).join(';\\ ')}\\right)\\right\\}`, passos };
}

function linhaLatex(r, vs) {
  const n = vs.length;
  let s = '';
  for (let j = 0; j < n; j++) {
    const c = r[j];
    if (c.isZero) continue;
    const t = P.dePoli([Q.ZERO, c], vs[j]).latex(vs[j]);
    s += s && !t.startsWith('-') ? '+' + t : t;
  }
  return `${s || '0'}=${r[n].toLatex()}`;
}
