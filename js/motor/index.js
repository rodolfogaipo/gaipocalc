// GAIPO CALC — motor de cálculo offline.
// resolver(entrada) → { titulo, entrada, resposta, decimal, conjunto, passos[], aproximado }
import { ErroMat, formatNum } from './racional.js';
import * as A from './ast.js';
import { analisar } from './parser.js';
import { deAST } from './poli.js';
import { resolverAritmetica } from './aritmetica.js';
import { resolverEquacao, resolverSistema, latexConst } from './equacoes.js';
import { derivarComPassos, integrarComPassos, limiteComPassos } from './calculo.js';
import { ferramenta } from './ferramentas.js';

export { ErroMat, analisar };

export function resolver(entrada, opts = {}) {
  const ast = typeof entrada === 'string' ? analisar(entrada, opts) : entrada;
  let r;
  switch (ast.t) {
    case 'eq': r = resolverEquacao(ast, opts); break;
    case 'sys': r = resolverSistema(ast, opts); break;
    case 'deriv': r = derivarComPassos(ast.f, ast.v, ast.ordem); break;
    case 'int': r = integrarComPassos(ast, opts); break;
    case 'lim': r = limiteComPassos(ast, opts); break;
    case 'call': r = ferramenta(ast); break;
    default:
      if (A.temVar(ast)) r = simplificar(ast, opts);
      else r = resolverAritmetica(ast, opts);
  }
  r.ast = ast;
  return r;
}

function simplificar(ast, opts) {
  const passos = [];
  const vs = [...A.variaveis(ast)].sort();
  const v = vs.includes('x') ? 'x' : vs[0];
  const p = deAST(ast, opts);
  const bonito = p.toASTBonito(v);
  const ent = A.latex(ast);
  const res = A.latex(bonito);
  if (temProdutoDeSomas(ast)) passos.push({ titulo: 'Distributiva', texto: 'Multiplicamos cada termo de um parêntese por cada termo do outro (chuveirinho).', latex: `${ent}=${A.latex(p.toAST(v))}` });
  if (p.temDenominador()) passos.push({ titulo: 'Mesmo denominador', texto: 'Juntamos as frações usando um denominador comum e cancelamos fatores iguais.', latex: `=${res}` });
  else if (res !== ent) passos.push({ titulo: 'Termos semelhantes', texto: 'Juntamos os termos com a mesma parte literal (mesmas letras e expoentes), somando os coeficientes.', latex: `${ent}=${res}` });
  else passos.push({ titulo: 'Já está simplificada', texto: 'Não há termos semelhantes para juntar.', latex: res });
  // fatoração de 2º grau, se der
  const extra = fatorarQuadratica(p, v);
  if (extra) passos.push(extra);
  return { tipo: 'expressao', titulo: 'Simplificação', entrada: ent, resposta: res, passos, dica: vs.length === 1 ? `Para achar quando é zero, escreva “${ent}=0”.` : null };
}

function temProdutoDeSomas(n) {
  if (!n || typeof n !== 'object') return false;
  if (n.t === '*' && (['+', '-'].includes(n.l.t) || ['+', '-'].includes(n.r.t))) return true;
  if (n.t === '^' && ['+', '-'].includes(n.l.t)) return true;
  return ['l', 'r', 'a'].some((k) => n[k] && temProdutoDeSomas(n[k]));
}

function fatorarQuadratica(p, v) {
  if (!v) return null;
  const c = p.coefsQ(v);
  if (!c || c.length !== 3) return null;
  const [cc, bb, aa] = c;
  const d = bb.mul(bb).sub(aa.mul(cc).mul(4));
  if (d.isNeg) return null;
  const sd = deAST(A.sqrt(A.num(d)));
  if (!sd.eQ) return null;
  const r1 = bb.neg().sub(sd.q).div(aa.mul(2)), r2 = bb.neg().add(sd.q).div(aa.mul(2));
  const fat = (r) => (r.isZero ? v : `\\left(${v}${r.isNeg ? '+' : '-'}${r.abs().toLatex()}\\right)`);
  const a = aa.isOne ? '' : aa.eq(-1) ? '-' : aa.toLatex();
  const forma = r1.eq(r2) ? `${a}${fat(r1)}^{2}` : `${a}${fat(r1)}${fat(r2)}`;
  return { titulo: 'Forma fatorada', texto: `Usando as raízes (${r1.toString()} e ${r2.toString()}), a expressão pode ser escrita como a·(${v} − r₁)·(${v} − r₂).`, latex: forma };
}

export function rotuloTipo(r) { return r.titulo; }
export { formatNum, latexConst };
