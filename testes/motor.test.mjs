// Testes do motor: rode com  node testes/motor.test.mjs
import { createRequire } from 'module';
import { resolver } from '../js/motor/index.js';
import { criarCAS } from '../js/motor/cas.js';
const require = createRequire(import.meta.url);
let nerd = null;
try { nerd = require(process.env.NERDAMER || '../vendor/nerdamer.js'); } catch { }
const cas = criarCAS(nerd);
let falhas = 0, total = 0;
function caso(entrada, esperado, opts = {}) {
  total++;
  try {
    const r = resolver(entrada, { cas, ...opts });
    const txt = r.resposta + (r.decimal ? ' | ' + r.decimal : '');
    const ok = typeof esperado === 'function' ? esperado(r) : esperado === undefined || txt.includes(esperado) || r.resposta === esperado;
    if (!ok) { falhas++; console.log('✗', entrada, '\n   obtido:', txt, '\n   esperado:', esperado); }
    else if (process.env.V) console.log('✓', entrada, '→', txt, `(${r.passos.length} passos)`);
    if (process.env.P) for (const p of r.passos) console.log('     ·', p.titulo, '|', p.texto, '|', p.latex);
  } catch (e) {
    if (esperado === 'ERRO' && e.name === 'ErroMat') { if (process.env.V) console.log('✓', entrada, '→ erro:', e.message); return; }
    falhas++; console.log('✗', entrada, 'EXCEÇÃO', e.name, e.message, e.name !== 'ErroMat' ? e.stack.split('\n').slice(1, 4).join(' ') : '');
  }
}
const sem = (s) => (r) => !r.resposta.includes(s);
// aritmética
caso('2+3\\cdot4', '14');
caso('(2+3)\\cdot4', '20');
caso('\\frac{1}{2}+\\frac{1}{3}', '\\frac{5}{6}');
caso('\\frac{3}{4}\\div\\frac{1}{2}', '\\frac{3}{2}');
caso('2^{10}', '1024');
caso('2^{-2}', '\\frac{1}{4}');
caso('\\sqrt{49}', '7');
caso('\\sqrt{12}', '2\\sqrt{3}');
caso('\\sqrt{2}+\\sqrt{8}', '3\\sqrt{2}');
caso('1{,}5+2{,}25', '3{,}75');
caso('0.1+0.2', '0{,}3');
caso('20\\%\\cdot150', '30');
caso('5!', '120');
caso('10\\div4', '\\frac{5}{2}');
caso('\\frac{6}{4}', '\\frac{3}{2}');
caso('-3^2', '-9');
caso('(-3)^2', '9');
caso('3-(-2)', '5');
caso('2+3\\cdot(4+1)^2', '77');
caso('\\sin(30^{\\circ})', '\\frac{1}{2}');
caso('\\cos(\\pi)', '-1');
caso('\\sin(1)', '0,841470');
caso('\\log_{2}8', '3');
caso('\\ln(e^3)', '3');
caso('|-7|+2', '9');
caso('8^{\\frac{1}{3}}', '2');
caso('\\sqrt[3]{-27}', '-3');
caso('1/0', 'ERRO');
caso('\\sqrt{-4}', 'ERRO');
caso('\\pi\\cdot2', '2\\pi');
caso('2\\cdot\\frac{3}{4}', '\\frac{3}{2}');
caso('\\frac{1}{3}+0{,}5', '\\frac{5}{6}');
caso('sen(30)', '\\frac{1}{2}', { graus: true });
// expressões
caso('(x+1)^2', 'x^{2}+2x+1');
caso('2x+3x-x', '4x');
caso('(x+2)(x-2)', 'x^{2}-4');
caso('\\frac{x^2-1}{x-1}', 'x+1');
caso('x^2-5x+6', (r) => r.resposta.includes('x=2') && r.resposta.includes("f'(x)=2x-5"));
caso('\\frac{x^2}{1-x^2-y^2}', (r) => r.resposta.includes('x^{2}+y^{2}\\ne 1'));
// equações
caso('2x+3=7', 'x=2');
caso('3x-5=2x+1', 'x=6');
caso('2(x+1)=3(x-1)', 'x=5');
caso('\\frac{x}{2}+\\frac{x}{3}=5', 'x=6');
caso('x+1=x+2', 'Não tem solução');
caso('2x+2=2(x+1)', 'Qualquer');
caso('x^2-5x+6=0', 'x=2\\quad\\text{ou}\\quad x=3');
caso('x^2=9', 'x=-3');
caso('x^2-4x=0', 'x=0');
caso('x^2+1=0', 'Não tem solução real');
caso('x^2-2x-1=0', '\\sqrt{2}');
caso('2x^2-4x+2=0', 'x=1');
caso('x^3-6x^2+11x-6=0', 'x=3');
caso('x^3=8', 'x=2');
caso('x^4-5x^2+4=0', 'x=-2');
caso('2^x=8', 'x=3');
caso('3^{x+1}=27', 'x=2');
caso('e^x=5', '\\ln');
caso('\\log_{2}(x)=5', 'x=32');
caso('\\ln(x)=2', 'e^{2}');
caso('\\sqrt{x+3}=5', 'x=22');
caso('\\sqrt{x}=-2', 'Não tem solução');
caso('|x-1|=3', 'x=-2');
caso('\\frac{1}{x}=2', '\\frac{1}{2}');
caso('\\frac{x^2-1}{x-1}=0', 'x=-1');
caso('x=\\cos(x)', '0{,}739');
caso('ax+b=0', 'x=');
caso('2+2=4', 'Verdadeiro');
// inequações
caso('2x+1<5', 'x<2');
caso('-2x+1\\le5', 'x\\ge -2');
caso('x^2-4>0', '\\left]-\\infty;\\ -2\\right[\\cup \\left]2;\\ +\\infty\\right[');
caso('x^2-4\\le0', '\\left[-2;\\ 2\\right]');
caso('\\frac{x-1}{x+2}\\ge0', '\\left]-\\infty;\\ -2\\right[');
// sistemas
caso('x+y=5;x-y=1', 'x=3,\\quad y=2');
caso('\\begin{cases}2x+3y=12\\\\x-y=1\\end{cases}', 'x=3');
caso('x+y=1;x+y=2', 'impossível');
caso('x+y+z=6;x-y=0;2z=6', 'z=3');
// derivadas
caso('\\frac{d}{dx}x^3', '3x^{2}');
caso('\\frac{d}{dx}\\left(x^2\\sin x\\right)', (r) => r.resposta.includes('\\cos') && r.resposta.includes('\\sin'));
caso('\\frac{d}{dx}\\frac{x}{x+1}', '\\frac{1}{\\left(x+1\\right)^{2}}');
caso('\\frac{d}{dx}e^{2x}', '2e^{2x}');
caso('\\frac{d}{dx}\\ln(x^2+1)', '\\frac{2x}{x^{2}+1}');
caso('\\frac{d}{dx}\\sqrt{x}', '\\frac{1}{2\\sqrt{x}}');
caso('\\frac{d^2}{dx^2}x^4', '12x^{2}');
caso('\\frac{d}{dx}\\left(3x^2+2x-5\\right)', '6x+2');
caso('\\frac{d}{dx}\\sin(3x)', '3\\cos');
// integrais
caso('\\int x^2\\,dx', '\\frac{x^{3}}{3}+C');
caso('\\int (3x^2+2x+1)\\,dx', 'x^{3}+x^{2}+x+C');
caso('\\int \\frac{1}{x}\\,dx', '\\ln\\left(\\left|x\\right|\\right)+C');
caso('\\int e^{2x}\\,dx', '\\frac{e^{2x}}{2}+C');
caso('\\int \\cos(3x)\\,dx', '\\frac{\\sin\\left(3x\\right)}{3}+C');
caso('\\int 2x\\cos(x^2)\\,dx', '\\sin\\left(x^{2}\\right)+C');
caso('\\int x e^x\\,dx', 'e^{x}');
caso('\\int \\ln x\\,dx', '\\ln');
caso('\\int \\frac{x}{x^2+1}\\,dx', '\\ln');
caso('\\int \\frac{1}{1+x^2}\\,dx', '\\arctan');
caso('\\int_{0}^{1}x^2\\,dx', '\\frac{1}{3}');
caso('\\int_{0}^{\\pi}\\sin x\\,dx', '2');
caso('\\int_{1}^{e}\\frac{1}{x}\\,dx', '1');
caso('\\int_{0}^{1}e^{x^2}\\,dx', '1{,}46265');
caso('\\int x^2\\sin x\\,dx', '\\cos');
// limites
caso('\\lim_{x\\to2}(x^2+1)', '5');
caso('\\lim_{x\\to1}\\frac{x^2-1}{x-1}', '2');
caso('\\lim_{x\\to0}\\frac{\\sin x}{x}', '1');
caso('\\lim_{x\\to\\infty}\\frac{2x^2+1}{x^2-3}', '2');
caso('\\lim_{x\\to\\infty}\\frac{1}{x}', '0');
caso('\\lim_{x\\to0}\\frac{1}{x}', 'Não existe');
caso('\\lim_{x\\to0^{+}}\\frac{1}{x}', '+\\infty');
caso('\\lim_{x\\to\\infty}\\left(1+\\frac{1}{x}\\right)^x', '2{,}718');
caso('\\lim_{x\\to0}\\frac{e^x-1}{x}', '1');
// funções
caso('F\\left(x,y\\right)=\\frac{x^2}{1-x^2-y^2}', (r) => r.resposta.includes('x^{2}+y^{2}\\ne 1') && r.resposta.includes('\\frac{\\partial F}{\\partial x}') && r.resposta.includes('\\frac{2x^{2}y}{\\left(1-x^{2}-y^{2}\\right)^{2}}'));
caso('f(x)=x^2-5x+6', (r) => r.resposta.includes("f'(x)=2x-5") && r.resposta.includes('x=2'));
caso('f(x)=\\frac{1}{x-2}', 'x\\ne 2');
caso('g(x)=\\sqrt{x-1}', 'x\\ge 1');
caso('y=2x+3', "y'(x)=2");
caso('F(x,y)=x^2y+3xy^2', '\\frac{\\partial F}{\\partial y}=6xy+x^{2}');
caso('x(x+1)=0', 'x=-1');
// estatística
caso('media(4;7;7;10)', '\\bar{x}=7');
caso('mediana(3;1;4;1;5;9;2;6)', 'Md=3{,}5');
caso('moda(1;2;2;3;3;4)', 'Mo=2;\\ 3');
caso('desvio(2;4;4;4;5;5;7;9)', '\\sigma=2');
caso('media(2,5; 3; 4,5)', '\\frac{10}{3}');
caso('comb(5;2)', '10');
caso('arranjo(5;2)', '20');
caso('perm(4)', '24');
// parábola
caso('f(x)=x^2-4x+3', 'V=\\left(2;\\ -1\\right)');
caso('y=-x^2+2x+3', 'V=\\left(1;\\ 4\\right)');
// ferramentas
caso('mmc(12,18)', '36');
caso('mdc(12;18)', '6');
caso('fatorar(360)', '2^{3}\\cdot 3^{2}\\cdot 5');
caso('fatorar(97)', 'primo');
// erros amigáveis
caso('2+', 'ERRO');
caso('(2+3', 'ERRO');
caso('\\placeholder{}+1', 'ERRO');
// ferramentas extras (chamadas diretas)
{
  const X = await import('../js/motor/extras.js');
  const { Q } = await import('../js/motor/racional.js');
  const ok = (nome, cond) => { total++; if (!cond) { falhas++; console.log('✗', nome); } else if (process.env.V) console.log('✓', nome); };
  const q = (x) => Q.fromDecimal(String(x));
  ok('20% de 150', X.porcentagem('de', q(20), q(150)).resposta === '30');
  ok('30 é quanto % de 120', X.porcentagem('quanto', q(30), q(120)).resposta === '25\\%');
  ok('aumento 10% de 200', X.porcentagem('aumento', q(10), q(200)).resposta === '220');
  ok('desconto 15% de 80', X.porcentagem('desconto', q(15), q(80)).resposta === '68');
  ok('regra de 3 direta', X.regraDeTres(q(3), q(12), q(5), false).resposta === 'x=20');
  ok('regra de 3 inversa', X.regraDeTres(q(4), q(6), q(8), true).resposta === 'x=3');
  ok('juros simples', X.juros('simples', 1000, 2, 12).resposta.includes('J=R\\$\\,240{,}00'));
  ok('juros compostos', X.juros('compostos', 1000, 2, 12).resposta.includes('M=R\\$\\,1.268{,}24'));
  const M = (l) => l.map((r) => r.map(q));
  ok('det 2x2', X.matrizes('det', M([[1, 2], [3, 4]])).resposta === '\\det=-2');
  ok('det 3x3', X.matrizes('det', M([[2, 1, 3], [1, 3, 2], [3, 2, 1]])).resposta === '\\det=-18');
  ok('det 4x4', X.matrizes('det', M([[1, 0, 2, -1], [3, 0, 0, 5], [2, 1, 4, -3], [1, 0, 5, 0]])).resposta === '\\det=30');
  ok('inversa 2x2', X.matrizes('inversa', M([[4, 7], [2, 6]])).resposta.includes('0{,}6 & -0{,}7'));
  ok('produto', X.matrizes('mult', M([[1, 2], [3, 4]]), M([[5, 6], [7, 8]])).resposta.includes('19 & 22'));
  ok('área círculo r=2', X.geometria('circulo', { r: 2 }).resposta.startsWith('12{,}566'));
  ok('pitágoras 3-4', X.geometria('pitagoras', { a: 3, b: 4, c: NaN }).resposta === 'c\\approx 5');
  ok('volume esfera', X.geometria('esfera', { r: 3 }).resposta.startsWith('113{,}097'));
  ok('2,5 km em m', X.converter('comprimento', 2.5, 'km', 'm').resposta.startsWith('2500'));
  ok('100 °C em °F', X.converter('temperatura', 100, '°C', '°F').resposta.startsWith('212'));
  ok('72 km/h em m/s', X.converter('velocidade', 72, 'km/h', 'm/s').resposta.startsWith('20'));
}
console.log(`\n${total - falhas}/${total} testes passaram${cas ? '' : ' (sem nerdamer)'}`);
process.exit(falhas ? 1 : 0);
