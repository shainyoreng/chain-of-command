/* Chain of Command — the theater of operations (CoC.theaterUI).
 *
 * A general's planning map on a desk: one wide SVG sheet (6100×1000 user units) that scrolls sideways, with
 * the front, 21 sectors in four tiers, illustrated unit models, advance arrows, contact-lost masts, commando
 * raids and the victory finale. Clicking a sector zooms into it and shows its plan of advance beside a paper panel.
 *
 * Contract used by app.js:
 *   CoC.theaterUI.render(opts)   — draw the theater into #theater (opts.justWon, opts.captured)
 *   CoC.theaterUI.onShow(opts)   — called once the screen is visible: sizes the view, plays animations
 *
 * Animations are driven by a diff between the progress the player has already SEEN animated
 * (CoC.app.S.save.theater.seen) and the current status, so every capture / unlock / advance plays
 * exactly once, even after a reload. Progression rules live in theater-data.js; geometry lives here.
 */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});

  const MW = 6100;
  const MH = 1000;
  const F = { x0: 50, y0: 50, x1: 6050, y1: 950 }; // the neatline: sectors tile this frame
  const UNLOCK = typeof location !== 'undefined' && /[?&]unlock\b/.test(location.search);
  const reduced = () => !!(globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ================================================================ geometry
  // The front is painted on a coarse grid, one letter per cell: tier 1 on the coast at the left, tier 4
  // deepest at the right, impassable ground (massif, lakes, the mere) where the graph needs a gap. Cell
  // corners are then jittered and every border between two regions is smoothed once and shared by both,
  // so neighbouring polygons meet exactly. Sectors touch exactly when they are `neighbors` in
  // theater-data.js (checked by _debug.borderPairs()). The neighbour graph must stay planar: three borders once
  // asked for (fords–junction, junction–longwire, pass–cyclic) could not exist on any flat map and were removed
  // from the data. Anything listed here would be a known mismatch between map and rules (keep it empty).
  const UNDRAWN_BORDERS = [];
  const GRID = [
    'CCCCAAAAAEEEFFFFFFFFFFFKKKKKKKKHHHHHHHHH',
    'CCCTTAAAAEEEFFFFFFFFFFFKKKKKKKKHHHHHHHHH',
    'CCRTTAAAAAAAF##########KKKKKKKKHHHHHHHHH',
    'BBRRRR########PPPPPPPWWWWWWWWWoHHHHHHHHH',
    '~BBRRRVVVVVVVVVGGGGGGWWWWWWWWWoHHHHHHHHH',
    '~BBSRRVVVVVVVVVqqqqqqWWWWWWWWWoLLLLYYYYY',
    '~~BSSSSVVVVVVVVDDDDDDMMMMMMMMMoLLLLYYYYY',
    '~~SSSUUVVVVVVVVJJJJJNNNNNMMMMMLLLLLYYYYY',
    '~~SSUUUUUUJJJJJJJJ==========MMLLLLLYYYYY',
  ];
  const CODE = {
    B: 'beachhead', C: 'crossing', R: 'ridge', S: 'relay', T: 'forest', A: 'artillery', U: 'railyard', V: 'valley',
    D: 'depot', J: 'junction', E: 'airfield', F: 'fords', N: 'harbour', M: 'marshes', G: 'radar', W: 'longwire',
    P: 'pass', K: 'citadel', L: 'linear', Y: 'cyclic', H: 'capital',
    '~': 'sea', '=': 'gulf', '#': 'massif', o: 'lake', q: 'mere',
  };
  const HOLE_IDS = ['massif', 'lake', 'mere', 'gulf'];
  const COLS = GRID[0].length;
  const ROW_Y = [50, 145, 240, 330, 420, 510, 600, 705, 830, 950]; // row boundaries (the coastal rows are deep)
  const colX = (c) => F.x0 + (c * (F.x1 - F.x0)) / COLS;
  const rowY = (r) => {
    const i = Math.max(0, Math.min(ROW_Y.length - 2, Math.floor(r)));
    return ROW_Y[i] + (ROW_Y[i + 1] - ROW_Y[i]) * (r - i);
  };
  const cell = (p) => [colX(p[0]), rowY(p[1])];

  // Per sector, in grid coordinates [column, row]: a = label centre, obj = objectives in order of the
  // advance, foes = enemy models [col, row, kind]. Converted to map units below.
  const CELLS = {
    beachhead: { a: [1.5, 4.6], tilt: -2, obj: [[1.5, 5.6], [2.5, 6.4], [2.4, 4.4], [0.8, 3.5]], foes: [[2.6, 6.7, 'inf'], [1.6, 3.4, 'arty'], [1.4, 4.3, 'tank']] },
    crossing: { a: [1.8, 0.95], tilt: 1.5, obj: [[0.8, 2.5], [2.5, 1.6], [3.4, 0.5]], foes: [[0.5, 1.6, 'inf'], [2.9, 0.4, 'tank']] },
    forest: { a: [4.0, 1.95], tilt: -2, obj: [[3.4, 2.6], [4.6, 2.5], [4.4, 1.4]], foes: [[3.3, 1.4, 'inf']] },
    ridge: { a: [4.0, 3.55], tilt: -1.5, obj: [[2.6, 3.5], [4.4, 4.6], [5.5, 3.4]], foes: [[3.2, 3.3, 'arty'], [5.3, 5.5, 'inf']] },
    relay: { a: [4.9, 6.5], tilt: 2, obj: [[3.5, 5.6], [3.1, 7.6]], foes: [[2.6, 8.5, 'truck'], [6.4, 6.6, 'inf']] },
    railyard: { a: [7.0, 8.45], tilt: -1, obj: [[5.5, 7.5], [6.5, 8.4], [8.8, 8.5]], foes: [[4.6, 8.5, 'tank']] },
    artillery: { a: [7.3, 1.25], tilt: -1, obj: [[5.6, 2.5], [10.4, 2.5]], foes: [[5.0, 0.5, 'arty'], [7.6, 0.55, 'arty'], [8.8, 2.4, 'tank']] },
    airfield: { a: [10.5, 1.0], tilt: 1, obj: [[9.4, 0.55], [10.5, 1.4], [11.6, 0.55]], foes: [[11.7, 1.5, 'aa']] },
    valley: { a: [10.4, 5.0], tilt: 1, obj: [[7.4, 4.5], [12.6, 4.5], [11.4, 7.4]], foes: [[8.6, 6.6, 'inf'], [13.6, 5.6, 'tank'], [9.4, 7.5, 'arty']] },
    depot: { a: [17.6, 6.5], tilt: -1, obj: [[15.3, 6.4], [16.2, 6.6], [17.1, 6.4], [18.0, 6.6], [18.9, 6.4], [19.8, 6.6]], foes: [[16.6, 6.3, 'tank'], [19.3, 6.6, 'truck']] },
    junction: { a: [14.0, 8.4], tilt: -1, obj: [[11.0, 8.4], [15.6, 8.5], [17.6, 7.5]], foes: [[12.6, 8.6, 'arty'], [18.6, 7.4, 'inf']] },
    harbour: { a: [22.0, 7.4], tilt: 0.5, obj: [[20.6, 7.45], [22.2, 7.5], [23.8, 7.4]], foes: [[23.0, 7.25, 'inf']] },
    fords: { a: [17.4, 1.0], tilt: 1, obj: [[13.4, 1.4], [16.2, 0.5], [21.0, 1.3]], foes: [[14.6, 1.6, 'inf'], [19.4, 0.5, 'tank'], [21.8, 0.6, 'tank']] },
    marshes: { a: [25.6, 6.5], tilt: -1, obj: [[22.0, 6.5], [26.6, 7.5], [28.6, 8.4]], foes: [[24.0, 6.4, 'inf']] },
    radar: { a: [17.6, 4.5], tilt: 0.5, obj: [[15.5, 4.5], [18.0, 4.5], [20.4, 4.5]], foes: [[19.2, 4.5, 'truck']] },
    pass: { a: [17.0, 3.5], tilt: 0.5, obj: [[14.5, 3.5], [17.6, 3.5], [20.5, 3.5]], foes: [[15.8, 3.5, 'inf']] },
    longwire: { a: [25.6, 4.0], tilt: 1.5, obj: [[22.0, 4.5], [28.4, 3.6]], foes: [[23.4, 5.4, 'inf'], [27.6, 5.5, 'arty']] },
    citadel: { a: [26.6, 1.3], tilt: -1, obj: [[23.6, 2.4], [25.4, 0.6], [29.3, 1.6]], foes: [[24.4, 1.4, 'sgun'], [28.6, 0.5, 'tank']] },
    capital: { a: [35.4, 1.6], tilt: -1, obj: [[32.0, 3.6], [33.4, 0.6], [37.6, 3.0]], foes: [[34.0, 2.8, 'tank'], [36.8, 0.6, 'inf'], [38.6, 4.0, 'tank']] },
    linear: { a: [32.6, 6.5], tilt: 1, obj: [[30.5, 8.6], [31.0, 7.6], [32.4, 5.4], [33.8, 8.4]], foes: [[33.6, 6.0, 'inf']] },
    cyclic: { a: [37.4, 6.6], tilt: -1, obj: [[35.6, 5.4], [38.4, 6.3], [36.4, 8.4]], foes: [[38.6, 7.6, 'truck'], [36.0, 7.4, 'inf']] },
  };
  const GEO = {};
  for (const [id, c] of Object.entries(CELLS))
    GEO[id] = { anchor: cell(c.a), tilt: c.tilt, obj: c.obj.map(cell), foes: c.foes.map(([x, y, k]) => [...cell([x, y]), k]) };
  const RAID_SPOT = { valley: cell([8.2, 7.4]), pass: cell([19.2, 3.5]), capital: cell([38.4, 0.8]) };
  const BEACH = cell([0.5, 6.8]); // the fleet lies off the beach

  // Each sector's assault force — the models that advance through its objectives — suited to its ground.
  const FORCES = {
    beachhead: ['tank', 'soldier', 'soldier', 'soldier', 'soldier', 'soldier', 'soldier'], // assault infantry, one swimming tank
    crossing: ['soldier', 'soldier', 'soldier', 'soldier', 'soldier', 'soldier', 'soldier'], // infantry only: across the river
    ridge: ['tank', 'tank', 'tank', 'tank'], // armour up the ridge road
    relay: ['jeep', 'jeep', 'jeep', 'soldier', 'soldier'], // recon jeeps and a signals team
    forest: ['ltank', 'ltank', 'skier', 'skier', 'skier', 'skier', 'skier'], // ski troops and light tanks through the trees
    railyard: ['train', 'truck', 'truck', 'soldier', 'soldier', 'soldier'], // an armoured train and its lorries
    artillery: ['tank', 'soldier', 'soldier', 'soldier', 'soldier', 'arty', 'arty', 'truck'], // infantry and a tank lead, guns follow
    valley: ['tank', 'tank', 'jeep', 'soldier', 'soldier', 'soldier', 'soldier', 'truck'], // combined arms
    depot: ['jeep', 'truck', 'truck', 'truck', 'truck', 'soldier', 'soldier'], // a supply column
    junction: ['jeep', 'tank', 'tank', 'soldier', 'soldier', 'soldier', 'truck'], // mechanised infantry
    harbour: ['amtrac', 'amtrac', 'soldier', 'soldier', 'soldier', 'soldier', 'soldier', 'truck'], // marines from the landing craft
    airfield: ['jeep', 'aa', 'aa', 'bowser', 'bowser', 'soldier', 'soldier', 'soldier'], // AA guns, fuel bowsers, ground crew
    radar: ['radarvan', 'sigvan', 'sigvan', 'jeep', 'soldier', 'soldier'], // a radar vehicle and signals trucks
    pass: ['soldier', 'soldier', 'soldier', 'soldier', 'soldier', 'lgun', 'mule', 'mule'], // mountain troops, pack mules, a light gun
    fords: ['bridge', 'bridge', 'soldier', 'soldier', 'soldier', 'soldier', 'truck'], // engineers bridge the river
    marshes: ['amtrac', 'amtrac', 'soldier', 'soldier', 'soldier', 'soldier', 'bridge'], // amphibious tracks, infantry, bridging engineers
    longwire: ['jeep', 'jeep', 'soldier', 'soldier', 'soldier', 'soldier', 'soldier', 'truck'], // linemen and infantry
    citadel: ['sgun', 'sgun', 'sapper', 'sapper', 'sapper', 'sapper', 'soldier', 'soldier'], // assault guns and demolition engineers
    linear: ['moto', 'moto', 'staff', 'sigvan', 'soldier', 'soldier', 'soldier'], // dispatch riders, staff cars, signals vans
    cyclic: ['moto', 'moto', 'staff', 'sigvan', 'soldier', 'soldier', 'soldier'],
    capital: ['tank', 'tank', 'sgun', 'jeep', 'soldier', 'soldier', 'soldier', 'sapper', 'arty', 'truck'], // everything we have
  };

  // How each model moves (speeds in screen px/s, turn rates in deg/s). `bound`: infantry dash-and-drop.
  const KINDS = {
    tank: { v: 62, a: 50, turn: 80, lead: 14, bend: 0.12, jit: 16, mark: 'track' },
    ltank: { v: 76, a: 70, turn: 110, lead: 12, bend: 0.12, jit: 16, mark: 'track' },
    sgun: { v: 52, a: 40, turn: 60, lead: 16, bend: 0.1, jit: 12, mark: 'track' },
    amtrac: { v: 58, a: 48, turn: 72, lead: 14, bend: 0.12, jit: 16, mark: 'track' },
    bridge: { v: 50, a: 40, turn: 62, lead: 16, bend: 0.1, jit: 12, mark: 'track' },
    train: { v: 60, a: 30, turn: 34, lead: 30, bend: 0.05, jit: 8, mark: null },
    arty: { v: 56, a: 45, turn: 72, lead: 14, bend: 0.12, jit: 14, mark: 'track' },
    aa: { v: 56, a: 45, turn: 72, lead: 14, bend: 0.12, jit: 14, mark: 'dust' },
    lgun: { v: 52, a: 80, turn: 140, lead: 8, bend: 0.12, jit: 12, mark: null },
    mule: { v: 54, a: 120, turn: 200, lead: 6, bend: 0.14, jit: 14, mark: null },
    truck: { v: 76, a: 55, turn: 58, lead: 24, bend: 0.2, jit: 20, mark: 'dust' },
    bowser: { v: 70, a: 50, turn: 55, lead: 24, bend: 0.2, jit: 20, mark: 'dust' },
    radarvan: { v: 66, a: 50, turn: 58, lead: 22, bend: 0.18, jit: 18, mark: 'dust' },
    sigvan: { v: 72, a: 55, turn: 62, lead: 22, bend: 0.18, jit: 18, mark: 'dust' },
    jeep: { v: 104, a: 110, turn: 150, lead: 12, bend: 0.16, jit: 22, mark: 'dust' },
    staff: { v: 98, a: 100, turn: 140, lead: 12, bend: 0.16, jit: 20, mark: 'dust' },
    moto: { v: 120, a: 160, turn: 200, lead: 8, bend: 0.18, jit: 22, mark: 'dust' },
    lc: { v: 60, a: 45, turn: 60, lead: 20, bend: 0.1, jit: 10, mark: null },
    ship: { v: 50, a: 30, turn: 40, lead: 30, bend: 0.05, jit: 10, mark: null },
    soldier: { v: 115, a: 700, turn: 720, lead: 3, bend: 0.08, jit: 6, mark: null, bound: true },
    skier: { v: 140, a: 600, turn: 600, lead: 3, bend: 0.1, jit: 6, mark: null, bound: true },
    sapper: { v: 105, a: 700, turn: 720, lead: 3, bend: 0.08, jit: 6, mark: null, bound: true },
  };
  // Formation roles of the model kinds (see formation() / deployPoses()).
  const ROLE = {
    tank: 'lead', ltank: 'lead', sgun: 'lead', amtrac: 'lead', bridge: 'lead', train: 'follow',
    jeep: 'recon', staff: 'recon', moto: 'recon',
    soldier: 'foot', skier: 'foot', sapper: 'foot',
    arty: 'gun', aa: 'gun', lgun: 'gun',
    truck: 'follow', bowser: 'follow', radarvan: 'follow', sigvan: 'follow', mule: 'follow', lc: 'follow', ship: 'follow',
  };

  // Rivers and roads (grid coordinates), shared by the terrain drawing and by units looking for a
  // bridge or a ford.
  const RIVER_WAYS = {
    muddle: [[3.4, 0.3], [2.8, 0.9], [2.0, 1.6], [1.4, 2.3], [1.0, 3.0], [0.6, 3.8], [0.4, 4.6]].map(cell),
    kessel: [[13.0, 2.0], [14.6, 1.4], [16.6, 0.95], [18.6, 1.35], [20.4, 1.0], [22.0, 0.45], [22.8, 0.0]].map(cell),
    brook: [[9.0, 4.0], [9.6, 5.0], [10.6, 6.0], [11.6, 7.2], [13.6, 8.0], [16.0, 8.3], [18.3, 8.6]].map(cell),
    moorbach: [[26.6, 6.4], [26.2, 7.4], [25.2, 8.5]].map(cell),
  };
  const ROAD_WAYS = [
    [[2.0, 5.8], [2.6, 4.8], [3.6, 3.8], [5.2, 4.2], [7.0, 4.6], [9.0, 5.0], [11.4, 4.6], [13.0, 5.0], [14.6, 5.6], [17.0, 6.0], [19.6, 6.0], [21.4, 6.4], [23.6, 6.2], [26.0, 5.6], [28.0, 4.6], [29.4, 3.6], [31.6, 2.6], [34.0, 2.0], [35.6, 1.6]],
    [[0.5, 0.5], [3.0, 0.4], [6.0, 0.5], [9.0, 0.4], [12.6, 0.8], [16.0, 0.6], [20.0, 0.5], [23.6, 0.8], [27.0, 0.6], [31.0, 0.5], [35.6, 1.6]],
    [[3.0, 8.6], [6.0, 8.5], [9.0, 8.6], [12.0, 8.4], [15.0, 8.0], [17.4, 7.6], [20.0, 7.4], [22.0, 7.6], [24.0, 7.4], [26.6, 7.6], [29.0, 8.0], [31.4, 8.2], [34.4, 8.4], [36.4, 8.0], [37.6, 6.6]],
    [[13.4, 4.0], [15.0, 3.5], [18.0, 3.4], [20.6, 3.6], [22.0, 4.0]],
    [[1.0, 4.0], [1.6, 2.6], [2.2, 0.6]],
  ].map((w) => w.map(cell));
  const RAIL_WAY = [[2.6, 8.7], [4.8, 8.4], [6.0, 8.2], [8.0, 8.3], [10.6, 8.1], [13.0, 7.7], [15.4, 7.2], [17.6, 6.9], [20.4, 6.95], [24.0, 6.9], [27.0, 6.8], [29.6, 7.3], [31.4, 7.4], [34.6, 7.0], [37.0, 6.8], [40, 6.8]].map(cell);
  const EXTRA_FORDS = [[16.6, 0.95], [18.6, 1.35], [20.4, 1.0], [2.0, 1.6], [10.6, 6.0], [26.4, 6.9]].map(cell);

  // ================================================================ small math
  const r1 = (v) => Math.round(v * 10) / 10;
  const P = (p) => r1(p[0]) + ' ' + r1(p[1]);
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpP = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const scale = (a, k) => [a[0] * k, a[1] * k];
  const norm = (v) => {
    const L = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / L, v[1] / L];
  };
  const perp = (v) => [-v[1], v[0]];
  const deg = (v) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;
  const lineD = (pts) => 'M' + pts.map(P).join('L');
  const polyD = (pts) => lineD(pts) + 'Z';
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function smoothD(pts, closed) {
    const n = pts.length;
    if (n < 3) return lineD(pts);
    const g = (i) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
    let d = 'M' + P(pts[0]);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += 'C' + P(c1) + ' ' + P(c2) + ' ' + P(p2);
    }
    return d + (closed ? 'Z' : '');
  }
  function inPoly(p, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function cumLen(pts) {
    const c = [0];
    for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i]));
    return c;
  }
  // Point and unit tangent at arc length d along a polyline.
  function at(pts, cum, d) {
    const L = cum[cum.length - 1];
    d = clamp(d, 0, L);
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const p = lerpP(pts[i - 1], pts[i], (d - cum[i - 1]) / seg);
    const t = norm(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 2)]));
    return { p, t };
  }
  function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function sampleQuad(a, c, b, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
    }
    return out;
  }
  // A tapered campaign arrow (body + head) along a polyline, as one closed path.
  function arrowD(pts, w0, w1, headL, headW) {
    const cum = cumLen(pts), L = cum[cum.length - 1];
    const bodyL = Math.max(L - headL, L * 0.35);
    const left = [], right = [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const d = (bodyL * i) / steps;
      const m = at(pts, cum, d);
      const n = perp(m.t);
      const w = lerp(w0, w1, d / L) / 2;
      left.push(add(m.p, n, w));
      right.push(add(m.p, n, -w));
    }
    const base = at(pts, cum, bodyL);
    const tip = pts[pts.length - 1];
    const n = perp(base.t);
    return polyD([...left, add(base.p, n, headW / 2), tip, add(base.p, n, -headW / 2), ...right.reverse()]);
  }
  function blobD(R, seed) {
    const rnd = rng(seed);
    const pts = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = R * (0.9 + rnd() * 0.2);
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return smoothD(pts, true);
  }

  // ================================================================ borders
  // 1. Grid corners: frame corners stay put, corners on the frame slide along it, interior ones jitter.
  const NR = GRID.length;
  const ownerAt = (c, r) => (c < 0 || r < 0 || c >= COLS || r >= NR ? null : CODE[GRID[r][c]]);
  const CORNER = {};
  function corner(i, j) {
    const k = i + ',' + j;
    if (!CORNER[k]) {
      const rnd = rng(hashStr('corner' + k));
      const cw = (F.x1 - F.x0) / COLS;
      const hs = [j > 0 ? ROW_Y[j] - ROW_Y[j - 1] : Infinity, j < NR ? ROW_Y[j + 1] - ROW_Y[j] : Infinity];
      let x = colX(i), y = ROW_Y[j];
      if (i > 0 && i < COLS) x += (rnd() - 0.5) * cw * 0.8;
      if (j > 0 && j < NR) y += (rnd() - 0.5) * Math.min(...hs) * 0.7;
      CORNER[k] = [x, y];
    }
    return CORNER[k];
  }

  // 2. Each region's outline as a loop of unit cell sides (clockwise on screen), each side tagged with
  //    the region on its other side ('out' = the edge of the sheet).
  const REGION_CELLS = {};
  for (let r = 0; r < NR; r++) for (let c = 0; c < COLS; c++) (REGION_CELLS[ownerAt(c, r)] = REGION_CELLS[ownerAt(c, r)] || []).push([c, r]);
  function outlineOf(id) {
    const next = {};
    const put = (a, b, other) => {
      const k = a.join(',');
      if (next[k]) throw new Error(`theater grid: region ${id} pinches at corner ${k}`);
      next[k] = { a, b, other: other || 'out' };
    };
    for (const [c, r] of REGION_CELLS[id]) {
      if (ownerAt(c, r - 1) !== id) put([c, r], [c + 1, r], ownerAt(c, r - 1));
      if (ownerAt(c + 1, r) !== id) put([c + 1, r], [c + 1, r + 1], ownerAt(c + 1, r));
      if (ownerAt(c, r + 1) !== id) put([c + 1, r + 1], [c, r + 1], ownerAt(c, r + 1));
      if (ownerAt(c - 1, r) !== id) put([c, r + 1], [c, r], ownerAt(c - 1, r));
    }
    const keys = Object.keys(next);
    const loop = [];
    let e = next[keys[0]];
    do {
      loop.push(e);
      e = next[e.b.join(',')];
    } while (e !== next[keys[0]] && loop.length <= keys.length);
    if (loop.length !== keys.length) throw new Error(`theater grid: region ${id} is not one piece`);
    return loop;
  }

  // 3. Chains: maximal runs of sides between the same two regions. Each is drawn once (corner-cut
  //    smoothing plus a little hand-drawn wobble) and shared by both regions.
  const chainKey = (o1, o2, n1, n2) => [o1, o2].sort().join('~') + '@' + [n1, n2].sort().join('/');
  const CHAINS = {}; // key -> { key, owners, nodes (canonical), pts }
  function chainPts(nodes, other, key) {
    let pts = nodes.map(([i, j]) => corner(i, j));
    if (other === 'out') return pts;
    for (let it = 0; it < 3; it++) {
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        if (i > 0) out.push(lerpP(p, q, 0.25));
        if (i < pts.length - 2) out.push(lerpP(p, q, 0.75));
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    const rnd = rng(hashStr(key));
    // a slow meander along the whole border (tapered to zero at both ends, so junctions still meet)
    {
      const cum = cumLen(pts), L = cum[cum.length - 1];
      const A = Math.min(26, L * 0.07), p1 = rnd() * 6.3, p2 = rnd() * 6.3;
      pts = pts.map((p, i) => {
        if (i === 0 || i === pts.length - 1) return p;
        const d = cum[i];
        const t = norm(sub(pts[i + 1], pts[i - 1]));
        const off = A * Math.sin((Math.PI * d) / L) * (0.65 * Math.sin(d / 70 + p1) + 0.35 * Math.sin(d / 29 + p2));
        return add(p, perp(t), off);
      });
    }
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const A = pts[i - 1], B = pts[i];
      const L = dist(A, B);
      const n = perp(norm(sub(B, A)));
      const k = Math.max(1, Math.round(L / 14));
      for (let s = 1; s <= k; s++) {
        const p = lerpP(A, B, s / k);
        out.push(s === k ? B : add(p, n, (rnd() - 0.5) * Math.min(5, L * 0.12)));
      }
    }
    return out;
  }

  const PTS = {}; // region id -> outline points
  const EDGES = {}; // chain key -> { key, owners: [region ids] } (one owner = the edge of the sheet)
  for (const id of Object.keys(REGION_CELLS)) {
    const loop = outlineOf(id);
    // start the loop where the neighbour changes, then cut it into runs
    let s = loop.findIndex((e, i) => e.other !== loop[(i - 1 + loop.length) % loop.length].other);
    if (s < 0) s = 0;
    const ring = [...loop.slice(s), ...loop.slice(0, s)];
    const runs = [];
    for (const e of ring) {
      const last = runs[runs.length - 1];
      if (last && last.other === e.other) last.nodes.push(e.b);
      else runs.push({ other: e.other, nodes: [e.a, e.b] });
    }
    const pts = [];
    for (const run of runs) {
      const n1 = run.nodes[0].join(','), n2 = run.nodes[run.nodes.length - 1].join(',');
      const key = chainKey(id, run.other, n1, n2);
      if (!CHAINS[key]) {
        CHAINS[key] = { key, owners: run.other === 'out' ? [id] : [id, run.other], nodes: run.nodes, pts: chainPts(run.nodes, run.other, key) };
        EDGES[key] = { key, owners: CHAINS[key].owners };
      }
      const ch = CHAINS[key];
      const forward = ch.nodes[0].join(',') === n1;
      const cp = forward ? ch.pts : ch.pts.slice().reverse();
      pts.push(...cp.slice(0, -1));
    }
    PTS[id] = pts;
  }
  const EINFO = {};
  function edgeInfo(key) {
    if (!EINFO[key]) {
      const pts = CHAINS[key].pts;
      const cum = cumLen(pts);
      EINFO[key] = { key, pts, cum, L: cum[cum.length - 1] };
    }
    return EINFO[key];
  }
  // The edge with `sign` such that perp(tangent) * sign points INTO `region`.
  function towards(key, region) {
    const e = edgeInfo(key);
    const m = at(e.pts, e.cum, e.L / 2);
    const sign = inPoly(add(m.p, perp(m.t), 6), PTS[region]) ? 1 : -1;
    return { ...e, sign, mid: m.p, t: m.t, n: scale(perp(m.t), sign) };
  }
  const inHole = (p) => HOLE_IDS.some((h) => inPoly(p, PTS[h]));
  const isSector = (o) => !!GEO[o];
  const friendly = (o, states) => o === 'sea' || states[o] === 'captured';
  const sectorIndex = (o) => (o === 'sea' ? -1 : TH().SECTORS.findIndex((s) => s.id === o));

  // The border a force enters `id` through: a friendly one if there is one, else the neighbour nearest
  // the start of the campaign (only matters with ?unlock or for locked sectors).
  function bestEntry(id, states, sectorsOnly) {
    let best = null;
    for (const e of Object.values(EDGES)) {
      if (e.owners.length !== 2 || !e.owners.includes(id)) continue;
      const other = e.owners[0] === id ? e.owners[1] : e.owners[0];
      if (!(isSector(other) || (other === 'sea' && !sectorsOnly))) continue;
      const L = edgeInfo(e.key).L;
      const score = (friendly(other, states) ? 1e7 : (20 - sectorIndex(other)) * 1e4) + L;
      if (!best || score > best.score) best = { key: e.key, other, score };
    }
    return best ? { ...towards(best.key, id), other: best.other, friendlySide: friendly(best.other, states) } : null;
  }

  // ================================================================ state helpers
  const TH = () => CoC.theater;
  const APP = () => CoC.app;
  const esc = (s) => (APP() && APP().esc ? APP().esc(s) : String(s));
  const sfx = (name, ...a) => {
    try {
      CoC.audio.sfx[name](...a);
    } catch (e) {
      /* sound is optional */
    }
  };
  const medals = (id) => (APP().S.save.medals[id] || []);
  const levelName = (id) => {
    const lv = APP().levelById(id);
    return lv ? lv.name : null;
  };

  function sectorStats(sec, doneSet) {
    let done = 0, stars = 0, last = -1;
    sec.missions.forEach((m, i) => {
      if (doneSet ? doneSet.has(m) : medals(m)[0]) {
        done++;
        last = i;
      }
      stars += medals(m).filter(Boolean).length;
    });
    return { done, stars, max: sec.missions.length * 3, last, n: sec.missions.length };
  }

  function doneSetNow() {
    return new Set(TH().allLevelIds().filter((id) => medals(id)[0]));
  }

  function snapshot(st) {
    return {
      sectors: { ...st.sectors },
      done: TH().allLevelIds().filter((id) => medals(id)[0]),
      raids: TH().SPECIALS.filter((sp) => st.missions[sp.level] !== 'locked').map((sp) => sp.level),
    };
  }

  // What changed since the player last saw the map: the animations to play.
  function diffPlan(seen, st, opts) {
    // opened: newly attackable (also once enough stars arrive); reached: newly on the front but held back
    // for lack of stars; breached: contact restored with a sector's units.
    const plan = { captured: [], opened: [], reached: [], breached: [], raids: [], advance: null, any: false };
    if (!seen || !seen.sectors) return plan;
    for (const s of TH().SECTORS) {
      const a = seen.sectors[s.id], b = st.sectors[s.id];
      if (b === 'captured' && a !== 'captured') plan.captured.push(s.id);
      else if ((b === 'open' || b === 'gated') && (!a || a === 'locked' || a === 'short')) plan.opened.push(s.id);
      else if (b === 'short' && (!a || a === 'locked')) plan.reached.push(s.id);
      else if (b === 'open' && a === 'gated') plan.breached.push(s.id);
    }
    const seenRaids = new Set(seen.raids || []);
    for (const sp of TH().SPECIALS) if (st.missions[sp.level] !== 'locked' && !seenRaids.has(sp.level)) plan.raids.push(sp.level);
    const seenDone = new Set(seen.done || []);
    const adv = {};
    for (const s of TH().SECTORS) {
      if (st.sectors[s.id] !== 'open') continue;
      const fresh = s.missions.filter((m) => medals(m)[0] && !seenDone.has(m));
      if (fresh.length) adv[s.id] = fresh;
    }
    const jw = opts && opts.justWon && TH().sectorFor(opts.justWon);
    const pick = jw && adv[jw.id] ? jw.id : Object.keys(adv)[0];
    if (pick) plan.advance = { sector: pick, seenDone };
    plan.any = !!(plan.captured.length || plan.opened.length || plan.reached.length || plan.breached.length || plan.raids.length || plan.advance);
    return plan;
  }

  // ================================================================ module state
  let root = null;
  let els = {};
  let ctx = null; // { st, plan, pre, gen }
  let gen = 0;
  let bound = false;
  let lastSector = null; // sector the player last worked in (restored when coming back from a mission)
  const V = { vb: null, s: 1, sHome: 1, k: 1, zoomId: null, raf: 0, animating: false, camX: null, targetX: 0, scrollRaf: 0 };
  let drag = null;
  let suppressClick = false;
  let keyboardNav = false;

  // ================================================================ art: defs & sprites
  const NOISE =
    'data:image/svg+xml,' +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .32 0 0 0 0 .22 0 0 0 0 .1 0 0 0 .7 -.25'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>"
    );
  // Top-down fighter: tapered wings with rounded tips, tailplane, canopy, spinning airscrew.
  const PLANE =
    'M21 0C21 -1.9 18.6 -3.1 14 -3.3L8 -3.4L5.6 -20.5Q5 -22.6 2.6 -22.6L-1.6 -22.4Q-3.6 -22.2 -4 -20L-5.4 -3.2L-14 -2.3L-16.4 -8.6Q-17 -9.6 -18.2 -9.6H-19.4Q-20.4 -9.6 -20.4 -8.4L-20 -1.6L-21.5 -1V1L-20 1.6L-20.4 8.4Q-20.4 9.6 -19.4 9.6H-18.2Q-17 9.6 -16.4 8.6L-14 2.3L-5.4 3.2L-4 20Q-3.6 22.2 -1.6 22.4L2.6 22.6Q5 22.6 5.6 20.5L8 3.4L14 3.3C18.6 3.1 21 1.9 21 0Z';
  const OUT = 'stroke="#111" stroke-opacity=".6" stroke-width="1.1"';
  const TANK =
      '<ellipse cx="2.5" cy="3.5" rx="17" ry="11.5" fill="#000" opacity=".22"/>' +
      '<rect x="-15" y="-11" width="30" height="7" rx="2.5" fill="#26261f"/><rect x="-15" y="4" width="30" height="7" rx="2.5" fill="#26261f"/>' +
      '<path d="M-14 -7.5h28M-14 7.5h28" stroke="#80806f" stroke-width="5" stroke-dasharray="1.3 2.2"/>' +
      `<rect x="-13" y="-7" width="26" height="14" rx="2.5" fill="currentColor" ${OUT}/>` +
      '<rect x="-12" y="-6" width="24" height="4.5" rx="2" fill="#fff" opacity=".16"/>' +
      '<rect x="3" y="-1.4" width="18" height="2.8" rx="1" fill="#1d1d18"/>' +
      `<circle cx="-1" cy="0" r="6.4" fill="currentColor" ${OUT}/><circle cx="-2.6" cy="-1.9" r="2.3" fill="#fff" opacity=".25"/>`;
  const SOLDIER =
    '<ellipse cx="1.4" cy="1.8" rx="4.4" ry="6" fill="#000" opacity=".2"/>' +
    `<ellipse cx="-1.4" cy="0" rx="3" ry="5.4" fill="currentColor" ${OUT}/>` +
    '<path d="M1.5 3.2h8.5" stroke="#1d1d18" stroke-width="1.5" stroke-linecap="round"/><path d="M-.5 -3.8l2.8 -1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    `<circle r="3.4" fill="currentColor" ${OUT}/><circle cx="-1" cy="-1" r="1.2" fill="#fff" opacity=".35"/>`;
  // a lorry chassis with its own body on the back
  const VAN = (body) =>
    '<ellipse cx="2" cy="3" rx="17" ry="9" fill="#000" opacity=".2"/>' +
    '<g fill="#1d1d18"><rect x="-12" y="-9" width="5" height="3" rx="1"/><rect x="-12" y="6" width="5" height="3" rx="1"/><rect x="-4" y="-9" width="5" height="3" rx="1"/><rect x="-4" y="6" width="5" height="3" rx="1"/><rect x="8" y="-8.5" width="5" height="3" rx="1"/><rect x="8" y="5.5" width="5" height="3" rx="1"/></g>' +
    body +
    `<rect x="6" y="-6" width="9" height="12" rx="2.2" fill="currentColor" ${OUT}/><rect x="11.4" y="-4.5" width="2.2" height="9" rx=".8" fill="#d6e4ea" opacity=".8"/>`;
  const SPRITES = {
    tank: TANK,
    // a sandbagged concrete pillbox with its firing slit facing the enemy
    bunker:
      '<ellipse cx="2" cy="3" rx="18" ry="15" fill="#000" opacity=".2"/>' +
      '<g fill="currentColor" stroke="#111" stroke-opacity=".55" stroke-width=".8">' +
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => {
        const a = ((i / 11) * 2 - 0.9) * Math.PI, x = Math.cos(a) * 15.5, y = Math.sin(a) * 13;
        return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="4.2" ry="2.6" transform="rotate(${((a * 180) / Math.PI + 90).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
      }).join('') +
      '</g><path d="M-10 -8L0 -12L10 -8L12 0L10 8L0 12L-10 8L-12 0Z" fill="#9a958a" stroke="#3a372f" stroke-width="1.2"/>' +
      '<path d="M-8 -6L0 -9L8 -6L9.5 0L8 6L0 9L-8 6L-9.5 0Z" fill="#b4ae9f"/><path d="M8 -4.5L12 -1.5V1.5L8 4.5" fill="none" stroke="#1d1d18" stroke-width="2.6"/>',
    // a ridge tent with guy ropes, a radio mast and the flag
    tent:
      '<ellipse cx="2" cy="3" rx="20" ry="14" fill="#000" opacity=".2"/>' +
      '<path d="M-17 -12L-21 -15M17 -12L21 -15M-17 12L-21 15M17 12L21 15" stroke="#3a2f1d" stroke-width=".9"/>' +
      `<path d="M-16 -10H16L19 0L16 10H-16L-19 0Z" fill="currentColor" ${OUT}/>` +
      '<path d="M-16 -10H16L19 0H-19Z" fill="#fff" opacity=".18"/><path d="M-19 0H19" stroke="#111" stroke-opacity=".5" stroke-width="1.2"/>' +
      '<path d="M22 -6V-26" stroke="#2a2418" stroke-width="1.3"/><path d="M22 -26L34 -22L22 -18Z" fill="currentColor" stroke="#111" stroke-opacity=".5" stroke-width=".6"/>' +
      '<path d="M-22 6V-20M-26 -16L-22 -20L-18 -16" stroke="#2a2418" stroke-width="1" fill="none"/>',
    ltank: `<g transform="scale(.78)">${TANK}</g>`,
    sgun:
      '<ellipse cx="2.5" cy="3.5" rx="18" ry="12" fill="#000" opacity=".22"/>' +
      '<rect x="-16" y="-11" width="32" height="7" rx="2.5" fill="#26261f"/><rect x="-16" y="4" width="32" height="7" rx="2.5" fill="#26261f"/>' +
      '<path d="M-15 -7.5h30M-15 7.5h30" stroke="#80806f" stroke-width="5" stroke-dasharray="1.3 2.2"/>' +
      `<path d="M-14 -7.5H6L14 -4V4L6 7.5H-14Z" fill="currentColor" ${OUT}/>` +
      '<path d="M-12 -6H4L9 -3V3L4 6H-12Z" fill="#fff" opacity=".1"/>' +
      '<rect x="12" y="-1.7" width="17" height="3.4" rx="1" fill="#1d1d18"/><rect x="-10" y="-3" width="8" height="6" rx="1" fill="#000" opacity=".25"/>',
    skier: '<path d="M-10 -3h20M-10 3h20" stroke="#3a2f1d" stroke-width="1.3" stroke-linecap="round"/><path d="M-4 -7l-6 -3M-4 7l-6 3" stroke="#3a2f1d" stroke-width=".9"/>' + SOLDIER,
    sapper: SOLDIER + '<rect x="-7.5" y="-3" width="4.5" height="6" rx="1" fill="#8a5a2a" stroke="#2a1d10" stroke-width=".7"/><path d="M-5 -3v6" stroke="#e8d27a" stroke-width=".8"/>',
    train:
      '<ellipse cx="0" cy="3" rx="36" ry="10" fill="#000" opacity=".2"/>' +
      '<path d="M-38 -5.5H36M-38 5.5H36" stroke="#3a2f1d" stroke-width="1.2" opacity=".6"/>' +
      `<rect x="-36" y="-7" width="31" height="14" rx="2" fill="currentColor" ${OUT}/><rect x="-2" y="-7.5" width="36" height="15" rx="2.5" fill="currentColor" ${OUT}/>` +
      '<rect x="-5" y="-1.5" width="3" height="3" fill="#1d1d18"/><path d="M-33 -7v14M-27 -7v14M-21 -7v14M-15 -7v14M-9 -7v14" stroke="#000" stroke-opacity=".25"/>' +
      '<circle cx="16" r="5.5" fill="currentColor" stroke="#111" stroke-opacity=".65"/><rect x="20" y="-1.3" width="15" height="2.6" rx="1" fill="#1d1d18"/>' +
      '<circle cx="2" r="3.5" fill="currentColor" stroke="#111" stroke-opacity=".65"/><rect x="4" y="-1" width="8" height="2" fill="#1d1d18"/>',
    bowser: VAN('<rect x="-15" y="-6.5" width="20" height="13" rx="6.5" fill="currentColor" stroke="#111" stroke-opacity=".6" stroke-width="1.1"/><rect x="-14" y="-5" width="18" height="4" rx="2" fill="#fff" opacity=".25"/><circle cx="-4.5" cy="0" r="1.6" fill="#1d1d18"/>'),
    radarvan: VAN('<rect x="-15" y="-7" width="20" height="14" rx="1.6" fill="currentColor" stroke="#111" stroke-opacity=".6" stroke-width="1.1"/><ellipse cx="-5" cy="0" rx="4.5" ry="9" fill="#e9e1c6" stroke="#2a2418" stroke-width="1.1"/><path d="M-5 0h6" stroke="#2a2418" stroke-width="1.2"/><circle cx="1" r="1.2" fill="#2a2418"/>'),
    sigvan: VAN('<rect x="-15" y="-7" width="20" height="14" rx="1.6" fill="currentColor" stroke="#111" stroke-opacity=".6" stroke-width="1.1"/><rect x="-15" y="-7" width="20" height="14" rx="1.6" fill="#efe6cc" opacity=".18"/><path d="M-12 -4L-22 -14M-12 4L-19 14" stroke="#222" stroke-width="1" stroke-linecap="round"/>'),
    aa:
      '<ellipse cx="0" cy="2.5" rx="14" ry="10" fill="#000" opacity=".18"/>' +
      '<path d="M-12 -9L12 9M-12 9L12 -9" stroke="#1d1d18" stroke-width="2.4" stroke-linecap="round"/>' +
      `<circle r="7" fill="currentColor" ${OUT}/><rect x="2" y="-3.6" width="17" height="2.2" rx="1" fill="#1d1d18"/><rect x="2" y="1.4" width="17" height="2.2" rx="1" fill="#1d1d18"/><circle r="2.6" fill="#1d1d18" opacity=".6"/>`,
    moto:
      '<ellipse cx="1" cy="2" rx="11" ry="5" fill="#000" opacity=".2"/>' +
      '<rect x="-11" y="-1.5" width="22" height="3" rx="1.5" fill="#1d1d18"/>' +
      `<ellipse cx="0" cy="0" rx="5.5" ry="2.6" fill="currentColor" ${OUT}/><path d="M7 -4v8" stroke="#1d1d18" stroke-width="1.4"/>` +
      `<ellipse cx="-2.5" cy="0" rx="2.6" ry="4.6" fill="currentColor" ${OUT}/><circle cx="-1.5" r="2.7" fill="currentColor" ${OUT}/>`,
    staff:
      '<ellipse cx="1.5" cy="2.5" rx="14" ry="8.5" fill="#000" opacity=".2"/>' +
      '<g fill="#1d1d18"><rect x="-10" y="-8" width="5" height="2.6" rx="1"/><rect x="-10" y="5.4" width="5" height="2.6" rx="1"/><rect x="6" y="-8" width="5" height="2.6" rx="1"/><rect x="6" y="5.4" width="5" height="2.6" rx="1"/></g>' +
      `<path d="M-13 -6.4H8Q14 -6 15 0Q14 6 8 6.4H-13Q-15 0 -13 -6.4Z" fill="currentColor" ${OUT}/>` +
      '<rect x="-6" y="-5" width="10" height="10" rx="2" fill="#d6e4ea" opacity=".55"/><rect x="-5" y="-4" width="8" height="8" rx="1.5" fill="currentColor" opacity=".9"/>' +
      '<path d="M12 -5l3 -4" stroke="#b5452f" stroke-width="1.4"/><path d="M15 -9l4 1 -4 2z" fill="#b5452f"/>',
    truck:
      '<ellipse cx="2" cy="3" rx="17" ry="9" fill="#000" opacity=".2"/>' +
      '<g fill="#1d1d18"><rect x="-12" y="-9" width="5" height="3" rx="1"/><rect x="-12" y="6" width="5" height="3" rx="1"/><rect x="-5" y="-9" width="5" height="3" rx="1"/><rect x="-5" y="6" width="5" height="3" rx="1"/><rect x="8" y="-8.5" width="5" height="3" rx="1"/><rect x="8" y="5.5" width="5" height="3" rx="1"/></g>' +
      `<rect x="-15" y="-7" width="20" height="14" rx="1.6" fill="currentColor" ${OUT}/><rect x="-15" y="-7" width="20" height="14" rx="1.6" fill="#efe6cc" opacity=".3"/>` +
      '<path d="M-11 -7v14M-6 -7v14M-1 -7v14" stroke="#111" stroke-opacity=".3" stroke-width="1"/>' +
      `<rect x="6" y="-6" width="9" height="12" rx="2.2" fill="currentColor" ${OUT}/><rect x="11.4" y="-4.5" width="2.2" height="9" rx=".8" fill="#d6e4ea" opacity=".8"/>`,
    soldier: SOLDIER,
    mule:
      '<ellipse cx="1" cy="2" rx="13" ry="7" fill="#000" opacity=".18"/>' +
      '<path d="M-9 0h-5" stroke="#4a3520" stroke-width="1.6" stroke-linecap="round"/>' +
      '<ellipse cx="0" cy="0" rx="9.5" ry="4.6" fill="#7a5a3a" stroke="#2a1d10" stroke-width=".9"/>' +
      '<ellipse cx="11" cy="0" rx="4" ry="2.4" fill="#7a5a3a" stroke="#2a1d10" stroke-width=".9"/>' +
      '<path d="M9.5 -2l-1.5 -3M9.5 2l-1.5 3" stroke="#2a1d10" stroke-width="1.1" stroke-linecap="round"/>' +
      `<rect x="-5" y="-7.5" width="8" height="4" rx="1" fill="currentColor" ${OUT}/><rect x="-5" y="3.5" width="8" height="4" rx="1" fill="currentColor" ${OUT}/>` +
      '<rect x="-4" y="-2" width="6" height="4" rx="1" fill="#d8c99b" opacity=".8"/>',
    lgun:
      '<ellipse cx="0" cy="2" rx="12" ry="7" fill="#000" opacity=".18"/>' +
      '<path d="M-1 -1.5L-12 -6M-1 1.5L-12 6" stroke="#111" stroke-opacity=".7" stroke-width="3.2" stroke-linecap="round"/>' +
      '<path d="M-1 -1.5L-12 -6M-1 1.5L-12 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '<circle cx="0" cy="-7" r="3.2" fill="#1d1d18"/><circle cx="0" cy="7" r="3.2" fill="#1d1d18"/>' +
      '<rect x="1" y="-1.2" width="12" height="2.4" rx="1" fill="#1d1d18"/>' +
      `<rect x="-3.5" y="-3" width="6" height="6" rx="1.2" fill="currentColor" ${OUT}/>`,
    amtrac:
      '<ellipse cx="2.5" cy="3.5" rx="18" ry="12" fill="#000" opacity=".22"/>' +
      '<rect x="-16" y="-12" width="31" height="6" rx="2.5" fill="#26261f"/><rect x="-16" y="6" width="31" height="6" rx="2.5" fill="#26261f"/>' +
      '<path d="M-15 -9h29M-15 9h29" stroke="#80806f" stroke-width="4.5" stroke-dasharray="1.6 2"/>' +
      `<path d="M-15 -8H10L17 -4V4L10 8H-15Z" fill="currentColor" ${OUT}/>` +
      '<rect x="-12" y="-5" width="17" height="10" rx="1" fill="#000" opacity=".25"/>' +
      '<path d="M10 -6L15 -3V3L10 6" fill="none" stroke="#fff" stroke-opacity=".25"/>' +
      '<circle cx="8" cy="0" r="2" fill="#1d1d18"/><path d="M8 0h6" stroke="#1d1d18" stroke-width="1.4"/>',
    jeep:
      '<ellipse cx="1.5" cy="2.5" rx="13" ry="8.5" fill="#000" opacity=".2"/>' +
      '<g fill="#1d1d18"><rect x="-9" y="-8" width="4.5" height="2.8" rx="1"/><rect x="-9" y="5.2" width="4.5" height="2.8" rx="1"/><rect x="5" y="-8" width="4.5" height="2.8" rx="1"/><rect x="5" y="5.2" width="4.5" height="2.8" rx="1"/></g>' +
      `<rect x="-11" y="-6.2" width="23" height="12.4" rx="2.6" fill="currentColor" ${OUT}/>` +
      '<rect x="4.5" y="-5" width="7" height="10" rx="1.5" fill="#fff" opacity=".13"/><rect x="2.6" y="-5.6" width="1.5" height="11.2" fill="#d6e4ea" opacity=".85"/>' +
      '<rect x="-4.5" y="-4.4" width="4.5" height="3.6" rx="1" fill="#000" opacity=".3"/><rect x="-4.5" y=".8" width="4.5" height="3.6" rx="1" fill="#000" opacity=".3"/>' +
      '<path d="M-9.5 -4.5L-17 -11" stroke="#222" stroke-width="1" stroke-linecap="round"/>',
    bridge:
      '<ellipse cx="2.5" cy="3.5" rx="19" ry="12" fill="#000" opacity=".22"/>' +
      '<rect x="-16" y="-11" width="32" height="7" rx="2.5" fill="#26261f"/><rect x="-16" y="4" width="32" height="7" rx="2.5" fill="#26261f"/>' +
      '<path d="M-15 -7.5h30M-15 7.5h30" stroke="#80806f" stroke-width="5" stroke-dasharray="1.3 2.2"/>' +
      `<rect x="-14" y="-7" width="28" height="14" rx="2.5" fill="currentColor" ${OUT}/>` +
      '<rect x="-19" y="-8.5" width="36" height="17" rx="1.5" fill="#e3d6ae" stroke="#3a2f1d" stroke-width="1.1"/>' +
      '<path d="M-19 0h36M-15 -8.5l4 8.5 4 -8.5 4 8.5 4 -8.5 4 8.5 4 -8.5 4 8.5" stroke="#3a2f1d" stroke-width=".8" fill="none" opacity=".7"/>',
    arty:
      '<ellipse cx="0" cy="3" rx="17" ry="10" fill="#000" opacity=".18"/>' +
      '<path d="M-1 -2L-17 -9M-1 2L-17 9" stroke="#111" stroke-opacity=".7" stroke-width="4.2" stroke-linecap="round"/>' +
      '<path d="M-1 -2L-17 -9M-1 2L-17 9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
      '<rect x="-4" y="-11.5" width="7" height="3.6" rx="1.2" fill="#1d1d18"/><rect x="-4" y="7.9" width="7" height="3.6" rx="1.2" fill="#1d1d18"/>' +
      '<rect x="3" y="-1.5" width="21" height="3" rx="1" fill="#1d1d18"/>' +
      `<rect x="-5" y="-4" width="9" height="8" rx="1.5" fill="currentColor" ${OUT}/><rect x="3" y="-8.5" width="3.2" height="17" rx="1" fill="currentColor" ${OUT}/>`,
    'plane-sh': `<path d="${PLANE}" fill="#000" opacity=".16"/>`,
    plane:
      `<path d="${PLANE}" fill="currentColor" stroke="#111" stroke-opacity=".65" stroke-width="1"/>` +
      '<path d="M6.6 -19L4.6 -3.8M6.6 19L4.6 3.8" stroke="#fff" stroke-opacity=".3" stroke-width="1.4" stroke-linecap="round"/>' +
      '<path d="M-3 -19.5L-4.4 -4.4M-3 19.5L-4.4 4.4M-15.6 -7.6L-14.4 -3M-15.6 7.6L-14.4 3" stroke="#000" stroke-opacity=".28" stroke-width="1"/>' +
      '<path d="M-6 0H-20.5" stroke="#111" stroke-opacity=".55" stroke-width="1.8" stroke-linecap="round"/>' +
      '<ellipse cx="7.8" cy="0" rx="4.4" ry="1.9" fill="#d6e6ee" stroke="#111" stroke-opacity=".5" stroke-width=".6"/>' +
      '<circle cx=".8" cy="-14" r="3.4" fill="#efe6cc"/><circle cx=".8" cy="-14" r="1.7" fill="currentColor"/><circle cx=".8" cy="14" r="3.4" fill="#efe6cc"/><circle cx=".8" cy="14" r="1.7" fill="currentColor"/>' +
      '<ellipse cx="21.7" cy="0" rx="1.2" ry="8.5" fill="#fff" opacity=".38"/><circle cx="21.3" cy="0" r="1.7" fill="#333"/>',
    lc:
      '<path d="M-14 -5Q-26 -8 -40 -15M-14 5Q-26 8 -40 15M-15 0H-34" stroke="#f6f1e2" stroke-width="1.6" fill="none" opacity=".85" stroke-linecap="round"/>' +
      `<path d="M-14 -6.5H9L13 -5.5V5.5L9 6.5H-14Q-16.5 0 -14 -6.5Z" fill="currentColor" ${OUT}/>` +
      '<rect x="-9" y="-4" width="16" height="8" rx="1" fill="#000" opacity=".22"/><rect x="-13" y="-3" width="4" height="6" rx="1" fill="#efe6cc" opacity=".55"/>' +
      '<g fill="currentColor" stroke="#111" stroke-opacity=".5" stroke-width=".6"><circle cx="-5" cy="-1.6" r="1.4"/><circle cx="-5" cy="1.6" r="1.4"/><circle cx="0" cy="-1.6" r="1.4"/><circle cx="0" cy="1.6" r="1.4"/><circle cx="4.5" cy="0" r="1.4"/></g>',
    ship:
      '<path d="M-34 -4Q-52 -8 -74 -15M-34 4Q-52 8 -74 15" stroke="#f6f1e2" stroke-width="1.8" fill="none" opacity=".8"/>' +
      `<path d="M-34 -6.5H14Q30 -4.5 37 0Q30 4.5 14 6.5H-34Q-37.5 0 -34 -6.5Z" fill="currentColor" ${OUT}/>` +
      '<rect x="-12" y="-3.6" width="17" height="7.2" rx="1.5" fill="#efe6cc" opacity=".45"/><rect x="-4" y="-2" width="5" height="4" fill="#222" opacity=".6"/>' +
      '<circle cx="19" cy="0" r="3.2" fill="#222" opacity=".55"/><path d="M19 0h10" stroke="#222" stroke-width="1.7"/>' +
      '<circle cx="-24" cy="0" r="3.2" fill="#222" opacity=".55"/><path d="M-24 0h-9" stroke="#222" stroke-width="1.7"/>',
  };
  const STAR_D = 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z';

  function defs() {
    let d = '<defs>';
    d += `<pattern id="th-noise" width="240" height="240" patternUnits="userSpaceOnUse"><image href="${NOISE}" width="240" height="240"/></pattern>`;
    d += '<pattern id="th-hatch" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="13" height="13" fill="rgba(181,69,47,.10)"/><rect width="2.6" height="13" fill="rgba(168,55,31,.42)"/></pattern>';
    d += '<pattern id="th-hatch-deep" width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="11" height="11" fill="rgba(110,34,18,.13)"/><rect width="2.4" height="11" fill="rgba(110,34,18,.3)"/></pattern>';
    d += '<radialGradient id="th-fogblob"><stop offset="0" stop-color="#ebe5d4" stop-opacity=".62"/><stop offset="1" stop-color="#ebe5d4" stop-opacity="0"/></radialGradient>';
    d += '<pattern id="th-waves" width="46" height="22" patternUnits="userSpaceOnUse"><path d="M3 8q5-5 10 0t10 0M26 18q5-5 10 0t10 0" fill="none" stroke="#5f8299" stroke-width="1.1" opacity=".45"/></pattern>';
    d += '<pattern id="th-marsh" width="40" height="26" patternUnits="userSpaceOnUse"><g stroke="#4f7488" stroke-width="1.3" opacity=".55" fill="none"><path d="M4 9h12M8 9v-4M10 9v-5M12 9v-4"/><path d="M24 21h12M28 21v-4M30 21v-5M32 21v-4"/></g></pattern>';
    d += '<pattern id="th-trees" width="22" height="20" patternUnits="userSpaceOnUse"><g fill="rgba(95,115,60,.18)" stroke="#5c6b3a" stroke-width="1" opacity=".7"><circle cx="6" cy="6" r="4.2"/><circle cx="17" cy="15" r="4.2"/></g></pattern>';
    d += '<pattern id="th-desk" width="600" height="90" patternUnits="userSpaceOnUse"><rect width="600" height="90" fill="#2a2117"/><g fill="none" stroke="#3a2d1e" stroke-width="2" opacity=".6"><path d="M0 14C120 8 240 24 360 15S560 10 600 16"/><path d="M0 42C150 36 260 52 380 44S540 38 600 44"/><path d="M0 70C100 66 230 80 350 72S520 64 600 72"/></g><path d="M0 28C160 24 300 34 600 28" stroke="#1d160f" stroke-width="1.2" opacity=".5" fill="none"/></pattern>';
    d += '<radialGradient id="th-vignette" cx="50%" cy="50%" r="72%"><stop offset=".62" stop-color="#7a5524" stop-opacity="0"/><stop offset="1" stop-color="#6a4519" stop-opacity=".38"/></radialGradient>';
    d += '<radialGradient id="th-stain"><stop offset="0" stop-color="#8a6530" stop-opacity=".16"/><stop offset=".7" stop-color="#8a6530" stop-opacity=".07"/><stop offset="1" stop-color="#8a6530" stop-opacity="0"/></radialGradient>';
    d += '<radialGradient id="th-pin-r" cx="35%" cy="35%"><stop offset="0" stop-color="#ff9a80"/><stop offset=".45" stop-color="#c8361c"/><stop offset="1" stop-color="#6e1508"/></radialGradient>';
    d += '<radialGradient id="th-pin-b" cx="35%" cy="35%"><stop offset="0" stop-color="#a9c8f0"/><stop offset=".45" stop-color="#2f5d93"/><stop offset="1" stop-color="#142a48"/></radialGradient>';
    for (const [k, v] of Object.entries(SPRITES)) d += `<g id="th-s-${k}">${v}</g>`;
    return d + '</defs>';
  }

  const PLANE_USE = '<use href="#th-s-plane-sh" transform="translate(14 24)"/><use href="#th-s-plane"/>';
  const use = (k, x, y, r, sc, cls) =>
    `<g class="th-u ${cls}" transform="translate(${r1(x)} ${r1(y)}) rotate(${r1(r)}) scale(${sc})"><use href="#th-s-${k}"/></g>`;



  // ================================================================ the static map (paper, terrain, decoration)
  function town(x, y, name, opt = {}) {
    const rnd = rng(hashStr(name));
    let s = `<g class="th-town" transform="translate(${x} ${y})">`;
    const n = opt.big ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const bx = (rnd() - 0.5) * (opt.big ? 26 : 16), by = (rnd() - 0.5) * (opt.big ? 18 : 12);
      s += `<rect x="${r1(bx - 3)}" y="${r1(by - 2.5)}" width="${opt.big ? 6.5 : 5.5}" height="${opt.big ? 5.5 : 4.5}" transform="rotate(${r1(rnd() * 30 - 15)} ${r1(bx)} ${r1(by)})"/>`;
    }
    if (opt.mast) s += '<path class="th-mast" d="M18 4L22 -18L26 4M19 -4h6M22 -18v-4M17 -24q5 -5 10 0"/>';
    if (opt.big) s += '<path class="th-capstar" d="M0 -26l3.2 6.6 7.2 1-5.2 5 1.2 7.2L0 -9.6l-6.4 3.4 1.2-7.2-5.2-5 7.2-1z"/>';
    s += `<text y="${opt.big ? 28 : 20}" class="${opt.big ? 'big' : ''}">${name}</text></g>`;
    return s;
  }

  function coffee(x, y, r, seed) {
    const rnd = rng(seed);
    const da = `${r1(r * 2.2)} ${r1(r * 0.25)} ${r1(r * 1.6)} ${r1(r * 0.12)}`;
    let s = `<g class="th-coffee" transform="translate(${x} ${y}) rotate(${r1(rnd() * 360)})">`;
    s += `<circle r="${r}" class="cf-fill"/>`;
    s += `<circle r="${r}" class="cf-ring" stroke-dasharray="${da}"/>`;
    s += `<circle r="${r - 4}" class="cf-ring2"/>`;
    s += `<path class="cf-ring" d="M${r1(r * 0.7)} ${r1(-r * 0.72)}A${r} ${r} 0 0 1 ${r1(r * 0.98)} ${r1(r * 0.2)}" stroke-width="7"/>`;
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2, d = r + 8 + rnd() * 22;
      s += `<circle class="cf-drop" cx="${r1(Math.cos(a) * d)}" cy="${r1(Math.sin(a) * d)}" r="${r1(1.2 + rnd() * 3)}"/>`;
    }
    return s + '</g>';
  }

  function ringsAround(pts, factors, seed) {
    const rnd = rng(seed);
    const c = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    const step = Math.max(1, Math.floor(pts.length / 26));
    const base = pts.filter((_, i) => i % step === 0);
    return factors
      .map((f) => smoothD(base.map((p) => add(c, sub(p, c), f * (0.96 + rnd() * 0.08))), true))
      .map((d) => `<path class="th-contour" d="${d}"/>`)
      .join('');
  }
  function ellipseRings(cx, cy, rx, ry, rot, n, seed) {
    const rnd = rng(seed);
    let s = '';
    for (let k = 1; k <= n; k++) {
      const pts = [];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2, j = 0.92 + rnd() * 0.16;
        pts.push([Math.cos(a) * rx * k * j, Math.sin(a) * ry * k * j]);
      }
      s += `<path class="th-contour" transform="translate(${cx} ${cy}) rotate(${rot})" d="${smoothD(pts, true)}"/>`;
    }
    return s;
  }

  // The torn top-right corner of the sheet (drawn as paper edge, and as desk showing through).
  const TEAR = [[0, 0], [8, 9], [18, 4], [24, 16], [35, 12], [40, 26], [52, 24], [56, 38], [66, 42], [72, 56]].map(([x, y]) => [MW - 72 + x, y]);
  const tearD = () => TEAR.map(P).join('L');

  function paperAndTerrain() {
    let s = '';
    // desk, paper shadow, paper (top-right corner torn away)
    s += `<rect x="-4000" y="-4000" width="${MW + 8000}" height="9000" fill="url(#th-desk)"/>`;
    for (let i = 0; i < 4; i++) s += `<rect x="${6 + i * 4}" y="${10 + i * 5}" width="${MW}" height="${MH}" rx="6" fill="#000" opacity="${0.16 - i * 0.03}"/>`;
    const paper = `M0 0L${tearD()}V${MH}H0Z`;
    s += `<path d="${paper}" fill="#e6d7ae"/><path d="${paper}" fill="url(#th-noise)"/>`;
    s += `<path d="${paper}" fill="url(#th-vignette)"/>`;
    for (const [c, r, rx, ry] of [[1.6, 1.8, 280, 200], [8.5, 5.2, 330, 220], [6.0, 0.7, 240, 140], [15.5, 1.5, 300, 160], [19.5, 5.5, 360, 200], [26.5, 2.5, 300, 220], [30.5, 7.0, 260, 180], [36.0, 3.0, 320, 220]]) {
      const [x, y] = cell([c, r]);
      s += `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${rx}" ry="${ry}" fill="url(#th-stain)"/>`;
    }
    // sea and its depth lines
    s += `<path class="th-sea" d="${polyD(PTS.sea)}"/><path d="${polyD(PTS.sea)}" fill="url(#th-waves)"/>`;
    const coastKey = Object.keys(CHAINS).find((k) => CHAINS[k].owners.includes('sea') && CHAINS[k].owners.includes('beachhead'));
    if (coastKey) {
      const coast = CHAINS[coastKey].pts.filter((_, i, a) => i % 4 === 0 || i === a.length - 1);
      for (const off of [16, 38, 66]) {
        const pts = coast
          .map((p, i) => {
            const a = coast[Math.max(0, i - 1)], b = coast[Math.min(coast.length - 1, i + 1)];
            let n = perp(norm(sub(b, a)));
            if (!inPoly(add(p, n, 4), PTS.sea)) n = scale(n, -1);
            return add(p, n, off);
          })
          .filter((p) => inPoly(p, PTS.sea));
        if (pts.length > 2) s += `<path class="th-depth" d="${smoothD(pts, false)}"/>`;
      }
    }
    // the gulf: open water along the south of the front, with the harbour on its shore
    s += `<path class="th-sea" d="${polyD(PTS.gulf)}"/><path d="${polyD(PTS.gulf)}" fill="url(#th-waves)"/>`;
    for (const k of Object.keys(CHAINS)) {
      const ch = CHAINS[k];
      if (!ch.owners.includes('gulf') || ch.owners.length < 2) continue;
      for (const off of [14, 34]) {
        const t = towards(k, 'gulf');
        const pts = t.pts.filter((_, i, a) => i % 4 === 0 || i === a.length - 1).map((p, i, a) => {
          const m = at(t.pts, t.cum, (t.L * i) / Math.max(1, a.length - 1));
          return add(m.p, scale(perp(m.t), t.sign), off);
        });
        if (pts.length > 2) s += `<path class="th-depth" d="${smoothD(pts.filter((q) => inPoly(q, PTS.gulf)), false)}"/>`;
      }
    }
    // lakes, the mere, the massif
    for (const lk of ['lake', 'mere']) s += `<path class="th-lake" d="${polyD(PTS[lk])}"/><path class="th-lake-shore" d="${polyD(PTS[lk])}"/>`;
    const lab = (c, r, text, cls, rot = 0) => {
      const [x, y] = cell([c, r]);
      return `<text class="${cls}" x="${r1(x)}" y="${r1(y)}" transform="rotate(${rot} ${r1(x)} ${r1(y)})">${text}</text>`;
    };
    s += lab(30.55, 4.6, 'STILLMEER', 'th-water-label', -84) + lab(17.9, 5.62, 'BLACK MERE', 'th-water-label', -2) + lab(22.6, 8.92, 'GULF OF KESSEL', 'th-water-label big');
    s += `<path class="th-massif" d="${polyD(PTS.massif)}"/>`;
    s += ringsAround(PTS.massif, [1, 0.8, 0.6, 0.4, 0.22], 11);
    s += '<g class="th-rocks">';
    for (const [c, r] of [[7.0, 3.4], [8.0, 3.6], [9.0, 3.3], [10.0, 3.55], [11.0, 3.3], [12.0, 3.6], [13.0, 3.4], [13.6, 2.5], [15.0, 2.45], [16.4, 2.55], [17.8, 2.45], [19.2, 2.55], [20.6, 2.45], [21.8, 2.55]]) {
      const [x, y] = cell([c, r]);
      s += `<path d="M${r1(x - 10)} ${r1(y + 7)}L${r1(x)} ${r1(y - 10)}L${r1(x + 10)} ${r1(y + 7)}"/>`;
    }
    // the pass threads between the massif and the radar ridge: peaks crowd its northern side
    for (let c = 13.8; c < 21.0; c += 0.5) {
      const [x, y] = cell([c, 2.86 + Math.sin(c * 2.7) * 0.05]);
      const h = 7 + (Math.sin(c * 5.1) + 1) * 3;
      s += `<path d="M${r1(x - 8)} ${r1(y + 5)}L${r1(x)} ${r1(y - h)}L${r1(x + 8)} ${r1(y + 5)}"/>`;
    }
    s += '</g>';
    s += lab(9.6, 3.62, 'GREY MASSIF', 'th-terrain-label', -3);
    // flooded ground, marsh and tidal flats, woods, the dark forest
    s += `<path d="${polyD(PTS.marshes)}" fill="url(#th-marsh)"/>`;
    for (const [c, r, rx, ry] of [[17.6, 6.6, 260, 34], [27.8, 8.2, 140, 40], [26.4, 7.7, 120, 30]]) {
      const [x, y] = cell([c, r]);
      s += `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${rx}" ry="${ry}" fill="url(#th-marsh)"/>`;
    }
    s += lab(27.6, 8.62, 'tidal flats', 'th-terrain-sub');
    s += `<path d="${polyD(PTS.forest)}" fill="url(#th-trees)"/><path d="${polyD(PTS.forest)}" fill="url(#th-trees)" transform="translate(9 7)"/>`;
    for (const [c, r, rx, ry] of [[1.0, 0.6, 95, 42], [7.2, 2.3, 90, 28], [3.6, 6.5, 60, 30], [9.0, 6.9, 90, 30], [13.6, 1.8, 70, 28], [24.4, 5.0, 70, 30], [33.0, 0.5, 80, 28], [38.6, 7.8, 70, 30], [28.6, 2.3, 60, 22]]) {
      const [x, y] = cell([c, r]);
      s += `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${rx}" ry="${ry}" fill="url(#th-trees)"/>`;
    }
    // hills
    const hill = (c, r, rx, ry, rot, n, seed) => ellipseRings(...cell([c, r]).map(r1), rx, ry, rot, n, seed);
    s += hill(4.0, 3.9, 60, 22, -28, 3, 3) + hill(36.6, 0.9, 46, 24, 10, 3, 4) + hill(6.0, 0.5, 40, 20, 0, 2, 5) + hill(16.8, 4.4, 50, 16, 0, 2, 6) + hill(27.4, 1.25, 110, 46, -4, 2, 7);
    s += `<g class="th-spot">${lab(4.05, 3.95, '▲ 312', '')}${lab(36.65, 0.95, '▲ 287', '')}${lab(6.05, 0.55, '▲ 198', '')}${lab(17.4, 4.85, '▲ 640', '')}${lab(18.4, 3.2, '▲ 1140', '')}</g>`;
    // rivers
    const { muddle, kessel, brook, moorbach } = RIVER_WAYS;
    s += `<path id="th-river-a" class="th-river" d="${smoothD(muddle, false)}"/>`;
    s += `<path id="th-river-b" class="th-river" d="${smoothD(kessel, false)}"/>`;
    s += `<path class="th-river small" d="${smoothD(brook, false)}"/><path class="th-river small" d="${smoothD(moorbach, false)}"/>`;
    s += '<text class="th-water-label"><textPath href="#th-river-a" startOffset="30%">R. MUDDLE</textPath></text>';
    s += '<text class="th-water-label"><textPath href="#th-river-b" startOffset="45%">R. KESSEL</textPath></text>';
    // roads and the railway
    for (const r of ROAD_WAYS) s += `<path class="th-road-casing" d="${smoothD(r, false)}"/>`;
    for (const r of ROAD_WAYS) s += `<path class="th-road" d="${smoothD(r, false)}"/>`;
    const rail = smoothD(RAIL_WAY, false);
    s += `<path class="th-rail-casing" d="${rail}"/><path class="th-rail" d="${rail}"/>`;
    s += landmarks();
    // towns
    const T = (c, r, name, o) => town(...cell([c, r]).map(r1), name, o);
    s += T(2.1, 5.7, 'PORT BLANC') + T(1.8, 1.95, 'MUDDLE') + T(4.6, 4.4, 'KESTREL', { mast: true }) + T(4.0, 7.3, 'VOSS') + T(7.6, 8.55, 'GLEISDORF');
    s += T(6.2, 0.45, 'BRANDT') + T(8.5, 5.6, 'HALDEN') + T(13.0, 8.2, 'KREUZ') + T(18.5, 1.45, 'FURT') + T(16.4, 3.25, 'ALPENTOR');
    s += T(20.9, 7.25, 'HAFENSTADT') + T(27.4, 6.2, 'MOORDORF') + T(25.0, 4.6, 'LANGDRAHT') + T(35.8, 2.6, 'OBERHAUS', { big: true });
    // grid, neatline, coordinates, sheet title
    let grid = '';
    for (let x = F.x0 + 100; x < F.x1; x += 100) grid += `M${x} ${F.y0}V${F.y1}`;
    for (let y = F.y0 + 100; y < F.y1; y += 100) grid += `M${F.x0} ${y}H${F.x1}`;
    s += `<path class="th-grid" d="${grid}"/>`;
    s += `<rect class="th-neat" x="${F.x0}" y="${F.y0}" width="${F.x1 - F.x0}" height="${F.y1 - F.y0}"/>`;
    s += `<rect class="th-neat2" x="${F.x0 - 7}" y="${F.y0 - 7}" width="${F.x1 - F.x0 + 14}" height="${F.y1 - F.y0 + 14}"/>`;
    s += '<g class="th-coord">';
    const LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
    const letter = (i) => (i < LETTERS.length ? LETTERS[i] : 'A' + LETTERS[i - LETTERS.length]);
    for (let i = 0; i * 200 + 100 < F.x1 - F.x0; i++) s += `<text x="${F.x0 + 100 + i * 200}" y="36">${letter(i)}</text>`;
    for (let j = 0; j < 9; j++) s += `<text x="26" y="${F.y0 + 55 + j * 100}">${j + 1}</text><text x="${MW - 26}" y="${F.y0 + 55 + j * 100}">${j + 1}</text>`;
    s += '</g>';
    s += '<text class="th-sheet" x="60" y="982">SHEETS 7–12 · THEATRE OF OPERATIONS · SCALE 1:250 000 · GRID 10 KM</text>';
    s += `<text class="th-secret" x="${MW - 60}" y="982">SECRET — DO NOT REMOVE FROM HQ</text>`;
    // compass rose in the bay
    const [qx, qy] = cell([0.42, 6.62]);
    s += `<g class="th-compass" transform="translate(${r1(qx)} ${r1(qy)}) scale(.8)"><circle r="40" class="ring"/><circle r="33" class="ring2"/>` +
      '<path class="rose-b" d="M0 -27L4 -4 27 0 4 4 0 27 -4 4 -27 0 -4 -4Z" transform="rotate(45)"/>' +
      '<path class="rose" d="M0 -46L6.5 -6.5 46 0 6.5 6.5 0 46 -6.5 6.5 -46 0 -6.5 -6.5Z"/>' +
      '<path class="rose-d" d="M0 -46L6.5 -6.5 0 0ZM46 0L6.5 6.5 0 0ZM0 46L-6.5 6.5 0 0ZM-46 0L-6.5 -6.5 0 0Z"/><text y="-51">N</text></g>';
    return s;
  }

  // Landmarks that make the deeper sectors recognisable: the airfield's runway, the harbour basin, the
  // radar station, the citadel's star fort, the Cipher School and the Rotor Works.
  function landmarks() {
    let s = '<g class="th-landmarks" aria-hidden="true">';
    // airfield: a runway with a taxiway and dispersal pans
    const [ax, ay] = cell([10.5, 1.05]);
    s += `<g transform="translate(${r1(ax)} ${r1(ay)}) rotate(-8)"><rect class="th-runway" x="-170" y="-11" width="340" height="22" rx="2"/>` +
      '<path class="th-runway-mark" d="M-160 0H160"/><path class="th-taxi" d="M-120 11V40H120V11"/>' +
      '<circle class="th-pan" cx="-120" cy="44" r="10"/><circle class="th-pan" cx="0" cy="44" r="10"/><circle class="th-pan" cx="120" cy="44" r="10"/></g>';
    // harbour: a quay along the shore, two moles into the gulf and a lighthouse on the outer one
    {
      const [hx, hy] = cell([22.2, 8.0]);
      s += `<g class="th-port" transform="translate(${r1(hx)} ${r1(hy)})">` +
        '<path class="quay" d="M-230 -6H230"/><path class="mole" d="M-150 -6V44Q-150 52 -140 52H-90"/><path class="mole" d="M150 -6V58Q150 66 140 66H70"/>' +
        '<path class="crane" d="M-60 -6V-34L-20 -34M-60 -26L-44 -34M40 -6V-30L76 -30"/>' +
        '<g class="lighthouse" transform="translate(70 66)"><circle r="9"/><circle r="4" class="lamp"/><path class="rays" d="M12 -6l16 -8M12 6l16 8M0 12v14"/></g></g>';
    }
    // radar station: a lattice tower with its dish on the hill
    const [rx, ry] = cell([16.9, 4.4]);
    s += `<g class="th-radar-site" transform="translate(${r1(rx)} ${r1(ry)})"><path d="M-9 14L0 -14L9 14M-6 4h12M-4 -5h8"/>` +
      '<ellipse cx="0" cy="-20" rx="15" ry="6" class="dish"/><path d="M0 -20v6" /><path class="beam" d="M12 -24q18 -10 30 -6M14 -18q14 -4 24 0"/></g>';
    // the citadel: an old star fort (bastions, ravelins, a glacis)
    const [cx, cy] = cell([27.4, 1.3]);
    const star = (R, r, n) => {
      const pts = [];
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
        const d = i % 2 ? r : R;
        pts.push([Math.cos(a) * d, Math.sin(a) * d * 0.62]);
      }
      return polyD(pts);
    };
    s += `<g class="th-fort" transform="translate(${r1(cx)} ${r1(cy)})"><path class="glacis" d="${star(118, 92, 5)}"/><path class="walls" d="${star(92, 60, 5)}"/>` +
      '<rect class="keep" x="-22" y="-13" width="44" height="26" rx="2"/><text y="44">ZITADELLE</text></g>';
    // the Cipher School: a requisitioned school — wings round a yard, a bell turret, chalkboards and
    // bundles of captured enemy paperwork stacked in the yard
    {
      const [x, y] = cell([32.6, 5.5]);
      s += `<g class="th-school" transform="translate(${r1(x)} ${r1(y)})">` +
        '<rect class="yard" x="-58" y="-20" width="116" height="42" rx="2"/>' +
        '<path class="block" d="M-62 -26H62V-12H40V24H26V-12H-26V24H-40V-12H-62Z"/>' +
        '<rect class="block" x="-6" y="-38" width="12" height="14"/><path class="bell" d="M-8 -38L0 -46L8 -38"/>' +
        '<g class="boards"><rect x="-22" y="-4" width="16" height="10"/><rect x="6" y="-4" width="16" height="10"/></g>' +
        '<g class="papers"><rect x="-12" y="10" width="7" height="5" transform="rotate(-12 -8 12)"/><rect x="-3" y="12" width="7" height="5" transform="rotate(9 0 14)"/><rect x="6" y="9" width="7" height="5" transform="rotate(-4 9 11)"/></g>' +
        '</g>';
    }
    // the Rotor Works: an engineering works — sawtooth-roofed shops, a chimney, rotating drums in the
    // yard and a siding off the railway
    {
      const [x, y] = cell([37.4, 7.7]);
      let roof = '';
      for (let i = 0; i < 6; i++) roof += `M${-66 + i * 20} 2L${-56 + i * 20} -16L${-46 + i * 20} 2`;
      s += `<g class="th-works" transform="translate(${r1(x)} ${r1(y)})">` +
        '<path class="siding" d="M-90 -36Q-70 -10 -66 10"/>' +
        '<rect class="shop" x="-68" y="-18" width="124" height="22"/>' +
        `<path class="saw" d="${roof}"/>` +
        '<circle class="chimney" cx="66" cy="-14" r="6"/><path class="smoke" d="M68 -22q6 -8 0 -14t2 -14"/>' +
        '<g class="drums"><circle cx="-40" cy="20" r="8"/><circle cx="-18" cy="20" r="8"/><circle cx="4" cy="20" r="8"/>' +
        '<path d="M-40 12v16M-48 20h16M-18 12v16M-26 20h16M4 12v16M-4 20h16"/></g>' +
        '<path class="tape" d="M20 16q10 -6 18 2t18 -2"/>' +
        '</g>';
    }
    return s + '</g>';
  }
  const lab4 = (c, r, text, cls, rot = 0) => {
    const [x, y] = cell([c, r]);
    return `<text class="${cls}" x="${r1(x)}" y="${r1(y)}" transform="rotate(${rot} ${r1(x)} ${r1(y)})">${text}</text>`;
  };

  function decorations() {
    let s = '<g class="th-decor" aria-hidden="true">';
    const C = (c, r, rad, seed) => coffee(...cell([c, r]).map(r1), rad, seed);
    s += C(7.6, 0.25, 44, 2) + C(14.0, 6.2, 54, 1) + C(30.0, 8.55, 52, 3) + C(0.3, 1.0, 40, 4) + C(32.6, 0.35, 46, 5) + C(40.3, 4.2, 56, 6);
    // pencil: phase lines between the tiers, notes, circled grid refs
    const pl = (pts, text, c, r) => {
      const [x, y] = cell([c, r]);
      return `<path class="th-pencil-line" d="${smoothD(pts.map(cell), false)}"/><text class="th-pencil" x="${r1(x)}" y="${r1(y)}" transform="rotate(-82 ${r1(x)} ${r1(y)})">${text}</text>`;
    };
    s += pl([[6.3, 8.95], [6.6, 7.0], [6.2, 5.0], [6.5, 3.2]], 'PL ALPHA', 6.22, 8.85);
    s += pl([[13.1, 7.0], [13.4, 5.4], [13.0, 3.9], [13.3, 2.3]], 'PL BRAVO', 13.02, 6.9);
    s += pl([[30.9, 8.95], [31.2, 7.0], [30.8, 5.0], [31.2, 2.4]], 'PL CHARLIE', 30.82, 8.85);
    const note = (c, r, inner, rot = 0) => {
      const [x, y] = cell([c, r]);
      return `<g class="th-pencil" transform="translate(${r1(x)} ${r1(y)}) rotate(${rot})">${inner}</g>`;
    };
    s += note(2.6, 3.25, '<text>hold!</text><path class="th-pencil-stroke" d="M-2 6h44M2 10h36"/>', -9);
    s += note(1.35, 2.0, '<path class="th-pencil-stroke" d="M-8 -8l16 16M8 -8l-16 16"/><text x="14" y="18" font-size="15">bridge out?</text>', 6);
    s += note(8.4, 6.2, '<ellipse class="th-pencil-stroke" rx="27" ry="17" transform="rotate(-8)"/><text x="-13" y="6">K9</text><text x="32" y="24" font-size="14">2 jammers?</text>');
    s += note(33.4, 0.3, '<text font-size="15">HQ here??</text><path class="th-pencil-stroke" d="M50 8q14 20 40 34M90 34l2 10 -9-3"/>', -4);
    s += note(4.4, 0.22, '<text font-size="15">guns — 3 btys</text>', -5);
    s += note(19.2, 6.95, '<text font-size="14">fuel</text>', -3);
    s += note(14.0, 2.95, '<text font-size="14">mules only past here</text>', -2);
    s += note(27.0, 7.25, '<text font-size="14">waist deep at high tide</text>', 4);
    s += note(24.4, 2.95, '<text font-size="14">no signal from LW since 0400</text>', -3);
    s += note(3.0, 1.35, '<text font-size="14">skis!</text>', -8);
    s += note(12.6, 2.0, '<text font-size="14">flak</text><path class="th-pencil-stroke" d="M-4 6q8 6 22 0"/>', 5);
    s += note(31.4, 6.25, '<text font-size="13">ciphers — top floor</text>', -2);
    // tape on the corners
    s += '<rect class="th-tape" x="-36" y="-14" width="120" height="34" transform="translate(20 22) rotate(-38)"/>';
    s += `<rect class="th-tape" x="-60" y="-14" width="120" height="34" transform="translate(20 ${MH - 20}) rotate(40)"/>`;
    s += `<rect class="th-tape" x="-60" y="-14" width="120" height="34" transform="translate(${MW - 18} ${MH - 18}) rotate(-42)"/>`;
    s += `<rect class="th-tape" x="-60" y="-14" width="120" height="34" transform="translate(${r1(MW / 3)} 8) rotate(-3)"/>`;
    s += `<rect class="th-tape" x="-60" y="-14" width="120" height="34" transform="translate(${r1((2 * MW) / 3)} ${MH - 8}) rotate(4)"/>`;
    return s + '</g>';
  }

  function pins() {
    const pin = (c, r, col) => {
      const [x, y] = cell([c, r]).map(r1);
      return `<g class="th-pin" transform="translate(${x} ${y})"><path d="M0 0L9 14" stroke="#000" stroke-opacity=".3" stroke-width="3" stroke-linecap="round"/><path d="M0 0l2.5 4" stroke="#999" stroke-width="1.6"/><circle r="7.5" fill="url(#th-pin-${col})" stroke="#000" stroke-opacity=".35"/><circle cx="-2.2" cy="-2.4" r="2" fill="#fff" opacity=".6"/></g>`;
    };
    return pin(39.0, 1.0, 'r') + pin(1.0, 5.6, 'b') + pin(0.15, 0.15, 'r') + pin(39.6, 8.6, 'b') + pin(20.0, 0.15, 'r');
  }

  // ================================================================ dynamic layers
  function computeFront(states) {
    const out = [];
    for (const e of Object.values(EDGES)) {
      if (e.owners.length !== 2) continue;
      const [a, b] = e.owners;
      if (!(isSector(a) || a === 'sea') || !(isSector(b) || b === 'sea')) continue;
      const fa = friendly(a, states), fb = friendly(b, states);
      if (fa === fb) continue;
      const foe = fa ? b : a;
      out.push({ ...towards(e.key, foe), foe, friend: fa ? a : b });
    }
    return out;
  }

  function frontSvg(front, cls) {
    let line = '', teeth = '';
    let s = `<g class="th-front ${cls}" id="${cls === 'old' ? 'th-front-old' : 'th-front'}">`;
    for (const f of front) {
      const d = smoothD(f.pts, false);
      line += `<path class="th-front-casing" d="${d}"/>`;
      let td = '';
      for (let x = 9; x < f.L; x += 17) {
        const m = at(f.pts, f.cum, x);
        const n = scale(perp(m.t), f.sign);
        td += 'M' + P(add(m.p, m.t, -4.6)) + 'L' + P(add(add(m.p, n, 9.5), m.t, 0)) + 'L' + P(add(m.p, m.t, 4.6)) + 'Z';
      }
      teeth += `<path class="th-front-teeth" d="${td}"/>`;
      line += `<path class="th-front-line" d="${d}" style="--len:${Math.ceil(f.L + 4)}"/>`;
    }
    return s + line + teeth + '</g>';
  }

  // Infantry are individual figures: a fire team of three around point p, facing r.
  const TEAM = [[0, 0], [-8, -9], [-6, 10]];
  function pushTeam(units, p, r) {
    const a = (r * Math.PI) / 180, t = [Math.cos(a), Math.sin(a)], n = perp(t);
    TEAM.forEach(([b, l], i) => units.push({ k: 'soldier', p: add(add(p, t, b), n, l), r: r + (i - 1) * 7 }));
  }

  // A sector's command post: beside its label, but always on its own ground (never in a lake).
  const cpPos = (id) => pullIn([GEO[id].anchor[0] - 96, GEO[id].anchor[1] + 66], GEO[id].anchor, new Set([id]));

  // Unit models gathered along the front, on our side of it (landing craft and ships at sea).
  function friendlyUnits(states, front) {
    const units = [];
    if (!front.length) {
      const c = GEO.capital.anchor;
      ['tank', 'inf', 'truck', 'tank', 'arty', 'inf', 'jeep', 'truck', 'inf'].forEach((k, i) => {
        const a = (i / 9) * Math.PI * 2;
        const p = [c[0] + Math.cos(a) * 165, c[1] + 40 + Math.sin(a) * 105], r = (a * 180) / Math.PI + 90;
        if (k === 'inf') pushTeam(units, p, r);
        else units.push({ k, p, r });
      });
      return units;
    }
    const rnd = rng(77);
    const total = front.reduce((a, f) => a + f.L, 0);
    const spacing = Math.max(72, total / 22);
    const where = (p) => {
      if (inHole(p)) return null;
      if (inPoly(p, PTS.sea)) return 'sea';
      return TH().SECTORS.some((s) => states[s.id] === 'captured' && inPoly(p, PTS[s.id])) ? 'land' : null;
    };
    let i = 0;
    for (const f of front) {
      const n = Math.max(1, Math.round(f.L / spacing));
      for (let j = 0; j < n; j++) {
        const m = at(f.pts, f.cum, ((j + 0.5) / n) * f.L);
        const nn = scale(perp(m.t), f.sign);
        const rot = deg(nn);
        const p1 = add(add(m.p, nn, -36), m.t, (rnd() - 0.5) * 16);
        const w1 = where(p1);
        if (w1 === 'sea') units.push({ k: 'lc', p: p1, r: rot });
        else if (w1 && i % 2) pushTeam(units, p1, rot + (rnd() - 0.5) * 14);
        else if (w1) units.push({ k: i % 4 === 2 ? 'jeep' : 'tank', p: p1, r: rot + (rnd() - 0.5) * 14 });
        if (j % 2 === 0) {
          const p2 = add(add(m.p, nn, -88), m.t, 16);
          const w2 = where(p2);
          if (w2 === 'sea') units.push({ k: 'ship', p: p2, r: rot });
          else if (w2) units.push({ k: (i >> 1) % 2 ? 'truck' : 'arty', p: p2, r: rot + (rnd() - 0.5) * 20 });
        }
        i++;
      }
    }
    return units;
  }

  function friendlyCentre(states, front) {
    if (!front.length) return GEO.capital.anchor;
    let x = 0, y = 0, w = 0;
    for (const f of front) (x += f.mid[0] * f.L), (y += f.mid[1] * f.L), (w += f.L);
    return [x / w, y / w];
  }

  function nearestFriendly(p, states) {
    let best = BEACH, bd = dist(p, BEACH);
    for (const s of TH().SECTORS) if (states[s.id] === 'captured' && dist(p, GEO[s.id].anchor) < bd) (best = GEO[s.id].anchor), (bd = dist(p, best));
    return best;
  }

  function unitsSvg(states, pre, plan) {
    const front = computeFront(states);
    const finalU = friendlyUnits(states, front);
    const moving = plan.captured.length > 0;
    const preU = moving ? friendlyUnits(pre, computeFront(pre)) : null;
    let s = '<g class="th-units" aria-hidden="true">';
    // enemy models (in fog for deep sectors)
    for (const sec of TH().SECTORS) {
      const st = pre[sec.id];
      if (st === 'captured') continue;
      const g = GEO[sec.id];
      const cls = `en th-foe${st === 'locked' ? ' deep' : ''}${plan.captured.includes(sec.id) ? ' th-routed' : ''}`;
      let gs = `<g class="${cls}" data-for="${sec.id}">`;
      for (const [x, y, k] of g.foes) {
        const r = deg(sub(nearestFriendly([x, y], states), [x, y]));
        if (k !== 'inf') gs += use(k, x, y, r, 0.86, 'en');
        else {
          const team = [];
          pushTeam(team, [x, y], r);
          team.forEach((q) => (gs += use('soldier', q.p[0], q.p[1], q.r, 0.95, 'en')));
        }
      }
      // their strongpoint: a sandbagged pillbox (High Command: their command post)
      const [bx, by] = [g.anchor[0] + 92, g.anchor[1] + 66];
      gs += use(sec.id === 'capital' ? 'tent' : 'bunker', bx, by, deg(sub(nearestFriendly([bx, by], states), [bx, by])), 1, 'en');
      s += gs + '</g>';
    }
    // spearheads inside sectors being attacked
    for (const sec of TH().SECTORS) {
      if (states[sec.id] !== 'open') continue;
      const ss = sectorStats(sec);
      if (ss.last < 0) continue;
      const g = GEO[sec.id];
      const p = g.obj[ss.last];
      const nx = g.obj[ss.last + 1] || g.anchor;
      const dir = norm(sub(nx, p));
      const r = deg(dir);
      const slots = formation(sec.id).slice(0, 6);
      const poses = deployPoses(slots, p, dir, 0.55, 10);
      let sp = '';
      slots.forEach((sl, i) => (sp += use(sl.k, poses[i].p[0], poses[i].p[1], poses[i].r, sl.sc * 0.72, 'fr')));
      s += `<g class="th-spear" data-for="${sec.id}">${sp}</g>`;
    }
    // our front-line units
    // Each model is matched with the nearest model of the old front (same kind preferred) and drawn
    // there; playFront() then drives it to its new place along its own route.
    const used = new Set();
    const moves = [];
    finalU.forEach((u, i) => {
      let pose = u;
      const sc = u.k === 'soldier' ? 0.95 : 0.9;
      if (preU && preU.length) {
        let bi = -1, bd = Infinity;
        preU.forEach((q, j) => {
          const d = dist(q.p, u.p) + (used.has(j) ? 500 : 0) + (q.k === u.k ? 0 : 70);
          if (d < bd) (bd = d), (bi = j);
        });
        used.add(bi);
        const q = preU[bi];
        if (dist(q.p, u.p) > 3) {
          moves.push({ i, k: u.k, from: q, to: u, sc });
          pose = q;
        }
      }
      s += `<g class="th-u fr" data-mv="${i}" transform="translate(${r1(pose.p[0])} ${r1(pose.p[1])}) rotate(${r1(pose.r)}) scale(${sc})"><use href="#th-s-${u.k}"/></g>`;
    });
    if (ctx) ctx.moves = moves;
    // friendly counters: one per captured sector (or the assault group at sea)
    const caps = TH().SECTORS.filter((x) => states[x.id] === 'captured');
    // a command post (tent, mast and flag) in every sector we hold
    for (const sec of caps) s += use('tent', ...cpPos(sec.id), -90, 1, 'fr');
    // fighters parked on the airfield (theirs until we take it) and our ships in the harbour basin
    {
      const own = states.airfield === 'captured';
      for (const [c, r, rot] of [[9.7, 1.5, -98], [10.5, 1.52, -98], [11.3, 1.5, -98]]) {
        const [x, y] = cell([c, r]);
        s += `<g class="th-u ${own ? 'fr' : 'en'} th-parked" transform="translate(${r1(x)} ${r1(y)}) rotate(${rot}) scale(.62)"><use href="#th-s-plane"/></g>`;
      }
      const hb = states.harbour;
      if (hb === 'open' || hb === 'captured' || hb === 'gated' || hb === 'short') {
        const [x, y] = cell([22.6, 8.72]);
        s += use('ship', x, y, 180, 0.95, 'fr') + use('lc', x - 170, y - 40, 165, 0.75, 'fr') + use('lc', x + 120, y - 34, 195, 0.75, 'fr');
      } else {
        const [x, y] = cell([22.6, 8.6]);
        s += use('lc', x, y, 0, 0.75, 'en');
      }
    }
    // aircraft on patrol
    const c = friendlyCentre(states, front);
    const loop = (cx, cy, rx, ry) => `M${r1(cx - rx)} ${r1(cy)}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
    const planes = [
      { cls: 'fr', path: loop(c[0] + 40, c[1] - 30, 170, 95), dur: 46, begin: 0 },
      { cls: 'fr', path: loop(c[0] - 20, c[1] + 20, 120, 150), dur: 58, begin: -21 },
      { cls: 'en', path: loop(1260, 230, 200, 110), dur: 70, begin: -9 },
    ];
    for (const pl of planes) {
      if (pl.cls === 'en' && states.capital === 'captured') continue;
      if (reduced()) {
        const m = /M([-\d.]+) ([-\d.]+)a([\d.]+)/.exec(pl.path);
        s += `<g class="th-plane ${pl.cls}" transform="translate(${m[1]} ${m[2]}) rotate(-90)">${PLANE_USE}</g>`;
      } else {
        s += `<g class="th-plane ${pl.cls}"><g transform="scale(1.05 .9)">${PLANE_USE}</g><animateMotion dur="${pl.dur}s" begin="${pl.begin}s" repeatCount="indefinite" rotate="auto" path="${pl.path}"/></g>`;
      }
    }
    return s + '</g>';
  }

  // Big sweeping campaign arrows from our ground into sectors open to attack.
  function advanceArrow(id, states) {
    const src = bestEntry(id, states, false);
    if (!src || !src.friendlySide) return null;
    const held = states[id] === 'gated' || states[id] === 'short';
    const m = src.mid, n = src.n;
    let from, to, c;
    if (held) {
      from = add(m, n, -125);
      to = add(m, n, -30);
      c = add(add(m, n, -75), src.t, 24);
    } else {
      const toA = norm(sub(GEO[id].anchor, m));
      const dir = norm(add(scale(n, 0.6), scale(toA, 0.4)));
      from = add(m, n, -100);
      to = add(m, dir, 118);
      c = add(m, src.t, 34);
    }
    const pts = sampleQuad(from, c, to, 26);
    return { d: arrowD(pts, 15, 22, 40, 54), tail: from };
  }

  function arrowsSvg(states, plan) {
    let s = '<g class="th-arrows" aria-hidden="true">';
    for (const sec of TH().SECTORS) {
      const st = states[sec.id];
      if (st !== 'open' && st !== 'gated' && st !== 'short') continue;
      const a = advanceArrow(sec.id, states);
      if (!a) continue;
      const fresh = plan.opened.includes(sec.id) || plan.breached.includes(sec.id) || plan.reached.includes(sec.id);
      s += `<path class="th-arrow${st === 'gated' ? ' gated' : st === 'short' ? ' short' : ''}${fresh ? ' th-pending' : ''}" data-for="${sec.id}" d="${a.d}" style="transform-origin:${r1(a.tail[0])}px ${r1(a.tail[1])}px"/>`;
      if (st === 'short') s += haltSvg(sec.id, states, fresh);
    }
    return s + '</g>';
  }

  function gateInfo(id, states) {
    return bestEntry(id, states, true);
  }

  // Short of stars: the advance halts at the line with a tag saying how many stars are still needed.
  function haltSvg(id, states, fresh) {
    // on a friendly border; a different one from the contact-lost mast's when the sector has a mast
    const mastKey = TH().byId[id].contact && (gateInfo(id, states) || {}).key;
    const other = mastKey && Object.values(EDGES).filter((e) => e.key !== mastKey && e.owners.length === 2 && e.owners.includes(id) && friendly(e.owners[0] === id ? e.owners[1] : e.owners[0], states)).sort((a, b) => edgeInfo(b.key).L - edgeInfo(a.key).L)[0];
    const src = other ? towards(other.key, id) : bestEntry(id, states, false);
    if (!src) return '';
    const st = ctx.st;
    const n = src.n, t = perp(n);
    // beside the contact-lost mast (which sits on the same border) when the sector has one
    const mast = TH().byId[id].contact && gateInfo(id, states);
    const clear = (q) => Math.min(...Object.values(GEO).map((g) => dist(q, g.anchor)), mast ? 1.6 * dist(q, mast.mid) : Infinity);
    const ends = [0.2, 0.8].map((f) => at(src.pts, src.cum, src.L * f).p);
    const mid = TH().byId[id].contact && !other ? (clear(ends[0]) > clear(ends[1]) ? ends[0] : ends[1]) : src.mid;
    const p = add(mid, n, -20);
    const bar = `M${P(add(p, t, -26))}L${P(add(p, t, 26))}`;
    const tag = add(mid, n, 34);
    return (
      `<g class="th-halt${fresh ? ' th-pending' : ''}" data-for="${id}"><path class="th-halt-bar" d="${bar}"/>` +
      `<g transform="translate(${P(tag)})"><rect x="-74" y="-15" width="148" height="30" rx="3"/>` +
      `<text class="t1" y="-2">★ ${st.stars} / ${st.need[id]}</text><text class="t2" y="10">MORE STARS NEEDED</text></g></g>`
    );
  }

  // ---------------------------------------------------------------- labels
  function wrap(text, max, lines) {
    const out = [''];
    for (const w of text.split(/\s+/)) {
      const cur = out[out.length - 1];
      if ((cur + ' ' + w).trim().length <= max) out[out.length - 1] = (cur + ' ' + w).trim();
      else out.push(w);
    }
    if (out.length > lines) {
      out.length = lines;
      out[lines - 1] = out[lines - 1].replace(/\W*\s*\S*$/, '') + '…';
    }
    return out;
  }

  const STATE_WORD = { captured: 'Held by us', open: 'Open to attack', gated: 'Contact lost', short: 'Needs stars', locked: 'Beyond reach' };

  function labelInner(id, state) {
    const sec = TH().byId[id];
    const ss = sectorStats(sec);
    const idea = wrap(sec.idea, 29, 2);
    const W = 226;
    const h = 74 + idea.length * 15;
    const top = -h / 2;
    let s = `<rect class="th-label-bg" x="${-W / 2}" y="${top}" width="${W}" height="${h}" rx="2"/>`;
    s += `<rect class="th-label-tape" x="-26" y="${top - 7}" width="52" height="14" transform="rotate(-3 0 ${top})"/>`;
    s += `<text class="th-code" x="${-W / 2 + 26}" y="${top + 24}">${sec.code}</text>`;
    let pips = '';
    for (let i = 0; i < 5; i++) pips += `<rect class="th-pip${i < sec.difficulty ? ' on' : ''}" x="${W / 2 - 66 + i * 11.5}" y="${top + 14}" width="8.5" height="8.5" transform="rotate(45 ${W / 2 - 61.75 + i * 11.5} ${top + 18.25})"/>`;
    s += pips;
    s += `<text class="th-state-word" x="${-W / 2 + 50}" y="${top + 23}">${STATE_WORD[state]}</text>`;
    s += `<text class="th-tier" x="${W / 2 - 76}" y="${top + 23}">${'I'.repeat(sec.tier || 1)}</text>`;
    s += `<text class="th-name" y="${top + 48}">${esc(sec.name)}</text>`;
    idea.forEach((ln, i) => (s += `<text class="th-idea" y="${top + 65 + i * 15}">${esc(ln)}</text>`));
    let prog;
    if (state === 'captured') prog = `CAPTURED · ★ ${ss.stars}/${ss.max}`;
    else if (state === 'open') prog = `OBJ ${ss.done}/${ss.n} · ★ ${ss.stars}/${ss.max}`;
    else if (state === 'gated') prog = 'RESTORE CONTACT FIRST';
    else if (state === 'short') prog = `★ ${ctx.st.stars} / ${ctx.st.need[id]} · MORE STARS NEEDED`;
    else {
      const need = ctx.st.need[id];
      prog = need > ctx.st.stars ? `${ss.n} OBJECTIVES · NEEDS ★ ${need}` : sec.contact ? 'CONTACT LOST · NO INTEL' : `${ss.n} OBJECTIVES · NO INTEL`;
    }
    s += `<text class="th-prog" y="${top + h - 10}">${prog}</text>`;
    if (state === 'captured') s += `<g transform="translate(${W / 2 - 46} ${top - 12}) rotate(-9)"><g class="th-stamp"><rect x="-50" y="-14" width="100" height="27" rx="3"/><rect class="in" x="-46" y="-10.5" width="92" height="20" rx="2"/><text y="6">CAPTURED</text></g></g>`;
    return s;
  }

  function labelSvg(id, state) {
    const g = GEO[id];
    return `<g class="th-label st-${state}" data-sector="${id}" data-ax="${g.anchor[0]}" data-ay="${g.anchor[1]}" data-tilt="${g.tilt || 0}" transform="${labelTransform(g)}">${labelInner(id, state)}</g>`;
  }
  const labelTransform = (g) => `translate(${g.anchor[0]} ${g.anchor[1]}) rotate(${g.tilt || 0}) scale(${r1(V.k * 100) / 100})`;

  // ---------------------------------------------------------------- contact lost & raids
  // A radio mast on the sector's border: its wire to HQ snapped, static crackling around it, and an
  // impostor "HQ" (red, question-marked) broadcasting fake orders. Restored: steady blue rings.
  function contactInner(id, states, forceState) {
    const sec = TH().byId[id];
    const ms = forceState || ctx.st.missions[sec.contact];
    const name = levelName(sec.contact);
    const done = ms === 'done';
    const live = ms !== 'locked';
    const cls = `th-contact ${done ? 'done' : live ? 'open' : 'locked'}${name ? '' : ' missing'}`;
    const sub = name || 'IN PREPARATION';
    const g = gateInfo(id, states);
    const p = g ? g.mid : GEO[id].anchor;
    const aria = `Contact lost with our units in ${sec.name}: ${sub}${done ? ', contact restored' : live ? ', restore contact' : ', locked'}`;
    let s = `<g class="${cls}" data-level="${sec.contact}" data-for="${id}" transform="translate(${r1(p[0])} ${r1(p[1])})"${live ? ' tabindex="0" role="button"' : ''} aria-label="${esc(aria)}">`;
    // signal rings: jagged static while lost, clean arcs when restored
    s += '<g class="th-rings">';
    for (let i = 0; i < 3; i++) {
      const r = 27 + i * 8;
      s += done
        ? `<path class="ring r${i}" d="M${-r * 0.7} ${-r * 0.7}A${r} ${r} 0 0 1 ${r * 0.7} ${-r * 0.7}"/>`
        : `<path class="ring r${i}" d="M${r1(-r * 0.74)} ${r1(-r * 0.67)}l4 -5 3 6 4 -7 3 5 5 -4 3 6 4 -3 4 5 3 -6 4 4 3 -2"/>`;
    }
    s += '</g>';
    if (!done) s += '<path class="th-cut-wire" d="M-62 10Q-46 4 -30 9M-27 3l3 4 -4 2 4 5"/>';
    else s += '<path class="th-wire-ok" d="M-62 10Q-44 6 -21 8"/>';
    s += '<circle class="th-contact-bg" r="21"/>';
    s += '<path class="th-mast" d="M-8 15L0 -15L8 15M-5.5 6h11M-3 -4h6M-6.5 11L3 1M6.5 11L-3 1"/><circle class="th-mast-light" cy="-16" r="2.6"/>';
    if (!done) s += '<g class="th-impostor" transform="translate(27 -21)"><path d="M-11 6L0 -7L11 6Z"/><rect x="-8" y="6" width="16" height="7"/><text y="10">?</text></g>';
    else s += '<g class="th-hq-ok" transform="translate(25 -20)"><circle r="8"/><path d="M-4 0l3 3 5 -6"/></g>';
    s += `<g class="th-contact-tag"><rect x="-60" y="24" width="120" height="30" rx="2"/><text class="t1" y="37">${done ? 'CONTACT RESTORED' : 'CONTACT LOST'}</text><text class="t2" y="49">${esc(sub)}</text></g>`;
    return s + '</g>';
  }

  function contactsSvg(states, plan) {
    let s = '<g class="th-contacts">';
    for (const sec of TH().SECTORS) {
      if (!sec.contact || states[sec.id] === 'captured') continue;
      const forced = plan.breached.includes(sec.id) ? 'open' : null;
      s += `<g class="th-slot" data-contact-slot="${sec.id}">${contactInner(sec.id, states, forced)}</g>`;
    }
    return s + '</g>';
  }

  function raidSvg(sp, states, fresh) {
    const ms = ctx.st.missions[sp.level];
    if (ms === 'locked') return '';
    const name = levelName(sp.level);
    const p = RAID_SPOT[sp.behind] || GEO[sp.behind].anchor;
    const src = nearestFriendly(p, states);
    const dir = norm(sub(p, src));
    const L = dist(src, p);
    const a = add(src, dir, 40), b = add(p, dir, -30);
    const c = add(lerpP(a, b, 0.5), perp(dir), L * 0.18);
    const done = ms === 'done';
    const aria = `Commando raid behind ${TH().byId[sp.behind].name}: ${name || 'in preparation'}${done ? ', complete' : ''}`;
    let s = `<g class="th-raid-wrap${fresh ? ' th-pending' : ''}" data-raid="${sp.level}">`;
    s += `<path class="th-raid-route" d="${smoothD(sampleQuad(a, c, b, 16), false)}"/>`;
    s += `<g class="th-raid ${done ? 'done' : 'open'}${name ? '' : ' missing'}" data-level="${sp.level}" data-for="${sp.behind}" tabindex="0" role="button" aria-label="${esc(aria)}" transform="translate(${r1(p[0])} ${r1(p[1])})"><g class="th-raid-body">`;
    s += '<g class="th-chute"><path d="M-30 -58Q0 -92 30 -58Q20 -64 10 -58Q0 -66 -10 -58Q-20 -64 -30 -58Z"/><path class="cords" d="M-30 -58L-6 -16M30 -58L6 -16M-10 -58L-3 -16M10 -58L3 -16"/></g>';
    if (!done) s += '<circle class="th-raid-pulse" r="21"/>';
    s += '<circle class="th-raid-bg" r="19"/>';
    s += '<g class="th-dagger"><path d="M0 -15L3.2 3.5L0 7L-3.2 3.5Z"/><rect x="-8" y="3" width="16" height="2.6" rx="1"/><rect x="-1.6" y="5.5" width="3.2" height="6" rx="1"/><path class="wing" d="M-3 -1Q-12 -4 -16 -12Q-10 -6 -3 -5ZM3 -1Q12 -4 16 -12Q10 -6 3 -5Z"/></g>';
    if (done) s += '<path class="th-raid-tick" d="M8 8l5 5 10-12"/>';
    s += `<g class="th-raid-tag"><rect x="-48" y="22" width="96" height="30" rx="2"/><text class="t1" y="35">${done ? 'RAID · DONE' : 'RAID'}</text><text class="t2" y="47">${esc(name || 'IN PREPARATION')}</text></g>`;
    return s + '</g></g></g>';
  }

  function raidsSvg(states, plan) {
    let s = '<g class="th-raids">';
    for (const sp of TH().SPECIALS) s += raidSvg(sp, states, plan.raids.includes(sp.level));
    return s + '</g>';
  }

  // ---------------------------------------------------------------- sectors
  function sectorsSvg(pre, final) {
    let fills = '<g class="th-sectors">';
    for (const sec of TH().SECTORS) {
      const d = polyD(PTS[sec.id]);
      const ss = sectorStats(sec);
      const st = final[sec.id];
      const aria = `${sec.name}. ${sec.idea}. ${STATE_WORD[st]}. Difficulty ${sec.difficulty} of 5. ${ss.done} of ${ss.n} objectives taken.`;
      const b = bbox(PTS[sec.id]);
      const rnd = rng(hashStr(sec.id));
      let fog = '';
      for (let i = 0; i < 4; i++) {
        const cx = b.x + b.w * (0.15 + rnd() * 0.7), cy = b.y + b.h * (0.15 + rnd() * 0.7);
        fog += `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(b.w * (0.32 + rnd() * 0.2))}" ry="${r1(b.h * (0.22 + rnd() * 0.16))}" fill="url(#th-fogblob)"/>`;
      }
      fills += `<g class="th-sector st-${pre[sec.id]}" data-sector="${sec.id}" tabindex="0" role="button" aria-label="${esc(aria)}">` +
        `<clipPath id="th-clip-${sec.id}"><path d="${d}"/></clipPath>` +
        `<path class="th-fill th-fill-friend" d="${d}"/><path class="th-fill th-fill-enemy" d="${d}"/><path class="th-fill th-fill-deep" d="${d}"/><g class="th-fill th-fill-fog" clip-path="url(#th-clip-${sec.id})">${fog}</g>` +
        `<path class="th-flash-fill" d="${d}"/><path class="th-outline" d="${d}"/></g>`;
    }
    fills += '</g>';
    // administrative borders (each drawn once)
    let b = '';
    for (const e of Object.values(EDGES)) {
      if (e.owners.length !== 2 || !e.owners.every(isSector)) continue;
      b += smoothD(edgeInfo(e.key).pts, false);
    }
    return fills + `<path class="th-border" d="${b}"/>`;
  }

  function labelsSvg(pre) {
    let s = '<g class="th-labels">';
    for (const sec of TH().SECTORS) s += `<g class="th-slot" data-label-slot="${sec.id}">${labelSvg(sec.id, pre[sec.id])}</g>`;
    return s + '</g>';
  }

  function mapSvg(st, pre, plan) {
    const final = st.sectors;
    const frontChanged = plan.captured.length > 0;
    let s = defs();
    s += `<g class="th-base" aria-hidden="true">${paperAndTerrain()}</g>`;
    s += sectorsSvg(pre, final);
    s += decorations();
    if (frontChanged) s += frontSvg(computeFront(pre), 'old');
    s += frontSvg(computeFront(final), frontChanged ? 'new th-pending' : 'new');
    s += arrowsSvg(final, plan);
    s += '<g id="th-trails" aria-hidden="true"></g>';
    s += unitsSvg(final, pre, plan);
    s += labelsSvg(pre);
    s += '<g id="th-zoom"></g>';
    s += contactsSvg(final, plan);
    s += raidsSvg(final, plan);
    s += `<g aria-hidden="true">${pins()}</g>`;
    s += `<path aria-hidden="true" d="M${tearD()}V-40H${MW - 72}Z" fill="url(#th-desk)"/>`;
    s += '<g id="th-fx"></g>';
    return s;
  }

  // ================================================================ the zoomed-in plan of advance
  function missionState(sec, i, doneSet, sectorState) {
    const m = sec.missions[i];
    if (doneSet.has(m)) return 'done';
    if (sectorState !== 'open' && sectorState !== 'captured') return 'locked';
    if (UNLOCK) return ctx.st.missions[m] === 'locked' ? 'locked' : 'open';
    return i === 0 || doneSet.has(sec.missions[i - 1]) ? 'open' : 'locked';
  }

  function entryFor(id) {
    const states = ctx.st.sectors;
    const sec = TH().byId[id];
    if (sec.contact && states[id] !== 'captured') {
      const g = gateInfo(id, states);
      if (g) return { p: g.mid, n: g.n };
    }
    const e = bestEntry(id, states, false);
    return e ? { p: e.mid, n: e.n } : { p: GEO[id].anchor, n: [1, 0] };
  }

  // Geometry of the plan for sector `id` at zoom scale `sc` (px per map unit).
  function planGeo(id, sc) {
    const u = 1 / sc;
    const sec = TH().byId[id], g = GEO[id];
    // A sector that gains missions before its layout does: continue the zig-zag past the last objective
    // instead of crashing (the drawn objectives may then need hand placement).
    while (g.obj.length < sec.missions.length) {
      const o = g.obj, n = o.length;
      const last = o[n - 1], prev = o[n - 2] || [last[0] - 1, last[1]];
      o.push([last[0] + (last[0] - prev[0]), prev[1]]);
    }
    const entry = entryFor(id);
    const pts = [add(entry.p, entry.n, -70), ...g.obj];
    const R = 23 * u;
    const lines = [];
    for (let i = 0; i < sec.missions.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const dir = norm(sub(b, a));
      const A = add(a, dir, i === 0 ? 0 : R + 7 * u);
      const B = add(b, dir, -(R + 9 * u));
      const bend = (i % 2 ? 1 : -1) * Math.min(dist(a, b) * 0.15, 55);
      const C = add(lerpP(A, B, 0.5), perp(dir), bend);
      const line = sampleQuad(A, C, B, 28);
      lines.push({ pts: line, cum: cumLen(line) });
    }
    return { u, R, entry, pts, lines, sec, g };
  }

  const UNIT_BACK = 30;
  const UNIT_START = 22;
  // Points of a plan arrow's centre line between arc lengths d0 and d1.
  function linePart(l, d0, d1) {
    const out = [at(l.pts, l.cum, d0).p];
    l.cum.forEach((c, i) => c > d0 && c < d1 && out.push(l.pts[i]));
    out.push(at(l.pts, l.cum, d1).p);
    return out;
  }
  // Where the unit models stand after `k` objectives (k = -1: on the start line).
  function unitSpot(pg, k) {
    if (k < 0 || !pg.lines[k]) {
      const l = pg.lines[0];
      const m = at(l.pts, l.cum, 0);
      return { p: add(m.p, m.t, UNIT_START * pg.u), t: m.t };
    }
    const l = pg.lines[k];
    const L = l.cum[l.cum.length - 1];
    return at(l.pts, l.cum, L - UNIT_BACK * pg.u);
  }
  // The sector's assault force in formation: tanks and jeeps lead or flank, infantry in loose rows,
  // guns and trucks follow. back / lat are screen px behind / beside the formation's point.
  function formation(id) {
    const rnd = rng(hashStr('force-' + id));
    const cnt = {};
    return (FORCES[id] || FORCES.valley).map((k) => {
      const role = ROLE[k] || 'lead';
      const j = (cnt[role] = (cnt[role] || 0) + 1) - 1;
      const side = j % 2 ? 1 : -1;
      let back, lat;
      if (role === 'lead') (back = 4 + 12 * (j >> 1)), (lat = side * (17 + 15 * (j >> 1)));
      else if (role === 'recon') (back = -14 + 12 * (j >> 1)), (lat = side * (36 + 10 * (j >> 1)));
      else if (role === 'foot') (back = 30 + 14 * Math.floor(j / 3)), (lat = ((j % 3) - 1) * 14 + (Math.floor(j / 3) % 2 ? 7 : 0));
      else if (role === 'gun') (back = 64 + 20 * j), (lat = side * 20);
      else (back = 90 + 26 * j + (k === 'train' ? 20 : 0)), (lat = side * 7);
      back += (rnd() - 0.5) * 6;
      lat += (rnd() - 0.5) * 6;
      const delay = { lead: 0, recon: 60, foot: 160, gun: 600, follow: 850 }[role] + rnd() * 320;
      const sc = role === 'foot' ? 1.15 : k === 'mule' || k === 'lgun' || k === 'moto' ? 1.0 : 0.92;
      return { k, role, back, lat, delay, speed: 0.88 + rnd() * 0.26, flank: role === 'lead' || role === 'recon' ? 0.45 : 0.12, sc };
    });
  }

  // March formation behind a point (the start line): back is capped so the column stays compact.
  function slotPose(sl, spot, u) {
    return { p: add(add(spot.p, spot.t, -Math.min(sl.back, 70) * u), perp(spot.t), sl.lat * u), r: deg(spot.t) };
  }
  // Deployed on a taken objective (centre c, approached along t; R = objective radius): tanks, jeeps and
  // engineers push out ahead and to the flanks, infantry hold the forward arc, guns form a firing line
  // just behind it and trucks park beside the guns.
  function deployPoses(slots, c, t, u, R) {
    const n = perp(t), base = deg(t);
    const ring = (ang, d) => {
      const a = ((base + ang) * Math.PI) / 180;
      return [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d];
    };
    const nSol = slots.filter((s) => s.role === 'foot').length;
    const LEAD = [40, -40, 78, -78, 0, 112, -112];
    let li = 0, si = 0, ai = 0, ti = 0;
    return slots.map((sl) => {
      if (sl.role === 'foot') {
        const ang = nSol > 1 ? lerp(-72, 72, si / (nSol - 1)) : 0;
        const d = R + (13 + (si % 2) * 11) * u;
        si++;
        return { p: ring(ang, d), r: base + ang * 0.8 };
      }
      if (sl.role === 'gun') {
        const side = ai % 2 ? 1 : -1;
        const off = ai === 0 ? 0 : side * (30 * Math.ceil(ai / 2));
        ai++;
        return { p: add(add(c, t, -(R + 30 * u)), n, off * u), r: base };
      }
      if (sl.role === 'follow') {
        const side = ti % 2 ? 1 : -1;
        const p = add(add(c, t, -(R + 34 * u + 14 * u * (ti >> 1))), n, side * (54 + 4 * (ti >> 1)) * u);
        ti++;
        return { p, r: base + side * 18 };
      }
      const ang = LEAD[li % LEAD.length];
      const d = R + (24 + 16 * Math.floor(li / LEAD.length)) * u;
      li++;
      return { p: ring(ang, d), r: base + ang * 0.35 };
    });
  }
  // Where every model of sector `id` stands after `k` objectives (k = -1: behind the start line).
  // Every pose is kept on our own ground (or the sector being taken): never inside enemy territory.
  function unitPoses(id, pg, k) {
    const slots = formation(id);
    let poses, safe;
    if (k < 0) {
      const sp = unitSpot(pg, -1);
      poses = slots.map((sl) => slotPose(sl, sp, pg.u));
      safe = sp.p;
    } else {
      const l = pg.lines[k];
      const t = at(l.pts, l.cum, l.cum[l.cum.length - 1]).t;
      poses = deployPoses(slots, pg.pts[k + 1], t, pg.u, pg.R);
      safe = pg.pts[k + 1];
    }
    const allowed = UNLOCK ? null : groundFor(ctx.st.sectors, id);
    if (allowed && allowed.has(regionAt(safe))) poses = poses.map((q) => ({ ...q, p: pullIn(q.p, safe, allowed) }));
    return poses;
  }
  const poseT = (q, sc) => `translate(${r1(q.p[0])} ${r1(q.p[1])}) rotate(${r1(q.r)}) scale(${Math.round(sc * 1000) / 1000})`;
  function zoomUnitsSvg(id, pg, k) {
    const poses = unitPoses(id, pg, k);
    return formation(id)
      .map((sl, i) => `<g class="th-u fr th-zu" data-u="${i}" transform="${poseT(poses[i], sl.sc * pg.u)}"><use href="#th-s-${sl.k}"/></g>`)
      .join('');
  }

  function planSvg(id, pg, doneSet) {
    const { u, R, sec, pts } = pg;
    const st = ctx.st.sectors[id];
    let arrows = '', objs = '', phases = '';
    let currentFound = false;
    sec.missions.forEach((m, i) => {
      const state = missionState(sec, i, doneSet, st);
      const line = pg.lines[i];
      const dash = state === 'done' ? '' : ` stroke-dasharray="${r1(7 * u)} ${r1(4.5 * u)}"`;
      arrows += `<path class="th-zarrow ${state}" data-i="${i}" d="${arrowD(line.pts, 9 * u, 14 * u, 24 * u, 34 * u)}" stroke-width="${r1(2.2 * u * 10) / 10}"${dash}/>`;
      const mid = at(line.pts, line.cum, line.cum[line.cum.length - 1] * (i === 0 ? 0.62 : 0.5));
      const lp = add(mid.p, perp(mid.t), (i % 2 ? -1 : 1) * 22 * u);
      phases += `<text class="th-phase" x="${r1(lp[0])}" y="${r1(lp[1] + 4 * u)}" font-size="${r1(11 * u)}" stroke-width="${r1(3 * u)}">PH ${ROMAN[i]}</text>`;
      const lv = APP().levelById(m);
      const current = state === 'open' && !currentFound;
      if (current) currentFound = true;
      const md = medals(m);
      const p = pts[i + 1];
      const name = lv ? lv.name : 'IN PREPARATION';
      const aria = `Objective ${i + 1}: ${name}. ${state === 'done' ? 'Taken' : state === 'open' ? 'Open — attack' : 'Locked'}. ${md.filter(Boolean).length} of 3 stars.`;
      let stars = '';
      for (let k = 0; k < 3; k++) stars += `<path class="th-zstar${md[k] ? ' on' : ''}" d="${STAR_D}" transform="translate(${-30 + k * 20 - 8} -8) scale(.68)"/>`;
      objs += `<g class="th-obj ${state}${current ? ' current' : ''}${lv ? '' : ' missing'}" data-level="${m}" data-i="${i}" tabindex="0" role="button" aria-label="${esc(aria)}" transform="translate(${r1(p[0])} ${r1(p[1])})">` +
        (current ? `<circle class="th-obj-pulse" r="${r1(R)}" stroke-width="${r1(3 * u)}"/>` : '') +
        `<circle class="th-obj-hit" r="${r1(R + 8 * u)}"/>` +
        `<path class="th-obj-shape" d="${blobD(R, hashStr(m))}" stroke-width="${r1(2.6 * u * 10) / 10}"/>` +
        `<text class="th-obj-id" y="${r1(-1 * u)}" font-size="${r1(10.5 * u)}">OBJ</text><text class="th-obj-num" y="${r1(12 * u)}" font-size="${r1(14 * u)}">${i + 1}</text>` +
        `<text class="th-obj-name" y="${r1(R + 17 * u)}" font-size="${r1(13.5 * u)}" stroke-width="${r1(4 * u)}">${esc(name)}</text>` +
        `<g transform="translate(0 ${r1(R + 33 * u)}) scale(${r1(u * 100) / 100})">${stars}</g>` +
        '</g>';
    });
    // the start line (line of departure)
    const e = pg.entry;
    const t = perp(e.n);
    const l1 = add(e.p, t, 46 * u), l2 = add(e.p, t, -46 * u);
    const ld = `<path class="th-ld" d="M${P(l1)}L${P(l2)}" stroke-width="${r1(4 * u)}"/><text class="th-ld-t" x="${r1(add(l1, t, 12 * u)[0])}" y="${r1(add(l1, t, 12 * u)[1] + 4 * u)}" font-size="${r1(11 * u)}" stroke-width="${r1(3 * u)}">LD</text>`;
    return ld + arrows + phases + objs;
  }

  function zoomLayer(id, sc, doneSet, unitsAt) {
    const pg = planGeo(id, sc);
    const u = pg.u;
    const d = polyD(PTS[id]);
    const dim = `<path class="th-z-dim" fill-rule="evenodd" d="M-5000 -5000H6600V6000H-5000Z${d}"/>`;
    const rim = `<path class="th-z-rim" d="${d}" stroke-width="${r1(5 * u)}"/><path class="th-z-rim2" d="${d}" stroke-width="${r1(1.6 * u)}" stroke-dasharray="${r1(9 * u)} ${r1(5 * u)}"/>`;
    return {
      pg,
      html: `${dim}${rim}<g id="th-z-plan">${planSvg(id, pg, doneSet)}</g><g id="th-z-trails"></g><g id="th-z-units">${zoomUnitsSvg(id, pg, unitsAt)}</g><g id="th-z-air"></g>`,
    };
  }

  // ---------------------------------------------------------------- the side panel
  function panelHTML(id) {
    const sec = TH().byId[id];
    const st = ctx.st.sectors[id];
    const ss = sectorStats(sec);
    const done = doneSetNow();
    const art = CoC.art;
    const starRow = (m) => [0, 1, 2].map((k) => art.star(!!medals(m)[k], 13)).join('');
    let rows = '';
    let currentFound = false;
    sec.missions.forEach((m, i) => {
      const state = missionState(sec, i, done, st);
      const lv = APP().levelById(m);
      const current = state === 'open' && !currentFound;
      if (current) currentFound = true;
      const word = !lv ? 'In preparation' : state === 'done' ? 'Taken' : state === 'open' ? (current ? 'Attack ▸' : 'Open ▸') : 'Locked';
      rows += `<li><button type="button" class="th-p-obj st-${state}${current ? ' current' : ''}${lv ? '' : ' missing'}" data-level="${m}"${state === 'locked' || !lv ? ' aria-disabled="true"' : ''}>` +
        `<span class="th-p-n">OBJ ${i + 1}</span><span class="th-p-t">${esc(lv ? lv.name : 'In preparation')}</span>` +
        `<span class="th-p-stars">${starRow(m)}</span><span class="th-p-w">${word}</span></button></li>`;
    });
    let extra = '';
    if (sec.contact) {
      const ms = ctx.st.missions[sec.contact];
      const lv = APP().levelById(sec.contact);
      extra += `<div class="th-p-sub">${ms === 'done' ? 'Contact restored' : 'Contact lost'}</div><button type="button" class="th-p-obj th-p-contact st-${ms}${lv ? '' : ' missing'}" data-level="${sec.contact}"${ms === 'locked' || !lv ? ' aria-disabled="true"' : ''}>` +
        `<span class="th-p-n">RADIO</span><span class="th-p-t">${esc(lv ? lv.name : 'In preparation')}</span><span class="th-p-stars">${starRow(sec.contact)}</span>` +
        `<span class="th-p-w">${!lv ? 'In preparation' : ms === 'done' ? 'Restored' : ms === 'open' ? 'Restore ▸' : 'Locked'}</span></button>`;
    }
    for (const sp of TH().SPECIALS.filter((x) => x.behind === id && ctx.st.missions[x.level] !== 'locked')) {
      const lv = APP().levelById(sp.level);
      const ms = ctx.st.missions[sp.level];
      extra += `<div class="th-p-sub">Behind the lines</div><button type="button" class="th-p-obj th-p-raid st-${ms}${lv ? '' : ' missing'}" data-level="${sp.level}"${lv ? '' : ' aria-disabled="true"'}>` +
        `<span class="th-p-n">RAID</span><span class="th-p-t">${esc(lv ? lv.name : 'In preparation')}</span><span class="th-p-stars">${starRow(sp.level)}</span>` +
        `<span class="th-p-w">${!lv ? 'In preparation' : ms === 'done' ? 'Done' : 'Optional ▸'}</span></button>`;
    }
    let pips = '';
    for (let i = 0; i < 5; i++) pips += `<i class="${i < sec.difficulty ? 'on' : ''}"></i>`;
    const short = Math.max(0, ctx.st.need[id] - ctx.st.stars);
    const note =
      st === 'gated' ? 'Our units here have lost contact with HQ, and the enemy is broadcasting fake orders in our name. Restore contact to open the way in.'
        : st === 'short' ? `Not enough stars yet: ★ ${ctx.st.stars} of ${ctx.st.need[id]}. Earn ${short} more — replay objectives for better medals or run a raid.`
        : st === 'locked' ? `Out of reach: capture a bordering sector first.${short ? ` It will also need ★ ${ctx.st.need[id]}.` : ''}`
          : st === 'captured' ? 'Sector held. Replay any objective to improve your medals.'
            : 'Take the objectives in order. Taking the last one captures the sector.';
    return (
      `<div class="th-p-head"><span class="th-p-code st-${st}">${sec.code}</span><span class="th-p-status st-${st}">${STATE_WORD[st]}</span>` +
      `<span class="th-p-pips" title="Difficulty ${sec.difficulty} of 5">${pips}</span></div>` +
      `<h2 class="th-p-name" tabindex="-1">${esc(sec.name)}</h2><p class="th-p-idea">${esc(sec.idea)}</p>` +
      `<div class="th-p-meta"><span>Objectives <b>${ss.done}/${ss.n}</b></span><span>Stars <b>${ss.stars}/${ss.max}</b></span></div>` +
      (st === 'captured' ? '<div class="th-p-stamp">Sector captured</div>' : '') +
      `<div class="th-p-sub">Plan of advance</div><ol class="th-p-objs">${rows}</ol>${extra}` +
      `<p class="th-p-note">${note}</p>` +
      '<button type="button" class="btn-ghost th-p-back" data-act="back">◂ Back to the front <small>Esc</small></button>'
    );
  }

  // ================================================================ view (viewBox) management
  function stageSize() {
    const r = els.stage ? els.stage.getBoundingClientRect() : { width: 0, height: 0 };
    return { W: r.width || 0, H: r.height || 0 };
  }
  const visible = () => {
    const { W, H } = stageSize();
    return W > 10 && H > 10;
  };
  const narrow = () => stageSize().W < 760;
  const panelWidth = (W) => (W >= 760 ? Math.round(clamp(W * 0.3, 300, 380)) : 0);

  // The home view: the sheet's full height fills the stage and the wide front scrolls sideways. The
  // camera keeps its place between visits (V.camX); `focusX` asks for a map x to be centred.
  const PAN_PAD = 10;
  const panLimits = (w) => [-PAN_PAD, MW + PAN_PAD - w];
  function homeBox(focusX) {
    const { W, H } = stageSize();
    const R = { y: 12, h: MH - 24 };
    const s = H / R.h;
    const w = W / s, h = H / s;
    let x;
    if (w >= MW) x = (MW - w) / 2;
    else {
      let c = focusX;
      if (c == null && V.camX != null) c = V.camX + w / 2;
      if (c == null) c = ctx ? friendlyCentre(ctx.st.sectors, computeFront(ctx.st.sectors))[0] : 0;
      x = clamp(c - w / 2, ...panLimits(w));
    }
    return { x, y: R.y - (h - R.h) / 2, w, h };
  }

  function zoomBox(id) {
    const { W, H } = stageSize();
    const b = bbox(PTS[id]);
    const pad = 46;
    const availW = W - (W >= 760 ? panelWidth(W) + 28 : 0);
    let s = Math.min(availW / (b.w + pad * 2), H / (b.h + pad * 2 + 30));
    s = Math.min(s, 3.4);
    const w = W / s, h = H / s;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2 + 10;
    let y = cy - H / 2 / s;
    if (h < MH + 24) y = clamp(y, -12, MH + 12 - h);
    else y = MH / 2 - h / 2;
    let x = cx - availW / 2 / s;
    if (!panelWidth(W) && w < MW + 24) x = clamp(x, -12, MW + 12 - w);
    return { x, y, w, h, s };
  }

  function setVB(vb) {
    V.vb = { x: vb.x, y: vb.y, w: vb.w, h: vb.h };
    const { W } = stageSize();
    V.s = W ? W / vb.w : 1;
    els.svg.setAttribute('viewBox', `${r1(vb.x)} ${r1(vb.y)} ${r1(vb.w)} ${r1(vb.h)}`);
    els.svg.classList.toggle('can-pan', vb.w < MW - 30 || vb.h < MH - 30);
    if (!V.zoomId) V.camX = vb.x;
    updateMini();
  }

  // ---------------------------------------------------------------- sideways scrolling
  // Wheel, trackpad, keyboard and the overview strip all steer V.targetX; one loop eases the camera.
  function scrollTo(x, instant) {
    if (!V.vb || V.animating) return;
    V.targetX = clamp(x, ...panLimits(V.vb.w));
    if (instant || reduced()) {
      setVB({ ...V.vb, x: V.targetX });
      return;
    }
    if (V.scrollRaf) return;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (V.animating || !els.svg || !els.svg.isConnected) return (V.scrollRaf = 0);
      const dx = V.targetX - V.vb.x;
      const x = Math.abs(dx) < 0.5 ? V.targetX : V.vb.x + dx * Math.min(1, dt * 10);
      setVB({ ...V.vb, x });
      V.scrollRaf = x === V.targetX ? 0 : requestAnimationFrame(step);
    };
    V.scrollRaf = requestAnimationFrame(step);
  }
  const scrollBy = (dx) => scrollTo((V.scrollRaf ? V.targetX : V.vb.x) + dx);
  // Bring map point x into view (centred) unless it already sits comfortably on screen.
  async function showX(x, ms = 650) {
    if (!V.vb || V.zoomId) return;
    const w = V.vb.w;
    if (x > V.vb.x + w * 0.2 && x < V.vb.x + w * 0.8) return;
    await animateVB({ ...V.vb, x: clamp(x - w / 2, ...panLimits(w)) }, ms);
  }

  // ---------------------------------------------------------------- the overview strip
  // A small copy of the whole front at the bottom of the screen: sectors in their colours and a frame
  // showing what the stage currently shows. Click or drag it to move the camera.
  function miniSvg(states) {
    const thin = (pts) => polyD(pts.filter((_, i) => i % 6 === 0));
    let s = `<rect class="m-paper" x="0" y="0" width="${MW}" height="${MH}"/>`;
    s += `<path class="m-sea" d="${thin(PTS.sea)}"/>`;
    for (const h of HOLE_IDS) s += `<path class="${h === 'gulf' ? 'm-sea' : 'm-hole'}" d="${thin(PTS[h])}"/>`;
    for (const sec of TH().SECTORS) s += `<path class="m-sec st-${states[sec.id]}" data-mini="${sec.id}" d="${thin(PTS[sec.id])}"/>`;
    return s + '<rect class="m-view" id="th-mini-view" x="0" y="0" width="100" height="1000"/>';
  }
  function setMini(states) {
    if (!els.mini) return;
    const svg = els.mini.querySelector('svg');
    svg.setAttribute('viewBox', `0 0 ${MW} ${MH}`);
    svg.innerHTML = miniSvg(states);
    els.miniView = svg.querySelector('#th-mini-view');
    updateMini();
  }
  function updateMini() {
    const v = els.miniView;
    if (!v || !V.vb) return;
    const x = clamp(V.vb.x, 0, MW), x2 = clamp(V.vb.x + V.vb.w, 0, MW);
    v.setAttribute('x', r1(x));
    v.setAttribute('width', r1(Math.max(20, x2 - x)));
  }

  function animateVB(to, ms = 700) {
    cancelAnimationFrame(V.raf);
    cancelAnimationFrame(V.scrollRaf);
    V.scrollRaf = 0;
    if (!V.vb || reduced() || ms <= 0) {
      setVB(to);
      return Promise.resolve();
    }
    const from = { ...V.vb };
    const fc = [from.x + from.w / 2, from.y + from.h / 2], tc = [to.x + to.w / 2, to.y + to.h / 2];
    const t0 = performance.now();
    V.animating = true;
    return new Promise((res) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const w = Math.exp(lerp(Math.log(from.w), Math.log(to.w), e));
        const h = w * (from.h / from.w);
        const c = lerpP(fc, tc, e);
        setVB({ x: c[0] - w / 2, y: c[1] - h / 2, w, h });
        if (t < 1) V.raf = requestAnimationFrame(step);
        else {
          V.animating = false;
          setVB(to);
          res();
        }
      };
      V.raf = requestAnimationFrame(step);
    });
  }

  function updateLabelScale() {
    const hb = homeBox();
    const { W } = stageSize();
    V.sHome = W / hb.w;
    V.k = clamp(0.8 / V.sHome, 1, 1.45);
    els.svg.querySelectorAll('.th-label').forEach((l) => {
      l.setAttribute('transform', labelTransform({ anchor: [+l.dataset.ax, +l.dataset.ay], tilt: +l.dataset.tilt }));
    });
  }

  // ================================================================ zoom in / out
  async function zoomTo(id, o = {}) {
    if (!els.svg) return;
    const sec = TH().byId[id];
    root.classList.add('is-zoomed');
    const zb = zoomBox(id);
    const doneSet = o.doneSet || doneSetNow();
    const unitsAt = o.unitsAt != null ? o.unitsAt : sectorStats(sec, doneSet).last;
    V.zoomId = id;
    lastSector = id;
    const z = zoomLayer(id, zb.s, doneSet, unitsAt);
    V.pg = z.pg;
    els.zoom.innerHTML = z.html;
    els.zoom.classList.remove('is-out');
    root.classList.add('is-zoomed');
    els.svg.querySelectorAll('[data-for], .th-label').forEach((n) => {
      const f = n.dataset.for || n.dataset.sector;
      n.classList.toggle('th-zfocus', f === id);
    });
    els.panel.innerHTML = panelHTML(id);
    els.panel.hidden = false;
    els.panel.style.setProperty('--panel-w', panelWidth(stageSize().W) + 'px');
    hideIntel();
    if (o.animate !== false) sfx('click');
    await animateVB(zb, o.animate === false ? 0 : 750);
    if (o.focus) {
      const target = els.panel.querySelector('.th-p-obj.current') || els.panel.querySelector('.th-p-name');
      if (target) target.focus({ preventScroll: true });
    }
  }

  async function zoomOut(o = {}) {
    if (!V.zoomId) return;
    const id = V.zoomId;
    V.zoomId = null;
    lastSector = null;
    root.classList.remove('is-zoomed');
    els.zoom.classList.add('is-out');
    els.svg.querySelectorAll('.th-zfocus').forEach((n) => n.classList.remove('th-zfocus'));
    els.panel.hidden = true;
    const b = bbox(PTS[id]);
    await animateVB(homeBox(o.focusX != null ? o.focusX : b.x + b.w / 2), o.animate === false ? 0 : 700);
    if (!V.zoomId) els.zoom.innerHTML = '';
    if (o.focus) {
      const g = els.svg.querySelector(`.th-sector[data-sector="${id}"]`);
      if (g) g.focus({ preventScroll: true });
    }
  }

  // ================================================================ interaction
  function onSector(id, viaKey) {
    const st = ctx.st.sectors[id];
    if (st === 'short') {
      const more = ctx.st.need[id] - ctx.st.stars;
      APP().toast(`Earn ${more} more star${more === 1 ? '' : 's'} to attack ${TH().byId[id].name} — replay objectives for better medals or run a raid.`);
    }
    if (st === 'locked') {
      sfx('hit');
      const sec = TH().byId[id];
      APP().toast(`${sec.name} is beyond reach — capture a sector that borders it first.`);
      const l = els.svg.querySelector(`.th-label[data-sector="${id}"]`);
      if (l) {
        l.classList.remove('th-shake');
        void l.getBBox();
        l.classList.add('th-shake');
      }
      return;
    }
    if (V.zoomId === id) return;
    zoomTo(id, { focus: viaKey });
  }

  function onLevel(id) {
    const app = APP();
    const lv = app.levelById(id);
    const kind = TH().kindOf(id);
    if (!lv) {
      sfx('hit');
      return app.toast('This operation is still in preparation at HQ.');
    }
    const ms = ctx.st.missions[id];
    if (ms === 'locked') {
      sfx('hit');
      if (kind === 'mission') {
        const sec = TH().sectorFor(id);
        const i = sec.missions.indexOf(id);
        if (ctx.st.sectors[sec.id] === 'gated') return app.toast('Contact with our units here is lost — restore it before advancing.');
        if (ctx.st.sectors[sec.id] === 'short') return app.toast(`Earn ${ctx.st.need[sec.id] - ctx.st.stars} more stars to attack this sector.`);
        if (ctx.st.sectors[sec.id] === 'locked') return app.toast('Out of reach: capture a bordering sector first.');
        return app.toast(`Take OBJ ${i} first — the advance goes in order.`);
      }
      return app.toast('Not yet: this operation is still locked.');
    }
    sfx('click');
    const sec = TH().sectorFor(id);
    if (sec) lastSector = V.zoomId || sec.id;
    app.openLevel(id);
  }

  function svgPoint(e) {
    const r = els.svg.getBoundingClientRect();
    return [V.vb.x + (e.clientX - r.left) / V.s, V.vb.y + (e.clientY - r.top) / V.s];
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    root.addEventListener(
      'click',
      (e) => {
        if (e.target.closest && e.target.closest('.th-finale')) return;
        if (V.playing) {
          e.stopPropagation();
          e.preventDefault();
          skipPlayback();
          return;
        }
        if (suppressClick) {
          suppressClick = false;
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        const t = e.target.closest('[data-level],[data-act],[data-sector],.th-z-dim');
        if (!t || !ctx) return;
        const viaKey = keyboardNav;
        if (t.dataset.act === 'back') return zoomOut({ focus: viaKey });
        if (t.dataset.act === 'victory') {
          sfx('stamp');
          return openFinale();
        }
        if (t.dataset.act === 'key') {
          const k = els.legend.querySelector('.th-key');
          k.hidden = !k.hidden;
          t.setAttribute('aria-expanded', String(!k.hidden));
          return;
        }
        if (t.dataset.level) return onLevel(t.dataset.level);
        if (t.classList.contains('th-z-dim')) {
          const p = svgPoint(e);
          const hit = TH().SECTORS.find((s) => inPoly(p, PTS[s.id]));
          if (hit && ctx.st.sectors[hit.id] !== 'locked') return zoomTo(hit.id);
          return zoomOut();
        }
        if (t.dataset.sector) return onSector(t.dataset.sector, viaKey);
      },
      true
    );
    root.addEventListener('keydown', (e) => {
      keyboardNav = true;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target.closest && e.target.closest('[data-level],[data-sector]');
      if (!t || t.tagName === 'BUTTON') return;
      e.preventDefault();
      if (t.dataset.level) onLevel(t.dataset.level);
      else onSector(t.dataset.sector, true);
    });
    root.addEventListener('pointerdown', (e) => {
      keyboardNav = false;
      if (!els.svg || !els.svg.contains(e.target) || e.button !== 0) return;
      if (!els.svg.classList.contains('can-pan')) return;
      drag = { x: e.clientX, y: e.clientY, vb: { ...V.vb }, moved: false, id: e.pointerId };
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 7) return;
      if (!drag.moved) {
        drag.moved = true;
        els.svg.classList.add('is-panning');
        hideIntel();
      }
      const vb = drag.vb;
      const mx = Math.max(0, MW - vb.w), my = Math.max(0, MH - vb.h);
      const x = mx > 0 ? clamp(vb.x - dx / V.s, ...panLimits(vb.w)) : vb.x;
      const y = V.zoomId && my > 0 ? clamp(vb.y - dy / V.s, -20, my + 20) : vb.y;
      cancelAnimationFrame(V.raf);
      cancelAnimationFrame(V.scrollRaf);
      V.scrollRaf = 0;
      setVB({ x, y, w: vb.w, h: vb.h });
    });
    const end = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      if (drag.moved) {
        suppressClick = true;
        setTimeout(() => (suppressClick = false), 0);
      }
      els.svg && els.svg.classList.remove('is-panning');
      drag = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    root.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch' || V.zoomId) return;
      const t = e.target.closest && e.target.closest('[data-sector]');
      if (t) showIntel(t.dataset.sector, e);
    });
    root.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || !els.intel || els.intel.hidden) return;
      placeIntel(e.clientX, e.clientY);
    });
    root.addEventListener('pointerout', (e) => {
      const t = e.target.closest && e.target.closest('[data-sector]');
      const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-sector]');
      if (t && (!to || to.dataset.sector !== t.dataset.sector)) hideIntel();
    });
    root.addEventListener('focusin', (e) => {
      const t = e.target.closest && e.target.closest('.th-sector');
      if (t && !V.zoomId && keyboardNav) {
        const r = t.getBoundingClientRect();
        showIntel(t.dataset.sector, { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
      }
    });
    root.addEventListener('focusout', hideIntel);
    // wheel / trackpad: either axis moves the front sideways (shift-wheel too); pinch-zoom is left alone
    root.addEventListener(
      'wheel',
      (e) => {
        if (!els.stage || !els.stage.contains(e.target) || e.ctrlKey || !V.vb) return;
        if (V.vb.w >= MW) return;
        const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? stageSize().W : 1;
        const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
        if (!d) return;
        e.preventDefault();
        hideIntel();
        scrollBy(d / V.s);
      },
      { passive: false }
    );
    // the overview strip: click or drag to move the camera
    let miniDrag = false;
    const miniMove = (e) => {
      const r = els.mini.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * MW;
      scrollTo(x - V.vb.w / 2, e.type === 'pointermove');
    };
    root.addEventListener('pointerdown', (e) => {
      if (!els.mini || !els.mini.contains(e.target) || !V.vb) return;
      e.preventDefault();
      if (V.zoomId) zoomOut();
      miniDrag = true;
      miniMove(e);
    });
    window.addEventListener('pointermove', (e) => miniDrag && !V.zoomId && miniMove(e));
    window.addEventListener('pointerup', () => (miniDrag = false));
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
      if (FIN || !screenActive() || !V.vb || V.vb.w >= MW || document.body.classList.contains('coaching')) return;
      const modal = document.getElementById('modal');
      if ((modal && !modal.hidden) || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      if (e.key === 'Home') return scrollTo(-PAN_PAD);
      if (e.key === 'End') return scrollTo(MW);
      scrollBy((e.key === 'ArrowLeft' ? -1 : 1) * V.vb.w * 0.35);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (FIN) {
        e.preventDefault();
        if (FIN.stage < 2) nextFinale();
        else closeFinale(true);
        return;
      }
      if (V.playing && screenActive() && !document.body.classList.contains('coaching')) {
        e.preventDefault();
        return skipPlayback();
      }
      if (!V.zoomId) return;
      const scr = document.getElementById('screen-map');
      if (!scr || !scr.classList.contains('active')) return;
      const modal = document.getElementById('modal');
      if ((modal && !modal.hidden) || document.body.classList.contains('coaching')) return;
      zoomOut({ focus: true });
    });
    if (globalThis.ResizeObserver) {
      let to = 0;
      new ResizeObserver(() => {
        clearTimeout(to);
        to = setTimeout(onResize, 60);
      }).observe(root);
    } else window.addEventListener('resize', onResize);
  }

  function onResize() {
    if (!els.svg || !visible() || V.animating || drag) return;
    updateLabelScale();
    if (V.zoomId) {
      const zb = zoomBox(V.zoomId);
      const z = zoomLayer(V.zoomId, zb.s, doneSetNow(), sectorStats(TH().byId[V.zoomId]).last);
      V.pg = z.pg;
      els.zoom.innerHTML = z.html;
      els.panel.style.setProperty('--panel-w', panelWidth(stageSize().W) + 'px');
      setVB(zb);
    } else setVB(homeBox());
  }

  // ---------------------------------------------------------------- intel card (hover)
  function showIntel(id, e) {
    if (!els.intel || !ctx) return;
    const sec = TH().byId[id];
    const st = ctx.st.sectors[id];
    const ss = sectorStats(sec);
    let pips = '';
    for (let i = 0; i < 5; i++) pips += `<i class="${i < sec.difficulty ? 'on' : ''}"></i>`;
    const act = st === 'locked' ? 'Out of reach' : st === 'gated' ? 'Restore contact' : st === 'short' ? `Needs ★ ${ctx.st.need[id]}` : st === 'captured' ? 'Click to review' : 'Click to plan the attack';
    els.intel.innerHTML =
      `<div class="th-i-head"><b>${sec.code}</b><span class="st-${st}">${STATE_WORD[st]}</span><span class="th-p-pips">${pips}</span></div>` +
      `<div class="th-i-name">${esc(sec.name)}</div><div class="th-i-idea">${esc(sec.idea)}</div>` +
      `<div class="th-i-foot">${ss.done}/${ss.n} objectives · ★ ${ss.stars}/${ss.max}<em>${act}</em></div>`;
    els.intel.hidden = false;
    placeIntel(e.clientX, e.clientY);
  }
  function placeIntel(x, y) {
    const r = root.getBoundingClientRect();
    const w = els.intel.offsetWidth, h = els.intel.offsetHeight;
    let left = x - r.left + 18, top = y - r.top + 18;
    if (left + w > r.width - 8) left = x - r.left - w - 18;
    if (top + h > r.height - 8) top = y - r.top - h - 18;
    els.intel.style.left = Math.max(8, left) + 'px';
    els.intel.style.top = Math.max(8, top) + 'px';
  }
  function hideIntel() {
    if (els.intel) els.intel.hidden = true;
  }

  // ================================================================ render
  const keyIcon = (k, cls) =>
    `<svg class="sw-ico" viewBox="-20 -14 40 28" aria-hidden="true"><g class="th-u ${cls}"><use href="#th-s-${k}"/></g></svg>`;
  // the corner tab: the map key (and, once the war is won, the victory replay)
  function legendHTML(st) {
    const all = TH().SECTORS.every((s) => st.sectors[s.id] === 'captured');
    return (
      '<div class="th-orders">' +
      (all ? `<button type="button" class="th-victory-btn" data-act="victory" title="Watch the victory again">${CoC.art.medal(2, true)}Victory</button>` : '') +
      '<button type="button" class="th-keybtn" data-act="key" aria-expanded="false">Key</button></div>' +
      '<div class="th-key" hidden><span class="k"><i class="sw sw-friend"></i>Held by us</span><span class="k"><i class="sw sw-open"></i>Open to attack</span>' +
      '<span class="k"><i class="sw sw-gated"></i>Contact lost</span><span class="k"><i class="sw sw-short"></i>Needs more stars</span><span class="k"><i class="sw sw-locked"></i>Beyond reach</span>' +
      '<span class="k"><i class="sw sw-front"></i>Front line</span>' +
      `<span class="k">${keyIcon('tank', 'fr')}Our forces</span><span class="k">${keyIcon('tent', 'fr')}Our command post</span>` +
      `<span class="k">${keyIcon('tank', 'en')}Enemy forces</span><span class="k">${keyIcon('bunker', 'en')}Enemy strongpoint</span></div>`
    );
  }

  function render(opts = {}) {
    root = document.getElementById('theater');
    const app = APP();
    if (!root || !app || !TH()) return;
    const st = app.theaterStatus();
    const T = (app.S.save.theater = app.S.save.theater || {});
    const plan = UNLOCK ? diffPlan(null) : diffPlan(T.seen, st, opts);
    const pre = { ...st.sectors };
    if (T.seen && T.seen.sectors) plan.captured.forEach((id) => (pre[id] = T.seen.sectors[id] === 'gated' ? 'gated' : 'open'));
    plan.opened.forEach((id) => (pre[id] = T.seen && T.seen.sectors[id] === 'short' ? 'short' : 'locked'));
    plan.reached.forEach((id) => (pre[id] = 'locked'));
    plan.breached.forEach((id) => (pre[id] = 'gated'));
    ctx = { st, plan, pre, opts, gen: ++gen };
    cancelAnimationFrame(V.raf);
    V.animating = false;
    V.zoomId = null;
    V.playing = false;
    root.classList.remove('is-zoomed', 'is-playing', 'is-anim');
    root.innerHTML =
      '<div class="th-stage" id="th-stage">' +
      '<svg class="th-svg" id="th-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" aria-label="Map of the front: click a sector to plan an attack">' +
      '</svg><div class="th-intel" id="th-intel" hidden></div><div class="th-skiphint" aria-hidden="true">Click or press Esc to skip ▸▸</div></div>' +
      '<div class="th-dock"><div class="th-legend" id="th-legend"></div>' +
      '<div class="th-mini" id="th-mini" title="The whole front — click or drag to move"><svg viewBox="0 0 4400 1000" preserveAspectRatio="none" aria-hidden="true"></svg></div></div>' +
      '<aside class="th-panel" id="th-panel" aria-live="polite" hidden></aside>';
    els = {
      stage: root.querySelector('#th-stage'),
      svg: root.querySelector('#th-svg'),
      panel: root.querySelector('#th-panel'),
      legend: root.querySelector('#th-legend'),
      mini: root.querySelector('#th-mini'),
      intel: root.querySelector('#th-intel'),
    };
    els.svg.innerHTML = mapSvg(st, pre, plan);
    els.zoom = els.svg.querySelector('#th-zoom');
    els.fx = els.svg.querySelector('#th-fx');
    els.legend.innerHTML = legendHTML(st);
    setMini(pre);
    bindOnce();
    if (visible()) {
      updateLabelScale();
      setVB(homeBox());
    }
  }

  // ================================================================ motion: models that drive, march and fly
  // Every model follows its own curved route (a spline through waypoints that detours to a bridge or ford
  // when it meets a river and keeps trucks on the roads), sampled by arc length. Vehicles face along the
  // route at all times: they turn at a limited rate, slow down (or pivot on the spot) when the route bends
  // sharper than they can turn, accelerate from rest and brake to a stop — also briefly at a crossing.
  // Infantry dash and drop. Aircraft bank through their turns. One requestAnimationFrame loop drives all.
  const NS = 'http://www.w3.org/2000/svg';
  const angDiff = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;
  const dirOf = (h) => [Math.cos((h * Math.PI) / 180), Math.sin((h * Math.PI) / 180)];

  function splinePts(way, step) {
    const n = way.length;
    if (n < 2) return way.slice();
    const g = (i) => way[clamp(i, 0, n - 1)];
    const out = [way[0]];
    for (let i = 0; i < n - 1; i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      const k = Math.max(2, Math.ceil(dist(p1, p2) / step));
      for (let j = 1; j <= k; j++) {
        const t = j / k, u = 1 - t;
        const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
        out.push([a * p1[0] + b * c1[0] + c * c2[0] + d * p2[0], a * p1[1] + b * c1[1] + c * c2[1] + d * p2[1]]);
      }
    }
    return out;
  }
  function segX(a, b, c, d) {
    const r = sub(b, a), q = sub(d, c);
    const den = r[0] * q[1] - r[1] * q[0];
    if (Math.abs(den) < 1e-9) return null;
    const w = sub(c, a);
    const t = (w[0] * q[1] - w[1] * q[0]) / den, u = (w[0] * r[1] - w[1] * r[0]) / den;
    return t > 0 && t < 1 && u >= 0 && u <= 1 ? add(a, r, t) : null;
  }
  let RIVER_PTS = null, ROAD_PTS = null, CROSSINGS = null;
  function terrainCache() {
    if (RIVER_PTS) return;
    RIVER_PTS = Object.values(RIVER_WAYS).map((w) => splinePts(w, 10));
    const roads = ROAD_WAYS.map((w) => splinePts(w, 10));
    ROAD_PTS = roads.flat();
    CROSSINGS = EXTRA_FORDS.slice();
    for (const rd of roads)
      for (const rv of RIVER_PTS)
        for (let i = 0; i < rd.length - 1; i++)
          for (let j = 0; j < rv.length - 1; j++) {
            const x = segX(rd[i], rd[i + 1], rv[j], rv[j + 1]);
            if (x) CROSSINGS.push(x);
          }
  }
  function riverHit(a, b) {
    for (const rv of RIVER_PTS)
      for (let j = 0; j < rv.length - 1; j++) {
        const x = segX(a, b, rv[j], rv[j + 1]);
        if (x) return x;
      }
    return null;
  }
  const nearestOf = (list, p) => list.reduce((best, q) => (dist(q, p) < dist(best, p) ? q : best), list[0]);
  function outOfHoles(p) {
    for (const h of HOLE_IDS) {
      if (!inPoly(p, PTS[h])) continue;
      const e = nearestOf(PTS[h], p);
      const c = bbox(PTS[h]);
      return add(e, norm(sub(e, [c.x + c.w / 2, c.y + c.h / 2])), 30);
    }
    return p;
  }

  // A model's own route from pose a (h0) to pose b (h1). `via`: corridor points to pass near.
  function routeFor(kind, a, h0, b, h1, rnd, k, via) {
    terrainCache();
    const K = KINDS[kind] || KINDS.tank;
    const D = dist(a, b);
    if (D < 2 * k) return null;
    const lead = Math.min(D * 0.2, K.lead * k);
    let mids;
    if (via && via.length) mids = via.map((p) => add(p, [(rnd() - 0.5) * K.jit * k, (rnd() - 0.5) * K.jit * k]));
    else {
      const nm = D > 220 * k ? 2 : 1;
      const n = perp(norm(sub(b, a)));
      mids = [];
      for (let j = 1; j <= nm; j++) mids.push(add(lerpP(a, b, j / (nm + 1)), n, (rnd() - 0.5) * 2 * K.bend * D));
    }
    // never double back: keep only waypoints that lie between a and b along the way, in order
    const ab = sub(b, a);
    const proj = (p) => ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (D * D);
    mids = mids.filter((p) => proj(p) > 0.1 && proj(p) < 0.9 && dist(p, a) > 2.5 * lead && dist(p, b) > 2.5 * lead).sort((p, q) => proj(p) - proj(q));
    if (kind === 'soldier' && mids.length > 2) mids = [mids[Math.floor(mids.length / 3)], mids[Math.floor((2 * mids.length) / 3)]];
    mids = mids.map(outOfHoles);
    if (kind === 'truck') {
      // trucks keep to the road where there is one close by
      mids = mids.map((p) => {
        const q = nearestOf(ROAD_PTS, p);
        return dist(q, p) < 40 * Math.max(1, k) ? lerpP(p, q, 0.85) : p;
      });
    }
    const way = [a, add(a, dirOf(h0), lead), ...mids, add(b, dirOf(h1), -lead), b];
    // rivers: cross at the nearest bridge or ford, and stop there briefly
    const stops = [];
    for (let i = 0; i < way.length - 1 && stops.length < 2; i++) {
      const x = riverHit(way[i], way[i + 1]);
      if (!x) continue;
      const c = nearestOf(CROSSINGS, x);
      const cp = dist(c, x) < 90 ? c : x;
      const d = norm(sub(way[i + 1], way[i]));
      way.splice(i + 1, 0, add(cp, d, -10 * k), cp, add(cp, d, 10 * k));
      stops.push(cp);
      i += 3;
    }
    const pts = splinePts(way, 3.5 * k);
    const cum = cumLen(pts);
    const stopS = K.bound || kind === 'jeep' ? [] : stops.map((c) => {
      let bi = 0;
      pts.forEach((q, i) => dist(q, c) < dist(pts[bi], c) && (bi = i));
      return cum[bi];
    });
    return { pts, cum, L: cum[cum.length - 1], stops: stopS.sort((x, y) => x - y) };
  }

  // ---------------------------------------------------------------- where units may go
  // Ground units never cross enemy sectors or impassable ground. The sheet is rasterised once into a
  // region grid; a route must stay inside an allowed set of regions (our captured sectors, the sea, and
  // the sector being taken). A* over that grid (eroded by one cell, for a margin) finds a way when the
  // preferred, nicer-looking route would stray.
  const RS = 12; // raster cell, map units
  const RW = Math.ceil(MW / RS), RH = Math.ceil(MH / RS);
  const REGION_LIST = Object.keys(PTS);
  const BBOX = Object.fromEntries(REGION_LIST.map((id) => [id, bbox(PTS[id])]));
  let RASTER = null;
  function raster() {
    if (RASTER) return RASTER;
    RASTER = new Int16Array(RW * RH).fill(-1);
    REGION_LIST.forEach((id, ri) => {
      const pts = PTS[id], b = BBOX[id];
      for (let gy = Math.max(0, Math.floor(b.y / RS)); gy <= Math.min(RH - 1, Math.ceil((b.y + b.h) / RS)); gy++) {
        const y = (gy + 0.5) * RS;
        const xs = [];
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [x1, y1] = pts[i], [x2, y2] = pts[j];
          if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const g0 = Math.max(0, Math.ceil(xs[k] / RS - 0.5)), g1 = Math.min(RW - 1, Math.floor(xs[k + 1] / RS - 0.5));
          for (let gx = g0; gx <= g1; gx++) RASTER[gy * RW + gx] = ri;
        }
      }
    });
    return RASTER;
  }
  const cellOf = (p) => clamp(Math.floor(p[1] / RS), 0, RH - 1) * RW + clamp(Math.floor(p[0] / RS), 0, RW - 1);
  const cellPt = (c) => [((c % RW) + 0.5) * RS, (Math.floor(c / RW) + 0.5) * RS];
  // exact region lookup (point in polygon)
  function regionAt(p) {
    for (const id of REGION_LIST) {
      const b = BBOX[id];
      if (p[0] < b.x || p[0] > b.x + b.w || p[1] < b.y || p[1] > b.y + b.h) continue;
      if (inPoly(p, PTS[id])) return id;
    }
    return null;
  }
  // The regions our models may use: captured sectors, the sea, plus any extra (the sector being taken).
  function groundFor(states, ...extra) {
    const s = new Set(['sea', ...extra]);
    for (const sec of TH().SECTORS) if (states[sec.id] === 'captured') s.add(sec.id);
    return s;
  }
  const MASKS = {};
  function maskFor(allowed) {
    const key = [...allowed].sort().join(',');
    if (MASKS[key]) return MASKS[key];
    const R = raster();
    const ok = new Uint8Array(RW * RH);
    const idx = new Set(REGION_LIST.map((id, i) => (allowed.has(id) ? i : -2)));
    for (let c = 0; c < R.length; c++) ok[c] = idx.has(R[c]) ? 1 : 0;
    const er = new Uint8Array(RW * RH);
    for (let c = 0; c < R.length; c++) {
      if (!ok[c]) continue;
      const x = c % RW, y = (c - x) / RW;
      let all = 1;
      for (let dy = -1; dy <= 1 && all; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= RW || ny >= RH || !ok[ny * RW + nx]) {
            all = 0;
            break;
          }
        }
      er[c] = all;
    }
    return (MASKS[key] = { ok, er });
  }
  const clearLine = (a, b, grid) => {
    const n = Math.max(1, Math.ceil(dist(a, b) / (RS * 0.5)));
    for (let i = 0; i <= n; i++) if (!grid[cellOf(lerpP(a, b, i / n))]) return false;
    return true;
  };
  // Pull a point into the allowed ground, along the line towards a point known to be allowed.
  function pullIn(p, safe, allowed) {
    if (allowed.has(regionAt(p))) return p;
    let lo = 0, hi = 1; // fraction from safe towards p
    for (let i = 0; i < 14; i++) {
      const m = (lo + hi) / 2;
      if (allowed.has(regionAt(lerpP(safe, p, m)))) lo = m;
      else hi = m;
    }
    return lerpP(safe, p, Math.max(0, lo - 0.08));
  }
  // A* over the eroded grid from a to b; returns waypoints (string-pulled), or null.
  function gridPath(a, b, allowed) {
    const { ok, er } = maskFor(allowed);
    const nearestOpen = (p) => {
      const c0 = cellOf(p);
      if (er[c0]) return c0;
      let best = -1, bd = Infinity;
      const x0 = c0 % RW, y0 = (c0 - x0) / RW;
      for (let r = 1; r < 8 && best < 0; r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const x = x0 + dx, y = y0 + dy;
            if (x < 0 || y < 0 || x >= RW || y >= RH || !er[y * RW + x]) continue;
            const d = dx * dx + dy * dy;
            if (d < bd) (bd = d), (best = y * RW + x);
          }
      return best;
    };
    const s = nearestOpen(a), t = nearestOpen(b);
    if (s < 0 || t < 0) return null;
    const g = new Float32Array(RW * RH).fill(Infinity), came = new Int32Array(RW * RH).fill(-1);
    const heap = [];
    const push = (c, f) => {
      heap.push([f, c]);
      let i = heap.length - 1;
      while (i > 0) {
        const pi = (i - 1) >> 1;
        if (heap[pi][0] <= heap[i][0]) break;
        [heap[pi], heap[i]] = [heap[i], heap[pi]];
        i = pi;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    const tx = t % RW, ty = (t - tx) / RW;
    const hEst = (c) => {
      const x = c % RW, y = (c - x) / RW;
      return Math.hypot(x - tx, y - ty);
    };
    g[s] = 0;
    push(s, hEst(s));
    let found = false;
    while (heap.length) {
      const [, c] = pop();
      if (c === t) {
        found = true;
        break;
      }
      const x = c % RW, y = (c - x) / RW;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= RW || ny >= RH) continue;
          const nc = ny * RW + nx;
          if (!er[nc]) continue;
          const ng = g[c] + (dx && dy ? 1.4142 : 1);
          if (ng < g[nc]) {
            g[nc] = ng;
            came[nc] = c;
            push(nc, ng + hEst(nc));
          }
        }
    }
    if (!found) return null;
    const cells = [];
    for (let c = t; c >= 0; c = came[c]) cells.push(c);
    cells.reverse();
    const raw = [a, ...cells.map(cellPt), b];
    // string pulling: keep only the corners needed for clear lines of sight (on the eroded grid)
    const way = [raw[0]];
    let i = 0;
    while (i < raw.length - 1) {
      let j = raw.length - 1;
      while (j > i + 1 && !clearLine(raw[i], raw[j], er)) j--;
      way.push(raw[j]);
      i = j;
    }
    return { way, ok };
  }
  // Every sampled point of a path inside the allowed ground?
  const pathClear = (pts, allowed) => pts.every((p) => allowed.has(regionAt(p)));

  // The route a ground model actually drives: the preferred route if it stays on allowed ground, else
  // a grid route smoothed (and checked) around the enemy's ground.
  function planRoute(kind, a, h0, b, h1, rnd, k, via, allowed) {
    const t0 = performance.now();
    let r = planRoute0(kind, a, h0, b, h1, rnd, k, via, allowed);
    // last safeguard: no sampled point may sit off allowed ground — hold any stray point at the last
    // allowed one (a few units' hesitation instead of a step over the line)
    if (r && allowed && !pathClear(r.pts, allowed)) {
      let lastOk = null;
      const pts = r.pts.map((p) => {
        if (allowed.has(regionAt(p))) return (lastOk = p);
        return lastOk ? lastOk : p;
      });
      const firstOk = pts.find((p) => allowed.has(regionAt(p)));
      for (let i = 0; i < pts.length && firstOk && !allowed.has(regionAt(pts[i])); i++) pts[i] = firstOk;
      const cum = cumLen(pts);
      r = { ...r, pts, cum, L: cum[cum.length - 1], stops: r.stops.filter((x) => x < cum[cum.length - 1]) };
    }
    V.routeMs = (V.routeMs || 0) + performance.now() - t0;
    return r;
  }
  function planRoute0(kind, a, h0, b, h1, rnd, k, via, allowed) {
    const pref = routeFor(kind, a, h0, b, h1, rnd, k, via);
    if (!pref || !allowed || pathClear(pref.pts, allowed)) return pref;
    const gp = gridPath(a, b, allowed);
    if (!gp) return pref;
    const K = KINDS[kind] || KINDS.tank;
    let pts = splinePts(gp.way, 3.5 * k);
    if (!pathClear(pts, allowed)) {
      // corner-cut the polyline instead of a full spline, which hugs the safe corridor
      pts = gp.way;
      for (let it = 0; it < 2; it++) {
        const out = [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) {
          if (i > 0) out.push(lerpP(pts[i], pts[i + 1], 0.25));
          if (i < pts.length - 2) out.push(lerpP(pts[i], pts[i + 1], 0.75));
        }
        out.push(pts[pts.length - 1]);
        pts = out;
      }
      const dense = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const n = Math.max(1, Math.ceil(dist(pts[i - 1], pts[i]) / (3.5 * k)));
        for (let j = 1; j <= n; j++) dense.push(lerpP(pts[i - 1], pts[i], j / n));
      }
      pts = dense;
      if (!pathClear(pts, allowed)) {
        pts = [];
        for (let i = 1; i < gp.way.length; i++) {
          const n = Math.max(1, Math.ceil(dist(gp.way[i - 1], gp.way[i]) / (3.5 * k)));
          for (let j = i === 1 ? 0 : 1; j <= n; j++) pts.push(lerpP(gp.way[i - 1], gp.way[i], j / n));
        }
      }
    }
    const cum = cumLen(pts);
    // fording: vehicles pause where the route meets a river
    terrainCache();
    const stops = [];
    if (!K.bound && kind !== 'jeep')
      for (let i = 1; i < pts.length && stops.length < 2; i++) if (riverHit(pts[i - 1], pts[i])) stops.push(cum[i]), (i += 20);
    return { pts, cum, L: cum[cum.length - 1], stops, grid: true };
  }

  const CHECKS = []; // every ground route driven (for the test suite: _debug.routeViolations())
  function makeMover(el, kind, path, o) {
    if (o.allowed) {
      CHECKS.push({ kind, pts: path.pts, allowed: o.allowed });
      if (CHECKS.length > 600) CHECKS.shift();
    }
    return {
      el, kind, path, K: KINDS[kind] || KINDS.tank, k: o.k, sc: o.sc, delay: o.delay || 0, speed: o.speed || 1,
      h: o.h0, h1: o.h1, s: 0, v: 0, wait: 0, stops: path.stops.slice(), boundEnd: 0, prone: false,
      trails: o.trails, trailAcc: 0, rnd: o.rnd || Math.random, done: false,
    };
  }

  // One pace for a whole group: scale every model's natural speed by the same factor, chosen from the
  // group's median route length so the lead models take about `secs` seconds. Relative speeds (jeeps
  // fast, guns slow) are kept and nobody is teleported; start delays shrink with the pace.
  function setPace(movers, secs) {
    const ground = movers.filter((m) => !m.plane);
    if (!ground.length) return;
    const lens = ground.map((m) => m.path.L / m.k).sort((a, b) => a - b);
    const med = lens[lens.length >> 1];
    const pace = clamp(med / (KINDS.tank.v * secs), 1.2, 8);
    for (const m of ground) {
      m.speed *= pace;
      m.delay /= Math.max(1, pace / 1.5);
    }
  }


  // An aircraft that comes in from behind, circles `c` once and a quarter, banking, and leaves ahead.
  function makePlane(layer, from, c, dir, k, cls, delay) {
    const n = perp(dir);
    const R = 64 * k;
    const a0 = Math.atan2(n[1], n[0]);
    const entry = add(c, n, R);
    const way = [add(add(from, dir, -420 * k), n, 170 * k), add(entry, dir, -1.6 * R)];
    for (let j = 0; j <= 10; j++) {
      const a = a0 - (j * Math.PI * 2) / 8;
      way.push([c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R]);
    }
    way.push(add(add(c, dir, 260 * k), n, -110 * k), add(add(c, dir, 640 * k), n, -150 * k));
    const pts = splinePts(way, 4 * k);
    const el = document.createElementNS(NS, 'g');
    el.setAttribute('class', `th-plane ${cls}`);
    el.innerHTML = `<g>${PLANE_USE}</g>`;
    el.style.opacity = 0;
    layer.appendChild(el);
    const cum = cumLen(pts);
    return { plane: true, el, bankEl: el.firstChild, path: { pts, cum, L: cum[cum.length - 1] }, s: 0, v: 300 * k, k, sc: 1.15 * k, delay, h: null, bank: 0, done: false };
  }

  function spawnMark(g, kind, p, h, sc) {
    if (!g || !g.isConnected) return;
    const e = document.createElementNS(NS, 'g');
    e.setAttribute('class', kind === 'track' ? 'th-track' : 'th-dust');
    e.setAttribute('transform', `translate(${P(p)}) rotate(${r1(h)}) scale(${Math.round(sc * 1000) / 1000})`);
    e.innerHTML = kind === 'track' ? '<path d="M-3 -9.5h6M-3 9.5h6"/>' : '<circle cx="-15" r="5"/>';
    g.appendChild(e);
    setTimeout(() => e.remove(), kind === 'track' ? 2600 : 1300);
  }

  function drawMover(m, p) {
    const sc = m.prone ? m.sc * 0.84 : m.sc;
    m.el.setAttribute('transform', `translate(${P(p)}) rotate(${r1(m.h)}) scale(${Math.round(sc * 1000) / 1000})`);
  }

  function tickPlane(m, dt) {
    const L = m.path.L;
    m.s = Math.min(L, m.s + m.v * dt);
    const here = at(m.path.pts, m.path.cum, m.s);
    const ahead = at(m.path.pts, m.path.cum, Math.min(L, m.s + 4 * m.k));
    const h = m.s < L ? deg(sub(ahead.p, here.p)) : m.h;
    if (m.h == null) m.h = h;
    const rate = angDiff(h, m.h) / Math.max(dt, 1e-3);
    m.h = h;
    m.bank += (clamp(rate * 0.45, -55, 55) - m.bank) * Math.min(1, dt * 3);
    m.el.setAttribute('transform', `translate(${P(here.p)}) rotate(${r1(h)})`);
    m.bankEl.setAttribute('transform', `scale(${Math.round(m.sc * 1000) / 1000} ${Math.round(m.sc * Math.cos((m.bank * Math.PI) / 180) * 1000) / 1000})`);
    m.el.style.opacity = clamp(Math.min(m.s, L - m.s) / (90 * m.k), 0, 1);
    if (m.s >= L) finishMover(m);
  }

  function tickMover(m, dt, t) {
    if (m.done || t < m.delay) return;
    if (m.plane) return tickPlane(m, dt);
    const { K, k, path } = m;
    const L = path.L;
    if (m.wait > 0) {
      m.wait -= dt;
      if (m.wait <= 0) m.prone = false;
      return drawMover(m, at(path.pts, path.cum, m.s).p);
    }
    // infantry: a purposeful dash of 40–70 px towards the destination, then drop briefly
    if (K.bound && m.boundEnd <= m.s + 0.01 * k) m.boundEnd = Math.min(L, m.s + (40 + m.rnd() * 30) * k);
    // natural speed (scaled for the whole group by setPace)
    const spd = m.speed;
    // a faster pace plays the same motion faster: acceleration scales with pace², turning with pace
    const A = K.a * k * Math.max(1, spd * spd);
    const B = Math.max(3 * A, (K.v * k * spd) / 0.35); // braking: from cruise to a stop in about a third of a second
    // heading: always toward the route a little ahead, at a limited turn rate
    const here = at(path.pts, path.cum, m.s);
    const ahead = at(path.pts, path.cum, Math.min(L, m.s + 6 * k));
    const atEnd = m.s >= L - 0.05 * k;
    const tgt = atEnd ? m.h1 : dist(ahead.p, here.p) > 1e-6 ? deg(sub(ahead.p, here.p)) : deg(here.t);
    const turn = (atEnd ? Math.max(K.turn * 3, 320) : K.turn * Math.max(1, spd)) * dt;
    m.h += clamp(angDiff(tgt, m.h), -turn, turn);
    const err = Math.abs(angDiff(tgt, m.h));
    if (atEnd) {
      if (err < 3 || K.bound) {
        m.h = m.h1;
        m.done = true;
      }
      return drawMover(m, here.p);
    }
    // speed: accelerate to cruise, slow for bends it cannot take, brake for the next stop
    let stopAt = L;
    if (m.stops.length) stopAt = Math.min(stopAt, m.stops[0]);
    if (K.bound) stopAt = Math.min(stopAt, m.boundEnd);
    const rem = stopAt - m.s;
    const align = K.bound || L - m.s < 18 * k ? 1 : clamp(1 - (err - 6) / 26, 0, 1);
    const creep = align > 0.3 && rem > 0.01 * k ? 3 * k : 0;
    const want = Math.max(creep, Math.min(K.v * k * spd * align, Math.sqrt(2 * B * Math.max(0, rem))));
    m.v = want < m.v ? Math.max(want, m.v - B * dt) : Math.min(want, m.v + A * dt);
    const ds = Math.min(Math.max(0, rem), m.v * dt);
    m.s += ds;
    if (stopAt - m.s <= 0.02 * k && stopAt < L - 0.05 * k) {
      m.s = stopAt;
      m.v = 0;
      if (m.stops.length && stopAt === m.stops[0]) {
        m.stops.shift();
        m.wait = 0.25 + m.rnd() * 0.2;
      } else if (K.bound) {
        m.wait = 0.1 + m.rnd() * 0.12;
        m.prone = true;
      }
    } else if (stopAt - m.s <= 0.02 * k) m.s = L;
    const p = at(path.pts, path.cum, m.s).p;
    if (K.mark && m.trails && ds > 0) {
      m.trailAcc += ds;
      if (m.trailAcc >= (K.mark === 'track' ? 6 : 11) * k) {
        m.trailAcc = 0;
        spawnMark(m.trails, K.mark, p, m.h, m.sc);
      }
    }
    drawMover(m, p);
  }

  function finishMover(m) {
    m.done = true;
    if (m.plane) return m.el.remove();
    m.s = m.path.L;
    m.h = m.h1;
    m.prone = false;
    drawMover(m, m.path.pts[m.path.pts.length - 1]);
  }

  // Drive every mover from one animation loop; resolves when all have arrived (or the view went away).
  function runMovers(list, alive, limit = 30000) {
    if (!list.some((m) => m.plane)) V.lastMovers = list;
    return new Promise((res) => {
      if (!list.length) return res();
      const t0 = performance.now();
      let last = t0;
      const step = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (!alive() || now - t0 > limit) {
          list.forEach((m) => !m.done && finishMover(m));
          return res();
        }
        let busy = false;
        for (const m of list) {
          if (m.done) continue;
          tickMover(m, dt, now - t0);
          if (!m.done) busy = true;
        }
        if (busy) requestAnimationFrame(step);
        else res();
      };
      requestAnimationFrame(step);
    });
  }

  // ================================================================ animations
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $$ = (sel) => (els.svg ? [...els.svg.querySelectorAll(sel)] : []);

  function flipSector(id, state) {
    const g = els.svg.querySelector(`.th-sector[data-sector="${id}"]`);
    if (g) g.setAttribute('class', `th-sector st-${state}`);
    const slot = els.svg.querySelector(`[data-label-slot="${id}"]`);
    if (slot) slot.innerHTML = labelSvg(id, state);
    return slot && slot.firstElementChild;
  }

  function flash(id) {
    const g = els.svg.querySelector(`.th-sector[data-sector="${id}"]`);
    if (!g) return;
    g.classList.remove('th-flash');
    void g.getBBox();
    g.classList.add('th-flash');
  }

  async function playFront(plan, alive) {
    let moving = null;
    root.classList.add('is-playing');
    await wait(500);
    if (!alive()) return;
    // 1. our models roll forward
    if (plan.captured.length) {
      $$('.th-routed').forEach((m) => m.classList.add('is-routing'));
      const k = 1 / (V.s || 1);
      const rnd = rng(hashStr(plan.captured.join()));
      const ground = groundFor(ctx.st.sectors);
      const trails = els.svg.querySelector('#th-trails');
      const movers = [];
      for (const mv of ctx.moves || []) {
        const el = els.svg.querySelector(`[data-mv="${mv.i}"]`);
        const path = el && planRoute(mv.k, mv.from.p, mv.from.r, mv.to.p, mv.to.r, rnd, k, null, ground);
        if (!path) continue;
        const delay = { lead: 0, recon: 0, foot: 250, gun: 700, follow: 1000 }[ROLE[mv.k] || 'lead'] + rnd() * 600;
        movers.push(makeMover(el, mv.k, path, { k, sc: mv.sc, delay, allowed: ground, speed: 0.9 + rnd() * 0.25, h0: mv.from.r, h1: mv.to.r, trails, rnd }));
      }
      const cap = GEO[plan.captured[0]].anchor;
      const src = nearestFriendly(cap, ctx.pre);
      runMovers([makePlane(els.fx, src, cap, norm(sub(cap, src)), k, 'fr', 300)], alive);
      setPace(movers, 2.6);
      moving = runMovers(movers, alive);
      sfx('place');
      await wait(650);
      if (!alive()) return;
      // 2. the sector turns blue and gets stamped
      for (const id of plan.captured) {
        const l = flipSector(id, 'captured');
        const st = l && l.querySelector('.th-stamp');
        if (st) st.classList.add('is-new');
        const big = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const a = GEO[id].anchor;
        big.setAttribute('transform', `translate(${a[0]} ${a[1] - 4}) rotate(-9)`);
        big.innerHTML = '<g class="th-bigstamp"><rect x="-130" y="-34" width="260" height="68" rx="6"/><rect class="in" x="-122" y="-26" width="244" height="52" rx="4"/><text y="14">CAPTURED</text></g>';
        els.fx.appendChild(big);
        setTimeout(() => big.remove(), 2300);
      }
      sfx('stamp');
      await wait(900);
      if (!alive()) return;
      // 3. the front line is redrawn further forward
      const old = els.svg.querySelector('#th-front-old');
      if (old) old.classList.add('is-fading');
      const fr = els.svg.querySelector('#th-front');
      if (fr) {
        fr.classList.remove('th-pending');
        fr.classList.add('is-drawing');
      }
      sfx('success');
      await wait(1300);
      if (!alive()) return;
    }
    // 4. newly reachable sectors open up, with fresh advance arrows
    const fresh = [...plan.opened, ...plan.breached, ...plan.reached];
    if (fresh.length && !plan.captured.length) await showX(GEO[fresh[0]].anchor[0]);
    if (!alive()) return;
    if (fresh.length) {
      for (const id of fresh) {
        flipSector(id, ctx.st.sectors[id]);
        flash(id);
        const slot = els.svg.querySelector(`[data-contact-slot="${id}"]`);
        if (slot && plan.breached.includes(id)) {
          slot.innerHTML = contactInner(id, ctx.st.sectors);
          const c = slot.firstElementChild;
          if (c) c.classList.add('is-restoring');
        }
      }
      $$('.th-arrow.th-pending, .th-halt.th-pending').forEach((a, i) => {
        a.style.animationDelay = i * 160 + 'ms';
        a.classList.remove('th-pending');
        a.classList.add('is-new');
      });
      sfx('morse', 'K');
      const nm = (ids) => ids.map((id) => TH().byId[id].name).join(', ');
      const open = [...plan.opened, ...plan.breached].filter((id) => ctx.st.sectors[id] === 'open');
      const lost = plan.opened.filter((id) => ctx.st.sectors[id] === 'gated');
      const msgs = [];
      if (plan.breached.length) msgs.push(`Contact restored — ${nm(plan.breached)} ${plan.breached.length > 1 ? 'are' : 'is'} open to attack.`);
      else if (open.length) msgs.push(`New front: ${nm(open)} ${open.length > 1 ? 'are' : 'is'} open to attack.`);
      if (lost.length) msgs.push(`Contact lost with our units in ${nm(lost)}.`);
      if (plan.reached.length) msgs.push(`${nm(plan.reached)} ${plan.reached.length > 1 ? 'need' : 'needs'} more stars.`);
      APP().toast(msgs.join(' '));
      await wait(1500);
    }
    if (moving) await moving;
    setMini(ctx.st.sectors);
    root.classList.remove('is-playing');
  }

  async function playRaids(plan, alive) {
    for (const lvId of plan.raids) {
      const w = els.svg.querySelector(`[data-raid="${lvId}"]`);
      const sp = TH().SPECIALS.find((x) => x.level === lvId);
      if (w && sp) await showX((RAID_SPOT[sp.behind] || GEO[sp.behind].anchor)[0]);
      if (!alive()) return;
      if (!w) continue;
      w.classList.remove('th-pending');
      w.classList.add('is-dropping');
      sfx('tick');
      await wait(1500);
      if (!alive()) return;
      sfx('place');
      const name = levelName(lvId);
      APP().toast(`Special operation available${name ? ': ' + name : ''} — optional, deep behind the lines.`);
      await wait(700);
      if (!alive()) return;
      w.classList.remove('is-dropping');
    }
  }


  // The sector's force advancing objective by objective, from `from` (-1: the start line) to `to`. Each leg
  // follows that leg's plan arrow and ends deployed around the objective, which is stamped TAKEN as the
  // force reaches it. Each leg is paced (see setPace) so its lead models take about `target` seconds.
  async function playSweep(id, from, to, alive, target) {
    const sec = TH().byId[id];
    const live = () => alive() && V.zoomId === id;
    const doneUpTo = (k) => new Set([...doneSetNow()].filter((m) => !sec.missions.includes(m) || sec.missions.indexOf(m) <= k));
    await zoomTo(id, { doneSet: doneUpTo(from), unitsAt: from });
    if (!live()) return;
    await wait(300);
    if (!live()) return;
    const pg = V.pg, u = pg.u;
    const trails = els.svg.querySelector('#th-z-trails');
    const air = els.svg.querySelector('#th-z-air');
    if (air) runMovers([makePlane(air, unitSpot(pg, from).p, pg.pts[to + 1], unitSpot(pg, to).t, u, 'fr', 200)], live);
    const slots = formation(id);
    for (let k = from + 1; k <= to; k++) {
      const l = pg.lines[k];
      const Lk = l.cum[l.cum.length - 1];
      const lane = linePart(l, k === 0 ? UNIT_START * u : 0, Lk - UNIT_BACK * u);
      const lcum = cumLen(lane), L = lcum[lcum.length - 1];
      const A = unitPoses(id, pg, k - 1), B = unitPoses(id, pg, k);
      const ground = UNLOCK ? null : groundFor(ctx.st.sectors, id);
      const arrow = els.svg.querySelector(`.th-zarrow[data-i="${k}"]`);
      if (arrow) arrow.classList.add('is-advancing');
      const rnd = rng(hashStr(id + ':' + k));
      const movers = [];
      slots.forEach((sl, i) => {
        const el = els.svg.querySelector(`.th-zu[data-u="${i}"]`);
        if (!el) return;
        // each model keeps its own lane beside the arrow (tanks and jeeps swing out to the flanks)
        const via = [];
        const nW = Math.max(1, Math.round(L / (80 * u)));
        for (let j = 1; j <= nW; j++) {
          const f = j / (nW + 1);
          const m = at(lane, lcum, f * L);
          via.push(add(m.p, perp(m.t), sl.lat * u * (1 + sl.flank * Math.sin(Math.PI * f))));
        }
        const path = planRoute(sl.k, A[i].p, A[i].r, B[i].p, B[i].r, rnd, u, via, ground);
        if (path) movers.push(makeMover(el, sl.k, path, { k: u, sc: sl.sc * u, delay: sl.delay, speed: sl.speed, allowed: ground, h0: A[i].r, h1: B[i].r, trails, rnd }));
      });
      sfx('place');
      setPace(movers, target);
      await runMovers(movers, live);
      if (!live()) return;
      // objective taken: redraw the plan up to here and stamp it
      const plEl = els.svg.querySelector('#th-z-plan');
      if (plEl) plEl.innerHTML = planSvg(id, pg, doneUpTo(k));
      for (let j = from + 1; j <= k; j++) {
        const o = els.svg.querySelector(`.th-obj[data-i="${j}"]`);
        if (!o) continue;
        const s = document.createElementNS(NS, 'g');
        s.setAttribute('class', j === k ? 'th-taken' : 'th-taken static');
        s.setAttribute('transform', `translate(0 ${r1(-pg.R - 6 * u)}) rotate(-10) scale(${r1(u * 100) / 100})`);
        s.innerHTML = '<g class="th-taken-in"><rect x="-38" y="-12" width="76" height="24" rx="3"/><text y="6">TAKEN</text></g>';
        o.appendChild(s);
      }
      sfx('stamp');
      if (k < to) await wait(120);
    }
    els.panel.innerHTML = panelHTML(id);
    await wait(300);
    if (live()) sfx('morse', 'K');
  }

  function screenActive() {
    const scr = document.getElementById('screen-map');
    return !!scr && scr.classList.contains('active');
  }

  // Click or Escape during a playback: jump to its end state (seen progress is already stored).
  function skipPlayback() {
    if (!V.playing || !ctx) return false;
    V.playing = false;
    const adv = ctx.plan.advance && ctx.plan.advance.sector;
    render(ctx.opts);
    if (visible()) {
      updateLabelScale();
      setVB(homeBox());
    }
    if (adv) zoomTo(adv, { animate: false });
    if (V.victoryPhase) openFinale();
    else if (victoryPending()) {
      // skipping the last capture must not skip the victory itself: go straight to the finale
      APP().S.save.theater.victory = true;
      APP().persist();
      openFinale();
    }
    return true;
  }

  async function onShow(opts = {}) {
    if (!ctx || !els.svg || !els.svg.isConnected) render(opts);
    if (!ctx) return;
    const app = APP();
    const T = app.S.save.theater;
    updateLabelScale();
    setVB(homeBox());
    const plan = ctx.plan;
    const g = ctx.gen;
    const alive = () => g === ctx.gen && screenActive();
    if (plan.any && !UNLOCK) {
      T.seen = snapshot(ctx.st);
      app.persist();
    } else if (!T.seen && !UNLOCK) {
      T.seen = snapshot(ctx.st);
      app.persist();
    }
    if (plan.captured.includes(lastSector)) lastSector = null;
    if (plan.any && reduced()) {
      // no motion: jump straight to the end state
      render(opts);
      if (plan.advance) await zoomTo(plan.advance.sector, { animate: false });
      if (victoryPending()) {
        APP().S.save.theater.victory = true;
        APP().persist();
        return openFinale();
      }
      return maybeTour();
    }
    if (plan.any) {
      V.playing = true;
      root.classList.add('is-anim');
    }
    const done = () => {
      if (g === ctx.gen) {
        V.playing = false;
        root.classList.remove('is-anim');
      }
    };
    // capture: a final sweep through every objective of the sector, zoomed in; then back to the front
    if (plan.captured.length) {
      const cid = plan.captured[0];
      await playSweep(cid, -1, TH().byId[cid].missions.length - 1, alive, 1.1);
      if (!alive()) return done();
      await wait(350);
      if (!alive()) return done();
      await zoomOut();
      if (!alive()) return done();
    }
    if (plan.captured.length || plan.opened.length || plan.breached.length || plan.reached.length) await playFront(plan, alive);
    if (!alive()) return done();
    if (plan.raids.length) await playRaids(plan, alive);
    if (!alive()) return done();
    if (plan.advance) {
      const id = plan.advance.sector;
      const sec = TH().byId[id];
      const preDone = new Set([...plan.advance.seenDone].filter((m) => medals(m)[0]));
      const from = sectorStats(sec, preDone).last, to = sectorStats(sec).last;
      await playSweep(id, from, to, alive, to - from > 1 ? 1.2 : 1.7);
    } else if (!plan.any && lastSector && ['open', 'captured', 'gated', 'short'].includes(ctx.st.sectors[lastSector])) await zoomTo(lastSector, { animate: false });
    done();
    if (!alive()) return;
    if (victoryPending()) {
      V.playing = true;
      root.classList.add('is-anim');
      await playVictory(alive);
      if (g === ctx.gen) {
        V.playing = false;
        root.classList.remove('is-anim');
      }
      return;
    }
    maybeTour();
  }

  // ================================================================ victory
  // When the last sector falls: the camera pulls back over the whole front, flags rise over every
  // sector, flares and searchlights over High Command, the map takes a victory wash — then a full-screen
  // finale: a front page, a roll call of every protocol rebuilt, and the final rank, medals and credits.
  // It plays once (S.save.theater.victory) and can be watched again from the Victory button.
  const allCaptured = (st) => TH().SECTORS.every((s) => st.sectors[s.id] === 'captured');
  const victoryPending = () => !UNLOCK && ctx && allCaptured(ctx.st) && !APP().S.save.theater.victory;

  function fitAllBox() {
    const { W, H } = stageSize();
    const w = MW + 60;
    const h = (w * H) / W;
    return { x: -30, y: MH / 2 - h / 2, w, h };
  }

  const FLAG =
    '<path class="pole" d="M0 0V-46"/><circle class="knob" cy="-47" r="2.4"/>' +
    '<g class="cloth"><path d="M1 -45H29Q25 -38 29 -31H1Z"/><path class="star" d="M10 -41.5l1.5 3.1 3.4.4-2.5 2.3.7 3.4-3.1-1.7-3 1.7.6-3.4-2.5-2.3 3.4-.4z"/></g>';

  async function playVictory(alive) {
    const T = APP().S.save.theater;
    if (!UNLOCK) {
      T.victory = true;
      APP().persist();
    }
    V.victoryPhase = true;
    root.classList.add('is-victory');
    if (reduced()) return openFinale();
    if (V.zoomId) await zoomOut({ animate: !reduced() });
    if (!alive()) return;
    await animateVB(fitAllBox(), 1300);
    if (!alive()) return;
    const k = 1 / (V.s || 1);
    const fx = els.fx;
    // the victory wash over the whole sheet
    const wash = document.createElementNS(NS, 'rect');
    wash.setAttribute('class', 'th-wash');
    wash.setAttribute('x', 0);
    wash.setAttribute('y', 0);
    wash.setAttribute('width', MW);
    wash.setAttribute('height', MH);
    fx.appendChild(wash);
    // flags over every sector, west to east
    const order = TH().SECTORS.slice().sort((a, b) => GEO[a.id].anchor[0] - GEO[b.id].anchor[0]);
    order.forEach((sec, i) => {
      const [x, y] = GEO[sec.id].anchor;
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', `translate(${r1(x + 40 * k * 0.3)} ${r1(y - 8)}) scale(${r1(k * 0.9 * 100) / 100})`);
      g.innerHTML = `<g class="th-flag" style="animation-delay:${i * 110}ms">${FLAG}</g>`;
      fx.appendChild(g);
    });
    sfx('success');
    // every force converges on High Command: a column from each sector's command post, on our own ground
    {
      const hc = GEO.capital.anchor;
      const ground = groundFor(ctx.st.sectors);
      const rnd2 = rng(1918);
      const trails = els.svg.querySelector('#th-trails');
      const movers = [];
      const srcs = TH().SECTORS.filter((x) => x.id !== 'capital');
      srcs.forEach((sec, i) => {
        const kinds = FORCES[sec.id] || ['tank'];
        const k0 = kinds.find((q) => ROLE[q] === 'lead' || ROLE[q] === 'recon') || kinds[0];
        const a = cpPos(sec.id);
        const ang = (i / srcs.length) * Math.PI * 2;
        const b = pullIn([hc[0] + Math.cos(ang) * 230, hc[1] + 120 + Math.sin(ang) * 120], hc, ground);
        const h0 = deg(sub(hc, a)), h1 = deg(sub(hc, b));
        const path = planRoute(k0, a, h0, b, h1, rnd2, k, null, ground);
        if (!path) return;
        const el = document.createElementNS(NS, 'g');
        el.setAttribute('class', 'th-u fr');
        el.innerHTML = `<use href="#th-s-${k0}"/>`;
        fx.appendChild(el);
        movers.push(makeMover(el, k0, path, { k, sc: 0.9, delay: (GEO[sec.id].anchor[0] / MW) * 700, speed: 1, h0, h1, allowed: ground, trails, rnd: rnd2 }));
      });
      setPace(movers, 2.6);
      runMovers(movers, alive);
    }
    // searchlights and flares over High Command
    const hc = GEO.capital.anchor;
    for (let i = 0; i < 5; i++) {
      const bx = hc[0] - 520 + i * 260, by = MH - 40;
      const beam = document.createElementNS(NS, 'path');
      beam.setAttribute('class', 'th-beam');
      beam.setAttribute('d', `M${bx} ${by}L${bx - 70} ${by - 900}L${bx + 70} ${by - 900}Z`);
      beam.style.transformOrigin = `${bx}px ${by}px`;
      beam.style.animationDelay = `${-i * 0.7}s`;
      fx.appendChild(beam);
    }
    const rnd = rng(1945);
    for (let i = 0; i < 14; i++) {
      const f = document.createElementNS(NS, 'circle');
      f.setAttribute('class', 'th-flare');
      f.setAttribute('cx', r1(hc[0] - 700 + rnd() * 1400));
      f.setAttribute('cy', r1(MH - 120 - rnd() * 200));
      f.setAttribute('r', r1(10 + rnd() * 8));
      f.style.animationDelay = `${r1(rnd() * 2.6)}s`;
      fx.appendChild(f);
    }
    await wait(2600);
    if (!alive()) return;
    sfx('morse', 'WON');
    await wait(1800);
    if (!alive()) return;
    openFinale();
  }

  // ---------------------------------------------------------------- the finale overlay
  let FIN = null;
  const CREDITS = [
    ['Claude E. Shannon', 'the noisy channel and its capacity (1948)'],
    ['Richard W. Hamming', 'single-error-correcting codes (1950)'],
    ['Marcel J. E. Golay', 'the perfect Golay codes (1949)'],
    ['David A. Huffman', 'optimal prefix codes (1952)'],
    ['Irving S. Reed & Gustave Solomon', 'polynomial codes over finite fields (1960)'],
    ['W. Wesley Peterson', 'cyclic codes and the CRC (1961)'],
    ['Bose, Ray-Chaudhuri & Hocquenghem', 'BCH codes (1959–60)'],
  ];

  function halftoneMap() {
    const thin = (pts) => polyD(pts.filter((_, i) => i % 5 === 0));
    let s = `<svg viewBox="0 0 ${MW} ${MH}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs>` +
      '<pattern id="fin-dots" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="17" cy="17" r="11"/></pattern>' +
      '<pattern id="fin-dots-s" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="17" cy="17" r="5"/></pattern>' +
      '<pattern id="fin-dots-l" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="17" cy="17" r="15"/></pattern></defs>';
    s += `<rect width="${MW}" height="${MH}" fill="url(#fin-dots-s)"/>`;
    s += `<path d="${thin(PTS.sea)}" fill="url(#fin-dots-l)"/>`;
    for (const sec of TH().SECTORS) s += `<path class="fin-sec" d="${thin(PTS[sec.id])}" fill="url(#fin-dots)"/>`;
    const [x, y] = GEO.capital.anchor;
    s += `<g transform="translate(${r1(x)} ${r1(y)})"><path class="fin-star" d="M0 -120l34 70 76 10-56 52 14 76-68-38-68 38 14-76-56-52 76-10z"/></g>`;
    return s + '</svg>';
  }

  function finaleHTML() {
    const app = APP();
    const ri = app.rankInfo();
    const save = app.S.save;
    const ids = TH().allLevelIds().filter((id) => app.levelById(id));
    const done = ids.filter((id) => (save.medals[id] || [])[0]);
    const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const first = TH().SECTORS[0].name, last = TH().SECTORS.slice().sort((a, b) => GEO[b.id].anchor[0] - GEO[a.id].anchor[0])[0].name;
    // 1. the front page
    let s = '<div class="fin-stage fin-news"><div class="fin-paper">' +
      `<div class="fin-mast"><span>Final edition</span><b>The Signal Corps Gazette</b><span>One penny</span></div>` +
      `<div class="fin-dateline">${esc(date)} · Theatre of Operations · All sectors reporting</div>` +
      '<h2 class="fin-head">The War is Won</h2>' +
      '<div class="fin-sub">Enemy High Command falls — every order got through</div>' +
      `<div class="fin-cols"><div class="fin-map">${halftoneMap()}<i>Our lines at dawn: every sector held.</i></div>` +
      `<p><b>THE FRONT.</b> The last enemy transmitter fell silent at first light as our forces entered ${esc(TH().byId.capital.name.toLowerCase())}. From ${esc(first.toLowerCase())} to ${esc(last.toLowerCase())}, all ${TH().SECTORS.length} sectors of the front are now in our hands.</p>` +
      '<p><b>HOW IT WAS DONE.</b> Staff officers credit the Signal Corps. Orders that once died in the static now arrive whole: repeated, sealed with parity, guarded by Hamming\'s checks and Reed and Solomon\'s digits, framed, numbered and authenticated against the impostor.</p>' +
      `<p><b>BY THE NUMBERS.</b> ${done.length} operations completed · ${ri.stars} of ${ri.max} stars won · the officer responsible has been promoted to ${esc(ri.rank.name)}.</p></div>` +
      '</div><div class="fin-hint">Click or press Esc to continue ▸</div></div>';
    // 2. the roll call: what you rebuilt, sector by sector
    let roll = '';
    for (const sec of TH().SECTORS) {
      const titles = [sec.contact, ...sec.missions]
        .filter((id) => (save.medals[id] || [])[0] && app.levelById(id))
        .map((id) => app.levelById(id).debrief && app.levelById(id).debrief.title)
        .filter(Boolean);
      if (!titles.length) continue;
      roll += `<div class="fin-sec-h">${esc(sec.code)} · ${esc(sec.name)}</div>` + titles.map((t) => `<div class="fin-line">${esc(t)}</div>`).join('');
    }
    const raids = TH().SPECIALS.filter((sp) => (save.medals[sp.level] || [])[0] && app.levelById(sp.level));
    if (raids.length) roll += '<div class="fin-sec-h">Behind the lines</div>' + raids.map((sp) => `<div class="fin-line">${esc((app.levelById(sp.level).debrief || {}).title || app.levelById(sp.level).name)}</div>`).join('');
    const lines = (roll.match(/class="fin-/g) || []).length;
    s += `<div class="fin-stage fin-roll" hidden><h3>What you rebuilt</h3><div class="fin-roll-win"><div class="fin-roll-inner" style="--dur:${Math.max(14, Math.round(lines * 0.9))}s">${roll}</div></div>` +
      '<div class="fin-hint">Click or press Esc to continue ▸</div></div>';
    // 3. rank, medals, credits
    const counts = [0, 1, 2].map((k) => ids.filter((id) => (save.medals[id] || [])[k]).length);
    const medalsRow = [0, 1, 2]
      .map((k) => `<div class="fin-medal">${CoC.art.medal(k, counts[k] > 0)}<span>× ${counts[k]}</span></div>`)
      .join('');
    s += '<div class="fin-stage fin-end" hidden>' +
      `<div class="fin-rank">${CoC.art.CHEVRONS(Math.min(3, ri.index + 1))}<div><span>Final rank</span><b>${esc(ri.rank.name)}</b><em>${CoC.art.star(true, 18)} ${ri.stars} / ${ri.max} stars</em></div></div>` +
      `<div class="fin-medals">${medalsRow}</div>` +
      '<div class="fin-credits"><h3>Chain of Command</h3><p>A signal-corps puzzle game. The ideas you rediscovered belong to:</p><ul>' +
      CREDITS.map(([who, what]) => `<li><b>${esc(who)}</b> — ${esc(what)}</li>`).join('') +
      '</ul><p class="fin-thanks">Thank you for getting every order through.</p></div>' +
      '<div class="fin-actions"><button type="button" class="btn-ghost" data-fin="archive">Archive</button><button type="button" class="btn-stamp" data-fin="front">Return to the front</button></div></div>';
    return s;
  }

  function openFinale() {
    closeFinale();
    V.victoryPhase = false;
    V.playing = false;
    if (root) root.classList.remove('is-anim');
    const el = document.createElement('div');
    el.className = 'th-finale';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Victory');
    el.innerHTML = finaleHTML();
    root.appendChild(el);
    FIN = { el, stage: -1, timers: [] };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-fin]');
      if (b) {
        sfx('click');
        if (b.dataset.fin === 'archive') {
          closeFinale(true);
          const a = document.getElementById('btn-map-archive');
          if (a) a.click();
        } else closeFinale(true);
        return;
      }
      nextFinale();
    });
    finaleStage(0);
  }
  function finaleStage(i) {
    if (!FIN) return;
    FIN.timers.forEach(clearTimeout);
    FIN.timers = [];
    FIN.stage = i;
    FIN.el.querySelectorAll('.fin-stage').forEach((s, j) => (s.hidden = j !== i));
    const st = FIN.el.querySelectorAll('.fin-stage')[i];
    if (i === 0) {
      FIN.timers.push(setTimeout(() => sfx('stamp'), reduced() ? 0 : 1050));
      FIN.timers.push(setTimeout(() => sfx('success'), reduced() ? 0 : 1400));
    }
    if (i === 1) {
      sfx('morse', 'OK');
      const inner = st.querySelector('.fin-roll-inner');
      if (inner && !reduced()) inner.addEventListener('animationend', () => FIN && FIN.stage === 1 && FIN.timers.push(setTimeout(() => finaleStage(2), 900)), { once: true });
    }
    if (i === 2) {
      sfx('stamp');
      FIN.timers.push(setTimeout(() => sfx('success'), 300));
      const b = st.querySelector('[data-fin="front"]');
      if (b) b.focus({ preventScroll: true });
    } else st.setAttribute('tabindex', '-1'), st.focus({ preventScroll: true });
  }
  function nextFinale() {
    if (!FIN) return;
    if (FIN.stage < 2) finaleStage(FIN.stage + 1);
  }
  function closeFinale(toFront) {
    if (!FIN) return;
    FIN.timers.forEach(clearTimeout);
    FIN.el.remove();
    FIN = null;
    if (toFront && ctx) {
      render(ctx.opts);
      if (visible()) {
        updateLabelScale();
        setVB(homeBox(GEO.capital.anchor[0]));
      }
    }
  }

  // ================================================================ first-visit tour
  function maybeTour() {
    const app = APP();
    const T = app.S.save.theater;
    if (T.toured || UNLOCK || V.zoomId) return;
    T.toured = true;
    app.persist();
    const live = TH().SECTORS.find((s) => ctx.st.sectors[s.id] === 'open') || TH().SECTORS[0];
    const steps = [
      { target: els.svg.querySelector('#th-front'), title: 'The front line', text: 'The heavy serrated line is the front. Blue is ours; everything red is still held by the enemy. Our landing force is waiting offshore.' },
      { target: els.svg.querySelector(`.th-sector[data-sector="${live.id}"]`), title: `First sector: ${live.name}`, text: 'Each sector is one idea, taken as a short advance of missions. Click a sector to zoom in and see its plan of attack.' },
      { target: els.legend, title: 'Attack where the arrows point', text: 'Capture a sector by taking all its objectives. The red sectors that border it then open up — several at once, so you choose where to strike next.' },
    ].filter((s) => s.target);
    setTimeout(() => {
      if (!screenActive()) return;
      let fellBack = false;
      try {
        app.coach(steps, () => {
          if (!document.body.classList.contains('coaching') && !fellBack && !tourStarted) {
            fellBack = true;
            ownCoach(steps);
          }
        });
      } catch (e) {
        ownCoach(steps);
      }
      tourStarted = true;
    }, 500);
  }
  let tourStarted = false;

  // The shared coach (app.js) only runs on the mission screen; this is the same spotlight-and-note
  // tour for the map, drawn into the same #coach elements.
  function ownCoach(steps) {
    const coach = document.getElementById('coach');
    const hole = document.getElementById('coach-hole');
    const note = document.getElementById('coach-note');
    if (!coach || !hole || !note || !steps.length) return;
    let i = 0;
    const place = () => {
      const r = steps[i].target.getBoundingClientRect();
      const pad = 6, m = 12;
      const h = { left: Math.max(4, r.left - pad), top: Math.max(4, r.top - pad), right: Math.min(innerWidth - 4, r.right + pad), bottom: Math.min(innerHeight - 4, r.bottom + pad) };
      Object.assign(hole.style, { left: h.left + 'px', top: h.top + 'px', width: Math.max(0, h.right - h.left) + 'px', height: Math.max(0, h.bottom - h.top) + 'px' });
      const nw = note.offsetWidth, nh = note.offsetHeight;
      let left = Math.min(Math.max(m, (h.left + h.right) / 2 - nw / 2), innerWidth - nw - m);
      let top;
      if (h.bottom + m + nh < innerHeight) top = h.bottom + m;
      else if (h.top - m - nh > 0) top = h.top - m - nh;
      else if (h.right + m + nw < innerWidth) (left = h.right + m), (top = clamp(h.top, m, innerHeight - nh - m));
      else if (h.left - m - nw > 0) (left = h.left - m - nw), (top = clamp(h.top, m, innerHeight - nh - m));
      else top = innerHeight - nh - m;
      note.style.left = left + 'px';
      note.style.top = Math.max(m, top) + 'px';
    };
    const end = () => {
      coach.hidden = true;
      document.body.classList.remove('coaching');
      window.removeEventListener('resize', place);
      document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        end();
      }
    };
    const show = () => {
      const st = steps[i];
      const n = steps.length, last = i === n - 1;
      note.innerHTML =
        `<div class="coach-step">${n > 1 ? `${i + 1} of ${n}` : 'Field note'}</div><h4>${esc(st.title)}</h4><p>${esc(st.text)}</p>` +
        `<div class="coach-actions">${n > 1 && !last ? '<button type="button" class="coach-skip" data-tc="skip">Skip tour</button>' : ''}` +
        `<button type="button" class="coach-next" data-tc="next">${last ? 'Got it' : 'Next ▸'}</button></div>`;
      place();
      note.querySelectorAll('[data-tc]').forEach((b) =>
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          sfx('click');
          if (b.dataset.tc === 'skip' || last) return end();
          i++;
          show();
        })
      );
      const nx = note.querySelector('.coach-next');
      if (nx) nx.focus({ preventScroll: true });
    };
    coach.hidden = false;
    document.body.classList.add('coaching');
    window.addEventListener('resize', place);
    document.addEventListener('keydown', onKey, true);
    show();
  }

  // ================================================================ exports
  CoC.theaterUI = {
    render,
    onShow,
    zoomTo: (id) => zoomTo(id),
    zoomOut: () => zoomOut(),
    // for tests: which sectors share a border on the drawn map
    _debug: {
      borderPairs() {
        const s = new Set();
        for (const e of Object.values(EDGES)) if (e.owners.length === 2 && e.owners.every(isSector)) s.add(e.owners.slice().sort().join('-'));
        return [...s].sort();
      },
      GEO,
      PTS,
      inPoly,
      view: () => ({ ...V.vb, zoomId: V.zoomId }),
      undrawn: UNDRAWN_BORDERS,
      finale: () => (FIN ? FIN.stage : null),
      coasts() {
        const out = {};
        for (const e of Object.values(EDGES)) {
          if (e.owners.length !== 2) continue;
          const [a, b] = e.owners;
          for (const [w, o] of [[a, b], [b, a]]) if (w === 'sea' || w === 'gulf') (out[w] = out[w] || []).push(o);
        }
        return out;
      },
      // sampled route points that fall outside the ground a model was allowed to use
      routeViolations() {
        let n = 0, pts = 0;
        const bad = [];
        for (const c of CHECKS)
          for (const p of c.pts) {
            pts++;
            const r = regionAt(p);
            if (!c.allowed.has(r)) {
              n++;
              if (bad.length < 12) bad.push([c.kind, Math.round(p[0]), Math.round(p[1]), r]);
            }
          }
        return { routes: CHECKS.length, points: pts, violations: n, bad, planMs: Math.round(V.routeMs || 0) };
      },
      movers: () => (V.lastMovers || []).map((m) => ({ k: m.kind, s: Math.round(m.s / m.k), L: Math.round(m.path.L / m.k), v: Math.round(m.v / m.k), sp: +m.speed.toFixed(2), d: Math.round(m.delay), done: m.done, wait: +m.wait.toFixed(2), h: Math.round(m.h), h1: Math.round(m.h1) })),
      // for each objective k of sector id: the farthest model's distance (screen px) from the objective centre
      ends(id) {
        const pg = planGeo(id, zoomBox(id).s);
        return pg.sec.missions.map((_, k) => {
          const poses = unitPoses(id, pg, k);
          return Math.round(Math.max(...poses.map((q) => dist(q.p, pg.pts[k + 1]))) / pg.u);
        });
      },
    },
  };
})();
