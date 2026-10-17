/* Chain of Command — game shell: screens, the line, exercises, reports, archive, proving ground.
 * The theater map is theater.js; special-mission mechanics are plug-in modes in js/modes/. */
(function () {
  'use strict';
  const { engine, blocks, data, art, audio } = CoC;
  const { BLOCKS } = blocks;
  const { LEVELS, CHARACTERS, RANKS } = data;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const TRIALS = 300;
  const SAVE_KEY = 'chain-of-command.save.v1';
  const UNLOCK_ALL = new URLSearchParams(location.search).has('unlock');
  const MARKERS = '[]<>#|*~';
  const STRIP_TOOLS = ['REPEAT', 'NOT', 'IF', 'PARITY', 'CHECK', 'SEAL', 'CRC', 'FILL_ONES', 'FILL_POS', 'FILL_SQ', 'FILL_POW'];
  const READERS = ['VOTE', 'READ_NOT'];
  const ALL_DEC = [...Object.keys(BLOCKS), ...READERS];
  const TOOL_OF_ITEM = { rep: 'REPEAT', if: 'IF', par: 'PARITY', chk: 'CHECK', seal: 'SEAL', crc: 'CRC' };
  const ITEM_LABEL = { src: 'Copy', lit: 'Marker', rep: 'Repeat group', if: 'If tile', par: 'Parity tile', chk: 'Check digit', seal: 'Check-matrix seal', crc: 'Shift register' };

  // ================================================================ save
  // coach: which first-time pointers have been shown (tour, plates, vote, analyzer)
  const defaultSave = () => ({ medals: {}, best: {}, programs: {}, hints: {}, muted: false, sandbox: null, coach: {}, theater: {} });
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return Object.assign(defaultSave(), JSON.parse(raw));
    } catch (e) {
      /* private mode or blocked storage: play without saving */
    }
    return defaultSave();
  }
  function persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(S.save));
    } catch (e) {
      /* ignore */
    }
  }

  const S = {
    save: loadSave(),
    level: null,
    levelId: null,
    enc: [],
    dec: [],
    asm: [],
    anim: null,
    speed: 1,
    preview: null,
    ctxCache: null,
    editors: {},
    returnTo: 'screen-map',
    visit: {}, // per-visit UI state: tried (tested / exercised), timeUp, hintTimer
  };
  audio.setMuted(!!S.save.muted);

  const levelById = (id) => LEVELS.find((l) => l.id === id);
  const campaignIds = () => CoC.theater.allLevelIds().filter((id) => levelById(id));
  const totalStars = () => campaignIds().reduce((a, id) => a + (S.save.medals[id] || []).filter(Boolean).length, 0);
  // RANKS thresholds are written for a 75-star campaign; scale them to the real campaign size.
  const rankFor = (stars, max) => RANKS.filter((r) => stars >= Math.round((r.stars / 75) * max)).pop();
  function rankInfo() {
    const max = campaignIds().length * 3;
    const stars = totalStars();
    const rank = rankFor(stars, max);
    return { stars, max, rank, index: RANKS.indexOf(rank) };
  }
  const isDone = (id) => !!(S.save.medals[id] && S.save.medals[id][0]);
  const theaterStatus = () => CoC.theater.status(S.save, UNLOCK_ALL);
  const isUnlocked = (id) => {
    const st = theaterStatus().missions[id];
    return st === 'open' || st === 'done';
  };

  // ================================================================ screens & modal
  function show(id) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
    window.scrollTo(0, 0);
  }

  let modalOnClose = null;
  function openModal(html, cls = '', onClose = null) {
    modalOnClose = onClose;
    const card = $('#modal-card');
    card.className = 'modal-card ' + cls;
    card.innerHTML = html;
    $('#modal').hidden = false;
    requestAnimationFrame(() => $('#modal').classList.add('open'));
    const focus = card.querySelector('[data-autofocus]') || card.querySelector('button');
    if (focus) focus.focus({ preventScroll: true });
    return card;
  }
  function closeModal() {
    $('#modal').classList.remove('open');
    $('#modal').hidden = true;
    const cb = modalOnClose;
    modalOnClose = null;
    if (cb) cb();
  }
  $('#modal').addEventListener('pointerdown', (e) => {
    if (e.target.id === 'modal' && !$('#modal-card').classList.contains('sticky')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal').hidden && !$('#modal-card').classList.contains('sticky')) closeModal();
  });

  let toastTimer = null;
  function toast(msg, kind = '') {
    const t = $('#toast');
    t.className = 'toast ' + kind;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3800);
  }

  // ================================================================ sound toggle
  const SPEAKER_ON = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" fill="none"/></svg>';
  const SPEAKER_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none"/></svg>';
  function refreshSound() {
    $$('.sound-toggle').forEach((b) => {
      b.innerHTML = audio.isMuted() ? SPEAKER_OFF : SPEAKER_ON;
      b.title = audio.isMuted() ? 'Sound off' : 'Sound on';
    });
  }
  $$('.sound-toggle').forEach((b) =>
    b.addEventListener('click', () => {
      audio.setMuted(!audio.isMuted());
      S.save.muted = audio.isMuted();
      persist();
      refreshSound();
      audio.sfx.click();
    })
  );

  // ================================================================ shared renderers
  function compressSet(set) {
    const chars = [...set];
    const out = [];
    for (let i = 0; i < chars.length; ) {
      let j = i;
      while (j + 1 < chars.length && chars[j + 1].charCodeAt(0) === chars[j].charCodeAt(0) + 1) j++;
      if (j - i >= 3) out.push(`${chars[i]}–${chars[j]}`);
      else for (let k = i; k <= j; k++) out.push(chars[k]);
      i = j + 1;
    }
    return '{' + out.join(',') + '}';
  }

  function renderTemplate(level, container, { legend = true } = {}) {
    const tpl = engine.templateOf(level);
    let html = '<div class="tpl-row">';
    tpl.cells.forEach((c) => {
      if (c.lit !== undefined) html += `<span class="tpl-cell lit" title="Always ‘${esc(c.lit)}’">${esc(c.lit)}</span>`;
      else {
        const v = tpl.vars[c.v];
        html += `<span class="tpl-cell var c-${v.color}" data-v="${c.v}" title="One of ${esc(compressSet(v.set))}">${v.sym}</span>`;
      }
    });
    html += '</div>';
    if (legend) {
      html += '<div class="tpl-legend">';
      tpl.vars.forEach((v, i) => {
        html += `<span class="tpl-key" data-v="${i}"><span class="tpl-cell var mini c-${v.color}">${v.sym}</span>∈ ${esc(compressSet(v.set))}</span>`;
      });
      html += '</div>';
    }
    container.innerHTML = html;
    $$('[data-v]', container).forEach((cell) => {
      const on = (flag) => $$(`[data-v="${cell.dataset.v}"]`, container).forEach((x) => x.classList.toggle('hl', flag));
      cell.addEventListener('mouseenter', () => on(true));
      cell.addEventListener('mouseleave', () => on(false));
    });
  }

  function tileClass(ch) {
    if (ch === '?') return 'tile smudged';
    if (S.binary && (ch === '0' || ch === '1')) return 'tile lamp ' + (ch === '1' ? 'lit' : 'dark');
    if (!S.alpha.includes(ch)) return 'tile mark';
    return 'tile';
  }
  const tile = (ch, extra = '') => `<span class="${tileClass(ch)} ${extra}"><b>${esc(ch)}</b></span>`;
  const tiles = (s, extra = '') => [...s].map((c) => tile(c, extra)).join('');

  // The live tape (#tape) keeps persistent tiles (js/tape.js): relay steps act on the actual slips.
  function tapeCtl() {
    const el = $('#tape');
    if (!el._tape) el._tape = CoC.tape.create(el, { cls: tileClass, alpha: () => S.alpha, speed: () => (S.anim ? S.anim.speed : 1) });
    return el._tape;
  }

  function setTape(before, after) {
    tapeCtl().show(before, after);
  }

  // ================================================================ title
  function buildTitle() {
    const morse = '-.-. --- -.-.';
    $('#title-morse').innerHTML = [...morse]
      .map((c, i) => (c === ' ' ? '<i class="gap"></i>' : `<i class="${c === '.' ? 'dot' : 'dash'}" style="animation-delay:${i * 0.12}s"></i>`))
      .join('');
    const any = Object.keys(S.save.medals).length > 0;
    $('#btn-start').textContent = any ? 'Return to the front' : 'Report for duty';
  }
  $('#btn-start').addEventListener('click', () => {
    audio.sfx.morse('K');
    goToTheater();
  });
  $('#btn-title-archive').addEventListener('click', () => openArchive('screen-title'));
  $('#btn-title-sandbox').addEventListener('click', () => openSandbox('screen-title'));
  $('#btn-reset').addEventListener('click', () => {
    openModal(
      `<div class="dossier small"><h3>Burn the records?</h3><p>All medals, protocols and archive entries will be erased.</p>
      <div class="modal-actions"><button class="btn-ghost" data-act="no" type="button">Keep them</button><button class="btn-stamp danger" data-act="yes" type="button">Erase everything</button></div></div>`
    );
    $('#modal-card [data-act="no"]').onclick = closeModal;
    $('#modal-card [data-act="yes"]').onclick = () => {
      S.save = defaultSave();
      persist();
      closeModal();
      buildTitle();
      toast('Records burned. Welcome, recruit.');
    };
  });

  // ================================================================ theater (map)
  // The map itself — sectors, units, zoom, capture animations — lives in theater.js (CoC.theaterUI).
  // `opts.justWon` is the level just completed, so the theater can play advance / capture animations.
  function buildMap(opts = {}) {
    renderRankBadge();
    if (CoC.theaterUI) CoC.theaterUI.render(opts);
  }

  function renderRankBadge() {
    const r = rankInfo();
    const el = $('#rank-badge');
    if (el) el.innerHTML = `${art.CHEVRONS(Math.min(3, r.index + 1))}<div><b>${r.rank.name}</b><span>${art.star(true, 13)} ${r.stars} / ${r.max}</span></div>`;
  }

  function goToTheater(opts = {}) {
    stopAnim();
    buildMap(opts);
    show('screen-map');
    if (CoC.theaterUI && CoC.theaterUI.onShow) CoC.theaterUI.onShow(opts);
  }

  $('#btn-map-menu').addEventListener('click', () => (buildTitle(), show('screen-title')));
  $('#btn-map-archive').addEventListener('click', () => openArchive('screen-map'));
  $('#btn-map-sandbox').addEventListener('click', () => openSandbox('screen-map'));

  // ================================================================ mission setup
  function symbolsFor(level) {
    const set = new Set(engine.alphabetOf(level));
    for (const m of level.chain) for (const c of (m.set || '') + (m.to || '')) set.add(c);
    if (level.chain.some((m) => m.kind === 'smudge')) set.add('?');
    if (level.dec.includes('BETWEEN')) '[]'.split('').forEach((c) => set.add(c));
    const rank = (c) => (/[A-Z]/.test(c) ? 0 : /[0-9]/.test(c) ? 1 : 2);
    return [...set].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1)).join('');
  }

  // Equipment this level issues that no completed level has issued yet (the progression is non-linear).
  function newOpsFor(lv) {
    if (!lv || lv.sandbox) return new Set();
    const seen = new Set();
    for (const l of LEVELS) if (l.id !== lv.id && isDone(l.id)) for (const op of [...(l.enc || []), ...(l.dec || [])]) seen.add(op);
    return new Set([...(lv.enc || []), ...(lv.dec || [])].filter((op) => !seen.has(op)));
  }

  // Field plates the level issues (readers live in the assembly row, not the plate crate).
  function allowedPlates(level) {
    return level.dec.filter((op) => BLOCKS[op] && (op !== 'SAY_AGAIN' || level.arq));
  }
  function allowedReaders(level) {
    return new Set(level.dec.filter((op) => READERS.includes(op)).map((op) => (op === 'READ_NOT' ? 'NOT' : op)));
  }

  function prune(list, allowed) {
    return list
      .filter((b) => allowed.includes(b.op))
      .map((b) => {
        if (b.then) {
          b.then = prune(b.then, allowed);
          b.else = prune(b.else, allowed);
        }
        return b;
      });
  }

  // Drop strip items whose tool this level hasn't issued (e.g. a strip carried over from the proving ground).
  function pruneStrip(items, tools) {
    return items
      .filter((it) => !TOOL_OF_ITEM[it.t] || tools.includes(TOOL_OF_ITEM[it.t]))
      .map((it) => {
        if (it.t === 'src' && it.not && !tools.includes('NOT')) it.not = false;
        if (it.items) it.items = pruneStrip(it.items, tools);
        if (it.then) {
          it.then = pruneStrip(it.then, tools);
          it.else = pruneStrip(it.else, tools);
        }
        return it;
      });
  }

  // How far the assembly row may read: the longest of the clean transmission and the cleaned signal.
  // A few spare places past the end: lines that slip symbols in deliver signals LONGER than what was sent, and
  // readers must be able to reach where a copy can end up (e.g. a vote over #5,6,7 for a 6-symbol strip).
  const ASM_SLACK = 3;
  const asmMaxPos = () => Math.min(64, Math.max(4, S.preview?.cleaned?.length || 0, S.preview?.out?.length || 0) + ASM_SLACK);
  let asmShownMax = null;

  function makeEditors() {
    S.editors.enc = new CoC.StripEditor({
      tray: $('#enc-tray'),
      board: $('#enc-strip'),
      getLevel: () => S.level,
      getStrip: () => S.enc,
      allowedTools: () => new Set(S.level.enc),
      newTools: () => newOpsFor(S.level),
      markers: () => [...MARKERS].filter((c) => !S.alpha.includes(c)).join(''),
      onChange: onProgramChange,
    });
    S.editors.dec = new CoC.Editor({
      root: $('#proto-dec'),
      side: 'dec',
      getProgram: () => S.dec,
      level: () => S.level,
      allowed: () => allowedPlates(S.level),
      newOps: () => newOpsFor(S.level),
      symbols: () => symbolsFor(S.level),
      markers: () => [...MARKERS].filter((c) => !S.alpha.includes(c)).join(''),
      positions: () => Math.min(24, Math.max(8, S.preview?.out?.length || 8)),
      onChange: onProgramChange,
    });
    S.editors.asm = new CoC.AssemblyEditor({
      root: $('#dec-asm'),
      getLevel: () => S.level,
      getAsm: () => S.asm,
      allowedReaders: () => allowedReaders(S.level),
      maxPos: asmMaxPos,
      sentLen: () => S.preview?.out?.length || 0,
      onChange: onProgramChange,
    });
  }

  function resetProtocol(side) {
    if (side === 'enc') S.enc.splice(0, S.enc.length, ...engine.defaultStrip(S.level));
    else {
      S.dec.splice(0, S.dec.length);
      S.asm.splice(0, S.asm.length, ...engine.defaultAsm(S.level));
    }
    S.editors.enc.render();
    S.editors.dec.render();
    S.editors.asm.render();
    audio.sfx.remove();
    onProgramChange();
  }
  $$('[data-reset]').forEach((b) => b.addEventListener('click', () => resetProtocol(b.dataset.reset)));

  // Open a campaign level by id (the theater calls this when a mission marker is clicked).
  function openLevel(id) {
    const lv = levelById(id);
    if (!lv) return toast(`Operation ${id} is not available yet.`, 'bad');
    startMission(lv);
  }

  // Short tag for the top bar: sector code + position in its advance, or the special-op kind.
  function opTag(lv) {
    if (lv.sandbox) return 'PG';
    const kind = CoC.theater.kindOf(lv.id);
    if (kind === 'contact') return 'CONTACT';
    if (kind === 'raid') return 'RAID';
    const sec = CoC.theater.sectorFor(lv.id);
    return sec ? `${sec.code} ${sec.missions.indexOf(lv.id) + 1}/${sec.missions.length}` : `OP ${lv.id}`;
  }

  function startMission(lv) {
    stopAnim();
    unmountMode();
    S.level = lv;
    S.levelId = lv.id;
    if (modeOf(lv)) return startModeMission(lv);
    setConsoleText();
    S.alpha = engine.alphabetOf(lv);
    S.binary = [...S.alpha].every((c) => c === '0' || c === '1');
    S.ctxCache = null;
    const saved = lv.sandbox ? S.save.sandbox?.programs : S.save.programs[lv.id];
    const nVars = engine.templateOf(lv).vars.length;
    try {
      S.enc = saved?.enc ? pruneStrip(CoC.strip.reviveStrip(saved.enc), lv.enc) : engine.defaultStrip(lv);
      S.enc.forEach(function check(it) {
        if ((it.t === 'src' || it.t === 'if') && !(it.v < nVars)) throw new Error('stale strip');
        if (it.vars && it.vars.some((v) => !(v < nVars))) throw new Error('stale strip');
        (it.items || []).concat(it.then || [], it.else || []).forEach(check);
      });
    } catch (e) {
      S.enc = engine.defaultStrip(lv);
    }
    S.dec = prune(blocks.reviveProgram(saved?.dec), allowedPlates(lv));
    S.asm = Array.isArray(saved?.asm) && saved.asm.length === nVars ? JSON.parse(JSON.stringify(saved.asm)) : engine.defaultAsm(lv);
    // Routing levels: the route plotted on the map (possibly unfinished) is saved with the programs.
    S.route = lv.network && saved?.route && CoC.routing && CoC.routing.isPrefix(lv, saved.route) ? saved.route.slice() : null;

    $('#op-id').textContent = opTag(lv);
    $('#op-name').textContent = lv.name;
    clearTimeout(S.visit.hintTimer);
    S.visit = { tried: false, timeUp: false };
    if (lv.hints.length) S.visit.hintTimer = setTimeout(() => ((S.visit.timeUp = true), updateHintButton()), 60000);
    updateHintButton();
    // Only show the field-work bay on levels that issue plates.
    const hasPlates = allowedPlates(lv).length > 0;
    $('#field-work').hidden = !hasPlates;
    $('#asm-label .stage-n').hidden = !hasPlates;
    $('#btn-test').classList.toggle('nudge', !isDone(lv.id));
    $('#btn-exercise').classList.remove('nudge');
    renderTemplate(lv, $('#mission-template'));
    renderObjectives();
    renderLine();
    resetConsole();
    updatePreview();
    S.editors.enc.render();
    S.editors.dec.render();
    S.editors.asm.render();
    show('screen-mission');
    openBriefing(true);
  }

  const signed = (n) => (n < 0 ? '−' + Math.abs(n) : String(n));

  // One calm chip: what counts as success, plus the three medal stars (pars in the tooltip).
  function renderObjectives() {
    const lv = S.level;
    const m = S.save.medals[lv.id] || [];
    const best = S.save.best[lv.id];
    if (lv.goal) {
      const tip = (lv.medalCaptions || []).map((c) => `★ ${c}`).join('\n');
      $('#objectives').innerHTML =
        `<span class="obj goal"><i>Goal</i><b>${esc(lv.goal)}</b></span>` +
        `<span class="obj medals" title="${esc(tip)}" aria-label="${esc(tip)}">${[0, 1, 2].map((k) => art.star(!!m[k], 14)).join('')}</span>`;
      return;
    }
    const deliver = lv.target >= 1 ? 'deliver every order' : `deliver ${Math.round(lv.target * 100)}% of orders`;
    const extra =
      (lv.budget === 0 ? 'no extra symbols' : `≤ ${lv.budget} extra symbol${lv.budget === 1 ? '' : 's'}`) +
      (lv.delayBudget !== undefined ? ` · ≤ ${lv.delayBudget} h` : '');
    const goalTip =
      `Deliver at least ${Math.round(lv.target * 100)}% of orders correctly, with on average ${lv.budget} or fewer extra symbols per order${lv.arq ? ' (re-sends count in full)' : ''}.` +
      (lv.delayBudget !== undefined ? ` Average delay per order: ${lv.delayBudget} hours or less.` : '');
    const medalTip =
      `Medals:\n★ Complete the operation\n★ Efficient: ≤ ${signed(lv.par.overhead)} extra symbols\n★ Lean: ≤ ${lv.par.blocks} pieces of equipment` +
      (best ? `\n\nYour best: ${best.overhead.toFixed(2)} extra · ${best.blocks} equipment` : '');
    $('#objectives').innerHTML =
      `<span class="obj goal" title="${esc(goalTip)}"><i>Goal</i><b>${deliver} · ${extra}</b></span>` +
      (lv.sandbox ? '' : `<span class="obj medals" title="${esc(medalTip)}" aria-label="${esc(medalTip)}">${[0, 1, 2].map((k) => art.star(!!m[k], 14)).join('')}</span>`);
  }

  function updateHintButton() {
    const lv = S.level;
    const opened = (S.save.hints[lv.id] || 0) > 0;
    $('#btn-hint').hidden = !lv.hints.length || !(S.visit.tried || S.visit.timeUp || opened);
  }
  function markTried() {
    if (S.visit.tried) return;
    S.visit.tried = true;
    updateHintButton();
  }

  function stationHTML(kind, idx, m) {
    if (kind === 'hq') return `<div class="station hq" data-st="0">${art.HQ}<div class="st-name">HQ</div><div class="st-trait">Command post</div></div>`;
    if (kind === 'field') return `<div class="station field" data-st="${idx}">${art.FIELD}<div class="st-name">FIELD UNIT</div><div class="st-trait">Front line</div></div>`;
    const ch = CHARACTERS[m.kind];
    const name = m.name || ch.name;
    const chance = m.kind === 'pass' ? '' : `<span class="st-chance">${Math.round(m.p * 100)}%</span>`;
    return `<div class="station relay" data-st="${idx}" title="${esc(name)}: ${esc(ch.trait(m))}${m.kind === 'pass' ? '' : `, ${Math.round(m.p * 100)}% of orders`}">${art.patch(ch.icon)}${chance}<div class="st-name">${esc(name)}</div><div class="st-trait">${esc(ch.trait(m))}</div></div>`;
  }

  function renderLine() {
    const lv = S.level;
    const wire = (i) => `<div class="wire" data-w="${i}"><div class="wire-line"></div><div class="pulse">${art.ENVELOPE}</div></div>`;
    const net = !!lv.network && !!CoC.routing;
    const hidden = !!lv.hiddenLine && !!CoC.routing;
    $('.line-panel').classList.toggle('is-net', net);
    $('.line-panel').classList.toggle('is-hidden', hidden);
    if (net) {
      // A field map: the player plots the route; its relays are the line.
      CoC.routing.renderNet($('#line'), lv, () => S.route, (route) => {
        S.route = route;
        audio.sfx.click();
        onProgramChange();
      });
    } else if (hidden) {
      // A black box: one unknown station and a clipboard of intercepted traffic.
      $('#line').innerHTML = CoC.routing.hiddenLineHTML(lv, stationHTML('hq', 0), (i) => stationHTML('field', i), wire);
    } else {
      const chain = lv.chain;
      let html = stationHTML('hq', 0);
      chain.forEach((m, i) => (html += wire(i) + stationHTML('relay', i + 1, m)));
      html += wire(chain.length) + stationHTML('field', chain.length + 1);
      $('#line').innerHTML = html;
    }
    $('#tape').innerHTML = '';
    $('#tape-label').textContent = 'Standing by';
    $('#tape-note').className = 'tape-note';
    $('#tape-note').textContent = 'Press TEST TRANSMISSION to watch an order travel.';
    $('#stamp-zone').innerHTML = '';
  }

  // ================================================================ live preview
  let previewTimer = null;
  function onProgramChange() {
    savePrograms();
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 120);
    $('#exercise-summary').classList.add('stale');
  }

  function savePrograms() {
    const p = { enc: JSON.parse(JSON.stringify(S.enc)), dec: blocks.cloneProgram(S.dec), asm: JSON.parse(JSON.stringify(S.asm)) };
    if (S.level.network && S.route) p.route = S.route.slice();
    if (S.level.sandbox) S.save.sandbox = Object.assign(S.save.sandbox || {}, { programs: p });
    else S.save.programs[S.level.id] = p;
    persist();
  }

  const programKey = (list) => JSON.stringify(list, (k, v) => (k === 'id' ? undefined : v));
  // Like programKey, but insensitive to key order (for "is this still the default?" checks).
  const canonKey = (x) =>
    JSON.stringify(x, (k, v) =>
      k === 'id' ? undefined : v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v
    );

  // ↺ Reset only appears once a side differs from where the level started.
  function updateResetButtons() {
    const lv = S.level;
    const encDirty = canonKey(S.enc) !== canonKey(engine.defaultStrip(lv));
    const decDirty = S.dec.length > 0 || canonKey(S.asm) !== canonKey(engine.defaultAsm(lv));
    $('[data-reset="enc"]').hidden = !encDirty;
    $('[data-reset="dec"]').hidden = !decDirty;
  }
  const prog = () => ({ enc: S.enc, dec: S.dec, asm: S.asm, route: S.route });

  function getCtx() {
    const key = programKey(S.enc) + '|' + /REPAIR|IF_VALID/.test(programKey(S.dec));
    if (!S.ctxCache || S.ctxCache.key !== key) S.ctxCache = { key, ctx: engine.makeContext(S.level, S.enc, S.dec) };
    return S.ctxCache.ctx;
  }

  function updatePreview() {
    const lv = S.level;
    const pv = engine.encoderPreview(lv, S.enc);
    S.preview = pv;
    updateResetButtons();
    $('#enc-cap-top').innerHTML = `<span class="cap-label">Sample order</span><span class="cap-tiles">${tiles(pv.msg)}</span>`;
    if (pv.error) {
      $('#enc-cap-bottom').innerHTML = `<span class="cap-label warn">${esc(pv.error)}</span>`;
      updateAnalyzer(); // the analyzer reports the jam too, instead of showing the last good d
      return;
    }
    const extra = pv.out.length - pv.msg.length;
    $('#enc-cap-bottom').innerHTML = `<span class="cap-label">Transmit ▸</span><span class="cap-tiles">${tiles(pv.out) || '<em>nothing</em>'}</span><span class="cost ${extra > lv.budget ? 'over' : ''}" title="Extra symbols on the wire for this order">${extra >= 0 ? '+' : '−'}${Math.abs(extra)}</span>`;
    // What the field holds after its plates on an undisturbed line: only sizes the assembly row's position pickers.
    try {
      pv.cleaned = engine.runDecoder(lv, S.dec, S.asm, pv.out, getCtx()).cleaned;
    } catch (e) {
      pv.cleaned = pv.out;
    }
    updateAnalyzer();
    // The assembly steppers bake in their upper bound: redraw them whenever the message length changes.
    if (S.editors.asm && asmMaxPos() !== asmShownMax) {
      asmShownMax = asmMaxPos();
      S.editors.asm.render();
    }
  }

  // ================================================================ analyzer
  function updateAnalyzer() {
    const lv = S.level;
    const box = $('#analyzer');
    const show = [...lv.dec].some((op) => op === 'REPAIR' || op === 'IF_VALID');
    box.hidden = !show;
    if (!show) return;
    const a = engine.analyze(lv, S.enc);
    S.analysis = a;
    let html = `<h3>Code analyzer<button class="an-manual" type="button" title="Open the field manual: how the analyzer works">${BOOK_ICON}<span>Manual</span></button></h3>`;
    if (a.error) html += `<p class="warn">${esc(a.error)}</p>`;
    else if (a.tooBig) html += `<p class="warn">${a.count.toLocaleString()} possible orders — too many for the codebook machine.</p>`;
    else {
      const d = a.d;
      html += `<div class="an-row"><span>Valid transmissions</span><b>${a.words}</b></div><div class="an-row"><span>Length</span><b>${a.length}</b></div>`;
      if (a.collisions) html += '<div class="an-big bad">d = 0</div><p class="warn">Two different orders produce the same transmission — the field can never tell them apart.</p>';
      else if (d === Infinity) html += '<div class="an-big">d = ∞</div><p>Only one possible order.</p>';
      else {
        const fix = Math.floor((d - 1) / 2);
        html += `<div class="an-big ${d >= 3 ? 'good' : ''}">d ${a.sampled ? '≈' : '='} ${d}</div>`;
        html += `<ul class="an-list"><li><b>${fix}</b> garbled symbol${fix === 1 ? '' : 's'} repairable</li><li><b>${d - 1}</b> detectable</li><li><b>${d - 1}</b> smudge${d - 1 === 1 ? '' : 's'} fillable</li></ul>`;
        if (a.burstSafe !== undefined) html += `<div class="an-row"><span>Bursts repairable up to</span><b>${a.burstSafe || 'none'}</b></div>`;
        if (a.burstCatch !== undefined) html += `<div class="an-row"><span>Bursts always caught up to</span><b>${a.burstCatch || 'none'}</b></div>`;
        if (a.deletionSafe !== undefined) html += `<div class="an-row"><span>Survives one lost symbol</span><b class="${a.deletionSafe ? 'ok' : 'bad'}">${a.deletionSafe ? 'YES' : 'NO'}</b></div>`;
        if (a.pair) html += `<div class="an-pair"><span>Closest pair</span><div class="mini-tiles">${tiles(a.pair[0])}</div><div class="mini-tiles">${tiles(a.pair[1])}</div></div>`;
      }
    }
    // Two readouts: the distance figures (above) and the code's matrices (G, H and the column arrows).
    S.linear = linearCode(lv, S.enc);
    const tabs = `<div class="an-tabs" role="tablist">${[['d', 'Distance'], ['m', 'Matrices']]
      .map(([k, t]) => `<button type="button" role="tab" data-an="${k}" aria-selected="${anTab === k}" class="${anTab === k ? 'on' : ''}">${t}</button>`)
      .join('')}</div>`;
    const head = html.slice(0, html.indexOf('</h3>') + 5);
    box.innerHTML = head + tabs + (anTab === 'm' ? matrixViewHTML(S.linear, 'dark') : html.slice(head.length));
    box.querySelector('.an-manual').addEventListener('click', () => openAnalyzerManual(S.analysis));
    box.querySelectorAll('[data-an]').forEach((b) =>
      b.addEventListener('click', () => {
        if (anTab === b.dataset.an) return;
        anTab = b.dataset.an;
        audio.sfx.click();
        updateAnalyzer();
      })
    );
  }

  // ---------------------------------------------------------------- the matrix view (linear codes)
  // When every sent symbol is a fixed weighted sum of the order's digits over one modulus m, the strip is a
  // linear code: G (generator: rows = order symbols, columns = sent symbols) and H (checks: one row per
  // equation every valid transmission obeys). Column j of H is the fingerprint a garble at #j leaves on the
  // checks; two columns that are multiples of each other can leave the same fingerprint.
  let anTab = 'd';
  const modm = (a, m) => ((a % m) + m) % m;
  const symVal = (c) => (c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : c === 'X' ? 10 : 0);

  function linearCode(lv, enc) {
    let tpl;
    try {
      tpl = engine.templateOf(lv);
    } catch (e) {
      return { why: e.message };
    }
    const k = tpl.vars.length;
    const items = JSON.parse(JSON.stringify(enc));
    for (const it of items) CoC.strip.normaliseItem(it, k);
    let a = 0;
    let b = items.length;
    while (a < b && items[a].t === 'lit') a++;
    while (b > a && items[b - 1].t === 'lit') b--;
    const cols = [];
    let why = null;
    let inst = 0;
    const walk = (list) => {
      for (const it of list) {
        if (why) return;
        if (it.t === 'src') {
          if (it.not) why = 'a ¬ badge swaps symbols for their partners, which is not arithmetic';
          else cols.push({ kind: 'src', v: it.v });
        } else if (it.t === 'lit') why = `the fixed marker “${it.c}” sits inside the code`;
        else if (it.t === 'if') why = 'an IF tile sends different things for different orders';
        else if (it.t === 'rep') for (let r = 0; r < Math.max(1, it.n); r++) walk(it.items || []);
        else if (it.t === 'par') cols.push({ kind: 'par', it });
        else if (it.t === 'crc') {
          // a shift register appends deg g remainder lamps; linear over mod 2 (filled in from unit orders below)
          const deg = (engine.crcRun(it.g, '').rem || '').length;
          for (let b = 0; b < deg; b++) cols.push({ kind: 'crc', it, b });
        }
        else if (it.t === 'chk') cols.push({ kind: 'chk', it });
        else if (it.t === 'seal') {
          const id = ++inst;
          it.rows.forEach((_, c) => cols.push({ kind: 'seal', it, c, inst: id }));
        }
      }
    };
    walk(items.slice(a, b));
    if (why) return { why: `Not a linear code: ${why}.` };
    if (!cols.length) return { why: 'Nothing is sent yet.' };
    const mods = [...new Set(cols.map((c) => (c.kind === 'par' || c.kind === 'crc' ? 2 : c.kind === 'src' ? 0 : c.it.mod)).filter(Boolean))].sort((x, y) => x - y);
    if (mods.length > 1)
      return {
        why: `Not linear over a single modulus: this strip counts ${mods.map((m) => (m === 2 ? 'mod 2 (parity lamps)' : 'mod ' + m)).join(' and ')}. The matrices need every check to do its sums the same way.`,
      };
    const binary = tpl.vars.every((v) => [...v.set].every((c) => c === '0' || c === '1'));
    if (!tpl.vars.every((v) => [...v.set].every((c) => /[0-9X]/.test(c))))
      return { why: 'The order holds letters, not numbers: the matrices only describe codes on digits and lamps.' };
    const m = mods.length ? mods[0] : binary ? 2 : 11;
    if (m === 2 && !binary) return { why: 'Parity lamps count 1 as lit and every other digit as dark: on digits that is not arithmetic.' };
    const n = cols.length;
    const top = Math.max(0, ...tpl.vars.flatMap((v) => [...v.set].map(symVal)));
    // G: how each sent symbol is made from the order's digits
    const G = Array.from({ length: k }, () => new Array(n).fill(0));
    const sealCoef = new Map();
    for (let j = 0; j < n; j++) {
      const c = cols[j];
      if (c.kind === 'src') G[c.v][j] = 1;
      else if (c.kind === 'par') for (const v of c.it.vars) G[v][j] = modm(G[v][j] + 1, 2);
      else if (c.kind === 'chk') for (let v = 0; v < k; v++) G[v][j] = modm(c.it.w[v] || 0, m);
      else if (c.kind === 'crc') continue; // filled in from unit orders after this loop
      else {
        if (!sealCoef.has(c.it)) {
          try {
            sealCoef.set(c.it, tpl.vars.map((_, v) => engine.solveSeal(c.it.rows, m, tpl.vars.map((__, u) => (u === v ? '1' : '0')))));
          } catch (e) {
            return { why: 'A seal is jammed: fix its rows first, then the matrices can be drawn.' };
          }
        }
        for (let v = 0; v < k; v++) G[v][j] = symVal(sealCoef.get(c.it)[v][c.c]);
      }
    }
    // Shift-register lamps depend on everything sent before them; being linear over mod 2, their columns are read
    // off the real strip run on each unit order (one lamp lit, the rest dark).
    if (cols.some((c) => c.kind === 'crc')) {
      for (let v = 0; v < k; v++) {
        const unit = tpl.cells.map((c) => (c.lit !== undefined ? c.lit : c.v === v ? '1' : '0')).join('');
        let sent;
        try {
          sent = engine.runEncoder(lv, items.slice(a, b), unit).out;
        } catch (e) {
          return { why: e.message };
        }
        cols.forEach((c, j) => c.kind === 'crc' && (G[v][j] = sent[j] === '1' ? 1 : 0));
      }
    }
    const res = { m, k, n, cols, G, tpl, top };
    // H in systematic form: the first plain copy of each order symbol is its "information" position
    const info = tpl.vars.map((_, v) => cols.findIndex((c) => c.kind === 'src' && c.v === v));
    if (info.some((i) => i < 0)) {
      res.Hwhy = 'Some order symbol never travels as itself, so there is no check matrix of the simple kind.';
      return res;
    }
    const isInfo = new Set(info);
    const H = [];
    const firstInst = new Map();
    for (let j = 0; j < n; j++) {
      if (isInfo.has(j)) continue;
      const c = cols[j];
      if (c.kind === 'seal' && !firstInst.has(c.it)) {
        // the player's own rows, over the order symbols and this seal's digits
        firstInst.set(c.it, c.inst);
        const at = [];
        cols.forEach((x, jj) => x.kind === 'seal' && x.inst === c.inst && (at[x.c] = jj));
        for (const row of c.it.rows) {
          const h = new Array(n).fill(0);
          for (let v = 0; v < k; v++) h[info[v]] = modm(h[info[v]] + row[v], m);
          at.forEach((jj, cc) => (h[jj] = modm(h[jj] + row[k + cc], m)));
          H.push(h);
        }
        continue;
      }
      if (c.kind === 'seal' && firstInst.get(c.it) === c.inst) continue;
      // sent symbol j = Σ G[v][j]·(order symbol v), i.e. Σ G[v][j]·x_v − x_j ≡ 0: the row holds the weights at the
      // information positions and −1 at j. That is H = [Pᵀ | −I] — the textbook [−Pᵀ | I] times −1, the same
      // equations — chosen so each data column of H is exactly that symbol's weights in the checks.
      const h = new Array(n).fill(0);
      h[j] = modm(-1, m);
      for (let v = 0; v < k; v++) h[info[v]] = modm(h[info[v]] + G[v][j], m);
      H.push(h);
    }
    res.H = H;
    res.info = info;
    // fingerprints: invisible columns, and pairs of columns that can leave the same fingerprint
    const R = H.length;
    const col = (j) => H.map((r) => r[j]);
    const isZero = (vec) => vec.every((x) => !x);
    const scale = (vec, e) => vec.map((x) => modm(x * e, m));
    const same = (u, v) => u.every((x, i) => x === v[i]);
    res.invisible = [];
    const dead = new Set();
    for (let j = 0; j < n; j++) {
      const h = col(j);
      if (isZero(h)) {
        res.invisible.push({ j, e: 0 });
        dead.add(j);
        continue;
      }
      for (let e = 2; e < m; e++)
        if (isZero(scale(h, e))) {
          res.invisible.push({ j, e, h });
          break;
        }
    }
    res.clashes = [];
    if (R >= 1)
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          if (dead.has(i) || dead.has(j)) continue;
          const hi = col(i);
          const hj = col(j);
          let hit = null;
          for (let e = 1; e < m && !hit; e++) if (same(scale(hi, e), hj)) hit = { i, j, lam: e, of: i };
          for (let e = 1; e < m && !hit; e++) if (same(scale(hj, e), hi)) hit = { i, j, lam: e, of: j };
          for (let e1 = 1; e1 < m && !hit; e1++)
            for (let e2 = 1; e2 < m && !hit; e2++) if (!isZero(scale(hi, e1)) && same(scale(hi, e1), scale(hj, e2))) hit = { i, j, e1, e2 };
          if (hit) res.clashes.push(hit);
        }
    res.bad = new Set([...dead, ...res.invisible.map((x) => x.j), ...res.clashes.flatMap((c) => [c.i, c.j])]);
    return res;
  }

  // header glyph for sent symbol j: the order symbol it copies, Σ / P for checks, S1… for seal digits
  function colHead(L, j) {
    const c = L.cols[j];
    let g;
    if (c.kind === 'src') {
      const x = L.tpl.vars[c.v];
      g = `<span class="an-glyph c-${x.color}">${esc(x.sym)}</span>`;
    } else if (c.kind === 'seal') g = `<span class="an-glyph seal">S${c.c + 1}</span>`;
    else g = `<span class="an-glyph chk">${c.kind === 'par' ? 'P' : c.kind === 'crc' ? 'R' + (c.b + 1) : 'Σ'}</span>`;
    return `<th class="${L.bad && L.bad.has(j) ? 'clash' : ''}">${g}<small>#${j + 1}</small></th>`;
  }

  function matTable(L, M, rowHead) {
    let h = `<table class="an-mat"><thead><tr><th></th>${L.cols.map((_, j) => colHead(L, j)).join('')}</tr></thead><tbody>`;
    M.forEach((row, r) => {
      h += `<tr><th>${rowHead(r)}</th>${row.map((x, j) => `<td class="${x ? '' : 'z'}${L.bad && L.bad.has(j) ? ' clash' : ''}">${x}</td>`).join('')}</tr>`;
    });
    return h + '</tbody></table>';
  }

  // Two check rows: each column of H is an arrow (row-1 entry, row-2 entry) on the m×m plane.
  function planeSVG(L, theme) {
    const m = L.m;
    const S = 224;
    const P = 22;
    const u = (S - 2 * P) / Math.max(1, m - 1);
    const X = (a) => P + a * u;
    const Y = (b) => S - P - b * u;
    const id = `an-arr-${theme}`;
    let g = `<svg class="an-plane ${theme}" viewBox="0 0 ${S} ${S}" role="img" aria-label="Columns of the check matrix as arrows">`;
    g += `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" class="ok"/></marker>`;
    g += `<marker id="${id}-bad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" class="bad"/></marker></defs>`;
    for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) g += `<circle cx="${X(a)}" cy="${Y(b)}" r="1.3" class="dot"/>`;
    g += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(m - 1) + 8}" y2="${Y(0)}" class="axis"/><line x1="${X(0)}" y1="${Y(0)}" x2="${X(0)}" y2="${Y(m - 1) - 8}" class="axis"/>`;
    g += `<text x="${X(m - 1) + 8}" y="${Y(0) + 15}" class="lbl" text-anchor="end">check 1 →</text><text x="${X(0) - 2}" y="${Y(m - 1) - 11}" class="lbl">↑ check 2</text>`;
    const groups = new Map();
    for (let j = 0; j < L.n; j++) {
      const key = L.H[0][j] + ',' + L.H[1][j];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(j);
    }
    let tags = '';
    for (const [key, js] of groups) {
      const [a, b] = key.split(',').map(Number);
      const bad = js.some((j) => L.bad.has(j));
      const label = js.map((j) => '#' + (j + 1)).join(' ');
      if (!a && !b) {
        g += `<circle cx="${X(0)}" cy="${Y(0)}" r="5" class="zero"/>`;
        tags += `<text x="${X(0) + 7}" y="${Y(0) - 6}" class="tag bad">${label}</text>`;
        continue;
      }
      g += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(a)}" y2="${Y(b)}" class="arrow${bad ? ' bad' : ''}" marker-end="url(#${id}${bad ? '-bad' : ''})"/>`;
      const right = a >= m - 3;
      tags += `<text x="${X(a) + (right ? -5 : 5)}" y="${Y(b) - 5}" class="tag${bad ? ' bad' : ''}" text-anchor="${right ? 'end' : 'start'}">${label}</text>`;
    }
    return g + tags + '</svg>';
  }

  function clashLines(L) {
    const out = [];
    const p = (j) => '#' + (j + 1);
    for (const x of L.invisible) {
      if (!x.e) out.push(`An error in ${p(x.j)} is invisible: no check row looks at it.`);
      else
        out.push(
          `mod ${L.m}: a garble of ${x.e} in ${p(x.j)} is invisible — ${x.e} × (${x.h.join(', ')}) = (${x.h.map((v) => x.e * v).join(', ')}) ≡ 0. A prime modulus never does this.`
        );
    }
    const R = L.H.length;
    if (R === 1 && L.clashes.length) out.push('One check row: every column is a multiple of every other, so the field can tell <i>that</i> a symbol was garbled, never <i>which</i>.');
    else {
      // one line per group of clashing columns (parallel arrows)
      const root = new Map();
      const find = (j) => (root.has(j) && root.get(j) !== j ? find(root.get(j)) : j);
      for (const c of L.clashes) {
        const a = find(c.i);
        const b = find(c.j);
        if (a !== b) root.set(b, a);
      }
      const groups = new Map();
      for (const c of L.clashes)
        for (const j of [c.i, c.j]) {
          const r = find(j);
          if (!groups.has(r)) groups.set(r, { js: new Set(), ex: c });
          groups.get(r).js.add(j);
        }
      const how = (c) => (c.lam !== undefined ? `${p(c.of === c.i ? c.j : c.i)} = ${c.lam} × ${p(c.of)}` : `${c.e1} × ${p(c.i)} ≡ ${c.e2} × ${p(c.j)}`);
      for (const g of groups.values()) {
        const js = [...g.js].sort((x, y) => x - y).map(p);
        const list = js.slice(0, -1).join(', ') + ' and ' + js[js.length - 1];
        out.push(`Errors in ${list} look the same to the field: their columns are multiples of each other (${js.length > 2 ? 'e.g. ' : ''}${how(g.ex)}, mod ${L.m}).`);
      }
    }
    if (L.top >= L.m && L.m > 2)
      out.push(`The digits run up to ${L.top} but the modulus is ${L.m}: a garble of exactly ${L.m} (say 0 → ${L.m}) changes nothing any check can see.`);
    return out;
  }

  function matrixViewHTML(L, theme) {
    if (!L || L.why) return `<p class="an-note">${esc((L && L.why) || 'No code to analyse.')}</p>`;
    const sym = (v) => {
      const x = L.tpl.vars[v];
      return `<span class="an-glyph c-${x.color}">${esc(x.sym)}</span>`;
    };
    let h = `<p class="an-sub">Linear code mod <b>${L.m}</b> · ${L.k} order symbol${L.k === 1 ? '' : 's'} → ${L.n} sent</p>`;
    h += '<div class="an-mlabel">G · generator <small>row = order symbol, column = sent symbol</small></div>';
    h += `<div class="an-mwrap">${matTable(L, L.G, sym)}</div>`;
    if (!L.H) return h + `<p class="an-note">${esc(L.Hwhy)}</p>`;
    if (!L.H.length) return h + '<p class="an-note">No checks: every sent symbol is a plain copy of a different order symbol. Nothing to check against.</p>';
    h += `<div class="an-mlabel">H · checks <small>each row adds up to 0 (mod ${L.m}) on every valid transmission</small></div>`;
    h += `<div class="an-mwrap">${matTable(L, L.H, (r) => `<span class="an-rowname">${r + 1}</span>`)}</div>`;
    if (L.H.length === 2) h += `<div class="an-mlabel">Columns of H as arrows <small>a garble at #j shifts the two checks along arrow #j</small></div>${planeSVG(L, theme)}`;
    const lines = clashLines(L);
    if (lines.length) h += `<ul class="an-clash">${lines.map((t) => `<li>${t}</li>`).join('')}</ul>`;
    else if (L.H.length >= 2)
      h += '<p class="an-good">✓ No two columns are multiples of each other and none is zero: every single garble leaves its own fingerprint, so REPAIR can tell where it is.</p>';
    else h += '<p class="an-good">✓ Every column is non-zero: any single garble is noticed.</p>';
    return h;
  }

  // ---------------------------------------------------------------- the analyzer's field manual
  // An old field manual, leafed through page by page. Examples use the player's own code where possible.
  const BOOK_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5C5.5 4 8.5 4 12 6c3.5-2 6.5-2 9-.5V19c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 6v13.5" stroke="currentColor" stroke-width="1.8"/></svg>';

  function manualPair(pair) {
    const [x, y] = pair;
    const row = (w, other) =>
      [...w].map((c, i) => `<span class="${tileClass(c)} ${c !== other[i] ? 'diff' : ''}"><b>${esc(c)}</b></span>`).join('');
    const marks = [...x].map((c, i) => `<i class="${c !== y[i] ? 'on' : ''}">${c !== y[i] ? '✕' : ''}</i>`).join('');
    return `<div class="fm-pair"><div class="fm-tiles">${row(x, y)}</div><div class="fm-tiles">${row(y, x)}</div><div class="fm-marks">${marks}</div></div>`;
  }

  function manualPages(a) {
    const lv = S.level;
    const ok = a && !a.error && !a.tooBig && !a.collisions && a.d !== Infinity;
    const d = ok ? a.d : 3;
    const fix = Math.floor((d - 1) / 2);
    const pairHTML = ok && a.pair && a.pair[0].length === a.pair[1].length ? manualPair(a.pair) : manualPair(['1011010', '1001011']);
    const yours = ok ? 'your code' : 'an example code';
    const pages = [
      {
        title: 'What the analyzer listens to',
        body: `<p>The Codebook machine does not guess. It takes your HQ strip and runs it, quietly, on <b>every order Command could ever send</b> — ${ok ? `${a.count.toLocaleString()} of them on this line` : 'every one of them'} — and writes down each transmission that comes out.</p>
          <p>Those are the <b>valid transmissions</b>. Anything else that reaches the front is not an order at all: it is an order that has been damaged on the way.</p>
          <p class="fm-note">The figure <i>Valid transmissions</i> counts them; <i>Length</i> is how many symbols each one puts on the wire.</p>`,
      },
      {
        title: 'Distance',
        body: `<p>Lay two transmissions side by side and count the places where they differ. That count is their <b>distance</b>: the number of symbols the line would have to damage to turn one into the other.</p>
          ${pairHTML}
          <p>These two are the <b>closest pair</b> in ${yours}: they differ in <b>${d}</b> place${d === 1 ? '' : 's'} (marked ✕). The analyzer's big number, <b>d</b>, is exactly this — the smallest distance between any two valid transmissions.</p>`,
      },
      {
        title: 'What d buys you',
        body: `<p>Picture every valid transmission as a post on a road, and each damaged symbol as one step away from it. Two posts are at least <b>d</b> steps apart.</p>
          <div class="fm-road" aria-hidden="true"><span class="post">A</span>${'<span class="step"></span>'.repeat(Math.max(1, d - 1))}<span class="post">B</span></div>
          <ul class="fm-rules">
            <li><b>Repair</b> — a signal damaged in up to <b>⌊(d−1)/2⌋ = ${fix}</b> place${fix === 1 ? '' : 's'} is still nearer to its own post than to any other, so REPAIR can walk it home.</li>
            <li><b>Detect</b> — up to <b>d−1 = ${d - 1}</b> damaged places can never reach another post, so the field can always tell something is wrong and ask HQ to SAY AGAIN.</li>
            <li><b>Fill smudges</b> — a smudge (?) shows <i>where</i> the damage is, so it costs half as much: up to <b>d−1 = ${d - 1}</b> smudges can be filled.</li>
            <li><b>Mixed</b> — e smudges plus t garbles are safe while e + 2t &lt; d.</li>
          </ul>`,
      },
      {
        title: 'Raising d',
        body: `<p>The closest pair is the weakest spot in the code: the line needs only <b>${d}</b> hit${d === 1 ? '' : 's'} there to cause trouble. To raise d, give that pair <b>more places where they differ</b>.</p>
          <p>Copies, parity lamps and check digits all do this — each one is another place where two different orders tend to disagree. A good seal watches the symbols where the closest pair still agrees; a careless one adds a symbol that changes nothing.</p>
          <p class="fm-note">Every extra symbol costs airtime. The craft is to raise d as far as the line demands, and no further.</p>`,
      },
      ...matrixManualPages(),
      {
        title: 'Bursts, slips and the fine print',
        body: `${a && a.burstSafe !== undefined ? `<p><b>Bursts repairable up to</b> — the longest run of neighbouring symbols that can be shredded at once and still be repaired with BURST. Spreading each order's information out (interleaving) lengthens it.</p>` : ''}
          ${a && a.deletionSafe !== undefined ? `<p><b>Survives one lost symbol</b> — YES when no two valid transmissions can be made identical by dropping one symbol from each: then EDIT repair always knows what went missing.</p>` : ''}
          <p><b>d = 0</b> means two different orders produce the <i>same</i> transmission: no field unit can ever tell them apart.</p>
          <p><b>d ≈</b> means there were too many transmissions to compare every pair, so the machine checked a large sample; the true d is rarely lower.</p>
          <p><b>REPAIR</b> only acts when exactly one valid transmission is nearest and within its radius. A tie, or anything farther, is passed on unchanged — so a repair can never invent a wrong order out of a coin toss.</p>`,
      },
    ];
    void lv;
    return pages;
  }

  // Two chapters on check digits as arithmetic: weights and the modulus; then G, H and the column arrows.
  // They use the player's own check tile and code when there is one, a standard example otherwise.
  function matrixManualPages() {
    const lv = S.level;
    let tpl;
    try {
      tpl = engine.templateOf(lv);
    } catch (e) {
      return [];
    }
    const k = tpl.vars.length;
    const flat = [];
    (function walk(list) {
      for (const it of list || []) {
        flat.push(it);
        walk(it.items);
        walk(it.then);
        walk(it.else);
      }
    })(S.enc);
    const chk0 = flat.find((it) => it.t === 'chk');
    const chk = chk0 ? CoC.strip.normaliseItem(JSON.parse(JSON.stringify(chk0)), k) : null;
    const digits = tpl.vars.length > 0 && tpl.vars.every((v) => [...v.set].every((c) => /[0-9X]/.test(c)));
    let w, m, syms, vals, yours;
    if (chk && digits && chk.w.some(Boolean)) {
      w = chk.w;
      m = chk.mod;
      syms = tpl.vars.map((v) => v.sym);
      vals = S.preview && S.preview.msg ? engine.valuesOf(lv, S.preview.msg) : syms.map(() => '0');
      yours = true;
    } else {
      w = [1, 2, 3, 4];
      m = 11;
      syms = ['■', '▲', '●', '◆'];
      vals = ['4', '0', '7', '1'];
      yours = false;
    }
    const used = w.map((x, v) => v).filter((v) => w[v]);
    const sum = used.reduce((t, v) => t + w[v] * symVal(vals[v]), 0);
    const terms = used.map((v) => `${w[v]}·${symVal(vals[v])}`).join(' + ');
    const v = used.find((u) => w[u] > 1) ?? used[0];
    const d0 = symVal(vals[v]);
    const d1 = (d0 + 3) % 10;
    const e = d1 - d0;
    const move = w[v] * e;
    const r = modm(move, m);
    const top = Math.max(0, ...tpl.vars.flatMap((x) => [...x.set].map(symVal)));
    const isPrime = (p) => p > 1 && [...Array(p).keys()].slice(2).every((q) => p % q);
    let need = top + 1;
    while (!isPrime(need)) need++;
    const chap1 = {
      title: 'Weights and the modulus',
      body: `<p>A check digit is a sum with a <b>weight</b> on every digit, cut down to its <b>remainder</b> after dividing by the <b>modulus</b> m. ${yours ? 'Your check tile' : 'A typical tile'} weighs ${used.map((u) => `${esc(syms[u])} by ${w[u]}`).join(', ')}, mod ${m}:</p>
        <div class="fm-sum">${terms} = ${sum} → ${sum} mod ${m} = ${modm(sum, m)}</div>
        <p>Now let the line garble ${esc(syms[v])} from ${d0} to ${d1} — a change of ${e > 0 ? '+' : '−'}${Math.abs(e)}. The sum moves by <b>weight × change</b>:</p>
        <div class="fm-sum">${w[v]} × ${e < 0 ? `(${e})` : e} = ${move} ≡ <span class="${r ? 'ok' : 'bad'}">${r}</span> (mod ${m})</div>
        <p>${r ? 'Not 0 — the check digit no longer fits, and the field notices.' : '0! The check digit still fits: this garble slips through.'} A garble slips past only when weight × change is a multiple of m.</p>
        <p><b>Why a prime.</b> With m = 4, a weight of 2 meets a change of 2 (1 → 3):</p><div class="fm-sum">2 × 2 = 4 ≡ <span class="bad">0</span> (mod 4) — invisible</div><p>With a prime m (5, 7, 11) a product is a multiple of m only when one factor already is, and no weight you keep and no real garble is.</p>
        <p><b>And bigger than any change.</b> A digit can change by up to ${top} here; if m divides the change, every weight misses it. So the modulus must be a prime above ${top}: ${need === 11 ? '<b>11</b>, the smallest one — which is why the remainder 10 is written X' : `on the dial, <b>${[5, 7, 11].filter((q) => q >= need).join(', ').replace(/, (\d+)$/, ' or $1')}</b>`}.</p>`,
    };
    // chapter 2: G, H and the arrows — the player's code if it is linear, else the classic SUM + W pair
    let L = S.linear;
    let mine = !!(L && !L.why && L.H && L.H.length >= 2);
    if (!mine) {
      const ex = { format: ['0123456789', '0123456789', '0123456789', '0123456789'] };
      L = linearCode(ex, engine.parseStrip(ex, '■ ▲ ● ◆ C11:1,1,1,1 C11:1,2,3,4'));
    }
    const lines = clashLines(L);
    const verdict = lines.length
      ? `<ul class="an-clash">${lines.map((t) => `<li>${t}</li>`).join('')}</ul>`
      : '<p class="an-good">✓ Every column non-zero, no two parallel: one garble can always be located.</p>';
    const chap2 = {
      title: 'Matrices, and the arrows',
      body: `<p>Write each sent symbol as a column of weights — how much of each order digit goes into it — and you have the <b>generator G</b>: one row per order symbol, one column per sent symbol. A plain copy is a column with a single 1; a check digit's column holds its weights.</p>
        <p>Every valid transmission also obeys equations: the <b>check matrix H</b>, one row per equation, each row adding up to 0 (mod m). A check digit c = w₁x₁ + … + wₖxₖ gives the row <i>w₁ … wₖ, −1 under c</i>. (Times −1 it says the same; textbooks write H = [−Pᵀ | I].) A seal's rows are the ones you wrote.</p>
        <p><b>The arrows.</b> Garble sent symbol #j by e and every check row is off by e × (its entry in column j). Column j of H is the <i>fingerprint</i> of trouble at #j — the field only ever sees fingerprints. If two columns are multiples of each other — parallel arrows — a garble at one can leave exactly the fingerprint of a garble at the other, and REPAIR cannot know which symbol to mend.</p>
        <p>That is the secret of weights 1, 1, 1, 1 with 1, 2, 3, 4: the columns (1,1), (1,2), (1,3), (1,4) all point different ways. Two plain sums give (1,1) four times: one direction, four suspects. Squares beside a sum fail late: mod 11, 5² = 25 ≡ 3 ≡ 36 = 6².</p>
        <div class="fm-mat"><div class="fm-mat-h"><p class="an-sub">${mine ? 'Your code' : 'Example: SUM and W·i on four digits'} — H, mod ${L.m}</p><div class="an-mwrap">${matTable(L, L.H, (q) => `<span class="an-rowname">${q + 1}</span>`)}</div>${verdict}</div>${L.H.length === 2 ? planeSVG(L, 'paper') : ''}</div>`,
    };
    return [chap1, chap2];
  }

  function openAnalyzerManual(a) {
    const pages = manualPages(a);
    let i = 0;
    const card = openModal(
      `<div class="field-manual">
        <div class="fm-cover"><span>FM 24-7</span><b>The Code Analyzer</b><i>Signal Corps · restricted</i></div>
        <div class="fm-sheet" aria-live="polite"></div>
        <div class="fm-nav">
          <button class="btn-ghost" type="button" data-fm="prev">◂ Previous</button>
          <span class="fm-folio"></span>
          <button class="btn-ghost" type="button" data-fm="next">Next ▸</button>
        </div>
        <button class="btn-link fm-close" type="button" data-fm="close">Close the manual</button>
      </div>`,
      'manual-card'
    );
    const sheet = card.querySelector('.fm-sheet');
    const render = (dir) => {
      const pg = pages[i];
      sheet.className = 'fm-sheet' + (dir ? ` turn-${dir}` : '');
      sheet.innerHTML = `<div class="fm-chapter">Chapter ${i + 1}</div><h3>${pg.title}</h3>${pg.body}`;
      card.querySelector('.fm-folio').textContent = `${i + 1} / ${pages.length}`;
      card.querySelector('[data-fm="prev"]').disabled = i === 0;
      card.querySelector('[data-fm="next"]').textContent = i === pages.length - 1 ? 'Close ▸' : 'Next ▸';
    };
    const go = (step) => {
      if (i + step >= pages.length) return closeModal();
      if (i + step < 0) return;
      i += step;
      audio.sfx.tick();
      render(step > 0 ? 'next' : 'prev');
    };
    card.querySelector('[data-fm="prev"]').onclick = () => go(-1);
    card.querySelector('[data-fm="next"]').onclick = () => go(1);
    card.querySelector('[data-fm="close"]').onclick = closeModal;
    card.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    });
    render();
  }

  // ================================================================ test transmission (animated)
  function stopAnim() {
    if (S.anim) S.anim.cancelled = true;
    S.anim = null;
    $$('.station').forEach((s) => s.classList.remove('active', 'hit'));
    if (CoC.routing) CoC.routing.clearAnim();
    if (S.editors.enc) {
      S.editors.enc.clearHighlight();
      S.editors.dec.clearHighlight();
      S.editors.asm.highlight(false);
    }
    $('#screen-mission').classList.remove('animating');
  }

  async function playTrial(trial) {
    stopAnim();
    const token = { cancelled: false, speed: S.speed };
    S.anim = token;
    $('#screen-mission').classList.add('animating');
    // On stacked layouts the line may be off screen (e.g. replaying from the log): bring it into view.
    $('.line-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const tpl = engine.templateOf(S.level);
    const encLabel = (st) => {
      const found = CoC.strip.find(S.enc, st.id);
      const it = found && found.item;
      if (it && it.t === 'src' && tpl.vars[it.v]) return `Copy ${it.not ? '¬' : ''}${tpl.vars[it.v].sym}`;
      if (it && it.t === 'lit') return `Marker ${it.c}`;
      return ITEM_LABEL[st.t] || 'Tile';
    };
    const wait = async (ms) => {
      await sleep(ms / token.speed);
      if (token.cancelled) throw new Error('cancelled');
    };
    const lv = S.level;
    const stations = $$('#line .station');
    const wires = $$('#line .wire');
    // Stops along the line: 0 = HQ, 1..n = relays, last = the front. Routing levels walk the trial's route on
    // the map; hidden lines have a single unknown stop whose relays never show themselves.
    const netView = lv.network && CoC.routing ? CoC.routing.netView($('#line'), lv, trial.route, token) : null;
    const relays = lv.network ? (trial.route ? engine.routeInfo(lv, trial.route).chain : []) : lv.chain;
    const hops = (at) => {
      if (!lv.hiddenLine) return at.chan;
      const before = at.chan.length ? at.chan[0].before : trial.sent;
      const changed = before !== at.recv;
      return [{ before, after: at.recv, note: changed ? 'Something happened in the dark.' : null, dark: true }];
    };
    const lastStop = netView ? netView.last : stations.length - 1;
    const activate = (i, hit = false) => {
      if (netView) return netView.activate(i, hit);
      stations.forEach((s, k) => s.classList.toggle('active', k === i));
      if (hit) {
        stations[i].classList.remove('hit');
        void stations[i].offsetWidth;
        stations[i].classList.add('hit');
      }
    };
    const label = (t) => ($('#tape-label').textContent = t);
    const note = (t, cls = '') => {
      const n = $('#tape-note');
      n.className = 'tape-note ' + cls;
      n.textContent = t;
    };
    const travel = async (i, back = false) => {
      if (netView) {
        await netView.travel(i, back);
        if (token.cancelled) throw new Error('cancelled');
        return;
      }
      const p = wires[i].querySelector('.pulse');
      const dur = (back ? 260 : 560) / token.speed;
      p.classList.add('moving');
      const a = p.animate(back ? [{ left: '100%' }, { left: '0%' }] : [{ left: '0%' }, { left: '100%' }], { duration: dur, easing: 'ease-in-out' });
      await a.finished.catch(() => {});
      p.classList.remove('moving');
      if (token.cancelled) throw new Error('cancelled');
    };
    const sfx = (name, ...args) => token.speed < 8 && audio.sfx[name](...args);

    try {
      $('#stamp-zone').innerHTML = '';
      activate(0);
      label('Order from Command');
      note(`Command wants ${trial.msg} delivered.`);
      setTape(null, trial.msg);
      sfx('tick');
      await wait(800);
      label('Building the transmission');
      note('HQ lays out the strip, tile by tile.');
      // the order rises above the tape; every strip item is acted out from the engine's trace (step.fx)
      const tapeOpts = { speed: () => token.speed, alive: () => !token.cancelled, tpl };
      const tapeStep = async (p) => {
        await p;
        if (token.cancelled) throw new Error('cancelled');
      };
      await tapeStep(tapeCtl().liftOrder(tapeOpts));
      for (const st of trial.enc) {
        S.editors.enc.highlight(st.id);
        label(encLabel(st));
        note(st.piece ? `+ ${st.piece}` : 'adds nothing');
        sfx('tick');
        await tapeStep(tapeCtl().encode(st, tapeOpts));
        await wait(st.t === 'src' ? 50 : st.piece.length > 3 ? 260 : 160);
      }
      S.editors.enc.clearHighlight();
      label('Transmitting');
      note(`${trial.sent.length} symbols on the wire (+${trial.sent.length - trial.msg.length}).`);
      await tapeStep(tapeCtl().clearStage(tapeOpts));
      setTape(null, trial.sent);
      sfx('morse', 'K');
      await wait(500);

      for (let a = 0; a < trial.attempts.length; a++) {
        const at = trial.attempts[a];
        if (a > 0) {
          activate(0);
          label(`Re-sending (attempt ${a + 1})`);
          note('HQ repeats the whole transmission.', 'warn');
          setTape(null, trial.sent);
          sfx('morse', 'R');
          await wait(700);
        }
        const steps = hops(at);
        for (let i = 0; i < steps.length; i++) {
          await travel(i);
          const step = steps[i];
          if (step.dark) {
            // Whatever is out there stays out of sight: no names, no notes, no diff until the front.
            activate(i + 1, !!step.note);
            label('The unknown line');
            note(step.note || 'Nothing seemed to happen in the dark.', step.note ? 'warn' : '');
            if (step.note) sfx('hit');
            await wait(step.note ? 900 : 500);
            continue;
          }
          const m = relays[i];
          const who = m.name || CHARACTERS[m.kind].name;
          activate(i + 1, !!step.note);
          label(who);
          if (step.note) {
            note(`${step.note}`, 'bad');
            sfx('hit');
            // act out exactly what this relay did to the slips (engine step.fx), then let it sink in
            await tapeStep(tapeCtl().relay(step, tapeOpts));
            await wait(320);
          } else {
            note('Passed it on untouched.');
            tapeCtl().relay(step, tapeOpts);
            await wait(420);
          }
        }
        await travel(steps.length);
        activate(lastStop);
        label('Received at the front');
        note(at.recv === trial.sent ? 'Arrived exactly as sent.' : 'Arrived damaged.', at.recv === trial.sent ? '' : 'bad');
        setTape(lv.hiddenLine && at.recv !== trial.sent ? trial.sent : null, at.recv);
        sfx('tick');
        await wait(750);
        for (const st of at.dec) {
          if (st.op === 'ASSEMBLE') {
            S.editors.dec.clearHighlight();
            S.editors.asm.highlight(true);
            CoC.editorUtil.scrollWithin($('#dec-asm'));
            label('Assemble the order');
            note(`Read the order out of ${st.before || '(nothing)'}`);
            sfx('tick');
            await tapeStep(tapeCtl().assemble(st, tapeOpts));
            await wait(350);
            S.editors.asm.highlight(false);
            continue;
          }
          S.editors.dec.highlight(st.id, st.branch);
          if (st.op === 'SAY_AGAIN') {
            label('SAY AGAIN!');
            note('Field radios HQ for a re-send.', 'warn');
            $('#stamp-zone').innerHTML = '<div class="stamp again">Say again</div>';
            sfx('again');
            await wait(900);
            $('#stamp-zone').innerHTML = '';
            break;
          }
          label(BLOCKS[st.op].title + (st.branch ? ` → ${st.branch.toUpperCase()}` : ''));
          if (st.branch) note(`Checked ${st.before || '(nothing)'}: ${st.branch.toUpperCase()}`);
          else note(`${st.before} → ${st.after || '(nothing)'}`);
          sfx('tick');
          await tapeStep(tapeCtl().plate(st, tapeOpts));
          await wait(300);
        }
        S.editors.dec.clearHighlight();
        if (at.sayAgain && a < trial.attempts.length - 1) {
          for (let w = steps.length; w >= 0; w--) await travel(w, true);
        }
      }

      const ok = trial.ok;
      label(ok ? 'Order delivered' : trial.delivered === null ? 'Gave up' : 'Wrong order delivered');
      note(
        trial.delivered === null
          ? `No usable order after ${trial.attempts.length} attempts.`
          : ok
          ? `Command sent ${trial.msg}, the front received ${trial.delivered}.`
          : `Command sent ${trial.msg}, the front acted on ${trial.delivered || '(nothing)'}.`,
        ok ? 'good' : 'bad'
      );
      setTape(null, trial.delivered ?? '');
      $('#stamp-zone').innerHTML = `<div class="stamp ${ok ? 'ok' : 'bad'}">${ok ? 'Delivered' : 'Garbled'}</div>`;
      sfx('stamp');
      setTimeout(() => sfx(ok ? 'success' : 'fail'), 180);
      await wait(400);
    } catch (e) {
      if (e.message !== 'cancelled') throw e;
      return;
    }
    if (S.anim === token) {
      S.anim = null;
      $('#screen-mission').classList.remove('animating');
      stations.forEach((s) => s.classList.remove('active'));
      if (netView) CoC.routing.clearAnim();
      // One obvious next step: after a good test, the exercise button asks to be pressed.
      if (trial.ok && !$('#btn-exercise').disabled) $('#btn-exercise').classList.add('nudge');
    }
  }

  $('#btn-test').addEventListener('click', () => {
    $('#btn-test').classList.remove('nudge');
    markTried();
    const mode = modeOf(S.level);
    if (mode) {
      if (mode.test) Promise.resolve(mode.test(modeApi())).catch((e) => toast(e.message, 'bad'));
      return;
    }
    let trial;
    try {
      trial = engine.singleTrial(S.level, prog());
    } catch (e) {
      toast(e.message, 'bad');
      return;
    }
    playTrial(trial);
  });
  $$('#anim-controls [data-speed]').forEach((b) =>
    b.addEventListener('click', () => {
      S.speed = +b.dataset.speed;
      if (S.anim) S.anim.speed = S.speed;
      $$('#anim-controls [data-speed]').forEach((x) => x.classList.toggle('on', x === b));
    })
  );
  $('#anim-controls [data-speed="1"]').classList.add('on');
  $('#btn-skip').addEventListener('click', () => S.anim && (S.anim.speed = 40));

  // ================================================================ gauges
  function gaugeSVG(id, title) {
    return (
      `<svg viewBox="0 0 120 74" class="gauge-svg"><path class="g-track" d="M10 64 A50 50 0 0 1 110 64"/>` +
      `<path class="g-zone" id="${id}-zone" d=""/><g class="g-ticks">${[...Array(11)]
        .map((_, i) => {
          const a = Math.PI * (1 - i / 10);
          const r1 = i % 5 ? 44 : 41;
          return `<line x1="${60 + Math.cos(a) * r1}" y1="${64 - Math.sin(a) * r1}" x2="${60 + Math.cos(a) * 48}" y2="${64 - Math.sin(a) * 48}"/>`;
        })
        .join('')}</g>` +
      `<g class="g-needle" id="${id}-needle" style="transform:rotate(-90deg)"><path d="M60 64 L58 62 L60 22 L62 62Z"/></g><circle cx="60" cy="64" r="4.5" class="g-hub"/></svg>` +
      `<div class="g-title">${title}</div><div class="g-value" id="${id}-value">—</div>`
    );
  }
  function arc(f0, f1, r = 50) {
    const a0 = Math.PI * (1 - f0);
    const a1 = Math.PI * (1 - f1);
    return `M${60 + Math.cos(a0) * r} ${64 - Math.sin(a0) * r} A${r} ${r} 0 0 1 ${60 + Math.cos(a1) * r} ${64 - Math.sin(a1) * r}`;
  }
  function setGauge(id, frac, text, cls) {
    const f = Math.max(0, Math.min(1, frac));
    $(`#${id}-needle`).style.transform = `rotate(${-90 + f * 180}deg)`;
    const v = $(`#${id}-value`);
    v.textContent = text;
    v.className = 'g-value ' + (cls || '');
  }
  // accuracy dial spans 50%..100%; bandwidth dial spans 0..2×budget
  const accFrac = (acc) => (acc - 0.5) / 0.5;
  const bwMax = () => Math.max(2, S.level.budget * 2);

  function resetConsole() {
    const lv = S.level;
    const mode = modeOf(lv);
    const cfg = mode && mode.gauges ? mode.gauges(lv) : null; // [{title, zone: [f0, f1]}, …]
    $('#gauge-acc').innerHTML = gaugeSVG('gacc', cfg ? cfg[0].title : 'Orders delivered');
    $('#gauge-bw').innerHTML = gaugeSVG('gbw', cfg ? cfg[1].title : 'Avg extra symbols');
    $('#gacc-zone').setAttribute('d', cfg ? arc(cfg[0].zone[0], cfg[0].zone[1], 50) : arc(accFrac(lv.target), 1, 50));
    $('#gbw-zone').setAttribute('d', cfg ? arc(cfg[1].zone[0], cfg[1].zone[1], 50) : arc(0, Math.min(1, lv.budget / bwMax()) || 0.01, 50));
    $('#exercise-summary').innerHTML = '';
    $('#exercise-summary').classList.remove('stale');
    $('#log').innerHTML = '';
    // Gauges and teletype stay folded away until the first exercise of this visit.
    $('#results').hidden = true;
    $('#console-idle').hidden = false;
  }

  // ================================================================ field exercise
  async function runExercise() {
    if (modeOf(S.level)) return runModeExercise();
    stopAnim();
    const btn = $('#btn-exercise');
    btn.disabled = true;
    btn.classList.add('busy');
    btn.classList.remove('nudge');
    $('#btn-test').classList.remove('nudge');
    markTried();
    $('#console-idle').hidden = true;
    $('#results').hidden = false;
    $('#log').innerHTML = '<div class="log-line">TRANSMITTING 300 ORDERS…</div>';
    await sleep(30);
    let res;
    try {
      res = engine.evaluate(S.level, prog(), { trials: TRIALS });
    } catch (e) {
      toast(e.message, 'bad');
      btn.disabled = false;
      btn.classList.remove('busy');
      return;
    }
    const lv = S.level;
    const log = $('#log');
    log.innerHTML = '';
    const shown = res.results.slice(0, 10);
    const failures = res.results.filter((r) => !r.ok);
    const line = (r, n) => {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'log-line ' + (r.ok ? 'ok' : 'bad');
      const tries = r.attempts.length > 1 ? ` <i>↻${r.attempts.length}</i>` : '';
      d.innerHTML = `<span class="ln">#${String(n).padStart(3, '0')}</span><span class="mk">${r.ok ? '✓' : '✗'}</span><span class="tx">${esc(r.msg)} → ${esc(r.attempts[r.attempts.length - 1].recv)} → ${esc(r.delivered ?? '—')}</span>${tries}<span class="rp">replay ▸</span>`;
      d.title = 'Replay this order on the line';
      d.addEventListener('click', () => playTrial(r));
      return d;
    };
    for (let i = 0; i < shown.length; i++) {
      log.appendChild(line(shown[i], i + 1));
      audio.sfx.tick();
      const partial = res.results.slice(0, Math.round(((i + 1) / shown.length) * TRIALS));
      const acc = partial.filter((r) => r.ok).length / partial.length;
      setGauge('gacc', accFrac(acc), (acc * 100).toFixed(1) + '%');
      await sleep(55);
    }
    const extraFails = failures.filter((f) => res.results.indexOf(f) >= shown.length).slice(0, 6);
    if (extraFails.length) {
      const h = document.createElement('div');
      h.className = 'log-sep';
      h.textContent = `${failures.length} failed order${failures.length === 1 ? '' : 's'} — click one to replay it`;
      log.appendChild(h);
      for (const f of extraFails) log.appendChild(line(f, res.results.indexOf(f) + 1));
    }

    const accOk = res.accuracy >= lv.target - 1e-9;
    const bwOk = res.avgOverhead <= lv.budget + 1e-9;
    setGauge('gacc', accFrac(res.accuracy), (res.accuracy * 100).toFixed(1) + '%', accOk ? 'ok' : 'bad');
    setGauge('gbw', res.avgOverhead / bwMax(), '+' + res.avgOverhead.toFixed(2), bwOk ? 'ok' : 'bad');

    const reasons = [];
    if (!accOk) reasons.push(`${TRIALS - res.okN} order${TRIALS - res.okN === 1 ? '' : 's'} went wrong`);
    if (!bwOk) reasons.push(`over budget by ${(res.avgOverhead - lv.budget).toFixed(2)} symbols`);
    // Routing levels: average hours per order, re-sends included.
    const delay = res.avgDelay !== undefined ? ` · ${res.avgDelay.toFixed(2)} h avg` : '';
    if (res.delayOk === false) reasons.push(`too slow: ${res.avgDelay.toFixed(2)} h per order (limit ${lv.delayBudget} h)`);
    if (res.avgDelay !== undefined) res.stats = CoC.routing.reportStats(lv, res);
    $('#exercise-summary').classList.remove('stale');
    $('#exercise-summary').innerHTML = res.passed
      ? `<b class="ok">OBJECTIVES MET</b><span>${res.okN}/${TRIALS} delivered · ${res.avgOverhead < 0 ? "−" : "+"}${Math.abs(res.avgOverhead).toFixed(2)} avg${delay} · ${res.blocks} equipment</span>`
      : `<b class="bad">NOT YET</b><span>${reasons.join(' · ')}${res.delayOk === false ? '' : delay}</span>`;
    btn.disabled = false;
    btn.classList.remove('busy');

    if (lv.sandbox) {
      res.passed ? audio.sfx.success() : audio.sfx.fail();
      return;
    }
    if (!res.passed) {
      audio.sfx.fail();
      return;
    }
    const won = recordWin(lv, res);
    renderObjectives();
    setTimeout(() => showReport(res, won.before, won.promotion), 450);
  }

  // Record a passed run (medals merged with earlier ones) and return the rank reached, if it changed.
  function recordWin(lv, res) {
    const before = S.save.medals[lv.id] || [false, false, false];
    const starsBefore = totalStars();
    S.save.medals[lv.id] = before.map((m, i) => m || res.medals[i]);
    if (res.avgOverhead !== undefined) {
      const best = S.save.best[lv.id];
      if (!best || res.avgOverhead < best.overhead - 1e-9 || (Math.abs(res.avgOverhead - best.overhead) < 1e-9 && res.blocks < best.blocks))
        S.save.best[lv.id] = { overhead: res.avgOverhead, blocks: res.blocks };
    }
    persist();
    return { before, promotion: promotionSince(starsBefore) };
  }
  function promotionSince(starsBefore) {
    const max = campaignIds().length * 3;
    const a = rankFor(starsBefore, max);
    const b = rankFor(totalStars(), max);
    return a !== b ? b : null;
  }
  $('#btn-exercise').addEventListener('click', runExercise);

  // ================================================================ modals: briefing, hints, report, sector
  function stationListHTML(level) {
    return level.chain
      .map((m) => {
        const ch = CHARACTERS[m.kind];
        return `<div class="brief-relay">${art.patch(ch.icon)}<div><b>${esc(m.name || ch.name)}</b><span>${esc(ch.trait(m))}${m.kind === 'pass' ? '' : ` · ${Math.round(m.p * 100)}% of orders`}</span></div></div>`;
      })
      .join('');
  }

  function equipHTML(op) {
    const spec = BLOCKS[op] || blocks.TOOLS[op];
    if (!spec) return '';
    const color = BLOCKS[op] ? blocks.CATEGORIES[spec.cat].color : spec.side === 'read' ? 'khaki' : 'brass';
    const where = BLOCKS[op] ? 'Field work' : spec.side === 'read' ? 'Assembly row' : 'HQ strip';
    return `<div class="equip cat-${color}"><b>${spec.title} <small>· ${where}</small></b><span>${esc(spec.desc)}</span>${spec.example ? `<code>${esc(spec.example)}</code>` : ''}</div>`;
  }

  function openBriefing(first) {
    const lv = S.level;
    const fresh = [...newOpsFor(S.level)];
    const sec = lv.sandbox ? null : CoC.theater.sectorFor(lv.id);
    const kind = lv.sandbox ? '' : CoC.theater.kindOf(lv.id);
    const count = modeOf(lv) || !(lv.template || lv.format) ? 0 : engine.messageCount(lv);
    const card = openModal(
      `<div class="dossier">
        <div class="dossier-tab">${esc(opTag(lv))}</div>
        <div class="classified">Classified</div>
        <div class="dossier-meta">${sec ? `${kind === 'raid' ? 'Commando raid behind ' : kind === 'contact' ? 'Restore contact with ' : 'Sector · '}${esc(sec.name)}` : 'Test range'}</div>
        <h3>Operation ${esc(lv.name)}</h3>
        ${lv.briefing.split('\n\n').map((p) => `<p>${esc(p)}</p>`).join('')}
        ${lv.briefingHTML || ''}
        ${modeOf(lv) ? modeBriefing(lv) : `<h4>Orders</h4>
        <div class="template brief-template"></div>
        <p class="small">${count.toLocaleString()} possible order${count === 1 ? '' : 's'}.</p>
        ${(lv.network || lv.hiddenLine) && CoC.routing ? CoC.routing.briefingLineHTML(lv, S.route) : `<h4>The line</h4>
        <div class="brief-line">${stationListHTML(lv)}</div>`}
        <h4>Objectives</h4>
        <ul class="brief-obj">
          <li>Deliver at least <b>${Math.round(lv.target * 100)}%</b> of orders correctly.</li>
          <li>Average extra symbols per order: <b>${lv.budget}</b> or fewer${lv.arq ? ' (re-sends count in full)' : ''}.</li>
          ${lv.delayBudget !== undefined ? `<li>Average delay per order: <b>${lv.delayBudget} hours</b> or less. Every transmission walks the whole route${lv.arq ? ', re-sends included' : ''}.</li>` : ''}
          ${lv.sandbox ? '' : `<li class="dim">Medals for ≤ ${lv.par.overhead} extra symbols and ≤ ${lv.par.blocks} pieces of equipment (tools, plates, vote and ¬ readers — plain tiles are free).</li>`}
          ${lv.arq ? '<li>The field may reply <b>SAY AGAIN</b>.</li>' : ''}
        </ul>`}
        ${fresh.length ? `<h4>New equipment</h4><div class="brief-equip">${fresh.map(equipHTML).join('')}</div>` : ''}
        <div class="modal-actions"><button class="btn-stamp" type="button" data-autofocus>Acknowledged ▸</button></div>
      </div>`,
      'paper',
      first === true ? afterBriefing : null
    );
    const bt = card.querySelector('.brief-template');
    if (bt) renderTemplate(lv, bt);
    card.querySelector('.btn-stamp').onclick = () => (closeModal(), audio.sfx.click());
  }
  $('#btn-brief').addEventListener('click', () => openBriefing());

  function modeBriefing(lv) {
    const mode = modeOf(lv);
    const extra = mode.briefingHTML ? mode.briefingHTML(lv, modeApi()) : '';
    const goals = (lv.objectives || []).map((o) => `<li>${esc(o)}</li>`).join('');
    const medals = (lv.medalCaptions || []).slice(1).map((c) => `<li class="dim">Medal: ${esc(c)}</li>`).join('');
    return `${extra}${goals || medals ? `<h4>Objectives</h4><ul class="brief-obj">${goals}${medals}</ul>` : ''}`;
  }

  // ================================================================ first-time guidance (coach marks)
  const TOUR = [
    { target: '.order-strip', title: 'This is an order', text: 'Command sends orders shaped like this. Coloured shapes stand for symbols that change from order to order; plain tiles are always the same.' },
    { target: '#line', title: 'The line', text: 'Every relay between HQ and the front. Each one may do something to a message on its way through: hover a card (or open the Briefing) to see what.' },
    { target: '#enc-strip', title: 'Your HQ strip', text: 'This is what actually gets sent, tile by tile. Drag tiles from the tray above to change it.' },
    { target: '#dec-asm', title: 'The field reads it back', text: 'The front rebuilds the order from whatever arrives, reading each symbol from the position you choose here.' },
    { target: '#btn-test', title: 'Try it', text: 'Press TEST TRANSMISSION to watch one order travel the line. When it looks right, run a FIELD EXERCISE.', click: true },
  ];
  const POINTERS = {
    plates: { target: '#field-work', title: 'New: field work', text: 'Plates clean the signal before it is read. Drag one from the crate into the bay below it; plates run top to bottom.' },
    vote: { target: '#dec-asm', title: 'New: voting readers', text: 'A reader can now VOTE: switch it with ⇄, pick several positions, and it takes whichever symbol most of them agree on.' },
    analyzer: { target: '#analyzer', title: 'New: code analyzer', text: 'It checks every valid transmission your strip can make. The further apart they are (d), the more damage the field can repair.' },
  };

  function afterBriefing() {
    const lv = S.level;
    if (!lv || lv.sandbox || isDone(lv.id)) return;
    const seen = S.save.coach || (S.save.coach = {});
    const steps = [];
    if (lv.id === '1-1' && !seen.tour) {
      seen.tour = true;
      steps.push(...TOUR);
    }
    const want = {
      plates: allowedPlates(lv).length > 0,
      vote: allowedReaders(lv).has('VOTE'),
      analyzer: !modeOf(lv) && !$('#analyzer').hidden,
    };
    for (const k of Object.keys(POINTERS))
      if (want[k] && !seen[k]) {
        seen[k] = true;
        steps.push(POINTERS[k]);
      }
    if (!steps.length) return;
    persist();
    setTimeout(() => coach(steps), 250);
  }

  // coach(steps): dim the page, spotlight each target in turn with a small paper note. Skippable.
  let C = null;
  const coachTarget = (st) => (typeof st.target === 'string' ? $(st.target) : st.target);
  const isShown = (e) => !!e && e.getClientRects().length > 0;
  function coach(steps, onDone) {
    steps = steps.filter((st) => isShown(coachTarget(st)));
    // Tours run on whichever game screen is showing (mission or theater), never over the title.
    if (!steps.length || !$('#screen-mission.active, #screen-map.active')) return onDone && onDone();
    C = { steps, i: 0, onDone };
    $('#coach').hidden = false;
    document.body.classList.add('coaching');
    coachStep();
  }
  function coachStep() {
    const st = C.steps[C.i];
    const t = coachTarget(st);
    if (!isShown(t)) return coachNext();
    C.target = t;
    const r = t.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) t.scrollIntoView({ block: r.height > innerHeight * 0.6 ? 'start' : 'center', inline: 'nearest' });
    const n = C.steps.length;
    const last = C.i === n - 1;
    $('#coach-note').innerHTML =
      `<div class="coach-step">${n > 1 ? `${C.i + 1} of ${n}` : 'Field note'}</div><h4>${esc(st.title)}</h4><p>${esc(st.text)}</p>` +
      `<div class="coach-actions">${n > 1 && !last ? '<button type="button" class="coach-skip" data-c="skip">Skip tour</button>' : ''}` +
      `<button type="button" class="coach-next" data-c="next">${last ? 'Got it' : 'Next ▸'}</button></div>`;
    placeCoach();
    $('#coach-note .coach-next').focus({ preventScroll: true });
  }
  function placeCoach() {
    if (!C) return;
    const pad = 6;
    const m = 12;
    const r = C.target.getBoundingClientRect();
    const hole = {
      left: Math.max(4, r.left - pad),
      top: Math.max(4, r.top - pad),
      right: Math.min(innerWidth - 4, r.right + pad),
      bottom: Math.min(innerHeight - 4, r.bottom + pad),
    };
    Object.assign($('#coach-hole').style, {
      left: hole.left + 'px',
      top: hole.top + 'px',
      width: Math.max(0, hole.right - hole.left) + 'px',
      height: Math.max(0, hole.bottom - hole.top) + 'px',
    });
    const note = $('#coach-note');
    const nw = note.offsetWidth;
    const nh = note.offsetHeight;
    let top;
    let left = Math.min(Math.max(m, (hole.left + hole.right) / 2 - nw / 2), innerWidth - nw - m);
    if (hole.bottom + m + nh < innerHeight) top = hole.bottom + m;
    else if (hole.top - m - nh > 0) top = hole.top - m - nh;
    else if (hole.right + m + nw < innerWidth) (left = hole.right + m), (top = Math.min(Math.max(m, hole.top), innerHeight - nh - m));
    else if (hole.left - m - nw > 0) (left = hole.left - m - nw), (top = Math.min(Math.max(m, hole.top), innerHeight - nh - m));
    else top = innerHeight - nh - m;
    note.style.left = left + 'px';
    note.style.top = Math.max(m, top) + 'px';
  }
  function coachNext() {
    if (!C) return;
    C.i++;
    if (C.i >= C.steps.length) endCoach();
    else coachStep();
  }
  function endCoach() {
    if (!C) return;
    const done = C.onDone;
    C = null;
    $('#coach').hidden = true;
    document.body.classList.remove('coaching');
    if (done) done();
  }
  $('#coach').addEventListener('click', (e) => {
    if (!C) return;
    const act = e.target.closest('[data-c]');
    if (act) {
      audio.sfx.click();
      return act.dataset.c === 'skip' ? endCoach() : coachNext();
    }
    // Clicking the spotlit control itself on a "click" step does what it says.
    const st = C.steps[C.i];
    const r = C.target.getBoundingClientRect();
    if (st.click && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      const t = C.target;
      endCoach();
      t.click();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (C && e.key === 'Escape') endCoach();
  });
  window.addEventListener('resize', placeCoach);
  document.addEventListener('scroll', placeCoach, true);

  function openHints() {
    const lv = S.level;
    const opened = S.save.hints[lv.id] || 0;
    let html = '<div class="dossier"><h3>Sealed orders</h3><p class="small">Break a seal only if you are stuck. Each one gives a little more away.</p><div class="envelopes">';
    lv.hints.forEach((h, i) => {
      if (i < opened) html += `<div class="envelope open"><span class="env-n">${i + 1}</span><p>${esc(h)}</p></div>`;
      else if (i === opened) html += `<button class="envelope sealed" type="button" data-open="${i}"><span class="env-n">${i + 1}</span><span class="wax"></span><em>Break the seal</em></button>`;
      else html += `<div class="envelope locked"><span class="env-n">${i + 1}</span><em>Sealed</em></div>`;
    });
    html += '</div><div class="modal-actions"><button class="btn-ghost" type="button" data-close>Close</button></div></div>';
    const card = openModal(html, 'paper');
    card.querySelector('[data-close]').onclick = closeModal;
    const seal = card.querySelector('[data-open]');
    if (seal)
      seal.onclick = () => {
        S.save.hints[lv.id] = opened + 1;
        persist();
        audio.sfx.stamp();
        openHints();
      };
  }
  $('#btn-hint').addEventListener('click', openHints);

  function showReport(res, before, promotion) {
    const lv = S.level;
    const st = theaterStatus();
    const sec = CoC.theater.sectorFor(lv.id);
    const kind = CoC.theater.kindOf(lv.id);
    const nextId = kind === 'mission' ? CoC.theater.nextInSector(lv.id) : null;
    const next = nextId && st.missions[nextId] !== 'locked' && levelById(nextId) ? nextId : null;
    const captured = kind === 'mission' && sec && st.sectors[sec.id] === 'captured' && !next;
    const finale = captured && CoC.theater.SECTORS.every((x) => st.sectors[x.id] === 'captured');
    const headline = finale ? 'Campaign complete' : captured ? 'Sector captured' : kind === 'contact' ? 'Contact restored' : 'Mission accomplished';
    const captions = lv.medalCaptions || ['Mission complete', `Efficient · ≤ ${signed(lv.par.overhead)} extra`, `Lean · ≤ ${lv.par.blocks} equipment`];
    const stats = res.stats || [
      { label: 'Orders delivered', value: `${res.okN} / ${res.trials}` },
      { label: 'Avg extra symbols', value: res.avgOverhead.toFixed(2), note: `budget ${lv.budget}` },
      { label: 'Equipment used', value: res.blocks, note: `par ${lv.par.blocks}` },
    ];
    const now = S.save.medals[lv.id];
    const card = openModal(
      `<div class="report">
        <div class="report-head">After-action report · ${esc(opTag(lv))} · ${esc(lv.name)}</div>
        <div class="big-stamp">${headline}</div>
        <div class="report-stats">${stats
          .map((x) => `<div><span>${esc(x.label)}</span><b>${esc(x.value)}</b>${x.note ? `<i>${esc(x.note)}</i>` : ''}</div>`)
          .join('')}</div>
        <div class="medal-row">${[0, 1, 2]
          .map((k) => `<div class="medal-slot ${now[k] ? 'earned' : ''} ${now[k] && !before[k] ? 'new' : ''}">${art.medal(k, now[k])}<span>${captions[k]}</span></div>`)
          .join('')}</div>
        ${promotion ? `<div class="promotion">${art.CHEVRONS(3)}<div><span>Promoted</span><b>${promotion.name}</b></div></div>` : ''}
        <div class="manual-entry"><div class="me-tag">Field manual entry unlocked</div><h4>${esc(lv.debrief.title)}</h4><p>${esc(lv.debrief.text)}</p></div>
        <div class="modal-actions">
          <button class="btn-ghost" type="button" data-act="stay">Stay and optimise</button>
          <button class="btn-stamp" type="button" data-act="next" data-autofocus>${next ? 'Next operation ▸' : 'Return to the front ▸'}</button>
        </div>
      </div>`,
      'report-card sticky'
    );
    audio.sfx.stamp();
    setTimeout(() => audio.sfx.success(), 250);
    card.querySelector('[data-act="stay"]').onclick = closeModal;
    card.querySelector('[data-act="next"]').onclick = () => {
      closeModal();
      if (next) openLevel(next);
      else goToTheater({ justWon: lv.id, captured: captured ? sec.id : null });
    };
  }

  // ================================================================ archive
  function openArchive(from) {
    S.returnTo = from;
    let html = '';
    const card = (lv) =>
      isDone(lv.id)
        ? `<article class="arch-card"><div class="arch-op">${esc(opTag(lv))} · ${esc(lv.name)}</div><h3>${esc(lv.debrief.title)}</h3><p>${esc(lv.debrief.text)}</p></article>`
        : `<article class="arch-card redacted"><div class="arch-op">${esc(opTag(lv))}</div><h3><span class="bar" style="width:60%"></span></h3><p><span class="bar"></span><span class="bar" style="width:85%"></span><span class="bar" style="width:70%"></span></p></article>`;
    const group = (title, code, ids) => {
      const lvs = ids.map(levelById).filter(Boolean);
      if (!lvs.length) return;
      html += `<h2 class="arch-sector"><span>${esc(code)}</span>${esc(title)}</h2><div class="arch-grid">${lvs.map(card).join('')}</div>`;
    };
    for (const sec of CoC.theater.SECTORS) group(sec.name, sec.code, [...(sec.contact ? [sec.contact] : []), ...sec.missions]);
    group('Special operations', '✦', CoC.theater.SPECIALS.map((x) => x.level));
    $('#archive').innerHTML = html;
    show('screen-archive');
  }
  $('#btn-archive-back').addEventListener('click', () => {
    if (S.returnTo === 'screen-map') return goToTheater();
    if (S.returnTo === 'screen-title') buildTitle();
    show(S.returnTo);
  });

  // ================================================================ proving ground
  const SB_DEFAULT = {
    template: '■=XYZ ▲=123 ●=A-Z\n■ ■ ▲ ■ ■ ●',
    chain: 'garble p=0.9\ndrop p=0.5 set=123',
    arq: false,
    budget: 4,
  };

  function parseChain(text) {
    const kinds = Object.keys(CHARACTERS);
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((line) => {
        const [kind, ...rest] = line.split(/\s+/);
        const k = kind.toLowerCase();
        if (!kinds.includes(k)) throw new Error(`Unknown relay kind “${kind}”. Use one of: ${kinds.join(', ')}.`);
        const m = { kind: k, p: k === 'pass' ? 0 : 1 };
        for (const tok of rest) {
          const [key, val] = tok.split('=');
          if (val === undefined) throw new Error(`Expected key=value, got “${tok}”.`);
          if (['p', 'len', 'max', 'size'].includes(key)) m[key] = Number(val);
          else if (['set', 'to'].includes(key)) m[key] = val;
          else if (key === 'name') m.name = val.replace(/_/g, ' ').toUpperCase();
          else throw new Error(`Unknown option “${key}”.`);
        }
        if (k === 'add' && !m.set) throw new Error('add needs set=…');
        if (k === 'pad' && !m.set) throw new Error('pad needs set=…');
        if (k === 'burst') m.len = m.len || 2;
        if (k === 'pad') m.max = m.max || 2;
        if (k === 'shuffle') m.size = m.size || 2;
        if (!(m.p >= 0 && m.p <= 1)) throw new Error('p must be between 0 and 1.');
        return m;
      });
  }

  function openSandbox(from) {
    S.returnTo = from;
    const sb = Object.assign({}, SB_DEFAULT, S.save.sandbox || {});
    $('#sb-template').value = sb.template;
    $('#sb-chain').value = sb.chain;
    $('#sb-arq').checked = !!sb.arq;
    $('#sb-budget').value = sb.budget;
    sbPreview();
    show('screen-sandbox');
  }

  function sbBuild() {
    const template = $('#sb-template').value;
    const lv = {
      id: 'PG', sector: -1, name: 'PROVING GROUND', sandbox: true, template,
      chain: parseChain($('#sb-chain').value),
      enc: STRIP_TOOLS, dec: ALL_DEC, arq: $('#sb-arq').checked, target: 1,
      budget: Math.max(0, Number($('#sb-budget').value) || 0), par: { overhead: 0, blocks: 0 },
      repair: ['SCATTER', 'BURST', 'EDIT'], metric: 'hamming', hints: [],
      briefing: 'Your own line, your own rules. Every piece of equipment is unlocked. Nothing here counts toward the campaign.',
    };
    engine.templateOf(lv);
    if (!lv.chain.length) lv.chain = [{ kind: 'pass', p: 0 }];
    return lv;
  }

  function sbPreview() {
    try {
      const lv = { template: $('#sb-template').value };
      renderTemplate(lv, $('#sb-preview'));
      parseChain($('#sb-chain').value);
      $('#sb-error').textContent = `${engine.messageCount(lv).toLocaleString()} possible orders.`;
      $('#sb-error').className = 'sb-error ok';
    } catch (e) {
      $('#sb-error').textContent = e.message;
      $('#sb-error').className = 'sb-error';
    }
  }
  ['#sb-template', '#sb-chain'].forEach((s) => $(s).addEventListener('input', sbPreview));
  $('#sb-go').addEventListener('click', () => {
    let lv;
    try {
      lv = sbBuild();
    } catch (e) {
      $('#sb-error').textContent = e.message;
      return;
    }
    S.save.sandbox = Object.assign(S.save.sandbox || {}, {
      template: $('#sb-template').value,
      chain: $('#sb-chain').value,
      arq: $('#sb-arq').checked,
      budget: lv.budget,
    });
    persist();
    S.returnTo = 'screen-sandbox';
    startMission(lv);
  });
  $('#btn-sandbox-back').addEventListener('click', () => {
    if (S.returnTo === 'screen-map') return goToTheater();
    show(S.returnTo === 'screen-sandbox' ? 'screen-title' : S.returnTo);
  });

  $('#btn-mission-map').addEventListener('click', () => {
    stopAnim();
    if (S.level && S.level.sandbox) {
      openSandbox(S.returnTo === 'screen-sandbox' ? 'screen-title' : S.returnTo);
      return;
    }
    goToTheater();
  });

  // ================================================================ special-mission modes
  // A level with `mode: '<name>'` is played through CoC.modes[name] (js/modes/<name>.js) instead of the
  // HQ strip + field editors. The contract is documented in js/modes/README.md.
  const modeOf = (lv) => (lv && lv.mode && CoC.modes && CoC.modes[lv.mode]) || null;
  let modeCtl = null;

  function unmountMode() {
    if (modeCtl && modeCtl.destroy) modeCtl.destroy();
    modeCtl = null;
    $('#mode-root').innerHTML = '';
    $('#screen-mission').classList.remove('has-mode');
    $('#screen-mission').removeAttribute('data-mode');
    $('.line-panel').hidden = false;
  }

  function saveModeState() {
    if (!S.level || S.level.sandbox) return;
    S.save.programs[S.level.id] = { state: JSON.parse(JSON.stringify(S.modeState)) };
    persist();
  }

  // What a mode may use from the shell.
  function modeApi() {
    return {
      level: S.level,
      getState: () => S.modeState,
      setState: (st) => {
        S.modeState = st;
        saveModeState();
      },
      changed: () => {
        saveModeState();
        $('#exercise-summary').classList.add('stale');
      },
      line: {
        tape: (before, after) => setTape(before, after),
        label: (t) => ($('#tape-label').textContent = t),
        note: (t, cls = '') => {
          const n = $('#tape-note');
          n.className = 'tape-note ' + cls;
          n.textContent = t;
        },
        stamp: (kind, text) => {
          $('#stamp-zone').innerHTML = kind ? `<div class="stamp ${kind}">${esc(text)}</div>` : '';
          if (kind) audio.sfx.stamp();
        },
        el: $('#line'),
      },
      toast,
      sfx: audio.sfx,
      art,
      engine,
      esc,
      tiles,
      renderTemplate,
      sleep,
      isDone,
    };
  }

  // Console wording: orders/exercise texts for strip missions; a mode may supply its own (mode.consoleText).
  const CONSOLE_TEXT = {
    test: 'watch one order travel',
    exercise: '× 300 orders',
    idle: 'Run a field exercise: HQ sends 300 orders and the results print here.',
  };
  function setConsoleText(t = {}) {
    const c = Object.assign({}, CONSOLE_TEXT, t);
    $('#btn-test small').textContent = c.test;
    $('#btn-exercise small').textContent = c.exercise;
    $('#console-idle').textContent = c.idle;
  }

  function startModeMission(lv) {
    const mode = modeOf(lv);
    setConsoleText(mode.consoleText || { test: 'try one run', exercise: 'full exercise', idle: 'Run the field exercise and the results print here.' });
    const saved = S.save.programs[lv.id];
    S.modeState = saved && saved.state !== undefined ? JSON.parse(JSON.stringify(saved.state)) : mode.defaultState(lv);
    const hasTpl = !!(lv.template || lv.format);
    S.alpha = hasTpl ? engine.alphabetOf(lv) : '';
    S.binary = hasTpl && [...S.alpha].every((c) => c === '0' || c === '1');
    $('#screen-mission').classList.add('has-mode');
    $('#screen-mission').dataset.mode = lv.mode;
    $('#op-id').textContent = opTag(lv);
    $('#op-name').textContent = lv.name;
    clearTimeout(S.visit.hintTimer);
    S.visit = { tried: false, timeUp: false };
    if (lv.hints.length) S.visit.hintTimer = setTimeout(() => ((S.visit.timeUp = true), updateHintButton()), 60000);
    updateHintButton();
    $('.line-panel').hidden = !!mode.hideLine;
    $('#analyzer').hidden = true; // the code analyzer belongs to strip missions
    if (!mode.hideLine) {
      if (hasTpl) renderTemplate(lv, $('#mission-template'));
      renderLine();
    }
    $('#btn-test').classList.toggle('nudge', !isDone(lv.id));
    $('#btn-exercise').classList.remove('nudge');
    renderObjectives();
    resetConsole();
    modeCtl = mode.mount($('#mode-root'), modeApi()) || null;
    show('screen-mission');
    openBriefing(true);
  }

  async function runModeExercise() {
    const lv = S.level;
    const mode = modeOf(lv);
    const btn = $('#btn-exercise');
    btn.disabled = true;
    btn.classList.add('busy');
    btn.classList.remove('nudge');
    markTried();
    $('#console-idle').hidden = true;
    $('#results').hidden = false;
    $('#log').innerHTML = `<div class="log-line">${esc(mode.runningText || 'RUNNING THE EXERCISE…')}</div>`;
    await sleep(30);
    let res;
    try {
      res = mode.evaluate(lv, S.modeState, {});
    } catch (e) {
      toast(e.message, 'bad');
      btn.disabled = false;
      btn.classList.remove('busy');
      return;
    }
    const log = $('#log');
    log.innerHTML = '';
    for (const entry of (res.log || []).slice(0, 16)) {
      const replay = entry.data !== undefined && mode.test;
      const d = document.createElement(replay ? 'button' : 'div');
      if (replay) d.type = 'button';
      d.className = 'log-line ' + (entry.ok === true ? 'ok' : entry.ok === false ? 'bad' : '');
      d.innerHTML = `<span class="mk">${entry.ok === true ? '✓' : entry.ok === false ? '✗' : '·'}</span><span class="tx">${esc(entry.text)}</span>${replay ? '<span class="rp">replay ▸</span>' : ''}`;
      if (replay) d.addEventListener('click', () => mode.test(modeApi(), entry.data));
      log.appendChild(d);
      audio.sfx.tick();
      await sleep(45);
    }
    const g = res.gauges || [];
    if (g[0]) setGauge('gacc', g[0].frac, g[0].text, g[0].ok ? 'ok' : 'bad');
    if (g[1]) setGauge('gbw', g[1].frac, g[1].text, g[1].ok ? 'ok' : 'bad');
    $('#exercise-summary').classList.remove('stale');
    $('#exercise-summary').innerHTML = `<b class="${res.passed ? 'ok' : 'bad'}">${res.passed ? 'OBJECTIVES MET' : 'NOT YET'}</b><span>${esc(res.summary || '')}</span>`;
    btn.disabled = false;
    btn.classList.remove('busy');
    if (!res.passed) {
      audio.sfx.fail();
      return;
    }
    const won = recordWin(lv, res);
    renderObjectives();
    setTimeout(() => showReport(res, won.before, won.promotion), 450);
  }

  // ================================================================ boot
  makeEditors();
  refreshSound();
  buildTitle();
  function refresh() {
    if (modeOf(S.level)) return modeCtl && modeCtl.render && modeCtl.render();
    updatePreview();
    S.editors.enc.render();
    S.editors.dec.render();
    S.editors.asm.render();
  }
  CoC.app = {
    S, openLevel, buildMap, goToTheater, show, refresh, coach, toast, openModal, closeModal, persist,
    isDone, levelById, rankInfo, theaterStatus, esc, tiles, renderTemplate,
  };
})();
