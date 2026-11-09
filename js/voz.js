// Converte matemática falada em português para expressão: "dois x mais três igual a sete" → "2x+3=7"
const UNID = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19 };
const DEZ = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 };
const CEM = { cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900 };
const ORD = { meio: 2, meios: 2, terco: 3, tercos: 3, quarto: 4, quartos: 4, quinto: 5, quintos: 5, sexto: 6, sextos: 6, setimo: 7, setimos: 7, oitavo: 8, oitavos: 8, nono: 9, nonos: 9, decimo: 10, decimos: 10 };

const tirarAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// frases → símbolos (ordem importa: as mais longas primeiro)
const FRASES = [
  ['elevado ao quadrado', ' ^2 '], ['ao quadrado', ' ^2 '], ['elevado ao cubo', ' ^3 '], ['ao cubo', ' ^3 '],
  ['elevado a', ' ^ '], ['elevado na', ' ^ '], ['elevado', ' ^ '], ['na potencia', ' ^ '], ['a potencia de', ' ^ '],
  ['raiz quadrada de', ' RAIZ '], ['raiz quadrada da', ' RAIZ '], ['raiz quadrada do', ' RAIZ '], ['raiz cubica de', ' RAIZ3 '], ['raiz cubica da', ' RAIZ3 '], ['raiz de', ' RAIZ '], ['raiz da', ' RAIZ '], ['raiz do', ' RAIZ '], ['raiz quadrada', ' RAIZ '], ['raiz', ' RAIZ '],
  ['maior ou igual a', ' >= '], ['maior ou igual', ' >= '], ['menor ou igual a', ' <= '], ['menor ou igual', ' <= '],
  ['maior que', ' > '], ['maior do que', ' > '], ['menor que', ' < '], ['menor do que', ' < '], ['diferente de', ' != '],
  ['e igual a', ' = '], ['igual a', ' = '], ['igual', ' = '], ['da igual a', ' = '],
  ['multiplicado por', ' * '], ['vezes', ' * '], ['dividido por', ' / '], ['divido por', ' / '], ['dividido', ' / '], ['sobre', ' / '], ['barra', ' / '],
  ['mais', ' + '], ['menos', ' - '], ['negativo', ' - '],
  ['abre parenteses', ' ( '], ['abre parentese', ' ( '], ['fecha parenteses', ' ) '], ['fecha parentese', ' ) '], ['abre chaves', ' ( '], ['fecha chaves', ' ) '],
  ['por cento', ' % '], ['porcento', ' % '], ['fatorial', ' ! '],
  ['logaritmo natural de', ' FN:ln '], ['logaritmo natural', ' FN:ln '], ['ln de', ' FN:ln '], ['logaritmo de', ' FN:log '], ['log de', ' FN:log '], ['logaritmo', ' FN:log '],
  ['seno de', ' FN:sen '], ['seno', ' FN:sen '], ['cosseno de', ' FN:cos '], ['cosseno', ' FN:cos '], ['tangente de', ' FN:tg '], ['tangente', ' FN:tg '],
  ['modulo de', ' FN:abs '], ['valor absoluto de', ' FN:abs '],
  ['derivada de', ' DERIVADA '], ['a derivada de', ' DERIVADA '], ['derive', ' DERIVADA '], ['derivar', ' DERIVADA '],
  ['integral de', ' INTEGRAL '], ['integral', ' INTEGRAL '], ['integre', ' INTEGRAL '],
  ['limite de', ' LIMITE '], ['limite', ' LIMITE '], ['quando', ' QUANDO '], ['tende a', ' TENDE '], ['tendendo a', ' TENDE '], ['tende para', ' TENDE '],
  ['mmc de', ' MMC '], ['mmc', ' MMC '], ['minimo multiplo comum de', ' MMC '], ['mdc de', ' MDC '], ['mdc', ' MDC '], ['maximo divisor comum de', ' MDC '], ['fatorar', ' FATORAR '], ['fatore', ' FATORAR '],
  ['infinito', ' INF '], ['pi', ' pi '], ['virgula', ' , '], ['ponto', ' , '],
  ['xis', ' x '], ['ipsilon', ' y '], ['ypsilon', ' y '], ['ze', ' z '],
  ['graus', ' ° '], ['grau', ' ° '],
];
const LIXO = ['quanto e', 'quanto da', 'calcule', 'calcular', 'resolva', 'resolver', 'a equacao', 'equacao', 'o resultado de', 'qual e', 'qual o', 'quanto', 'de x', 'em relacao a x', 'por favor', 'o', 'a'];

export function falaParaExpressao(frase) {
  let s = ' ' + tirarAcento(String(frase).toLowerCase()) + ' ';
  s = s.replace(/[?!.]/g, ' ').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  s = s.replace(/(\d)\s*,\s*(\d)/g, '$1,$2');
  // "2 x 4" falado = 2 vezes 4 (x entre dois números é multiplicação)
  for (let k = 0; k < 3; k++) s = s.replace(/(\d)\s*(?:x|xis)\s*(?=\d|(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|mil|zero)\b)/g, '$1 * ');
  s = s.replace(/\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|vinte|trinta|cem|mil)\s+(?:x|xis)\s+(?=\d|(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|vinte|trinta|cem|mil)\b)/g, '$1 vezes ');
  // limpa palavras de comando no começo
  for (const l of ['quanto e', 'quanto da', 'calcule', 'calcular', 'resolva', 'resolver', 'qual e', 'qual o resultado de', 'o resultado de', 'determine', 'encontre', 'ache']) s = s.replace(new RegExp('^\\s*' + l + '\\s'), ' ');
  s = s.replace(/\s(a equacao|equacao|a expressao|expressao)\s/g, ' ');
  for (const [a, b] of FRASES) s = s.replace(new RegExp('(?<=\\s)' + a.replace(/ /g, '\\s+') + '(?=\\s)', 'g'), b);
  s = s.replace(/\s(em relacao a|em relacao ao)\s+[a-z]\s/g, ' ');
  let toks = s.split(/\s+/).filter(Boolean);
  toks = numerosPorExtenso(toks);
  return montar(toks);
}

function conectorValido(antes, depois) {
  if (depois === undefined) return false;
  if (antes in DEZ) return depois in UNID && UNID[depois] < 10 && UNID[depois] > 0;
  if (antes in CEM) return depois in DEZ || (depois in UNID && UNID[depois] > 0);
  if (antes === 'mil') return depois in CEM || depois in DEZ || depois in UNID;
  return false;
}

function numerosPorExtenso(toks) {
  const out = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t in UNID || t in DEZ || t in CEM || t === 'mil') {
      let total = 0, atual = 0, j = i;
      while (j < toks.length) {
        const w = toks[j];
        if (w in UNID) atual += UNID[w];
        else if (w in DEZ) atual += DEZ[w];
        else if (w in CEM) atual += CEM[w];
        else if (w === 'mil') { total += (atual || 1) * 1000; atual = 0; }
        else if (w === 'e' && j > i && conectorValido(toks[j - 1], toks[j + 1])) { /* "vinte e cinco", "cento e dez" */ }
        else break;
        j++;
      }
      let n = total + atual;
      // "dois terços"
      if (toks[j] && toks[j] in ORD) { out.push(`(${n}/${ORD[toks[j]]})`); i = j + 1; continue; }
      out.push(String(n));
      i = j;
      continue;
    }
    if (t in ORD && out.length && /^\d+$/.test(out[out.length - 1])) { out[out.length - 1] = `(${out[out.length - 1]}/${ORD[t]})`; i++; continue; }
    out.push(t);
    i++;
  }
  return out;
}

const SIMB = new Set(['+', '-', '*', '/', '^', '=', '<', '>', '<=', '>=', '!=', '(', ')', '%', '!', ',', '°', 'pi']);

function montar(toks) {
  // agrupa números decimais "3 , 5"
  const t = [];
  for (let i = 0; i < toks.length; i++) {
    if (toks[i] === ',' && /^\d+$/.test(t[t.length - 1] || '') && /^\d+$/.test(toks[i + 1] || '')) { t[t.length - 1] += ',' + toks[i + 1]; i++; continue; }
    t.push(toks[i]);
  }
  // comandos de alto nível
  const k = t[0];
  if (k === 'DERIVADA') return `\\frac{d}{dx}\\left(${corpo(t.slice(1))}\\right)`;
  if (k === 'INTEGRAL') {
    // "integral de 0 até 1 de x²"
    const ate = t.indexOf('ate');
    if (ate > 0 && t[1] && ate === 2) {
      const a = t[1], b = t[3];
      return `\\int_{${a}}^{${b}}\\left(${corpo(t.slice(t[4] === 'de' ? 5 : 4))}\\right)dx`;
    }
    return `\\int\\left(${corpo(t.slice(1))}\\right)dx`;
  }
  if (k === 'LIMITE') {
    const q = t.indexOf('QUANDO');
    const td = t.indexOf('TENDE');
    if (q > 0 && td > q) {
      const v = t[q + 1] && /^[a-z]$/.test(t[q + 1]) ? t[q + 1] : 'x';
      let alvo = t.slice(td + 1).join('');
      alvo = alvo.replace('INF', '\\infty').replace('maisINF', '\\infty').replace('+\\infty', '\\infty');
      return `\\lim_{${v}\\to ${alvo || '0'}}\\left(${corpo(t.slice(1, q))}\\right)`;
    }
  }
  if (k === 'MMC' || k === 'MDC' || k === 'FATORAR') {
    const nums = t.slice(1).filter((x) => /^[\d,]+$/.test(x));
    return `${k.toLowerCase()}(${nums.join(';')})`;
  }
  return corpo(t);
}

// corpo da expressão: transforma tokens em texto que o parser entende
function corpo(t) {
  const out = [];
  for (let i = 0; i < t.length; i++) {
    const x = t[i];
    if (x === 'RAIZ' || x === 'RAIZ3') {
      // raiz do próximo "átomo" (número, letra ou grupo entre parênteses)
      const { txt, fim } = atomo(t, i + 1);
      out.push(x === 'RAIZ' ? `sqrt(${txt})` : `(${txt})^(1/3)`);
      i = fim - 1;
      continue;
    }
    if (x.startsWith('FN:')) {
      const { txt, fim } = atomo(t, i + 1);
      out.push(`${x.slice(3)}(${txt})`);
      i = fim - 1;
      continue;
    }
    if (x === 'INF') { out.push('inf'); continue; }
    if (x === 'e') { out.push(';'); continue; }
    if (x === 'de' || x === 'do' || x === 'da' || x === 'o' || x === 'a') {
      // "20% de 150" → 20%*150
      if (out[out.length - 1] === '%') out.push('*');
      continue;
    }
    if (SIMB.has(x) || /^[\d,]+$/.test(x) || /^\(\d+\/\d+\)$/.test(x)) { out.push(x === ',' ? '' : x); continue; }
    if (/^[a-z]$/.test(x)) { out.push(x); continue; }
    if (/^[a-z]\^?\d*$/.test(x) || /^\d+[a-z]$/.test(x) || /^[\d+\-*/^()=<>a-z,.%!]+$/.test(x)) { out.push(x); continue; }
    // palavra desconhecida: ignora
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

function atomo(t, i) {
  if (t[i] === '(') {
    let d = 0, j = i;
    for (; j < t.length; j++) { if (t[j] === '(') d++; if (t[j] === ')') { d--; if (!d) break; } }
    return { txt: corpo(t.slice(i + 1, j)), fim: j + 1 };
  }
  if (t[i] === '-' ) { const r = atomo(t, i + 1); return { txt: '-' + r.txt, fim: r.fim }; }
  // número seguido de letra (2 x) ou potência
  let j = i + 1;
  let txt = t[i] || '';
  if (t[j] === '^' && t[j + 1]) { txt += '^' + t[j + 1]; j += 2; }
  if (t[j] === '°') { txt += '°'; j++; }
  return { txt, fim: j };
}
