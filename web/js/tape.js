/* Chain of Command — the message tape under the line.
 *
 * The tape keeps real tile elements across steps: a tile is a physical slip with an identity, so whatever touches
 * the message acts on the SAME slips — a relay switches a lamp or flaps a letter over, two slips trade places,
 * couriers carry parcels; HQ copies slips off the order and stamps repeat groups; field plates pluck, cut and sort;
 * the assembler reads (and votes) the order back off the tape. Movement uses FLIP (measure → change the DOM →
 * animate the transform back to zero), which works across wrapped rows.
 *
 * Above the tiles the tape can carry a "stage" row (the order HQ copies from, the order form the field fills in,
 * and a working line for tallies: parity counts, check-digit sums, votes).
 *
 *   CoC.tape.create(el, { cls(ch) -> className, alpha() -> glyph pool, speed() -> playback rate })
 *     .show(before, after)       before === null: just show `after` (keeps the tiles if it already does);
 *                                otherwise animate the generic diff (not awaited).
 *     .liftOrder(o)  -> Promise  the order on the tape rises into the stage row (HQ copies from it).
 *     .clearStage(o) -> Promise
 *     .encode(step, o) -> Promise   act out one HQ strip item from its engine trace (step.fx).
 *     .relay(step, o)  -> Promise   act out one relay from its engine fx record.
 *     .plate(step, o)  -> Promise   act out one field plate / decision plate.
 *     .assemble(step, o) -> Promise read the order off the tape into the order form.
 *     .text()                    the glyphs currently on the tape.
 *   o = { speed(), alive(), tpl: {cells, vars} }
 *   CoC.tape.diffOps(a, b)       LCS edit script (keep / del / ins / chg).
 *   CoC.tape.applyFx(s, fx)      the string a relay fx record turns `s` into (sanity check for the record).
 *
 * Every effect ends with a consistency check against the real string and falls back to a clean render.
 */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FALLBACK_POOL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  // classes the effects add for a moment; repainting a tile keeps them, starting a new step clears them
  const TRANSIENT = ['fx-flap', 'fx-mark', 'fx-doomed', 'fx-test', 'fx-grp-a', 'fx-grp-b', 'fx-tag', 'fx-win', 'fx-lose'];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function diffOps(a, b) {
    const n = a.length;
    const m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const ops = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) ops.push({ t: 'keep', c: b[j++], _: i++ });
      else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ t: 'del', c: a[i++] });
      else ops.push({ t: 'ins', c: b[j++] });
    }
    while (i < n) ops.push({ t: 'del', c: a[i++] });
    while (j < m) ops.push({ t: 'ins', c: b[j++] });
    const out = [];
    for (let k = 0; k < ops.length; k++) {
      const o = ops[k];
      const nx = ops[k + 1];
      if (nx && ((o.t === 'del' && nx.t === 'ins') || (o.t === 'ins' && nx.t === 'del'))) {
        out.push({ t: 'chg', c: o.t === 'ins' ? o.c : nx.c });
        k++;
      } else out.push(o);
    }
    return out;
  }

  // Same-length strings that differ in a few places are edited in place (a slip is flipped over) rather than as a
  // delete here and an insert there.
  function editScript(a, b) {
    const ops = diffOps(a, b);
    if (a.length !== b.length) return ops;
    const cost = ops.filter((o) => o.t !== 'keep').length;
    let mism = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) mism++;
    return mism <= cost ? [...b].map((c, i) => ({ t: a[i] === c ? 'keep' : 'chg', c })) : ops;
  }

  function chunkIdx(n, size) {
    const out = [];
    for (let i = 0; i < n; i += size) out.push(Array.from({ length: Math.min(size, n - i) }, (_, k) => i + k));
    return out;
  }

  function applyFx(s, fx) {
    if (!fx) return s;
    const at = (i, c, cut = 1) => s.slice(0, i) + c + s.slice(i + cut);
    switch (fx.type) {
      case 'sub':
      case 'flip':
        return at(fx.i, fx.to);
      case 'smudge':
        return at(fx.i, '?');
      case 'del':
        return at(fx.i, '');
      case 'ins':
        return at(fx.i, fx.c, 0);
      case 'swap':
        return s.slice(0, fx.i) + s[fx.j] + s.slice(fx.i + 1, fx.j) + s[fx.i] + s.slice(fx.j + 1);
      case 'burst':
        return s.slice(0, fx.start) + fx.to + s.slice(fx.start + fx.len);
      case 'pad':
        return fx.front + s + fx.back;
      case 'shuffle': {
        const parts = chunkIdx(s.length, fx.size).map((g) => g.map((i) => s[i]).join(''));
        return fx.order.map((i) => parts[i]).join('');
      }
      case 'reverse':
        return [...s].reverse().join('');
      default:
        return null;
    }
  }

  // What a field plate's fx record turns `s` into (null: no structured record to act out).
  function applyPlate(s, fx) {
    if (!fx) return null;
    switch (fx.type) {
      case 'none':
      case 'cond':
        return s;
      case 'strip':
        return [...s].filter((_, i) => !fx.drop.includes(i)).join('');
      case 'swap':
      case 'flip':
        return applyFx(s, fx.type === 'flip' ? { type: 'flip', i: fx.i, to: fx.to } : fx);
      case 'between':
        return s.slice(fx.a + 1, fx.b);
      case 'reassemble': {
        const parts = chunkIdx(s.length, fx.size).map((g) => g.map((i) => s[i]).join(''));
        return fx.order.map((i) => parts[i].slice(1)).join('');
      }
      case 'syndrome': {
        const arr = [...s];
        for (const f of fx.flips || []) arr[f.i] = f.to;
        return arr.join('');
      }
      default:
        return null;
    }
  }

  // A smooth parabolic hop from the tile's old spot (dx, dy away) back to its new one.
  function arcFrames(dx, dy, lift = 0, rot = 0, n = 10) {
    const kf = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = dx * (1 - t);
      const y = dy * (1 - t) + lift * 4 * t * (1 - t);
      kf.push({ transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${(rot * Math.sin(Math.PI * t)).toFixed(2)}deg)` });
    }
    return kf;
  }

  function create(el, opt) {
    let recs = []; // [{ el, b, ch, extra }] in tape order
    let stage = null; // { el, cap, row, calc, recs }
    let gen = 0; // bumped by every new operation; older async effects see it and stop
    let speedFn = opt.speed;
    let aliveFn = () => true;
    const live = new Set();
    const held = new Set(); // fill:'forwards' animations: they outlive `live` and are cancelled by the next step
    const leaving = new Set(); // elements out of the flow (falling slips, flying copies)

    const speed = () => Math.max(0.05, +speedFn() || 1);
    const still = () => reducedMotion();
    const pool = () => {
      const a = (opt.alpha && opt.alpha()) || '';
      return a.length > 1 ? a : FALLBACK_POOL;
    };
    const rand = (avoid = '') => {
      const p = [...pool()].filter((c) => !avoid.includes(c));
      return p.length ? p[Math.floor(Math.random() * p.length)] : pool()[0];
    };

    // ------------------------------------------------------------ tiles
    function paint(r) {
      const keep = TRANSIENT.filter((c) => r.el.classList.contains(c));
      r.el.className = [opt.cls(r.ch), r.extra, ...keep].filter(Boolean).join(' ');
    }
    function setCh(r, ch) {
      r.ch = ch;
      r.b.textContent = ch;
      paint(r);
    }
    function make(ch, extra = '') {
      const t = document.createElement('span');
      const b = document.createElement('b');
      t.appendChild(b);
      const r = { el: t, b, ch: '', extra };
      setCh(r, ch);
      return r;
    }
    const text = () => recs.map((r) => r.ch).join('');
    const onTape = () => [...el.querySelectorAll(':scope > .tile:not(.leaving), :scope > .parcel > .tile:not(.leaving)')];
    const domText = () => onTape().map((t) => (t.querySelector('b') || {}).textContent || '').join('');
    const consistent = (s) => text() === s && domText() === s && onTape().length === s.length;
    function commit(list = recs) {
      el.replaceChildren(...(stage ? [stage.el] : []), ...list.map((r) => r.el), ...leaving);
    }
    function hard(str) {
      recs = [...str].map((c) => make(c));
      commit();
    }
    const measure = (list) => new Map(list.map((x) => [x.el || x, (x.el || x).getBoundingClientRect()]));
    // a rect relative to the tape's padding box (for absolutely placed slips)
    function local(node) {
      const r = node.getBoundingClientRect();
      const e = el.getBoundingClientRect();
      return { x: r.left - e.left - el.clientLeft, y: r.top - e.top - el.clientTop, w: r.width, h: r.height, rect: r };
    }

    // ------------------------------------------------------------ time (follows the speed control live)
    function anim(target, kf, o = {}) {
      if (still() || !target.animate) return null;
      const a = target.animate(kf, { duration: 500, easing: 'ease', fill: 'none', ...o });
      a.playbackRate = speed();
      live.add(a);
      if (o.fill === 'forwards' || o.fill === 'both') held.add(a);
      const done = () => live.delete(a);
      a.finished.then(done, done);
      return a;
    }
    const current = (g) => g === gen && aliveFn();
    async function wait(ms, g) {
      if (still()) ms *= 0.5; // reduced motion: nothing moves, but each state still holds long enough to read
      let t = 0;
      while (t < ms) {
        if (!current(g)) return false;
        const s = speed();
        live.forEach((a) => a.playbackRate !== s && (a.playbackRate = s));
        const dt = Math.min(30, (ms - t) / s);
        await sleep(dt);
        t += dt * s;
      }
      return current(g);
    }
    // the reduced-motion stand-in for an effect: the state changes at once and the touched tiles glow briefly
    function mark(list, g) {
      if (!still()) return;
      list.forEach((r) => r && r.el.classList.add('fx-mark'));
      setTimeout(() => g === gen && list.forEach((r) => r && r.el.classList.remove('fx-mark')), 700 / speed());
    }

    function begin(o = {}) {
      gen++;
      speedFn = o.speed || opt.speed;
      aliveFn = o.alive || (() => true);
      live.forEach((a) => {
        try {
          a.finish();
        } catch (e) {
          a.cancel();
        }
      });
      live.clear();
      held.forEach((a) => a.cancel());
      held.clear();
      leaving.forEach((e) => e.remove());
      leaving.clear();
      el.querySelectorAll('.blot, .tape-tick').forEach((e) => e.remove());
      // someone else cleared the tape (a level was opened): start from nothing
      if (stage && !el.contains(stage.el)) stage = null;
      if (recs.some((r) => !el.contains(r.el))) recs = [];
      const clean = (r) => {
        TRANSIENT.forEach((c) => r.el.classList.remove(c));
        r.el.removeAttribute('style');
        r.b.removeAttribute('style');
      };
      recs.forEach(clean);
      if (stage) {
        stage.recs.forEach(clean);
        stage.el.removeAttribute('style');
      }
      // an interrupted courier run leaves parcels behind: put the tiles straight back on the tape
      const kids = [...el.children].filter((k) => !stage || k !== stage.el);
      if (kids.length !== recs.length || kids.some((k, i) => k !== recs[i].el) || (stage && el.firstElementChild !== stage.el)) commit();
      return gen;
    }

    // ------------------------------------------------------------ the stage row
    function ensureStage(cap = '') {
      if (!stage) {
        const s = document.createElement('div');
        s.className = 'tape-stage';
        s.innerHTML = '<span class="stage-cap"></span><span class="stage-row"></span><span class="stage-calc"></span>';
        stage = { el: s, cap: s.children[0], row: s.children[1], calc: s.children[2], recs: [] };
        el.insertBefore(s, el.firstChild);
      }
      if (cap) stage.cap.textContent = cap;
      return stage;
    }
    function calc(html) {
      const st = ensureStage();
      st.calc.innerHTML = html;
      if (html) anim(st.calc, [{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { duration: 220 });
      return st.calc;
    }
    // removing the stage shortens the tape: let the slips glide up instead of jumping
    function dropStage() {
      if (!stage) return;
      const first = measure(recs);
      stage.el.remove();
      stage = null;
      flipFrom(first, recs, { duration: 300 });
    }

    // ------------------------------------------------------------ moves
    // FLIP every item of `list` from its `first` rect to where it is now.
    function flipFrom(first, list, o = {}) {
      list.forEach((x, idx) => {
        const node = x.el || x;
        const f = first.get(node);
        if (!f) return;
        const l = node.getBoundingClientRect();
        const dx = f.left - l.left;
        const dy = f.top - l.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        const path = o.path ? o.path(x, idx, dx, dy) : null;
        const kf = path ? arcFrames(dx, dy, path.lift, path.rot) : [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }];
        if (path && path.z) node.style.zIndex = path.z;
        const a = anim(node, kf, { duration: o.duration || 420, easing: o.easing || 'cubic-bezier(.3,.7,.3,1)', delay: (o.stagger || 0) * idx, fill: 'backwards' });
        if (a && path && path.z) a.finished.then(() => (node.style.zIndex = ''), () => {});
      });
    }
    const tint = (r, color, ms = 700) =>
      anim(r.el, [{ boxShadow: `inset 0 0 0 40px ${color}` }, { boxShadow: 'inset 0 0 0 40px rgba(0,0,0,0)' }], { duration: ms, easing: 'ease-out' });
    const isLampFlip = (r, ch) => r.el.classList.contains('lamp') && /^[01]$/.test(ch);
    function flapOnce(r, ch, ms) {
      const a = anim(r.b, [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-90deg)' }], { duration: ms / 2, easing: 'ease-in' });
      const flipIn = () => {
        setCh(r, ch);
        return anim(r.b, [{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(0deg)' }], { duration: ms / 2, easing: 'ease-out' });
      };
      if (!a) return (flipIn(), Promise.resolve());
      return a.finished.then(() => {
        const b = flipIn();
        return b ? b.finished : null;
      }, () => setCh(r, ch));
    }
    // change a slip's symbol where it stands: a lamp is switched, a letter flaps over
    function turn(r, ch, ms = 300) {
      if (isLampFlip(r, ch)) {
        setCh(r, ch);
        anim(r.el, [{ filter: 'brightness(1)', transform: 'scale(1)' }, { filter: 'brightness(1.9)', transform: 'scale(1.15)', offset: 0.25 }, { filter: 'brightness(1)', transform: 'scale(1)' }], { duration: 520 });
        return Promise.resolve();
      }
      return flapOnce(r, ch, ms);
    }
    // take a slip out of the flow where it stands; the returned function sends it away
    function lift(r) {
      const p = local(r.el);
      return (style = 'fall') => {
        r.el.classList.add('leaving');
        r.el.style.left = `${p.x}px`;
        r.el.style.top = `${p.y}px`;
        leaving.add(r.el);
        el.appendChild(r.el);
        const dir = Math.random() < 0.5 ? -1 : 1;
        const KF = {
          fall: [
            { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
            { transform: `translate(${dir * 3}px, 6px) rotate(${dir * 8}deg)`, opacity: 1, offset: 0.25 },
            { transform: `translate(${dir * 10}px, 48px) rotate(${dir * 38}deg)`, opacity: 0 },
          ],
          pluck: [
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: 'translate(0,-14px) scale(1.08)', opacity: 1, offset: 0.35 },
            { transform: `translate(${dir * 6}px,-40px) scale(.9) rotate(${dir * 10}deg)`, opacity: 0 },
          ],
          tear: [
            { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
            { transform: `translate(${dir * 4}px,-4px) rotate(${dir * -18}deg)`, opacity: 1, offset: 0.25 },
            { transform: `translate(${dir * 26}px, 44px) rotate(${dir * 120}deg)`, opacity: 0 },
          ],
          fade: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px) scale(.9)' }],
        };
        const a = anim(r.el, KF[style] || KF.fall, { duration: style === 'fade' ? 320 : 600, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' });
        const gone = () => {
          r.el.remove();
          leaving.delete(r.el);
        };
        if (a) a.finished.then(gone, gone);
        else gone();
      };
    }
    // remove several slips at once; the gaps close under them
    function removeTiles(list, style = 'fall', closeMs = 460) {
      const set = new Set(list);
      const first = measure(recs);
      const goes = list.map((r) => lift(r));
      recs = recs.filter((r) => !set.has(r));
      commit();
      goes.forEach((go) => go(style));
      flipFrom(first, recs, { duration: closeMs, easing: 'cubic-bezier(.4,0,.2,1)' });
    }
    function dropIn(r, delay = 0, from = { x: 0, y: -46, rot: -14 }) {
      return anim(
        r.el,
        [
          { transform: `translate(${from.x}px, ${from.y}px) rotate(${from.rot}deg) scale(.85)`, opacity: 0 },
          { transform: `translate(${from.x * 0.1}px, 3px) rotate(0deg) scale(1)`, opacity: 1, offset: 0.75 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 520, delay, easing: 'cubic-bezier(.3,.8,.4,1)', fill: 'backwards' }
      );
    }
    // a stamped-in slip (markers, computed check symbols)
    function stampIn(r, delay = 0) {
      return anim(
        r.el,
        [
          { transform: 'translateY(-10px) scale(1.5)', opacity: 0 },
          { transform: 'translateY(0) scale(.92)', opacity: 1, offset: 0.6 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 420, delay, easing: 'cubic-bezier(.5,0,.5,1)', fill: 'backwards' }
      );
    }
    // a copy of `fromNode` flies (along an arc) to where `dest` stands; dest stays hidden until it lands
    async function fly(fromNode, dest, ch, g, o = {}) {
      if (!fromNode || !fromNode.isConnected) {
        dropIn(dest);
        return wait(o.ms || 520, g);
      }
      const a = local(fromNode);
      const b = local(dest.el);
      if (still()) return current(g);
      const gh = make(ch, 'ghost');
      gh.el.classList.add('leaving');
      gh.el.style.left = `${b.x}px`;
      gh.el.style.top = `${b.y}px`;
      gh.el.style.width = `${b.w}px`;
      gh.el.style.height = `${b.h}px`;
      leaving.add(gh.el);
      el.appendChild(gh.el);
      dest.el.style.visibility = 'hidden';
      const ms = o.ms || 520;
      const sx = a.w / Math.max(1, b.w);
      const sy = a.h / Math.max(1, b.h);
      const kf = arcFrames(a.x - b.x, a.y - b.y, o.lift ?? -26, o.rot ?? 0).map((f, k, all) => {
        const t = k / (all.length - 1);
        const s = `scale(${(sx + (1 - sx) * t).toFixed(3)}, ${(sy + (1 - sy) * t).toFixed(3)})`;
        return { transform: `${f.transform} ${s}` };
      });
      const an = anim(gh.el, kf, { duration: ms, easing: 'cubic-bezier(.45,.05,.35,1)', delay: o.delay || 0, fill: 'backwards' });
      if (o.flipTo !== undefined && o.flipTo !== ch) {
        // ¬ readers / copies: the symbol is turned over in flight
        if (!(await wait((o.delay || 0) + ms * 0.4, g))) return false;
        await turn(gh, o.flipTo, 160);
        if (!current(g)) return false;
        if (!(await wait(ms * 0.3, g))) return false;
      } else if (!(await wait((o.delay || 0) + ms, g))) return false;
      if (an) await an.finished.catch(() => {});
      gh.el.remove();
      leaving.delete(gh.el);
      dest.el.style.visibility = '';
      if (!o.quiet) anim(dest.el, [{ transform: 'translateY(-2px) scale(1.06)' }, { transform: 'none' }], { duration: 180 });
      return current(g);
    }

    // ------------------------------------------------------------ show / diff (generic fallback)
    function render(str) {
      begin();
      if (text() === str && consistent(str)) {
        recs.forEach((r) => {
          r.extra = '';
          paint(r);
        });
        return;
      }
      hard(str);
    }

    function diff(before, after, o = {}) {
      const g = o.g || begin();
      if (!consistent(before)) hard(before);
      const first = measure(recs);
      const next = [];
      const outs = [];
      const born = [];
      const changed = [];
      let k = 0;
      for (const op of editScript(before, after)) {
        if (op.t === 'keep') next.push(recs[k++]);
        else if (op.t === 'del') outs.push(lift(recs[k++]));
        else if (op.t === 'chg') {
          const r = recs[k++];
          changed.push([r, op.c]);
          next.push(r);
        } else {
          const r = make(op.c);
          born.push(r);
          next.push(r);
        }
      }
      recs = next;
      commit();
      outs.forEach((go) => go(o.outStyle || 'fall'));
      flipFrom(first, recs, { duration: 380 });
      born.forEach((r, i) => {
        dropIn(r, Math.min(i, 6) * 40, { x: 0, y: -26, rot: -6 });
        tint(r, o.tint || 'rgba(255, 214, 90, .75)', 900);
      });
      changed.forEach(([r, c]) => {
        turn(r, c, 300);
        tint(r, o.tint || 'rgba(255, 196, 80, .7)', 800);
      });
      mark([...born, ...changed.map((x) => x[0])], g);
    }

    // ------------------------------------------------------------ couriers (shared by the relay and the plate)
    // Box the tape into parcels of `size`, carry each parcel as one object to its slot in `order`, then unpack.
    // With `tags`, each parcel's first slip is its sorting tag, torn off on arrival.
    async function courier(size, order, g, o = {}) {
      const groups = chunkIdx(recs.length, size).map((ix) => ix.map((i) => recs[i]));
      let first = measure(recs);
      const parcels = groups.map((grp, k) => {
        const p = document.createElement('span');
        p.className = 'parcel packing';
        p.dataset.n = o.tags ? '' : k + 1;
        if (o.tags) p.classList.add('tagged');
        p.append(...grp.map((r) => r.el));
        if (o.tags && grp[0]) grp[0].el.classList.add('fx-tag');
        return p;
      });
      el.replaceChildren(...(stage ? [stage.el] : []), ...parcels);
      flipFrom(first, recs, { duration: 260 });
      void el.offsetWidth;
      parcels.forEach((p) => {
        p.style.transitionDuration = `${still() ? 0 : 240 / speed()}ms`;
        p.classList.remove('packing');
      });
      if (!(await wait(o.tags ? 520 : 340, g))) return false;
      // the parcels travel, each in one piece, to their new places
      first = measure(parcels);
      const arrived = order.map((i) => parcels[i]);
      el.replaceChildren(...(stage ? [stage.el] : []), ...arrived);
      flipFrom(first, arrived, {
        duration: 640,
        easing: 'cubic-bezier(.45,.05,.35,1)',
        stagger: 30,
        path: (p, k) => {
          const moved = k - order[k];
          const amp = 14 + 7 * Math.min(4, Math.abs(moved));
          return moved > 0 ? { lift: -amp, rot: 5, z: 4 + k } : moved < 0 ? { lift: amp, rot: -5, z: 3 } : { lift: -6, rot: 0, z: 2 };
        },
      });
      arrived.forEach((p, k) =>
        order[k] === k ? anim(p, [{ transform: 'translateY(0)' }, { transform: 'translateY(-5px)' }, { transform: 'translateY(0)' }], { duration: 420, delay: 120 }) : null
      );
      const sorted = order.map((i) => groups[i]);
      recs = sorted.flat();
      mark(recs, g);
      if (!(await wait(700 + 30 * arrived.length, g))) return false;
      if (!(await wait(260, g))) return false;
      if (o.tags) {
        // the sorting tags are torn off; the parcels close up
        first = measure(arrived);
        const tags = sorted.map((grp) => grp[0]).filter(Boolean);
        const goes = tags.map((r) => lift(r));
        sorted.forEach((grp) => grp.shift());
        recs = sorted.flat();
        goes.forEach((go) => go('tear'));
        flipFrom(first, arrived, { duration: 360 });
        if (!(await wait(560, g))) return false;
      }
      arrived.forEach((p) => {
        p.style.transitionDuration = `${still() ? 0 : 200 / speed()}ms`;
        p.classList.add('packing');
      });
      if (!(await wait(200, g))) return false;
      first = measure(recs);
      commit();
      flipFrom(first, recs, { duration: 260 });
      return wait(300, g);
    }

    async function swapTiles(i, j, g, cls) {
      const a = recs[i];
      const b = recs[j];
      a.el.classList.add(cls);
      b.el.classList.add(cls);
      const first = measure(recs);
      recs[i] = b;
      recs[j] = a;
      commit();
      flipFrom(first, [a, b], { duration: 720, easing: 'cubic-bezier(.45,.05,.35,1)', path: (x) => (x === a ? { lift: -22, rot: 8, z: 3 } : { lift: 18, rot: -8, z: 2 }) });
      mark([a, b], g);
      if (!(await wait(760, g))) return false;
      a.el.classList.remove(cls);
      b.el.classList.remove(cls);
      return wait(120, g);
    }

    async function lampFlicker(r, to, g) {
      const from = r.ch;
      anim(r.el, [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.18)', filter: 'brightness(1.9)', offset: 0.2 }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 760, easing: 'ease-out' });
      for (const [c, ms] of [[to, 80], [from, 60], [to, 110], [from, 70], [to, 0]]) {
        setCh(r, c);
        if (ms && !(await wait(ms, g))) return false;
      }
      mark([r], g);
      return wait(440, g);
    }

    function tick(g, label = '✓ passed on', cls = '') {
      const t = document.createElement('span');
      t.className = `tape-tick ${cls}`;
      t.textContent = label;
      el.appendChild(t);
      const a = anim(t, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none', offset: 0.2 }, { opacity: 1, transform: 'none', offset: 0.8 }, { opacity: 0, transform: 'translateY(-3px)' }], { duration: 1100, fill: 'forwards' });
      const rm = () => t.remove();
      if (a) a.finished.then(rm, rm);
      else setTimeout(() => g === gen && rm(), 900 / speed());
    }

    // ------------------------------------------------------------ relay effects (awaited)
    const FX = {
      // a lamp switches on/off where it stands, with a flicker
      flip: (fx, g) => lampFlicker(recs[fx.i], fx.to, g),

      // a letter flaps over in place like a split-flap board, through a couple of wrong glyphs, with a red flash
      async sub(fx, g) {
        const r = recs[fx.i];
        r.el.classList.add('fx-flap');
        tint(r, 'rgba(200, 48, 30, .7)', 900);
        const seq = [rand(fx.from + fx.to), rand(fx.from + fx.to), fx.to];
        for (let k = 0; k < seq.length; k++) {
          const p = flapOnce(r, seq[k], k < seq.length - 1 ? 180 : 280);
          if (!still()) await p;
          if (!current(g)) return false;
        }
        r.el.classList.remove('fx-flap');
        mark([r], g);
        return wait(200, g);
      },

      // ink spreads over the slip; the symbol under it is lost
      async smudge(fx, g) {
        const r = recs[fx.i];
        const blot = document.createElement('i');
        blot.className = 'blot';
        r.el.appendChild(blot);
        anim(blot, [{ transform: 'scale(.05) rotate(-30deg)', opacity: 0.4 }, { transform: 'scale(1.25) rotate(10deg)', opacity: 1, offset: 0.6 }, { transform: 'scale(1) rotate(0deg)', opacity: 1 }], { duration: 560, easing: 'ease-out', fill: 'forwards' });
        const fade = anim(r.b, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
        if (!(await wait(330, g))) return false;
        if (fade) {
          fade.cancel();
          held.delete(fade);
        }
        setCh(r, '?');
        anim(r.b, [{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
        if (!(await wait(260, g))) return false;
        anim(blot, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
        if (!(await wait(260, g))) return false;
        blot.remove();
        mark([r], g);
        return wait(120, g);
      },

      // the two slips trade places along short arcs, one over and one under
      swap: (fx, g) => swapTiles(fx.i, fx.j, g, 'fx-doomed'),

      // the slip shakes loose and falls off the tape; the gap closes
      async del(fx, g) {
        const r = recs[fx.i];
        r.el.classList.add('fx-doomed');
        anim(r.el, [{ transform: 'translateX(0)' }, { transform: 'translateX(-2px) rotate(-3deg)' }, { transform: 'translateX(2px) rotate(3deg)' }, { transform: 'translateX(0)' }], { duration: 220 });
        if (!(await wait(240, g))) return false;
        removeTiles([r], 'fall');
        mark([recs[fx.i - 1], recs[fx.i]], g);
        return wait(620, g);
      },

      // the neighbours slide apart and a stray slip drops into the gap
      async ins(fx, g) {
        const first = measure(recs);
        const r = make(fx.c);
        recs.splice(fx.i, 0, r);
        commit();
        flipFrom(first, recs, { duration: 380, easing: 'cubic-bezier(.4,0,.2,1)' });
        dropIn(r, 200);
        tint(r, 'rgba(255, 214, 90, .8)', 1200);
        mark([r], g);
        return wait(800, g);
      },

      // the shelled stretch shakes, scorches, and its glyphs scramble into new ones
      async burst(fx, g) {
        const hit = recs.slice(fx.start, fx.start + fx.len);
        hit.forEach((r, k) => {
          anim(r.el, [0, -3, 3, -2, 2, -1, 0].map((x, q) => ({ transform: `translate(${x}px, ${q % 2 ? 1 : -1}px) rotate(${x}deg)` })), { duration: 420, delay: k * 15 });
          anim(r.el, [{ boxShadow: 'inset 0 0 0 40px rgba(255, 170, 40, .95), 0 0 16px rgba(255, 120, 20, .9)' }, { boxShadow: 'inset 0 0 0 40px rgba(60, 20, 5, .65), 0 0 6px rgba(255, 90, 0, .4)', offset: 0.35 }, { boxShadow: 'inset 0 0 0 40px rgba(0,0,0,0), 0 0 0 rgba(0,0,0,0)' }], { duration: 950, easing: 'ease-out' });
        });
        if (!still())
          for (let t = 0; t < 6; t++) {
            hit.forEach((r) => setCh(r, rand(r.ch)));
            if (!(await wait(75, g))) return false;
          }
        hit.forEach((r, k) => setCh(r, fx.to[k]));
        mark(hit, g);
        return wait(420, g);
      },

      // foreign traffic slides on at both ends of the transmission
      async pad(fx, g) {
        const first = measure(recs);
        const front = [...fx.front].map((c) => make(c, 'foreign'));
        const back = [...fx.back].map((c) => make(c, 'foreign'));
        recs = [...front, ...recs, ...back];
        commit();
        flipFrom(first, recs, { duration: 460, easing: 'cubic-bezier(.4,0,.2,1)' });
        const box = el.getBoundingClientRect();
        const slide = (r, x, delay) =>
          anim(r.el, [{ transform: `translateX(${x}px)`, opacity: 0 }, { transform: `translateX(${x * 0.3}px)`, opacity: 1, offset: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 560, delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' });
        front.forEach((r, k) => slide(r, box.left - r.el.getBoundingClientRect().right - 6, 120 + (front.length - 1 - k) * 70));
        back.forEach((r, k) => slide(r, box.right - r.el.getBoundingClientRect().left + 6, 120 + k * 70));
        mark([...front, ...back], g);
        return wait(560 + 120 + 70 * Math.max(front.length, back.length), g);
      },

      // Courier Corps: the tape is split into parcels, each parcel carried as one object to its new place
      shuffle: (fx, g) => courier(fx.size, fx.order, g),

      // every slip travels to its mirrored position, alternately over and under the tape
      async reverse(fx, g) {
        const first = measure(recs);
        const old = recs.slice();
        recs = old.slice().reverse();
        commit();
        flipFrom(first, old, {
          duration: 860,
          easing: 'cubic-bezier(.45,.05,.35,1)',
          path: (r, idx) => ({ lift: (idx % 2 ? 1 : -1) * (16 + (10 * Math.abs(idx - (old.length - 1) / 2)) / Math.max(1, old.length / 2)), rot: idx % 2 ? -8 : 8, z: 2 + (idx % 2) }),
        });
        mark(recs, g);
        return wait(900, g);
      },
    };

    async function relay(step, o = {}) {
      const g = begin(o);
      if (!consistent(step.before)) hard(step.before);
      const fx = step.fx;
      const play = fx && FX[fx.type] && applyFx(step.before, fx) === step.after;
      if (!play) {
        if (step.before === step.after) return tick(g);
        diff(step.before, step.after, { g }); // unknown or inconsistent record: fall back to the generic diff
        await wait(700, g);
      } else {
        try {
          await FX[fx.type](fx, g);
        } catch (e) {
          if (typeof console !== 'undefined') console.warn('tape effect failed', e);
        }
      }
      settle(g, step.after, o);
    }

    // never leave the tape out of step with the actual string (a superseded effect leaves that to its successor)
    function settle(g, want, o) {
      if (current(g) && !consistent(want)) {
        begin(o);
        hard(want);
      }
    }

    // ------------------------------------------------------------ HQ: building the transmission
    let tplCtx = null; // { cells, vars } of the order being built
    const symOf = (v) => (tplCtx && tplCtx.vars[v] ? tplCtx.vars[v].sym : '?');
    const stageIdxOf = (v) => (tplCtx ? tplCtx.cells.findIndex((c) => c.v === v) : -1);
    const stageTile = (v) => {
      const i = stageIdxOf(v);
      return stage && i >= 0 && stage.recs[i] ? stage.recs[i] : null;
    };
    const highlight = (list, cls = 'fx-test') => list.forEach((r) => r && r.el.classList.add(cls));

    // the order on the tape rises into the stage row; HQ copies from it
    async function liftOrder(o = {}) {
      const g = begin(o);
      tplCtx = o.tpl || tplCtx;
      const st = ensureStage(o.cap || 'Order');
      st.calc.innerHTML = '';
      const first = measure(recs);
      st.recs = recs;
      st.row.replaceChildren(...recs.map((r) => r.el));
      recs = [];
      commit();
      flipFrom(first, st.recs, { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)', stagger: 20 });
      return wait(560, g);
    }

    async function clearStage(o = {}) {
      const g = begin(o);
      if (!stage) return;
      const s = stage;
      const a = anim(s.el, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
      if (a) await a.finished.catch(() => {});
      if (g !== gen || stage !== s) return;
      dropStage();
      return wait(300, g);
    }

    // one strip item (or one item inside a repeat / if group): returns the slips it laid down, or false
    async function encPart(fx, g) {
      const add = (chars) => {
        const out = [...chars].map((c) => make(c));
        recs.push(...out);
        commit();
        return out;
      };
      switch (fx.type) {
        case 'src': {
          if (!fx.piece) return [];
          const src = stageTile(fx.v);
          if (src) src.el.classList.add('fx-test');
          const [r] = add(fx.piece);
          if (fx.not) {
            setCh(r, fx.from || fx.piece);
            calc(`copy ${esc(symOf(fx.v))} = <b>${esc(fx.from)}</b>, turned over → <b>${esc(fx.piece)}</b>`);
          }
          // straight copies are quick (~0.2 s a character); a ¬ copy keeps time for its flip to read
          const ok = await fly(src && src.el, r, fx.from || fx.piece, g, { flipTo: fx.not ? fx.piece : undefined, ms: fx.not ? 360 : 150, lift: -14 });
          if (fx.not && current(g)) setCh(r, fx.piece);
          if (src) src.el.classList.remove('fx-test');
          mark([r], g);
          return ok === false ? false : [r];
        }
        case 'lit': {
          const out = add(fx.piece);
          out.forEach((r, k) => stampIn(r, k * 60));
          mark(out, g);
          return (await wait(420, g)) ? out : false;
        }
        case 'rep': {
          const unit = [];
          calc(`repeat ×${fx.n}: lay out the group once…`);
          for (const p of fx.parts) {
            const got = await encPart(p, g);
            if (got === false) return false;
            unit.push(...got);
          }
          if (!unit.length) return [];
          unit.forEach((r) => r.el.classList.add('fx-test'));
          const out = unit.slice();
          for (let c = 2; c <= fx.n; c++) {
            calc(`repeat ×${fx.n}: copy ${c} of ${fx.n}`);
            const first = measure(unit);
            const copies = unit.map((r) => make(r.ch));
            recs.push(...copies);
            commit();
            // each copy is pressed off the group and slid into place
            copies.forEach((r, k) => first.set(r.el, first.get(unit[k].el)));
            flipFrom(first, copies, { duration: 520, easing: 'cubic-bezier(.45,.05,.35,1)', stagger: 25, path: () => ({ lift: -18, rot: 0, z: 3 }) });
            copies.forEach((r) => tint(r, 'rgba(255, 214, 90, .6)', 700));
            mark(copies, g);
            out.push(...copies);
            if (!(await wait(560 + 25 * copies.length, g))) return false;
          }
          unit.forEach((r) => r.el.classList.remove('fx-test'));
          return out;
        }
        case 'if': {
          const src = stageTile(fx.v);
          if (src) src.el.classList.add('fx-test');
          calc(`${esc(symOf(fx.v))} = <b>${esc(fx.from)}</b> in {${esc(fx.set)}}? <b class="${fx.yes ? 'yes' : 'no'}">${fx.yes ? 'YES → then lane' : 'NO → else lane'}</b>`);
          if (!(await wait(650, g))) return false;
          if (src) src.el.classList.remove('fx-test');
          const out = [];
          for (const p of fx.parts) {
            const got = await encPart(p, g);
            if (got === false) return false;
            out.push(...got);
          }
          return out;
        }
        case 'par': {
          const srcs = fx.vars.map(stageTile);
          highlight(srcs);
          const ones = fx.bits.filter((b) => b === '1').length;
          calc(`parity over ${fx.vars.map(symOf).map(esc).join('')}: ${fx.bits.map((b) => (b === '1' ? 1 : 0)).join(' + ') || '0'} = ${ones} → ${ones % 2 ? 'odd' : 'even'} → lamp <b>${fx.piece === '1' ? 'ON' : 'OFF'}</b>`);
          if (!(await wait(800, g))) return false;
          const out = add(fx.piece);
          out.forEach((r) => {
            stampIn(r);
            tint(r, 'rgba(255, 214, 90, .7)', 800);
          });
          mark(out, g);
          const ok = await wait(460, g);
          srcs.forEach((r) => r && r.el.classList.remove('fx-test'));
          return ok ? out : false;
        }
        case 'chk': {
          // dial check: Σ weight × digit, then the remainder mod m (the tile's modulus dial)
          const m = fx.mod || 11;
          const srcs = fx.terms.map((t) => stageTile(t.v));
          highlight(srcs);
          fx.terms.forEach((t, k) => srcs[k] && (srcs[k].el.dataset.w = '×' + t.w));
          const r = ((fx.sum % m) + m) % m;
          const terms = fx.terms.map((t) => `${t.w}·${t.d}`).join(' + ') || '0';
          calc(
            `check: ${terms} = ${fx.sum} → ${fx.sum} mod ${m} = <b>${r}</b>` +
              (fx.sum >= m ? ` <small>(${fx.sum} = ${Math.floor(fx.sum / m)}×${m} + ${r})</small>` : '') +
              (r === 10 ? ` → written <b>${esc(fx.piece)}</b>` : '')
          );
          if (!(await wait(1100, g))) return false;
          const out = add(fx.piece);
          out.forEach((r) => {
            stampIn(r);
            tint(r, 'rgba(255, 214, 90, .7)', 800);
          });
          mark(out, g);
          const ok = await wait(460, g);
          srcs.forEach((r) => r && (r.el.classList.remove('fx-test'), delete r.el.dataset.w));
          return ok ? out : false;
        }
        case 'seal': {
          const srcs = stage ? stage.recs.filter((r) => /[0-9X]/.test(r.ch)) : [];
          highlight(srcs);
          if (!Array.isArray(fx.rows)) {
            calc(`Reed–Solomon seal pressed out of ${esc(fx.data)} → <b>${esc(fx.piece)}</b>`);
            if (!(await wait(800, g))) return false;
          } else {
            const m = fx.mod || 11;
            const n = fx.rows.length;
            calc(`seal (mod ${m}): choose ${n === 1 ? 'one digit' : n + ' digits'} so every check row adds up to 0`);
            if (!(await wait(700, g))) return false;
          }
          const out = add(fx.piece);
          out.forEach((r, k) => {
            stampIn(r, k * 140);
            tint(r, 'rgba(255, 214, 90, .7)', 900);
          });
          mark(out, g);
          if (!(await wait(420 + 140 * out.length, g))) return false;
          if (Array.isArray(fx.rows)) {
            // the check rows, one by one, come true
            const m = fx.mod || 11;
            const sv = (c) => (c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : c === 'X' ? 10 : 0);
            const data = [...fx.data];
            const word = data.concat([...fx.piece]);
            const k = data.length;
            const per = fx.rows.length > 4 ? 520 : 760;
            for (let i = 0; i < fx.rows.length; i++) {
              let sum = 0;
              const terms = [];
              fx.rows[i].forEach((w, j) => {
                if (!w || j >= word.length) return;
                sum += w * sv(word[j]);
                terms.push(j < k ? `${w}·${esc(word[j])}` : `${w}·<u>${esc(word[j])}</u>`);
              });
              out.forEach((r, c) => r.el.classList.toggle('fx-test', !!fx.rows[i][k + c]));
              calc(`row ${i + 1}: ${terms.join(' + ') || '0'} = ${sum} <b class="yes">≡ 0 (mod ${m}) ✓</b>`);
              if (!(await wait(per, g))) return false;
            }
            out.forEach((r) => r.el.classList.remove('fx-test'));
          }
          srcs.forEach((r) => r && r.el.classList.remove('fx-test'));
          return out;
        }
        case 'crc': {
          // the shift register: every lamp already on the tape is clocked through it, one by one; what is left in
          // the register (the remainder of tape · xʳ ÷ g) is stamped on
          const r = fx.g.length - 1;
          const poly = CoC.strip && CoC.strip.polyText ? CoC.strip.polyText(fx.g) : fx.g.join('');
          const lamps = recs.filter((x) => x.ch === '0' || x.ch === '1');
          const same = lamps.length === fx.bits.length;
          const reg = (st) => `<span class="tape-reg" aria-label="register ${st}">${[...st].map((c) => `<i class="${c === '1' ? 'on' : ''}"></i>`).join('')}</span>`;
          const line = (html) => (ensureStage().calc.innerHTML = html);
          calc(`shift register ÷ ${esc(poly)} ${reg('0'.repeat(r))} <small>clock the tape through</small>`);
          if (!(await wait(560, g))) return false;
          const n = fx.bits.length;
          const per = n > 16 ? 90 : n > 10 ? 140 : 190;
          for (let i = 0; i < n; i++) {
            const slip = same ? lamps[i] : null;
            if (slip) slip.el.classList.add('fx-test');
            line(`÷ ${esc(poly)} · lamp ${i + 1} in: <span class="tape-in">${fx.bits[i]}</span> → ${reg(fx.states[i])}`);
            if (!(await wait(per, g))) return false;
            if (slip) slip.el.classList.remove('fx-test');
          }
          calc(`remainder ${reg(fx.piece)} <b>${esc(fx.piece)}</b> → stamped on: the tape now divides exactly by ${esc(poly)}`);
          if (!(await wait(520, g))) return false;
          const out = add(fx.piece);
          out.forEach((x, k) => {
            stampIn(x, k * 90);
            tint(x, 'rgba(255, 214, 90, .7)', 800);
          });
          mark(out, g);
          return (await wait(440 + 90 * out.length, g)) ? out : false;
        }
      }
      const out = add(fx.piece || '');
      out.forEach((r, k) => dropIn(r, k * 50));
      return (await wait(480, g)) ? out : false;
    }

    async function encode(step, o = {}) {
      const g = begin(o);
      tplCtx = o.tpl || tplCtx;
      const before = step.after.slice(0, step.after.length - step.piece.length);
      if (!consistent(before)) hard(before);
      if (stage) stage.calc.innerHTML = '';
      try {
        if (step.fx && step.fx.piece === step.piece) await encPart(step.fx, g);
        else {
          diff(before, step.after, { g });
          await wait(480, g);
        }
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('tape effect failed', e);
      }
      settle(g, step.after, o);
    }

    // ------------------------------------------------------------ the field: plates
    async function plate(step, o = {}) {
      const g = begin(o);
      if (!consistent(step.before)) hard(step.before);
      const fx = step.fx;
      const want = applyPlate(step.before, fx);
      try {
        if (want !== step.after && !(fx && fx.type === 'repair')) {
          diff(step.before, step.after, { g });
          await wait(700, g);
        } else await PLATE[fx.type](fx, g, step);
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('tape effect failed', e);
      }
      settle(g, step.after, o);
    }

    const PLATE = {
      none: async (fx, g) => {
        tick(g, 'no change', 'quiet');
        return wait(400, g);
      },
      // decision plates: exactly the positions they test light up, then the verdict
      async cond(fx, g) {
        if (fx.groups > 1) {
          const n = recs.length / fx.groups;
          recs.forEach((r, i) => r.el.classList.add(Math.floor(i / n) % 2 ? 'fx-grp-b' : 'fx-grp-a'));
        } else highlight(fx.pos.map((i) => recs[i]));
        mark(fx.pos.map((i) => recs[i]), g);
        if (!(await wait(420, g))) return false;
        tick(g, fx.yes ? 'YES' : 'NO', fx.yes ? 'yes' : 'no');
        return wait(520, g);
      },
      // the plate's symbols are plucked out; the gaps close
      async strip(fx, g) {
        const out = fx.drop.map((i) => recs[i]);
        if (!out.length) return PLATE.none(fx, g);
        highlight(out, 'fx-doomed');
        if (!(await wait(260, g))) return false;
        removeTiles(out, 'pluck');
        mark([], g);
        return wait(600, g);
      },
      swap: (fx, g) => swapTiles(fx.i, fx.j, g, 'fx-test'),
      async flip(fx, g) {
        tint(recs[fx.i], 'rgba(120, 220, 140, .55)', 900);
        return lampFlicker(recs[fx.i], fx.to, g);
      },
      // open the envelope: the markers are torn off and everything outside them is cut away
      async between(fx, g) {
        const marks = [recs[fx.a], recs[fx.b]];
        const outside = recs.filter((_, i) => i < fx.a || i > fx.b);
        highlight(marks);
        highlight(outside, 'fx-doomed');
        if (!(await wait(320, g))) return false;
        if (outside.length) {
          removeTiles(outside, 'fall');
          if (!(await wait(420, g))) return false;
        }
        removeTiles(marks, 'tear');
        return wait(640, g);
      },
      // reassemble: tagged parcels are boxed, sorted by their tags, and the tags torn off
      reassemble: (fx, g) => courier(fx.size, fx.order, g, { tags: true }),
      // repair: the slips the codebook corrects turn over in place with a codebook glow
      async repair(fx, g, step) {
        if (!fx.changed) {
          diff(step.before, step.after, { g, tint: 'rgba(110, 190, 255, .7)' });
          return wait(700, g);
        }
        if (!fx.changed.length) {
          tick(g, step.before === step.after ? 'codebook: no change' : '', 'quiet');
          return wait(420, g);
        }
        const hit = fx.changed.map((i) => recs[i]);
        hit.forEach((r, k) => {
          anim(r.el, [{ boxShadow: '0 0 0 rgba(110,190,255,0)' }, { boxShadow: '0 0 14px 3px rgba(110, 190, 255, .95)', offset: 0.3 }, { boxShadow: '0 0 0 rgba(110,190,255,0)' }], { duration: 1000, delay: k * 60 });
          turn(r, step.after[fx.changed[k]], 340);
        });
        mark(hit, g);
        return wait(900, g);
      },
      // syndrome table (the Cipher School): each check row sums the lamps it watches, one syndrome bit per row drops into
      // the stage; the syndrome is looked up in the table (the plate's line lights up), and the lamps it names flip
      async syndrome(fx, g, step) {
        const tell = (detail) => document.dispatchEvent(new CustomEvent('coc:syndrome', { detail: Object.assign({ id: step.id }, detail) }));
        const st = ensureStage(fx.captured ? 'Captured decoder' : 'Syndrome');
        st.calc.innerHTML = '';
        st.recs = fx.bits.map((_, i) => {
          const r = make('', 'slot');
          r.b.dataset.sym = `r${i + 1}`;
          return r;
        });
        st.row.replaceChildren(...st.recs.map((r) => r.el));
        anim(st.el, [{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
        const per = fx.rows.length > 4 ? 560 : 720;
        for (let i = 0; i < fx.rows.length; i++) {
          const watched = fx.rows[i].map((q) => recs[q]).filter(Boolean);
          highlight(watched);
          watched.forEach((r) => (r.el.dataset.w = `r${i + 1}`));
          tell({ row: i });
          const lit = watched.filter((r) => r.ch === '1').length;
          calc(
            `row ${i + 1}: ${fx.rows[i].map((q) => '#' + (q + 1)).join(' ') || '(no lamps)'} → ${lit} lit → ${lit % 2 ? 'odd' : 'even'} → <b>${fx.bits[i]}</b>`
          );
          if (!(await wait(per * 0.55, g))) return false;
          const slot = st.recs[i];
          slot.extra = '';
          delete slot.b.dataset.sym;
          setCh(slot, String(fx.bits[i]));
          stampIn(slot);
          mark([slot], g);
          if (!(await wait(per * 0.45, g))) return false;
          watched.forEach((r) => (r.el.classList.remove('fx-test'), delete r.el.dataset.w));
        }
        const key = [...fx.key].join(' ');
        const col = fx.cols.length ? ` = column ${fx.cols.map((j) => '#' + (j + 1)).join(', ')} of H` : '';
        const fixes = fx.flips.map((f) => '#' + (f.i + 1)).join(' ');
        tell({ key: fx.key, cols: fx.cols, flips: fx.flips.map((f) => f.i) });
        if (!fx.key.includes('1')) calc(`syndrome <b>${key}</b>: every check holds → <b class="yes">pass it on</b>`);
        else if (fx.flips.length) calc(`syndrome <b>${key}</b>${col} → table: <b>flip ${fixes}</b>`);
        else
          calc(
            `syndrome <b>${key}</b>${col || ' <small>(no single lamp’s column)</small>'} → table: <b class="no">${fx.entry && fx.entry.length ? 'nothing it can flip' : 'no entry'}</b>, left as it is`
          );
        if (fx.cols.length) highlight(fx.cols.map((j) => recs[j]), 'fx-doomed');
        if (!(await wait(900, g))) return false;
        if (!fx.flips.length) tick(g, fx.key.includes('1') ? 'no change' : '✓ all checks hold', fx.key.includes('1') ? 'quiet' : 'yes');
        for (const f of fx.flips) {
          const r = recs[f.i];
          if (!r) continue;
          r.el.classList.remove('fx-doomed');
          tint(r, 'rgba(120, 220, 140, .55)', 900);
          if ((await lampFlicker(r, f.to, g)) === false) return false;
        }
        recs.forEach((r) => r.el.classList.remove('fx-doomed'));
        if (!(await wait(fx.flips.length ? 200 : 520, g))) return false;
        dropStage();
        return wait(320, g);
      },
    };

    // ------------------------------------------------------------ the field: reading the order off the tape
    async function assemble(step, o = {}) {
      const g = begin(o);
      if (!consistent(step.before)) hard(step.before);
      const fx = step.fx;
      const filled = fx && fx.type === 'assemble' ? fx.cells.map((c) => (c.lit !== undefined ? c.lit : fx.reads[c.v].value)).join('') : null;
      try {
        if (filled !== step.after) {
          diff(step.before, step.after, { g });
          await wait(800, g);
        } else await readOrder(fx, g);
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('tape effect failed', e);
      }
      if (current(g) && stage && !consistent(step.after)) dropStage();
      settle(g, step.after, o);
    }

    async function readOrder(fx, g) {
      // the order form: literal cells are printed, variable cells are empty slots
      const st = ensureStage('Order form');
      st.calc.innerHTML = '';
      st.recs = fx.cells.map((c) => {
        if (c.lit !== undefined) return make(c.lit, 'slot-lit');
        const r = make('', `slot c-${fx.vars[c.v].color}`);
        r.b.dataset.sym = fx.vars[c.v].sym;
        return r;
      });
      st.row.replaceChildren(...st.recs.map((r) => r.el));
      anim(st.el, [{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
      if (!(await wait(380, g))) return false;
      for (let k = 0; k < fx.reads.length; k++) {
        const slots = fx.cells.map((c, i) => (c.v === k ? st.recs[i] : null)).filter(Boolean);
        if (!slots.length) continue;
        const rd = fx.reads[k];
        const sym = esc(fx.vars[k].sym);
        const srcs = rd.pos.map((i) => recs[i]).filter(Boolean);
        highlight(srcs);
        mark(srcs, g);
        let from = srcs[0] && srcs[0].el;
        if (rd.t === 'vote') {
          // the candidates lift off the tape into a ballot; the tally decides
          const picks = rd.picks.filter((c) => c !== undefined);
          const counts = new Map();
          picks.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1));
          const score = [...counts.values()].sort((a, b) => b - a).join('–');
          const calcEl = calc(`${sym} vote: <span class="ballot"></span> <span class="tally"></span>`);
          const ballot = calcEl.querySelector('.ballot');
          const votes = srcs.map((r) => make(r.ch, 'vote'));
          ballot.append(...votes.map((v) => v.el));
          for (let q = 0; q < votes.length; q++) fly(srcs[q].el, votes[q], votes[q].ch, g, { ms: 460, delay: q * 90, lift: -18, quiet: true });
          if (!(await wait(560 + 90 * votes.length, g))) return false;
          calcEl.querySelector('.tally').innerHTML = picks.length
            ? counts.size > 1
              ? `→ <b>${esc(rd.raw)}</b> wins ${score}`
              : `→ all agree: <b>${esc(rd.raw)}</b>`
            : '→ nothing to read';
          votes.forEach((v) => v.el.classList.add(v.ch === rd.raw ? 'fx-win' : 'fx-lose'));
          if (!(await wait(620, g))) return false;
          from = (votes.find((v) => v.ch === rd.raw) || {}).el;
        } else {
          calc(rd.t === 'pos' ? `${sym} read from #${rd.pos[0] + 1}${rd.not ? ', turned over' : ''}` : '');
        }
        if (rd.value) {
          // the winner (or the read symbol) flies into the form; ¬ turns it over in flight
          const [first, ...rest] = slots;
          const fill = (s) => {
            s.extra = '';
            delete s.b.dataset.sym;
            setCh(s, rd.value);
          };
          fill(first);
          const ok = await fly(from, first, rd.raw || rd.value, g, { flipTo: rd.not ? rd.value : undefined, ms: 560 });
          if (ok === false) return false;
          for (const s of rest) {
            fill(s);
            fly(first.el, s, rd.value, g, { ms: 380, lift: -14 });
          }
          if (rest.length && !(await wait(400, g))) return false;
        }
        srcs.forEach((r) => r.el.classList.remove('fx-test'));
        if (!(await wait(160, g))) return false;
      }
      calc('');
      // the read-out tape is cleared away and the finished order comes down onto it
      const filled = st.recs.filter((r) => r.ch !== '');
      const first = measure(filled);
      const old = recs.slice();
      const goes = old.map((r) => lift(r));
      recs = filled;
      filled.forEach((r) => {
        r.extra = '';
        paint(r);
      });
      st.el.remove();
      stage = null;
      commit();
      goes.forEach((go) => go('fade'));
      flipFrom(first, recs, { duration: 560, stagger: 25, easing: 'cubic-bezier(.3,.7,.3,1)' });
      mark(recs, g);
      return wait(620 + 25 * recs.length, g);
    }

    return {
      el,
      text,
      show(before, after) {
        if (before === null || before === after) render(after);
        else diff(before, after);
      },
      liftOrder,
      clearStage,
      encode,
      relay,
      plate,
      assemble,
      consistent,
    };
  }

  CoC.tape = { create, diffOps, applyFx, applyPlate };
})();
