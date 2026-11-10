// Análise de funções: f(x) = …, F(x,y) = …, y = …
// Domínio, forma simplificada, derivadas (parciais) e, para uma variável, raízes e corte no eixo y.
import { Q, ErroMat } from './racional.js';
import * as A from './ast.js';
import { P, deAST } from './poli.js';
import { resolverEquacao, resolverInequacao, raizesReais, latexConst } from './equacoes.js';
import { derivarComPassos } from './calculo.js';

const L = A.latex;
const OPL = { '!=': '\\ne ', '>=': '\\ge ', '>': '>', '<=': '\\le ', '<': '<' };

// junta as condições de existência percorrendo a expressão
function condicoes(n, out = []) {
  if (!n || typeof n !== 'object') return out;
  if (n.t === '/' && A.temVar(n.r)) out.push({ e: n.r, op: '!=', por: 'o denominador não pode ser zero' });
  if (n.t === 'sqrt' && A.temVar(n.a)) {
    let par = true;
    if (n.idx) { try { const k = deAST(n.idx); par = !(k.eQ && k.q.isInt && k.q.n % 2n === 1n); } catch { par = true; } }
    if (par) out.push({ e: n.a, op: '>=', por: 'raiz de índice par só existe para número maior ou igual a zero' });
  }
  if (n.t === 'fn' && (n.n === 'ln' || n.n === 'log') && A.temVar(n.a)) out.push({ e: n.a, op: '>', por: 'logaritmo só existe para número positivo' });
  if (n.t === 'fn' && (n.n === 'asin' || n.n === 'acos') && A.temVar(n.a)) {
    out.push({ e: A.sub(A.num(1), A.pow(n.a, A.num(2))), op: '>=', por: 'arco-seno e arco-cosseno só existem entre −1 e 1' });
  }
  if (n.t === '^' && A.temVar(n.l)) {
    try {
      const e = deAST(n.r);
      if (e.eQ && e.q.isNeg) out.push({ e: n.l, op: '!=', por: 'expoente negativo vira divisão: a base não pode ser zero' });
      if (e.eQ && !e.q.isInt && e.q.d % 2n === 0n) out.push({ e: n.l, op: e.q.isNeg ? '>' : '>=', por: 'expoente fracionário com denominador par é uma raiz par' });
    } catch { /* ignora */ }
  }
  for (const k of ['l', 'r', 'a', 'base']) if (n[k]) condicoes(n[k], out);
  return out;
}

// escreve "expressão op 0" de um jeito mais natural: x²+y² ≠ 1
function arrumarCondicao(c, vs) {
  let p;
  try { p = deAST(c.e); } catch { return { latex: `${L(c.e)}${OPL[c.op]}0`, p: null, op: c.op, k: null }; }
  const k = p.termos.find((t) => !t.m.length);
  const cte = k ? k.c : Q.ZERO;
  let esq = p.sub(P.c(cte));
  let dir = cte.neg();
  let op = c.op;
  const ord = esq.ordenados(vs[0]);
  if (ord.length && ord[0].c.isNeg) {
    esq = esq.neg(); dir = dir.neg();
    op = { '!=': '!=', '>=': '<=', '>': '<', '<=': '>=', '<': '>' }[op];
  }
  if (esq.vazio) return { latex: `${p.latex()}${OPL[c.op]}0`, p, op: c.op, k: null };
  return { latex: `${esq.latex(vs[0])}${OPL[op]}${dir.toLatex()}`, p, op: c.op, esq, dir, opArr: op };
}

function circunferencia(cond, vs) {
  // a(x² + y²) = r → circunferência
  if (vs.length !== 2 || !cond.esq) return null;
  const [x, y] = vs;
  const t = cond.esq.termos;
  if (t.length !== 2) return null;
  const ok = t.every((tt) => tt.m.length === 1 && tt.m[0][1].eq(2) && tt.c.eq(t[0].c)) && new Set(t.map((tt) => tt.m[0][0])).size === 2;
  if (!ok || !t.every((tt) => [`v:${x}`, `v:${y}`].includes(tt.m[0][0]))) return null;
  const r2 = cond.dir.div(t[0].c);
  if (r2.sign() <= 0) return null;
  const r = P.c(r2).pow(new Q(1n, 2n));
  return { raio: latexConst(r) };
}

export function analisarFuncao(no, opts = {}) {
  const { nome, vars, f } = no;
  const vs = vars.length ? vars : [...A.variaveis(f)].sort();
  if (!vs.length) throw new ErroMat('A função precisa ter pelo menos uma variável.');
  const extras = [...A.variaveis(f)].filter((v) => !vs.includes(v));
  const passos = [];
  const cab = `${nome}(${vs.join(',')})`;
  const defin = `${cab}=${L(f)}`;
  passos.push({ titulo: vs.length > 1 ? `Função de ${vs.length} variáveis` : 'Função de uma variável', texto: vs.length > 1 ? `${nome} depende de ${vs.join(' e ')}: para cada ponto (${vs.join(', ')}) ela dá um número.` : `Para cada valor de ${vs[0]}, a função dá um número.` + (extras.length ? ` As letras ${extras.join(', ')} são tratadas como constantes.` : ''), latex: defin });

  // forma simplificada
  let fs = f;
  try {
    const p = deAST(f, opts);
    const b = p.toASTBonito(vs[0]);
    if (L(b) !== L(f) && L(b).length < L(f).length) { fs = b; passos.push({ titulo: 'Simplificando', texto: 'Juntamos os termos e simplificamos a expressão.', latex: `${cab}=${L(b)}` }); }
  } catch (e) { if (!(e instanceof ErroMat)) throw e; }

  // domínio
  const conds = condicoes(f);
  const vistos = new Set();
  const lista = [];
  for (const c of conds) {
    const a = arrumarCondicao(c, vs);
    if (vistos.has(a.latex)) continue;
    vistos.add(a.latex);
    lista.push({ ...a, por: c.por, orig: c });
  }
  const R = vs.length === 1 ? '\\mathbb{R}' : `\\mathbb{R}^{${vs.length}}`;
  const ponto = vs.length === 1 ? vs[0] : `(${vs.join(',')})`;
  let dominio;
  if (!lista.length) {
    dominio = `D=${R}`;
    passos.push({ titulo: 'Domínio', texto: 'Não há divisão por expressão com variável, nem raiz par, nem logaritmo: a função existe para qualquer valor.', latex: dominio });
  } else {
    const partes = [];
    for (const c of lista) {
      let latexCond = c.latex;
      let texto = `Condição: ${c.por}.`;
      if (vs.length === 1) {
        try {
          if (c.orig.op === '!=') {
            const p = deAST(c.orig.e);
            const rz = raizesReais(p, vs[0]);
            if (rz.length) latexCond = rz.map((r) => `${vs[0]}\\ne ${r.latex}`).join(',\\ ');
            else { texto += ' Essa expressão nunca zera, então não tira nenhum ponto.'; latexCond = null; }
          } else {
            const r = resolverInequacao({ t: 'eq', op: c.orig.op, l: c.orig.e, r: A.num(0) }, opts);
            latexCond = r.resposta.startsWith('\\left') || r.resposta.includes('\\cup') || r.resposta === '\\varnothing' ? `${vs[0]}\\in ${r.resposta}` : r.resposta;
          }
        } catch (e) { if (!(e instanceof ErroMat)) throw e; }
      }
      const circ = circunferencia(c, vs);
      if (circ && c.opArr === '!=') texto += ` Geometricamente: tiramos os pontos da circunferência de centro (0, 0) e raio ${circ.raio}.`;
      if (circ && (c.opArr === '<=' || c.opArr === '<')) texto += ` Geometricamente: o disco de centro (0, 0) e raio ${circ.raio}.`;
      passos.push({ titulo: 'Domínio: condição de existência', texto, latex: `${L(c.orig.e)}${OPL[c.orig.op]}0${latexCond && latexCond !== `${L(c.orig.e)}${OPL[c.orig.op]}0` ? `\\;\\Rightarrow\\;${latexCond}` : ''}` });
      if (latexCond) partes.push(latexCond);
    }
    dominio = partes.length ? `D=\\left\\{${ponto}\\in ${R}\\mid ${partes.join(',\\ ')}\\right\\}` : `D=${R}`;
    passos.push({ titulo: 'Domínio', texto: 'Juntando as condições:', latex: dominio });
  }

  // derivadas
  const derivs = [];
  for (const v of vs) {
    const sub = derivarComPassos(fs, v, 1);
    const parcial = vs.length > 1;
    const sim = parcial ? `\\frac{\\partial ${nome}}{\\partial ${v}}` : `${nome}'(${v})`;
    passos.push({ titulo: parcial ? `Derivada parcial em relação a ${v}` : 'Derivada', texto: parcial ? (() => { const o = vs.filter((w) => w !== v); return `Derivamos só em ${v}; ${o.length > 1 ? o.join(' e ') + ' ficam parados, como se fossem números' : o[0] + ' fica parado, como se fosse um número'}.`; })() : 'Aplicamos as regras de derivação.', latex: `${sim}=${L(sub.respostaExpr)}` });
    for (const p of sub.passos) {
      passos.push({ ...p, titulo: '   ' + p.titulo, latex: parcial ? p.latex.split(`\\frac{d}{d${v}}`).join(`\\frac{\\partial}{\\partial ${v}}`).replace(/^f'\([a-z]\)/, sim) : p.latex });
    }
    derivs.push(`${sim}=${L(sub.respostaExpr)}`);
  }
  if (vs.length === 2) passos.push({ titulo: 'Vetor gradiente', texto: 'Juntando as derivadas parciais: o gradiente aponta para onde a função cresce mais rápido.', latex: `\\nabla ${nome}=\\left(\\frac{\\partial ${nome}}{\\partial ${vs[0]}},\\ \\frac{\\partial ${nome}}{\\partial ${vs[1]}}\\right)` });

  // uma variável: raízes e corte no eixo y
  const linhas = [dominio, ...derivs];
  let grafico = null;
  if (vs.length === 1 && !extras.length) {
    grafico = { tipo: 'funcoes', funcoes: [{ latex: L(f), ast: f, v: vs[0] }], marcas: [] };
    // parábola: vértice, concavidade, eixo, imagem
    try {
      const c = deAST(f, opts).coefsQ(vs[0]);
      if (c && c.length === 3 && !c[2].isZero) {
        const [cc, bb, aa] = c;
        const xv = bb.neg().div(aa.mul(2));
        const delta = bb.mul(bb).sub(aa.mul(cc).mul(4));
        const yv = delta.neg().div(aa.mul(4));
        const v = vs[0];
        passos.push({ titulo: 'Parábola', texto: `É uma função do 2º grau: o gráfico é uma parábola com a boca para ${aa.isNeg ? 'baixo (a < 0)' : 'cima (a > 0)'}.`, latex: `a=${aa.toLatex()},\\ b=${bb.toLatex()},\\ c=${cc.toLatex()}` });
        passos.push({ titulo: 'Vértice', texto: `O ponto ${aa.isNeg ? 'mais alto' : 'mais baixo'} da parábola.`, latex: `x_v=\\frac{-b}{2a}=${xv.toLatex()},\\quad y_v=\\frac{-\\Delta}{4a}=\\frac{${delta.neg().toLatex()}}{${aa.mul(4).toLatex()}}=${yv.toLatex()}` });
        passos.push({ titulo: 'Eixo de simetria e imagem', texto: `A parábola é simétrica em relação à reta ${v} = x_v. ${aa.isNeg ? 'O maior' : 'O menor'} valor da função é y_v.`, latex: `${v}=${xv.toLatex()},\\qquad \\text{Im}=\\left\\{y\\in\\mathbb{R}\\mid y${aa.isNeg ? '\\le' : '\\ge'} ${yv.toLatex()}\\right\\}` });
        linhas.push(`V=\\left(${xv.toLatex()};\\ ${yv.toLatex()}\\right)`);
        grafico.marcas.push({ x: xv.toNumber(), y: yv.toNumber(), rotulo: 'V' });
      }
    } catch (e) { if (!(e instanceof ErroMat)) throw e; }
  }
  if (vs.length === 1 && !extras.length) {
    const v = vs[0];
    try {
      const r = resolverEquacao({ t: 'eq', op: '=', l: f, r: A.num(0) }, { ...opts, var: v });
      passos.push({ titulo: 'Raízes (onde a função vale zero)', texto: `Resolvemos ${nome}(${v}) = 0. Nesses pontos o gráfico corta o eixo ${v}.`, latex: r.resposta });
      linhas.push(`\\text{Raízes: }${r.resposta}`);
    } catch (e) { if (!(e instanceof ErroMat)) throw e; }
    try {
      const y0 = deAST(A.substituir(f, v, A.num(0)), opts);
      if (isFinite(A.avaliar(y0.toAST(), {}))) {
        passos.push({ titulo: 'Corte no eixo y', texto: `Trocamos ${v} por 0.`, latex: `${nome}(0)=${latexConst(y0)}` });
        linhas.push(`${nome}(0)=${latexConst(y0)}`);
      }
    } catch (e) { if (!(e instanceof ErroMat)) throw e; }
  }
  return {
    tipo: 'funcao', titulo: vs.length > 1 ? 'Função de várias variáveis' : 'Função',
    entrada: defin,
    resposta: `\\begin{array}{l}${linhas.join('\\\\')}\\end{array}`,
    passos,
    grafico,
  };
}
