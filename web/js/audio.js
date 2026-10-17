/* Chain of Command — tiny synthesized sound effects (WebAudio, no files). */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});

  let ctx = null;
  let muted = false;

  function ac() {
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, { type = 'sine', vol = 0.08, slide = 0 } = {}) {
    const a = ac();
    if (!a || muted) return;
    const t = a.currentTime + start;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - 0.02));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(start, dur, vol = 0.05, hp = 1200) {
    const a = ac();
    if (!a || muted) return;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = a.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination);
    src.start(a.currentTime + start);
  }

  const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', N: '-.', S: '...', W: '.--', O: '---', R: '.-.', K: '-.-' };

  const sfx = {
    click: () => tone(1400, 0, 0.03, { type: 'square', vol: 0.03 }),
    place: () => (tone(220, 0, 0.06, { type: 'triangle', vol: 0.12 }), noise(0, 0.05, 0.04, 2000)),
    remove: () => tone(300, 0, 0.12, { type: 'triangle', vol: 0.08, slide: -160 }),
    morse: (word = 'K') => {
      let t = 0;
      for (const ch of word) {
        for (const sym of MORSE[ch] || '.') {
          const d = sym === '.' ? 0.06 : 0.18;
          tone(700, t, d, { vol: 0.05 });
          t += d + 0.06;
        }
        t += 0.12;
      }
    },
    tick: () => noise(0, 0.025, 0.05, 3000),
    hit: () => (noise(0, 0.18, 0.09, 500), tone(120, 0, 0.15, { type: 'sawtooth', vol: 0.04, slide: -60 })),
    stamp: () => (noise(0, 0.12, 0.12, 200), tone(90, 0, 0.12, { type: 'triangle', vol: 0.2, slide: -40 })),
    success: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.11, i === 3 ? 0.45 : 0.12, { type: 'square', vol: 0.045 })),
    fail: () => (tone(196, 0, 0.25, { type: 'sawtooth', vol: 0.05 }), tone(147, 0.22, 0.45, { type: 'sawtooth', vol: 0.05 })),
    again: () => (tone(660, 0, 0.1, { type: 'square', vol: 0.04 }), tone(660, 0.16, 0.1, { type: 'square', vol: 0.04 })),
  };

  CoC.audio = {
    sfx,
    setMuted: (m) => (muted = m),
    isMuted: () => muted,
  };
})();
