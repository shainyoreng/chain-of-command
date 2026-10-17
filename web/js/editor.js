/* Chain of Command — protocol editor: a supply crate of equipment and a stack of
 * plates that can be dragged, nested (decisions have YES / NO branches) and tuned in place. */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});
  const { BLOCKS, CATEGORIES, newBlock } = CoC.blocks;

  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };

  function compressRanges(nums) {
    if (!nums.length) return '';
    const out = [];
    let a = nums[0];
    let b = a;
    for (const n of nums.slice(1).concat([null])) {
      if (n === b + 1) b = n;
      else {
        out.push(b - a >= 2 ? `${a}–${b}` : a === b ? `${a}` : `${a},${b}`);
        a = b = n;
      }
    }
    return out.join(',');
  }

  function controlText(def, v) {
    if (def.type === 'set') return v ? '{' + [...v].join(',') + '}' : 'choose…';
    if (def.type === 'positions') return v.length ? '#' + compressRanges(v) : 'choose…';
    return String(v);
  }

  // Bring a node into view inside its nearest scrolling column only; never scrolls the page itself.
  function scrollWithin(node, margin = 8) {
    if (!node) return;
    for (let p = node.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy !== 'auto' && oy !== 'scroll') || p.scrollHeight <= p.clientHeight + 1) continue;
      const r = node.getBoundingClientRect();
      const pr = p.getBoundingClientRect();
      let dy = 0;
      if (r.top < pr.top + margin) dy = r.top - pr.top - margin;
      else if (r.bottom > pr.bottom - margin) dy = Math.min(r.bottom - pr.bottom + margin, r.top - pr.top - margin);
      if (dy) p.scrollBy({ top: dy, behavior: 'smooth' });
      return;
    }
  }

  // ------------------------------------------------------------ popover (one shared)
  let pop = null;
  function closePopover() {
    if (pop) {
      if (pop._cleanup) pop._cleanup();
      pop.remove();
    }
    pop = null;
  }
  function openPopover(anchor, build) {
    closePopover();
    pop = el('div', 'popover');
    build(pop);
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
    pop.style.top = r.bottom + 6 + 'px';
    const pr = pop.getBoundingClientRect();
    if (pr.bottom > window.innerHeight - 8) pop.style.top = Math.max(8, r.top - pr.height - 6) + 'px';
  }
  document.addEventListener('pointerdown', (e) => {
    if (pop && !pop.contains(e.target) && !e.target.closest('.ctl')) closePopover();
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closePopover());

  // ------------------------------------------------------------ positions picker
  // Number grid with quick ways to pick many positions at once:
  //   drag across tiles to paint them (every tile takes the state the first one switched to),
  //   shift-click to set the whole run from the last clicked tile, ALL / NONE / ODD / EVEN,
  //   and "every k from #s" for copies spaced apart (1, 4, 7 …). Quick picks replace the selection.
  function positionsPicker(p, { n, title, get, set }) {
    const sorted = (s) => [...s].sort((x, y) => x - y);
    const has = (i) => get().includes(i);
    const tiles = [];
    let anchor = null; // last clicked tile
    let paint = null; // state being painted during a drag
    const apply = (list, sound = true) => {
      set(sorted(new Set(list)));
      tiles.forEach((t, k) => t.classList.toggle('on', has(k + 1)));
      if (sound) CoC.audio.sfx.click();
    };
    const setOne = (i, on) => {
      if (has(i) === on) return false;
      const s = new Set(get());
      on ? s.add(i) : s.delete(i);
      apply([...s], false);
      return true;
    };
    const range = (a, z) => Array.from({ length: Math.abs(z - a) + 1 }, (_, k) => Math.min(a, z) + k);
    const upto = (pred) => range(1, n).filter(pred);

    p.classList.add('pos-pop');
    p.appendChild(el('div', 'pop-title', title));

    const quick = el('div', 'pos-quick');
    for (const [label, pick] of [
      ['All', () => upto(() => true)],
      ['None', () => []],
      ['Odd', () => upto((i) => i % 2 === 1)],
      ['Even', () => upto((i) => i % 2 === 0)],
    ]) {
      const q = el('button', '', label);
      q.type = 'button';
      q.addEventListener('click', () => apply(pick()));
      quick.appendChild(q);
    }
    p.appendChild(quick);

    const grid = el('div', 'pop-grid pos-grid');
    for (let i = 1; i <= n; i++) {
      const t = el('button', 'pop-tile' + (has(i) ? ' on' : ''), String(i));
      t.type = 'button';
      t.dataset.pos = i;
      t.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        if (e.shiftKey && anchor !== null) {
          const on = has(anchor);
          const s = new Set(get());
          for (const k of range(anchor, i)) on ? s.add(k) : s.delete(k);
          apply([...s]);
          anchor = i;
          return;
        }
        paint = !has(i);
        anchor = i;
        setOne(i, paint);
        CoC.audio.sfx.click();
      });
      // keyboard (Enter / Space) still toggles a single tile
      t.addEventListener('click', (e) => {
        if (e.detail !== 0) return;
        anchor = i;
        setOne(i, !has(i));
        CoC.audio.sfx.click();
      });
      tiles.push(t);
      grid.appendChild(t);
    }
    const onMove = (e) => {
      if (paint === null) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const t = hit && hit.closest('.pos-grid .pop-tile');
      if (t && grid.contains(t) && setOne(+t.dataset.pos, paint)) CoC.audio.sfx.click();
    };
    const onUp = () => (paint = null);
    grid.addEventListener('pointermove', onMove);
    // touch pointers are captured by the first tile, so follow them on the window as well
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    p._cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    p.appendChild(grid);

    // stride helper: every [k] from #[s]  APPLY
    const st = { k: n >= 4 ? 3 : 1, s: 1 };
    const stepper = (prop, min, max, prefix) => {
      const w = el('span', 'pos-step');
      const minus = el('button', '', '−');
      const val = el('b', '', String(st[prop]));
      const plus = el('button', '', '+');
      minus.type = plus.type = 'button';
      const bump = (d) => {
        st[prop] = Math.max(min, Math.min(max, st[prop] + d));
        val.textContent = String(st[prop]);
      };
      minus.addEventListener('click', () => bump(-1));
      plus.addEventListener('click', () => bump(1));
      if (prefix) w.appendChild(el('span', 'pos-pre', prefix));
      w.append(minus, val, plus);
      return w;
    };
    const stride = el('div', 'pos-stride');
    stride.appendChild(el('span', 'pos-word', 'every'));
    stride.appendChild(stepper('k', 1, Math.max(1, n - 1)));
    stride.appendChild(el('span', 'pos-word', 'from'));
    stride.appendChild(stepper('s', 1, n, '#'));
    const go = el('button', 'pos-apply', 'Apply');
    go.type = 'button';
    go.addEventListener('click', () => apply(upto((i) => i >= st.s && (i - st.s) % st.k === 0)));
    stride.appendChild(go);
    p.appendChild(stride);
    p.appendChild(el('div', 'pos-hint', 'drag to paint · shift-click for a run'));
  }

  // ------------------------------------------------------------ multi-selection (shared with the HQ strip editor)
  // File-manager convention: shift-click selects the run from the last clicked piece (same lane),
  // Ctrl/⌘-click adds or drops one piece; a plain click clears. Touch: long-press, then tap to add.
  const canHover = () => !!(globalThis.matchMedia && matchMedia('(hover: hover)').matches);
  const IS_MAC = /Mac|iP(hone|ad|od)/.test((globalThis.navigator && (navigator.platform || navigator.userAgent)) || '');
  const selMode = (e) => (e.ctrlKey || e.metaKey ? 'toggle' : e.shiftKey ? 'range' : null);
  const selHintText = () =>
    canHover()
      ? `Shift-click selects a run · ${IS_MAC ? '⌘' : 'Ctrl'}-click adds one · drag a selected piece to move them all`
      : 'Long-press to select · tap more to add · drag to move them together';
  const isTyping = (t) => !!(t && t.closest && t.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
  const modalOpen = () => {
    const m = document.getElementById('modal');
    return !!(m && !m.hidden);
  };
  // the floating "3 selected · drag to move · Del to remove · Esc to clear" chip, centred under `host`
  function selChip(host, { onClear, onRemove }) {
    const chip = el('div', 'sel-chip');
    chip.hidden = true;
    chip.setAttribute('role', 'status');
    const text = el('span', 'sel-chip-text');
    const rm = el('button', 'sel-chip-btn', 'Remove');
    rm.type = 'button';
    rm.title = 'Remove the selected pieces';
    rm.addEventListener('click', onRemove);
    const x = el('button', 'sel-chip-x', '✕');
    x.type = 'button';
    x.title = 'Clear the selection';
    x.addEventListener('click', onClear);
    chip.append(text, rm, x);
    host.appendChild(chip);
    const place = () => {
      if (chip.hidden) return;
      const r = host.getBoundingClientRect();
      chip.style.left = Math.round(r.left + r.width / 2) + 'px';
      // desktop: the panel fills the column, so sit just inside its bottom edge; stacked (phone) layout: the screen's bottom
      const vh = window.innerHeight;
      chip.style.bottom = (r.bottom < vh - 40 ? 18 : Math.max(18, Math.round(vh - r.bottom + 14))) + 'px';
    };
    window.addEventListener('resize', place);
    return {
      el: chip,
      set(n) {
        if (!n) {
          chip.hidden = true;
          return;
        }
        const hover = canHover();
        text.innerHTML = `<b>${n} selected</b> · drag to move` + (hover ? ' · Del to remove · Esc to clear' : '');
        rm.hidden = hover;
        chip.hidden = false;
        place();
      },
    };
  }
  // tell the other editor to drop its selection (only one selection exists at a time)
  const announceSelection = (owner) => document.dispatchEvent(new CustomEvent('coc:select', { detail: owner }));

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
      drag.ghost = el(
        'div',
        `drag-ghost cat-${CATEGORIES[BLOCKS[drag.op].cat].color}` + (drag.ids ? ' multi' : ''),
        drag.label || BLOCKS[drag.op].parts[0]
      );
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
    if (e && e.type === 'pointercancel') return d.editor.placeholder.remove();
    d.editor.finishDrag(d);
  }

  // extra: { mod, touch, ids, srcEls, label, longPress } for placed plates
  function startDrag(e, editor, op, id, srcEl, extra) {
    if (e.button !== undefined && e.button !== 0) return;
    if (drag) return;
    drag = Object.assign({ editor, op, id, srcEl, x0: e.clientX, y0: e.clientY, started: false, target: null }, extra);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    clearTimeout(pressTimer);
    if (extra && extra.longPress && e.pointerType && e.pointerType !== 'mouse') {
      const d = drag;
      if (srcEl) srcEl.classList.add('pressing');
      pressTimer = setTimeout(() => {
        if (drag !== d || d.started) return;
        d.consumed = true;
        if (srcEl) srcEl.classList.remove('pressing');
        try {
          if (navigator.vibrate) navigator.vibrate(12);
        } catch (_) {
          /* optional */
        }
        d.longPress();
      }, 480);
    }
  }

  // ------------------------------------------------------------ Cipher School: the HQ strip seen as a lamp code
  // Encode each order lamp alone (G, one row per lamp), check the strip adds up like arithmetic mod 2, then write
  // the check rows every transmission obeys: for every lamp that is not the first plain copy of an order lamp,
  // the row {that lamp} ∪ {the order lamps it is made of}. -> { G, n, rows } or { why }.
  function hqLampCode(level) {
    const app = CoC.app;
    const { engine } = CoC;
    if (!app || !app.S || !level) return null;
    let tpl;
    try {
      tpl = engine.templateOf(level);
    } catch (e) {
      return { why: e.message };
    }
    if (!tpl.vars.length || !tpl.vars.every((v) => /^[01]+$/.test(v.set))) return { why: 'The orders are not lamps: syndrome tables work on lamp codes.' };
    const send = (on) => engine.runEncoder(level, app.S.enc, tpl.cells.map((c) => (c.lit !== undefined ? c.lit : on.includes(c.v) ? '1' : '0')).join('')).out;
    const xor = (a, b) => [...a].map((c, i) => (c === b[i] ? '0' : '1')).join('');
    try {
      const zero = send([]);
      const n = zero.length;
      if (!/^0*$/.test(zero)) return { why: 'An all-dark order should go out all dark. Markers, ¬ badges or IF tiles on the HQ strip break that.' };
      const G = tpl.vars.map((_, v) => send([v]));
      if (G.some((g) => g.length !== n || !/^[01]*$/.test(g))) return { why: 'The HQ strip does not send a fixed row of lamps.' };
      for (let a = 0; a < G.length; a++)
        for (let b = a + 1; b < G.length; b++) if (send([a, b]) !== xor(G[a], G[b])) return { why: 'The HQ strip does not add up like parity (an IF tile?).' };
      const col = (j) => G.map((g) => g[j]).join('');
      const unit = (v) => G.map((_, u) => (u === v ? '1' : '0')).join('');
      const info = tpl.vars.map((_, v) => [...Array(n).keys()].find((j) => col(j) === unit(v)));
      if (info.some((j) => j === undefined)) return { G, n, why: 'Some order lamp never travels on its own, so there is no simple set of check rows.' };
      const rows = [];
      for (let j = 0; j < n; j++) {
        if (info.includes(j)) continue;
        const row = [j + 1];
        tpl.vars.forEach((_, v) => G[v][j] === '1' && row.push(info[v] + 1));
        rows.push(row.sort((x, y) => x - y));
      }
      return { G, n, rows };
    } catch (e) {
      return { why: e.message };
    }
  }

  // One line under the check rows: do HQ's transmissions obey them, and can every lamp be told apart?
  function synStatus(level, rows, n, locked) {
    const hq = hqLampCode(level);
    if (rows.some((row) => !row.length)) return { cls: 'warn', text: `Row ${rows.findIndex((row) => !row.length) + 1} watches no lamps yet.` };
    if (hq && hq.G) {
      const odd = (g, row) => row.reduce((x, q) => x ^ (g[q - 1] === '1' ? 1 : 0), 0);
      const bad = rows.findIndex((row) => hq.G.some((g) => odd(g, row)));
      if (bad >= 0) {
        const row = rows[bad];
        const v = hq.G.findIndex((g) => odd(g, row));
        const tpl = CoC.engine.templateOf(level);
        const lit = row.filter((q) => hq.G[v][q - 1] === '1');
        const sym = tpl.vars[v] ? tpl.vars[v].sym : '#' + (v + 1);
        return {
          cls: 'bad',
          text:
            `✗ Row ${bad + 1} does not hold. It watches #${row.join(' #')}; an order with only ${sym} lit ` +
            `lights ${lit.length ? '#' + lit.join(' #') : 'none of them'} there: ${lit.length} lamp${lit.length === 1 ? '' : 's'}, an odd count. ` +
            `The plate would “repair” a signal nobody damaged.`,
        };
      }
    }
    const width = hq && hq.n ? hq.n : n;
    const seen = new Map();
    for (let j = 1; j <= width; j++) {
      const key = rows.map((row) => (row.includes(j) ? 1 : 0)).join('');
      if (!key.includes('1')) return { cls: 'warn', text: `Lamp #${j} is in no row: a flip there leaves no trace${locked ? ' on the captured machine' : ''}.` };
      if (seen.has(key)) return { cls: 'warn', text: `Lamps #${seen.get(key)} and #${j} have the same column: one table line cannot tell them apart.` };
      seen.set(key, j);
    }
    if (!hq || !hq.G) return { cls: '', text: hq && hq.why ? hq.why : '' };
    return { cls: 'ok', text: `✓ Every HQ transmission passes all ${rows.length} row${rows.length === 1 ? '' : 's'}, and every lamp has its own column.` };
  }

  // ------------------------------------------------------------ editor
  class Editor {
    constructor(opts) {
      this.root = opts.root;
      this.side = opts.side;
      this.opts = opts;
      this.supplyEl = this.root.querySelector('.supply');
      this.programEl = this.root.querySelector('.slot-root');
      this.placeholder = el('div', 'drop-line');
      // multi-selection
      this.sel = new Set();
      this.selAnchor = null;
      this.selFor = null;
      this.chip = selChip(this.root, { onClear: () => this.clearSelection(), onRemove: () => this.deleteSelection() });
      this.hintEl = el('div', 'sel-hint plate-sel-hint');
      this.hintEl.hidden = true;
      this.programEl.insertAdjacentElement('afterend', this.hintEl);
      document.addEventListener('coc:select', (e) => e.detail !== this && this.clearSelection());
      this.programEl.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.block') && !selMode(e)) this.clearSelection();
      });
      document.addEventListener('keydown', (e) => this.onKey(e));
      // the tape acts out a syndrome plate: light the check row being summed, then the table line it lands on
      document.addEventListener('coc:syndrome', (e) => this.onSyndromeFx(e.detail || {}));
    }

    // ---- selection
    // selected plates whose ancestors are not selected, in document order (a selected decision brings its branches along)
    topSelected() {
      const out = [];
      const walk = (list) => {
        for (const b of list) {
          if (this.sel.has(b.id)) out.push(b.id);
          else for (const sub of [b.then, b.else]) if (sub) walk(sub);
        }
      };
      walk(this.program);
      return out;
    }
    nodeFor(id) {
      return this.programEl.querySelector(`.block[data-id="${CSS.escape(id)}"]`);
    }
    selectClick(id, mode) {
      const f = this.find(id);
      if (!f) return;
      const a = mode === 'range' && this.selAnchor && !this.sel.has(id) ? f.list.findIndex((b) => b.id === this.selAnchor) : -1;
      if (a >= 0) {
        const [lo, hi] = a < f.index ? [a, f.index] : [f.index, a];
        for (let i = lo; i <= hi; i++) this.sel.add(f.list[i].id);
      } else if (this.sel.has(id)) this.sel.delete(id);
      else this.sel.add(id);
      this.selAnchor = id;
      CoC.audio.sfx.click();
      if (this.sel.size) announceSelection(this);
      this.paintSelection();
    }
    clearSelection() {
      this.selAnchor = null;
      if (!this.sel.size) return;
      this.sel.clear();
      this.paintSelection();
    }
    paintSelection() {
      for (const n of this.programEl.querySelectorAll('.block')) n.classList.toggle('selected', this.sel.has(n.dataset.id));
      this.chip.set(this.sel.size);
    }
    deleteSelection() {
      const ids = this.topSelected();
      if (!ids.length) return;
      for (const id of ids) {
        const f = this.find(id);
        if (f) f.list.splice(f.index, 1);
      }
      this.sel.clear();
      this.selAnchor = null;
      CoC.audio.sfx.remove();
      this.render();
      this.opts.onChange('structure');
    }
    onKey(e) {
      if (!this.sel.size) return;
      if (e.key === 'Escape') return this.clearSelection();
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (e.ctrlKey || e.metaKey || e.altKey || drag || isTyping(e.target) || modalOpen()) return;
      if (!this.programEl.isConnected || !this.programEl.getClientRects().length) return;
      e.preventDefault();
      this.deleteSelection();
    }
    // forget the selection when the program is swapped (level change) or its plates are gone
    pruneSelection() {
      if (this.selFor !== this.program) {
        this.selFor = this.program;
        this.sel.clear();
        this.selAnchor = null;
        return;
      }
      for (const id of [...this.sel]) if (!this.find(id)) this.sel.delete(id);
      if (this.selAnchor && !this.find(this.selAnchor)) this.selAnchor = null;
    }
    // does the node lie inside a plate being dragged?
    inMoving(node) {
      return (drag.srcEls || (drag.srcEl ? [drag.srcEl] : [])).some((s) => s.contains(node));
    }

    get program() {
      return this.opts.getProgram();
    }

    // ---- model helpers
    find(id, list = this.program) {
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.id === id) return { list, index: i, block: b };
        for (const sub of [b.then, b.else]) {
          if (!sub) continue;
          const r = this.find(id, sub);
          if (r) return r;
        }
      }
      return null;
    }

    slotList(key) {
      if (key === 'root') return this.program;
      const [id, branch] = key.split(':');
      const f = this.find(id);
      return f ? f.block[branch] : null;
    }

    append(op) {
      this.program.push(newBlock(op));
      CoC.audio.sfx.place();
      this.render();
      this.opts.onChange('structure');
    }

    // ---- drag & drop
    updateDrop(x, y) {
      const hit = document.elementFromPoint(x, y);
      const slot = hit && hit.closest('.slot');
      const valid = slot && this.root.contains(slot);
      if (valid && this.inMoving(slot)) {
        // a branch of a decision being moved: it cannot go inside itself — dropping here changes nothing
        drag.ghost.classList.remove('trash');
        this.placeholder.remove();
        drag.target = { cancel: true };
        return;
      }
      drag.ghost.classList.toggle('trash', !valid && !!drag.id);
      if (!valid) {
        this.placeholder.remove();
        drag.target = null;
        return;
      }
      const moving = drag.srcEls || [drag.srcEl];
      const kids = [...slot.children].filter((c) => c.classList.contains('block') && !moving.includes(c));
      let index = kids.length;
      for (let i = 0; i < kids.length; i++) {
        const r = kids[i].getBoundingClientRect();
        if (y < r.top + Math.min(r.height / 2, 22)) {
          index = i;
          break;
        }
      }
      if (kids[index]) slot.insertBefore(this.placeholder, kids[index]);
      else slot.appendChild(this.placeholder);
      drag.target = { key: slot.dataset.slot, index };
    }

    finishDrag(d) {
      this.placeholder.remove();
      if (!d.started) {
        if (!d.id) return this.append(d.op);
        if (d.mod) return this.selectClick(d.id, d.mod);
        if (d.touch && this.sel.size) return this.selectClick(d.id, 'toggle'); // touch: tapping extends a selection
        this.clearSelection();
        this.selAnchor = d.id; // a later shift-click selects the run from here
        return;
      }
      if (d.target && d.target.cancel) return;
      if (d.ids) return this.finishGroup(d);
      if (!d.target) {
        if (d.id) {
          const f = this.find(d.id);
          if (f) f.list.splice(f.index, 1);
          CoC.audio.sfx.remove();
          this.render();
          this.opts.onChange('structure');
        }
        return;
      }
      let block;
      if (d.id) {
        const f = this.find(d.id);
        if (!f) return;
        block = f.list.splice(f.index, 1)[0];
      } else block = newBlock(d.op);
      const list = this.slotList(d.target.key);
      if (!list) return;
      list.splice(Math.min(d.target.index, list.length), 0, block);
      CoC.audio.sfx.place();
      this.render();
      this.opts.onChange('structure');
    }

    // move (or scrap) every selected plate together, kept in their original top-to-bottom order
    finishGroup(d) {
      if (!d.target) return this.deleteSelection();
      const blocks = [];
      for (const id of d.ids) {
        const f = this.find(id);
        if (f) blocks.push(f.list.splice(f.index, 1)[0]);
      }
      const list = this.slotList(d.target.key);
      if (!list || !blocks.length) return; // cannot happen (drops inside a moved plate are cancelled)
      list.splice(Math.min(d.target.index, list.length), 0, ...blocks);
      CoC.audio.sfx.place();
      this.render();
      this.opts.onChange('structure');
    }

    // ---- rendering
    render() {
      closePopover();
      this.pruneSelection();
      this.renderSupply();
      this.programEl.innerHTML = '';
      this.renderList(this.program, this.programEl);
      if (!this.program.length) {
        this.programEl.appendChild(
          el('div', 'slot-empty', this.opts.allowed().length ? 'Drag equipment here — or click it in the crate' : 'No equipment needed on this side')
        );
      }
      this.hintEl.textContent = selHintText();
      this.hintEl.hidden = this.programEl.querySelectorAll('.block').length < 2;
      this.paintSelection();
    }

    renderSupply() {
      const allowed = this.opts.allowed();
      const fresh = this.opts.newOps();
      this.supplyEl.innerHTML = '';
      if (!allowed.length) {
        this.supplyEl.appendChild(el('div', 'supply-empty', 'Crate empty — nothing issued'));
        return;
      }
      for (const op of allowed) {
        const spec = BLOCKS[op];
        const item = el('button', `supply-item cat-${CATEGORIES[spec.cat].color}`);
        item.type = 'button';
        item.innerHTML = `<span>${spec.title}</span>${fresh.has(op) ? '<em>NEW</em>' : ''}`;
        item.dataset.tip = spec.desc + (spec.example ? `\n${spec.example}` : '');
        item.addEventListener('pointerdown', (e) => startDrag(e, this, op, null, null));
        this.supplyEl.appendChild(item);
      }
    }

    renderList(list, container) {
      for (const b of list) container.appendChild(this.renderBlock(b));
    }

    renderBlock(b) {
      const spec = BLOCKS[b.op];
      const color = CATEGORIES[spec.cat].color;
      const blk = el('div', `block cat-${color}${spec.cond ? ' cond' : ''}`);
      blk.dataset.id = b.id;
      const head = el('div', 'block-head');
      head.appendChild(el('span', 'grip', '<i></i><i></i><i></i>'));
      const label = el('div', 'block-label');
      for (const part of spec.parts) {
        if (typeof part === 'string') label.appendChild(el('span', 'lbl', part));
        else label.appendChild(this.renderControl(b, part));
      }
      head.appendChild(label);
      if (this.side === 'enc') head.appendChild(el('span', 'badge'));
      const del = el('button', 'del', '✕');
      del.type = 'button';
      del.title = 'Remove';
      del.addEventListener('click', () => {
        const f = this.find(b.id);
        if (f) f.list.splice(f.index, 1);
        CoC.audio.sfx.remove();
        this.render();
        this.opts.onChange('structure');
      });
      head.appendChild(del);
      head.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.ctl, .del')) return;
        const mod = selMode(e);
        if (mod) e.preventDefault(); // no text selection on shift/ctrl-click
        const extra = { mod, touch: !!e.pointerType && e.pointerType !== 'mouse', longPress: () => this.selectClick(b.id, 'toggle') };
        const group = this.sel.has(b.id) ? this.topSelected() : [];
        if (group.length > 1 || (group.length === 1 && group[0] !== b.id)) {
          extra.ids = group;
          extra.srcEls = group.map((id) => this.nodeFor(id)).filter(Boolean);
          const first = this.find(group[0]);
          extra.label = `${BLOCKS[first ? first.block.op : b.op].parts[0]} <em class="ghost-count">×${group.length}</em>`;
        }
        startDrag(e, this, b.op, b.id, blk, extra);
      });
      blk.addEventListener('contextmenu', (e) => !canHover() && e.preventDefault()); // long-press selects, no menu
      blk.appendChild(head);
      if (spec.panel) blk.appendChild(this.renderPanel(b, spec));

      if (spec.cond) {
        for (const [branch, name] of [['then', 'YES'], ['else', 'NO']]) {
          const br = el('div', `branch branch-${branch}`);
          br.appendChild(el('div', 'branch-label', name));
          const slot = el('div', 'slot');
          slot.dataset.slot = `${b.id}:${branch}`;
          this.renderList(b[branch], slot);
          if (!b[branch].length) slot.appendChild(el('div', 'slot-empty', 'carry on'));
          br.appendChild(slot);
          blk.appendChild(br);
        }
        blk.appendChild(el('div', 'block-foot'));
      }
      return blk;
    }

    renderControl(b, part) {
      const spec = BLOCKS[b.op];
      const def = spec.params[part.k];
      const key = part.k;
      const changed = () => this.opts.onChange('param');
      const wrap = el('span', 'ctl-wrap');
      if (part.pre) wrap.appendChild(el('span', 'pre', part.pre));

      if (def.type === 'int') {
        const c = el('span', 'ctl ctl-int');
        const minus = el('button', '', '−');
        const val = el('b', '', String(b.p[key]));
        const plus = el('button', '', '+');
        minus.type = plus.type = 'button';
        const bump = (d) => {
          const v = Math.max(def.min, Math.min(def.max, b.p[key] + d));
          if (v === b.p[key]) return;
          b.p[key] = v;
          val.textContent = String(v);
          CoC.audio.sfx.click();
          changed();
        };
        minus.addEventListener('click', () => bump(-1));
        plus.addEventListener('click', () => bump(1));
        c.append(minus, val, plus);
        wrap.appendChild(c);
        return wrap;
      }

      const btn = el('button', `ctl ctl-${def.type}`);
      btn.type = 'button';
      if (def.type === 'enum') {
        const opts = b.op === 'REPAIR' && key === 'mode' ? def.options.filter((o) => this.opts.level().repair.includes(o)) : def.options;
        if (!opts.includes(b.p[key])) b.p[key] = opts[0];
        btn.textContent = b.p[key];
        if (opts.length > 1) btn.classList.add('cycles');
        btn.addEventListener('click', () => {
          b.p[key] = opts[(opts.indexOf(b.p[key]) + 1) % opts.length];
          btn.textContent = b.p[key];
          CoC.audio.sfx.click();
          changed();
        });
        wrap.appendChild(btn);
        return wrap;
      }

      btn.textContent = controlText(def, b.p[key]);
      btn.classList.toggle('unset', def.type !== 'sym' && !b.p[key].length);
      const refresh = () => {
        btn.textContent = controlText(def, b.p[key]);
        btn.classList.toggle('unset', def.type !== 'sym' && !b.p[key].length);
      };
      btn.addEventListener('click', () => {
        if (pop && pop.dataset.for === b.id + key) return closePopover();
        openPopover(btn, (p) => {
          p.dataset.for = b.id + key;
          if (def.type === 'positions') {
            positionsPicker(p, {
              n: this.opts.positions(b.id),
              title: this.side === 'enc' ? 'Lamps this seal watches' : 'Positions',
              get: () => b.p[key],
              set: (list) => {
                b.p[key] = list;
                refresh();
                changed();
              },
            });
          } else {
            const syms = def.type === 'sym' ? this.opts.markers() : this.opts.symbols();
            p.appendChild(el('div', 'pop-title', def.type === 'sym' ? 'Marker' : 'Symbols'));
            const grid = el('div', 'pop-grid');
            for (const ch of syms) {
              const on = def.type === 'sym' ? b.p[key] === ch : b.p[key].includes(ch);
              const t = el('button', 'pop-tile' + (on ? ' on' : ''), ch);
              t.type = 'button';
              t.addEventListener('click', () => {
                if (def.type === 'sym') {
                  b.p[key] = ch;
                  closePopover();
                } else {
                  const cur = new Set(b.p[key]);
                  cur.has(ch) ? cur.delete(ch) : cur.add(ch);
                  b.p[key] = [...syms].filter((c) => cur.has(c)).join('');
                  t.classList.toggle('on');
                }
                refresh();
                CoC.audio.sfx.click();
                changed();
              });
              grid.appendChild(t);
            }
            p.appendChild(grid);
          }
        });
      });
      wrap.appendChild(btn);
      return wrap;
    }

    // ---- Cipher School: the syndrome plate (and the captured enemy decoder) draw a panel under their head:
    // the check rows as a grid of lamps (H, one column per lamp of the signal) and the table, one line per syndrome.
    synWidth(b, rows) {
      const pv = CoC.app && CoC.app.S && CoC.app.S.preview;
      let n = pv && pv.out ? pv.out.length : this.opts.positions(b.id);
      for (const row of rows || []) for (const q of row) n = Math.max(n, q);
      for (const fix of Object.values((b.p && b.p.table) || {})) for (const q of fix || []) n = Math.max(n, q);
      return Math.max(1, Math.min(24, n));
    }

    renderPanel(b, spec) {
      const locked = spec.panel === 'captured';
      const P = locked ? CoC.engine.CAPTURED_H : b.p;
      const rows = P.rows;
      const r = rows.length;
      const n = locked ? 7 : this.synWidth(b, rows);
      const level = this.opts.level();
      const stamps = !locked && !!(level && (level.tableStamps || level.sandbox));
      const changed = () => this.opts.onChange('param');
      const wrap = el('div', 'syn-panel' + (locked ? ' locked' : ''));
      wrap.dataset.n = n;
      const rerender = () => {
        closePopover();
        wrap.replaceWith(this.renderPanel(b, spec));
      };
      const keyOf = (k) => k.toString(2).padStart(r, '0');
      const colKey = (j) => rows.map((row) => (row.includes(j) ? '1' : '0')).join('');
      const lamps = (key) => [...key].map((c) => `<i class="syn-bit${c === '1' ? ' on' : ''}"></i>`).join('');

      // ------------------------------------------------ H: the check rows
      const hsec = el('div', 'syn-sec');
      const hcap = el('div', 'syn-cap');
      hcap.appendChild(el('span', 'syn-title', locked ? 'H · as captured' : 'Check rows · H'));
      if (!locked) {
        const step = el('span', 'ctl ctl-int syn-rows');
        const minus = el('button', '', '−');
        const val = el('b', '', `${r} row${r === 1 ? '' : 's'}`);
        const plus = el('button', '', '+');
        minus.type = plus.type = 'button';
        minus.title = 'Remove the last check row';
        plus.title = 'Add a check row';
        minus.disabled = r <= 1;
        plus.disabled = r >= 5;
        const resize = (d) => {
          const nr = r + d;
          if (nr < 1 || nr > 5) return;
          const table = {};
          for (const [key, fix] of Object.entries(b.p.table || {})) {
            if (key.length !== r) continue;
            if (d > 0) table[key + '0'] = fix;
            else if (key.endsWith('0') && key.slice(0, -1).includes('1')) table[key.slice(0, -1)] = fix;
          }
          b.p.rows = d > 0 ? [...rows.map((x) => x.slice()), []] : rows.slice(0, -1).map((x) => x.slice());
          b.p.table = table;
          CoC.audio.sfx.click();
          changed();
          rerender();
        };
        minus.addEventListener('click', () => resize(-1));
        plus.addEventListener('click', () => resize(1));
        step.append(minus, val, plus);
        hcap.appendChild(step);
      } else hcap.appendChild(el('span', 'syn-seized', 'Captured'));
      hsec.appendChild(hcap);

      const scroll = el('div', 'syn-scroll');
      const grid = el('table', 'syn-h');
      let h = '<thead><tr><th></th>';
      for (let j = 1; j <= n; j++) h += `<th data-col="${j}">#${j}</th>`;
      h += '</tr></thead><tbody>';
      rows.forEach((row, i) => {
        h += `<tr data-row="${i}"><th>r${i + 1}</th>`;
        for (let j = 1; j <= n; j++) {
          const on = row.includes(j);
          h += locked
            ? `<td data-col="${j}"><span class="syn-cell${on ? ' on' : ''}">${on ? 1 : 0}</span></td>`
            : `<td data-col="${j}"><button type="button" class="syn-cell${on ? ' on' : ''}" data-row="${i}" data-col="${j}" aria-pressed="${on}" aria-label="Row ${i + 1}, lamp #${j}">${on ? 1 : 0}</button></td>`;
        }
        h += '</tr>';
      });
      grid.innerHTML = h + '</tbody>';
      scroll.appendChild(grid);
      hsec.appendChild(scroll);

      if (!locked) {
        // click a lamp to switch it; drag across a row to paint several (every lamp takes the state the first one took)
        let paint = null;
        const setCell = (btn, on) => {
          const i = +btn.dataset.row;
          const j = +btn.dataset.col;
          const cur = b.p.rows[i] || [];
          if (cur.includes(j) === on) return false;
          const next = on ? [...cur, j].sort((x, y) => x - y) : cur.filter((q) => q !== j);
          b.p.rows = b.p.rows.map((x, k) => (k === i ? next : x.slice()));
          btn.classList.toggle('on', on);
          btn.textContent = on ? '1' : '0';
          btn.setAttribute('aria-pressed', String(on));
          return true;
        };
        const done = () => {
          if (paint === null) return;
          paint = null;
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', done);
          window.removeEventListener('pointercancel', done);
          refreshStatus();
          changed();
        };
        const onMove = (e) => {
          if (paint === null) return;
          const hit = document.elementFromPoint(e.clientX, e.clientY);
          const btn = hit && hit.closest && hit.closest('.syn-cell');
          if (btn && grid.contains(btn) && btn.tagName === 'BUTTON' && setCell(btn, paint)) CoC.audio.sfx.click();
        };
        grid.addEventListener('pointerdown', (e) => {
          const btn = e.target.closest('button.syn-cell');
          if (!btn || (e.button !== undefined && e.button !== 0)) return;
          e.preventDefault();
          paint = !btn.classList.contains('on');
          setCell(btn, paint);
          CoC.audio.sfx.click();
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', done);
          window.addEventListener('pointercancel', done);
        });
        // keyboard: Enter / Space switches one lamp
        grid.addEventListener('click', (e) => {
          const btn = e.target.closest('button.syn-cell');
          if (!btn || e.detail !== 0) return;
          setCell(btn, !btn.classList.contains('on'));
          CoC.audio.sfx.click();
          refreshStatus();
          changed();
        });
      }

      // stamps (issued in later missions and on the proving ground)
      if (stamps) {
        const bar = el('div', 'syn-stamps');
        const copy = el('button', 'syn-stamp', '⎘ Copy HQ rows');
        copy.type = 'button';
        copy.title = 'Write one check row for every parity lamp the HQ strip sends: the lamps it covers, and itself';
        copy.addEventListener('click', () => {
          const hq = hqLampCode(level);
          if (!hq || hq.why || !hq.rows) return flash(hq && hq.why ? hq.why : 'Nothing to copy from the HQ strip.', 'bad');
          if (!hq.rows.length) return flash('The HQ strip sends no check lamps.', 'bad');
          if (hq.rows.length > 5) return flash('The HQ strip sends more than 5 check lamps; the board holds 5 rows.', 'bad');
          const keep = {};
          for (const [key, fix] of Object.entries(b.p.table || {})) if (key.length === hq.rows.length) keep[key] = fix;
          b.p.rows = hq.rows.map((x) => x.slice());
          b.p.table = keep;
          CoC.audio.sfx.place();
          changed();
          rerender();
        });
        const singles = el('button', 'syn-stamp', '▦ Fill singles');
        singles.type = 'button';
        singles.title = 'For every lamp, write its own column of H as a table line: that syndrome → flip that lamp';
        singles.addEventListener('click', () => {
          const byKey = new Map();
          for (let j = 1; j <= n; j++) {
            const k = colKey(j);
            if (k.includes('1')) byKey.set(k, [...(byKey.get(k) || []), j]);
          }
          const table = Object.assign({}, b.p.table);
          for (const [k, js] of byKey) if (js.length === 1) table[k] = js;
          b.p.table = table;
          CoC.audio.sfx.place();
          changed();
          rerender();
        });
        bar.append(copy, singles);
        hsec.appendChild(bar);
      }
      const status = el('div', 'syn-status');
      status.setAttribute('role', 'status');
      hsec.appendChild(status);
      wrap.appendChild(hsec);

      // ------------------------------------------------ bench test: jam lamps yourself and watch the plate answer
      const bench = el('div', 'syn-sec syn-bench');
      const bcap = el('div', 'syn-cap');
      bcap.appendChild(el('span', 'syn-title', 'Bench test'));
      bcap.appendChild(el('span', 'syn-legend bench-tip', 'click a lamp to jam it'));
      const other = el('button', 'syn-stamp bench-other', '↻ Another order');
      other.type = 'button';
      other.title = 'Put a different order through the bench';
      bcap.appendChild(other);
      bench.appendChild(bcap);
      const bbody = el('div', 'bench-body');
      bench.appendChild(bbody);
      wrap.appendChild(bench);
      let benchOn = null; // which order lamps are lit (null: HQ's sample order)
      const jammed = new Set();
      const flipAt = (str, set) => [...str].map((c, i) => (set.has(i + 1) ? (c === '1' ? '0' : c === '0' ? '1' : c) : c)).join('');
      const benchSignal = () => {
        const app = CoC.app;
        if (!app || !app.S || !level) return {};
        try {
          const tpl = CoC.engine.templateOf(level);
          if (!tpl.vars.length || !tpl.vars.every((v) => /^[01]+$/.test(v.set))) return { why: 'The bench works on lamp orders only.' };
          const msg = benchOn
            ? tpl.cells.map((c) => (c.lit !== undefined ? c.lit : benchOn.includes(c.v) ? '1' : '0')).join('')
            : app.S.preview && app.S.preview.msg;
          if (!msg) return {};
          const out = CoC.engine.runEncoder(level, app.S.enc, msg).out;
          if (!/^[01]+$/.test(out)) return { why: 'The HQ strip does not send plain lamps.' };
          return { out };
        } catch (e) {
          return { why: e.message };
        }
      };
      other.addEventListener('click', () => {
        let tpl;
        try {
          tpl = CoC.engine.templateOf(level);
        } catch (e) {
          return;
        }
        const was = benchOn ? benchOn.join() : null;
        let next;
        for (let t = 0; t < 8; t++) {
          next = tpl.vars.map((_, v) => v).filter(() => Math.random() < 0.5);
          if (next.join() !== was) break;
        }
        benchOn = next;
        jammed.clear();
        CoC.audio.sfx.click();
        drawBench();
      });
      bbody.addEventListener('click', (e) => {
        const btn = e.target.closest('button.bench-lamp');
        if (!btn) return;
        const j = +btn.dataset.j;
        if (jammed.has(j)) jammed.delete(j);
        else jammed.add(j);
        CoC.audio.sfx.click();
        drawBench();
      });
      const lampRow = (str, cls, clickable) =>
        [...str]
          .map((c, i) => {
            const j = i + 1;
            const extra = (cls[j] || '') + (c === '1' ? ' on' : '');
            return clickable
              ? `<button type="button" class="bench-lamp${extra}" data-j="${j}" title="${jammed.has(j) ? 'Undo the jam on' : 'Jam'} lamp #${j}"><i></i><small>#${j}</small></button>`
              : `<span class="bench-lamp${extra}"><i></i><small>#${j}</small></span>`;
          })
          .join('');
      const drawBench = () => {
        for (const n of wrap.querySelectorAll('.syn-row.lit, .syn-h .hit, .syn-h .fixing')) n.classList.remove('lit', 'hit', 'fixing');
        const sig = benchSignal();
        if (!sig.out) {
          bbody.textContent = '';
          bbody.appendChild(el('div', 'bench-verdict', '')).textContent = sig.why || 'Build an HQ strip, then test it here.';
          return;
        }
        const sent = sig.out;
        for (const j of [...jammed]) if (j > sent.length) jammed.delete(j);
        const recv = flipAt(sent, jammed);
        const rowsNow = locked ? CoC.engine.CAPTURED_H.rows : b.p.rows || [];
        const table = locked ? CoC.engine.CAPTURED_H.table : b.p.table || {};
        const bits = CoC.engine.syndromeBits(recv, rowsNow);
        const key = bits.join('');
        const hit = key.includes('1');
        const fix = hit ? table[key] || [] : [];
        const out = flipAt(recv, new Set(fix));
        const jamCls = {};
        for (const j of jammed) jamCls[j] = ' jam';
        const fixCls = {};
        for (const j of fix) fixCls[j] = jammed.has(j) ? ' fixed' : ' wrong';
        const odd = bits.map((x, i) => (x ? i + 1 : 0)).filter(Boolean);
        const spell = locked && hit ? ` = <b>${parseInt(key, 2)}</b>` : '';
        let h = `<div class="bench-line"><span class="bench-lbl">${jammed.size ? 'Arrives' : 'HQ sends'}</span><span class="bench-lamps">${lampRow(recv, jamCls, true)}</span></div>`;
        h +=
          `<div class="bench-line"><span class="bench-lbl">Checks</span><span class="bench-checks">` +
          bits.map((x, i) => `<span class="bench-chk${x ? ' odd' : ''}" title="Row ${i + 1}: ${x ? 'an odd' : 'an even'} number of its lamps are lit">r${i + 1} ${x ? 'odd' : 'even'}</span>`).join('') +
          `</span><span class="bench-syn">→ ${lamps(key)}${spell}</span></div>`;
        if (hit) h += `<div class="bench-line"><span class="bench-lbl">Leaves</span><span class="bench-lamps">${lampRow(out, fixCls, false)}</span></div>`;
        let cls;
        let text;
        const rowList = (list) => (list.length === 1 ? `row ${list[0]}` : `rows ${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
        const howRead = locked ? ` Odd reads 1, even reads 0: ${[...key].join(' ')} is ${parseInt(key, 2)} in binary.` : '';
        if (!hit && !jammed.size) {
          cls = 'ok';
          text = 'Every check is even: the plate passes the signal on untouched. Now click a lamp to jam it, as the jammer would.';
        } else if (!hit) {
          cls = 'bad';
          text = 'Every check is still even, so the plate sees nothing wrong and passes on a damaged signal.';
        } else if (!fix.length) {
          cls = 'bad';
          text = `${rowList(odd)[0].toUpperCase() + rowList(odd).slice(1)} came out odd, but the table has no line for ${[...key].join(' ')}: the damage goes through unrepaired.`;
        } else if (out === sent) {
          cls = 'ok';
          text = `${rowList(odd)[0].toUpperCase() + rowList(odd).slice(1)} came out odd.${howRead} The plate flips #${fix.join(' #')}: back to exactly what HQ sent. ✓`;
        } else if (!jammed.size) {
          cls = 'bad';
          text =
            `Nothing was jammed, yet ${rowList(odd)} already fail${odd.length === 1 ? 's' : ''} as the signal leaves HQ.${howRead} ` +
            `The plate “repairs” #${fix.join(' #')} and spoils a good order. Every HQ transmission must light an even number of lamps in every row.`;
        } else {
          cls = 'bad';
          text = `${rowList(odd)[0].toUpperCase() + rowList(odd).slice(1)} came out odd.${howRead} The plate flips #${fix.join(' #')}, but the jammer hit #${[...jammed].sort((x, y) => x - y).join(' #')}: the order comes out wrong.`;
        }
        h += `<div class="bench-verdict ${cls}">${text}</div>`;
        bbody.innerHTML = h;
        // show the same story on the board: the jammed columns, the table line it lands on, the lamp it flips
        for (const j of jammed) for (const c of grid.querySelectorAll(`[data-col="${j}"]`)) c.classList.add('hit');
        if (hit) {
          const line = wrap.querySelector(`.syn-row[data-key="${key}"]`);
          if (line) line.classList.add('lit');
          for (const j of fix) for (const c of grid.querySelectorAll(`thead [data-col="${j}"]`)) c.classList.add('fixing');
        }
      };
      let flashTimer = 0;
      const flash = (text, cls) => {
        status.className = `syn-status ${cls || ''}`;
        status.textContent = text;
        CoC.audio.sfx.remove();
        clearTimeout(flashTimer);
        flashTimer = setTimeout(refreshStatus, 3200);
      };
      const refreshStatus = () => {
        const s = synStatus(level, locked ? CoC.engine.CAPTURED_H.rows : b.p.rows, n, locked);
        status.className = `syn-status ${s.cls}`;
        status.textContent = s.text;
        drawBench();
      };

      // ------------------------------------------------ the table: syndrome → lamps to flip
      const tsec = el('div', 'syn-sec');
      const tcap = el('div', 'syn-cap');
      tcap.appendChild(el('span', 'syn-title', locked ? 'Table · as wired' : 'Syndrome table'));
      tcap.appendChild(el('span', 'syn-legend', 'r1…r' + r + ' → fix'));
      tsec.appendChild(tcap);
      const list = el('div', 'syn-table');
      for (let k = 0; k < 1 << r; k++) {
        const key = keyOf(k);
        const line = el('div', 'syn-row' + (k ? '' : ' zero'));
        line.dataset.key = key;
        line.appendChild(el('span', 'syn-bits', lamps(key)));
        line.appendChild(el('span', 'syn-arrow', '→'));
        if (!k) line.appendChild(el('span', 'syn-act', '✓ pass on'));
        else if (locked) {
          const fix = (P.table[key] || []).map((q) => '#' + q).join(' ');
          line.appendChild(el('span', 'syn-act', fix ? `flip ${fix}` : '—'));
          line.title = `syndrome ${key} is ${k} in binary: column #${k} of H`;
        } else {
          const btn = el('button', 'ctl syn-fix');
          btn.type = 'button';
          const paintBtn = () => {
            const fix = (b.p.table || {})[key] || [];
            btn.textContent = fix.length ? 'flip #' + compressRanges(fix) : '—';
            btn.classList.toggle('empty', !fix.length);
          };
          paintBtn();
          btn.addEventListener('click', () => {
            if (pop && pop.dataset.for === b.id + key) return closePopover();
            openPopover(btn, (p) => {
              p.dataset.for = b.id + key;
              positionsPicker(p, {
                n,
                title: `Syndrome ${[...key].join(' ')} · flip these lamps`,
                get: () => (b.p.table || {})[key] || [],
                set: (sel) => {
                  const table = Object.assign({}, b.p.table);
                  if (sel.length) table[key] = sel;
                  else delete table[key];
                  b.p.table = table;
                  paintBtn();
                  changed();
                  drawBench();
                },
              });
            });
          });
          line.appendChild(btn);
        }
        list.appendChild(line);
      }
      tsec.appendChild(list);
      wrap.appendChild(tsec);

      // the enemy's paperwork explains itself: hover a line to see the column it names
      if (locked) {
        list.addEventListener('pointerover', (e) => {
          const line = e.target.closest('.syn-row');
          for (const c of grid.querySelectorAll('.hint')) c.classList.remove('hint');
          if (!line || line.classList.contains('zero')) return;
          for (const c of grid.querySelectorAll(`[data-col="${parseInt(line.dataset.key, 2)}"]`)) c.classList.add('hint');
        });
        list.addEventListener('pointerleave', () => grid.querySelectorAll('.hint').forEach((c) => c.classList.remove('hint')));
      }
      // the strip may have changed since this panel was drawn: re-check (and redraw if the signal's length moved)
      wrap.addEventListener('pointerenter', () => {
        if (!locked && this.synWidth(b, b.p.rows) !== n && !pop) return rerender();
        refreshStatus();
      });
      refreshStatus();
      return wrap;
    }

    // tape → plate: {id, row} lights a check row while it is summed; {id, key, cols, flips} the table line it lands on
    onSyndromeFx(d) {
      const blk = d.id && this.root.querySelector(`.block[data-id="${CSS.escape(d.id)}"]`);
      const panel = blk && blk.querySelector(':scope > .syn-panel');
      if (!panel) return;
      for (const n of panel.querySelectorAll('.lit, .hit, .fixing')) n.classList.remove('lit', 'hit', 'fixing');
      if (d.row !== undefined) {
        const tr = panel.querySelector(`.syn-h tr[data-row="${d.row}"]`);
        if (tr) tr.classList.add('lit');
        return;
      }
      if (d.key === undefined) return;
      const line = panel.querySelector(`.syn-row[data-key="${d.key}"]`);
      if (line) {
        line.classList.add('lit');
        scrollWithin(line, 16);
      }
      for (const j of d.cols || []) for (const c of panel.querySelectorAll(`.syn-h [data-col="${j + 1}"]`)) c.classList.add('hit');
      for (const j of d.flips || []) for (const c of panel.querySelectorAll(`.syn-h thead [data-col="${j + 1}"]`)) c.classList.add('fixing');
    }

    // ---- live feedback
    setBadges(steps) {
      const byId = new Map((steps || []).map((s) => [s.id, s]));
      for (const badge of this.programEl.querySelectorAll('.badge')) {
        const id = badge.closest('.block').dataset.id;
        const st = byId.get(id);
        badge.textContent = st ? `${st.after.length}` : '';
        badge.title = st ? `${st.before} → ${st.after}` : '';
      }
    }

    clearHighlight() {
      for (const b of this.root.querySelectorAll('.block.active, .block.took-yes, .block.took-no'))
        b.classList.remove('active', 'took-yes', 'took-no');
      for (const n of this.root.querySelectorAll('.syn-panel .lit, .syn-panel .hit, .syn-panel .fixing')) n.classList.remove('lit', 'hit', 'fixing');
    }

    highlight(id, branch) {
      this.clearHighlight();
      const b = this.root.querySelector(`.block[data-id="${id}"]`);
      if (!b) return;
      b.classList.add('active');
      if (branch) b.classList.add(branch === 'yes' ? 'took-yes' : 'took-no');
      scrollWithin(b);
    }
  }

  CoC.Editor = Editor;
  CoC.editorUtil = { compressRanges, scrollWithin, selChip, selHintText, selMode, announceSelection, isTyping, modalOpen, canHover };
})();
