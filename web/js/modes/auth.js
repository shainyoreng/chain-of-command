/* Special-mission mode: auth — restoring contact (A1, A2, A3). Challenge and response.
 *
 * A unit at the front has lost contact. HQ comes back on the air, and so does the enemy, broadcasting orders
 * in HQ's voice. The unit challenges every voice: it flashes a random CHALLENGE (a few lamps); HQ and the unit
 * share tonight's secret KEY (a few more lamps, sent up by courier). HQ answers with whatever its strip
 * computes from challenge + key; the unit computes the same and checks A = B. The strip is the ordinary HQ
 * strip (CoC.StripEditor) over a template whose first variables are the challenge lamps, the rest the key.
 *
 * The impostor knows the method (Kerckhoffs) but not the key. It has overheard `overheard` genuine exchanges
 * tonight — either HQ's answers only (`hears: 'answers'`) or challenge and answer (`'both'`) — and is then
 * asked a FRESH challenge (the unit never repeats one in a night: a nonce). With `jam`, a jammer flips one
 * lamp of every answer on the air (HQ's, and the impostor's); the unit therefore accepts an answer with at
 * most one wrong lamp, and the impostor's intercepts are jammed too.
 * The impostor plays optimally: every key is weighed by how well it explains what was heard (uniform prior),
 * and it sends the answer most likely to be accepted. The odds are computed exactly, over every key, every
 * challenge sequence and every jammed lamp. DOM-free except inside mount/test/briefingHTML.
 */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});
  CoC.modes = CoC.modes || {};
  const engine = CoC.engine;
  if (!engine || !CoC.data) return;

  // ------------------------------------------------------------------ small helpers
  const bits = (n, w) => {
    let s = '';
    for (let i = w - 1; i >= 0; i--) s += (n >> i) & 1;
    return s;
  };
  const pct = (x) => {
    const v = Math.round(x * 1000) / 10;
    return (Number.isInteger(v) ? String(v) : v.toFixed(1)) + '%';
  };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const ham = (a, b) => {
    let d = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
    return d;
  };
  const flipAt = (s, i) => s.slice(0, i) + (s[i] === '1' ? '0' : '1') + s.slice(i + 1);
  const jamIndex = (s, j) => (s.length ? ((j % s.length) + s.length) % s.length : -1);

  // Strip builders for level data (ids only need to be unique within a strip).
  let uid = 0;
  const id = () => 'au' + ++uid;
  const V = (lv, sym) => engine.templateOf(lv).vars.findIndex((x) => x.sym === sym);
  const mk = {
    src: (lv, sym, not = false) => ({ id: id(), t: 'src', v: V(lv, sym), not }),
    par: (lv, syms) => ({ id: id(), t: 'par', vars: [...syms].map((c) => V(lv, c)) }),
    if: (lv, sym, then, els) => ({ id: id(), t: 'if', v: V(lv, sym), set: '1', then, else: els }),
    rep: (lv, n, items) => ({ id: id(), t: 'rep', n, items }),
  };
  // tiny notation: "■" source, "¬■" flipped source, "P(■◆)" parity
  const strip = (lv, text) =>
    text
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => (w.startsWith('P(') ? mk.par(lv, w.slice(2, -1)) : w.startsWith('¬') ? mk.src(lv, w.slice(1), true) : mk.src(lv, w)));
  // four drawers, one per two-lamp challenge: IF ■ (IF ▲ a b) (IF ▲ c d); a drawer is notation or a list
  const drawer = (lv, x) => (typeof x === 'string' ? strip(lv, x) : x);
  const drawers = (lv, a, b, c, d) => [
    mk.if(lv, '■', [mk.if(lv, '▲', drawer(lv, a), drawer(lv, b))], [mk.if(lv, '▲', drawer(lv, c), drawer(lv, d))]),
  ];

  // ------------------------------------------------------------------ levels
  const A1 = {
    id: 'A1', mode: 'auth', name: 'WHO GOES THERE?',
    template: '■=01 ▲=01 ●=01 ◆=01 ★=01 ⬟=01\n■▲●◆★⬟',
    auth: {
      challenge: 3, key: 3, overheard: 2, hears: 'answers', maxForge: 0.2, maxLen: 4,
      medals: [{ len: 3 }, { equip: 3 }],
    },
    enc: ['NOT', 'PARITY'], dec: [],
    goal: 'Impostor gets through ≤ 20% · answer ≤ 4 lamps',
    objectives: [
      'Contact: the real HQ always passes the challenge (the unit works out the same answer from the challenge and tonight’s key).',
      'An impostor who knows your method, but not the key, fools the unit on at most 20% of nights.',
      'HQ’s answer is at most 4 lamps.',
    ],
    medalCaptions: ['Contact restored', 'Terse · answer of ≤ 3 lamps', 'Lean · ≤ 3 equipment'],
    briefing:
      'JAMMER VALLEY has gone silent. The wire to our forward posts was cut three days ago, and the codebooks went with a captured runner. Tonight HQ comes back on the air. So does the enemy, broadcasting orders in HQ’s voice; one battery has already been talked into falling back.\n\n' +
      'New rule: the front obeys no voice until it has passed a challenge. The unit flashes three random lamps; HQ must flash back an ANSWER only the real HQ could give. Both hold tonight’s KEY, three secret lamps brought up by courier. The unit works the answer out for itself and compares: A = B?\n\n' +
      'The enemy has our signals manual, so assume they know your method. Their imitation station can hear HQ’s big transmitter (they have HQ’s last two answers) but not the unit’s little challenge lamp.',
    hints: [
      'A fixed password (the key, sent as it is) gets recorded and simply played back by the impostor. The answer has to change with the challenge.',
      'If the answer is worked out from the challenge alone, the impostor can work it out too: they have the manual. Every answer lamp must involve the key as well.',
      'One PARITY lamp per pair: P(■◆) P(▲★) P(●⬟). Each answer lamp is a challenge lamp XOR a key lamp: without the challenge, an old answer is just noise.',
    ],
    debrief: {
      title: 'Challenge and response',
      text:
        'You restored contact without ever sending the secret: only someone holding the key can answer a fresh challenge. A fixed password falls to a replay attack: record it once, play it back forever. A fresh challenge (a nonce, "a number used once") makes every old answer worthless. ' +
        'Radar IFF ("identification, friend or foe") began in WWII with aircraft that answered any radar\'s interrogation; its successors made the reply depend on a secret daily code, because a fixed reply is only a password the enemy can copy. ' +
        'Kerckhoffs\'s principle (1883): a system must stay secure when the enemy knows everything about it except the key. Your XOR answer is a one-time pad over the challenge, and that holds only while the enemy cannot hear the challenges.',
    },
  };
  A1.solution = { state: { strip: strip(A1, 'P(■◆) P(▲★) P(●⬟)') } };
  A1.anti = [
    { strip: strip(A1, '◆ ★ ⬟') }, // the password: replayed
    { strip: strip(A1, '■ ▲ ●') }, // echo the challenge: computed
    { strip: strip(A1, 'P(■◆) P(▲★)') }, // too short: a third of nights
    { strip: strip(A1, 'P(■◆) P(▲★) P(●⬟) P(■▲●)') }, // an extra challenge-only lamp leaks the challenge
  ];

  const A2 = {
    id: 'A2', mode: 'auth', name: 'THE IMPOSTOR',
    template: '■=01 ▲=01 ●=01 ◆=01 ★=01 ⬟=01 ✚=01 ⬢=01\n■▲●◆★⬟✚⬢',
    auth: {
      challenge: 2, key: 6, overheard: 2, hears: 'both', maxForge: 0.4, maxLen: 3,
      medals: [{ forge: 0.25 }, { equip: 5 }],
    },
    enc: ['NOT', 'IF', 'PARITY'], dec: [],
    goal: 'Impostor gets through ≤ 40% · answer ≤ 3 lamps',
    objectives: [
      'Contact: the real HQ always passes the challenge.',
      'The impostor hears both sides of two exchanges, then must answer a fresh challenge. It fools the unit on at most 40% of nights.',
      'HQ’s answer is at most 3 lamps.',
    ],
    medalCaptions: ['Contact restored', 'Airtight · impostor ≤ 25%', 'Lean · ≤ 5 equipment'],
    briefing:
      'THE LONG WIRE has gone dark: the enemy cut it and patched in an imitation station of their own. They learned from the valley. Their listening post now sits right on the wire and hears BOTH sides: the unit’s challenge and HQ’s answer. Tonight they have two full exchanges on tape before they go on the air in HQ’s voice.\n\n' +
      'Try the valley’s parity answer and watch: from one exchange they work out everything they need by plain algebra. A parity lamp is a seal, not a signature.\n\n' +
      'The units now flash a two-lamp challenge (four possible) and never repeat one in a night. Tonight’s key is six lamps. You are issued the IF.',
    hints: [
      'Every answer built only from PARITY is a set of XOR equations, and one overheard exchange lets the impostor solve them. Let a lamp DECIDE which part of the key is used: that is the IF.',
      'Let the challenge pick a drawer. IF ■ → (IF ▲ …) else (IF ▲ …) makes four drawers, one per challenge. Put different key lamps in each one, and what the impostor heard from two drawers says nothing about a third.',
      'Six key lamps, four drawers of two: the last drawer has to borrow. A plain copy is given away by the drawers it copies. Borrow a mix instead: ● ◆ | ★ ⬟ | ✚ ⬢ | P(●★✚) P(◆⬟⬢).',
    ],
    debrief: {
      title: 'Message authentication codes',
      text:
        'Anything built only from parity (a CRC, a checksum) is linear: whoever sees one sealed message can work out the seal of another. Checksums catch accidents, not enemies. ' +
        'Authentication needs a keyed function the enemy cannot solve from samples: a message authentication code (MAC). Your answer works much like the US military\'s DRYAD authentication sheets: the challenger names a row, and the reply is read off a secret sheet that changes every day. ' +
        'Modern MACs such as HMAC mix the key through a hash function and use keys of 128 bits or more, so an impostor\'s odds are not one in four but one in 2¹²⁸.',
    },
  };
  const DRAWERS = ['● ◆', '★ ⬟', '✚ ⬢', 'P(●★✚) P(◆⬟⬢)'];
  A2.solution = { state: { strip: drawers(A2, ...DRAWERS) } };
  A2.anti = [
    { strip: strip(A2, 'P(■●◆) P(▲★⬟)') }, // linear: solved from one exchange
    { strip: strip(A2, '● ◆') }, // password
    { strip: drawers(A2, '●', '◆', '★', '⬟') }, // one-lamp codebook: a coin toss
    { strip: drawers(A2, ...DRAWERS.slice(0, 3), '● ★') }, // the last drawer copies other drawers
  ];

  const A3 = {
    id: 'A3', mode: 'auth', name: 'THROUGH THE JAMMING',
    template: '■=01 ▲=01 ●=01 ◆=01 ★=01 ⬟=01 ✚=01 ⬢=01\n■▲●◆★⬟✚⬢',
    auth: {
      challenge: 2, key: 6, overheard: 2, hears: 'both', jam: true, maxForge: 0.4, maxLen: 8,
      medals: [{ len: 5 }, { forge: 0.25 }],
    },
    enc: ['REPEAT', 'NOT', 'IF', 'PARITY'], dec: [],
    goal: 'Impostor gets through ≤ 40% · answer ≤ 8 lamps',
    objectives: [
      'Contact: the real HQ always passes, even with one of its lamps jammed (the unit forgives one wrong lamp).',
      'The impostor hears both sides of two (jammed) exchanges, then answers a fresh challenge through the same jammer. It fools the unit on at most 40% of nights.',
      'HQ’s answer is at most 8 lamps.',
    ],
    medalCaptions: ['Contact restored', 'Compact · answer of ≤ 5 lamps', 'Airtight · impostor ≤ 25%'],
    briefing:
      'The last units cut off outside ENEMY HIGH COMMAND. The imitation station is on the air again, and this time the enemy has put a jammer on HQ’s frequency: it flips one lamp of every answer, ours and theirs.\n\n' +
      'So the units must accept an answer with ONE lamp wrong, or they would never hear HQ at all. The impostor knows it, and only has to come close. Your drawer answer from the Long Wire is now nearly worthless.\n\n' +
      'Same two-lamp challenge, same six-lamp key, two exchanges overheard (jammed, like everything else). The unit confirms contact if at most one lamp differs from its own answer. REPEAT is back on the bench.',
    hints: [
      'With one wrong lamp forgiven, the impostor does not have to be right, only close: two answers one lamp apart are the same answer to him. Make HQ’s possible answers FAR apart.',
      'If any two answers differ in at least three lamps (distance 3), a jammed lamp still leaves HQ’s answer nearest and a wrong guess stays wrong. Stamping each drawer three times does it: REPEAT ×3 around ● ◆, and so on (6 lamps).',
      'Five lamps are enough, as in a Hamming code: in each drawer send the two lamps, their parity, then the two again: ● ◆ P(●◆) ● ◆. The last drawer: P(●★✚) P(◆⬟⬢) P(●★✚◆⬟⬢) P(●★✚) P(◆⬟⬢).',
    ],
    debrief: {
      title: 'Integrity and authenticity',
      text:
        'Error correction and authentication pull against each other: forgiving a damaged answer also forgives a forgery that lands close enough. The cure is to keep genuine answers far apart, so the tolerance never reaches a different one: authenticate first, then protect the result with a code. ' +
        'Real links stack both. A MAC gives authenticity (who sent it) and integrity against an adversary (nobody altered it); a checksum gives integrity only against accidents; an error-correcting code underneath repairs the noise. ' +
        'Military datalinks such as Link 16 layer Reed–Solomon coding under their cryptography, and modern IFF (Mode 5) interrogations are cryptographic challenge and response built to work through a noisy, jammed sky.',
    },
  };
  const rep3 = (lv, text) => [mk.rep(lv, 3, strip(lv, text))];
  const code5 = (a, b) => `${a} ${b} P(${a.replace(/[P() ]/g, '')}${b.replace(/[P() ]/g, '')}) ${a} ${b}`;
  A3.solution = { state: { strip: drawers(A3, code5('●', '◆'), code5('★', '⬟'), code5('✚', '⬢'), code5('P(●★✚)', 'P(◆⬟⬢)')) } };
  A3.anti = [
    { strip: drawers(A3, ...DRAWERS) }, // the Long Wire answer: one lamp off is close enough
    { strip: drawers(A3, ...DRAWERS.map((d) => [mk.rep(A3, 2, strip(A3, d))])) }, // doubled: distance 2
    { strip: drawers(A3, ...['●', '◆', '★', '⬟'].map((k) => rep3(A3, k))) }, // one key lamp, three times: a coin toss
    { strip: drawers(A3, '● ◆ P(●◆)', '★ ⬟ P(★⬟)', '✚ ⬢ P(✚⬢)', 'P(●★✚) P(◆⬟⬢) P(●★✚◆⬟⬢)') }, // one parity lamp: distance 2
    { strip: [mk.rep(A3, 3, strip(A3, 'P(■●◆) P(▲★⬟)'))] }, // linear, however long
  ];

  A2.start = () => strip(A2, 'P(■◆) P(▲★)');
  A3.start = () => drawers(A3, ...DRAWERS);

  // ---------------------------------------------------------------- THE RADAR STATION (a sector of contact puzzles)
  const SIX = '■=01 ▲=01 ●=01 ◆=01 ★=01 ⬟=01 ✚=01 ⬢=01\n■▲●◆★⬟✚⬢';
  const A4 = {
    id: 'A4', mode: 'auth', name: 'THE MOLE',
    template: SIX,
    auth: {
      challenge: 2, key: 6, overheard: 1, hears: 'both', leak: true, cast: 'radar', maxForge: 0.3, maxLen: 2,
      medals: [{ forge: 0.25 }, { equip: 11 }],
    },
    enc: ['NOT', 'IF', 'PARITY'], dec: [],
    goal: 'Impostor gets through ≤ 30% · answer ≤ 2 lamps',
    objectives: [
      'Friend: our aircraft always pass the interrogation.',
      'Foe: the impostor knows your method, has overheard one exchange, and is told ONE lamp of tonight’s key by the mole. It gets through on at most 30% of nights.',
      'The answer is at most 2 lamps.',
    ],
    medalCaptions: ['Station secured', 'Airtight · impostor ≤ 25%', 'Lean · ≤ 11 equipment'],
    briefing:
      'THE RADAR STATION watches the sky, and every blip is asked: friend or foe? The interrogator flashes two lamps; a friendly aircraft’s transponder must flash back the right answer, worked out from tonight’s six-lamp key. The enemy’s imitation station listens and has caught one exchange. Then it sends up a decoy that answers in our voice.\n\n' +
      'Worse: there is a mole in the cipher room where the key sheets are printed. Every night he reads ONE lamp of the key (we never know which) and passes it to the enemy.\n\n' +
      'With the Long Wire drawers the decoy now gets through almost one night in three. Get it under 30%.',
    hints: [
      'Wherever an answer lamp is a plain key lamp, the mole’s lamp can BE that answer lamp. No single key lamp should go on the air by itself.',
      'Make every answer lamp a PARITY of two key lamps (or more). One leaked lamp then tells the enemy nothing about that answer lamp: its partner still hides it.',
      'Mix every lamp, and keep the four drawers independent of each other: P(●◆) P(★⬟) | P(✚⬢) P(●★) | P(◆✚) P(⬟⬢) | P(●⬟✚) P(◆★⬢).',
    ],
    debrief: {
      title: 'Diffusion',
      text:
        'Claude Shannon\'s 1949 "Communication Theory of Secrecy Systems" asked that every output bit depend on many key bits (diffusion), so that learning a little of the key teaches the enemy almost nothing. ' +
        'Stolen key material is the commonest way real systems fall: John Walker\'s spy ring sold US Navy key lists to the Soviet Union from 1967 to 1985. ' +
        'Defence in depth means mixing the key thoroughly, changing it often, and assuming that some of it will leak. IFF is no exception: the daily crypto keys of Mode 4 IFF are guarded as closely as any cipher.',
    },
    start: () => drawers(A4, ...DRAWERS),
  };
  A4.solution = { state: { strip: drawers(A4, 'P(●◆) P(★⬟)', 'P(✚⬢) P(●★)', 'P(◆✚) P(⬟⬢)', 'P(●⬟✚) P(◆★⬢)') } };
  A4.anti = [
    { strip: drawers(A4, ...DRAWERS) }, // the Long Wire drawers: bare key lamps
    { strip: drawers(A4, '●', '◆', '★', '⬟') }, // one-lamp codebook
    { strip: drawers(A4, 'P(●◆)', 'P(★⬟)', 'P(✚⬢)', 'P(●★✚)') }, // mixed, but one lamp: a coin toss
    { strip: strip(A4, 'P(■●◆) P(▲★⬟)') }, // linear
  ];

  const A5 = {
    id: 'A5', mode: 'auth', name: 'ONE KEY, ALL NIGHT',
    template: SIX,
    auth: {
      challenge: 2, key: 6, overheard: [1, 2, 3], hears: 'both', cast: 'radar', maxForge: 0.5, maxLen: 2,
      medals: [{ forge: 0.375 }, { equip: 3 }],
    },
    enc: ['NOT', 'IF', 'PARITY'], dec: [],
    goal: 'Impostor ≤ 50% after 1, 2 and 3 intercepts · answer ≤ 2 lamps',
    objectives: [
      'Friend: our aircraft always pass the interrogation.',
      'The same key serves all night: four interrogations, one per possible challenge. Even when the enemy has heard the other three, the impostor gets through at most 50% of the time.',
      'The answer is at most 2 lamps.',
    ],
    medalCaptions: ['Station secured', 'Airtight · ≤ 37.5% all night', 'Lean · ≤ 3 equipment'],
    briefing:
      'The couriers can no longer reach the radar station every hour. One key sheet has to last the whole night: four interrogations (each possible challenge once), all answered from the same six key lamps.\n\n' +
      'The imitation station tapes every exchange. By the last interrogation of the night it has heard the other three.\n\n' +
      'The Long Wire drawers hold beautifully for two exchanges and then collapse. Find an answer whose odds hold up all night. The console shows the impostor’s odds after one, two and three intercepts.',
    hints: [
      'Every lamp the enemy hears is information about the key, and it adds up. A drawer that borrows from other drawers is given away once the enemy has heard those drawers.',
      'If no two drawers share key lamps, what the enemy hears from one drawer says nothing about another, however much it hears. Four drawers of one fresh key lamp each hold at 50% all night.',
      'Spend all six lamps and share none: ● | ◆ | ★ ⬟ | ✚ ⬢. Two challenges get a coin toss, two get one chance in four: 37.5% after every exchange.',
    ],
    debrief: {
      title: 'Key lifetime',
      text:
        'A key wears out with use: every exchange the enemy records is a little more information about it. Perfect secrecy needs fresh key for every use (Shannon\'s one-time pad); practical systems use keys long enough that they never wear out before they are changed. ' +
        'That is why IFF crypto keys are changed daily, why DRYAD authentication sheets were replaced on a fixed schedule, and why modern protocols such as TLS 1.3 re-key after a set amount of traffic.',
    },
    start: () => drawers(A5, ...DRAWERS),
  };
  A5.solution = { state: { strip: drawers(A5, '●', '◆', '★ ⬟', '✚ ⬢') } };
  A5.anti = [
    { strip: drawers(A5, ...DRAWERS) }, // the Long Wire drawers: 100% after three intercepts
    { strip: drawers(A5, '● ◆', '★ ⬟', '✚ ⬢', '● ★') }, // a copied drawer
    { strip: drawers(A5, '●', '◆', '★', 'P(●◆★)') }, // the parity trick: fine for two, not for three
    { strip: strip(A5, 'P(■●◆) P(▲★⬟)') }, // linear
  ];

  const A6 = {
    id: 'A6', mode: 'auth', name: 'SEALED ORDERS',
    template: '■=01 ▲=01 ●=01 ◆=01 ★=01 ⬟=01\n■▲●◆★⬟',
    auth: {
      challenge: 2, key: 4, overheard: 1, hears: 'both', alter: true, maxForge: 0.4, maxLen: 2,
      medals: [{ forge: 0.25 }, { equip: 7 }],
    },
    enc: ['NOT', 'IF', 'PARITY'], dec: [],
    goal: 'Forged order passes ≤ 40% · seal ≤ 2 lamps',
    objectives: [
      'Our orders always pass the pilot’s check of the seal.',
      'The impostor sees one sealed order, then sends a DIFFERENT order of its choosing with a forged seal. It passes at most 40% of the time.',
      'The seal is at most 2 lamps.',
    ],
    medalCaptions: ['Station secured', 'Airtight · forged order ≤ 25%', 'Lean · ≤ 7 equipment'],
    briefing:
      'The radar station guides our night fighters by radio: two-lamp orders telling each pilot which sector to intercept, sent in the clear. The enemy has learned to cut in: it lets our order go by, then sends one of its own and sends the fighters the wrong way.\n\n' +
      'So every order now carries a SEAL, worked out from the order and a four-lamp key that is used for that one order only. The pilot works the seal out too, and obeys only if it matches.\n\n' +
      'The impostor has seen our order and its seal. It may forge ANY other order, whichever it can seal best. Four key lamps, a two-lamp seal.',
    hints: [
      'The impostor chooses which order to forge, so your seal is only as strong as its weakest pair of orders. If two orders’ seals share a key lamp, it forges the one that shares with what it saw.',
      'Give each order a two-lamp “view” of the key so that no two views overlap: no key lamp, and no parity of key lamps, may be readable from two different orders’ seals. ● ◆ and ★ ⬟ are two such views; the other two must be made of parities.',
      '● ◆ | ★ ⬟ | P(●★) P(◆⬟) | P(●⬟) P(◆★⬟). Any one seal then says nothing about any other.',
    ],
    debrief: {
      title: 'One-time MACs',
      text:
        'A seal (a message authentication code) protects the order itself, not just who sent it: change the order and the seal no longer fits. Carter and Wegman showed around 1980 that a key used for a single message can make forgery provably as hard as guessing the seal outright; your seal is their idea in miniature (mathematically, a·order + b in a four-element field). ' +
        'Poly1305, which authenticates much of today\'s web traffic, is the same idea with 130-bit arithmetic and a fresh key for every message. One caution: a seal alone does not stop the enemy re-sending yesterday\'s genuine order. Real protocols seal a sequence number too.',
    },
    start: () => drawers(A6, '● ◆', '★ ⬟', '● ★', '◆ ⬟'),
  };
  A6.solution = { state: { strip: drawers(A6, '● ◆', '★ ⬟', 'P(●★) P(◆⬟)', 'P(●⬟) P(◆★⬟)') } };
  A6.anti = [
    { strip: drawers(A6, '● ◆', '★ ⬟', '● ★', '◆ ⬟') }, // seals share key lamps
    { strip: drawers(A6, '●', '◆', '★', '⬟') }, // one-lamp seal: a coin toss at best
    { strip: strip(A6, 'P(■●◆) P(▲★⬟)') }, // linear: altered at will
    { strip: strip(A6, '● ◆') }, // the same seal on every order
  ];

  CoC.data.LEVELS.push(A1, A2, A3, A4, A5, A6);

  // ------------------------------------------------------------------ the war game (DOM-free)
  // `overheard` may be a number or a list (A5: the key must survive 1, 2 and 3 intercepts); `M` is the most.
  function info(level) {
    const cfg = level.auth;
    const tpl = engine.templateOf(level);
    const list = [].concat(cfg.overheard);
    return {
      cfg, tpl, C: cfg.challenge, K: cfg.key, nc: 1 << cfg.challenge, nk: 1 << cfg.key, M: Math.max(...list), list,
      hidden: cfg.hears === 'answers', jam: !!cfg.jam, leak: !!cfg.leak, alter: !!cfg.alter,
    };
  }
  const keyBit = (k, j, K) => (k >> (K - 1 - j)) & 1;

  // tab[c][k] = HQ's answer to challenge (or order) c under key k
  function answerTable(level, items) {
    const { C, K, nc, nk } = info(level);
    const tab = [];
    for (let c = 0; c < nc; c++) {
      tab.push([]);
      for (let k = 0; k < nk; k++) tab[c].push(engine.runEncoder(level, items, bits(c, C) + bits(k, K)).out);
    }
    return tab;
  }

  // The line: what may arrive when `s` goes on the air, with its probability.
  const arrivals = (jam, s) => (!jam || !s.length ? [[s, 1]] : [...s].map((_, i) => [flipAt(s, i), 1 / s.length]));
  // Does the unit confirm contact when `got` arrives and its own answer is `own`?
  const unitAccepts = (jam, got, own) => (jam ? got.length === own.length && ham(got, own) <= 1 : got === own);
  // Chance that sending `x` is accepted when the true answer is `r` (the jammer then flips one of x's lamps).
  function acceptOdds(jam, x, r) {
    if (!jam) return x === r ? 1 : 0;
    if (x.length !== r.length) return 0;
    if (!x.length) return 1;
    const d = ham(x, r);
    return d === 0 ? 1 : d <= 2 ? d / x.length : 0;
  }
  // Chance of hearing `h` on the air when HQ sent `r`.
  function hearOdds(jam, h, r) {
    if (!jam || !r.length) return h === r ? 1 : 0;
    return h.length === r.length && ham(h, r) === 1 ? 1 / r.length : 0;
  }

  // The impostor's best transmission against a weighted spread of possible true answers (Map r -> weight).
  const STRINGS = [];
  const allStrings = (L) => {
    if (!STRINGS[L]) {
      STRINGS[L] = [];
      for (let i = 0; i < 1 << L; i++) STRINGS[L].push(bits(i, L));
    }
    return STRINGS[L];
  };
  function bestBets(jam, dist) {
    let best = -1;
    let picks = [];
    const consider = (x) => {
      let s = 0;
      for (const [r, w] of dist) s += w * acceptOdds(jam, x, r);
      if (s > best + 1e-12) (best = s), (picks = [x]);
      else if (Math.abs(s - best) <= 1e-12 && !picks.includes(x)) picks.push(x);
    };
    if (!jam) for (const r of dist.keys()) consider(r);
    else {
      const lens = new Set([...dist.keys()].map((r) => r.length));
      for (const L of lens) {
        if (L <= 10) allStrings(L).forEach(consider);
        else for (const r of dist.keys()) if (r.length === L) (consider(r), [...r].forEach((_, i) => consider(flipAt(r, i))));
      }
    }
    return { best: Math.max(0, best), picks };
  }

  // Exact odds of the optimal impostor after M intercepts: average over keys, over every sequence of distinct
  // challenges (M overheard, then the fresh one), every jammed lamp and every leaked key lamp. Situations that
  // look the same to the enemy are pooled; it sends whatever is most likely to be accepted across them.
  // With `alter` there is no fresh challenge: the impostor picks the order it forges (any order it has not
  // seen), with the seal most likely to pass.
  function forgeryOdds(level, tab, M = info(level).M) {
    const { nc, nk, K, hidden, jam, leak, alter } = info(level);
    const leaks = leak ? [...Array(K).keys()] : [-1];
    const groups = new Map();
    let total = 0;
    const seq = [];
    const len = alter ? M : M + 1;
    const add = (g, key, r, w) => {
      let d = g.get(key);
      if (!d) g.set(key, (d = new Map()));
      d.set(r, (d.get(r) || 0) + w);
    };
    (function rec(used) {
      if (seq.length === len) {
        const cs = alter ? -1 : seq[M];
        for (let k = 0; k < nk; k++) {
          for (const j of leaks) {
            const base = cs + '|' + (j >= 0 ? j + '=' + keyBit(k, j, K) : '') + '|';
            (function heard(i, view, w) {
              if (i === M) {
                let g = groups.get(view);
                if (!g) groups.set(view, (g = new Map()));
                if (alter) {
                  for (let o = 0; o < nc; o++) if (!(used & (1 << o))) add(g, o, tab[o][k], w);
                } else add(g, cs, tab[cs][k], w);
                return;
              }
              for (const [h, p] of arrivals(jam, tab[seq[i]][k])) heard(i + 1, view + (hidden ? '' : seq[i] + ':') + h + '|', w * p);
            })(0, base, 1 / leaks.length);
          }
          total++;
        }
        return;
      }
      for (let c = 0; c < nc; c++) {
        if (used & (1 << c)) continue;
        seq.push(c);
        rec(used | (1 << c));
        seq.pop();
      }
    })(0);
    let won = 0;
    const cache = new Map();
    const bestOf = (dist) => {
      if (!jam) return Math.max(...dist.values());
      const sig = [...dist].map(([r, w]) => r + '=' + w.toFixed(10)).sort().join(',');
      let b = cache.get(sig);
      if (b === undefined) cache.set(sig, (b = bestBets(jam, dist).best));
      return b;
    };
    for (const g of groups.values()) {
      let b = 0;
      for (const dist of g.values()) b = Math.max(b, bestOf(dist));
      won += b;
    }
    return total ? won / total : 1;
  }

  // Weight the enemy gives key k after hearing `heard` (= [{c, h}]) and the spy's report `spy` ({j, bit} or
  // null), fresh challenge `cs` (or -1): the likelihood of what it knows under k. Hearing answers only, every
  // way distinct unheard challenges could have produced the answers is counted.
  function keyWeight(level, tab, k, heard, cs, spy) {
    const { nc, K, hidden, jam } = info(level);
    if (spy && keyBit(k, spy.j, K) !== spy.bit) return 0;
    if (!hidden) return heard.reduce((w, x) => w * hearOdds(jam, x.h, tab[x.c][k]), 1);
    let n = 0;
    (function rec(i, used, w) {
      if (!w) return;
      if (i === heard.length) return void (n += w);
      for (let c = 0; c < nc; c++) if (!(used & (1 << c)) && c !== cs) rec(i + 1, used | (1 << c), w * hearOdds(jam, heard[i].h, tab[c][k]));
    })(0, 0, 1);
    return n;
  }

  // One night, fully reasoned out: what the enemy heard, how the candidates shrank, what it sent.
  function playNight(level, tab, night) {
    const { nc, nk, K, M, jam, leak, alter } = info(level);
    const rng = engine.makeRng(night.seed);
    const jams = night.jam || [];
    const spy = leak ? { j: (night.leak || 0) % K, bit: keyBit(night.key, (night.leak || 0) % K, K) } : null;
    const heard = night.chal.slice(0, M).map((c, i) => {
      const r = tab[c][night.key];
      const j = jam ? jamIndex(r, jams[i] || 0) : -1;
      return { c, r, j, h: j >= 0 ? flipAt(r, j) : r };
    });
    const weights = (hs, cs) => {
      const w = [];
      for (let k = 0; k < nk; k++) w.push(keyWeight(level, tab, k, hs, cs, spy));
      return w;
    };
    const prior = weights([], -1);
    const steps = [];
    for (let i = 1; i <= M; i++) steps.push(weights(heard.slice(0, i), -1));
    // the challenge it must answer, or (altering orders) the order it chooses to forge
    let cs = alter ? -1 : night.chal[M];
    let final = weights(heard, cs);
    const distFor = (c, w) => {
      const dist = new Map();
      for (let k = 0; k < nk; k++) if (w[k]) dist.set(tab[c][k], (dist.get(tab[c][k]) || 0) + w[k]);
      return dist;
    };
    let dist;
    let bet;
    if (alter) {
      let options = [];
      let top = -1;
      for (let o = 0; o < nc; o++) {
        if (heard.some((x) => x.c === o)) continue;
        const d = distFor(o, final);
        const b = bestBets(jam, d);
        if (b.best > top + 1e-12) (top = b.best), (options = [{ o, d, b }]);
        else if (Math.abs(b.best - top) <= 1e-12) options.push({ o, d, b });
      }
      const pick = options[rng.int(options.length)];
      cs = pick.o;
      dist = pick.d;
      bet = pick.b;
    } else {
      dist = distFor(cs, final);
      bet = bestBets(jam, dist);
    }
    const forged = bet.picks.length ? bet.picks[rng.int(bet.picks.length)] : '';
    const sum = [...dist.values()].reduce((a, b) => a + b, 0) || 1;
    const genuine = tab[cs][night.key];
    const fj = jam ? jamIndex(forged, jams[M] || 0) : -1;
    const arrived = fj >= 0 ? flipAt(forged, fj) : forged;
    return {
      heard, cs, spy, prior, steps, final, genuine, forged, arrived, fj,
      tally: [...dist]
        .sort((a, b) => b[1] - a[1] || (b[0] === forged) - (a[0] === forged))
        .map(([r, w]) => ({ r, w, keys: final.filter((x, k) => x && tab[cs][k] === r).length })),
      alive: final.filter(Boolean).length,
      odds: bet.best / sum,
      success: unitAccepts(jam, arrived, genuine),
      replay: heard.findIndex((x) => x.h === forged),
    };
  }

  function randomNight(level, rng) {
    const { nc, nk, K, M, alter } = info(level);
    const order = [...Array(nc).keys()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    return {
      key: rng.int(nk),
      chal: order.slice(0, alter ? M : M + 1),
      seed: 1 + rng.int(1e9),
      jam: Array.from({ length: M + 1 }, () => rng.int(720)),
      leak: rng.int(K),
    };
  }

  const answerLen = (tab) => {
    let max = 0;
    for (const row of tab) for (const r of row) max = Math.max(max, r.length);
    return max;
  };

  // what the answer depends on, for plain-language diagnosis
  function dependence(tab) {
    let onKey = false;
    let onChal = false;
    for (let c = 0; c < tab.length && !onKey; c++) onKey = tab[c].some((r) => r !== tab[c][0]);
    for (let k = 0; k < tab[0].length && !onChal; k++) onChal = tab.some((row) => row[k] !== tab[0][k]);
    return { onKey, onChal };
  }
  // smallest distance between two different answers to the same challenge
  function minDistance(tab) {
    let d = Infinity;
    for (const row of tab) {
      const seen = [...new Set(row)];
      for (let i = 0; i < seen.length; i++)
        for (let j = i + 1; j < seen.length; j++) d = Math.min(d, seen[i].length === seen[j].length ? ham(seen[i], seen[j]) : Infinity);
    }
    return d;
  }
  // is some answer lamp a plain copy of one key lamp (for some challenge)? A spy's single lamp then reads it.
  function bareKeyLamp(tab, K) {
    for (const row of tab) {
      const L = row[0].length;
      if (row.some((r) => r.length !== L)) continue;
      for (let i = 0; i < L; i++)
        for (let j = 0; j < K; j++) {
          let same = true;
          let flip = true;
          for (let k = 0; k < row.length && (same || flip); k++) {
            const b = +row[k][i];
            const kb = (k >> (K - 1 - j)) & 1;
            if (b !== kb) same = false;
            if (b === kb) flip = false;
          }
          if (same || flip) return true;
        }
    }
    return false;
  }

  const itemsOf = (state) => (state && Array.isArray(state.strip) ? state.strip : []);
  const nounOf = (level) => (level.auth.alter ? 'seal' : 'answer');

  function evaluate(level, state, opts = {}) {
    const { cfg, M, K, list, jam, leak, alter } = info(level);
    const items = itemsOf(state);
    const tab = answerTable(level, items);
    const odds = list.map((m) => forgeryOdds(level, tab, m));
    const forge = Math.max(...odds);
    const len = answerLen(tab);
    const equip = engine.countEquipment(items, [], []);
    const dep = dependence(tab);
    const forgeOk = forge <= cfg.maxForge + 1e-9;
    const lenOk = len > 0 && len <= cfg.maxLen;
    const passed = forgeOk && lenOk;
    const medalOk = (m) =>
      m.forge !== undefined ? (m.at ? odds[list.indexOf(m.at)] : forge) <= m.forge + 1e-9 : m.len !== undefined ? len <= m.len : equip <= m.equip;
    const medals = [passed, passed && medalOk(cfg.medals[0]), passed && medalOk(cfg.medals[1])];
    const noun = nounOf(level);
    const lifetime = list.length > 1;

    let why = '';
    if (!len) why = 'HQ sends nothing, and silence is easy to imitate.';
    else if (!dep.onChal) why = alter ? 'Your seal is the same for every order: the impostor copies it onto its own order.' : 'Your answer never changes with the challenge: the impostor replays what it heard.';
    else if (!dep.onKey) why = `Your ${noun} ignores the key: the impostor works it out exactly as the unit does.`;
    else if (lifetime && odds[odds.length - 1] > cfg.maxForge + 1e-9 && odds[0] <= cfg.maxForge + 1e-9)
      why = 'Your key holds for the first exchanges, then gives way: what the enemy hears adds up over the night.';
    else if (odds[0] > 0.999) why = `From what it overheard, the impostor can compute the ${noun} it needs: a recipe made of XORs is solved like an equation.`;
    else if (jam && minDistance(tab) < 3)
      why = `Two of HQ’s possible answers differ in only ${minDistance(tab)} lamp${minDistance(tab) === 1 ? '' : 's'}: with one wrong lamp forgiven, “close” is good enough for the impostor.`;
    else if (leak && bareKeyLamp(tab, K)) why = 'Some answer lamp is a plain copy of one key lamp: when the mole reads that lamp, the answer lamp is read too.';

    const reasons = [];
    if (!forgeOk)
      reasons.push(
        alter
          ? `forged orders pass ${pct(forge)} of the time (limit ${pct(cfg.maxForge)})`
          : `the impostor gets through ${pct(forge)} of nights${lifetime ? ' at worst' : ''} (limit ${pct(cfg.maxForge)})`
      );
    if (len > cfg.maxLen) reasons.push(`${noun} is ${len} lamps (limit ${cfg.maxLen})`);
    const summary = passed
      ? `${alter ? 'Forged orders pass' : 'Impostor gets through'} ${lifetime ? `${odds.map(pct).join(' / ')} after ${list.join(' / ')} intercepts` : `${pct(forge)} ${alter ? 'of the time' : 'of nights'}`} (limit ${pct(cfg.maxForge)}); ${alter ? 'our own orders always pass' : cfg.cast === 'radar' ? 'our aircraft always pass' : 'HQ always makes contact'}. ${plural(len, 'lamp')}, ${equip} equipment.`
      : `Not yet: ${reasons.join('; ') || why}.${why && reasons.length ? ' ' + why : ''}`;

    const rng = engine.makeRng(opts.seed !== undefined ? opts.seed : Math.floor(Math.random() * 1e9));
    const log = [
      {
        ok: len > 0,
        text: len > 0 ? `${alter ? 'Our orders always pass' : cfg.cast === 'radar' ? 'Our aircraft always pass' : 'HQ always makes contact'} (the same ${noun} is worked out at both ends${jam ? ', one jammed lamp forgiven' : ''})` : 'HQ sends nothing at all',
      },
    ];
    if (lifetime) list.forEach((m, i) => log.push({ ok: odds[i] <= cfg.maxForge + 1e-9, text: `After ${plural(m, 'intercept')}: impostor gets through ${pct(odds[i])}` }));
    if (why && !passed) log.splice(1, 0, { ok: false, text: why });
    let caught = 0;
    const NIGHTS = 12;
    for (let i = 1; i <= NIGHTS; i++) {
      const night = randomNight(level, rng);
      const n = playNight(level, tab, night);
      if (!n.success) caught++;
      const how = n.alive === 1 ? 'key pinned' : n.tally.length === 1 ? `${n.alive} keys, all agree` : `${plural(n.alive, 'key')} left`;
      const sent = n.replay >= 0 && !dep.onChal ? 'replayed' : 'sent';
      log.push({
        ok: !n.success,
        text: alter
          ? `Night ${i}: ${n.success ? 'FORGED ORDER OBEYED' : 'exposed'}, ${how}; order ${bits(n.cs, level.auth.challenge)} sealed ${n.forged || '(nothing)'}, true ${n.genuine || '(nothing)'}`
          : `Night ${i}: ${n.success ? 'FOOLED' : 'exposed'}, ${how}; ${sent} ${n.forged || '(nothing)'}, true ${n.genuine || '(nothing)'}`,
        data: night,
      });
    }

    return {
      passed,
      medals,
      summary,
      gauges: [
        { frac: forge, text: pct(forge), ok: forgeOk },
        { frac: Math.min(1, len / (2 * cfg.maxLen)), text: plural(len, 'lamp'), ok: lenOk },
      ],
      log,
      stats: [
        {
          label: alter ? 'Forged orders pass' : 'Impostor gets through',
          value: pct(forge),
          note: lifetime ? `worst of ${list.join('/')} intercepts · limit ${pct(cfg.maxForge)}` : `limit ${pct(cfg.maxForge)} · ${plural(M, 'intercept')}${leak ? ' + mole' : ''}`,
        },
        { label: alter ? 'Seal length' : 'Answer length', value: plural(len, 'lamp'), note: `budget ${cfg.maxLen}` },
        { label: 'Equipment used', value: String(equip), note: cfg.medals.some((m) => m.equip !== undefined) ? `par ${cfg.medals.find((m) => m.equip !== undefined).equip}` : '' },
      ],
      forge, odds, len, equip, caught,
    };
  }

  function defaultState(level) {
    // Start from the last procedure each mission inherits (level.start), else A1's old password.
    if (level.start) return { strip: level.start() };
    const keys = engine.templateOf(level).vars.slice(level.auth.challenge).map((x) => x.sym);
    return { strip: strip(level, keys.join(' ')) };
  }

  // ------------------------------------------------------------------ UI
  const KEY_SVG =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="8" r="3.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.2 8H15M12.5 8v3M14.6 8v2.2" stroke="currentColor" stroke-width="2" fill="none"/></svg>';
  const MIC_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const BOLT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L5 13h6l-2 9 9-12h-6z" fill="currentColor"/></svg>';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const cell = (v, extra = '') => `<span class="tpl-cell var mini c-${v.color}${extra}">${esc(v.sym)}</span>`;
  const lampHTML = (bit, cls = '') => `<span class="tile lamp ${bit === '1' ? 'lit' : bit === '0' ? 'dark' : 'mark'} ${cls}"><b>${esc(bit)}</b></span>`;
  // lamps, with the jammed lamp (index j) marked
  const lampsHTML = (s, cls = '', j = -1) =>
    s ? [...s].map((b, i) => lampHTML(b, cls + (i === j ? ' auth-jammed' : ''))).join('') : '<em class="auth-none">nothing</em>';
  const keyColors = (level) => engine.templateOf(level).vars.slice(level.auth.challenge).map((v) => v.color).join(' ');

  // Who is who, in each mission's fiction.
  const WORDS = {
    front: {
      desk: 'HQ answer strip', deskSub: 'What HQ flashes back.',
      field: 'Front-line unit', input: 'Challenge', roll: 'New challenge', hq: 'HQ', out: 'Answer', check: 'Unit’s check',
      own: 'the unit’s own answer', real: 'from “HQ”', fake: 'from the impostor', ok: 'Contact confirmed', caught: 'Impostor exposed',
      fooled: 'Impostor obeyed', absent: 'the real HQ is not on the air', courier: 'up to the unit',
      ask: (i, l) => `Exchange ${i}: a voice claims to be HQ. The unit challenges: ${l}.`,
      strike: (l) => `A new voice on HQ’s frequency claims to be HQ. The unit challenges: ${l} (a fresh challenge).`,
      win: 'The answer is wrong. The unit exposes the impostor and keeps listening for the real HQ.',
      lose: (sure) => (sure ? 'The unit takes the impostor for HQ and obeys: what the enemy overheard gave your answer away.' : 'The impostor’s guess was close enough this time. The unit takes it for HQ and obeys.'),
    },
    radar: {
      desk: 'Transponder strip', deskSub: 'What our aircraft flash back.',
      field: 'Radar interrogator', input: 'Challenge', roll: 'New challenge', hq: 'Our aircraft', out: 'Reply', check: 'Radar’s check',
      own: 'the radar’s own answer', real: 'from a “friendly” aircraft', fake: 'from the decoy', ok: 'Friend', caught: 'Foe exposed',
      fooled: 'Decoy waved through', absent: 'no friendly aircraft in this sector', courier: 'to the aircrews and the radar',
      ask: (i, l) => `Contact ${i}: a blip on the screen. The radar interrogates: ${l}.`,
      strike: (l) => `A new blip, flying in from the enemy side. The radar interrogates: ${l} (a fresh challenge).`,
      win: 'Wrong reply: the radar marks the blip as FOE and the guns are warned.',
      lose: (sure) => (sure ? 'The decoy gives the right reply and is waved through: what the enemy overheard gave your answer away.' : 'The decoy’s guess was close enough this time, and it is waved through.'),
    },
    orders: {
      desk: 'Seal strip', deskSub: 'What HQ stamps on each order.',
      field: 'HQ’s order', input: 'Order', roll: 'New order', hq: 'HQ', out: 'Seal', check: 'Pilot’s check',
      own: 'the pilot’s own seal', real: 'from HQ', fake: 'from the impostor', ok: 'Order authenticated', caught: 'Forgery exposed',
      fooled: 'Forged order obeyed', absent: 'HQ sent no such order', courier: 'to HQ and the pilots',
      ask: (i, l) => `Order ${i}: HQ sends order ${l} with its seal.`,
      strike: (l) => `The impostor cuts in with an order of its own choosing: ${l}.`,
      win: 'The seal does not fit. The pilot ignores the forged order.',
      lose: (sure) => (sure ? 'The seal fits and the pilot turns the wrong way: the seal it saw gave this one away.' : 'The forged seal happens to fit, and the pilot turns the wrong way.'),
    },
  };
  const wordsOf = (level) => WORDS[level.auth.cast || (level.auth.alter ? 'orders' : 'front')];

  function briefingHTML(level) {
    const { tpl, C, M, list, hidden, jam, leak, alter } = info(level);
    const ch = tpl.vars.slice(0, C);
    const ky = tpl.vars.slice(C);
    const heard = list.length > 1 ? `${list.join(', ')} exchanges in turn` : plural(M, 'exchange');
    return `<h4>${alter ? 'The seal' : 'The challenge'}</h4>
      <div class="auth-brief" data-keys="${keyColors(level)}">
        <div><span class="auth-brief-tag">${alter ? 'Order' : 'Challenge'}</span>${ch.map((v) => cell(v)).join('')}<small>${alter ? 'chosen by HQ; the impostor may forge any order it has not seen' : 'random, never repeated in a night'}</small></div>
        <div><span class="auth-brief-tag">Key</span>${ky.map((v) => cell(v)).join('')}<small>${alter ? 'secret, used for one order only' : 'secret, new every night'}</small></div>
        <div><span class="auth-brief-tag">Impostor</span><small>knows your method · has overheard ${heard}: ${hidden ? 'HQ’s answers only' : alter ? 'order <b>and</b> seal' : 'challenge <b>and</b> answer'}</small></div>
        ${leak ? '<div><span class="auth-brief-tag">Mole</span><small>reads one random lamp of each night’s key and passes it to the enemy</small></div>' : ''}
        ${jam ? '<div><span class="auth-brief-tag">Jammer</span><small>flips one lamp of every answer on the air; the unit forgives one wrong lamp</small></div>' : ''}
      </div>`;
  }

  function gauges(level) {
    return [
      { title: 'Impostor gets through', zone: [0, level.auth.maxForge] },
      { title: 'Answer length', zone: [0, 0.5] },
    ];
  }

  function mount(root, api) {
    const level = api.level;
    const { tpl, C, K, nk, M, hidden, jam, leak, alter } = info(level);
    const W = wordsOf(level);
    let state = api.getState();
    // saved strips may be stale or carry ids from another session
    try {
      const nv = tpl.vars.length;
      const check = (it) => {
        if ((it.t === 'src' || it.t === 'if') && !(it.v >= 0 && it.v < nv)) throw new Error('stale');
        if (it.vars && it.vars.some((v) => !(v >= 0 && v < nv))) throw new Error('stale');
        (it.items || []).concat(it.then || [], it.else || []).forEach(check);
      };
      itemsOf(state).forEach(check);
      state = { strip: CoC.strip.reviveStrip(itemsOf(state)) };
    } catch (e) {
      state = defaultState(level);
    }
    api.setState(state);
    const cur = () => {
      const st = api.getState();
      if (!st || !Array.isArray(st.strip)) return state;
      return st;
    };

    const view = { chal: 0, key: 0, jam: 0, anim: 0 };
    view.chal = Math.floor(Math.random() * (1 << C));
    view.key = Math.floor(Math.random() * nk);
    view.jam = Math.floor(Math.random() * 720);

    root.innerHTML = `
      <div class="auth${jam ? ' has-jam' : ''}" data-keys="${keyColors(level)}">
        <div class="auth-exchange">
          <section class="auth-st auth-field">
            <header><span class="auth-tag">${W.field}</span><span class="auth-sub">${W.input}</span></header>
            <div class="auth-lamps" data-role="chal"></div>
            <button type="button" class="btn-chip auth-roll" data-act="roll" title="${alter ? 'Try another order' : 'Flash a new random challenge'}${jam ? ' (and jam a different lamp)' : ''}">${W.roll}</button>
          </section>
          <div class="auth-wire" aria-hidden="true"><i></i><span>${W.input.toLowerCase()}</span></div>
          <section class="auth-st auth-hq">
            <header><span class="auth-tag">${W.hq}</span><span class="auth-sub">${alter ? 'This order’s key' : 'Tonight’s key'} ${KEY_SVG}</span></header>
            <div class="auth-lamps auth-keylamps" data-role="key"></div>
            <div class="auth-out"><span class="auth-out-tag">${W.out} ▸</span><span class="auth-out-lamps" data-role="answer"></span></div>
          </section>
          <div class="auth-wire${jam ? ' jammed' : ''}" aria-hidden="true"><i></i>${jam ? `<b class="auth-bolt">${BOLT_SVG}</b>` : ''}<span>${jam ? 'jammer' : W.out.toLowerCase()}</span></div>
          <section class="auth-st auth-check">
            <header><span class="auth-tag">${W.check}</span><span class="auth-sub">${alter ? 'Seal A = B ?' : 'A = B ?'}</span></header>
            <div class="auth-cmp">
              <div><span class="auth-ab">A</span><span class="auth-cmp-who" data-role="awho">received</span><span class="auth-cmp-lamps" data-role="a"></span></div>
              <div><span class="auth-ab">B</span><span class="auth-cmp-who">${W.own}</span><span class="auth-cmp-lamps" data-role="b"></span></div>
            </div>
            <div class="auth-cmp-note" data-role="note"></div>
            <div class="auth-verdict" data-role="verdict"></div>
          </section>
        </div>

        <section class="auth-desk">
          <header class="auth-desk-head">
            <div><h2>${W.desk}</h2><span class="auth-sub">${W.deskSub} Sources: ${W.input.toLowerCase()} lamps and <span class="auth-keyword">${KEY_SVG} key</span> lamps.</span></div>
            <button type="button" class="btn-chip" data-act="reset" title="Back to the last procedure">↺ Reset</button>
          </header>
          <div class="auth-tray"></div>
          <div class="auth-board"></div>
        </section>

        <section class="auth-enemy">
          <header class="auth-enemy-head">
            <span class="auth-ear">${MIC_SVG}</span>
            <div><h2>Enemy imitation station</h2><span class="auth-sub">Knows your method, not the key${leak ? ' (except the mole’s lamp)' : ''}. Overhears ${hidden ? 'HQ’s answers' : 'both sides'} of ${plural(M, 'exchange')}, then ${alter ? 'forges an order of its choosing' : 'goes on the air in our voice'}.</span></div>
          </header>
          <div class="auth-status" data-role="status" aria-live="polite"></div>
          <div class="auth-enemy-body">
            <div class="auth-intercepts">
              <div class="auth-col-tag">Intercepts</div>
              <ol data-role="log"><li class="auth-idle">Run <b>Test transmission</b> to play one night: ${plural(M, 'genuine exchange')}, then the impostor ${alter ? 'forges an order' : 'answers a fresh challenge'}.</li></ol>
            </div>
            <div class="auth-cands">
              <div class="auth-col-tag">Key candidates <b data-role="ncand">${nk} / ${nk}</b></div>
              <div class="auth-grid${nk > 16 ? ' dense' : ''}" data-role="grid"></div>
            </div>
            <div class="auth-forge">
              <div class="auth-col-tag">Impostor’s bet</div>
              <div class="auth-tally" data-role="tally"><span class="auth-dim">waiting</span></div>
            </div>
          </div>
        </section>
      </div>`;

    const $ = (sel) => root.querySelector(sel);
    const R = (role) => root.querySelector(`[data-role="${role}"]`);
    document.body.dataset.authKeys = keyColors(level);

    // --- clickable lamps (challenge, key)
    function lampButtons(el, from, n, value, onToggle, isKey) {
      el.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const v = tpl.vars[from + i];
        const bit = (value >> (n - 1 - i)) & 1;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'auth-lamp' + (isKey ? ' key' : '');
        b.innerHTML = `${lampHTML(String(bit))}${cell(v)}`;
        b.title = `${v.sym} = ${bit}. Click to flip.`;
        b.addEventListener('click', () => {
          if (view.anim) return;
          onToggle(1 << (n - 1 - i));
          api.sfx.click();
        });
        el.appendChild(b);
      }
    }
    function setVerdict(kind, text) {
      const v = R('verdict');
      v.innerHTML = kind ? `<span class="auth-stamp ${kind}">${esc(text)}</span>` : '';
    }
    // A (what arrived, jammed lamp marked) against B (the unit's own answer)
    function compare(arrived, j, own) {
      R('a').innerHTML = lampsHTML(arrived, '', j);
      R('b').innerHTML = lampsHTML(own);
      const d = arrived.length === own.length ? ham(arrived, own) : -1;
      R('note').textContent = !jam
        ? ''
        : d < 0
          ? 'wrong number of lamps'
          : d === 0
            ? 'no lamp differs'
            : `${plural(d, 'lamp')} differ${d === 1 ? 's' : ''}: ${d === 1 ? 'within tolerance' : 'too many'}`;
      return unitAccepts(jam, arrived, own);
    }
    function preview() {
      root.querySelector('.auth').classList.remove('forging');
      R('chal').classList.remove('forged');
      lampButtons(R('chal'), 0, C, view.chal, (m) => ((view.chal ^= m), preview()), false);
      lampButtons(R('key'), C, K, view.key, (m) => ((view.key ^= m), preview()), true);
      let out = '';
      let err = '';
      try {
        out = engine.runEncoder(level, cur().strip, bits(view.chal, C) + bits(view.key, K)).out;
      } catch (e) {
        err = e.message;
      }
      R('answer').innerHTML = err ? `<em class="auth-err">${esc(err)}</em>` : lampsHTML(out);
      R('awho').textContent = W.real.replace(/[“”]/g, '');
      const j = jam ? jamIndex(out, view.jam) : -1;
      compare(j >= 0 ? flipAt(out, j) : out, j, out);
      setVerdict(err ? '' : out ? 'ok' : 'warn', err ? '' : out ? W.ok : 'Silence');
    }

    // --- candidate grid
    function buildGrid() {
      const g = R('grid');
      let html = '';
      for (let k = 0; k < nk; k++)
        html += `<span class="auth-key" data-k="${k}" title="Key ${bits(k, K)}">${[...bits(k, K)].map((b) => `<i class="${b === '1' ? 'on' : ''}"></i>`).join('')}</span>`;
      g.innerHTML = html;
      R('ncand').textContent = `${nk} / ${nk}`;
    }
    buildGrid();

    const editor = new CoC.StripEditor({
      tray: $('.auth-tray'),
      board: $('.auth-board'),
      getLevel: () => level,
      getStrip: () => cur().strip,
      allowedTools: () => new Set(level.enc),
      newTools: () => {
        const seen = new Set();
        for (const l of CoC.data.LEVELS) if (l.id !== level.id && api.isDone(l.id)) for (const op of l.enc || []) seen.add(op);
        return new Set(level.enc.filter((op) => !seen.has(op)));
      },
      markers: () => '01',
      onChange: () => {
        api.changed();
        if (!view.anim) preview();
      },
    });
    editor.render();
    preview();

    root.querySelector('[data-act="roll"]').addEventListener('click', () => {
      if (view.anim) return;
      view.chal = Math.floor(Math.random() * (1 << C));
      view.jam = Math.floor(Math.random() * 720);
      api.sfx.tick();
      preview();
    });
    root.querySelector('[data-act="reset"]').addEventListener('click', () => {
      if (view.anim) return;
      cur().strip.splice(0, cur().strip.length, ...defaultState(level).strip);
      editor.render();
      api.sfx.remove();
      api.changed();
      preview();
    });

    const ctl = {
      root, R, view, preview, buildGrid, setVerdict, compare, editor, getStrip: () => cur().strip,
      lampButtons,
      destroy() {
        view.anim = 0;
        if (CoC.strip && CoC.strip.closePopover) CoC.strip.closePopover();
        delete document.body.dataset.authKeys;
      },
      render() {
        editor.render();
        preview();
      },
    };
    mounted = ctl;
    return ctl;
  }
  let mounted = null;

  // TEST TRANSMISSION: play one night (or replay a logged one).
  async function test(api, data) {
    const ctl = mounted;
    if (!ctl || !document.body.contains(ctl.root)) return;
    const level = api.level;
    const { tpl, C, K, nk, M, hidden, jam, alter } = info(level);
    const W = wordsOf(level);
    const { R, view } = ctl;
    const token = ++animSeq;
    view.anim = token;
    const live = () => view.anim === token;
    const wait = async (ms) => {
      await api.sleep(ms);
      if (!live()) throw new Error('__cancel');
    };
    const tab = answerTable(level, ctl.getStrip());
    const night = data || randomNight(level, engine.makeRng(Math.floor(Math.random() * 1e9)));
    const n = playNight(level, tab, night);
    const status = (html, cls = '') => {
      const s = R('status');
      s.className = 'auth-status ' + cls;
      s.innerHTML = html;
    };
    const chalLamps = (c) => ctl.lampButtons(R('chal'), 0, C, c, () => {}, false);
    ctl.buildGrid();
    const grid = [...R('grid').children];
    const setCands = (w) => {
      let alive = 0;
      w.forEach((x, k) => {
        const el = grid[k];
        if (!x && !el.classList.contains('out')) el.classList.add('out', 'struck');
        if (x) alive++;
      });
      R('ncand').textContent = `${alive} / ${nk}`;
      return alive;
    };
    const root = ctl.root.querySelector('.auth');
    root.classList.add('testing');
    // on a narrow screen the page scrolls: bring the exchange into view
    if (window.innerWidth <= 900) {
      const top = root.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.4) root.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    const clearCheck = () => {
      R('a').innerHTML = R('b').innerHTML = '';
      R('note').textContent = '';
      ctl.setVerdict('', '');
    };
    try {
      R('log').innerHTML = '';
      R('chal').classList.remove('forged');
      R('tally').innerHTML = '<span class="auth-dim">listening…</span>';
      R('answer').innerHTML = '';
      clearCheck();
      root.classList.remove('forging');
      // night falls: the courier delivers tonight's key
      status(`Night falls. A courier brings ${alter ? 'the key' : 'tonight’s key'} ${W.courier}: ${lampsHTML(bits(night.key, K), 'sm')}. The enemy does not have it.`);
      for (let i = 0; i < 5; i++) {
        ctl.lampButtons(R('key'), C, K, i < 4 ? Math.floor(Math.random() * nk) : night.key, () => {}, true);
        api.sfx.tick();
        await wait(110);
      }
      await wait(500);
      if (n.spy) {
        const v = tpl.vars[C + n.spy.j];
        const btns = R('key').querySelectorAll('.auth-lamp');
        if (btns[n.spy.j]) btns[n.spy.j].classList.add('leaked');
        status(`A mole in the cipher room reads one lamp of the key and passes it on: ${cell(v)} = ${lampsHTML(String(n.spy.bit), 'sm')}.`, 'bad');
        api.sfx.again();
        await wait(700);
        const alive = setCands(n.prior);
        api.sfx.hit();
        status(`The enemy crosses out every key with the wrong ${cell(v)}: <b>${alive}</b> left.`, 'bad');
        await wait(1000);
      }

      for (let i = 0; i < M; i++) {
        const h = n.heard[i];
        root.classList.remove('forging');
        R('awho').textContent = W.real;
        chalLamps(h.c);
        R('answer').innerHTML = '';
        clearCheck();
        status(W.ask(i + 1, lampsHTML(bits(h.c, C), 'sm')));
        api.sfx.click();
        await wait(650);
        R('answer').innerHTML = lampsHTML(h.r);
        api.sfx.place();
        await wait(450);
        ctl.compare(h.h, h.j, h.r);
        ctl.setVerdict(h.r ? 'ok' : 'warn', h.r ? W.ok : 'Silence');
        api.sfx.stamp();
        await wait(500);
        // the enemy writes it down
        const li = document.createElement('li');
        li.innerHTML = `<span class="auth-ix">#${i + 1}</span><span class="auth-ic">${hidden ? '<span class="auth-unk">? ? ?</span>' : lampsHTML(bits(h.c, C), 'sm')}</span><span class="auth-arrow">→</span><span class="auth-ir">${lampsHTML(h.h, 'sm', h.j)}</span>`;
        R('log').appendChild(li);
        api.sfx.tick();
        await wait(350);
        const before = grid.filter((el) => !el.classList.contains('out')).length;
        const alive = setCands(n.steps[i]);
        api.sfx.hit();
        status(
          alive === 1
            ? `The enemy works backwards from what it heard: only <b>one</b> key fits. Your key is pinned.`
            : `The enemy tries every key against what it heard${jam ? ' (allowing for the jammer)' : ''}: ${before - alive ? `${before - alive} crossed out, ` : 'nothing crossed out, '}<b>${alive}</b> still fit.`,
          alive === 1 ? 'bad' : ''
        );
        await wait(1100);
      }

      // the impostor goes on the air
      root.classList.add('forging');
      chalLamps(n.cs);
      R('answer').innerHTML = `<em class="auth-none">${W.absent}</em>`;
      if (alter) R('chal').classList.add('forged');
      clearCheck();
      R('awho').textContent = W.fake;
      status(W.strike(lampsHTML(bits(n.cs, C), 'sm')), 'bad');
      api.sfx.again();
      await wait(800);
      if (hidden) {
        setCands(n.final);
        await wait(300);
      }
      // each surviving key predicts an answer; the impostor sends whatever is most likely to pass
      const groups = n.tally;
      const totalW = groups.reduce((a, g) => a + g.w, 0) || 1;
      R('tally').innerHTML = groups.length
        ? groups
            .slice(0, 4)
            .map(
              (g) =>
                `<div class="auth-bet${g.r === n.forged ? ' pick' : ''}"><span class="auth-bet-r">${lampsHTML(g.r, 'sm')}</span><span class="auth-bar"><i style="width:${Math.round((100 * g.w) / totalW)}%"></i></span><span class="auth-bet-n">${plural(g.keys, 'key')}</span></div>`
            )
            .join('') +
          (groups.length > 4 ? `<div class="auth-dim">+ ${plural(groups.length - 4, 'other answer')}</div>` : '') +
          `<div class="auth-sends"><span>Sends ▸</span>${lampsHTML(n.forged, 'sm')}</div>`
        : '<span class="auth-dim">no key fits</span>';
      const sureness = n.odds > 0.999 ? 'certain' : `${pct(n.odds)} sure`;
      const between = jam && !groups.some((g) => g.r === n.forged);
      status(
        n.alive === 1
          ? `Only one key left, so the impostor simply computes the answer (${sureness}).`
          : groups.length === 1
            ? `All ${n.alive} keys give the same answer${n.replay >= 0 ? `, the one it heard in exchange #${n.replay + 1}` : ''}: no guessing needed.`
            : between
              ? `The surviving keys disagree, so the impostor sends an answer in between, hoping one wrong lamp is forgiven (${sureness}).`
              : `The surviving keys disagree. The impostor bets on the best answer (${sureness}).`,
        n.odds > 0.5 ? 'bad' : ''
      );
      api.sfx.tick();
      await wait(1100);
      R('a').innerHTML = lampsHTML(n.arrived, '', n.fj);
      api.sfx.place();
      await wait(450);
      ctl.compare(n.arrived, n.fj, n.genuine);
      // reveal the true key among the candidates
      grid[night.key].classList.add('truth');
      await wait(450);
      if (n.success) {
        ctl.setVerdict('bad', W.fooled);
        status(W.lose(n.odds > 0.999), 'bad');
        api.sfx.fail();
      } else {
        ctl.setVerdict('ok', W.caught);
        status(W.win, 'good');
        api.sfx.stamp();
      }
      view.chal = n.cs;
      view.key = night.key;
    } catch (e) {
      if (e.message !== '__cancel') throw e;
    } finally {
      if (live()) {
        view.anim = 0;
        root.classList.remove('testing');
        // lamps become editable again (showing tonight's key and the final challenge)
        ctl.lampButtons(R('chal'), 0, C, view.chal, (m) => ((view.chal ^= m), ctl.preview()), false);
        ctl.lampButtons(R('key'), C, K, view.key, (m) => ((view.key ^= m), ctl.preview()), true);
      }
    }
  }
  let animSeq = 0;

  CoC.modes.auth = {
    defaultState,
    evaluate,
    hideLine: true,
    gauges,
    runningText: 'WAR-GAMING EVERY KEY AND EVERY CHALLENGE…',
    consoleText: {
      test: 'play one night',
      exercise: 'every key, every challenge',
      idle: 'Run a field exercise: the impostor tries its luck against every possible key and challenge, and the results print here.',
    },
    briefingHTML,
    mount,
    test,
    // exposed for tests and tuning
    _internal: { answerTable, forgeryOdds, playNight, randomNight },
  };
})();
