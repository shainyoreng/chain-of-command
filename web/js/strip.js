/* Chain of Command — the HQ transmission strip (a row of stamped tiles, left to right)
 * and its mirror on the field side, the order assembly row (where each symbol is read from). */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});

  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  const btn = (cls, html, title) => {
    const b = el('button', cls, html);
    b.type = 'button';
    if (title) b.title = title;
    return b;
  };
  const sfx = (name) => {
    try {
      if (CoC.audio && CoC.audio.sfx && CoC.audio.sfx[name]) CoC.audio.sfx[name]();
    } catch (_) {
      /* sound is optional */
    }
  };
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const cssId = (id) => (globalThis.CSS && CSS.escape ? CSS.escape(id) : String(id).replace(/"/g, '\\"'));

  function compressRanges(nums) {
    if (CoC.editorUtil && CoC.editorUtil.compressRanges) return CoC.editorUtil.compressRanges(nums);
    return nums.join(',');
  }

  const varCell = (tpl, v, extra) => {
    const x = tpl && tpl.vars[v];
    if (!x) return `<span class="tpl-cell var strip-broken${extra ? ' ' + extra : ''}">?</span>`;
    return `<span class="tpl-cell var c-${x.color}${extra ? ' ' + extra : ''}">${esc(x.sym)}</span>`;
  };
  const litCell = (c) => `<span class="tpl-cell lit">${esc(c)}</span>`;
  // a digit in its variable's colour (the sample order's value), and a seal digit (S1, S2, … or its value)
  const digCell = (tpl, v, d) => {
    const x = tpl && tpl.vars[v];
    return `<span class="tpl-cell var c-${x ? x.color : 'sand'} strip-dig"${x ? ` title="${esc(x.sym)}"` : ''}>${esc(d || '·')}</span>`;
  };
  const sealCell = (c, d) =>
    d === undefined
      ? `<span class="tpl-cell strip-sealcell">S${c + 1}</span>`
      : `<span class="tpl-cell strip-sealcell${c < 0 ? ' strip-chkcell' : ''}"${c >= 0 ? ` title="S${c + 1}"` : ''}>${esc(d)}</span>`;

  const LOCK_SVG =
    '<svg class="strip-lock" viewBox="0 0 12 14" aria-hidden="true"><path d="M3 6V4a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="1" y="6" width="10" height="7.5" rx="1.2" fill="currentColor"/></svg>';

  // ------------------------------------------------------------ catalogue
  const TOOLS = {
    REPEAT: {
      t: 'rep', name: 'Repeat', icon: '⟦×⟧',
      desc: 'A bracket: everything inside it is stamped several times in a row.',
      example: '⟦■▲⟧×3  →  ■▲■▲■▲',
    },
    NOT: {
      t: null, name: 'Not', icon: '¬',
      desc: 'Flip a source tile to its partner symbol in the set. Drop it on a tile (or click a tile’s ¬ corner).',
      example: '■ ∈ {N,S}:  N → S,  S → N',
    },
    IF: {
      t: 'if', name: 'If', icon: '?',
      desc: 'Send one mini-strip when a symbol is one of the chosen values, another otherwise.',
      example: 'IF ■ is {N} → YES lane, else NO lane',
    },
    PARITY: {
      t: 'par', name: 'Parity', icon: 'P',
      desc: 'One extra bit: 1 if an odd number of the chosen symbols are “high”, else 0.',
      example: 'P over ■▲  →  one 0/1 lamp',
    },
    CHECK: {
      t: 'chk', name: 'Check digit', icon: 'Σ',
      desc: 'One check symbol: every digit × its weight dial, all added up, then the remainder after dividing by the modulus dial. Click the tile to set the dials.',
      example: 'weights 1 2 3 4, mod 5:  2 0 1 2 → 1·2+2·0+3·1+4·2 = 13 → 3',
    },
    SEAL: {
      t: 'seal', name: 'Seal', icon: 'H',
      desc: 'Check-matrix seal: write your own check rows. HQ appends one seal digit per row, chosen so every row adds up to 0 (mod m). Click the tile to edit the matrix.',
      example: 'rows 1 1 1 1 | 1 0  and  1 2 3 4 | 0 1  →  two seal digits',
    },
    CRC: {
      t: 'crc', name: 'Shift register', icon: '÷',
      desc: 'A CRC: every lamp already on the tape is clocked through a register of r lamps whose taps you wire — dividing the tape (times xʳ) by g(x). The remainder left in the register is stamped on. Click the tile to set the taps.',
      example: 'g = x³ + x + 1:  1101 → remainder 001 → 1101 001',
    },
  };
  const TOOL_ORDER = ['REPEAT', 'NOT', 'IF', 'PARITY', 'CHECK', 'SEAL', 'CRC'];
  const CRC_MAX = 8; // register lamps (degree of g)
  // helper stamps (rewards): never shown in the tray, only as buttons on the check / seal editors once issued
  const STAMPS = {
    FILL_ONES: { label: '1 1 1…', title: 'Stamp every weight 1 (the plain sum)', f: () => 1 },
    FILL_POS: { label: '1 2 3…', title: 'Stamp weight i on position i', f: (i) => i },
    FILL_SQ: { label: '1 4 9…', title: 'Stamp weight i² on position i', f: (i) => i * i },
  };
  const MOD_MIN = 4; // check digit: below 4 a single digit catches too little to be worth a dial position
  const SEAL_MOD_MIN = 2; // the seal goes down to 2: mod 2 its rows are parity checks, one lamp per row
  const MOD_MAX = 11;
  const SEAL_MAX_ROWS = 8;
  const TYPES = new Set(['src', 'lit', 'rep', 'if', 'par', 'chk', 'seal', 'crc']);

  // ------------------------------------------------------------ shift register polynomials (g: highest power first)
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sup = (n) => String(n).split('').map((d) => SUP[d]).join('');
  const xPow = (p) => (p === 0 ? '1' : p === 1 ? 'x' : 'x' + sup(p));
  const polyText = (g) => {
    const r = g.length - 1;
    const t = [];
    g.forEach((c, i) => c && t.push(xPow(r - i)));
    return t.join(' + ') || '0';
  };
  function fitCrc(g) {
    g = Array.isArray(g) ? g.map((x) => (x ? 1 : 0)) : [];
    if (g.length < 2) g = [1, 0, 0, 1];
    if (g.length > CRC_MAX + 1) g = [1].concat(g.slice(g.length - CRC_MAX));
    g[0] = 1;
    return g;
  }
  // a new register length keeps the low taps (x⁰, x¹, …) where they were
  function resizeCrc(g, r) {
    const low = g.slice(1);
    const next = low.length >= r ? low.slice(low.length - r) : new Array(r - low.length).fill(0).concat(low);
    return [1].concat(next);
  }
  const LISTS = { rep: ['items'], if: ['then', 'else'] };

  // ------------------------------------------------------------ modular arithmetic (mirrors the engine)
  const symVal = (c) => (c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : c === 'X' ? 10 : 0);
  const valSym = (v) => (v === 10 ? 'X' : String(v));
  const modm = (a, m) => ((a % m) + m) % m;
  const powm = (b, e, m) => {
    let r = 1;
    for (let i = 0; i < e; i++) r = modm(r * b, m);
    return r;
  };
  const invm = (a, m) => {
    a = modm(a, m);
    for (let x = 1; x < m; x++) if ((a * x) % m === 1) return x;
    return 0;
  };
  const clampMod = (m) => Math.max(2, Math.min(MOD_MAX, m | 0 || 11));

  // Which seal digit can these rows not pin down? (-1 = none: the seal works.) Same elimination as the engine.
  function sealJam(rows, m, k) {
    const r = rows.length;
    const A = rows.map((row) => Array.from({ length: r }, (_, c) => modm(row[k + c] || 0, m)));
    for (let c = 0; c < r; c++) {
      let p = c;
      while (p < r && !invm(A[p][c], m)) p++;
      if (p === r) return c;
      [A[c], A[p]] = [A[p], A[c]];
      const iv = invm(A[c][c], m);
      for (let x = 0; x < r; x++) A[c][x] = modm(A[c][x] * iv, m);
      for (let rr = 0; rr < r; rr++) {
        if (rr === c || !A[rr][c]) continue;
        const f = A[rr][c];
        for (let x = 0; x < r; x++) A[rr][x] = modm(A[rr][x] - f * A[c][x], m);
      }
    }
    return -1;
  }

  // ------------------------------------------------------------ legacy items → dial / matrix forms
  // Saved strips may hold {t:'chk', mode, vars} (mod 11 presets) or {t:'seal', n} (n Reed–Solomon digits).
  // They become the dial / check-matrix forms with identical behaviour. A seal needs the number of order
  // variables k (its rows run over positions 1..k+n); without it the seal is converted later, at render.
  const LEGACY_W = { SUM: () => 1, WEIGHTED: (i) => i, SQUARES: (i) => i * i, CUBES: (i) => i * i * i };
  function modernize(it, k) {
    if (it.t === 'chk' && !Array.isArray(it.w)) {
      const f = LEGACY_W[it.mode] || LEGACY_W.SUM;
      const vars = Array.isArray(it.vars) ? it.vars : [];
      const w = new Array(Math.max(k || 0, ...vars.map((v) => v + 1))).fill(0);
      for (const v of vars) w[v] = modm(f(v + 1), 11);
      it.w = w;
      it.mod = 11;
      delete it.mode;
      delete it.vars;
    }
    if (it.t === 'seal' && !Array.isArray(it.rows) && Number.isInteger(k)) {
      const n = Math.max(0, it.n | 0);
      it.rows = Array.from({ length: n }, (_, e) => Array.from({ length: k + n }, (_, j) => powm(j + 1, e, 11)));
      it.mod = 11;
      delete it.n;
    }
    return it;
  }

  // Fit dial / matrix items to the order (k variables), in place; weights live in 0..m−1.
  function normaliseItem(it, k) {
    modernize(it, k);
    if (it.t === 'chk') {
      it.mod = clampMod(it.mod);
      const w = Array.isArray(it.w) ? it.w : [];
      it.w = Array.from({ length: k }, (_, v) => modm(w[v] | 0, it.mod));
    } else if (it.t === 'seal' && Array.isArray(it.rows)) {
      it.mod = clampMod(it.mod);
      const r = it.rows.length;
      it.rows = it.rows.map((row) => {
        row = Array.isArray(row) ? row : [];
        const oldK = Math.max(0, row.length - r);
        const data = Array.from({ length: k }, (_, v) => (v < oldK ? row[v] | 0 : 0));
        const seal = Array.from({ length: r }, (_, c) => row[oldK + c] | 0);
        return data.concat(seal).map((x) => modm(x, it.mod));
      });
    } else if (it.t === 'crc') it.g = fitCrc(it.g);
    for (const key of LISTS[it.t] || []) for (const x of it[key] || []) normaliseItem(x, k);
    return it;
  }

  // ------------------------------------------------------------ model helpers
  let counter = 0;
  const uid = () => 's' + ++counter + '_' + Math.random().toString(36).slice(2, 6);
  let lastTpl = null; // template seen by the most recent editor render (fallback for newItem)

  // A fresh check tile starts with every weight at 0 (it covers nothing and always sends 0): the player
  // sets the dials, or — once issued — presses a stamp. A fresh seal has one row of zeros (it jams until
  // the row is written).
  function newItem(t, props, tpl) {
    const T = tpl || lastTpl;
    const k = T ? T.vars.length : 0;
    const base = { id: uid(), t };
    const has = (key) => props && props[key] !== undefined;
    switch (t) {
      case 'src': Object.assign(base, { v: 0, not: false }); break;
      case 'lit': Object.assign(base, { c: '[' }); break;
      case 'rep': Object.assign(base, { n: 2, items: [] }); break;
      case 'if': Object.assign(base, { v: 0, set: '', then: [], else: [] }); break;
      case 'par': Object.assign(base, { vars: [] }); break;
      case 'chk': if (!has('w') && !has('vars') && !has('mode')) Object.assign(base, { mod: 11, w: new Array(k).fill(0) }); break;
      case 'seal': if (!has('rows') && !has('n')) Object.assign(base, { mod: T && k && T.vars.every((v) => /^[01]+$/.test(v.set)) ? 2 : 11, rows: [new Array(k + 1).fill(0)] }); break;
      // a fresh register: three lamps, only the end taps wired (g = x³ + 1) — the player rewires it
      case 'crc': if (!has('g')) Object.assign(base, { g: [1, 0, 0, 1] }); break;
      default: break;
    }
    if (props) Object.assign(base, props);
    if (t === 'chk') modernize(base, null);
    if (t === 'if' && !base.set && T && T.vars[base.v]) base.set = T.vars[base.v].set[0];
    return base;
  }

  // tpl (optional): the order template, so legacy seals convert at once; otherwise they convert at render.
  function reviveStrip(list, tpl) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const it of list) {
      if (!it || !TYPES.has(it.t)) continue;
      const copy = JSON.parse(JSON.stringify(it));
      delete copy.id;
      for (const k of LISTS[it.t] || []) copy[k] = reviveStrip(it[k], tpl);
      const fresh = newItem(it.t, copy, tpl || { vars: [] });
      out.push(tpl ? modernize(fresh, tpl.vars.length) : fresh);
    }
    return out;
  }

  function find(list, id) {
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it.id === id) return { list, index: i, item: it };
      for (const k of LISTS[it.t] || []) {
        const r = it[k] && find(it[k], id);
        if (r) return r;
      }
    }
    return null;
  }

  // ------------------------------------------------------------ popover (one shared by both editors)
  let pop = null;
  function closePopover() {
    if (pop) pop.remove();
    pop = null;
  }
  // opts.editor: a larger editing panel (check dials, seal matrix) — scrolls inside itself, and on phones
  // it docks to the bottom of the screen as a drawer instead of hanging off the tile.
  const narrow = () => window.innerWidth <= 560;
  function openPopover(anchor, key, build, opts = {}) {
    closePopover();
    pop = el('div', 'popover strip-pop' + (opts.editor ? ' strip-editor' : ''));
    pop.dataset.for = key;
    pop._rect = anchor.getBoundingClientRect();
    if (opts.editor && narrow()) pop.classList.add('strip-drawer');
    document.body.appendChild(pop);
    build(pop);
    placePopover();
  }
  function placePopover() {
    if (!pop) return;
    if (pop.classList.contains('strip-drawer')) return; // docked by CSS
    const r = pop._rect;
    pop.style.left = '0px';
    pop.style.top = '0px';
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
    let top;
    if (pop._top !== undefined) {
      // Re-placing an open popover (its content changed height): keep the top edge where it was, so the control
      // under the pointer stays put; move up only as far as the screen forces.
      top = Math.max(8, Math.min(pop._top, window.innerHeight - h - 8));
    } else {
      top = r.bottom + 6;
      if (top + h > window.innerHeight - 8) top = r.top - h - 6;
      if (top < 8) top = Math.max(8, window.innerHeight - h - 8);
    }
    pop._top = top;
    pop.style.top = top + 'px';
  }
  const popOpenFor = (key) => pop && pop.dataset.for === key;
  document.addEventListener('pointerdown', (e) => {
    if (pop && !pop.contains(e.target) && !e.target.closest('.strip-ctl, [data-pop]')) closePopover();
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closePopover());

  // toggle grid: options = [{key, html}], isOn(key), onToggle(key) -> new on-state
  function toggleGrid(p, title, options, isOn, onToggle, cls) {
    p.appendChild(el('div', 'pop-title', title));
    const grid = el('div', 'pop-grid' + (cls ? ' ' + cls : ''));
    for (const o of options) {
      const t = btn('pop-tile' + (isOn(o.key) ? ' on' : ''), o.html);
      t.addEventListener('click', () => {
        const on = onToggle(o.key, t);
        if (on !== undefined) t.classList.toggle('on', !!on);
        sfx('click');
      });
      grid.appendChild(t);
    }
    p.appendChild(grid);
    return grid;
  }

  // multi-select grid: click toggles one, press-and-drag paints (every tile passed gets the state the
  // first one switched to), shift-click sets the whole run since the last click, plus ALL/NONE/ODD/EVEN.
  // opts: { title, options: [{key, html, title?}], selected: keys[], commit(keys[]), extras?(api, p) }
  function multiPicker(p, opts) {
    const keys = opts.options.map((o) => o.key);
    const sel = new Set(opts.selected);
    p.appendChild(el('div', 'pop-title', opts.title));
    const grid = el('div', 'pop-grid strip-multi' + (opts.cls ? ' ' + opts.cls : ''));
    const tiles = opts.options.map((o, i) => {
      const t = btn('pop-tile' + (sel.has(o.key) ? ' on' : ''), o.html, o.title);
      t.dataset.i = i;
      grid.appendChild(t);
      return t;
    });
    const paint = () => tiles.forEach((t, i) => t.classList.toggle('on', sel.has(keys[i])));
    const ordered = () => keys.filter((k) => sel.has(k));
    const commit = () => {
      paint();
      opts.commit(ordered());
    };
    const setAll = (list) => {
      sel.clear();
      for (const k of list) sel.add(k);
      sfx('click');
      commit();
    };
    let last = null; // index of the last clicked tile (shift-click anchor)
    let gesture = null; // { state, touched: Set(index) }
    const tileAt = (x, y) => {
      const h = document.elementFromPoint(x, y);
      const t = h && h.closest('.pop-tile');
      return t && grid.contains(t) ? +t.dataset.i : null;
    };
    const apply = (i, state) => {
      if (state) sel.add(keys[i]);
      else sel.delete(keys[i]);
    };
    grid.addEventListener('pointerdown', (e) => {
      const t = e.target.closest('.pop-tile');
      if (!t || (e.button !== undefined && e.button !== 0)) return;
      e.preventDefault(); // no text selection / focus jump while painting
      const i = +t.dataset.i;
      const state = !sel.has(keys[i]);
      if (e.shiftKey && last !== null) {
        const [a, b] = last < i ? [last, i] : [i, last];
        for (let j = a; j <= b; j++) apply(j, state);
        last = i;
        sfx('click');
        commit();
        return;
      }
      apply(i, state);
      last = i;
      paint();
      sfx('click');
      gesture = { state, touched: new Set([i]), id: e.pointerId, x: e.clientX, y: e.clientY };
      try {
        grid.setPointerCapture(e.pointerId);
      } catch (_) {
        /* capture is a nicety */
      }
    });
    grid.addEventListener('pointermove', (e) => {
      if (!gesture || e.pointerId !== gesture.id) return;
      // sample the stroke since the last event so a fast swipe does not skip tiles
      const x0 = gesture.x === undefined ? e.clientX : gesture.x;
      const y0 = gesture.y === undefined ? e.clientY : gesture.y;
      gesture.x = e.clientX;
      gesture.y = e.clientY;
      const steps = Math.max(1, Math.ceil(Math.hypot(e.clientX - x0, e.clientY - y0) / 6));
      let hit = false;
      for (let s = 1; s <= steps; s++) {
        const i = tileAt(x0 + ((e.clientX - x0) * s) / steps, y0 + ((e.clientY - y0) * s) / steps);
        if (i === null || gesture.touched.has(i)) continue;
        gesture.touched.add(i);
        apply(i, gesture.state);
        last = i;
        hit = true;
      }
      if (hit) paint();
    });
    const end = (e) => {
      if (!gesture || (e && e.pointerId !== gesture.id)) return;
      gesture = null;
      commit();
    };
    grid.addEventListener('pointerup', end);
    grid.addEventListener('pointercancel', end);
    grid.addEventListener('lostpointercapture', end);
    // keyboard (Enter/Space produce a click with detail 0)
    grid.addEventListener('click', (e) => {
      const t = e.target.closest('.pop-tile');
      if (!t || e.detail !== 0) return;
      const i = +t.dataset.i;
      apply(i, !sel.has(keys[i]));
      last = i;
      sfx('click');
      commit();
    });
    p.appendChild(grid);

    const quick = el('div', 'strip-quick');
    for (const [name, pick] of [
      ['All', () => keys],
      ['None', () => []],
      ['Odd', () => keys.filter((_, i) => i % 2 === 0)],
      ['Even', () => keys.filter((_, i) => i % 2 === 1)],
    ]) {
      const b = btn('strip-quick-btn', name);
      b.addEventListener('click', () => setAll(pick()));
      quick.appendChild(b);
    }
    p.appendChild(quick);
    if (keys.length > 2) p.appendChild(el('div', 'strip-pop-hint', 'Drag across tiles to paint · shift-click for a run'));
    const api = { setAll, keys, selected: ordered };
    if (opts.extras) opts.extras(api, p);
    return api;
  }

  function stepper(value, min, max, fmt, onSet, title) {
    const c = el('span', 'strip-ctl strip-step');
    if (title) c.title = title;
    const minus = btn('', '−');
    const val = el('b', '', fmt(value));
    const plus = btn('', '+');
    let cur = value;
    const bump = (d) => {
      const v = Math.max(min, Math.min(max, cur + d));
      if (v === cur) return;
      cur = v;
      val.textContent = fmt(v);
      sfx('click');
      onSet(v);
    };
    minus.addEventListener('click', () => bump(-1));
    plus.addEventListener('click', () => bump(1));
    c.append(minus, val, plus);
    return c;
  }

  // A weight dial: residues 0..m−1 that wrap around (one below 0 is m−1 — the same thing, mod m).
  // Buttons, the mouse wheel, arrow keys and typed digits all turn it.
  function dial(value, m, onSet, title) {
    const c = el('span', 'strip-ctl strip-dial');
    const up = btn('strip-dial-btn', '▲', 'Up one');
    const val = btn('strip-dial-val', String(value), title);
    const down = btn('strip-dial-btn', '▼', 'Down one');
    let cur = value;
    const setTo = (v) => {
      v = modm(v, m);
      if (v === cur) return;
      cur = v;
      val.textContent = String(v);
      c.classList.toggle('zero', !v);
      sfx('click');
      onSet(v);
    };
    c.classList.toggle('zero', !value);
    up.addEventListener('click', () => setTo(cur + 1));
    down.addEventListener('click', () => setTo(cur - 1));
    val.addEventListener('click', () => setTo(cur + 1));
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      setTo(cur + (e.deltaY < 0 ? 1 : -1));
    }, { passive: false });
    c.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') setTo(cur + 1);
      else if (e.key === 'ArrowDown') setTo(cur - 1);
      else if (/^[0-9]$/.test(e.key) && +e.key < m) setTo(+e.key);
      else if ((e.key === 'x' || e.key === 'X') && m > 10) setTo(10);
      else return;
      e.preventDefault();
    });
    c.append(up, val, down);
    return c;
  }

  // ------------------------------------------------------------ hover tips (mouse only; fixed so no column clips them)
  const canHover = () => !!(globalThis.matchMedia && matchMedia('(hover: hover)').matches);
  let tip = null;
  let tipFor = null;
  let tipTimer = 0;
  function hideTip() {
    clearTimeout(tipTimer);
    tipTimer = 0;
    tipFor = null;
    if (tip) tip.classList.remove('show');
  }
  function placeTip(anchor) {
    if (!anchor.isConnected || drag) return;
    if (!tip) {
      tip = el('div', 'strip-tip');
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    tip.textContent = anchor.dataset.tip;
    tip.style.left = '0px';
    tip.style.top = '0px';
    const r = anchor.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let top = r.bottom + 8;
    if (top + th > window.innerHeight - 6) top = Math.max(6, r.top - th - 8);
    tip.style.left = Math.max(6, Math.min(window.innerWidth - tw - 6, r.left - 4)) + 'px';
    tip.style.top = top + 'px';
    tip.classList.add('show');
  }
  function showTipSoon(anchor, delay = 350) {
    if (tipFor === anchor) return;
    hideTip();
    tipFor = anchor;
    tipTimer = setTimeout(() => tipFor === anchor && placeTip(anchor), delay);
  }
  function bindTips(root) {
    root.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse' || !canHover()) return;
      const a = e.target.closest('[data-tip]');
      if (a && root.contains(a)) showTipSoon(a);
    });
    root.addEventListener('pointerout', (e) => {
      if (tipFor && !(e.relatedTarget && tipFor.contains(e.relatedTarget))) hideTip();
    });
    root.addEventListener('pointerdown', hideTip);
    root.addEventListener('focusin', (e) => {
      const a = e.target.closest('[data-tip]');
      if (a && a.matches(':focus-visible')) showTipSoon(a, 150);
    });
    root.addEventListener('focusout', hideTip);
  }
  window.addEventListener('scroll', hideTip, true);

  // scroll only the nearest scrollable ancestor (never the page) so `node` is in view
  function revealInScroller(node) {
    let p = node.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      const sy = /(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1;
      const sx = /(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 1;
      if (sy || sx) break;
      p = p.parentElement;
    }
    if (!p || p === document.body || p === document.documentElement) return;
    const r = node.getBoundingClientRect();
    const c = p.getBoundingClientRect();
    const pad = 10;
    const fit = (lo, hi, a, b) => {
      // a..b is the node's extent, lo..hi the visible client area
      if (a >= lo + pad && b <= hi - pad) return 0;
      if (b - a > hi - lo - 2 * pad || a < lo + pad) return a - lo - pad;
      return b - hi + pad;
    };
    const top = c.top + p.clientTop;
    const left = c.left + p.clientLeft;
    const dy = fit(top, top + p.clientHeight, r.top, r.bottom);
    const dx = fit(left, left + p.clientWidth, r.left, r.right);
    if (!dy && !dx) return;
    const calm = globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    p.scrollBy({ top: dy, left: dx, behavior: calm ? 'auto' : 'smooth' });
  }

  // ------------------------------------------------------------ drag (one at a time)
  let drag = null;
  let pressTimer = 0;

  function onMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.started) {
      if (drag.consumed || dx * dx + dy * dy < 30) return;
      drag.started = true;
      clearTimeout(pressTimer);
      closePopover();
      hideTip();
      drag.ghost = el('div', 'drag-ghost strip-ghost' + (drag.ids ? ' strip-ghost-multi' : ''), drag.label);
      document.body.appendChild(drag.ghost);
      for (const s of drag.srcEls || [drag.srcEl]) if (s) s.classList.add('dragging');
      document.body.classList.add('is-dragging');
    }
    drag.ghost.style.transform = `translate(${e.clientX + 10}px, ${e.clientY + 8}px)`;
    drag.editor.updateDrop(e.clientX, e.clientY);
  }

  function onUp(e) {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    clearTimeout(pressTimer);
    if (!drag) return;
    const d = drag;
    drag = null;
    document.body.classList.remove('is-dragging');
    if (d.ghost) d.ghost.remove();
    for (const s of (d.srcEls || []).concat(d.srcEl || [])) s.classList.remove('dragging', 'pressing');
    if (d.consumed) return; // a long-press already did its thing
    d.editor.finishDrag(d, e && e.type === 'pointercancel');
  }

  // spec: { kind: 'new'|'move', make: () => item, tool, id, label, anchor, longPress?: () => void,
  //         mod?: 'toggle'|'range', touch?, ids?: [top-level selected ids], srcEls?: their nodes }
  function startDrag(e, editor, spec, srcEl) {
    if (e.button !== undefined && e.button !== 0) return;
    if (drag) return;
    drag = Object.assign({ editor, srcEl, x0: e.clientX, y0: e.clientY, started: false, target: null }, spec);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    clearTimeout(pressTimer);
    if (spec.longPress && e.pointerType && e.pointerType !== 'mouse') {
      const d = drag;
      if (srcEl) srcEl.classList.add('pressing');
      pressTimer = setTimeout(() => {
        if (drag !== d || d.started) return;
        d.consumed = true;
        if (srcEl) srcEl.classList.remove('pressing');
        if (navigator.vibrate) {
          try {
            navigator.vibrate(12);
          } catch (_) {
            /* optional */
          }
        }
        d.longPress();
      }, 480);
    }
  }

  // ------------------------------------------------------------ HQ strip editor
  class StripEditor {
    constructor(opts) {
      this.opts = opts;
      this.tray = opts.tray;
      this.board = opts.board;
      this.tray.classList.add('strip-tray');
      this.board.classList.add('strip-board');
      this.placeholder = el('div', 'strip-drop');
      this.notTarget = null;
      this.lockedOpen = false;
      bindTips(this.tray);
      // multi-selection (conventions shared with the plate editor via CoC.editorUtil)
      const U = CoC.editorUtil;
      this.sel = new Set();
      this.selAnchor = null;
      this.selFor = null;
      this.chip = U.selChip(this.board.closest('.protocol') || this.board.parentElement || document.body, {
        onClear: () => this.clearSelection(),
        onRemove: () => this.deleteSelection(),
      });
      document.addEventListener('coc:select', (e) => e.detail !== this && this.clearSelection());
      this.board.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.strip-item') && !U.selMode(e)) this.clearSelection();
      });
      document.addEventListener('keydown', (e) => {
        if (!this.sel.size || !this.board.isConnected) return;
        if (e.key === 'Escape') return this.clearSelection();
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        if (e.ctrlKey || e.metaKey || e.altKey || drag || U.isTyping(e.target) || U.modalOpen()) return;
        if (!this.board.getClientRects().length) return;
        e.preventDefault();
        this.deleteSelection();
      });
    }

    // ---- selection
    // selected items whose containers are not selected, in strip order (a selected REPEAT/IF brings its contents)
    topSelected() {
      const out = [];
      const walk = (list) => {
        for (const it of list) {
          if (this.sel.has(it.id)) out.push(it.id);
          else for (const k of LISTS[it.t] || []) walk(it[k] || []);
        }
      };
      walk(this.strip);
      return out;
    }
    nodeFor(id) {
      return this.board.querySelector(`.strip-item[data-id="${cssId(id)}"]`);
    }
    // 'toggle' adds/drops one item; 'range' selects the run from the last clicked item when both share a lane
    selectClick(id, mode) {
      const f = find(this.strip, id);
      if (!f) return;
      const a = mode === 'range' && this.selAnchor && !this.sel.has(id) ? f.list.findIndex((x) => x.id === this.selAnchor) : -1;
      if (a >= 0) {
        const [lo, hi] = a < f.index ? [a, f.index] : [f.index, a];
        for (let i = lo; i <= hi; i++) this.sel.add(f.list[i].id);
      } else if (this.sel.has(id)) this.sel.delete(id);
      else this.sel.add(id);
      this.selAnchor = id;
      sfx('click');
      if (this.sel.size) CoC.editorUtil.announceSelection(this);
      this.paintSelection();
    }
    clearSelection() {
      this.selAnchor = null;
      if (!this.sel.size) return;
      this.sel.clear();
      this.paintSelection();
    }
    paintSelection() {
      for (const n of this.board.querySelectorAll('.strip-item')) n.classList.toggle('selected', this.sel.has(n.dataset.id));
      this.chip.set(this.sel.size);
    }
    deleteSelection() {
      const ids = this.topSelected();
      if (!ids.length) return;
      for (const id of ids) {
        const f = find(this.strip, id);
        if (f) f.list.splice(f.index, 1);
      }
      this.sel.clear();
      this.selAnchor = null;
      sfx('remove');
      this.structural();
    }
    // forget the selection when the strip is swapped (level change) or its items are gone
    pruneSelection() {
      if (this.selFor !== this.strip) {
        this.selFor = this.strip;
        this.sel.clear();
        this.selAnchor = null;
        return;
      }
      for (const id of [...this.sel]) if (!find(this.strip, id)) this.sel.delete(id);
      if (this.selAnchor && !find(this.strip, this.selAnchor)) this.selAnchor = null;
    }
    // does the node lie inside an item being dragged?
    inMoving(node) {
      return (drag.srcEls || (drag.srcEl ? [drag.srcEl] : [])).some((s) => s.contains(node));
    }

    get strip() {
      return this.opts.getStrip();
    }
    tpl() {
      const t = CoC.engine.templateOf(this.opts.getLevel());
      lastTpl = t;
      return t;
    }
    tools() {
      return this.opts.allowedTools ? this.opts.allowedTools() : new Set();
    }
    changed(kind) {
      if (this.opts.onChange) this.opts.onChange(kind);
    }
    structural() {
      this.render();
      this.changed('structure');
    }
    laneList(key) {
      if (key === 'root') return this.strip;
      const i = key.lastIndexOf(':');
      const f = find(this.strip, key.slice(0, i));
      return f ? f.item[key.slice(i + 1)] : null;
    }
    remove(id) {
      const f = find(this.strip, id);
      if (!f) return;
      f.list.splice(f.index, 1);
      sfx('remove');
      this.structural();
    }
    // re-render one item in place (param edits) without disturbing an open popover
    refreshItem(id) {
      const old = this.board.querySelector(`.strip-item[data-id="${cssId(id)}"]`);
      const f = find(this.strip, id);
      if (!old || !f) return;
      const fresh = this.renderItem(f.item);
      if (old.classList.contains('active')) fresh.classList.add('active');
      old.replaceWith(fresh);
    }
    markers() {
      const base = (this.opts.markers ? this.opts.markers() : '') || '';
      const seen = new Set();
      let out = '';
      for (const c of base + '123456789') if (!seen.has(c) && c.trim()) (seen.add(c), (out += c));
      return out;
    }

    // ---- drag & drop
    // pointer within a small margin around the board still counts as "on the board"
    nearBoard(x, y, slack = 14) {
      const r = this.board.getBoundingClientRect();
      return x >= r.left - slack && x <= r.right + slack && y >= r.top - slack && y <= r.bottom + slack;
    }

    // no drop position: `scrap` = the pointer is genuinely away from the editor
    noDrop(scrap) {
      this.placeholder.remove();
      for (const l of this.board.querySelectorAll('.strip-lane-hot')) l.classList.remove('strip-lane-hot');
      drag.ghost.classList.toggle('trash', scrap && drag.kind === 'move');
      drag.target = scrap ? null : { cancel: true };
    }

    updateDrop(x, y) {
      if (this.notTarget) this.notTarget.classList.remove('strip-not-target');
      this.notTarget = null;
      const hit = document.elementFromPoint(x, y);

      // hovering a dragged tile itself (or anything inside it, e.g. a REPEAT's own body): leave it be
      if (hit && this.inMoving(hit)) return this.noDrop(false);

      const onBoard = !!hit && this.board.contains(hit);
      const inBoard = onBoard || this.nearBoard(x, y);
      if (!inBoard) {
        // over the tray (or the gap around the board) = no change; anywhere else = scrap
        const inTray = !!hit && this.tray.contains(hit);
        return this.noDrop(!inTray);
      }

      if (drag.tool === 'NOT') {
        const tile = onBoard && hit.closest('.strip-item[data-t="src"]');
        if (tile) {
          this.placeholder.remove();
          tile.classList.add('strip-not-target');
          this.notTarget = tile;
          drag.target = { toggleNot: tile.dataset.id };
          drag.ghost.classList.remove('trash');
          return;
        }
      }

      let lane = onBoard ? hit.closest('.strip-lane') : null;
      if (!lane) lane = this.board.querySelector('.strip-lane[data-lane="root"]');
      if (!lane || this.inMoving(lane)) return this.noDrop(false);
      drag.ghost.classList.remove('trash');
      const moving = drag.srcEls || [drag.srcEl];
      const kids = [...lane.children].filter((c) => c.classList.contains('strip-item') && !moving.includes(c));
      let index = kids.length;
      for (let i = 0; i < kids.length; i++) {
        const r = kids[i].getBoundingClientRect();
        if (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) {
          index = i;
          break;
        }
      }
      // the list index skips the dragged element (it is removed before insertion)
      this.showMarker(lane, kids, index);
      lane.classList.add('strip-lane-hot');
      for (const l of this.board.querySelectorAll('.strip-lane-hot')) if (l !== lane) l.classList.remove('strip-lane-hot');
      drag.target = { key: lane.dataset.lane, index };
    }

    // insertion marker: absolutely positioned over the board so it never reflows the wrapping
    // rows (a reflow could move the very spot under the pointer and make the drop flicker)
    showMarker(lane, kids, index) {
      const b = this.board.getBoundingClientRect();
      const ox = b.left + this.board.clientLeft;
      const oy = b.top + this.board.clientTop;
      let x, top, h;
      if (kids[index]) {
        const r = kids[index].getBoundingClientRect();
        x = r.left - 5;
        top = r.top;
        h = r.height;
      } else if (kids.length) {
        const r = kids[kids.length - 1].getBoundingClientRect();
        x = r.right + 1;
        top = r.top;
        h = r.height;
      } else {
        const r = lane.getBoundingClientRect();
        x = r.left + 4;
        top = r.top + 4;
        h = Math.max(24, r.height - 8);
      }
      const s = this.placeholder.style;
      s.left = x - ox + 'px';
      s.top = top - oy + 'px';
      s.height = h + 'px';
      if (this.placeholder.parentNode !== this.board) this.board.appendChild(this.placeholder);
    }

    clearDropUi() {
      this.placeholder.remove();
      if (this.notTarget) this.notTarget.classList.remove('strip-not-target');
      this.notTarget = null;
      for (const l of this.board.querySelectorAll('.strip-lane-hot')) l.classList.remove('strip-lane-hot');
    }

    finishDrag(d, cancelled) {
      this.clearDropUi();
      if (cancelled) return;
      if (!d.started) {
        if (d.kind === 'new') this.trayClick(d);
        else if (d.kind === 'move') {
          if (d.mod) return this.selectClick(d.id, d.mod); // shift/ctrl-clicks select, never open pickers
          if (d.touch && this.sel.size) return this.selectClick(d.id, 'toggle'); // touch: tapping extends a selection
          this.clearSelection();
          this.selAnchor = d.id; // a later shift-click selects the run from here
          this.tileClick(d.id, d.srcEl);
        }
        return;
      }
      if (d.ids) return this.finishGroup(d);
      if (!d.target) {
        if (d.kind === 'move') this.remove(d.id);
        return;
      }
      if (d.target.cancel) return; // dropped on itself / back on the tray: nothing changes
      if (d.target.toggleNot) {
        const f = find(this.strip, d.target.toggleNot);
        if (!f) return;
        f.item.not = !f.item.not;
        sfx('place');
        this.refreshItem(f.item.id);
        this.changed('param');
        return;
      }
      let item;
      if (d.kind === 'move') {
        const f = find(this.strip, d.id);
        if (!f) return;
        item = f.list.splice(f.index, 1)[0];
      } else item = d.make();
      const list = this.laneList(d.target.key);
      if (!list) return;
      list.splice(Math.min(d.target.index, list.length), 0, item);
      sfx('place');
      this.structural();
      if (d.kind === 'new' && item.t === 'lit') {
        const node = this.board.querySelector(`.strip-item[data-id="${cssId(item.id)}"]`);
        if (node) this.literalPicker(node, item);
      }
    }

    // move (or scrap) every selected item together, kept in their original strip order
    finishGroup(d) {
      if (!d.target) return this.deleteSelection();
      if (d.target.cancel || d.target.toggleNot) return;
      const items = [];
      for (const id of d.ids) {
        const f = find(this.strip, id);
        if (f) items.push(f.list.splice(f.index, 1)[0]);
      }
      const list = this.laneList(d.target.key);
      if (!list || !items.length) return; // cannot happen (drops inside a moved container are cancelled)
      list.splice(Math.min(d.target.index, list.length), 0, ...items);
      sfx('place');
      this.structural();
    }

    trayClick(d) {
      if (d.tool === 'LITERAL') {
        const key = 'tray-lit';
        if (popOpenFor(key)) return closePopover();
        openPopover(d.anchor, key, (p) => {
          p.appendChild(el('div', 'pop-title', 'Stamp a marker'));
          const grid = el('div', 'pop-grid');
          for (const ch of this.markers()) {
            const t = btn('pop-tile', esc(ch));
            t.addEventListener('click', () => {
              closePopover();
              this.strip.push(newItem('lit', { c: ch }, this.tpl()));
              sfx('place');
              this.structural();
            });
            grid.appendChild(t);
          }
          p.appendChild(grid);
        });
        return;
      }
      this.strip.push(d.make());
      sfx('place');
      this.structural();
    }

    tileClick(id, node) {
      const f = find(this.strip, id);
      if (!f || !node) return;
      const it = f.item;
      if (it.t === 'lit') this.literalPicker(node, it);
      else if (it.t === 'src') this.varPicker(node, it);
      else if (it.t === 'par') this.coverPicker(node, it);
      else if (it.t === 'chk') this.chkEditor(node, it);
      else if (it.t === 'seal') this.sealEditor(node, it);
      else if (it.t === 'crc') this.crcEditor(node, it);
    }

    literalPicker(node, it) {
      const key = it.id + ':c';
      if (popOpenFor(key)) return closePopover();
      openPopover(node, key, (p) => {
        p.appendChild(el('div', 'pop-title', 'Marker'));
        const grid = el('div', 'pop-grid');
        for (const ch of this.markers()) {
          const t = btn('pop-tile' + (it.c === ch ? ' on' : ''), esc(ch));
          t.addEventListener('click', () => {
            closePopover();
            if (it.c === ch) return;
            it.c = ch;
            sfx('click');
            this.refreshItem(it.id);
            this.changed('param');
          });
          grid.appendChild(t);
        }
        p.appendChild(grid);
      });
    }

    toggleNot(it) {
      it.not = !it.not;
      sfx('click');
      this.refreshItem(it.id);
      this.changed('param');
    }

    varPicker(node, it, prop = 'v', after) {
      const tpl = this.tpl();
      const isSrc = prop === 'v' && it.t === 'src';
      const canFlip = isSrc && (this.tools().has('NOT') || it.not);
      const pickVar = !isSrc || tpl.vars.length > 1;
      if (!pickVar && !canFlip) return;
      const key = it.id + ':' + prop;
      if (popOpenFor(key)) return closePopover();
      openPopover(node, key, (p) => {
        if (pickVar) {
          p.appendChild(el('div', 'pop-title', 'Which symbol'));
          const grid = el('div', 'pop-grid strip-pop-vars');
          tpl.vars.forEach((x, i) => {
            const t = btn('pop-tile' + (it[prop] === i ? ' on' : ''), varCell(tpl, i));
            t.title = `${x.sym} ∈ {${[...x.set].join(',')}}`;
            t.addEventListener('click', () => {
              closePopover();
              if (it[prop] === i) return;
              it[prop] = i;
              if (after) after(i);
              sfx('click');
              this.refreshItem(it.id);
              this.changed('param');
            });
            grid.appendChild(t);
          });
          p.appendChild(grid);
        }
        if (canFlip) {
          const f = btn('strip-pop-all strip-pop-not' + (it.not ? ' on' : ''), it.not ? '¬ Flipped — undo' : '¬ Flip to partner symbol');
          f.addEventListener('click', () => {
            closePopover();
            this.toggleNot(it);
          });
          p.appendChild(f);
        }
      });
    }

    coverPicker(node, it) {
      const tpl = this.tpl();
      const key = it.id + ':vars';
      if (popOpenFor(key)) return closePopover();
      openPopover(node, key, (p) => {
        multiPicker(p, {
          title: it.t === 'par' ? 'Parity covers' : 'Check digit covers',
          cls: 'strip-pop-vars',
          options: tpl.vars.map((x, i) => ({ key: i, html: varCell(tpl, i), title: `${x.sym} ∈ {${[...x.set].join(',')}}` })),
          selected: it.vars,
          commit: (list) => {
            const next = [...list].sort((a, b) => a - b);
            if (next.join() === it.vars.join()) return;
            it.vars = next;
            this.refreshItem(it.id);
            this.changed('param');
          },
        });
      });
    }

    setPicker(node, it) {
      const tpl = this.tpl();
      const x = tpl.vars[it.v];
      if (!x) return;
      const key = it.id + ':set';
      if (popOpenFor(key)) return closePopover();
      openPopover(node, key, (p) => {
        toggleGrid(
          p,
          `${x.sym} is one of…`,
          [...x.set].map((c) => ({ key: c, html: esc(c) })),
          (c) => it.set.includes(c),
          (c) => {
            const cur = new Set(it.set);
            cur.has(c) ? cur.delete(c) : cur.add(c);
            it.set = [...x.set].filter((ch) => cur.has(ch)).join('');
            const head = this.board.querySelector(`.strip-item[data-id="${cssId(it.id)}"] .strip-if-set`);
            if (head) this.paintSet(head, it);
            this.changed('param');
            return cur.has(c);
          }
        );
      });
    }

    // ---- check dials and the check-matrix seal
    // the preview's sample order (the same one the "Sample order" caption shows): { msg, vals per variable }
    sample() {
      try {
        const lv = this.opts.getLevel();
        const msg = CoC.engine.encoderPreview(lv, []).msg;
        return { msg, vals: CoC.engine.valuesOf(lv, msg) };
      } catch (_) {
        return null;
      }
    }

    modRow(it, onSet, min = MOD_MIN) {
      const row = el('div', 'ed-mod');
      row.appendChild(el('span', 'ed-label', 'Modulus'));
      row.appendChild(stepper(it.mod, Math.min(min, it.mod), MOD_MAX, String, onSet, 'Divide by this and keep the remainder'));
      row.appendChild(el('span', 'ed-hint', `remainders 0…${it.mod - 1}${it.mod === 11 ? ' (10 is written X)' : ''}`));
      return row;
    }

    // issued stamps only (locked ones are not shown at all)
    stampRow(tools, apply, label = 'Stamps') {
      const have = Object.keys(STAMPS).filter((k) => tools.has(k));
      if (!have.length) return null;
      const row = el('div', 'ed-stamps');
      if (label) row.appendChild(el('span', 'ed-label', label));
      for (const k of have) {
        const b = btn('ed-stamp', STAMPS[k].label, STAMPS[k].title);
        b.addEventListener('click', () => {
          sfx('place');
          apply(STAMPS[k].f);
        });
        row.appendChild(b);
      }
      return row;
    }

    sampleHead(tpl, smp, extra = '') {
      return `<div class="ar-head"><span>Sample order</span>${tpl.vars.map((_, v) => digCell(tpl, v, smp.vals[v])).join('')}${extra}</div>`;
    }

    chkArith(it, tpl) {
      const smp = this.sample();
      if (!smp) return '';
      const terms = [];
      let sum = 0;
      it.w.forEach((w, v) => {
        if (!w) return;
        sum += w * symVal(smp.vals[v]);
        terms.push(`<span class="ar-term">${w}·${digCell(tpl, v, smp.vals[v])}</span>`);
      });
      const head = this.sampleHead(tpl, smp);
      if (!terms.length) return head + '<div class="ar-line dim">Every weight is 0: the tile covers nothing and always sends 0.</div>';
      const m = it.mod;
      const r = modm(sum, m);
      return (
        head +
        `<div class="ar-line">${terms.join('<span class="ar-op">+</span>')}<span class="ar-op">=</span><b>${sum}</b></div>` +
        `<div class="ar-line">${sum} mod ${m} = <b>${r}</b> <small>(${sum} = ${Math.floor(sum / m)}×${m} + ${r})</small></div>` +
        `<div class="ar-line ar-send">sends ${sealCell(-1, valSym(r))}${r === 10 ? ' <small>(10 is written X)</small>' : ''}</div>`
      );
    }

    chkEditor(node, it) {
      const key = it.id + ':chk';
      if (popOpenFor(key)) return closePopover();
      const tpl = this.tpl();
      const tools = this.tools();
      const commit = () => {
        this.refreshItem(it.id);
        this.changed('param');
      };
      openPopover(
        node,
        key,
        (p) => {
          const draw = () => {
            normaliseItem(it, tpl.vars.length);
            p.innerHTML = '';
            p.appendChild(el('div', 'pop-title', 'Check digit'));
            p.appendChild(el('p', 'ed-intro', 'Multiply each digit by its weight, add everything up, then divide by the modulus and keep the remainder. That remainder is the check symbol.'));
            p.appendChild(
              this.modRow(it, (m) => {
                it.mod = m;
                it.w = it.w.map((w) => modm(w, m));
                commit();
                draw();
              })
            );
            p.appendChild(el('div', 'ed-label', 'Weight dials <small>0 leaves a symbol out</small>'));
            const box = el('div', 'ed-dials');
            const ar = el('div', 'ed-arith');
            const sync = () => (ar.innerHTML = this.chkArith(it, tpl));
            tpl.vars.forEach((x, v) => {
              const col = el('div', 'ed-dial' + (it.w[v] ? '' : ' off'));
              col.innerHTML = varCell(tpl, v);
              col.appendChild(
                dial(
                  it.w[v],
                  it.mod,
                  (w) => {
                    it.w[v] = w;
                    col.classList.toggle('off', !w);
                    commit();
                    sync();
                  },
                  `Weight on ${x.sym} — click, scroll or type a digit`
                )
              );
              box.appendChild(col);
            });
            p.appendChild(box);
            const st = this.stampRow(tools, (f) => {
              it.w = it.w.map((_, v) => modm(f(v + 1), it.mod));
              commit();
              draw();
            });
            if (st) p.appendChild(st);
            p.appendChild(ar);
            sync();
            placePopover();
          };
          draw();
        },
        { editor: true }
      );
    }

    miniMatrix(it, k) {
      const r = it.rows.length;
      const g = el('div', 'strip-mini');
      g.style.setProperty('--cols', Math.max(1, k + r));
      g.innerHTML =
        it.rows
          .slice(0, 4)
          .map((row) => row.map((x, j) => `<i class="${j >= k ? 's' : ''}${x ? '' : ' z'}">${x}</i>`).join(''))
          .join('') + (r > 4 ? `<em>+${r - 4} row${r - 4 === 1 ? '' : 's'}</em>` : '');
      return g;
    }

    sealArith(it, tpl, k) {
      const smp = this.sample();
      if (!smp) return '';
      const r = it.rows.length;
      const m = it.mod;
      if (!r) return '<div class="ar-line dim">No rows: the seal adds nothing.</div>';
      const jam = sealJam(it.rows, m, k);
      if (jam >= 0) {
        const col = it.rows.map((row) => modm(row[k + jam], m));
        const seals = it.rows.flatMap((row) => row.slice(k).map((x) => modm(x, m)));
        let why;
        if (col.every((x) => !x)) why = `No row puts any weight on S${jam + 1}, so nothing decides what it should be. Give it a weight in some row.`;
        else if (seals.some((x) => x && !invm(x, m)))
          why = `Look only at the seal columns: the rows there must be independent. And mod ${m} is not prime — a weight that shares a factor with ${m} cannot be divided back out.`;
        else why = 'Look only at the seal columns: there, no row may be a multiple (or a mix) of the others — each seal digit needs a row of its own.';
        return this.sampleHead(tpl, smp) + `<div class="ar-jam"><b>JAMMED — rows don't pin S${jam + 1}.</b> ${why}</div>`;
      }
      let seal;
      try {
        seal = CoC.engine.solveSeal(it.rows, m, smp.vals);
      } catch (e) {
        return `<div class="ar-jam"><b>JAMMED.</b> ${esc(e.message)}</div>`;
      }
      let html = this.sampleHead(tpl, smp, `<span class="ar-arrow">→ seal</span>${[...seal].map((d, c) => `<span class="ar-sname">S${c + 1}</span>${sealCell(c, d)}`).join('')}`);
      it.rows.forEach((row, ri) => {
        let sum = 0;
        const terms = [];
        row.forEach((w, j) => {
          if (!w) return;
          const ch = j < k ? smp.vals[j] : seal[j - k];
          sum += w * symVal(ch);
          terms.push(`<span class="ar-term">${w}·${j < k ? digCell(tpl, j, ch) : sealCell(j - k, ch)}</span>`);
        });
        html +=
          `<div class="ar-line"><span class="ar-row">row ${ri + 1}</span>${terms.join('<span class="ar-op">+</span>') || '0'}<span class="ar-op">=</span><b>${sum}</b>` +
          `<span class="ar-ok">≡ 0 (mod ${m}) ✓</span>${sum ? ` <small>(${sum} = ${sum / m}×${m})</small>` : ''}</div>`;
      });
      return html;
    }

    sealEditor(node, it) {
      const key = it.id + ':seal';
      if (popOpenFor(key)) return closePopover();
      const tpl = this.tpl();
      const k = tpl.vars.length;
      const tools = this.tools();
      let act = null; // the matrix cell the keypad writes into: { r, c }
      const commit = () => {
        this.refreshItem(it.id);
        this.changed('param');
      };
      const colName = (c) => (c < k ? (tpl.vars[c] ? tpl.vars[c].sym : '?') : 'S' + (c - k + 1));
      openPopover(
        node,
        key,
        (p) => {
          let draw;
          const setCell = (v, advance) => {
            if (!act) return;
            it.rows[act.r][act.c] = modm(v, it.mod);
            sfx('click');
            if (advance) {
              const w = it.rows[0].length;
              if (act.c + 1 < w) act = { r: act.r, c: act.c + 1 };
              else if (act.r + 1 < it.rows.length) act = { r: act.r + 1, c: 0 };
            }
            commit();
            draw(true);
          };
          draw = (focus) => {
            normaliseItem(it, k);
            const r = it.rows.length;
            const m = it.mod;
            if (act && (act.r >= r || act.c >= k + r)) act = null;
            const scroll = p.querySelector('.ed-matrix-wrap');
            const sx = scroll ? scroll.scrollLeft : 0;
            p.innerHTML = '';
            p.appendChild(el('div', 'pop-title', 'Check-matrix seal'));
            p.appendChild(
              el(
                'p',
                'ed-intro',
                `Each row is one check equation: Σ weight × symbol ≡ 0 (mod ${m}). HQ picks the seal digit${r === 1 ? '' : 's'} ${r === 1 ? 'S1' : r === 2 ? 'S1 and S2' : `S1…S${r}`} so that every row comes true.`
              )
            );
            p.appendChild(
              this.modRow(it, (mm) => {
                it.mod = mm;
                it.rows = it.rows.map((row) => row.map((x) => modm(x, mm)));
                commit();
                draw();
              }, SEAL_MOD_MIN)
            );

            // the matrix: order symbols, then the seal digits; one row per check equation
            const wrap = el('div', 'ed-matrix-wrap');
            const tbl = el('table', 'ed-matrix');
            let h = '<thead><tr><th></th>' + tpl.vars.map((_, v) => `<th>${varCell(tpl, v)}</th>`).join('');
            for (let c = 0; c < r; c++) h += `<th class="s${c === 0 ? ' first' : ''}">${sealCell(c)}</th>`;
            h += '<th></th></tr></thead><tbody>';
            it.rows.forEach((row, ri) => {
              h += `<tr><th class="ed-rowname">row ${ri + 1}</th>`;
              row.forEach((x, c) => {
                const on = act && act.r === ri && act.c === c;
                h +=
                  `<td class="${c >= k ? 's' : ''}${c === k ? ' first' : ''}"><button type="button" class="ed-cell${x ? '' : ' z'}${on ? ' act' : ''}" data-r="${ri}" data-c="${c}"` +
                  ` aria-label="row ${ri + 1}, ${esc(colName(c))}: weight ${x}">${x}</button></td>`;
              });
              h += '<td class="ed-rowtools"></td></tr>';
            });
            tbl.innerHTML = h + '</tbody>';
            tbl.querySelectorAll('tbody tr').forEach((tr, ri) => {
              const cell = tr.querySelector('.ed-rowtools');
              const st = this.stampRow(
                tools,
                (f) => {
                  it.rows[ri] = it.rows[ri].map((_, j) => modm(f(j + 1), it.mod));
                  commit();
                  draw();
                },
                ''
              );
              if (st) cell.appendChild(st);
              const del = btn('ed-rowdel', '✕', `Remove row ${ri + 1} (and seal digit S${ri + 1})`);
              del.disabled = r <= 1;
              del.addEventListener('click', () => {
                it.rows.splice(ri, 1);
                for (const row of it.rows) row.splice(k + ri, 1);
                act = null;
                sfx('remove');
                commit();
                draw();
              });
              cell.appendChild(del);
            });
            tbl.addEventListener('click', (e) => {
              const b = e.target.closest('.ed-cell');
              if (!b) return;
              act = { r: +b.dataset.r, c: +b.dataset.c };
              sfx('click');
              draw(true);
            });
            wrap.appendChild(tbl);
            p.appendChild(wrap);
            wrap.scrollLeft = sx;

            // keypad for the chosen cell
            const pad = el('div', 'ed-pad');
            if (act) {
              pad.appendChild(el('span', 'ed-label', `Row ${act.r + 1} · ${esc(colName(act.c))}`));
              const keys = el('div', 'ed-keys');
              for (let v = 0; v < m; v++) {
                const b = btn('ed-key' + (it.rows[act.r][act.c] === v ? ' on' : ''), String(v));
                b.addEventListener('click', () => setCell(v, true));
                keys.appendChild(b);
              }
              pad.appendChild(keys);
            } else pad.appendChild(el('span', 'ed-hint', `Pick a cell, then its weight — or type digits${m > 10 ? ' (x = 10)' : ''}; arrows move.`));
            p.appendChild(pad);

            const acts = el('div', 'ed-actions');
            const add = btn('ed-btn', '+ Add a row <small>(one more seal digit)</small>');
            add.disabled = r >= SEAL_MAX_ROWS;
            add.addEventListener('click', () => {
              for (const row of it.rows) row.push(0);
              it.rows.push(new Array(k + r + 1).fill(0));
              sfx('place');
              commit();
              draw();
            });
            acts.appendChild(add);
            if (tools.has('FILL_POW')) {
              const pw = btn('ed-btn ed-stamp', 'Stamp power rows <small>i⁰ · i¹ · i² …</small>', 'Row r gives column #i the weight i^(r−1), counting every column 1…' + (k + r));
              pw.addEventListener('click', () => {
                it.rows = it.rows.map((row, e) => row.map((_, j) => powm(j + 1, e, it.mod)));
                sfx('place');
                commit();
                draw();
              });
              acts.appendChild(pw);
            }
            p.appendChild(acts);

            const ar = el('div', 'ed-arith');
            ar.innerHTML = this.sealArith(it, tpl, k);
            p.appendChild(ar);
            placePopover();
            if (focus && act) {
              const b = p.querySelector(`.ed-cell[data-r="${act.r}"][data-c="${act.c}"]`);
              if (b) {
                b.focus({ preventScroll: true });
                revealInScroller(b);
              }
            }
          };
          p.addEventListener('keydown', (e) => {
            if (!act || e.ctrlKey || e.metaKey || e.altKey) return;
            const w = it.rows[0] ? it.rows[0].length : 0;
            const mv = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
            if (mv) {
              act = { r: Math.max(0, Math.min(it.rows.length - 1, act.r + mv[0])), c: Math.max(0, Math.min(w - 1, act.c + mv[1])) };
              draw(true);
            } else if (/^[0-9]$/.test(e.key) && +e.key < it.mod) setCell(+e.key, true);
            else if ((e.key === 'x' || e.key === 'X') && it.mod > 10) setCell(10, true);
            else if (e.key === 'Backspace' || e.key === 'Delete') setCell(0, false);
            else if (e.key === '+' || e.key === '=') setCell(it.rows[act.r][act.c] + 1, false);
            else if (e.key === '-') setCell(it.rows[act.r][act.c] - 1, false);
            else return;
            e.preventDefault();
            e.stopPropagation();
          });
          draw();
        },
        { editor: true }
      );
    }

    // ---- the shift register (CRC)
    // What the sample order's tape holds just before this tile, and the whole transmission (null: inside a group)
    crcSample(it) {
      try {
        const lv = this.opts.getLevel();
        const pv = CoC.engine.encoderPreview(lv, this.strip);
        if (pv.error || !pv.steps) return null;
        const st = pv.steps.find((s) => s.id === it.id);
        if (!st) return { nested: true, out: pv.out };
        return { before: st.after.slice(0, st.after.length - st.piece.length), piece: st.piece, out: pv.out };
      } catch (_) {
        return null;
      }
    }

    // long division on paper: (tape · xʳ) ÷ g, one XOR row under every leading 1
    crcDivision(g, before) {
      const r = g.length - 1;
      const bits = [...before].filter((c) => c === '0' || c === '1').join('');
      if (!bits) return '<div class="ar-line dim">No lamps on the tape before this tile yet — the register stays dark and stamps ' + '0'.repeat(r) + '.</div>';
      const L = bits.length + r;
      const cur = [...bits + '0'.repeat(r)].map(Number);
      const gs = g.join('');
      const row = (label, cells, cls = '') => `<div class="crc-row ${cls}"><span class="crc-lab">${label}</span><span class="crc-bits">${cells}</span></div>`;
      const cell = (c, cls = '') => `<i${cls ? ` class="${cls}"` : ''}>${c}</i>`;
      const blank = (n) => cell(' ', 'b').repeat(n);
      let html = row('tape·' + xPow(r), [...bits].map((c) => cell(c)).join('') + cell('0', 'z').repeat(r), 'crc-top');
      let steps = 0;
      for (let i = 0; i + r < L; i++) {
        if (!cur[i]) continue;
        steps++;
        html += row('⊕ g', blank(i) + [...gs].map((c) => cell(c, 'g')).join('') + blank(L - i - r - 1), 'crc-sub');
        for (let j = 0; j <= r; j++) cur[i + j] ^= g[j];
        const last = !cur.slice(i + 1, L - r).some(Boolean);
        html += row('', blank(i + 1) + cur.slice(i + 1).map((c, j) => cell(c, i + 1 + j >= L - r ? (last ? 'rem' : '') : '')).join(''), last ? 'crc-last' : '');
      }
      if (!steps) html += row('', blank(L - r) + cur.slice(L - r).map((c) => cell(c, 'rem')).join(''), 'crc-last');
      const rem = cur.slice(L - r).join('');
      return (
        `<div class="crc-div" style="--n:${L}">${html}</div>` +
        `<div class="ar-line ar-send">remainder <b>${rem}</b> → stamped on the tape after ${esc(bits)}: <b>${esc(bits)}${rem}</b> divides exactly by g(x)</div>`
      );
    }

    crcEditor(node, it) {
      const key = it.id + ':crc';
      if (popOpenFor(key)) return closePopover();
      const commit = () => {
        this.refreshItem(it.id);
        this.changed('param');
      };
      openPopover(
        node,
        key,
        (p) => {
          const draw = () => {
            it.g = fitCrc(it.g);
            const g = it.g;
            const r = g.length - 1;
            p.innerHTML = '';
            p.appendChild(el('div', 'pop-title', 'Shift register (CRC)'));
            p.appendChild(
              el('p', 'ed-intro', 'Read the lamps already on the tape as a polynomial — the first lamp is the highest power. The register divides it (shifted r places: times x<sup>r</sup>) by g(x); the r lamps left in it, the remainder, are stamped on. Wire g(x) with the tap switches.')
            );
            const lenRow = el('div', 'ed-mod');
            lenRow.appendChild(el('span', 'ed-label', 'Register lamps r'));
            lenRow.appendChild(
              stepper(r, 1, CRC_MAX, String, (v) => {
                it.g = resizeCrc(it.g, v);
                commit();
                draw();
              }, 'How many lamps the register holds = the degree of g(x) = lamps stamped on')
            );
            lenRow.appendChild(el('span', 'ed-hint', `stamps ${r} lamp${r === 1 ? '' : 's'}`));
            p.appendChild(lenRow);

            p.appendChild(el('div', 'ed-label', 'Taps <small>switch a power of x into g(x)</small>'));
            const taps = el('div', 'crc-taps');
            g.forEach((c, i) => {
              const pw = r - i;
              const b = btn('crc-tap' + (c ? ' on' : '') + (i === 0 ? ' fixed' : ''), `<span class="crc-lamp"></span><span class="crc-pow">${xPow(pw)}</span>`, i === 0 ? `x${sup(r)} is always wired: it sets the register's length` : `${c ? 'Unwire' : 'Wire'} ${xPow(pw)}`);
              b.setAttribute('aria-pressed', c ? 'true' : 'false');
              b.dataset.pow = pw;
              if (i === 0) b.disabled = true;
              else
                b.addEventListener('click', () => {
                  it.g[i] = it.g[i] ? 0 : 1;
                  sfx('click');
                  commit();
                  draw();
                });
              taps.appendChild(b);
            });
            p.appendChild(taps);

            const period = CoC.engine.crcPeriod(g);
            const smp = this.crcSample(it);
            const info = el('div', 'crc-info');
            info.innerHTML =
              `<div class="crc-poly">g(x) = <b>${polyText(g)}</b> <small>${g.join('')}</small></div>` +
              (period
                ? `<div class="crc-period">Period <b>${period}</b>: g(x) divides x${sup(period)} + 1 — the remainders of 1, x, x², … repeat every ${period} lamps.</div>`
                : '<div class="crc-period warn">No “+ 1”: g(x) is x × something. It never divides xⁿ + 1, and the register’s last lamp is dead weight.</div>') +
              (smp && smp.out ? `<div class="crc-period">This strip sends <b>${smp.out.length}</b> symbol${smp.out.length === 1 ? '' : 's'} per order.</div>` : '');
            p.appendChild(info);

            const ar = el('div', 'ed-arith');
            if (smp && !smp.nested) {
              const pv = CoC.engine.encoderPreview(this.opts.getLevel(), []);
              ar.innerHTML = `<div class="ar-head"><span>Sample order</span>${esc(pv.msg)}</div>` + this.crcDivision(g, smp.before);
            } else if (smp && smp.nested) ar.innerHTML = '<div class="ar-line dim">Inside a group: watch it work on TEST TRANSMISSION.</div>';
            p.appendChild(ar);
            placePopover();
          };
          draw();
        },
        { editor: true }
      );
    }

    paintSet(b, it) {
      b.textContent = it.set ? '{' + [...it.set].join(',') + '}' : 'choose…';
      b.classList.toggle('unset', !it.set);
    }

    // ---- rendering
    render() {
      closePopover();
      this.renderTray();
      this.renderBoard();
    }

    renderTray() {
      const tpl = this.tpl();
      const allowed = this.tools();
      const fresh = this.opts.newTools ? this.opts.newTools() : new Set();
      hideTip();
      this.tray.innerHTML = '';

      const srcRow = el('div', 'strip-tray-row');
      srcRow.appendChild(el('div', 'strip-tray-tag', 'Sources'));
      const srcItems = el('div', 'strip-tray-items');
      tpl.vars.forEach((x, i) => {
        const b = btn('strip-tray-item strip-tray-src', varCell(tpl, i));
        b.dataset.tip = `Copy of the ${x.sym} symbol (one of ${[...x.set].join(', ')}).\nDrag onto the strip, or click to add at the end.`;
        b.setAttribute('aria-label', `Source ${x.sym}`);
        b.addEventListener('pointerdown', (e) =>
          startDrag(e, this, { kind: 'new', tool: 'SRC', label: varCell(tpl, i), make: () => newItem('src', { v: i }, tpl), anchor: b }, null)
        );
        srcItems.appendChild(b);
      });
      const lit = btn('strip-tray-item strip-tray-lit', `${litCell('[')}<span class="strip-tray-name">Literal</span>`);
      lit.dataset.pop = '1';
      lit.dataset.tip = 'A fixed marker character (or a digit 1–9 for sequence tags).\nExample: [ ■▲ ]  frames the order.';
      lit.addEventListener('pointerdown', (e) =>
        startDrag(e, this, { kind: 'new', tool: 'LITERAL', label: litCell('['), make: () => newItem('lit', { c: this.markers()[0] || '[' }, tpl), anchor: lit }, null)
      );
      srcItems.appendChild(lit);
      srcRow.appendChild(srcItems);
      this.tray.appendChild(srcRow);

      const open = TOOL_ORDER.filter((n) => allowed.has(n));
      const locked = TOOL_ORDER.filter((n) => !allowed.has(n));
      let lockItems = srcItems; // no tools yet: the locked chip trails the sources
      if (open.length) {
        const toolRow = el('div', 'strip-tray-row');
        toolRow.appendChild(el('div', 'strip-tray-tag', 'Tools'));
        const toolItems = el('div', 'strip-tray-items');
        for (const name of open) {
          const T = TOOLS[name];
          const b = btn(
            `strip-tray-item strip-tool strip-tool-${name.toLowerCase()}`,
            `<span class="strip-tool-icon">${T.icon}</span><span class="strip-tray-name">${T.name}</span>` +
              (fresh.has(name) ? '<em class="strip-new">NEW</em>' : '')
          );
          b.dataset.tip = `${T.desc}\n${T.example}`;
          b.setAttribute('aria-label', `${T.name} tool`);
          b.addEventListener('pointerdown', (e) =>
            startDrag(
              e,
              this,
              {
                kind: 'new',
                tool: name,
                label: `<span class="strip-tool-icon">${T.icon}</span> ${T.name}`,
                make: () => (T.t ? newItem(T.t, null, this.tpl()) : newItem('src', { v: 0, not: true }, this.tpl())),
                anchor: b,
              },
              null
            )
          );
          toolItems.appendChild(b);
        }
        toolRow.appendChild(toolItems);
        this.tray.appendChild(toolRow);
        lockItems = toolItems;
      }

      if (locked.length) {
        const n = locked.length;
        const chip = btn(
          'strip-locked-chip' + (this.lockedOpen ? ' open' : ''),
          `${LOCK_SVG}<span>${n} more tool${n > 1 ? 's' : ''} unlock${n > 1 ? '' : 's'} later</span>`
        );
        chip.setAttribute('aria-expanded', this.lockedOpen ? 'true' : 'false');
        chip.dataset.tip = `Locked for now: ${locked.map((k) => TOOLS[k].name).join(', ')}.\nThey join the tray as the campaign goes on.`;
        chip.addEventListener('click', () => {
          this.lockedOpen = !this.lockedOpen;
          hideTip();
          sfx('click');
          this.renderTray();
        });
        lockItems.appendChild(chip);
        if (this.lockedOpen) {
          for (const k of locked) {
            const g = el('span', 'strip-locked-name', `<span class="strip-tool-icon">${TOOLS[k].icon}</span>${TOOLS[k].name}`);
            g.setAttribute('aria-disabled', 'true');
            lockItems.appendChild(g);
          }
        }
      }
    }

    renderBoard() {
      // legacy check / seal items become dials and matrices; widths follow the order's variables
      const k = this.tpl().vars.length;
      for (const it of this.strip) normaliseItem(it, k);
      this.pruneSelection();
      this.board.innerHTML = '';
      const rail = el('div', 'strip-rail');
      const lane = this.renderLane(this.strip, 'root', 'strip-root');
      if (!this.strip.length) lane.appendChild(el('div', 'strip-empty', 'Drag tiles here to build the transmission'));
      rail.appendChild(lane);
      this.board.appendChild(rail);
      if (this.board.querySelectorAll('.strip-item').length >= 2) this.board.appendChild(el('div', 'sel-hint', esc(CoC.editorUtil.selHintText())));
      this.paintSelection();
    }

    renderLane(list, key, cls, emptyText) {
      const lane = el('div', 'strip-lane' + (cls ? ' ' + cls : ''));
      lane.dataset.lane = key;
      for (const it of list) lane.appendChild(this.renderItem(it));
      if (!list.length && emptyText) lane.appendChild(el('div', 'strip-lane-empty', emptyText));
      return lane;
    }

    renderItem(it) {
      const tpl = this.tpl();
      const tools = this.tools();
      const node = el('div', `strip-item strip-${it.t}`);
      node.dataset.id = it.id;
      node.dataset.t = it.t;
      const change = (kind = 'param') => this.changed(kind);
      let label = '';

      switch (it.t) {
        case 'src': {
          node.dataset.pop = '1';
          node.innerHTML = varCell(tpl, it.v);
          label = varCell(tpl, it.v);
          if (it.not) node.classList.add('negated');
          if (it.not || tools.has('NOT')) {
            const n = btn('strip-ctl strip-not' + (it.not ? ' on' : ''), '¬', it.not ? 'Flipped to the partner symbol — click to undo' : 'Flip to the partner symbol');
            n.setAttribute('aria-pressed', it.not ? 'true' : 'false');
            if (!tools.has('NOT')) n.disabled = true;
            n.addEventListener('click', () => this.toggleNot(it));
            node.appendChild(n);
          }
          const x = tpl.vars[it.v];
          const how = tpl.vars.length > 1 ? ' — click to change' : tools.has('NOT') ? ' — click to flip' : '';
          node.title = x ? `${it.not ? 'Partner of ' : 'Copy of '}${x.sym}${how}` : 'Unknown symbol';
          break;
        }
        case 'lit':
          node.dataset.pop = '1';
          node.innerHTML = litCell(it.c);
          node.title = 'Fixed marker — click to change';
          label = litCell(it.c);
          break;
        case 'rep': {
          const head = el('div', 'strip-rep-head', '<span class="strip-grip"><i></i><i></i><i></i></span><span class="strip-kw">REPEAT</span>');
          node.appendChild(head);
          node.appendChild(this.renderLane(it.items, `${it.id}:items`, 'strip-rep-body', 'drop tiles to repeat'));
          const tail = el('div', 'strip-rep-tail');
          tail.appendChild(
            stepper(it.n, 2, 7, (v) => `×${v}`, (v) => ((it.n = v), change()), 'How many times the bracket is stamped')
          );
          node.appendChild(tail);
          label = `⟦×${it.n}⟧ REPEAT`;
          break;
        }
        case 'if': {
          const head = el('div', 'strip-if-head');
          head.appendChild(el('span', 'strip-grip', '<i></i><i></i><i></i>'));
          head.appendChild(el('span', 'strip-kw', 'IF'));
          const vb = btn('strip-ctl strip-if-var', varCell(tpl, it.v), 'Which symbol to test');
          vb.addEventListener('click', () =>
            this.varPicker(vb, it, 'v', (i) => {
              it.set = tpl.vars[i] ? tpl.vars[i].set[0] : '';
            })
          );
          head.appendChild(vb);
          head.appendChild(el('span', 'strip-kw strip-kw-soft', 'is'));
          const sb = btn('strip-ctl strip-if-set', '', 'Which values count as YES');
          this.paintSet(sb, it);
          sb.addEventListener('click', () => this.setPicker(sb, it));
          head.appendChild(sb);
          node.appendChild(head);
          const lanes = el('div', 'strip-if-lanes');
          for (const [k, name] of [['then', 'YES'], ['else', 'NO']]) {
            const br = el('div', `strip-if-branch strip-if-${k}`);
            br.appendChild(el('span', 'strip-if-tag', name));
            br.appendChild(this.renderLane(it[k], `${it.id}:${k}`, 'strip-if-lane', 'nothing'));
            lanes.appendChild(br);
          }
          node.appendChild(lanes);
          label = `IF ${varCell(tpl, it.v)}`;
          break;
        }
        case 'par': {
          node.dataset.pop = '1';
          const face = el('div', 'strip-plate-face');
          face.appendChild(el('span', 'strip-plate-sym', 'P'));
          node.appendChild(face);
          const chips = el('div', 'strip-chips' + (it.vars.length ? '' : ' unset'));
          if (it.vars.length) chips.innerHTML = it.vars.map((v) => varCell(tpl, v)).join('');
          else chips.textContent = 'covers…';
          node.appendChild(chips);
          node.title = 'Parity bit — click to choose which symbols it covers';
          label = 'P';
          break;
        }
        case 'chk': {
          node.dataset.pop = '1';
          normaliseItem(it, tpl.vars.length);
          const face = el('div', 'strip-plate-face');
          face.appendChild(el('span', 'strip-plate-sym', 'Σ'));
          node.appendChild(face);
          const wts = el('div', 'strip-wts');
          wts.style.setProperty('--n', Math.max(1, it.w.length));
          wts.innerHTML = it.w
            .map((w, v) => `<span class="strip-wt${w ? '' : ' off'}">${varCell(tpl, v)}<i>${w}</i></span>`)
            .join('');
          node.appendChild(wts);
          const smp = this.sample();
          const out = smp ? valSym(CoC.engine.checkValue(it.w, it.mod, smp.vals)) : '';
          const tail = el('div', 'strip-plate-tail');
          tail.innerHTML = `<span class="strip-mod">mod <b>${it.mod}</b></span>` + (smp ? `<span class="strip-out" title="What it sends for the sample order">→ <b>${esc(out)}</b></span>` : '');
          node.appendChild(tail);
          node.title = `Check digit: Σ weight × digit, mod ${it.mod} — click to set the dials`;
          label = 'Σ';
          break;
        }
        case 'seal': {
          node.dataset.pop = '1';
          normaliseItem(it, tpl.vars.length);
          const k = tpl.vars.length;
          const r = it.rows.length;
          const face = el('div', 'strip-plate-face');
          face.appendChild(el('span', 'strip-plate-sym', 'H'));
          node.appendChild(face);
          node.appendChild(this.miniMatrix(it, k));
          const tail = el('div', 'strip-plate-tail');
          const jam = r ? sealJam(it.rows, it.mod, k) : -1;
          const smp = this.sample();
          let out = '';
          if (jam < 0 && smp && r) {
            try {
              out = CoC.engine.solveSeal(it.rows, it.mod, smp.vals);
            } catch (_) {
              out = '';
            }
          }
          tail.innerHTML =
            `<span class="strip-mod">mod <b>${it.mod}</b></span>` +
            (jam >= 0
              ? `<span class="strip-jam" title="These rows cannot pin down seal digit S${jam + 1}">JAMMED · S${jam + 1}</span>`
              : r
                ? `<span class="strip-out" title="Seal digits for the sample order">→ <b>${esc(out)}</b></span>`
                : '<span class="strip-out">no rows</span>');
          node.appendChild(tail);
          node.classList.toggle('jammed', jam >= 0);
          node.title = jam >= 0 ? `JAMMED — the rows don't pin S${jam + 1}. Click to edit the check matrix.` : `Check-matrix seal: ${r} row${r === 1 ? '' : 's'}, ${r} seal digit${r === 1 ? '' : 's'} — click to edit`;
          label = 'H';
          break;
        }
        case 'crc': {
          node.dataset.pop = '1';
          it.g = fitCrc(it.g);
          const r = it.g.length - 1;
          const face = el('div', 'strip-plate-face');
          face.appendChild(el('span', 'strip-plate-sym', '÷'));
          node.appendChild(face);
          const mid = el('div', 'strip-crc-mid');
          const lamps = el('div', 'strip-crc-taps');
          lamps.innerHTML = it.g.map((c, i) => `<i class="${c ? 'on' : ''}" title="${xPow(r - i)}"></i>`).join('');
          mid.appendChild(lamps);
          mid.appendChild(el('span', 'strip-crc-poly', esc(polyText(it.g))));
          node.appendChild(mid);
          const smp = this.crcSample(it);
          const tail = el('div', 'strip-plate-tail');
          tail.innerHTML =
            `<span class="strip-mod">r = <b>${r}</b></span>` +
            (smp && !smp.nested ? `<span class="strip-out" title="The remainder it stamps for the sample order">→ <b>${esc(smp.piece)}</b></span>` : '');
          node.appendChild(tail);
          node.title = `Shift register: divides the tape so far by g(x) = ${polyText(it.g)} and stamps the ${r}-lamp remainder — click to wire the taps`;
          label = '÷';
          break;
        }
        default:
          break;
      }

      const del = btn('strip-ctl strip-del', '✕', 'Remove');
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        this.remove(it.id);
      });
      node.appendChild(del);

      node._ghost = label;
      if (this.sel.has(it.id)) node.classList.add('selected');
      node.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.strip-item') !== node) return; // a nested tile handles itself
        if (e.target.closest('button, .strip-ctl')) return;
        const lane = e.target.closest('.strip-lane');
        if (lane && node.contains(lane)) return; // empty space inside a container lane
        const mod = CoC.editorUtil.selMode(e);
        if (mod) e.preventDefault(); // no text selection on shift/ctrl-click
        const spec = { kind: 'move', id: it.id, label: `<span class="strip-ghost-tile">${label}</span>`, mod, touch: !!e.pointerType && e.pointerType !== 'mouse' };
        const group = this.sel.has(it.id) ? this.topSelected() : [];
        if (group.length > 1 || (group.length === 1 && group[0] !== it.id)) {
          spec.ids = group;
          spec.srcEls = group.map((id) => this.nodeFor(id)).filter(Boolean);
          const parts = spec.srcEls.slice(0, 4).map((n) => `<span class="strip-ghost-part">${n._ghost || ''}</span>`).join('');
          spec.label = `<span class="strip-ghost-tile">${parts}${group.length > 4 ? '…' : ''}</span><em class="strip-ghost-count">×${group.length}</em>`;
        }
        // touch long-press: flips a source tile (NOT tool, nothing selected) — otherwise toggles the selection
        if (it.t === 'src' && tools.has('NOT') && !this.sel.size) spec.longPress = () => this.toggleNot(it);
        else spec.longPress = () => this.selectClick(it.id, 'toggle');
        startDrag(e, this, spec, node);
      });
      node.addEventListener('contextmenu', (e) => !canHover() && e.preventDefault()); // long-press, not a menu
      return node;
    }

    // ---- live feedback
    clearHighlight() {
      for (const n of this.board.querySelectorAll('.strip-item.active')) n.classList.remove('active');
    }

    highlight(id) {
      this.clearHighlight();
      if (id === undefined || id === null) return;
      const n = this.board.querySelector(`.strip-item[data-id="${cssId(id)}"]`);
      if (!n) return;
      n.classList.add('active');
      revealInScroller(n);
    }
  }

  // ------------------------------------------------------------ field: order assembly
  class AssemblyEditor {
    constructor(opts) {
      this.opts = opts;
      this.root = opts.root;
      this.root.classList.add('asm');
    }

    tpl() {
      return CoC.engine.templateOf(this.opts.getLevel());
    }
    readers() {
      return this.opts.allowedReaders ? this.opts.allowedReaders() : new Set();
    }
    maxPos() {
      return Math.max(1, (this.opts.maxPos && this.opts.maxPos()) || 1);
    }
    changed() {
      if (this.opts.onChange) this.opts.onChange('param');
    }

    // fill missing readers (silently — no onChange). Never clamps stored positions down to the current
    // signal length: a strip that is briefly shorter must not wipe the player's readers. Positions past
    // the end are kept and shown in a warning style instead (see renderReader).
    normalise() {
      const tpl = this.tpl();
      const asm = this.opts.getAsm();
      const max = this.maxPos();
      tpl.vars.forEach((_, v) => {
        let r = asm[v];
        if (!r || (r.t !== 'pos' && r.t !== 'vote')) {
          const first = tpl.cells.findIndex((c) => c.v === v);
          r = asm[v] = { t: 'pos', i: Math.min(max, first + 1 || 1), not: false };
        }
        if (r.t === 'pos') r.i = Math.max(1, r.i | 0 || 1);
        if (r.t === 'vote') r.pos = (r.pos || []).filter((p) => Number.isInteger(p) && p >= 1);
        if (r.not === undefined) r.not = false;
      });
      return asm;
    }

    // warning paint for readers that point past the end of the current signal (kept, never rewritten)
    paintPast(card, r, max) {
      const past = r.t === 'pos' ? (r.i > max ? [r.i] : []) : (r.pos || []).filter((p) => p > max);
      card.classList.toggle('asm-past', past.length > 0);
      let note = card.querySelector('.asm-past-note');
      if (!past.length) {
        if (note) note.remove();
        return;
      }
      if (!note) {
        note = el('div', 'asm-past-note');
        card.appendChild(note);
      }
      note.textContent = `#${past.join(', #')} — the signal is only ${max} long`;
    }

    render() {
      if (pop && /^asm/.test(pop.dataset.for)) closePopover(); // never an HQ editor left open meanwhile
      const tpl = this.tpl();
      const asm = this.normalise();
      const rd = this.readers();
      const max = this.maxPos();
      this.root.innerHTML = '';

      const prev = el('div', 'asm-preview');
      prev.appendChild(el('span', 'asm-tag', 'Order'));
      const cells = el('div', 'asm-preview-cells');
      cells.innerHTML = tpl.cells.map((c) => (c.lit !== undefined ? litCell(c.lit) : varCell(tpl, c.v))).join('');
      prev.appendChild(cells);
      this.root.appendChild(prev);

      const row = el('div', 'asm-readers');
      tpl.vars.forEach((x, v) => row.appendChild(this.renderReader(tpl, x, v, asm[v], rd, max)));
      this.root.appendChild(row);
    }

    renderReader(tpl, x, v, r, rd, max) {
      const card = el('div', 'asm-reader' + (r.t === 'vote' ? ' asm-vote' : '') + (r.not ? ' asm-negated' : ''));
      card.dataset.v = v;
      const top = el('div', 'asm-reader-top');
      top.innerHTML = varCell(tpl, v);
      top.title = `${x.sym} ∈ {${[...x.set].join(',')}}`;
      const flip = () => {
        r.not = !r.not;
        sfx('click');
        this.render();
        this.changed();
      };
      if (r.not || rd.has('NOT')) {
        const n = btn('strip-ctl asm-not' + (r.not ? ' on' : ''), '¬', r.not ? 'Read the partner symbol — click to undo' : 'Read the partner symbol (flip)');
        n.setAttribute('aria-pressed', r.not ? 'true' : 'false');
        if (!rd.has('NOT')) n.disabled = true;
        n.addEventListener('click', flip);
        top.appendChild(n);
      }
      if (rd.has('NOT')) {
        // touch devices have no hover reveal: tapping the symbol offers the flip
        top.dataset.pop = '1';
        top.classList.add('asm-flippable');
        top.title += ' — click to flip';
        const key = 'asm-not:' + v;
        top.addEventListener('click', (e) => {
          if (e.target.closest('.asm-not')) return;
          if (popOpenFor(key)) return closePopover();
          openPopover(top, key, (p) => {
            p.appendChild(el('div', 'pop-title', `Read ${esc(x.sym)} as…`));
            const f = btn('strip-pop-all strip-pop-not' + (r.not ? ' on' : ''), r.not ? '¬ Partner — undo' : '¬ Its partner symbol');
            f.addEventListener('click', () => {
              closePopover();
              flip();
            });
            p.appendChild(f);
          });
        });
      }
      card.appendChild(top);
      card.appendChild(el('div', 'asm-arrow', '▲'));

      const ctl = el('div', 'asm-ctl');
      if (r.t === 'pos') {
        ctl.appendChild(
          stepper(
            r.i,
            1,
            Math.max(max, r.i),
            (i) => `#${i}`,
            (i) => {
              r.i = i;
              this.paintPast(card, r, this.maxPos());
              this.changed();
            },
            'Received position this symbol is read from'
          )
        );
      } else {
        const key = 'asm:' + v;
        const b = btn('strip-ctl asm-vote-btn', '', 'Positions that vote');
        const paint = () => {
          b.innerHTML = `<span class="asm-kw">VOTE</span> ${r.pos.length ? '#' + compressRanges(r.pos) : 'choose…'}`;
          b.classList.toggle('unset', !r.pos.length);
        };
        paint();
        b.addEventListener('click', () => {
          if (popOpenFor(key)) return closePopover();
          // the live signal length at open time (the strip may have grown or shrunk since this card rendered);
          // positions already chosen past the end stay visible so they can be cleared
          const live = this.maxPos();
          const span = Math.max(live, ...r.pos);
          openPopover(b, key, (p) => {
            const opts = [];
            const sent = this.opts.sentLen ? this.opts.sentLen() || live : live;
            for (let i = 1; i <= span; i++)
              opts.push({
                key: i,
                html: String(i),
                title: i > live ? `#${i} is past the end of the signal (${live} long)` : i > sent ? `#${i}: you send ${sent} symbols — this place only exists when the line slips extra symbols in` : undefined,
              });
            multiPicker(p, {
              title: 'Majority vote over',
              cls: 'strip-pop-pos',
              options: opts,
              selected: r.pos,
              commit: (list) => {
                if (list.join() === r.pos.join()) return;
                r.pos = list;
                paint();
                this.paintPast(card, r, this.maxPos());
                this.changed();
              },
              extras: (api, pp) => this.voteHelpers(api, pp, tpl, v, r, live),
            });
            p.querySelectorAll('.strip-pop-pos .pop-tile').forEach((t, k) => {
              t.classList.toggle('past', k + 1 > live);
              t.classList.toggle('spare', k + 1 > sent && k + 1 <= live);
            });
          });
        });
        ctl.appendChild(b);
      }
      card.appendChild(ctl);
      this.paintPast(card, r, max);

      if (rd.has('VOTE')) {
        const sw = btn('strip-ctl asm-mode', r.t === 'vote' ? 'one' : 'vote', r.t === 'vote' ? 'Read a single position instead' : 'Take a majority vote over several positions');
        sw.addEventListener('click', () => {
          if (r.t === 'pos') {
            r.t = 'vote';
            r.pos = [r.i || 1];
            delete r.i;
          } else {
            r.t = 'pos';
            r.i = (r.pos && r.pos[0]) || 1;
            delete r.pos;
          }
          sfx('click');
          this.render();
          this.changed();
        });
        card.appendChild(sw);
      }
      return card;
    }

    // VOTE picker extras: a one-click "copies of this symbol" suggestion and an "every k from #s" stride
    voteHelpers(api, p, tpl, v, r, max) {
      const L = tpl.cells.length;
      const first = tpl.cells.findIndex((c) => c.v === v) + 1;
      const copies = L > 0 && max > L && max % L === 0 && first > 0;
      const run = (s, k) => {
        const out = [];
        for (let i = s; i <= max; i += k) out.push(i);
        return out;
      };
      if (copies) {
        const list = run(first, L);
        const shown = list.length > 4 ? list.slice(0, 3).map((i) => '#' + i).join(', ') + ', …' : list.map((i) => '#' + i).join(', ');
        const chip = btn('strip-suggest', `<span>copies of this symbol:</span> <b>${shown}</b>`, 'Positions ' + compressRanges(list));
        chip.addEventListener('click', () => api.setAll(list));
        p.appendChild(chip);
      }
      let k = copies ? L : Math.max(2, Math.min(max - 1, tpl.vars.length > 1 ? tpl.vars.length : 2));
      let s = Math.max(1, Math.min(max, r.pos[0] || first || 1));
      const row = el('div', 'strip-stride');
      row.appendChild(el('span', '', 'every'));
      row.appendChild(stepper(k, 1, Math.max(1, max - 1), (x) => String(x), (x) => (k = x), 'Spacing between positions'));
      row.appendChild(el('span', '', 'from'));
      row.appendChild(stepper(s, 1, max, (x) => '#' + x, (x) => (s = x), 'First position'));
      const go = btn('strip-stride-go', 'Apply');
      go.addEventListener('click', () => api.setAll(run(s, k)));
      row.appendChild(go);
      p.appendChild(row);
    }

    highlight(on) {
      this.root.classList.toggle('active', !!on);
      if (on) revealInScroller(this.root);
    }
  }

  CoC.StripEditor = StripEditor;
  CoC.AssemblyEditor = AssemblyEditor;
  CoC.strip = { newItem, reviveStrip, find, TOOLS, STAMPS, closePopover, modernize, normaliseItem, sealJam, polyText };
})();
