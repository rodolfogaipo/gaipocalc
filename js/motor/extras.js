// Ferramentas do dia a dia, combinatória, matrizes, geometria e conversões — passo a passo.
import { Q, ErroMat, formatNum } from './racional.js';
import { P } from './poli.js';

const m = (q) => {
  if (typeof q === 'number') return formatNum(q, 6).replace(',', '{,}');
  if (q.isInt) return q.toLatex();
  const d = q.toDecimal(6);
  return d.exata ? d.txt.replace(',', '{,}') : `${q.toLatex()}\\approx ${q.toDecimal(4).txt.replace(',', '{,}')}`;
};
const din = (v) => 'R\\$\\,' + (Math.round(v * 100) / 100).toFixed(2).replace('.', '{,}').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const fat = (n) => { let f = 1n; for (let i = 2n; i <= n; i++) f *= i; return f; };
const int = (q, nome) => { if (!q.isInt || q.isNeg) throw new ErroMat(`${nome} deve ser um número inteiro não negativo.`); return q.n; };
const res = (titulo, entrada, resposta, passos, extra = {}) => ({ tipo: 'ferramenta', titulo, entrada, resposta, passos, ...extra });

// ---------- porcentagem ----------
export function porcentagem(modo, a, b) {
  const passos = [];
  if (modo === 'de') { // a% de b
    const r = a.div(100).mul(b);
    passos.push({ titulo: 'Transformar a porcentagem', texto: `${m(a)}% é o mesmo que ${m(a)} dividido por 100.`, latex: `${m(a)}\\%=\\frac{${m(a)}}{100}=${m(a.div(100))}` });
    passos.push({ titulo: 'Multiplicar', texto: `“de” na porcentagem quer dizer multiplicar.`, latex: `${m(a.div(100))}\\cdot ${m(b)}=${m(r)}` });
    return res('Porcentagem', `${m(a)}\\%\\ \\text{de}\\ ${m(b)}`, m(r), passos);
  }
  if (modo === 'quanto') { // a é quantos % de b
    if (b.isZero) throw new ErroMat('O total não pode ser zero.');
    const r = a.div(b).mul(100);
    passos.push({ titulo: 'Dividir a parte pelo total', texto: '', latex: `\\frac{${m(a)}}{${m(b)}}=${m(a.div(b))}` });
    passos.push({ titulo: 'Multiplicar por 100', texto: 'Para virar porcentagem.', latex: `${m(a.div(b))}\\cdot 100=${m(r)}\\%` });
    return res('Porcentagem', `${m(a)}\\ \\text{é quantos \\% de}\\ ${m(b)}?`, `${m(r)}\\%`, passos);
  }
  // aumento / desconto: valor b com a%
  const f = modo === 'aumento' ? Q.ONE.add(a.div(100)) : Q.ONE.sub(a.div(100));
  const r = b.mul(f);
  passos.push({ titulo: modo === 'aumento' ? 'Fator de aumento' : 'Fator de desconto', texto: modo === 'aumento' ? `Aumentar ${m(a)}% é ficar com 100% + ${m(a)}%.` : `Descontar ${m(a)}% é ficar com 100% − ${m(a)}%.`, latex: `1${modo === 'aumento' ? '+' : '-'}${m(a.div(100))}=${m(f)}` });
  passos.push({ titulo: 'Novo valor', texto: '', latex: `${m(b)}\\cdot ${m(f)}=${m(r)}` });
  passos.push({ titulo: modo === 'aumento' ? 'Quanto aumentou' : 'Quanto descontou', texto: '', latex: `${m(r.sub(b).abs())}` });
  return res(modo === 'aumento' ? 'Aumento percentual' : 'Desconto', `${m(b)}\\ ${modo === 'aumento' ? '+' : '-'}\\ ${m(a)}\\%`, m(r), passos);
}

// ---------- regra de três ----------
export function regraDeTres(a, b, c, inversa) {
  // a está para b assim como c está para x
  const passos = [];
  passos.push({ titulo: 'Montando', texto: inversa ? 'Grandezas inversamente proporcionais: quando uma aumenta, a outra diminui. Multiplicamos em linha reta.' : 'Grandezas diretamente proporcionais: multiplicamos cruzado.', latex: `\\begin{array}{ccc}${m(a)} & \\longrightarrow & ${m(b)}\\\\ ${m(c)} & \\longrightarrow & x\\end{array}` });
  let x;
  if (inversa) {
    if (c.isZero) throw new ErroMat('Valor não pode ser zero.');
    x = a.mul(b).div(c);
    passos.push({ titulo: 'Multiplicando em linha', texto: '', latex: `${m(c)}\\cdot x=${m(a)}\\cdot ${m(b)}\\Rightarrow x=\\frac{${m(a.mul(b))}}{${m(c)}}=${m(x)}` });
  } else {
    if (a.isZero) throw new ErroMat('Valor não pode ser zero.');
    x = b.mul(c).div(a);
    passos.push({ titulo: 'Multiplicando cruzado', texto: '', latex: `${m(a)}\\cdot x=${m(b)}\\cdot ${m(c)}\\Rightarrow x=\\frac{${m(b.mul(c))}}{${m(a)}}=${m(x)}` });
  }
  return res(inversa ? 'Regra de três inversa' : 'Regra de três simples', `${m(a)}\\to ${m(b)},\\quad ${m(c)}\\to x`, `x=${m(x)}`, passos);
}

// ---------- juros ----------
export function juros(tipo, C, taxa, t) {
  const i = taxa / 100;
  const passos = [];
  if (C <= 0 || t < 0) throw new ErroMat('Capital deve ser positivo e o tempo não pode ser negativo.');
  if (tipo === 'simples') {
    const J = C * i * t, M = C + J;
    passos.push({ titulo: 'Fórmula dos juros simples', texto: 'Os juros são sempre calculados sobre o valor inicial.', latex: 'J=C\\cdot i\\cdot t' });
    passos.push({ titulo: 'Substituindo', texto: `Taxa de ${m(taxa)}% = ${m(i)}.`, latex: `J=${din(C)}\\cdot ${m(i)}\\cdot ${m(t)}=${din(J)}` });
    passos.push({ titulo: 'Montante', texto: 'Valor final = capital + juros.', latex: `M=${din(C)}+${din(J)}=${din(M)}` });
    return res('Juros simples', `C=${din(C)},\\ i=${m(taxa)}\\%,\\ t=${m(t)}`, `\\begin{array}{l}J=${din(J)}\\\\M=${din(M)}\\end{array}`, passos, { grafico: { tipo: 'barras', titulo: 'Montante a cada período', pares: Array.from({ length: Math.min(Math.floor(t), 40) + 1 }, (_, k) => [k, C + C * i * k]) } });
  }
  const M = C * Math.pow(1 + i, t), J = M - C;
  passos.push({ titulo: 'Fórmula dos juros compostos', texto: 'Juros sobre juros: a cada período o valor é multiplicado por (1 + i).', latex: 'M=C\\cdot (1+i)^{t}' });
  passos.push({ titulo: 'Substituindo', texto: `Taxa de ${m(taxa)}% = ${m(i)}.`, latex: `M=${din(C)}\\cdot (1+${m(i)})^{${m(t)}}=${din(C)}\\cdot ${m(Math.pow(1 + i, t))}=${din(M)}` });
  passos.push({ titulo: 'Juros', texto: 'Juros = montante − capital.', latex: `J=${din(M)}-${din(C)}=${din(J)}` });
  return res('Juros compostos', `C=${din(C)},\\ i=${m(taxa)}\\%,\\ t=${m(t)}`, `\\begin{array}{l}M=${din(M)}\\\\J=${din(J)}\\end{array}`, passos, { grafico: { tipo: 'barras', titulo: 'Montante a cada período', pares: Array.from({ length: Math.min(Math.floor(t), 40) + 1 }, (_, k) => [k, C * Math.pow(1 + i, k)]) } });
}

// ---------- combinatória ----------
export function combinatoria(tipo, nq, pq) {
  const n = int(nq, 'n'); const p = pq ? int(pq, 'p') : n;
  if (n > 1000n) throw new ErroMat('Número grande demais.');
  if (p > n) throw new ErroMat('p não pode ser maior que n.');
  const passos = [];
  let r;
  if (tipo === 'perm') {
    r = fat(n);
    passos.push({ titulo: 'Permutação', texto: `De quantas formas podemos ordenar ${n} elementos? É ${n}! (fatorial).`, latex: `P_{${n}}=${n}!=${n <= 8n ? Array.from({ length: Number(n) }, (_, k) => Number(n) - k).join('\\cdot ') + '=' : ''}${r}` });
    return res('Permutação', `P_{${n}}`, `${r}`, passos);
  }
  if (tipo === 'arranjo') {
    r = fat(n) / fat(n - p);
    passos.push({ titulo: 'Arranjo (a ordem importa)', texto: `Escolher ${p} de ${n} elementos, em ordem.`, latex: `A_{${n},${p}}=\\frac{${n}!}{(${n}-${p})!}=\\frac{${n}!}{${n - p}!}` });
    passos.push({ titulo: 'Simplificando', texto: 'Cortamos o fatorial de baixo com parte do de cima.', latex: `${n - p + 1n <= n ? Array.from({ length: Number(p) }, (_, k) => Number(n) - k).join('\\cdot ') : '1'}=${r}` });
    return res('Arranjo', `A_{${n},${p}}`, `${r}`, passos);
  }
  r = fat(n) / (fat(p) * fat(n - p));
  passos.push({ titulo: 'Combinação (a ordem não importa)', texto: `Escolher ${p} de ${n} elementos, sem importar a ordem (ex.: formar grupos).`, latex: `C_{${n},${p}}=\\frac{${n}!}{${p}!\\,(${n}-${p})!}` });
  passos.push({ titulo: 'Calculando', texto: '', latex: `C_{${n},${p}}=\\frac{${p <= 6n ? Array.from({ length: Number(p) }, (_, k) => Number(n) - k).join('\\cdot ') : `${n}!/(${n - p})!`}}{${p}!}=${r}` });
  return res('Combinação', `C_{${n},${p}}`, `${r}`, passos);
}

// ---------- matrizes ----------
const matLatex = (M) => `\\begin{pmatrix}${M.map((l) => l.map(m).join(' & ')).join('\\\\')}\\end{pmatrix}`;
function det(M, passos, nivel = 0) {
  const n = M.length;
  if (n === 1) return M[0][0];
  if (n === 2) {
    const r = M[0][0].mul(M[1][1]).sub(M[0][1].mul(M[1][0]));
    if (nivel === 0) passos.push({ titulo: 'Determinante 2×2', texto: 'Diagonal principal menos diagonal secundária.', latex: `\\det=${m(M[0][0])}\\cdot ${m(M[1][1])}-${m(M[0][1])}\\cdot ${m(M[1][0])}=${m(r)}` });
    return r;
  }
  if (n === 3 && nivel === 0) {
    const [a, b, c] = M[0], [d, e, f] = M[1], [g, h, i] = M[2];
    const p1 = a.mul(e).mul(i), p2 = b.mul(f).mul(g), p3 = c.mul(d).mul(h);
    const s1 = c.mul(e).mul(g), s2 = a.mul(f).mul(h), s3 = b.mul(d).mul(i);
    const r = p1.add(p2).add(p3).sub(s1).sub(s2).sub(s3);
    passos.push({ titulo: 'Regra de Sarrus', texto: 'Somamos os produtos das três diagonais "para baixo" e subtraímos os das três "para cima".', latex: `(${m(p1)})+(${m(p2)})+(${m(p3)})-(${m(s1)})-(${m(s2)})-(${m(s3)})=${m(r)}` });
    return r;
  }
  // Laplace pela primeira linha
  let r = Q.ZERO;
  for (let j = 0; j < n; j++) {
    if (M[0][j].isZero) continue;
    const menor = M.slice(1).map((l) => l.filter((_, k) => k !== j));
    const t = M[0][j].mul(det(menor, passos, nivel + 1));
    r = j % 2 ? r.sub(t) : r.add(t);
  }
  if (nivel === 0) passos.push({ titulo: 'Teorema de Laplace', texto: 'Expandimos pela primeira linha: cada elemento vezes o determinante do que sobra, com sinais alternados.', latex: `\\det=${m(r)}` });
  return r;
}
export function matrizes(op, A, B) {
  const passos = [];
  const quad = (M) => M.length === M[0].length;
  if (op === 'det') {
    if (!quad(A)) throw new ErroMat('Determinante só existe para matriz quadrada.');
    const d = det(A, passos);
    return res('Determinante', `\\det${matLatex(A)}`, `\\det=${m(d)}`, passos);
  }
  if (op === 'transposta') {
    const T = A[0].map((_, j) => A.map((l) => l[j]));
    passos.push({ titulo: 'Transposta', texto: 'Linhas viram colunas.', latex: `${matLatex(A)}^{T}=${matLatex(T)}` });
    return res('Matriz transposta', `${matLatex(A)}^{T}`, matLatex(T), passos);
  }
  if (op === 'soma' || op === 'sub') {
    if (!B || A.length !== B.length || A[0].length !== B[0].length) throw new ErroMat('Para somar ou subtrair, as matrizes precisam ter o mesmo tamanho.');
    const R = A.map((l, i) => l.map((x, j) => (op === 'soma' ? x.add(B[i][j]) : x.sub(B[i][j]))));
    passos.push({ titulo: op === 'soma' ? 'Soma' : 'Subtração', texto: 'Elemento com elemento, na mesma posição.', latex: `${matLatex(A)}${op === 'soma' ? '+' : '-'}${matLatex(B)}=${matLatex(R)}` });
    return res(op === 'soma' ? 'Soma de matrizes' : 'Subtração de matrizes', `A${op === 'soma' ? '+' : '-'}B`, matLatex(R), passos);
  }
  if (op === 'mult') {
    if (!B || A[0].length !== B.length) throw new ErroMat('Para multiplicar A·B, o número de colunas de A deve ser igual ao de linhas de B.');
    const R = A.map((l) => B[0].map((_, j) => l.reduce((s, x, k) => s.add(x.mul(B[k][j])), Q.ZERO)));
    passos.push({ titulo: 'Multiplicação', texto: 'Cada elemento do resultado é linha de A “vezes” coluna de B: multiplica elemento a elemento e soma.', latex: `c_{11}=${A[0].map((x, k) => `${m(x)}\\cdot ${m(B[k][0])}`).join('+')}=${m(R[0][0])}` });
    passos.push({ titulo: 'Resultado', texto: '', latex: `${matLatex(A)}\\cdot ${matLatex(B)}=${matLatex(R)}` });
    return res('Multiplicação de matrizes', 'A\\cdot B', matLatex(R), passos);
  }
  if (op === 'inversa') {
    if (!quad(A)) throw new ErroMat('Só matriz quadrada tem inversa.');
    const n = A.length;
    const d = det(A, passos);
    if (d.isZero) { passos.push({ titulo: 'Sem inversa', texto: 'Determinante zero: a matriz não tem inversa.', latex: '\\det=0' }); return res('Matriz inversa', `${matLatex(A)}^{-1}`, '\\text{Não existe (det = 0)}', passos); }
    // Gauss-Jordan
    const M = A.map((l, i) => [...l, ...A.map((_, j) => (i === j ? Q.ONE : Q.ZERO))]);
    for (let c = 0; c < n; c++) {
      let p = c; while (M[p][c].isZero) p++;
      [M[c], M[p]] = [M[p], M[c]];
      const piv = M[c][c];
      M[c] = M[c].map((x) => x.div(piv));
      for (let i = 0; i < n; i++) if (i !== c && !M[i][c].isZero) { const k = M[i][c]; M[i] = M[i].map((x, j) => x.sub(k.mul(M[c][j]))); }
    }
    const I = M.map((l) => l.slice(n));
    passos.push({ titulo: 'Gauss-Jordan', texto: 'Colocamos a identidade ao lado e fazemos operações nas linhas até a esquerda virar a identidade; a direita vira a inversa.', latex: `A^{-1}=${matLatex(I)}` });
    return res('Matriz inversa', `${matLatex(A)}^{-1}`, matLatex(I), passos);
  }
  throw new ErroMat('Operação desconhecida.');
}

// ---------- geometria ----------
const PI = Math.PI;
export function geometria(figura, v) {
  const passos = [];
  const pos = (x, nome) => { if (!(x > 0)) throw new ErroMat(`${nome} deve ser maior que zero.`); return x; };
  const f = (x) => m(x);
  const um = (titulo, texto, formula, conta, valor, unid, extra) => { passos.push({ titulo, texto, latex: formula }); passos.push({ titulo: 'Substituindo', texto: '', latex: `${conta}=${f(valor)}${unid}` }); return res(extra || titulo, formula, `${f(valor)}${unid}`, passos); };
  switch (figura) {
    case 'quadrado': { const l = pos(v.l, 'Lado'); passos.push({ titulo: 'Perímetro', texto: '', latex: `P=4\\cdot ${f(l)}=${f(4 * l)}` }); return um('Área do quadrado', 'Lado vezes lado.', 'A=l^{2}', `A=${f(l)}^{2}`, l * l, '', 'Quadrado'); }
    case 'retangulo': { const b = pos(v.b, 'Base'), h = pos(v.h, 'Altura'); passos.push({ titulo: 'Perímetro', texto: '', latex: `P=2\\cdot(${f(b)}+${f(h)})=${f(2 * (b + h))}` }); passos.push({ titulo: 'Diagonal', texto: 'Pelo teorema de Pitágoras.', latex: `d=\\sqrt{${f(b)}^{2}+${f(h)}^{2}}\\approx ${f(Math.hypot(b, h))}` }); return um('Área do retângulo', 'Base vezes altura.', 'A=b\\cdot h', `A=${f(b)}\\cdot ${f(h)}`, b * h, '', 'Retângulo'); }
    case 'triangulo': { const b = pos(v.b, 'Base'), h = pos(v.h, 'Altura'); return um('Área do triângulo', 'Base vezes altura, dividido por 2.', 'A=\\frac{b\\cdot h}{2}', `A=\\frac{${f(b)}\\cdot ${f(h)}}{2}`, (b * h) / 2, '', 'Triângulo'); }
    case 'circulo': { const r = pos(v.r, 'Raio'); passos.push({ titulo: 'Comprimento (perímetro)', texto: '', latex: `C=2\\pi r=2\\pi\\cdot ${f(r)}\\approx ${f(2 * PI * r)}` }); return um('Área do círculo', 'π vezes o raio ao quadrado.', 'A=\\pi r^{2}', `A=\\pi\\cdot ${f(r)}^{2}`, PI * r * r, '', 'Círculo'); }
    case 'trapezio': { const B = pos(v.B, 'Base maior'), b = pos(v.b, 'Base menor'), h = pos(v.h, 'Altura'); return um('Área do trapézio', 'Soma das bases vezes a altura, dividido por 2.', 'A=\\frac{(B+b)\\cdot h}{2}', `A=\\frac{(${f(B)}+${f(b)})\\cdot ${f(h)}}{2}`, ((B + b) * h) / 2, '', 'Trapézio'); }
    case 'losango': { const D = pos(v.D, 'Diagonal maior'), d = pos(v.d, 'Diagonal menor'); return um('Área do losango', 'Diagonal maior vezes a menor, dividido por 2.', 'A=\\frac{D\\cdot d}{2}', `A=\\frac{${f(D)}\\cdot ${f(d)}}{2}`, (D * d) / 2, '', 'Losango'); }
    case 'cubo': { const a = pos(v.a, 'Aresta'); passos.push({ titulo: 'Área total', texto: '6 faces quadradas.', latex: `A_t=6a^{2}=${f(6 * a * a)}` }); return um('Volume do cubo', 'Aresta ao cubo.', 'V=a^{3}', `V=${f(a)}^{3}`, a ** 3, '', 'Cubo'); }
    case 'paralelepipedo': { const a = pos(v.a, 'Comprimento'), b = pos(v.b, 'Largura'), c = pos(v.c, 'Altura'); passos.push({ titulo: 'Área total', texto: '', latex: `A_t=2(ab+ac+bc)=${f(2 * (a * b + a * c + b * c))}` }); return um('Volume do paralelepípedo', 'Comprimento × largura × altura.', 'V=a\\cdot b\\cdot c', `V=${f(a)}\\cdot ${f(b)}\\cdot ${f(c)}`, a * b * c, '', 'Paralelepípedo'); }
    case 'cilindro': { const r = pos(v.r, 'Raio'), h = pos(v.h, 'Altura'); passos.push({ titulo: 'Área total', texto: 'Duas bases + lateral.', latex: `A_t=2\\pi r^{2}+2\\pi r h\\approx ${f(2 * PI * r * r + 2 * PI * r * h)}` }); return um('Volume do cilindro', 'Área da base vezes a altura.', 'V=\\pi r^{2} h', `V=\\pi\\cdot ${f(r)}^{2}\\cdot ${f(h)}`, PI * r * r * h, '', 'Cilindro'); }
    case 'cone': { const r = pos(v.r, 'Raio'), h = pos(v.h, 'Altura'); const g = Math.hypot(r, h); passos.push({ titulo: 'Geratriz', texto: 'Pitágoras com o raio e a altura.', latex: `g=\\sqrt{r^{2}+h^{2}}\\approx ${f(g)}` }); return um('Volume do cone', 'Um terço do cilindro de mesma base e altura.', 'V=\\frac{\\pi r^{2} h}{3}', `V=\\frac{\\pi\\cdot ${f(r)}^{2}\\cdot ${f(h)}}{3}`, (PI * r * r * h) / 3, '', 'Cone'); }
    case 'esfera': { const r = pos(v.r, 'Raio'); passos.push({ titulo: 'Área da superfície', texto: '', latex: `A=4\\pi r^{2}\\approx ${f(4 * PI * r * r)}` }); return um('Volume da esfera', '', 'V=\\frac{4}{3}\\pi r^{3}', `V=\\frac{4}{3}\\pi\\cdot ${f(r)}^{3}`, (4 / 3) * PI * r ** 3, '', 'Esfera'); }
    case 'pitagoras': {
      const a = v.a, b = v.b, c = v.c; // a, b catetos; c hipotenusa (um deles vazio)
      passos.push({ titulo: 'Teorema de Pitágoras', texto: 'Num triângulo retângulo: hipotenusa² = cateto² + cateto².', latex: 'c^{2}=a^{2}+b^{2}' });
      if (!(c > 0)) { const r = Math.hypot(pos(a, 'Cateto a'), pos(b, 'Cateto b')); const ex = P.c(Q.fromFloat(a * a + b * b, 100000n) || Q.ZERO).pow(new Q(1n, 2n)); passos.push({ titulo: 'Hipotenusa', texto: '', latex: `c=\\sqrt{${f(a)}^{2}+${f(b)}^{2}}=\\sqrt{${f(a * a + b * b)}}${ex.eQ ? '' : '=' + ex.latex()}\\approx ${f(r)}` }); return res('Teorema de Pitágoras', 'c^{2}=a^{2}+b^{2}', `c\\approx ${f(r)}`, passos); }
      const cat = a > 0 ? a : b;
      if (!(cat > 0) || cat >= c) throw new ErroMat('Informe a hipotenusa e um cateto menor que ela.');
      const r = Math.sqrt(c * c - cat * cat);
      passos.push({ titulo: 'Cateto que falta', texto: '', latex: `x=\\sqrt{${f(c)}^{2}-${f(cat)}^{2}}=\\sqrt{${f(c * c - cat * cat)}}\\approx ${f(r)}` });
      return res('Teorema de Pitágoras', 'c^{2}=a^{2}+b^{2}', `x\\approx ${f(r)}`, passos);
    }
    case 'trig': {
      // triângulo retângulo: ângulo (graus) e hipotenusa
      const ang = pos(v.ang, 'Ângulo'), h = pos(v.h, 'Hipotenusa');
      if (ang >= 90) throw new ErroMat('No triângulo retângulo, o ângulo agudo é menor que 90°.');
      const rad = (ang * PI) / 180;
      const op = h * Math.sin(rad), adj = h * Math.cos(rad);
      passos.push({ titulo: 'Seno', texto: 'sen = cateto oposto / hipotenusa → oposto = hipotenusa × sen', latex: `CO=${f(h)}\\cdot\\sin ${f(ang)}^{\\circ}\\approx ${f(op)}` });
      passos.push({ titulo: 'Cosseno', texto: 'cos = cateto adjacente / hipotenusa → adjacente = hipotenusa × cos', latex: `CA=${f(h)}\\cdot\\cos ${f(ang)}^{\\circ}\\approx ${f(adj)}` });
      return res('Trigonometria no triângulo retângulo', `\\theta=${f(ang)}^{\\circ},\\ h=${f(h)}`, `\\begin{array}{l}CO\\approx ${f(op)}\\\\CA\\approx ${f(adj)}\\end{array}`, passos);
    }
  }
  throw new ErroMat('Figura desconhecida.');
}

// ---------- conversões ----------
export const UNIDADES = {
  comprimento: { km: 1000, hm: 100, dam: 10, m: 1, dm: 0.1, cm: 0.01, mm: 0.001 },
  massa: { t: 1e6, kg: 1000, hg: 100, dag: 10, g: 1, dg: 0.1, cg: 0.01, mg: 0.001 },
  tempo: { dia: 86400, h: 3600, min: 60, s: 1 },
  area: { 'km²': 1e6, 'ha': 1e4, 'm²': 1, 'dm²': 0.01, 'cm²': 1e-4, 'mm²': 1e-6 },
  volume: { 'm³': 1000, 'L': 1, 'dm³': 1, 'mL': 0.001, 'cm³': 0.001 },
  velocidade: { 'km/h': 1 / 3.6, 'm/s': 1 },
  temperatura: { '°C': 'C', '°F': 'F', 'K': 'K' },
};
export function converter(grandeza, valor, de, para) {
  const passos = [];
  const tabela = UNIDADES[grandeza];
  if (!tabela || !(de in tabela) || !(para in tabela)) throw new ErroMat('Unidade desconhecida.');
  let r;
  if (grandeza === 'temperatura') {
    const paraC = { C: (x) => x, F: (x) => ((x - 32) * 5) / 9, K: (x) => x - 273.15 }[tabela[de]];
    const deC = { C: (x) => x, F: (x) => (x * 9) / 5 + 32, K: (x) => x + 273.15 }[tabela[para]];
    const c = paraC(valor);
    r = deC(c);
    const form = { C: '', F: '°F=\\frac{9}{5}°C+32,\\quad °C=\\frac{5}{9}(°F-32)', K: 'K=°C+273{,}15' };
    passos.push({ titulo: 'Fórmulas', texto: 'Passamos tudo por graus Celsius.', latex: `${form[tabela[de]] || ''}${form[tabela[de]] && form[tabela[para]] ? ',\\quad ' : ''}${tabela[de] !== tabela[para] ? form[tabela[para]] || '' : ''}` || '°C' });
    passos.push({ titulo: 'Convertendo', texto: '', latex: `${m(valor)}\\,\\text{${de}}=${m(r)}\\,\\text{${para}}` });
  } else {
    const fator = tabela[de] / tabela[para];
    r = valor * fator;
    passos.push({ titulo: 'Fator de conversão', texto: `1 ${de} = ${formatNum(fator, 10)} ${para}`, latex: `1\\,\\text{${de}}=${m(fator)}\\,\\text{${para}}` });
    passos.push({ titulo: 'Multiplicando', texto: '', latex: `${m(valor)}\\cdot ${m(fator)}=${m(r)}\\,\\text{${para}}` });
  }
  return res('Conversão de unidades', `${m(valor)}\\,\\text{${de}}\\to\\text{${para}}`, `${m(r)}\\,\\text{${para}}`, passos);
}
