// Aba "Mais": gráficos, estatística, porcentagem, regra de três, juros, combinatória, matrizes, geometria, conversões.
import { Q, ErroMat } from './motor/racional.js';
import { analisar } from './motor/parser.js';
import { latex as latexDe, variaveis } from './motor/ast.js';
import { estatistica, lerNumeros } from './motor/estatistica.js';
import { porcentagem, regraDeTres, juros, combinatoria, matrizes, geometria, converter, UNIDADES } from './motor/extras.js';
import { GraficoFuncoes } from './grafico.js';

let api = null; // { mostrarSolucao, toast, mat }
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...filhos) => { const e = document.createElement(tag); Object.assign(e, props); for (const f of filhos) e.append(f); return e; };

// número em texto brasileiro → Number / Q
const numero = (s, nome = 'valor') => {
  const t = String(s ?? '').trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!/^-?\d*\.?\d+$/.test(t)) throw new ErroMat(`Preencha ${nome} com um número.`);
  return Number(t);
};
const racional = (s, nome) => { numero(s, nome); return Q.fromDecimal(String(s).trim().replace(/\s/g, '').replace(',', '.')); };

const FERRAMENTAS = [
  { id: 'graficos', nome: 'Gráficos', desc: 'Funções, parábolas, raízes e vértice', cor: '#1f6fff', fundo: '#e6eeff', ico: '📈' },
  { id: 'estatistica', nome: 'Estatística', desc: 'Média, mediana, moda, desvio padrão', cor: '#12a866', fundo: '#e3f6ec', ico: 'x̄' },
  { id: 'porcentagem', nome: 'Porcentagem', desc: 'Descontos, aumentos e “quanto %”', cor: '#e8590c', fundo: '#fff0e5', ico: '%' },
  { id: 'regra3', nome: 'Regra de três', desc: 'Direta e inversa', cor: '#8a3ffc', fundo: '#f1e9ff', ico: '⇄' },
  { id: 'juros', nome: 'Juros', desc: 'Simples e compostos', cor: '#0c8599', fundo: '#e3f4f6', ico: 'R$' },
  { id: 'combinatoria', nome: 'Combinatória', desc: 'Combinação, arranjo, permutação', cor: '#d6336c', fundo: '#fde8ef', ico: 'C' },
  { id: 'matrizes', nome: 'Matrizes', desc: 'Determinante, inversa, produto', cor: '#5f3dc4', fundo: '#ede8fb', ico: '▦' },
  { id: 'geometria', nome: 'Geometria', desc: 'Áreas, volumes, Pitágoras', cor: '#2b8a3e', fundo: '#e6f4e9', ico: '△' },
  { id: 'conversoes', nome: 'Conversões', desc: 'Medidas, massa, tempo, temperatura', cor: '#c2255c', fundo: '#fbe9f0', ico: '⇆' },
];

export function iniciarFerramentas(a) {
  api = a;
  const g = $('gradeFerr');
  for (const f of FERRAMENTAS) {
    const ic = el('div', { className: 'ico-f', textContent: f.ico }); ic.style.background = f.fundo; ic.style.color = f.cor;
    const b = el('button', { className: 'card-ferr' }, ic, el('b', { textContent: f.nome }), el('small', { textContent: f.desc }));
    b.addEventListener('click', () => abrir(f.id));
    g.append(b);
  }
  $('ferVoltar').addEventListener('click', () => history.back());
}

function fechar() { $('ferramenta').hidden = true; }

export function abrir(id, dados) {
  const f = FERRAMENTAS.find((x) => x.id === id);
  $('ferTitulo').textContent = f.nome;
  const corpo = $('ferCorpo');
  corpo.innerHTML = '';
  $('ferramenta').hidden = false;
  window.__trazerParaFrente?.($('ferramenta'));
  history.pushState({ ferr: 1 }, '');
  MONTAR[id](corpo, dados);
  corpo.scrollTop = 0;
}

// ---------- utilidades de formulário ----------
function campo(rotulo, id, { tipo = 'text', valor = '', dica = '', modo = 'decimal' } = {}) {
  const i = el('input', { id, type: tipo, value: valor, inputMode: modo, autocomplete: 'off' });
  const l = el('label', {}, rotulo, i);
  if (dica) l.append(el('span', { className: 'dica-f', textContent: dica }));
  return l;
}
function segmentado(opcoes, atual, aoMudar) {
  const box = el('div', { className: 'seg' });
  for (const [v, t] of opcoes) {
    const b = el('button', { type: 'button', textContent: t, className: v === atual ? 'on' : '' });
    b.addEventListener('click', () => { box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); aoMudar(v); });
    box.append(b);
  }
  return box;
}
function botaoCalcular(acao, texto = 'Calcular') {
  const b = el('button', { className: 'btn-principal', type: 'button', textContent: texto });
  b.addEventListener('click', () => { try { api.mostrarSolucao(acao(), '✓ calculado no aparelho'); } catch (e) { if (e instanceof ErroMat || e?.name === 'ErroMat') api.toast(e.message, true); else { console.error(e); api.toast('Não consegui calcular. Confira os valores.', true); } } });
  return b;
}
const v = (id) => $(id).value;

const MONTAR = {
  // ---------- gráficos ----------
  graficos(corpo, dados) {
    const tela = el('div', { className: 'graf-tela' });
    const cvBox = el('div', { className: 'graf-cv' });
    const cv = el('canvas');
    const zoom = el('div', { className: 'graf-zoom' });
    const bMais = el('button', { type: 'button', textContent: '+' }), bMenos = el('button', { type: 'button', textContent: '−' }), bCentro = el('button', { type: 'button', textContent: '⌖' });
    zoom.append(bMais, bMenos, bCentro);
    cvBox.append(cv, zoom);
    const lista = el('div', { className: 'graf-lista' });
    const add = el('button', { type: 'button', className: 'btn-tom', textContent: '+ Adicionar função' });
    const dica = el('p', { className: 'graf-dica', innerHTML: 'Digite como na calculadora: <b>x^2-4x+3</b>, <b>2x+1</b>, <b>sen(x)</b>, <b>sqrt(x)</b>. Arraste para mover, use dois dedos para zoom e toque na curva para ver o valor.' });
    const analisarBtn = el('button', { type: 'button', className: 'btn-principal', textContent: 'Analisar a 1ª função (raízes, vértice…)' });
    tela.append(cvBox, lista, add, analisarBtn, dica);
    corpo.append(tela);
    const g = new GraficoFuncoes(cv);
    const CORES = ['#1f6fff', '#e8590c', '#12a866', '#8a3ffc', '#d6336c', '#0c8599'];
    const itens = [];
    const atualizar = () => {
      const fs = [];
      itens.forEach((it, k) => {
        it.cor.style.background = CORES[k % CORES.length];
        const txt = it.inp.value.trim();
        if (!txt) return;
        try {
          let a = analisar(txt.replace(/^\s*[yf]\s*(\(x\))?\s*=/, ''));
          if (a.t === 'func') a = a.f;
          if (a.t === 'eq') throw new Error('eq');
          const vs = [...variaveis(a)];
          if (vs.length > 1) throw new Error('vars');
          fs.push({ ast: a, v: vs[0] || 'x', latex: latexDe(a), cor: CORES[k % CORES.length] });
          it.inp.style.color = '';
        } catch { it.inp.style.color = '#d92d3a'; }
      });
      g.definir(fs);
    };
    const novo = (txt = '') => {
      if (itens.length >= 6) { api.toast('Até 6 funções ao mesmo tempo.'); return; }
      const cor = el('div', { className: 'cor' });
      const inp = el('input', { value: txt, placeholder: 'ex.: x^2-4x+3', autocomplete: 'off', spellcheck: false });
      const rm = el('button', { type: 'button', textContent: '×', ariaLabel: 'Remover' });
      const box = el('div', { className: 'graf-item' }, cor, el('span', { textContent: `f${itens.length + 1}(x) =` }), inp, rm);
      const it = { box, inp, cor };
      let t;
      inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(atualizar, 250); });
      rm.addEventListener('click', () => { itens.splice(itens.indexOf(it), 1); box.remove(); itens.forEach((x, k) => (x.box.querySelector('span').textContent = `f${k + 1}(x) =`)); atualizar(); });
      itens.push(it); lista.append(box);
      return it;
    };
    add.addEventListener('click', () => novo().inp.focus());
    bMais.addEventListener('click', () => g.zoom(1.4));
    bMenos.addEventListener('click', () => g.zoom(1 / 1.4));
    bCentro.addEventListener('click', () => g.enquadrar());
    analisarBtn.addEventListener('click', () => {
      const t = itens[0]?.inp.value.trim();
      if (!t) { api.toast('Digite uma função primeiro.'); return; }
      try { api.resolverTexto(t.replace(/^\s*[yf]\s*(\(x\))?\s*=/, 'f(x)=').replace(/^(?!f\(x\)=)/, 'f(x)=')); } catch (e) { api.toast(e.message, true); }
    });
    (dados?.funcoes?.length ? dados.funcoes : ['x^2-4x+3', '2x-3']).forEach((f) => novo(f));
    requestAnimationFrame(atualizar);
  },

  // ---------- estatística ----------
  estatistica(corpo) {
    const f = el('div', { className: 'form-ferr' });
    const ta = el('textarea', { id: 'estNums', placeholder: 'Ex.: 7; 8,5; 6; 9; 7; 10', inputMode: 'decimal' });
    ta.value = '7; 8,5; 6; 9; 7; 10; 5,5; 7';
    f.append(el('label', {}, 'Números (separe com ponto e vírgula ou um por linha)', ta),
      el('p', { className: 'dica-f', innerHTML: 'Dica: <b>7x3</b> quer dizer o número 7 três vezes.' }),
      botaoCalcular(() => estatistica(lerNumeros(v('estNums')))));
    corpo.append(f);
  },

  // ---------- porcentagem ----------
  porcentagem(corpo) {
    const f = el('div', { className: 'form-ferr' });
    let modo = 'de';
    const rot = { de: ['Porcentagem (%)', 'de quanto?'], quanto: ['Parte', 'Total'], aumento: ['Aumento (%)', 'Valor'], desconto: ['Desconto (%)', 'Valor'] };
    const l1 = campo(rot.de[0], 'pcA', { valor: '20' }), l2 = campo(rot.de[1], 'pcB', { valor: '150' });
    const mudar = (m) => { modo = m; l1.firstChild.textContent = rot[m][0]; l2.firstChild.textContent = rot[m][1]; };
    f.append(segmentado([['de', 'X% de Y'], ['quanto', 'Quanto %?'], ['aumento', 'Aumento'], ['desconto', 'Desconto']], modo, mudar), el('div', { className: 'linha-campos' }, l1, l2),
      botaoCalcular(() => porcentagem(modo, racional(v('pcA'), 'o primeiro campo'), racional(v('pcB'), 'o segundo campo'))));
    corpo.append(f);
  },

  // ---------- regra de três ----------
  regra3(corpo) {
    const f = el('div', { className: 'form-ferr' });
    let inversa = false;
    f.append(segmentado([['d', 'Direta'], ['i', 'Inversa']], 'd', (m) => (inversa = m === 'i')),
      el('p', { className: 'dica-f', textContent: 'A está para B assim como C está para x.' }),
      el('div', { className: 'linha-campos' }, campo('A', 'r3a', { valor: '3' }), campo('B', 'r3b', { valor: '12' })),
      el('div', { className: 'linha-campos' }, campo('C', 'r3c', { valor: '5' }), el('label', {}, 'x', el('input', { value: '?', disabled: true }))),
      botaoCalcular(() => regraDeTres(racional(v('r3a'), 'A'), racional(v('r3b'), 'B'), racional(v('r3c'), 'C'), inversa)));
    corpo.append(f);
  },

  // ---------- juros ----------
  juros(corpo) {
    const f = el('div', { className: 'form-ferr' });
    let tipo = 'compostos';
    f.append(segmentado([['simples', 'Simples'], ['compostos', 'Compostos']], tipo, (m) => (tipo = m)),
      campo('Capital inicial (R$)', 'juC', { valor: '1000' }),
      el('div', { className: 'linha-campos' }, campo('Taxa (% por período)', 'juI', { valor: '2' }), campo('Tempo (períodos)', 'juT', { valor: '12' })),
      el('p', { className: 'dica-f', textContent: 'Taxa e tempo na mesma unidade (ex.: % ao mês e meses).' }),
      botaoCalcular(() => juros(tipo, numero(v('juC'), 'o capital'), numero(v('juI'), 'a taxa'), numero(v('juT'), 'o tempo'))));
    corpo.append(f);
  },

  // ---------- combinatória ----------
  combinatoria(corpo) {
    const f = el('div', { className: 'form-ferr' });
    let tipo = 'comb';
    const lp = campo('p (quantos escolher)', 'coP', { valor: '2', modo: 'numeric' });
    f.append(segmentado([['comb', 'Combinação'], ['arranjo', 'Arranjo'], ['perm', 'Permutação']], tipo, (m) => { tipo = m; lp.hidden = m === 'perm'; }),
      el('div', { className: 'linha-campos' }, campo('n (total)', 'coN', { valor: '5', modo: 'numeric' }), lp),
      el('p', { className: 'dica-f', textContent: 'Combinação: a ordem não importa (grupos). Arranjo: a ordem importa (pódio, senha).' }),
      botaoCalcular(() => combinatoria(tipo, racional(v('coN'), 'n'), tipo === 'perm' ? null : racional(v('coP'), 'p'))));
    corpo.append(f);
  },

  // ---------- matrizes ----------
  matrizes(corpo) {
    const f = el('div', { className: 'form-ferr' });
    let n = 2, op = 'det';
    const gA = el('div'), gB = el('div');
    const desenhar = () => {
      const grade = (pref, alvo, ex) => {
        alvo.innerHTML = '';
        const g = el('div', { className: 'grade-mat' }); g.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) g.append(el('input', { id: `${pref}${i}${j}`, value: String(ex(i, j)), inputMode: 'decimal' }));
        alvo.append(el('label', {}, pref === 'mA' ? 'Matriz A' : 'Matriz B', g));
      };
      grade('mA', gA, (i, j) => [[2, 1, 3], [1, 3, 2], [3, 2, 1]][i][j]);
      grade('mB', gB, (i, j) => (i === j ? 1 : 0));
      gB.hidden = !['soma', 'sub', 'mult'].includes(op);
    };
    const ler = (pref) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => racional(v(`${pref}${i}${j}`), 'todas as casas da matriz')));
    f.append(segmentado([['2', '2×2'], ['3', '3×3'], ['4', '4×4']], '2', (m) => { n = Number(m); desenhar(); }),
      segmentado([['det', 'Determinante'], ['inversa', 'Inversa'], ['transposta', 'Transposta'], ['soma', 'A + B'], ['sub', 'A − B'], ['mult', 'A · B']], op, (m) => { op = m; desenhar(); }),
      gA, gB, botaoCalcular(() => matrizes(op, ler('mA'), ['soma', 'sub', 'mult'].includes(op) ? ler('mB') : null)));
    corpo.append(f);
    desenhar();
  },

  // ---------- geometria ----------
  geometria(corpo) {
    const f = el('div', { className: 'form-ferr' });
    const FIG = {
      quadrado: ['Quadrado', [['l', 'Lado']]], retangulo: ['Retângulo', [['b', 'Base'], ['h', 'Altura']]], triangulo: ['Triângulo', [['b', 'Base'], ['h', 'Altura']]],
      circulo: ['Círculo', [['r', 'Raio']]], trapezio: ['Trapézio', [['B', 'Base maior'], ['b', 'Base menor'], ['h', 'Altura']]], losango: ['Losango', [['D', 'Diagonal maior'], ['d', 'Diagonal menor']]],
      cubo: ['Cubo', [['a', 'Aresta']]], paralelepipedo: ['Paralelepípedo', [['a', 'Comprimento'], ['b', 'Largura'], ['c', 'Altura']]], cilindro: ['Cilindro', [['r', 'Raio'], ['h', 'Altura']]],
      cone: ['Cone', [['r', 'Raio'], ['h', 'Altura']]], esfera: ['Esfera', [['r', 'Raio']]],
      pitagoras: ['Pitágoras', [['a', 'Cateto a'], ['b', 'Cateto b (ou vazio)'], ['c', 'Hipotenusa (ou vazio)']]], trig: ['Triângulo retângulo (ângulo)', [['ang', 'Ângulo (graus)'], ['h', 'Hipotenusa']]],
    };
    const sel = el('select', { id: 'geoFig' });
    for (const [k, [nome]] of Object.entries(FIG)) sel.append(el('option', { value: k, textContent: nome }));
    const campos = el('div', { className: 'linha-campos' });
    const montar = () => {
      campos.innerHTML = '';
      for (const [k, nome] of FIG[sel.value][1]) campos.append(campo(nome, 'geo_' + k, { valor: { l: '4', b: '6', h: '3', r: '2', B: '8', D: '6', d: '4', a: '3', c: '', ang: '30' }[k] ?? '' }));
      if (sel.value === 'pitagoras') { $('geo_a').value = '3'; $('geo_b').value = '4'; $('geo_c').value = ''; }
    };
    sel.addEventListener('change', montar);
    f.append(el('label', {}, 'Figura', sel), campos, botaoCalcular(() => {
      const vals = {};
      for (const [k] of FIG[sel.value][1]) { const t = v('geo_' + k).trim(); vals[k] = t ? numero(t, FIG[sel.value][1].find((x) => x[0] === k)[1]) : NaN; }
      return geometria(sel.value, vals);
    }));
    corpo.append(f);
    montar();
  },

  // ---------- conversões ----------
  conversoes(corpo) {
    const f = el('div', { className: 'form-ferr' });
    const NOMES = { comprimento: 'Comprimento', massa: 'Massa', tempo: 'Tempo', area: 'Área', volume: 'Volume', velocidade: 'Velocidade', temperatura: 'Temperatura' };
    const gr = el('select', { id: 'cvG' }); for (const [k, n] of Object.entries(NOMES)) gr.append(el('option', { value: k, textContent: n }));
    const de = el('select', { id: 'cvDe' }), para = el('select', { id: 'cvPara' });
    const preencher = () => {
      for (const s of [de, para]) { s.innerHTML = ''; for (const u of Object.keys(UNIDADES[gr.value])) s.append(el('option', { value: u, textContent: u })); }
      const us = Object.keys(UNIDADES[gr.value]); de.value = us[0]; para.value = us[Math.min(3, us.length - 1)] || us[1];
    };
    gr.addEventListener('change', preencher);
    f.append(el('label', {}, 'Grandeza', gr), campo('Valor', 'cvV', { valor: '1' }), el('div', { className: 'linha-campos' }, el('label', {}, 'De', de), el('label', {}, 'Para', para)),
      botaoCalcular(() => converter(gr.value, numero(v('cvV'), 'o valor'), de.value, para.value), 'Converter'));
    corpo.append(f);
    preencher();
  },
};
