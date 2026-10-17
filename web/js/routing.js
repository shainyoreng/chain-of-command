/* Chain of Command — routing networks and black-box lines (UI side; the logic is in engine.js).
 *
 *   Network levels (level.network): the line panel shows a field map of junctions and roads. The player plots
 *   the route one stretch at a time from HQ (only roads leaving the route's end, into unvisited places that
 *   can still reach the front, may be clicked); the route's relays are the line, and TEST TRANSMISSION carries
 *   the envelope along it.
 *   Hidden lines (level.hiddenLine): the relays are one unknown black box; the player gets intercepted
 *   traffic (engine.interceptSamples) instead of relay cards.
 *
 * Used by app.js: renderNet, netView, clearAnim, isPrefix, briefingLineHTML, hiddenLineHTML, samplesHTML,
 * reportStats.
 */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});
  const { engine, data, art } = CoC;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const hours = (h) => `${+h.toFixed(2)} h`;

  // The hidden line's reversing clerk is a real relay kind; give it a card for the proving ground.
  if (data && data.CHARACTERS && !data.CHARACTERS.reverse)
    data.CHARACTERS.reverse = { name: 'CPL. BACKWARDS', icon: 'swap', trait: () => 'Writes the message back to front' };

  const isNet = (lv) => !!(lv && lv.network);
  const isHidden = (lv) => !!(lv && lv.hiddenLine);
  const nodeOf = (lv, id) => lv.network.nodes.find((n) => n.id === id);
  const labelOf = (lv, id) => (nodeOf(lv, id) || {}).label || id;
  const relayName = (m) => m.name || data.CHARACTERS[m.kind].name;
  const relayTrait = (m) =>
    data.CHARACTERS[m.kind].trait(m) + (m.kind === 'pad' && m.set ? ` (${data.fmtSet(m.set)})` : '') + (m.kind === 'pass' ? '' : `, ${Math.round(m.p * 100)}% of orders`);

  // ------------------------------------------------------------------ route plotting
  // Shortest path by hops from `from` to `to`, avoiding `avoid` (a Set of node ids). null if none.
  function bfs(net, from, to, avoid) {
    if (from === to) return [from];
    const prev = { [from]: null };
    const queue = [from];
    while (queue.length) {
      const at = queue.shift();
      for (const l of net.links) {
        const nx = l.a === at ? l.b : l.b === at ? l.a : null;
        if (!nx || nx in prev || avoid.has(nx)) continue;
        prev[nx] = at;
        if (nx === to) {
          const path = [to];
          for (let p = at; p !== null; p = prev[p]) path.unshift(p);
          return path;
        }
        queue.push(nx);
      }
    }
    return null;
  }

  // Routes are plotted one stretch at a time from HQ. A partial route is a path that starts at HQ.
  const linkIndex = (net, u, v) => net.links.findIndex((l) => (l.a === u && l.b === v) || (l.a === v && l.b === u));
  const asRoute = (route) => (Array.isArray(route) && route.length && route[0] === 'HQ' ? route : ['HQ']);

  // Is `route` a plottable path from HQ (complete or not)? Used to restore a saved, half-plotted route.
  function isPrefix(lv, route) {
    if (!Array.isArray(route) || route[0] !== 'HQ' || new Set(route).size !== route.length) return false;
    for (let i = 0; i + 1 < route.length; i++) if (linkIndex(lv.network, route[i], route[i + 1]) < 0 || route[i] === 'FIELD') return false;
    return true;
  }

  // Links that may extend the route: they leave its last place, enter a place not yet visited, and from there
  // the front can still be reached without doubling back (no dead ends, no loops).
  function nextLinks(lv, route) {
    const net = lv.network;
    const r = asRoute(route);
    const end = r[r.length - 1];
    const out = new Set();
    if (end === 'FIELD') return out;
    net.links.forEach((l, i) => {
      const v = l.a === end ? l.b : l.b === end ? l.a : null;
      if (!v || r.includes(v)) return;
      if (v === 'FIELD' || bfs(net, v, 'FIELD', new Set(r))) out.add(i);
    });
    return out;
  }

  // Everything known about a (possibly partial) route: its stretches, relays and hours so far.
  function partial(lv, route) {
    const r = asRoute(route);
    const hops = [];
    const chain = [];
    let delay = 0;
    for (let i = 0; i + 1 < r.length; i++) {
      const li = linkIndex(lv.network, r[i], r[i + 1]);
      const l = lv.network.links[li];
      hops.push({ index: li, link: l, from: r[i], to: r[i + 1] });
      const relays = l.a === r[i] ? l.chain || [] : [...(l.chain || [])].reverse();
      chain.push(...relays);
      delay += l.delay || 0;
    }
    const hostile = chain.filter((m) => m.kind !== 'pass');
    const clean = hostile.reduce((a, m) => a * (1 - m.p), 1);
    return { nodes: r, hops, chain, hostile, delay, clean, complete: r[r.length - 1] === 'FIELD' };
  }

  // The player clicked link `li`. A stretch already on the route is taken back (with everything after it);
  // a stretch leaving the route's end extends it. Anything else: null (not reachable from here).
  function step(lv, route, li) {
    const r = asRoute(route);
    const p = partial(lv, r);
    const k = p.hops.findIndex((h) => h.index === li);
    if (k >= 0) return r.slice(0, k + 1);
    if (!nextLinks(lv, r).has(li)) return null;
    const l = lv.network.links[li];
    const end = r[r.length - 1];
    return [...r, l.a === end ? l.b : l.a];
  }

  // ------------------------------------------------------------------ map geometry
  const W = 600;
  function geom(lv, H) {
    const pt = (n) => [28 + (n.x / 100) * (W - 56), 22 + (n.y / 100) * (H - 44)];
    const pos = {};
    for (const n of lv.network.nodes) pos[n.id] = pt(n);
    return { pos, pt: (x, y) => pt({ x, y }) };
  }
  // The delay tag sits on the middle of its road; the relays stand between it and one end. Ends are chosen
  // greedily so no junction gets crowded: the end with fewer relays already beside it (then fewer roads; HQ and
  // the front count as busy), so labels and patches stay readable.
  const sides = new WeakMap();
  function sideOf(lv, li) {
    if (!sides.has(lv)) {
      const net = lv.network;
      const deg = (id) => net.links.filter((l) => l.a === id || l.b === id).length + (id === 'HQ' || id === 'FIELD' ? 3 : 0);
      const load = {};
      const out = net.links.map((l) => {
        if (!(l.chain || []).length) return true;
        const la = (load[l.a] || 0) * 10 + deg(l.a);
        const lb = (load[l.b] || 0) * 10 + deg(l.b);
        const towardB = lb <= la;
        const end = towardB ? l.b : l.a;
        load[end] = (load[end] || 0) + l.chain.length;
        return towardB;
      });
      sides.set(lv, out);
    }
    return sides.get(lv)[li];
  }
  function relayFrac(lv, li, k) {
    const n = lv.network.links[li].chain.length;
    const f = n === 1 ? 0.72 : 0.64 + (0.2 * k) / (n - 1);
    return sideOf(lv, li) ? f : 1 - f;
  }
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const f1 = (n) => Math.round(n * 10) / 10;

  function riverPath(points) {
    if (!points || points.length < 2) return '';
    let d = `M${f1(points[0][0])} ${f1(points[0][1])}`;
    for (let i = 1; i < points.length - 1; i++) {
      const mid = lerp(points[i], points[i + 1], 0.5);
      d += ` Q${f1(points[i][0])} ${f1(points[i][1])} ${f1(mid[0])} ${f1(mid[1])}`;
    }
    const last = points[points.length - 1];
    return d + ` L${f1(last[0])} ${f1(last[1])}`;
  }

  const nested = (svg, x, y, w, h) => svg.replace('<svg ', `<svg x="${f1(x)}" y="${f1(y)}" width="${w}" height="${h}" `);

  function nodeGlyph(n) {
    switch (n.kind) {
      case 'bridge':
        return '<path d="M-15 5h30M-13 5q13-16 26 0" class="g-stroke"/><path d="M-9 5v-4M9 5v-4M0 5v-7" class="g-thin"/>';
      case 'ford':
        return '<ellipse cx="-9" cy="2" rx="4.5" ry="3" class="g-fill"/><ellipse cx="0" cy="-2" rx="4.5" ry="3" class="g-fill"/><ellipse cx="9" cy="2" rx="4.5" ry="3" class="g-fill"/>';
      case 'mill':
        return '<circle r="8" class="g-stroke"/><path d="M-8 0h16M0 -8v16M-5.7 -5.7l11.4 11.4M5.7 -5.7l-11.4 11.4" class="g-thin"/>';
      default:
        return '<circle r="6" class="g-fill"/>';
    }
  }

  // The map as an SVG string. opts: { route, H, uid, interactive }
  function mapSVG(lv, opts = {}) {
    const H = opts.H || 220;
    const uid = opts.uid || 'nm';
    const { pos, pt } = geom(lv, H);
    const net = lv.network;
    const plotted = isPrefix(lv, opts.route) ? partial(lv, opts.route) : null;
    const onLinks = new Map(plotted ? plotted.hops.map((h) => [h.index, { reversed: h.link.a !== h.from }]) : []);
    let s = `<svg class="net-map${opts.interactive ? ' interactive' : ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of the roads from HQ to the front">`;
    s += `<defs><pattern id="${uid}-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" class="net-grid"/></pattern></defs>`;
    s += `<rect class="net-bg" x="0" y="0" width="${W}" height="${H}" rx="6"/><rect x="0" y="0" width="${W}" height="${H}" fill="url(#${uid}-grid)"/>`;
    if (net.river) {
      const d = riverPath(net.river.map(([x, y]) => pt(x, y)));
      s += `<path class="net-river" d="${d}"/><path class="net-river-hi" d="${d}"/>`;
    }
    net.links.forEach((l, i) => {
      const A = pos[l.a];
      const B = pos[l.b];
      const hop = onLinks.get(i);
      const d = `M${f1(A[0])} ${f1(A[1])} L${f1(B[0])} ${f1(B[1])}`;
      const cls = `net-link${hop ? ' on' : ''}${hop && hop.reversed ? ' rev' : ''}${(l.chain || []).some((m) => m.kind !== 'pass') ? ' hostile' : ''}`;
      s += `<g class="${cls}" data-link="${i}"${opts.interactive ? ` tabindex="0" role="button" aria-label="${esc(linkLabel(lv, l))}"` : ''}>`;
      s += `<path class="lk-hit" d="${d}"/><path class="lk-case" d="${d}"/><path class="lk-road" d="${d}"/><path class="lk-flow" d="${d}"/>`;
      // delay tag: a road sign on the road, on the opposite half from its relays
      const tag = lerp(A, B, (l.chain || []).length ? (sideOf(lv, i) ? 0.33 : 0.67) : 0.5);
      const txt = hours(l.delay || 0);
      const tw = 8 + txt.length * 6.4;
      s += `<g class="lk-tag" transform="translate(${f1(tag[0])} ${f1(tag[1])})"><rect x="${f1(-tw / 2)}" y="-8.5" width="${f1(tw)}" height="17" rx="3"/><text y="4">${esc(txt)}</text></g>`;
      (l.chain || []).forEach((m, k) => {
        const p = lerp(A, B, relayFrac(lv, i, k));
        s += `<g class="lk-relay" data-relay="${i}:${k}" transform="translate(${f1(p[0])} ${f1(p[1])})"><g class="net-shake">${nested(art.patch(data.CHARACTERS[m.kind].icon), -15, -15, 30, 30)}${m.kind === 'pass' ? '' : `<text class="lk-chance" x="12" y="-11">${Math.round(m.p * 100)}%</text>`}</g></g>`;
      });
      s += '</g>';
    });
    for (const n of net.nodes) {
      const [x, y] = pos[n.id];
      const end = n.id === 'HQ' || n.id === 'FIELD';
      // label: above the top row, below the bottom row, below and to the right in between (clear of vertical roads)
      const lp = n.labelPos || (end ? 'below' : y < H * 0.25 ? 'above' : y > H * 0.75 ? 'below' : 'below-right');
      s += `<g class="net-node${end ? ' end' : ''}" data-node="${esc(n.id)}" transform="translate(${f1(x)} ${f1(y)})"><g class="net-shake">`;
      if (n.id === 'HQ') s += nested(art.HQ, -27, -24, 54, 43);
      else if (n.id === 'FIELD') s += nested(art.FIELD, -27, -24, 54, 43);
      else s += `<circle r="13" class="nd-ring"/>${nodeGlyph(n)}`;
      const lab = { above: [0, -19, 'middle'], below: [0, end ? 32 : 27, 'middle'], 'below-right': [9, 27, 'start'], right: [17, 4, 'start'], left: [-17, 4, 'end'] }[lp] || [0, 27, 'middle'];
      s += `</g><text class="nd-label" x="${lab[0]}" y="${lab[1]}" text-anchor="${lab[2]}">${esc(n.label || n.id)}</text></g>`;
    }
    s += `<g class="net-env" aria-hidden="true"><rect x="-10" y="-7" width="20" height="14" rx="2"/><path d="M-9.5 -6l9.5 6.5 9.5-6.5"/><circle cy="1.5" r="2.2"/></g>`;
    return s + '</svg>';
  }

  function linkLabel(lv, l) {
    const who = (l.chain || []).length ? l.chain.map(relayName).join(', ') : 'nobody on it';
    return `${l.name || 'Road'}: ${labelOf(lv, l.a)} to ${labelOf(lv, l.b)}, ${hours(l.delay || 0)}, ${who}`;
  }

  // ------------------------------------------------------------------ the line panel
  // Running totals for the route plotted so far.
  function captionRoute(lv, route) {
    const p = partial(lv, route);
    const path = p.nodes.map((id) => labelOf(lv, id)).join(' → ');
    const over = lv.delayBudget !== undefined && p.delay > lv.delayBudget + 1e-9;
    const status = p.complete
      ? '<span class="nc-status done">Route complete</span>'
      : p.hops.length
      ? `<span class="nc-status">Continue from ${esc(labelOf(lv, p.nodes[p.nodes.length - 1]))}: click a glowing road</span>`
      : '<span class="nc-status">Start at HQ: click a glowing road</span>';
    const ctl =
      `<span class="nc-ctl"><button type="button" class="btn-chip" data-net="back" ${p.hops.length ? '' : 'disabled'} title="Take back the last stretch">◂ Back</button>` +
      `<button type="button" class="btn-chip" data-net="clear" ${p.hops.length ? '' : 'disabled'} title="Start again from HQ">Clear</button></span>`;
    const relays = p.hostile.length
      ? p.hostile.map((m) => `<span class="nc-relay" title="${esc(relayTrait(m))}">${art.patch(data.CHARACTERS[m.kind].icon)}${esc(relayName(m))}</span>`).join('')
      : `<i>${p.hops.length ? 'no one hostile so far' : 'nothing yet'}</i>`;
    return (
      `<div class="nc-top"><span class="nc-key">Route</span>${status}${ctl}</div>` +
      `<b class="nc-path">${esc(path)}</b>` +
      `<div class="nc-stats"><span class="nc-delay${over ? ' over' : ''}" title="Hours per transmission. Every SAY AGAIN walks the route again.">${hours(p.delay)} per send${lv.delayBudget !== undefined ? ` · limit ${hours(lv.delayBudget)}` : ''}</span>` +
      `<span class="nc-clean" title="Chance an order meets no trouble at all on this route">untouched ≈ ${Math.round(p.clean * 100)}%</span></div>` +
      `<span class="nc-relays">${relays}</span>`
    );
  }

  function captionLink(lv, li, why) {
    if (li === null || li === undefined) return '<span class="nc-tip">Hover over a road, or tap it, to see who is on it. Click a stretch on the route to take it back.</span>';
    const l = lv.network.links[li];
    const relays = (l.chain || []).length
      ? l.chain.map((m) => `<span class="nc-who">${art.patch(data.CHARACTERS[m.kind].icon)}<b>${esc(relayName(m))}</b> ${esc(relayTrait(m))}</span>`).join('')
      : '<span class="nc-who empty">Nobody on this road.</span>';
    return `${why ? `<span class="nc-why">${esc(why)}</span>` : ''}<span class="nc-link"><b>${esc(l.name || 'Road')}</b> ${esc(labelOf(lv, l.a))} – ${esc(labelOf(lv, l.b))} · ${hours(l.delay || 0)}</span>${relays}`;
  }

  // Draw the interactive map into the line. getRoute() / setRoute(nodes) connect it to the saved program.
  function renderNet(lineEl, lv, getRoute, setRoute) {
    lineEl.innerHTML =
      `<div class="net-wrap"><div class="net-board">${mapSVG(lv, { route: getRoute(), uid: 'ln', interactive: true })}</div>` +
      `<div class="net-caption"><div class="nc-route"></div><div class="nc-detail"></div></div></div>`;
    const svg = lineEl.querySelector('svg');
    let hover = null;
    let focus = null;
    let why = '';
    const paint = () => {
      const p = partial(lv, getRoute());
      const on = new Map(p.hops.map((h) => [h.index, h]));
      const next = nextLinks(lv, p.nodes);
      const end = p.nodes[p.nodes.length - 1];
      svg.querySelectorAll('.net-link').forEach((g) => {
        const li = +g.dataset.link;
        const h = on.get(li);
        g.classList.toggle('on', !!h);
        g.classList.toggle('rev', !!(h && h.link.a !== h.from));
        g.classList.toggle('next', next.has(li));
        g.classList.toggle('off', !h && !next.has(li));
        g.classList.toggle('hover', li === hover);
        g.setAttribute('aria-disabled', String(!h && !next.has(li)));
      });
      svg.querySelectorAll('.net-node').forEach((g) => {
        g.classList.toggle('on', p.nodes.includes(g.dataset.node));
        g.classList.toggle('here', !p.complete && g.dataset.node === end);
      });
      lineEl.querySelector('.net-wrap').classList.toggle('no-route', !p.complete);
      lineEl.querySelector('.nc-route').innerHTML = captionRoute(lv, p.nodes);
      lineEl.querySelector('.nc-detail').innerHTML = captionLink(lv, hover ?? focus, hover === null || hover === focus ? why : '');
    };
    const commit = (route) => {
      setRoute(route.length > 1 ? route : null);
      paint();
    };
    lineEl.querySelector('.nc-route').addEventListener('click', (e) => {
      const b = e.target.closest('[data-net]');
      if (!b || b.disabled) return;
      const r = asRoute(getRoute());
      why = '';
      commit(b.dataset.net === 'back' ? r.slice(0, -1) : ['HQ']);
    });
    svg.querySelectorAll('.net-link').forEach((g) => {
      const li = +g.dataset.link;
      g.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'mouse') return;
        hover = li;
        paint();
      });
      g.addEventListener('pointerleave', () => {
        hover = null;
        paint();
      });
      const pick = () => {
        focus = li;
        const r = asRoute(getRoute());
        const next = step(lv, r, li);
        if (next) {
          why = '';
          commit(next);
          return;
        }
        const end = r[r.length - 1];
        const l = lv.network.links[li];
        why =
          end === 'FIELD'
            ? 'The route already reaches the front. Click a stretch on it to take that part back.'
            : l.a === end || l.b === end
            ? 'That road leads back on yourself or into a dead end.'
            : `Roads must leave ${labelOf(lv, end)}, where the route ends now.`;
        paint();
      };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), pick());
      });
    });
    paint();
    return { paint };
  }

  // ------------------------------------------------------------------ animation along the chosen route
  // A view for app.js playTrial: stops 0 = HQ, 1..n = relays in route order, n + 1 = the front.
  let current = null;
  function netView(lineEl, lv, routeNodes, token) {
    const svg = lineEl.querySelector('svg.net-map');
    const info = engine.routeInfo(lv, routeNodes);
    if (!svg || !info || !info.ok) return null;
    const H = svg.viewBox.baseVal.height;
    const { pos } = geom(lv, H);
    const stops = [{ el: svg.querySelector('[data-node="HQ"]'), p: pos.HQ }];
    const segs = [[pos.HQ]];
    info.hops.forEach((h) => {
      const B = pos[h.to];
      const n = h.link.chain.length;
      for (let j = 0; j < n; j++) {
        // walking b→a meets the relays in reverse order (engine.routeInfo reverses the chain the same way)
        const k = h.reversed ? n - 1 - j : j;
        const p = lerp(pos[h.link.a], pos[h.link.b], relayFrac(lv, h.index, k));
        segs[segs.length - 1].push(p);
        stops.push({ el: svg.querySelector(`[data-relay="${h.index}:${k}"]`), p });
        segs.push([p]);
      }
      segs[segs.length - 1].push(B);
    });
    stops.push({ el: svg.querySelector('[data-node="FIELD"]'), p: pos.FIELD });
    // ghost-highlight a replayed trial's route if it is not the one currently chosen
    const on = new Set(info.hops.map((h) => h.index));
    svg.querySelectorAll('.net-link').forEach((g) => g.classList.toggle('replay', on.has(+g.dataset.link) && !g.classList.contains('on')));
    const env = svg.querySelector('.net-env');
    const place = (p) => env.setAttribute('transform', `translate(${f1(p[0])} ${f1(p[1])})`);
    const view = {
      last: stops.length - 1,
      activate(i, hit = false) {
        stops.forEach((s, k) => s.el && s.el.classList.toggle('active', k === i));
        const el = stops[i] && stops[i].el;
        if (hit && el) {
          el.classList.remove('hit');
          void el.getBoundingClientRect();
          el.classList.add('hit');
        }
      },
      travel(i, back = false) {
        const pts = back ? segs[i].slice().reverse() : segs[i];
        const lens = [];
        let total = 0;
        for (let k = 1; k < pts.length; k++) total += lens[k - 1] = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
        const base = Math.max(320, Math.min(1100, total * 3.4)) * (back ? 0.45 : 1);
        env.classList.add('moving');
        return new Promise((resolve) => {
          let t0 = null;
          let done = 0;
          const frame = (now) => {
            if (token.cancelled) return resolve();
            if (t0 === null) t0 = now;
            done += (now - t0) * token.speed;
            t0 = now;
            let f = Math.min(1, done / base);
            const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
            let d = e * total;
            let k = 0;
            while (k < lens.length - 1 && d > lens[k]) d -= lens[k++];
            place(lens.length ? lerp(pts[k], pts[k + 1], lens[k] ? Math.min(1, d / lens[k]) : 1) : pts[0]);
            if (f < 1) requestAnimationFrame(frame);
            else {
              env.classList.remove('moving');
              resolve();
            }
          };
          requestAnimationFrame(frame);
        });
      },
      clear() {
        stops.forEach((s) => s.el && s.el.classList.remove('active', 'hit'));
        env.classList.remove('moving');
        svg.querySelectorAll('.net-link.replay').forEach((g) => g.classList.remove('replay'));
      },
    };
    current = view;
    return view;
  }
  function clearAnim() {
    if (current) current.clear();
    current = null;
  }

  // ------------------------------------------------------------------ hidden lines
  // The intercept log: one column of samples, each a "sent" row over a "received" row, aligned on a
  // numbered position scale (no counting). Lamp signals (0/1) are drawn as lamps; lamps that changed
  // in transit get a red ring. Letter signals are drawn as cells (a change there may be a move, so no rings).
  const isBits = (s) => /^[01?]*$/.test(s);
  function cellsHTML(str, sentRef, bits) {
    return [...str]
      .map((c, i) => {
        const chg = bits && sentRef !== undefined && sentRef[i] !== c;
        if (bits && (c === '0' || c === '1')) return `<span class="ic-cell lamp ${c === '1' ? 'lit' : 'dark'}${chg ? ' chg' : ''}" title="#${i + 1}: ${c === '1' ? 'lit' : 'dark'}"></span>`;
        return `<span class="ic-cell ch${chg ? ' chg' : ''}">${esc(c)}</span>`;
      })
      .join('');
  }
  function samplesHTML(lv, cls = '') {
    const rows = engine.interceptSamples(lv);
    const bits = rows.every((r) => isBits(r.sent) && isBits(r.recv));
    const cols = Math.max(1, ...rows.map((r) => Math.max(r.sent.length, r.recv.length)));
    const scale = Array.from({ length: cols }, (_, i) => `<span class="ic-idx">${i + 1}</span>`).join('');
    return (
      `<div class="intercepts ${cls} ${bits ? 'bits' : 'chars'}" style="--ic-cols:${cols}">` +
      `<div class="ic-scale"><span class="ic-lab">position</span><span class="ic-cells">${scale}</span></div>` +
      rows
        .map(
          (r, i) =>
            `<div class="ic-block"><div class="ic-line sent"><span class="ic-lab"><b>#${i + 1}</b> sent</span><span class="ic-cells">${cellsHTML(r.sent, undefined, bits)}</span></div>` +
            `<div class="ic-line recv"><span class="ic-lab">received</span><span class="ic-cells">${cellsHTML(r.recv, r.sent, bits)}</span></div></div>`
        )
        .join('') +
      '</div>'
    );
  }

  // "Open log": the full intercept log in a dossier, at a comfortable size.
  function openInterceptLog(lv) {
    const app = CoC.app;
    if (!app || !lv) return;
    const card = app.openModal(
      `<div class="dossier"><h3>Intercepted traffic</h3><p class="small">Logged as it went into the unknown line, and as it came out at the front.</p>${samplesHTML(lv, 'paper')}<div class="modal-actions"><button class="btn-stamp" type="button">Close ▸</button></div></div>`,
      'paper'
    );
    card.querySelector('.btn-stamp').onclick = () => app.closeModal();
  }
  if (typeof document !== 'undefined')
    document.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('[data-open-intercepts]')) openInterceptLog(CoC.app && CoC.app.S.level);
    });

  const DARK_PATCH =
    '<svg viewBox="0 0 64 64" class="patch" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#14170f" stroke="#6b6650" stroke-width="2.5" stroke-dasharray="5 4"/>' +
    '<text x="32" y="42" text-anchor="middle" font-family="Black Ops One, Impact, sans-serif" font-size="26" fill="#a89d78">???</text></svg>';

  // The line for a hidden level: HQ, one black box, the front, and the clipboard of intercepts.
  function hiddenLineHTML(lv, hqHTML, fieldHTML, wire) {
    const dark = `<div class="station relay dark-box" data-st="1" title="Unknown. Nobody has scouted this stretch of the line.">${DARK_PATCH}<div class="st-name">Unknown line</div><div class="st-trait">Nobody has scouted it</div></div>`;
    return (
      hqHTML + wire(0) + dark + wire(1) + fieldHTML(2) +
      `<div class="clipboard" title="Intercepted traffic: what went in, and what came out"><div class="cb-head">Intercepts<button class="cb-open" type="button" data-open-intercepts>Open log ▸</button></div>${samplesHTML(lv, 'compact')}</div>`
    );
  }

  // ------------------------------------------------------------------ briefing
  function briefingLineHTML(lv, route) {
    if (isHidden(lv)) {
      return (
        '<h4>Intercepted traffic</h4>' +
        '<p class="small">Nobody knows who is on this line. These transmissions were logged as they went in and as they came out. They are all you have.</p>' +
        samplesHTML(lv, 'paper')
      );
    }
    const net = lv.network;
    const stretch = (l) => `<b>${esc(l.name || 'Road')}</b> ${esc(labelOf(lv, l.a))} – ${esc(labelOf(lv, l.b))}`;
    const manned = net.links.filter((l) => (l.chain || []).some((m) => m.kind !== 'pass'));
    const quiet = net.links.filter((l) => !manned.includes(l));
    const rows = manned
      .map((l) => {
        const who = l.chain
          .map((m) => `<div class="brief-relay">${art.patch(data.CHARACTERS[m.kind].icon)}<div><b>${esc(relayName(m))}</b><span>${esc(relayTrait(m))}</span></div></div>`)
          .join('');
        return `<div class="brief-road"><div class="br-head">${stretch(l)}<span>${hours(l.delay || 0)}</span></div>${who}</div>`;
      })
      .join('');
    const quietList = quiet.map((l) => `<li>${stretch(l)} <span>${hours(l.delay || 0)}</span></li>`).join('');
    return (
      '<h4>The roads</h4>' +
      `<div class="brief-net">${mapSVG(lv, { route, uid: 'bm', H: 230 })}</div>` +
      '<p class="small">Plot the route on the map in the line panel, one stretch at a time from HQ. Its relays become your line, and its hours are paid on every transmission, re-sends included.</p>' +
      `<div class="brief-roads">${rows}</div>` +
      (quietList ? `<p class="small br-quiet-head">Quiet stretches (nobody on them):</p><ul class="br-quiet">${quietList}</ul>` : '')
    );
  }

  // After-action boxes for a routing level (delay replaces the equipment box; equipment moves into a note).
  function reportStats(lv, res) {
    return [
      { label: 'Orders delivered', value: `${res.okN} / ${res.trials}`, note: `${res.blocks} equipment · par ${lv.par.blocks}` },
      { label: 'Avg extra symbols', value: res.avgOverhead.toFixed(2), note: `budget ${lv.budget}` },
      { label: 'Avg delay', value: hours(res.avgDelay), note: `limit ${hours(lv.delayBudget)}` },
    ];
  }

  CoC.routing = {
    isNet, isHidden, isPrefix, nextLinks, partial, step, mapSVG, renderNet, netView, clearAnim,
    samplesHTML, hiddenLineHTML, briefingLineHTML, reportStats, relayName, hours,
  };
})();
