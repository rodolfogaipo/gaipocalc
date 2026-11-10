// Lê LaTeX (do teclado matemático) ou texto comum ("2x+3=7", "sqrt(2)") e monta a árvore.
import { Q, ErroMat } from './racional.js';
import * as A from './ast.js';

const PALAVRAS_FUNC = {
  sen: 'sin', sin: 'sin', cos: 'cos', tg: 'tan', tan: 'tan', cotg: 'cot', cot: 'cot', sec: 'sec', cossec: 'csc', csc: 'csc',
  arcsen: 'asin', arcsin: 'asin', asin: 'asin', arccos: 'acos', acos: 'acos', arctg: 'atan', arctan: 'atan', atan: 'atan',
  senh: 'sinh', sinh: 'sinh', cosh: 'cosh', tgh: 'tanh', tanh: 'tanh',
  ln: 'ln', log: 'log', exp: 'exp',
};
const PALAVRAS_ESPECIAIS = ['sqrt', 'raiz', 'pi', 'mmc', 'mdc', 'abs', 'fatorar', 'lim', 'int', 'infinito', 'inf', 'mediana', 'media', 'moda', 'variancia', 'desvio', 'amplitude', 'estatistica', 'comb', 'arranjo', 'perm'];
export const CHAMADAS = ['mmc', 'mdc', 'fatorar', 'mediana', 'media', 'moda', 'variancia', 'desvio', 'amplitude', 'estatistica', 'comb', 'arranjo', 'perm'];
const CMD_FUNC = {
  sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc', arcsin: 'asin', arccos: 'acos', arctan: 'atan',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', ln: 'ln', log: 'log', exp: 'exp', lg: 'log', tg: 'tan', sen: 'sin',
};
const TODAS_PALAVRAS = [...Object.keys(PALAVRAS_FUNC), ...PALAVRAS_ESPECIAIS].sort((a, b) => b.length - a.length);

// ---------- tokenizador ----------
export function tokenizar(src) {
  const t = [];
  let i = 0;
  let nivel = 0, nivelCall = -1;
  const s = src
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\\placeholder(\[[^\]]*\])?\{\}/g, '☐')
    .replace(/[−–—]/g, '-')
    .replace(/[×·∙⋅]/g, '*')
    .replace(/÷/g, '\\div ')
    .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=')
    .replace(/π/g, '\\pi ').replace(/∞/g, '\\infty ').replace(/√/g, '\\sqrt ')
    .replace(/∫/g, '\\int ').replace(/→/g, '\\to ').replace(/°/g, '^{\\circ}')
    .replace(/²/g, '^2').replace(/³/g, '^3');
  const push = (k, v, extra) => {
    if (k === '(') nivel++;
    if (k === ')') { nivel--; if (nivel < nivelCall) nivelCall = -1; }
    t.push({ k, v, ...(extra || {}) });
  };
  while (i < s.length) {
    const c = s[i];
    if (c === '☐') throw new ErroMat('Preencha os espaços vazios da expressão.');
    if (/\s/.test(c) || c === '&' || c === '$') { i++; continue; }
    if (c === '\\') {
      const nx = s[i + 1];
      if (nx === '\\') { push('nl'); i += 2; continue; }
      if (nx === ',' || nx === ';' || nx === ':' || nx === '!' || nx === ' ' || nx === '>') { i += 2; continue; }
      if (nx === '{' || nx === '}') { push(nx === '{' ? '(' : ')', nx, { chave: true }); i += 2; continue; }
      if (nx === '%') { push('op', '%'); i += 2; continue; }
      if (nx === '|') { push('|'); i += 2; continue; }
      let j = i + 1;
      while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
      const cmd = s.slice(i + 1, j);
      i = j;
      if (!cmd) { i++; continue; }
      tratarComando(cmd);
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
      let j = i;
      while (j < s.length && /[0-9]/.test(s[j])) j++;
      let dec = false;
      const sep = nivelCall >= 0 && nivel >= nivelCall;
      // decimal com ponto, vírgula, ou {,} (MathLive)
      if ((s[j] === '.' || (s[j] === ',' && !sep)) && /[0-9]/.test(s[j + 1] || '')) {
        dec = true; j++;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
      } else if (!sep && s.startsWith('{,}', j) && /[0-9]/.test(s[j + 3] || '')) {
        dec = true; j += 3;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
      }
      const txt = s.slice(i, j).replace('{,}', '.').replace(',', '.');
      push('num', txt, { dec });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      // palavra conhecida (sen, cos, sqrt...) ou letras soltas (xy = x·y)
      const resto = s.slice(i).toLowerCase();
      const p = TODAS_PALAVRAS.find((w) => resto.startsWith(w));
      if (p) {
        tratarPalavra(p);
        i += p.length;
        continue;
      }
      push('id', c);
      i++;
      continue;
    }
    if (c === '{' && s.startsWith('{,}', i)) { push(','); i += 3; continue; }
    if ('<>!='.includes(c)) {
      const two = s.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '!=' || two === '=>' || two === '=<') {
        push('rel', two === '=>' ? '>=' : two === '=<' ? '<=' : two); i += 2; continue;
      }
      if (two === '<>') { push('rel', '!='); i += 2; continue; }
      if (c === '!') { push('op', '!'); i++; continue; }
      push('rel', c); i++; continue;
    }
    if (c === '-' && s[i + 1] === '>') { push('to'); i += 2; continue; }
    if (c === '*' && s[i + 1] === '*') { push('^'); i += 2; continue; }
    if ('+-*/'.includes(c)) { push('op', c); i++; continue; }
    if (c === '%') { push('op', '%'); i++; continue; }
    if (c === '^' || c === '_') { push(c); i++; continue; }
    if ('([{'.includes(c)) { push('(', c, { chave: c === '{' }); i++; continue; }
    if (')]}'.includes(c)) { push(')', c, { chave: c === '}' }); i++; continue; }
    if (c === '|') { push('|'); i++; continue; }
    if (c === ',') { push(','); i++; continue; }
    if (c === ';') { push(';'); i++; continue; }
    if (c === "'") { push('prime'); i++; continue; }
    if (c === ':') { push('op', '/', { divisao: true }); i++; continue; }
    if (c === '?') { i++; continue; }
    throw new ErroMat(`Não entendi o símbolo "${c}".`);
  }
  return t;

  // dentro de media(…): se tiver ';' separando, a vírgula é decimal (2,5; 3); senão separa (12,18)
  function temPontoVirgulaAdiante() {
    let d = 0;
    for (let k = i; k < s.length; k++) {
      const ch = s[k];
      if (ch === '(') d++;
      else if (ch === ')') { d--; if (d <= 0 && k > i) return false; }
      else if (ch === ';' && d >= 1) return true;
    }
    return false;
  }

  function tratarPalavra(p) {
    if (PALAVRAS_FUNC[p]) push('func', PALAVRAS_FUNC[p]);
    else if (p === 'sqrt' || p === 'raiz') push('sqrt');
    else if (p === 'pi') push('const', 'pi');
    else if (p === 'infinito' || p === 'inf') push('const', 'inf');
    else if (p === 'lim') push('lim');
    else if (p === 'int') push('int');
    else { push('word', p); if (p !== 'abs' && !temPontoVirgulaAdiante()) nivelCall = nivel + 1; }
  }

  function tratarComando(cmd) {
    switch (cmd) {
      case 'left': case 'right': case 'mleft': case 'mright': case 'big': case 'Big': case 'bigl': case 'bigr': case 'Bigl': case 'Bigr':
        if (s[i] === '.') i++;
        return;
      case 'cdot': case 'times': case 'ast': return push('op', '*');
      case 'div': return push('op', '/', { divisao: true });
      case 'frac': case 'dfrac': case 'tfrac': return push('frac');
      case 'sqrt': return push('sqrt');
      case 'pi': return push('const', 'pi');
      case 'infty': case 'infin': return push('const', 'inf');
      case 'exponentialE': return push('id', 'e');
      case 'imaginaryI': return push('const', 'i');
      case 'differentialD': return push('id', 'd');
      case 'le': case 'leq': case 'leqslant': return push('rel', '<=');
      case 'ge': case 'geq': case 'geqslant': return push('rel', '>=');
      case 'ne': case 'neq': return push('rel', '!=');
      case 'lt': return push('rel', '<');
      case 'gt': return push('rel', '>');
      case 'to': case 'rightarrow': case 'longrightarrow': return push('to');
      case 'int': return push('int');
      case 'lim': return push('lim');
      case 'circ': case 'degree': return push('grau');
      case 'pm': return push('op', '+');
      case 'lbrace': return push('(', '{');
      case 'rbrace': return push(')', '}');
      case 'vert': case 'lvert': case 'rvert': case 'mid': return push('|');
      case 'operatorname': case 'mathrm': case 'text': case 'mathit': case 'textrm': case 'mathbf': case 'operatorname*': {
        // lê {palavra}
        while (s[i] === ' ') i++;
        if (s[i] === '{') {
          const f = s.indexOf('}', i);
          const w = s.slice(i + 1, f).replace(/\\,|\s/g, '').toLowerCase();
          i = f + 1;
          if (!w) return;
          if (PALAVRAS_FUNC[w]) return push('func', PALAVRAS_FUNC[w]);
          if (w === 'd') return push('id', 'd');
          if (CHAMADAS.includes(w)) { if (!temPontoVirgulaAdiante()) nivelCall = nivel + 1; return push('word', w); }
          if (w === 'e') return push('id', 'e');
          if (w.length === 1) return push('id', w);
          // texto qualquer: tenta como letras
          for (const ch of w) if (/[a-z]/.test(ch)) push('id', ch);
        }
        return;
      }
      case 'begin': case 'end': {
        // \begin{cases} ... \end{cases}
        if (s[i] === '{') i = s.indexOf('}', i) + 1;
        if (cmd === 'begin' && s[i] === '{') i = s.indexOf('}', i) + 1; // {array}{ll}
        return push(cmd === 'begin' ? 'beginsys' : 'endsys');
      }
      case 'quad': case 'qquad': case 'displaystyle': case 'textstyle': case 'limits': case 'nolimits': case 'mathstrut': return;
      case 'ldots': case 'cdots': case 'dots': throw new ErroMat('Reticências (...) ainda não são aceitas.');
      case 'sum': case 'prod': throw new ErroMat('Somatório (Σ) ainda não é aceito no modo offline. Use “Explicar com IA”.');
      case 'pm_': return;
      default:
        if (CMD_FUNC[cmd]) return push('func', CMD_FUNC[cmd]);
        if (cmd.length === 1 && /[a-zA-Z]/.test(cmd)) return push('id', cmd);
        // letras gregas como variáveis
        if (['alpha', 'beta', 'gamma', 'theta', 'lambda', 'mu', 'phi', 'omega', 'delta', 'sigma', 'tau', 'rho'].includes(cmd)) return push('id', cmd);
        throw new ErroMat(`Comando \\${cmd} ainda não é aceito.`);
    }
  }
}

// ---------- parser ----------
export function analisar(src, opts = {}) {
  if (!src || !String(src).trim()) throw new ErroMat('Digite uma expressão primeiro.');
  const toks = tokenizar(String(src));
  const p = new Parser(toks, opts);
  const r = p.topo();
  return r;
}

class Parser {
  constructor(t, opts) { this.t = t; this.i = 0; this.opts = opts; this.absDepth = 0; this.paraEmDx = 0; }
  peek(o = 0) { return this.t[this.i + o]; }
  next() { return this.t[this.i++]; }
  is(k, v) { const x = this.peek(); return x && x.k === k && (v === undefined || x.v === v); }
  expect(k, msg) {
    const x = this.next();
    if (!x || x.k !== k) throw new ErroMat(msg || 'Expressão incompleta: verifique parênteses e campos.');
    return x;
  }
  fim() { return this.i >= this.t.length; }

  topo() {
    // sistema: \begin{cases}...\end{cases} ou separado por ; / quebra de linha
    if (this.is('beginsys')) {
      this.next();
      const eqs = [];
      while (!this.fim() && !this.is('endsys')) {
        if (this.is('nl') || this.is(';')) { this.next(); continue; }
        eqs.push(this.relacao());
      }
      if (this.is('endsys')) this.next();
      return eqs.length === 1 ? eqs[0] : { t: 'sys', eqs };
    }
    const fdef = this.tentarFuncao();
    if (fdef) return fdef;
    const itens = [this.relacao()];
    while (this.is(';') || this.is('nl') || (this.is(',') && itens[0].t === 'eq')) {
      this.next();
      if (this.fim()) break;
      itens.push(this.relacao());
    }
    if (!this.fim()) {
      const x = this.peek();
      if (x.k === ')') throw new ErroMat('Tem um parêntese fechando sem ter aberto.');
      throw new ErroMat('Não consegui entender a expressão inteira. Confira os símbolos.');
    }
    if (itens.length > 1) return { t: 'sys', eqs: itens };
    return itens[0];
  }

  // f(x) = …  ou  F(x,y) = …
  tentarFuncao() {
    const ini = this.i;
    const nome = this.peek();
    if (!nome || nome.k !== 'id' || this.peek(1)?.k !== '(') return null;
    let j = this.i + 2;
    const vars = [];
    for (;;) {
      const t = this.t[j];
      if (!t || t.k !== 'id' || t.v === 'e') return null;
      vars.push(t.v);
      j++;
      if (this.t[j]?.k === ',' || this.t[j]?.k === ';') { j++; continue; }
      if (this.t[j]?.k === ')') { j++; break; }
      return null;
    }
    if (this.t[j]?.k !== 'rel' || this.t[j].v !== '=') return null;
    if (vars.includes(nome.v) || new Set(vars).size !== vars.length || ['x', 'y', 'z', 't'].includes(nome.v) && vars.length === 1 && false) return null;
    this.i = j + 1;
    try {
      const f = this.expr();
      if (!this.fim()) { this.i = ini; return null; }
      return { t: 'func', nome: nome.v, vars, f };
    } catch (e) { this.i = ini; throw e; }
  }

  relacao() {
    const l = this.expr();
    if (this.is('rel')) {
      const op = this.next().v;
      const r = this.expr();
      if (this.is('rel')) throw new ErroMat('Desigualdade dupla (a < x < b) ainda não é aceita: separe em duas.');
      return { t: 'eq', op, l, r };
    }
    return l;
  }

  expr() {
    let l = this.termo();
    while (this.is('op', '+') || this.is('op', '-')) {
      if (this.paraEmDx && this.ehDx()) break;
      if (this.alvoLimite) { const nx = this.peek(1); if (!nx || nx.k === ')') break; }
      const op = this.next().v;
      const r = this.termo();
      l = A.bin(op, l, r);
    }
    return l;
  }

  // começa um fator? (para multiplicação implícita: 2x, 3(x+1))
  comecaFator() {
    const x = this.peek();
    if (!x) return false;
    if (x.k === '|') return this.absDepth === 0;
    return ['num', 'id', 'const', '(', 'frac', 'sqrt', 'func', 'word', 'int', 'lim'].includes(x.k);
  }

  ehDx() {
    const a = this.peek(), b = this.peek(1);
    if (!a || a.k !== 'id' || a.v !== 'd' || !b || b.k !== 'id') return false;
    const c = this.peek(2);
    return !c || c.k === ')' || c.k === 'op' || c.k === 'rel' || c.k === ';' || c.k === 'nl' || c.k === 'endsys';
  }

  termo() {
    let l = this.unario();
    for (;;) {
      if (this.paraEmDx && this.ehDx()) break;
      if (this.is('op', '*')) { this.next(); l = A.mul(l, this.unario()); continue; }
      if (this.is('op', '/')) {
        const tk = this.next();
        l = A.dvd(l, this.unario(), !tk.divisao);
        continue;
      }
      if (this.comecaFator()) { l = A.mul(l, this.potencia(), true); continue; }
      break;
    }
    return l;
  }

  unario() {
    if (this.is('op', '-')) { this.next(); return A.neg(this.unario()); }
    if (this.is('op', '+')) { this.next(); return this.unario(); }
    return this.potencia();
  }

  potencia() {
    let b = this.posfixo(this.primario());
    if (this.alvoLimite && this.is('^')) {
      const a1 = this.peek(1), a2 = this.peek(2);
      if ((a1?.k === 'op' && '+-'.includes(a1.v)) || (a1?.k === '(' && a2?.k === 'op' && '+-'.includes(a2.v) && this.peek(3)?.k === ')')) return b;
    }
    if (this.is('^')) {
      this.next();
      if (this.is('grau')) { this.next(); return this.posfixo({ t: 'grau', a: b }); }
      if (this.is('(') && this.peek().chave) {
        this.next();
        if (this.is('grau')) { this.next(); this.expect(')'); return this.posfixo({ t: 'grau', a: b }); }
        const e = this.expr();
        this.expect(')', 'Expoente incompleto.');
        b = A.pow(b, e);
      } else {
        b = A.pow(b, this.unarioExpoente());
      }
      b = this.posfixo(b);
    }
    return b;
  }

  unarioExpoente() {
    if (this.is('op', '-')) { this.next(); return A.neg(this.unarioExpoente()); }
    return this.potencia();
  }

  posfixo(b) {
    for (;;) {
      if (this.is('op', '!')) { this.next(); b = { t: 'fact', a: b }; continue; }
      if (this.is('op', '%')) { this.next(); b = { t: 'pct', a: b }; continue; }
      if (this.is('prime')) { this.next(); continue; }
      return b;
    }
  }

  grupo() {
    // {…} ou (…) ou um único token
    if (this.is('(')) {
      this.next();
      const e = this.expr();
      this.expect(')', 'Faltou fechar um parêntese ou chave.');
      return e;
    }
    return this.potencia();
  }

  primario() {
    const x = this.next();
    if (!x) throw new ErroMat('A expressão terminou antes do esperado.');
    switch (x.k) {
      case 'num': return A.num(Q.fromDecimal(x.v), x.dec);
      case 'const': return A.cst(x.v);
      case 'id': {
        if (x.v === 'e' && !this.opts.eVariavel) return A.cst('e');
        return A.vr(x.v);
      }
      case '(': {
        const e = this.expr();
        if (this.is(',') && !x.chave) {
          // ponto (a, b) não suportado
          throw new ErroMat('Use ponto e vírgula (;) para separar valores.');
        }
        this.expect(')', 'Faltou fechar um parêntese.');
        return e;
      }
      case '|': {
        this.absDepth++;
        const e = this.expr();
        this.absDepth--;
        this.expect('|', 'Faltou fechar o módulo |…|.');
        return { t: 'abs', a: e };
      }
      case 'frac': return this.fracao();
      case 'sqrt': {
        let idx;
        if (this.is('(') && this.peek().v === '[') { this.next(); idx = this.expr(); this.expect(')'); }
        const a = this.is('(') ? this.grupo() : this.potencia();
        return A.sqrt(a, idx);
      }
      case 'func': return this.funcao(x.v);
      case 'word': return this.palavra(x.v);
      case 'int': return this.integral();
      case 'lim': return this.limite();
      case 'grau': throw new ErroMat('Símbolo de grau fora do lugar.');
      case 'op':
        if (x.v === '*' || x.v === '/') throw new ErroMat('Falta um número antes do sinal de ' + (x.v === '*' ? 'vezes' : 'dividir') + '.');
        break;
      case ')': throw new ErroMat('Tem parêntese vazio ou fechando no lugar errado.');
      case 'rel': throw new ErroMat('Falta um lado da igualdade.');
      case '^': throw new ErroMat('Falta a base da potência.');
    }
    throw new ErroMat('Não entendi a expressão perto de “' + (x.v || x.k) + '”.');
  }

  fracao() {
    // \frac{d}{dx} → derivada
    const ini = this.i;
    if (this.is('(') && this.peek(1)?.k === 'id' && this.peek(1).v === 'd') {
      let j = this.i + 2, ordem = 1;
      if (this.t[j]?.k === '^') { ordem = parseInt(this.t[j + 1]?.v ?? this.t[j + 2]?.v, 10) || 1; j += this.t[j + 1]?.k === '(' ? 4 : 2; }
      if (this.t[j]?.k === ')' && this.t[j + 1]?.k === '(' && this.t[j + 2]?.k === 'id' && this.t[j + 2].v === 'd' && this.t[j + 3]?.k === 'id') {
        const v = this.t[j + 3].v;
        let k = j + 4;
        if (this.t[k]?.k === '^') k += this.t[k + 1]?.k === '(' ? 4 : 2;
        if (this.t[k]?.k === ')') {
          this.i = k + 1;
          const f = this.expr();
          return { t: 'deriv', f, v, ordem };
        }
      }
    }
    this.i = ini;
    const n = this.grupo();
    const d = this.grupo();
    return A.dvd(n, d, true);
  }

  funcao(nome) {
    let expo = null, base = null;
    // \sin^2 x, \log_2 x
    for (let k = 0; k < 2; k++) {
      if (this.is('^')) { this.next(); expo = this.grupo(); }
      else if (this.is('_')) { this.next(); base = this.grupo(); }
    }
    let arg;
    if (this.is('(')) arg = this.grupo();
    else {
      if (this.fim()) throw new ErroMat(`Falta o valor dentro de ${nome}.`);
      // sen 2x → sen(2x)
      arg = this.potencia();
      while (this.is('num') || this.is('id') || this.is('const')) {
        if (this.paraEmDx && this.ehDx()) break;
        arg = A.mul(arg, this.potencia(), true);
      }
    }
    let f = nome === 'log' && base ? A.fn('log', arg, base) : A.fn(nome, arg);
    if (expo) f = A.pow(f, expo);
    return f;
  }

  palavra(w) {
    if (CHAMADAS.includes(w)) {
      this.expect('(', `Use ${w}(…) com parênteses.`);
      const args = [this.expr()];
      while (this.is(',') || this.is(';')) { this.next(); args.push(this.expr()); }
      this.expect(')', `Faltou fechar o parêntese de ${w}.`);
      return { t: 'call', n: w, args };
    }
    if (w === 'abs') { const a = this.grupo(); return { t: 'abs', a }; }
    throw new ErroMat(`Não conheço “${w}”.`);
  }

  integral() {
    let a = null, b = null;
    for (let k = 0; k < 2; k++) {
      if (this.is('_')) { this.next(); a = this.grupo(); }
      else if (this.is('^')) { this.next(); b = this.grupo(); }
    }
    if ((a && !b) || (b && !a)) throw new ErroMat('Integral definida precisa dos dois limites.');
    this.paraEmDx++;
    let f;
    if (this.ehDx()) f = A.num(1);
    else f = this.expr();
    this.paraEmDx--;
    let v = null;
    if (this.ehDx()) { this.next(); v = this.next().v; }
    else {
      const vs = [...A.variaveis(f)];
      v = vs.length === 1 ? vs[0] : vs.includes('x') ? 'x' : vs[0] || 'x';
    }
    return { t: 'int', f, v, a, b };
  }

  limite() {
    // \lim_{x\to a} f
    this.expect('_', 'Escreva o limite como lim com x → valor embaixo.');
    const abriu = this.is('(');
    if (abriu) this.next();
    const v = this.expect('id', 'Falta a variável do limite.').v;
    this.expect('to', 'Falta a seta (→) no limite.');
    let lado = null;
    this.alvoLimite = true;
    let to = this.expr();
    this.alvoLimite = false;
    if (this.is('^')) { this.next(); const g = this.next(); if (g.k === '(') { lado = this.next().v; this.expect(')'); } else lado = g.v; }
    // x→0+ escrito como "0+" vira soma incompleta: tratamos "+" solto
    if (this.is('op', '+') || this.is('op', '-')) { lado = this.next().v; }
    if (abriu) this.expect(')', 'Faltou fechar o subscrito do limite.');
    const f = this.expr();
    return { t: 'lim', f, v, to, lado };
  }
}
