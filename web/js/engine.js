/* Chain of Command — simulation engine.
 * Pure logic, no DOM. Loaded in the browser as a plain script and in Node by tests/verify.js.
 *
 * A trial:  order (sampled from the level format)
 *           -> HQ protocol (encoder program)      -> transmission
 *           -> the line (chain of middlemen)       -> received
 *           -> field protocol (decoder program)    -> delivered order (or SAY AGAIN -> resend)
 */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});

  const MAX_LEN = 256;
  const MAX_ATTEMPTS = 10;
  const CODEBOOK_CAP = 20000;
  const ANALYZE_EXACT_CAP = 1500;

  class EngineError extends Error {}

  // ---------------------------------------------------------------- RNG
  function makeRng(seed) {
    let a = seed >>> 0 || 0x9e3779b9;
    const next = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      int: (n) => Math.floor(next() * n),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
    };
  }

  // ---------------------------------------------------------------- helpers
  const symVal = (c) => (c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : c === 'X' ? 10 : 0);
  const valSym = (v) => (v === 10 ? 'X' : String(v));
  const mod11 = (a) => ((a % 11) + 11) % 11;
  const inv11 = (a) => {
    a = mod11(a);
    for (let x = 1; x < 11; x++) if ((a * x) % 11 === 1) return x;
    return 0;
  };
  const pow11 = (b, e) => {
    let r = 1;
    for (let i = 0; i < e; i++) r = mod11(r * b);
    return r;
  };
  // ---- modular arithmetic for weighted checks (any modulus 2..11; inverses exist only for units)
  const modm = (a, m) => ((a % m) + m) % m;
  function invm(a, m) {
    a = modm(a, m);
    for (let x = 1; x < m; x++) if ((a * x) % m === 1) return x;
    return 0; // not a unit: no inverse (happens when m is not prime)
  }

  // Weighted check: (Σ w[v] · value(v)) mod m over the order's variables (w[v] = 0: not covered).
  function checkValue(weights, mod, vals) {
    let t = 0;
    for (let v = 0; v < vals.length; v++) t += (weights[v] || 0) * symVal(vals[v]);
    return modm(t, mod);
  }

  // Check-row seal: rows[k] = weights over [order variables …, seal digits …]. Find the seal digits c so
  // every row sums to 0 (mod m). Throws (the seal "jams") when the rows cannot pin the digits down.
  function solveSeal(rows, mod, vals) {
    const k = vals.length;
    const r = rows.length;
    const A = rows.map((row) => Array.from({ length: r }, (_, c) => modm(row[k + c] || 0, mod)));
    const B = rows.map((row) => {
      let t = 0;
      for (let v = 0; v < k; v++) t += (row[v] || 0) * symVal(vals[v]);
      return modm(-t, mod);
    });
    for (let c = 0; c < r; c++) {
      let p = c;
      while (p < r && !invm(A[p][c], mod)) p++;
      if (p === r) throw new EngineError('The seal jams: these check rows cannot pin down every seal digit. Make the rows independent on the seal columns.');
      [A[c], A[p]] = [A[p], A[c]];
      [B[c], B[p]] = [B[p], B[c]];
      const iv = invm(A[c][c], mod);
      for (let x = 0; x < r; x++) A[c][x] = modm(A[c][x] * iv, mod);
      B[c] = modm(B[c] * iv, mod);
      for (let rr = 0; rr < r; rr++) {
        if (rr === c || !A[rr][c]) continue;
        const f = A[rr][c];
        for (let x = 0; x < r; x++) A[rr][x] = modm(A[rr][x] - f * A[c][x], mod);
        B[rr] = modm(B[rr] - f * B[c], mod);
      }
    }
    return B.map(valSym).join('');
  }

  function chunks(s, size) {
    const out = [];
    for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
    return out;
  }

  function majority(chars) {
    const counts = new Map();
    let best = null;
    let bestN = 0;
    for (const c of chars) {
      const n = (counts.get(c) || 0) + 1;
      counts.set(c, n);
      if (n > bestN) {
        best = c;
        bestN = n;
      }
    }
    return best ?? '';
  }

  // ---------------------------------------------------------------- order templates
  // An order template is a row of cells. Each cell is a variable (one symbol from that
  // variable's set; every cell of the same variable holds the same symbol) or a literal.
  // A plain level.format ['ABC','123'] is the special case "every slot is its own variable".
  const SHAPES = [
    { sym: '■', color: 'blue' },
    { sym: '▲', color: 'orange' },
    { sym: '●', color: 'green' },
    { sym: '◆', color: 'purple' },
    { sym: '★', color: 'red' },
    { sym: '⬟', color: 'teal' },
    { sym: '✚', color: 'pink' },
    { sym: '⬢', color: 'sand' },
  ];

  function expandSet(spec) {
    let out = '';
    for (const part of spec.split(',')) {
      const p = part.trim();
      const m = p.match(/^(.)-(.)$/);
      if (m) {
        for (let c = m[1].charCodeAt(0); c <= m[2].charCodeAt(0); c++) out += String.fromCharCode(c);
      } else out += p.replace(/\s+/g, '');
    }
    return [...new Set(out)].join('');
  }

  // Parse the two-line scenario text:   ■=XYZ ▲=123 ●=A-Z
  //                                      ■ ■ ▲ ■ ■ ●
  // Anything in the pattern that is not a defined variable symbol is a literal.
  function parseTemplate(text) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) throw new EngineError('Template needs two lines: variables, then the pattern.');
    const defs = lines[0].match(/(\S)\s*=\s*(\S+)/g);
    if (!defs) throw new EngineError('First line should define variables, like  ■=XYZ ▲=123');
    const vars = [];
    for (const d of defs) {
      const [, sym, set] = d.match(/(\S)\s*=\s*(\S+)/);
      const known = SHAPES.find((s) => s.sym === sym);
      const chars = expandSet(set);
      if (!chars) throw new EngineError(`Variable ${sym} has an empty set.`);
      vars.push({ sym, color: known ? known.color : SHAPES[vars.length % SHAPES.length].color, set: chars });
    }
    const cells = [];
    for (const ch of [...lines[1].replace(/\s+/g, '')]) {
      const v = vars.findIndex((x) => x.sym === ch);
      cells.push(v >= 0 ? { v } : { lit: ch });
    }
    if (!cells.length) throw new EngineError('The pattern is empty.');
    return { vars, cells };
  }

  function templateOf(level) {
    if (level._tpl) return level._tpl;
    let tpl;
    if (level.template) tpl = parseTemplate(level.template);
    else
      tpl = {
        vars: level.format.map((set, i) => ({ ...SHAPES[i % SHAPES.length], set })),
        cells: level.format.map((_, i) => ({ v: i })),
      };
    tpl.length = tpl.cells.length;
    Object.defineProperty(level, '_tpl', { value: tpl, enumerable: false, configurable: true });
    return tpl;
  }

  function fillTemplate(tpl, values) {
    return tpl.cells.map((c) => (c.lit !== undefined ? c.lit : values[c.v])).join('');
  }

  function alphabetOf(level) {
    if (level.alphabet) return level.alphabet;
    const tpl = templateOf(level);
    const set = new Set();
    for (const v of tpl.vars) for (const c of v.set) set.add(c);
    for (const c of tpl.cells) if (c.lit !== undefined) set.add(c.lit);
    return [...set].join('');
  }

  function isValidOrder(level, s) {
    const tpl = templateOf(level);
    if (s.length !== tpl.length) return false;
    const seen = {};
    return tpl.cells.every((c, i) => {
      if (c.lit !== undefined) return s[i] === c.lit;
      if (!tpl.vars[c.v].set.includes(s[i])) return false;
      if (seen[c.v] !== undefined && seen[c.v] !== s[i]) return false;
      seen[c.v] = s[i];
      return true;
    });
  }

  // Weighted check digit: (sum of w(i) * digit_i) mod 11, written 0-9 or X.
  const WEIGHTS = {
    SUM: () => 1,
    WEIGHTED: (i) => i,
    SQUARES: (i) => i * i,
    CUBES: (i) => i * i * i,
  };

  // Reed-Solomon seal: append r digits so that for k = 0..r-1, sum_j j^k * x_j == 0 (mod 11)
  // over every position j of the sealed word. Needs total length <= 10.
  function rsSeal(s, r) {
    const n = s.length;
    if (n + r > 10) throw new EngineError('Reed–Solomon seal works on at most 10 digits in total.');
    const A = [];
    const B = [];
    for (let k = 0; k < r; k++) {
      let t = 0;
      for (let j = 1; j <= n; j++) t += pow11(j, k) * symVal(s[j - 1]);
      A.push(Array.from({ length: r }, (_, c) => pow11(n + 1 + c, k)));
      B.push(mod11(-t));
    }
    for (let c = 0; c < r; c++) {
      let p = c;
      while (A[p][c] === 0) p++;
      [A[c], A[p]] = [A[p], A[c]];
      [B[c], B[p]] = [B[p], B[c]];
      const iv = inv11(A[c][c]);
      for (let x = 0; x < r; x++) A[c][x] = mod11(A[c][x] * iv);
      B[c] = mod11(B[c] * iv);
      for (let rr = 0; rr < r; rr++) {
        if (rr === c || !A[rr][c]) continue;
        const f = A[rr][c];
        for (let x = 0; x < r; x++) A[rr][x] = mod11(A[rr][x] - f * A[c][x]);
        B[rr] = mod11(B[rr] - f * B[c]);
      }
    }
    return s + B.map(valSym).join('');
  }

  // ---------------------------------------------------------------- HQ strip (encoder)
  // The transmission is a left-to-right strip of items:
  //   {t:'src', v, not}      copy of variable v (¬ swaps it with its partner symbol)
  //   {t:'lit', c}           fixed literal
  //   {t:'rep', n, items}    the items, n times
  //   {t:'if', v, set, then, else}
  //   {t:'par', vars}        parity bit over the chosen variables
  //   {t:'chk', mode, vars}  check digit: Σ w(#v)·digit mod 11, 10 written X
  //   {t:'seal', n}          n Reed–Solomon digits over every variable
  //   {t:'crc', g}           shift register: the lamps sent so far, times x^r, divided by g(x); the r remainder lamps
  let autoId = 0;
  const nextId = (p) => `${p}${++autoId}_${Math.floor(Math.random() * 1e6).toString(36)}`;

  // Partners pair up in set order: 1st<->2nd, 3rd<->4th; an odd one out maps to itself.
  function partner(set, c) {
    const i = set.indexOf(c);
    if (i < 0) return c;
    const j = i ^ 1;
    return j < set.length ? set[j] : c;
  }

  function valuesOf(level, msg) {
    const tpl = templateOf(level);
    const vals = tpl.vars.map(() => '');
    tpl.cells.forEach((c, i) => {
      if (c.v !== undefined && !vals[c.v]) vals[c.v] = msg[i] || '';
    });
    return vals;
  }

  // ---- shift register (CRC): g = generator coefficients, highest power first, g[0] = 1 (degree r = g.length − 1).
  // The register eats lamps (0/1; anything else passes it by) and ends holding (bits · x^r) mod g(x).
  function crcGen(g) {
    if (!Array.isArray(g) || g.length < 2 || g.length > 9 || !g[0]) throw new EngineError('The shift register needs a generator g(x) of degree 1 to 8.');
    return g.map((x) => (x ? 1 : 0));
  }
  function crcRun(g, s) {
    g = crcGen(g);
    const r = g.length - 1;
    let reg = new Array(r).fill(0);
    const bits = [];
    const states = [];
    for (const c of s || '') {
      if (c !== '0' && c !== '1') continue;
      const fb = reg[0] ^ (c === '1' ? 1 : 0);
      bits.push(c);
      reg = reg.slice(1).concat(0);
      if (fb) for (let j = 0; j < r; j++) reg[j] ^= g[j + 1];
      states.push(reg.join(''));
    }
    return { bits: bits.join(''), states, rem: reg.join('') };
  }
  // Field side: does the whole signal divide exactly by g(x)? It clocks lamps only: a smudge (?), a marker or any
  // other symbol jams it (never clears) — open envelopes and strip junk first.
  function crcClear(g, s) {
    g = crcGen(g);
    const r = g.length - 1;
    const G = parseInt(g.join(''), 2);
    let reg = 0;
    for (const c of s) {
      if (c !== '0' && c !== '1') return false;
      reg = (reg << 1) | (c === '1' ? 1 : 0);
      if (reg >> r) reg ^= G;
    }
    return reg === 0;
  }
  // Period of g: the smallest n with g(x) dividing xⁿ + 1 (0: none — g has no + 1 term).
  function crcPeriod(g) {
    g = crcGen(g);
    const r = g.length - 1;
    if (!g[r]) return 0;
    const G = parseInt(g.join(''), 2);
    let x = 1;
    for (let n = 1; n <= 1 << r; n++) {
      x <<= 1;
      if (x >> r) x ^= G;
      if (x === 1) return n;
    }
    return 0;
  }

  // prev: everything already on the tape before this item (a shift register divides it).
  function itemOut(it, vals, tpl, prev = '') {
    switch (it.t) {
      case 'src': {
        const c = vals[it.v] ?? '';
        return it.not && tpl.vars[it.v] ? partner(tpl.vars[it.v].set, c) : c;
      }
      case 'lit':
        return it.c;
      case 'rep': {
        // each pass is stamped afresh: a shift register inside the group sees a longer tape every time
        let out = '';
        for (let k = 0; k < Math.max(1, it.n); k++) out += stripOut(it.items, vals, tpl, prev + out);
        return out;
      }
      case 'if':
        return stripOut(it.set.includes(vals[it.v]) ? it.then : it.else, vals, tpl, prev);
      case 'crc':
        return crcRun(it.g, prev).rem;
      case 'par': {
        let x = 0;
        for (const v of it.vars) if (vals[v] === '1') x ^= 1;
        return String(x);
      }
      case 'chk': {
        // Dial form: {w: [weight per variable], mod}. Legacy preset form: {mode, vars} (mod 11).
        if (Array.isArray(it.w)) return valSym(checkValue(it.w, it.mod || 11, vals));
        const w = WEIGHTS[it.mode] || WEIGHTS.SUM;
        let t = 0;
        for (const v of it.vars) t += w(v + 1) * symVal(vals[v]);
        return valSym(t % 11);
      }
      case 'seal': {
        // Check-matrix form: {rows: [[weights over variables…, seal digits…]], mod}. Legacy: {n} = RS rows j^k mod 11.
        if (Array.isArray(it.rows)) return it.rows.length ? solveSeal(it.rows, it.mod || 11, vals) : '';
        const data = vals.join('');
        return rsSeal(data, it.n).slice(data.length);
      }
    }
    return '';
  }

  function stripOut(items, vals, tpl, prev = '') {
    let s = '';
    for (const it of items) {
      s += itemOut(it, vals, tpl, prev + s);
      if (s.length > MAX_LEN) throw new EngineError('Transmission too long for the wire (over 256 symbols).');
    }
    return s;
  }

  // Default strip: the order exactly as written (variables and literals in template order).
  function defaultStrip(level) {
    return templateOf(level).cells.map((c) =>
      c.lit !== undefined ? { id: nextId('d'), t: 'lit', c: c.lit } : { id: nextId('d'), t: 'src', v: c.v, not: false }
    );
  }

  // Default assembly: every variable read from where it sits in the order as written.
  function defaultAsm(level) {
    const tpl = templateOf(level);
    return tpl.vars.map((_, k) => ({ t: 'pos', i: tpl.cells.findIndex((c) => c.v === k) + 1, not: false }));
  }

  // Compact strip notation used by level solutions, tests and the proving ground:
  //   ■ ▲ ¬●  "["  3x( ■ ▲ )  P(■▲◆)  SUM(■▲)  W(■▲)  SQ(■▲)  CUBE(■▲)  RS4
  //   C5:1,2,3,4      dial check: modulus 5, one weight per order variable (0 = not covered)
  //   H11:1,1,1,1,1,0|1,2,3,4,0,1   check-matrix seal: modulus 11, rows of weights over [variables…, seal digits…]
  //   CRC:10011       shift register dividing the tape so far by g(x) = x⁴ + x + 1 (coefficients, highest power first)
  const CHECK_WORDS = { SUM: 'SUM', W: 'WEIGHTED', SQ: 'SQUARES', CUBE: 'CUBES' };
  function parseStrip(level, text) {
    const tpl = templateOf(level);
    const varIdx = (ch) => {
      const k = tpl.vars.findIndex((v) => v.sym === ch);
      if (k < 0) throw new EngineError(`Unknown variable ${ch}`);
      return k;
    };
    const varsIn = (s) => [...s].filter((c) => c.trim()).map(varIdx);
    const words = text
      .replace(/"[^"]"/g, (m) => ` ${m} `)
      .replace(/(\d+x\()/g, ' $1 ')
      .split(/\s+/)
      .filter(Boolean);
    let pos = 0;
    function list(inGroup) {
      const out = [];
      while (pos < words.length) {
        const w = words[pos++];
        let m;
        if (w === ')') {
          if (!inGroup) throw new EngineError('Unexpected )');
          return out;
        }
        if ((m = w.match(/^"(.)"$/u))) out.push({ id: nextId('p'), t: 'lit', c: m[1] });
        else if ((m = w.match(/^(\d+)x\($/))) out.push({ id: nextId('p'), t: 'rep', n: +m[1], items: list(true) });
        else if ((m = w.match(/^RS(\d)$/))) out.push({ id: nextId('p'), t: 'seal', n: +m[1] });
        else if ((m = w.match(/^C(\d+):([\d,]+)$/))) out.push({ id: nextId('p'), t: 'chk', mod: +m[1], w: m[2].split(',').map(Number) });
        else if ((m = w.match(/^H(\d+):([\d,|]+)$/))) out.push({ id: nextId('p'), t: 'seal', mod: +m[1], rows: m[2].split('|').map((r) => r.split(',').map(Number)) });
        else if ((m = w.match(/^CRC:([01]{2,9})$/))) out.push({ id: nextId('p'), t: 'crc', g: [...m[1]].map(Number) });
        else if ((m = w.match(/^P\((.+)\)$/u))) out.push({ id: nextId('p'), t: 'par', vars: varsIn(m[1]) });
        else if ((m = w.match(/^(SUM|W|SQ|CUBE)\((.+)\)$/u)))
          out.push({ id: nextId('p'), t: 'chk', mode: CHECK_WORDS[m[1]], vars: varsIn(m[2]) });
        else {
          const chars = [...w];
          for (let i = 0; i < chars.length; i++) {
            if (chars[i] === '¬') out.push({ id: nextId('p'), t: 'src', v: varIdx(chars[++i]), not: true });
            else out.push({ id: nextId('p'), t: 'src', v: varIdx(chars[i]), not: false });
          }
        }
      }
      if (inGroup) throw new EngineError('Missing )');
      return out;
    }
    return list(false);
  }

  // Assembly notation: "■=#1 ▲=#3 ●=V1,4,7 ◆=¬#2". Unlisted variables keep their default reader.
  function parseAsm(level, text) {
    const tpl = templateOf(level);
    const asm = defaultAsm(level);
    for (const w of (text || '').split(/\s+/).filter(Boolean)) {
      const m = w.match(/^(.)=(¬?)(?:#(\d+)|V([\d,]+))$/u);
      if (!m) throw new EngineError(`Bad reader ${w}`);
      const k = tpl.vars.findIndex((v) => v.sym === m[1]);
      if (k < 0) throw new EngineError(`Unknown variable ${m[1]}`);
      asm[k] = m[3] ? { t: 'pos', i: +m[3], not: !!m[2] } : { t: 'vote', pos: m[4].split(',').map(Number), not: !!m[2] };
    }
    return asm;
  }

  // ---------------------------------------------------------------- syndrome decoding (the Cipher School)
  // A check row is the list of lamp positions it watches (a row of H over GF(2)). The syndrome is one bit per row:
  // the parity of the lit lamps it watches. The table maps a syndrome, written s1 s2 … as a string, to the lamps
  // to flip. The all-zero syndrome always means "every check holds: pass it on".
  // The CAPTURED plate is the enemy's machine: Hamming's own 1950 layout, column #j of H = j written in binary,
  // and a table wired to flip the lamp whose number the syndrome spells.
  const CAPTURED_ROWS = [[4, 5, 6, 7], [2, 3, 6, 7], [1, 3, 5, 7]];
  const CAPTURED_TABLE = {};
  for (let j = 1; j <= 7; j++) CAPTURED_TABLE[j.toString(2).padStart(3, '0')] = [j];
  function syndromeBits(s, rows) {
    return (rows || []).map((row) => {
      let x = 0;
      for (const q of row || []) if (s[q - 1] === '1') x ^= 1;
      return x;
    });
  }
  function syndromeFix(s, rows, table) {
    const key = syndromeBits(s, rows).join('');
    if (!key.includes('1')) return s;
    const arr = [...s];
    for (const q of (table && table[key]) || []) {
      const i = q - 1;
      if (arr[i] === '0' || arr[i] === '1') arr[i] = arr[i] === '0' ? '1' : '0';
    }
    return arr.join('');
  }

  // ---------------------------------------------------------------- field plates (decoder)
  const DEC = {
    SYNDROME: (s, p) => syndromeFix(s, p.rows, p.table),
    CAPTURED: (s) => syndromeFix(s, CAPTURED_ROWS, CAPTURED_TABLE),
    STRIP: (s, p) => [...s].filter((c) => !p.set.includes(c)).join(''),
    SWAP: (s, p) => {
      const a = p.a - 1;
      const b = p.b - 1;
      if (a === b || a < 0 || b < 0 || a >= s.length || b >= s.length) return s;
      const arr = [...s];
      [arr[a], arr[b]] = [arr[b], arr[a]];
      return arr.join('');
    },
    FLIP: (s, p) => {
      const i = p.pos - 1;
      if (i < 0 || i >= s.length || (s[i] !== '0' && s[i] !== '1')) return s;
      return s.slice(0, i) + (s[i] === '0' ? '1' : '0') + s.slice(i + 1);
    },
    BETWEEN: (s, p) => {
      const a = s.indexOf(p.open);
      if (a < 0) return s;
      const b = s.indexOf(p.close, a + 1);
      if (b < 0) return s;
      return s.slice(a + 1, b);
    },
    REASSEMBLE: (s, p) =>
      chunks(s, p.size)
        .map((c, i) => ({ c, i }))
        .sort((x, y) => (x.c[0] < y.c[0] ? -1 : x.c[0] > y.c[0] ? 1 : x.i - y.i))
        .map((x) => x.c.slice(1))
        .join(''),
    REPAIR: (s, p, ctx) => repair(s, p.mode, p.radius, ctx.codebook),
  };

  // Assembly: fill every variable of the order from the cleaned signal.
  function readVar(r, s, set) {
    if (!r) return '';
    let c;
    if (r.t === 'vote') c = majority(r.pos.map((p) => s[p - 1]).filter((x) => x !== undefined));
    else c = s[r.i - 1] ?? '';
    return r.not ? partner(set, c) : c;
  }

  function assemble(level, asm, s) {
    const tpl = templateOf(level);
    const vals = tpl.vars.map((v, k) => readVar(asm[k], s, v.set));
    return tpl.cells.map((c) => (c.lit !== undefined ? c.lit : vals[c.v])).join('');
  }

  const COND = {
    IF_IN: (s, p) => s[p.pos - 1] !== undefined && p.set.includes(s[p.pos - 1]),
    IF_SAME: (s, p) => s[p.a - 1] !== undefined && s[p.a - 1] === s[p.b - 1],
    IF_AGREE: (s, p) => {
      if (s.length === 0 || s.length % p.copies) return false;
      const parts = chunks(s, s.length / p.copies);
      return parts.every((x) => x === parts[0]);
    },
    IF_PARITY: (s, p) => {
      let x = 0;
      for (const q of p.pos) if (s[q - 1] === '1') x ^= 1;
      return x === 0;
    },
    IF_VALID: (s, p, ctx) => !!(ctx.codebook && !ctx.codebook.tooBig && ctx.codebook.map.has(s)),
    IF_LENGTH: (s, p) => s.length === p.n,
    // the field's register is wired like HQ's shift register tile (ctx.crc = its g); no tile: it never clears
    IF_CRC_OK: (s, p, ctx) => !!(ctx && ctx.crc) && crcClear(ctx.crc, s),
  };

  // ---------------------------------------------------------------- codebook
  function distance(mode, r, c, limit) {
    if (mode === 'EDIT') return editDistance(r, c);
    if (r.length !== c.length) return Infinity;
    if (mode === 'BURST') {
      let first = -1;
      let last = -1;
      for (let i = 0; i < r.length; i++) {
        if (r[i] !== '?' && r[i] !== c[i]) {
          if (first < 0) first = i;
          last = i;
        }
      }
      return first < 0 ? 0 : last - first + 1;
    }
    let d = 0;
    for (let i = 0; i < r.length; i++) {
      if (r[i] !== '?' && r[i] !== c[i] && ++d > limit) return d;
    }
    return d;
  }

  function editDistance(a, b) {
    const m = a.length;
    const n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        const sub = a[i - 1] === b[j - 1] || a[i - 1] === '?' ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub);
      }
      prev = cur;
    }
    return prev[n];
  }

  // Bounded-distance decoding: the unique nearest valid transmission within `radius`.
  function repair(s, mode, radius, cb) {
    if (!cb || cb.tooBig) return s;
    if (cb.map.has(s)) return s;
    let best = Infinity;
    let hits = 0;
    let hit = null;
    for (const w of cb.words) {
      const d = distance(mode, s, w, best);
      if (d < best) {
        best = d;
        hits = 1;
        hit = w;
      } else if (d === best) hits++;
    }
    return best <= radius && hits === 1 ? hit : s;
  }

  function messageCount(level) {
    return templateOf(level).vars.reduce((a, v) => a * v.set.length, 1);
  }

  function allMessages(level) {
    const tpl = templateOf(level);
    const out = [];
    const sets = tpl.vars.map((v) => v.set);
    if (!sets.length) return [fillTemplate(tpl, [])];
    const idx = sets.map(() => 0);
    for (;;) {
      out.push(fillTemplate(tpl, idx.map((k, i) => sets[i][k])));
      let i = sets.length - 1;
      while (i >= 0 && ++idx[i] === sets[i].length) idx[i--] = 0;
      if (i < 0) return out;
    }
  }

  // Envelopes (literal markers at either end of the strip) are not part of the code:
  // the codebook stores what is inside them.
  function codebookStrip(enc) {
    let a = 0;
    let b = enc.length;
    while (a < b && enc[a].t === 'lit') a++;
    while (b > a && enc[b - 1].t === 'lit') b--;
    return enc.slice(a, b);
  }

  function buildCodebook(level, enc) {
    const count = messageCount(level);
    if (count > CODEBOOK_CAP) return { tooBig: true, count };
    const strip = codebookStrip(enc);
    const tpl = templateOf(level);
    const map = new Map();
    const words = [];
    let collisions = 0;
    for (const m of allMessages(level)) {
      const w = stripOut(strip, valuesOf(level, m), tpl);
      if (map.has(w)) collisions++;
      else {
        map.set(w, m);
        words.push(w);
      }
    }
    return { tooBig: false, count, map, words, collisions };
  }

  // ---------------------------------------------------------------- analyzer
  function burstCoverable(diffs, b) {
    // Can the differing positions be covered by two windows of length b?
    let windows = 0;
    let i = 0;
    while (i < diffs.length) {
      if (++windows > 2) return false;
      const end = diffs[i] + b - 1;
      while (i < diffs.length && diffs[i] <= end) i++;
    }
    return true;
  }

  function analyze(level, enc) {
    let cb;
    try {
      cb = buildCodebook(level, enc);
    } catch (e) {
      return { error: e.message };
    }
    if (cb.tooBig) return { tooBig: true, count: cb.count };
    const W = cb.words;
    const res = { count: cb.count, words: W.length, length: W[0].length, collisions: cb.collisions };
    if (cb.collisions) {
      res.d = 0;
      return res;
    }
    if (W.length < 2) {
      res.d = Infinity;
      return res;
    }
    const sampled = W.length > ANALYZE_EXACT_CAP;
    const step = sampled ? Math.ceil(W.length / 250) : 1;
    const sameLen = W.every((w) => w.length === W[0].length);
    let d = Infinity;
    let pair = null;
    let burstSafe = 4;
    let minSpan = Infinity;
    for (let a = 0; a < W.length; a += step) {
      for (let b = sampled ? 0 : a + 1; b < W.length; b++) {
        if (a === b) continue;
        const x = W[a];
        const y = W[b];
        if (!sameLen) continue;
        let dist = 0;
        const diffs = [];
        for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) (dist++, diffs.push(i));
        if (dist < d) {
          d = dist;
          pair = [x, y];
        }
        if (level.metric === 'burst') while (burstSafe > 0 && burstCoverable(diffs, burstSafe)) burstSafe--;
        // the shortest single stretch that turns one valid transmission into another
        if (level.metric === 'burst' && diffs.length && diffs[diffs.length - 1] - diffs[0] + 1 < minSpan) minSpan = diffs[diffs.length - 1] - diffs[0] + 1;
      }
    }
    res.d = sameLen ? d : null;
    res.pair = pair;
    res.sampled = sampled;
    if (level.metric === 'burst') res.burstSafe = burstSafe;
    // bursts always noticed: every tear up to this long leaves an invalid transmission (detection, not repair)
    if (level.metric === 'burst' && sameLen) res.burstCatch = Math.min(minSpan, W[0].length + 1) - 1;
    if (level.metric === 'edit') {
      // Single-deletion safety: no two codewords share a one-deletion descendant.
      const seen = new Map();
      let clash = null;
      for (const w of W) {
        for (let i = 0; i < w.length && !clash; i++) {
          const v = w.slice(0, i) + w.slice(i + 1);
          const owner = seen.get(v);
          if (owner !== undefined && owner !== w) clash = [owner, w];
          else seen.set(v, w);
        }
        if (clash) break;
      }
      res.deletionSafe = !clash;
      if (clash) res.pair = clash;
    }
    return res;
  }

  // ---------------------------------------------------------------- channel
  function pickTarget(s, set, rng) {
    const idx = [];
    for (let i = 0; i < s.length; i++) if (set ? set.includes(s[i]) : s[i] !== '?') idx.push(i);
    return idx.length ? rng.pick(idx) : -1;
  }

  const MIDDLEMEN = {
    pass: (s) => ({ out: s, note: null }),
    drop: (s, m, rng) => {
      const i = pickTarget(s, m.set, rng);
      if (i < 0) return { out: s, note: null };
      return { out: s.slice(0, i) + s.slice(i + 1), note: `dropped ‘${s[i]}’ (#${i + 1})`, fx: { type: 'del', i, c: s[i] } };
    },
    add: (s, m, rng) => {
      const i = rng.int(s.length + 1);
      const c = rng.pick(m.set);
      return { out: s.slice(0, i) + c + s.slice(i), note: `slipped in ‘${c}’ at #${i + 1}`, fx: { type: 'ins', i, c } };
    },
    swap: (s, m, rng) => {
      if (s.length < 2) return { out: s, note: null };
      const i = rng.int(s.length - 1);
      return {
        out: s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2),
        note: `swapped #${i + 1} and #${i + 2}`,
        fx: { type: 'swap', i, j: i + 1 },
      };
    },
    garble: (s, m, rng, alpha) => {
      const i = pickTarget(s, m.set, rng);
      if (i < 0) return { out: s, note: null };
      const choices = [...(m.to || alpha)].filter((c) => c !== s[i]);
      if (!choices.length) return { out: s, note: null };
      const c = rng.pick(choices);
      return { out: s.slice(0, i) + c + s.slice(i + 1), note: `garbled #${i + 1}: ‘${s[i]}’ → ‘${c}’`, fx: { type: 'sub', i, from: s[i], to: c } };
    },
    flip: (s, m, rng) => {
      const i = pickTarget(s, '01', rng);
      if (i < 0) return { out: s, note: null };
      const c = s[i] === '0' ? '1' : '0';
      return { out: s.slice(0, i) + c + s.slice(i + 1), note: `flipped lamp #${i + 1}`, fx: { type: 'flip', i, from: s[i], to: c } };
    },
    smudge: (s, m, rng) => {
      const i = pickTarget(s, m.set, rng);
      if (i < 0) return { out: s, note: null };
      return { out: s.slice(0, i) + '?' + s.slice(i + 1), note: `smudged #${i + 1}`, fx: { type: 'smudge', i, from: s[i] } };
    },
    burst: (s, m, rng, alpha) => {
      const L = Math.min(m.len, s.length);
      const start = rng.int(s.length - L + 1);
      const to = m.to || alpha;
      let mid = '';
      for (let i = 0; i < L; i++) mid += rng.pick(to);
      return {
        out: s.slice(0, start) + mid + s.slice(start + L),
        note: `shelled #${start + 1}–#${start + L}`,
        fx: { type: 'burst', start, len: L, from: s.slice(start, start + L), to: mid },
      };
    },
    pad: (s, m, rng) => {
      let front = '';
      let back = '';
      const nf = 1 + rng.int(m.max);
      const nb = 1 + rng.int(m.max);
      for (let i = 0; i < nf; i++) front += rng.pick(m.set);
      for (let i = 0; i < nb; i++) back += rng.pick(m.set);
      return { out: front + s + back, note: `wrapped in traffic: ${front}…${back}`, fx: { type: 'pad', front, back } };
    },
    clerk: (s, m, rng, alpha) =>
      rng.next() < 0.5 ? MIDDLEMEN.swap(s, m, rng, alpha) : MIDDLEMEN.garble(s, m, rng, alpha),
    shuffle: (s, m, rng) => {
      const parts = chunks(s, m.size);
      const order = parts.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [order[i], order[j]] = [order[j], order[i]];
      }
      return { out: order.map((i) => parts[i]).join(''), note: `couriers arrived in order ${order.map((i) => i + 1).join('-')}`, fx: { type: 'shuffle', size: m.size, order: [...order] } };
    },
    reverse: (s) => ({ out: [...s].reverse().join(''), note: 'wrote it out back to front', fx: { type: 'reverse', n: s.length } }),
    // a tape loop read from the wrong hole: the first `by` symbols (proving ground: len=…) come out last
    rotate: (s, m) => {
      const k = (((m.by ?? m.len ?? 1) % s.length) + s.length) % s.length;
      if (!k) return { out: s, note: null };
      return { out: s.slice(k) + s.slice(0, k), note: `started the loop ${k} late: #1–#${k} came out last`, fx: { type: 'rotate', k } };
    },
  };

  // ---------------------------------------------------------------- routing networks
  // level.network = { nodes: [{id, label, x, y}], links: [{a, b, chain, delay, name?}] } with nodes HQ and FIELD.
  // A route is a list of node ids from HQ to FIELD along links, never visiting a node twice. Its line is the
  // concatenation of the links' chains (a link walked b→a meets its relays in reverse order); its delay is the
  // sum of the link delays, paid once per transmission attempt.
  function findLink(net, u, v) {
    const i = net.links.findIndex((l) => (l.a === u && l.b === v) || (l.a === v && l.b === u));
    return i < 0 ? null : { index: i, link: net.links[i], reversed: net.links[i].a !== u };
  }

  // -> { ok, error?, nodes, chain, delay, hops: [{index, link, from, to, reversed, start, count}] }
  function routeInfo(level, route) {
    const net = level.network;
    if (!net) return null;
    const bad = (error) => ({ ok: false, error, nodes: route || [], chain: [], delay: 0, hops: [] });
    if (!Array.isArray(route) || route.length < 2) return bad('Plot a route on the map first: click roads from HQ to the front.');
    if (route[0] !== 'HQ') return bad('A route must start at HQ.');
    if (route[route.length - 1] !== 'FIELD') return bad('Finish the route on the map: it must reach the front.');
    if (new Set(route).size !== route.length) return bad('A route may not visit the same place twice.');
    const chain = [];
    const hops = [];
    let delay = 0;
    for (let i = 0; i + 1 < route.length; i++) {
      const f = findLink(net, route[i], route[i + 1]);
      if (!f) return bad(`There is no road from ${route[i]} to ${route[i + 1]}.`);
      const relays = f.reversed ? [...(f.link.chain || [])].reverse() : f.link.chain || [];
      hops.push({ index: f.index, link: f.link, from: route[i], to: route[i + 1], reversed: f.reversed, start: chain.length, count: relays.length });
      chain.push(...relays);
      delay += f.link.delay || 0;
    }
    return { ok: true, nodes: route.slice(), chain, delay, hops };
  }

  // Every route from HQ to FIELD (small maps only), shortest delay first.
  function allRoutes(level) {
    const net = level.network;
    if (!net) return [];
    const out = [];
    const walk = (path) => {
      const at = path[path.length - 1];
      if (at === 'FIELD') return out.push(path.slice());
      for (const l of net.links) {
        const nx = l.a === at ? l.b : l.b === at ? l.a : null;
        if (nx && !path.includes(nx)) walk([...path, nx]);
      }
    };
    walk(['HQ']);
    return out.map((r) => routeInfo(level, r)).sort((x, y) => x.delay - y.delay || x.nodes.length - y.nodes.length);
  }

  // The line a program's transmissions take: the level's chain, or the chosen route through its network.
  function lineOf(level, prog) {
    if (!level.network) return { chain: level.chain, delay: 0, route: null };
    const r = routeInfo(level, prog && prog.route);
    if (!r.ok) throw new EngineError(r.error);
    return { chain: r.chain, delay: r.delay, route: r };
  }

  // Intercepted traffic for a hidden (black-box) line: probe transmissions run through the real chain with a
  // fixed seed, so every player sees the same five samples.
  function interceptSamples(level) {
    // A level may give an authored log (`intercepts: [{sent, recv}]`) when random samples would be unclear;
    // every entry must be something its hidden line can genuinely produce.
    if (level.intercepts) return level.intercepts;
    if (level._samples) return level._samples;
    const n = level.samples || 5;
    const rng = makeRng(level.sampleSeed || 1917);
    const probes = (level.probe || []).slice(0, n);
    while (probes.length < n) probes.push(sampleMessage(level, rng));
    const out = probes.map((sent) => ({ sent, recv: runChannel(level, sent, rng).out }));
    Object.defineProperty(level, '_samples', { value: out, enumerable: false, configurable: true });
    return out;
  }

  function runChannel(level, s, rng, chain = level.chain) {
    const alpha = alphabetOf(level);
    const steps = [];
    chain.forEach((m, idx) => {
      const before = s;
      let note = null;
      let fx = null; // structured record of exactly what the relay did (drives the tape animation)
      if (s.length && m.kind !== 'pass' && rng.next() < m.p) {
        const r = MIDDLEMEN[m.kind](s, m, rng, alpha);
        s = r.out;
        note = r.note;
        fx = r.fx || null;
      }
      steps.push({ who: idx, before, after: s, note, fx });
    });
    return { out: s, steps };
  }

  // ---------------------------------------------------------------- programs
  function runEncoder(level, strip, msg, trace) {
    const tpl = templateOf(level);
    const vals = valuesOf(level, msg);
    let s = '';
    for (const it of strip) {
      const prev = s;
      const piece = itemOut(it, vals, tpl, prev);
      s += piece;
      if (s.length > MAX_LEN) throw new EngineError('Transmission too long for the wire (over 256 symbols).');
      if (trace) trace.push({ id: it.id, t: it.t, piece, after: s, fx: encFx(it, vals, tpl, prev) });
    }
    return { out: s, steps: trace };
  }

  // Trace-only records (pure; never touch the RNG): exactly how each strip item / plate / reader produced its
  // output, so the test-transmission animation can act it out faithfully.
  function encFx(it, vals, tpl, prev = '') {
    const piece = itemOut(it, vals, tpl, prev);
    let acc = prev; // (group members see the tape as laid so far; a repeat's later passes are not traced)
    const kids = (list) => (list || []).map((x) => {
      const f = encFx(x, vals, tpl, acc);
      acc += f.piece;
      return f;
    });
    switch (it.t) {
      case 'src':
        return { type: 'src', v: it.v, not: !!it.not, from: vals[it.v] ?? '', piece };
      case 'lit':
        return { type: 'lit', piece };
      case 'rep':
        return { type: 'rep', n: Math.max(1, it.n), parts: kids(it.items), piece };
      case 'if': {
        const yes = it.set.includes(vals[it.v]);
        return { type: 'if', v: it.v, set: it.set, from: vals[it.v] ?? '', yes, parts: kids(yes ? it.then : it.else), piece };
      }
      case 'par':
        return { type: 'par', vars: it.vars.slice(), bits: it.vars.map((v) => vals[v] ?? ''), piece };
      case 'chk': {
        if (Array.isArray(it.w)) {
          const terms = it.w.map((w, v) => ({ v, w, d: symVal(vals[v]) })).filter((x) => x.w);
          return { type: 'chk', mode: 'DIAL', mod: it.mod || 11, terms, sum: terms.reduce((a, x) => a + x.w * x.d, 0), piece };
        }
        const w = WEIGHTS[it.mode] || WEIGHTS.SUM;
        const terms = it.vars.map((v) => ({ v, w: w(v + 1), d: symVal(vals[v]) }));
        return { type: 'chk', mode: it.mode || 'SUM', mod: 11, terms, sum: terms.reduce((a, x) => a + x.w * x.d, 0), piece };
      }
      case 'seal':
        return { type: 'seal', n: Array.isArray(it.rows) ? it.rows.length : it.n, rows: it.rows, mod: it.mod || 11, data: vals.join(''), piece };
      case 'crc': {
        const run = crcRun(it.g, prev);
        return { type: 'crc', g: crcGen(it.g), bits: run.bits, states: run.states, piece };
      }
    }
    return { type: it.t, piece };
  }

  function decFx(op, p, a, out) {
    switch (op) {
      case 'STRIP':
        return { type: 'strip', drop: [...a].map((c, i) => (p.set.includes(c) ? i : -1)).filter((i) => i >= 0) };
      case 'SWAP': {
        const i = p.a - 1;
        const j = p.b - 1;
        if (i === j || i < 0 || j < 0 || i >= a.length || j >= a.length) return { type: 'none' };
        return { type: 'swap', i: Math.min(i, j), j: Math.max(i, j) };
      }
      case 'FLIP': {
        const i = p.pos - 1;
        return a === out ? { type: 'none' } : { type: 'flip', i, from: a[i], to: out[i] };
      }
      case 'BETWEEN': {
        const i = a.indexOf(p.open);
        const j = i < 0 ? -1 : a.indexOf(p.close, i + 1);
        return j < 0 ? { type: 'none' } : { type: 'between', a: i, b: j };
      }
      case 'REASSEMBLE': {
        const parts = chunks(a, p.size).map((c, i) => ({ c, i }));
        const order = parts
          .slice()
          .sort((x, y) => (x.c[0] < y.c[0] ? -1 : x.c[0] > y.c[0] ? 1 : x.i - y.i))
          .map((x) => x.i);
        return { type: 'reassemble', size: p.size, order };
      }
      case 'REPAIR': {
        if (a.length !== out.length) return { type: 'repair', changed: null };
        const changed = [];
        for (let i = 0; i < a.length; i++) if (a[i] !== out[i]) changed.push(i);
        return { type: 'repair', changed };
      }
      case 'SYNDROME':
      case 'CAPTURED': {
        // every row's parity, the syndrome they spell, the lamps whose own column of H it equals, the table's answer
        const rows = op === 'CAPTURED' ? CAPTURED_ROWS : p.rows || [];
        const table = op === 'CAPTURED' ? CAPTURED_TABLE : p.table || {};
        const bits = syndromeBits(a, rows);
        const key = bits.join('');
        const cols = [];
        if (key.includes('1')) for (let j = 0; j < a.length; j++) if (rows.map((row) => (row.includes(j + 1) ? 1 : 0)).join('') === key) cols.push(j);
        const flips = [];
        for (let i = 0; i < a.length; i++) if (a[i] !== out[i]) flips.push({ i, from: a[i], to: out[i] });
        return {
          type: 'syndrome',
          captured: op === 'CAPTURED',
          rows: rows.map((row) => row.map((q) => q - 1).filter((i) => i >= 0 && i < a.length)),
          bits,
          key,
          entry: key.includes('1') ? (table[key] || []).slice() : null,
          cols,
          flips,
        };
      }
    }
    return { type: 'none' };
  }

  function condFx(op, p, s, yes) {
    const all = [...s].map((_, i) => i);
    let pos = all;
    let groups = 0;
    if (op === 'IF_IN') pos = [p.pos - 1];
    else if (op === 'IF_SAME') pos = [p.a - 1, p.b - 1];
    else if (op === 'IF_PARITY') pos = (p.pos || []).map((q) => q - 1);
    else if (op === 'IF_AGREE') groups = s.length && s.length % p.copies === 0 ? p.copies : 0;
    return { type: 'cond', pos: pos.filter((i) => i >= 0 && i < s.length), groups, yes };
  }

  function asmFx(level, asm, s) {
    const tpl = templateOf(level);
    const reads = tpl.vars.map((v, k) => {
      const r = asm[k];
      if (!r) return { t: 'none', pos: [], picks: [], raw: '', not: false, value: '' };
      const pos = (r.t === 'vote' ? r.pos : [r.i]).map((q) => q - 1);
      const picks = pos.map((i) => s[i]);
      return { t: r.t, pos, picks, raw: readVar({ ...r, not: false }, s, v.set), not: !!r.not, value: readVar(r, s, v.set) };
    });
    return {
      type: 'assemble',
      cells: tpl.cells.map((c) => (c.lit !== undefined ? { lit: c.lit } : { v: c.v })),
      vars: tpl.vars.map((v) => ({ sym: v.sym, color: v.color })),
      reads,
    };
  }

  function runList(list, s, ctx, trace) {
    for (const b of list) {
      if (b.op === 'SAY_AGAIN') {
        if (trace) trace.push({ id: b.id, op: b.op, before: s, after: s });
        return { s, halt: true };
      }
      if (COND[b.op]) {
        const yes = COND[b.op](s, b.p, ctx);
        if (trace) trace.push({ id: b.id, op: b.op, before: s, after: s, branch: yes ? 'yes' : 'no', fx: condFx(b.op, b.p, s, yes) });
        const r = runList(yes ? b.then || [] : b.else || [], s, ctx, trace);
        if (r.halt) return r;
        s = r.s;
        continue;
      }
      if (!DEC[b.op]) continue;
      const before = s;
      s = DEC[b.op](s, b.p, ctx);
      if (trace) trace.push({ id: b.id, op: b.op, before, after: s, fx: decFx(b.op, b.p, before, s) });
    }
    return { s, halt: false };
  }

  // Field protocol = plates (clean the signal), then the assembly row (read the order out of it).
  function runDecoder(level, dec, asm, recv, ctx, trace) {
    const r = runList(dec, recv, ctx, trace);
    if (r.halt) return { out: null, cleaned: r.s, sayAgain: true, steps: trace };
    const out = assemble(level, asm, r.s);
    if (trace) trace.push({ id: 'asm', op: 'ASSEMBLE', before: r.s, after: out, fx: asmFx(level, asm, r.s) });
    return { out, cleaned: r.s, sayAgain: false, steps: trace };
  }

  function usesCodebook(list) {
    for (const b of list) {
      if (b.op === 'REPAIR' || b.op === 'IF_VALID') return true;
      if ((b.then && usesCodebook(b.then)) || (b.else && usesCodebook(b.else))) return true;
    }
    return false;
  }

  function countBlocks(list) {
    let n = 0;
    for (const b of list) n += 1 + countBlocks(b.then || []) + countBlocks(b.else || []);
    return n;
  }

  // Equipment = tools used. Plain variable tiles, literals, repeat brackets and single-position reads are free.
  function countStrip(items) {
    let n = 0;
    for (const it of items) {
      if (it.t === 'src') n += it.not ? 1 : 0;
      else if (it.t === 'rep') n += countStrip(it.items);
      else if (it.t === 'if') n += 1 + countStrip(it.then) + countStrip(it.else);
      else if (it.t !== 'lit') n += 1;
    }
    return n;
  }

  function countEquipment(enc, dec, asm) {
    return countStrip(enc) + countBlocks(dec) + asm.filter((r) => r && (r.t === 'vote' || r.not)).length;
  }

  function sampleMessage(level, rng) {
    const tpl = templateOf(level);
    return fillTemplate(tpl, tpl.vars.map((v) => v.set[rng.int(v.set.length)]));
  }

  // The first shift register tile on the strip (searching inside groups): the field's register copies its g.
  function crcOf(list) {
    for (const it of list || []) {
      if (it.t === 'crc') return it.g;
      const inner = crcOf(it.items) || crcOf(it.then) || crcOf(it.else);
      if (inner) return inner;
    }
    return null;
  }

  function makeContext(level, enc, dec) {
    return { codebook: usesCodebook(dec) ? buildCodebook(level, enc) : null, crc: crcOf(enc) };
  }

  // prog = { enc: strip, dec: plates, asm: readers, route?: node ids (network levels) }
  function runTrial(level, prog, ctx, rng, line = lineOf(level, prog)) {
    const msg = sampleMessage(level, rng);
    const sent = runEncoder(level, prog.enc, msg, []);
    const attempts = [];
    let total = 0;
    let delivered = null;
    const maxAttempts = level.arq ? MAX_ATTEMPTS : 1;
    for (let a = 0; a < maxAttempts; a++) {
      const ch = runChannel(level, sent.out, rng, line.chain);
      total += sent.out.length;
      const d = runDecoder(level, prog.dec, prog.asm, ch.out, ctx, []);
      attempts.push({ recv: ch.out, chan: ch.steps, dec: d.steps, out: d.out, sayAgain: d.sayAgain });
      if (!d.sayAgain) {
        delivered = d.out;
        break;
      }
    }
    const trial = { msg, sent: sent.out, enc: sent.steps, attempts, delivered, ok: delivered === msg, overhead: total - msg.length };
    if (line.route) {
      trial.route = line.route.nodes;
      trial.delay = attempts.length * line.delay;
    }
    return trial;
  }

  function evaluate(level, prog, opts = {}) {
    const trials = opts.trials || 300;
    const rng = makeRng(opts.seed ?? (Date.now() ^ Math.floor(Math.random() * 1e9)));
    const line = lineOf(level, prog);
    const ctx = makeContext(level, prog.enc, prog.dec);
    const results = [];
    for (let t = 0; t < trials; t++) results.push(runTrial(level, prog, ctx, rng, line));
    const okN = results.filter((r) => r.ok).length;
    const accuracy = okN / trials;
    const avgOverhead = results.reduce((a, r) => a + r.overhead, 0) / trials;
    const blocks = countEquipment(prog.enc, prog.dec, prog.asm);
    // Routing levels: average hours per order (re-sends included) must stay within level.delayBudget.
    const avgDelay = line.route ? results.reduce((a, r) => a + r.delay, 0) / trials : undefined;
    const delayOk = level.delayBudget === undefined || (avgDelay ?? 0) <= level.delayBudget + 1e-9;
    const passed = accuracy >= level.target - 1e-9 && avgOverhead <= level.budget + 1e-9 && delayOk;
    const medals = [passed, passed && avgOverhead <= level.par.overhead + 1e-9, passed && blocks <= level.par.blocks];
    const res = { results, okN, trials, accuracy, avgOverhead, blocks, passed, medals, codebook: ctx.codebook };
    if (line.route) Object.assign(res, { avgDelay, delayOk, route: line.route.nodes, routeDelay: line.delay });
    return res;
  }

  function singleTrial(level, prog, seed) {
    const rng = makeRng(seed ?? (Date.now() ^ Math.floor(Math.random() * 1e9)));
    return runTrial(level, prog, makeContext(level, prog.enc, prog.dec), rng, lineOf(level, prog));
  }

  // A sample order through the strip, for the live previews.
  function encoderPreview(level, enc) {
    const tpl = templateOf(level);
    // A varied but stable sample: walk each variable's set so lamps and digits aren't all identical.
    const msg = fillTemplate(tpl, tpl.vars.map((v, k) => v.set[(k * 3 + 1) % v.set.length]));
    try {
      const steps = [];
      const out = runEncoder(level, enc, msg, steps).out;
      return { msg, out, steps };
    } catch (e) {
      return { msg, error: e.message };
    }
  }

  CoC.engine = {
    EngineError,
    makeRng,
    modm,
    invm,
    checkValue,
    solveSeal,
    syndromeBits,
    CAPTURED_H: { rows: CAPTURED_ROWS, table: CAPTURED_TABLE },
    crcRun,
    crcClear,
    crcPeriod,
    SHAPES,
    parseTemplate,
    templateOf,
    isValidOrder,
    alphabetOf,
    partner,
    valuesOf,
    defaultStrip,
    defaultAsm,
    parseStrip,
    parseAsm,
    assemble,
    evaluate,
    singleTrial,
    runEncoder,
    runDecoder,
    runChannel,
    routeInfo,
    allRoutes,
    lineOf,
    interceptSamples,
    makeContext,
    analyze,
    encoderPreview,
    countBlocks,
    countEquipment,
    messageCount,
    COND_OPS: Object.keys(COND),
  };
})();
