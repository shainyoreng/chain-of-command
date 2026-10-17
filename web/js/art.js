/* Chain of Command — inline SVG art: insignia patches, stations, medals, map symbols. */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});

  const HELMET =
    '<path d="M13 33c0-12 8.5-20 19-20s19 8 19 20" fill="#6d7a45" stroke="#1f2614" stroke-width="2"/>' +
    '<path d="M8 34h48l-3 4H11z" fill="#57633a" stroke="#1f2614" stroke-width="2"/>' +
    '<path d="M22 38v6c0 6 4.5 10 10 10s10-4 10-10v-6" fill="#c9a77f" stroke="#1f2614" stroke-width="2"/>' +
    '<path d="M27 46h3M34 46h3" stroke="#1f2614" stroke-width="2" stroke-linecap="round"/>';

  // Small emblem drawn inside a 24x24 box.
  const EMBLEMS = {
    reliable: '<path d="M5 12l5 5 9-10" fill="none" stroke="#1d1d16" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
    drop: '<rect x="7" y="3" width="10" height="10" rx="1.5" fill="#1d1d16"/><path d="M12 15v6M8.5 18l3.5 3.5 3.5-3.5" stroke="#1d1d16" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
    add: '<path d="M12 4v16M4 12h16" stroke="#1d1d16" stroke-width="4" stroke-linecap="round"/>',
    swap: '<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" stroke="#1d1d16" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    static: '<path d="M13 2L5 13h6l-2 9 9-12h-6z" fill="#1d1d16"/>',
    flip: '<circle cx="12" cy="12" r="5.5" fill="#1d1d16"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M5 19l2-2" stroke="#1d1d16" stroke-width="2" stroke-linecap="round"/>',
    smudge: '<path d="M12 3c4 6 6 9 6 12a6 6 0 01-12 0c0-3 2-6 6-12z" fill="#1d1d16"/>',
    burst: '<path d="M12 1l2.6 6.4L21 5l-2.8 6.3L23 15l-6.6.6L16 22l-4-5.2L8 22l-.4-6.4L1 15l4.8-3.7L3 5l6.4 2.4z" fill="#1d1d16"/>',
    pad: '<path d="M2 7c3-3 5 3 8 0s5 3 8 0 3 0 4 0M2 12c3-3 5 3 8 0s5 3 8 0 3 0 4 0M2 17c3-3 5 3 8 0s5 3 8 0 3 0 4 0" stroke="#1d1d16" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
    clerk: '<path d="M4 20l3-1L19 7l-2-2L5 17z" fill="#1d1d16"/><path d="M15.5 4.5l4 4" stroke="#1d1d16" stroke-width="2.4"/>',
    shuffle: '<path d="M3 7h4l10 10h4M3 17h4l10-10h4M18 4l3 3-3 3M18 14l3 3-3 3" stroke="#1d1d16" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  };

  const PATCH_COLORS = {
    reliable: '#7d9a4a', drop: '#c49a3a', add: '#c49a3a', swap: '#c49a3a', clerk: '#c49a3a', shuffle: '#c49a3a',
    static: '#b5452f', flip: '#b5452f', burst: '#b5452f', smudge: '#5f8299', pad: '#5f8299',
  };
  const HUMAN = new Set(['reliable', 'drop', 'add', 'swap', 'clerk', 'shuffle']);

  function patch(icon) {
    const col = PATCH_COLORS[icon] || '#c49a3a';
    const emblem = EMBLEMS[icon] || EMBLEMS.reliable;
    const body = HUMAN.has(icon)
      ? HELMET +
        `<circle cx="49" cy="49" r="11" fill="${col}" stroke="#1d1d16" stroke-width="2"/>` +
        `<g transform="translate(41.5 41.5) scale(.62)">${emblem}</g>`
      : `<g transform="translate(14 14) scale(1.5)">${emblem.replace(/#1d1d16/g, '#efe6cc')}</g>`;
    const bg = HUMAN.has(icon) ? '#3c4a2c' : col;
    return (
      `<svg viewBox="0 0 64 64" class="patch" aria-hidden="true">` +
      `<circle cx="32" cy="32" r="30" fill="${bg}" stroke="#d8c99b" stroke-width="2.5"/>` +
      `<circle cx="32" cy="32" r="26.5" fill="none" stroke="#1d1d16" stroke-width="1" stroke-dasharray="2 2.5" opacity=".55"/>` +
      body +
      `</svg>`
    );
  }

  const HQ =
    '<svg viewBox="0 0 80 64" class="station-art" aria-hidden="true">' +
    '<path d="M40 6v14" stroke="#d8c99b" stroke-width="2"/><path d="M40 6l14 4-14 4z" fill="#b5452f"/>' +
    '<path d="M6 56L40 20l34 36z" fill="#5b6b3a" stroke="#1f2614" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M40 20v36" stroke="#1f2614" stroke-width="2"/><path d="M33 56l7-16 7 16z" fill="#1f2614"/>' +
    '<path d="M64 56V24M58 30l6-6 6 6M60 36l4-4 4 4" stroke="#d8c99b" stroke-width="2" fill="none"/>' +
    '<path d="M2 57h76" stroke="#1f2614" stroke-width="3"/></svg>';

  const FIELD =
    '<svg viewBox="0 0 80 64" class="station-art" aria-hidden="true">' +
    '<path d="M24 20V6M18 10l6-4 6 4" stroke="#d8c99b" stroke-width="2" fill="none"/>' +
    '<rect x="16" y="20" width="22" height="18" rx="2" fill="#4b5735" stroke="#1f2614" stroke-width="2"/>' +
    '<circle cx="23" cy="29" r="3" fill="#ffd257"/><rect x="29" y="25" width="6" height="8" fill="#1f2614"/>' +
    '<g fill="#a8975f" stroke="#1f2614" stroke-width="2">' +
    '<rect x="4" y="38" width="18" height="9" rx="4"/><rect x="22" y="38" width="18" height="9" rx="4"/><rect x="40" y="38" width="18" height="9" rx="4"/><rect x="58" y="38" width="18" height="9" rx="4"/>' +
    '<rect x="13" y="47" width="18" height="9" rx="4"/><rect x="31" y="47" width="18" height="9" rx="4"/><rect x="49" y="47" width="18" height="9" rx="4"/></g>' +
    '<path d="M2 57h76" stroke="#1f2614" stroke-width="3"/></svg>';

  const ENVELOPE =
    '<svg viewBox="0 0 28 20" aria-hidden="true"><rect x="1" y="1" width="26" height="18" rx="2" fill="#efe6cc" stroke="#1f2614" stroke-width="1.6"/><path d="M1.5 2l12.5 9 12.5-9" fill="none" stroke="#1f2614" stroke-width="1.6"/><circle cx="14" cy="12" r="3" fill="#b5452f"/></svg>';

  function star(filled, size = 18) {
    return (
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" class="star ${filled ? 'on' : 'off'}" aria-hidden="true">` +
      '<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z"/></svg>'
    );
  }

  const MEDAL_RIBBONS = [
    ['#6f9a3e', '#d8c99b', '#6f9a3e'],
    ['#2f5f8a', '#d8c99b', '#b5452f'],
    ['#b5452f', '#e0b84a', '#b5452f'],
  ];
  function medal(i, earned) {
    const [a, b, c] = MEDAL_RIBBONS[i];
    return (
      `<svg viewBox="0 0 48 72" class="medal ${earned ? 'earned' : 'missing'}" aria-hidden="true">` +
      `<path d="M10 2h28l-6 30H16z" fill="${a}"/><path d="M19 2h10l-3 30h-4z" fill="${b}"/><path d="M22 2h4l-1 30h-2z" fill="${c}"/>` +
      '<circle cx="24" cy="48" r="17" fill="#c9a24a" stroke="#7a5d1c" stroke-width="2.5"/>' +
      '<circle cx="24" cy="48" r="12" fill="none" stroke="#7a5d1c" stroke-width="1.2"/>' +
      '<path d="M24 38l2.6 6 6.4.5-4.9 4.2 1.5 6.3L24 51.7 18.4 55l1.5-6.3L15 44.5l6.4-.5z" fill="#7a5d1c"/>' +
      '</svg>'
    );
  }

  const CHEVRONS = (n) => {
    let s = '<svg viewBox="0 0 30 34" class="chevrons" aria-hidden="true">';
    for (let i = 0; i < n; i++) s += `<path d="M3 ${10 + i * 7}l12-7 12 7" />`;
    return s + '</svg>';
  };

  CoC.art = { patch, HQ, FIELD, ENVELOPE, star, medal, CHEVRONS };
})();
