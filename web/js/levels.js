/* Chain of Command — campaign data.
 *
 * Level fields
 *   format   : array of slot alphabets, e.g. ['ABC', '123'] -> orders like "B2"
 *   template : alternative to format — '■=ABC ▲=123
■ - ▲' (shared variables, literals)
 *   chain    : the line, in order. {kind, p, ...} — see engine MIDDLEMEN. Optional name/trait override.
 *   enc      : strip tools unlocked at HQ (variable tiles and literals are always available)
 *   dec      : field plates (block ops) plus assembly readers ('VOTE', 'READ_NOT')
 *   arq      : whether the field may reply SAY AGAIN
 *   target   : required accuracy (0..1)
 *   budget   : max average extra symbols per order (re-sends included)
 *   par      : {overhead, blocks} for the 2nd and 3rd medal (blocks = equipment, see engine.countEquipment)
 *   repair   : which REPAIR modes the codebook machine offers
 *   metric   : what the code analyzer measures ('hamming' | 'burst' | 'edit')
 *   solution : reference solution {enc: strip notation, dec: plate spec, asm: reader notation},
 *              verified by tests/verify.js (never shown to the player)
 */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});

  // Campaign structure (sectors, borders, contact missions, raids) lives in theater-data.js.

  const CHARACTERS = {
    pass: { name: 'PVT. RELIABLE', icon: 'reliable', trait: () => 'Never makes mistakes' },
    drop: { name: 'PVT. BUTTERFINGERS', icon: 'drop', trait: (m) => (m.set ? `Drops one of ${fmtSet(m.set)}` : 'Drops a symbol') },
    add: { name: 'SGT. CHATTER', icon: 'add', trait: (m) => `Mutters ${fmtSet(m.set)} into the line` },
    swap: { name: 'CPL. MUDDLE', icon: 'swap', trait: () => 'Swaps two neighbours' },
    garble: { name: 'RADIO STATIC', icon: 'static', trait: () => 'Garbles one symbol' },
    flip: { name: 'ENEMY JAMMER', icon: 'flip', trait: () => 'Flips one lamp' },
    smudge: { name: 'MONSOON', icon: 'smudge', trait: () => 'Smudges one symbol to ?' },
    burst: { name: 'ARTILLERY', icon: 'burst', trait: (m) => `Shreds ${m.len} symbols in a row` },
    pad: { name: 'CROWDED BAND', icon: 'pad', trait: () => 'Wraps it in other traffic' },
    clerk: { name: 'Q.M. CLERK', icon: 'clerk', trait: () => 'Mistypes or swaps digits' },
    shuffle: { name: 'COURIER CORPS', icon: 'shuffle', trait: (m) => `${m.size} symbols per courier, any order` },
  };

  function fmtSet(s) {
    return '{' + [...s].join(',') + '}';
  }

  const RANKS = [
    { stars: 0, name: 'Second Lieutenant', short: '2LT' },
    { stars: 8, name: 'Lieutenant', short: 'LT' },
    { stars: 18, name: 'Captain', short: 'CPT' },
    { stars: 32, name: 'Major', short: 'MAJ' },
    { stars: 46, name: 'Lieutenant Colonel', short: 'LTC' },
    { stars: 60, name: 'Colonel', short: 'COL' },
    { stars: 75, name: 'Brigadier General', short: 'BG' },
  ];

  const D = '0123456789';
  const DX = '0123456789X';
  const B = '01';
  const TRI = '012'; // depot stock cards: each bin empty (0), low (1) or full (2)
  const ORD = ['NSEW', '1234', 'ABCD'];

  // Strip tools unlock cumulatively; locked ones stay visible (greyed) in the tray.
  const T1 = [];
  const T2 = ['REPEAT'];
  const T3 = [...T2, 'NOT', 'PARITY'];
  const T4 = [...T3, 'CHECK'];
  const T5 = [...T4, 'IF'];
  const T6 = [...T5, 'SEAL'];
  const R2 = ['VOTE'];
  const R3 = ['VOTE', 'READ_NOT'];
  // Weight stamps for the check-digit dials and the seal. Each is issued only after the player has dialled that
  // row by hand at least once: FILL_ONES after MONSOON (4-2), FILL_POS after THE LEDGER (D1), FILL_SQ and
  // FILL_POW (every seal row as powers of the position) after SANDBAGS (D2), the hand-built seal.
  const STAMPS_POS = ['FILL_ONES', 'FILL_POS'];
  const STAMPS_ALL = ['FILL_ONES', 'FILL_POS', 'FILL_SQ', 'FILL_POW'];
  const T7 = [...T6, ...STAMPS_ALL];

  const LEVELS = [
    // ================================================================ I. THE TRENCHES
    {
      id: '1-1', sector: 0, name: 'FIRST CONTACT',
      template: '■=ABC ▲=123\n■ - ▲',
      chain: [{ kind: 'pass', p: 0 }],
      enc: T1, dec: [], arq: false, target: 1, budget: 0, par: { overhead: -1, blocks: 0 },
      briefing:
        "Welcome to the Signal Corps, Lieutenant. Command writes an order — a company letter, a dash and a grid digit, like B-2 — and you get it to the front intact.\n\nYour HQ STRIP is the transmission, built tile by tile; the field ASSEMBLES the order by reading symbols back out of what arrives. Both start out as a plain copy of the order. This line is manned by Pvt. Reliable, who never makes mistakes: press TEST TRANSMISSION, then run a FIELD EXERCISE.",
      hints: [
        'Nothing to build: press TEST TRANSMISSION, then FIELD EXERCISE.',
        'For the efficiency medal: the dash is in every order. Does it need to travel at all? If you take it off the strip, tell the field where ▲ now arrives.',
      ],
      debrief: {
        title: 'The Chain',
        text: 'Every communication system has five links: a source (Command), an encoder (your HQ strip), a channel (the line), a decoder (your field protocol) and a destination. Claude Shannon drew exactly this diagram in 1948 — and proved how much information a noisy channel can carry. Anything both ends already know, like that dash, never needs sending.',
      },
      solution: { enc: '■ ▲', dec: [], asm: '▲=#2' },
    },
    {
      id: '1-2', sector: 0, name: 'IDLE CHATTER',
      format: ['ABCD', 'ABCD'],
      chain: [{ kind: 'add', p: 0.8, set: '123' }],
      enc: T1, dec: ['STRIP'], arq: false, target: 1, budget: 0, par: { overhead: 0, blocks: 1 },
      briefing:
        "Sgt. Chatter mans the next relay. Loyal man, but he can't stop muttering numbers, and some of them end up in your orders — shifting your letters out of place.\n\nOrders on this sector use only the letters A–D. Give the FIELD WORK something that scrubs out what doesn't belong.",
      hints: ['Orders here never contain digits.', 'Drag STRIP OUT into the field work and tick 1, 2 and 3.'],
      debrief: {
        title: 'Know Your Alphabet',
        text: "Noise that can't be mistaken for a real symbol costs nothing to remove. Real receivers do this constantly: a modem only listens for its own tones, and everything else is thrown away as interference.",
      },
      solution: { enc: '■ ▲', dec: [['STRIP', { set: '123' }]], asm: '' },
    },
    {
      id: '1-3', sector: 0, name: 'BUTTERFINGERS',
      format: ['ABC', '123'],
      chain: [{ kind: 'drop', p: 0.8, set: '123' }],
      enc: T1, dec: [], arq: false, target: 1, budget: 1, par: { overhead: 1, blocks: 0 },
      briefing:
        "Pvt. Butterfingers drops things. Specifically: digits. Every order is a letter and a digit, and far too often the digit never arrives.\n\nCommand authorises ONE extra symbol per order. Spend it wisely.",
      hints: [
        'If a digit might get lost, send it twice.',
        'Drag a second ▲ tile onto the strip: A1 becomes A11. If one copy is dropped you still have A1.',
        'The assembly row already reads ▲ from #2 — which holds a 1 whether or not a copy was dropped.',
      ],
      debrief: {
        title: 'Redundancy',
        text: 'You just bought reliability with bandwidth. Every error-correcting code makes this trade: extra symbols in exchange for safety. The share of useful symbols in what you send is the code rate — here 2 out of 3.',
      },
      solution: { enc: '■ ▲ ▲', dec: [], asm: '' },
    },
    {
      id: '1-4', sector: 0, name: 'ROUGH LINE',
      format: ['ABC', '123'],
      chain: [
        { kind: 'drop', p: 0.8, set: '123' },
        { kind: 'add', p: 0.8, set: 'XYZ' },
      ],
      enc: T1, dec: ['STRIP'], arq: false, target: 1, budget: 1, par: { overhead: 1, blocks: 1 },
      briefing:
        'Butterfingers is still dropping digits, and now Sgt. Chatter sits after him, muttering X, Y and Z into the line.\n\nCombine what you have learned.',
      hints: ['Send the digit twice, as before.', 'Field work: STRIP OUT {X,Y,Z}. After that, the order is back where the assembly row expects it.'],
      debrief: {
        title: 'Layers',
        text: 'Each threat got its own countermeasure, stacked in sequence. Real communication systems are built the same way: each layer fixes one class of problem and hands a cleaner signal to the next.',
      },
      solution: { enc: '■ ▲ ▲', dec: [['STRIP', { set: 'XYZ' }]], asm: '' },
    },
    {
      id: '1-5', sector: 0, name: 'CROSSED WIRES',
      format: ['ABC', '123'],
      chain: [{ kind: 'swap', p: 0.7 }],
      enc: T1, dec: ['IF_IN', 'SWAP'], arq: false, target: 1, budget: 0, par: { overhead: 0, blocks: 2 },
      briefing:
        "Cpl. Muddle reads orders out a little too fast and swaps neighbouring symbols.\n\nNo extra bandwidth on this line. But a proper order is always LETTER then DIGIT — if a digit shows up first, you know exactly what happened. Decision plates have a YES and a NO branch.",
      hints: ['A correct order always starts with a letter.', 'Field work: IF #1 IS ONE OF {1,2,3} → put SWAP #1 ↔ #2 in the YES branch.'],
      debrief: {
        title: 'Structure Is Redundancy',
        text: "Not every string of symbols is a valid order, and that unused space is a resource. Language works the same way: 'teh' is obviously 'the'. Shannon estimated written English is roughly half redundancy — which is why you can still read it through typos.",
      },
      solution: { enc: '■ ▲', dec: [['IF_IN', { pos: 1, set: '123' }, [['SWAP', { a: 1, b: 2 }]], []]], asm: '' },
    },
    {
      id: '1-6', sector: 0, name: 'MIRROR IMAGES',
      format: ['123', '123'],
      chain: [{ kind: 'swap', p: 0.7 }],
      enc: T1, dec: ['IF_SAME', 'IF_IN', 'SWAP'], arq: false, target: 1, budget: 1, par: { overhead: 1, blocks: 2 },
      briefing:
        "Muddle again — but these are artillery grid orders: two digits, like 12 or 31.\n\nWhen '21' arrives, was it sent as 21, or as 12 and swapped? Impossible to tell. Spend ONE extra symbol so the field unit can always work it out.",
      hints: [
        'Muddle only swaps neighbours. What if the first digit were sent twice?',
        'Strip ■ ■ ▲ turns 12 into 112. One swap can only produce 112 (no visible change) or 121.',
        'Field work: IF #1 = #2 → SWAP #2 ↔ #3. Then assemble ■ from #1 and ▲ from #2.',
      ],
      debrief: {
        title: 'Know Your Channel',
        text: 'Your code only works because you know exactly what Muddle can do. Every real code is designed around a channel model — random flips, bursts, swaps, lost packets. The same code can be brilliant on one channel and useless on another.',
      },
      solution: { enc: '■ ■ ▲', dec: [['IF_SAME', { a: 1, b: 2 }, [['SWAP', { a: 2, b: 3 }]], []]], asm: '▲=#2' },
    },

    // ================================================================ II. THE RADIO WAR
    {
      id: '2-1', sector: 1, name: 'STATIC',
      format: ['NSEW'],
      chain: [{ kind: 'garble', p: 0.9 }],
      enc: T2, dec: [...R2], arq: false, target: 1, budget: 2, par: { overhead: 2, blocks: 1 },
      briefing:
        "1942. Orders go out by radio now. This one is a single compass heading: N, S, E or W.\n\nStatic replaces it with the wrong letter almost every time — but only one symbol per order. You may send copies.",
      hints: ['If one copy gets garbled, the other two outvote it.', 'Strip: ■ ■ ■. In the assembly row, switch ■ to a VOTE over #1, #2 and #3.'],
      debrief: {
        title: 'The Repetition Code',
        text: 'The oldest trick there is: say it three times, go with the majority. It corrects any single error — at the price of tripling your airtime. Much of coding theory is the hunt for a cheaper deal.',
      },
      solution: { enc: '■ ■ ■', dec: [], asm: '■=V1,2,3' },
    },
    {
      id: '2-2', sector: 1, name: 'FULL ORDERS',
      format: ORD,
      chain: [{ kind: 'garble', p: 0.9 }],
      enc: T2, dec: [...R2], arq: false, target: 1, budget: 6, par: { overhead: 6, blocks: 3 },
      briefing:
        'Real orders now: heading, company and objective — like N3A. Static still hits at most one symbol per order.',
      hints: ['The same plan works: every symbol gets its own vote.', 'A REPEAT ×3 group around ■ ▲ ● sends N3AN3AN3A. Then ■ = vote #1,4,7, ▲ = vote #2,5,8, ● = vote #3,6,9.'],
      debrief: {
        title: 'Vote Per Symbol',
        text: 'Voting works symbol by symbol, so one error anywhere is fixed. Rate 1/3: two thirds of your airtime is insurance.',
      },
      solution: { enc: '■ ■ ■ ▲ ▲ ▲ ● ● ●', dec: [], asm: '■=V1,2,3 ▲=V4,5,6 ●=V7,8,9' },
    },
    {
      id: '2-3', sector: 1, name: 'TWO BAD LINKS',
      format: ORD,
      chain: [
        { kind: 'garble', p: 0.8 },
        { kind: 'garble', p: 0.8, name: 'MORE STATIC' },
      ],
      enc: T2, dec: [...R2], arq: false, target: 1, budget: 12, par: { overhead: 12, blocks: 3 },
      briefing:
        'Two static-ridden relays in a row: up to two symbols per order can be garbled. Three copies are no longer enough.',
      hints: [
        'If both errors hit the same symbol in two different copies, a three-way vote picks the wrong one.',
        'To outvote t errors you need 2t + 1 copies.',
      ],
      debrief: {
        title: '2t + 1',
        text: 'Correcting t errors by voting takes 2t + 1 copies. Costs balloon fast: two errors already need five times the bandwidth. Hold that thought — in 1950 someone finds a far better deal.',
      },
      solution: { enc: '5x( ■ ▲ ● )', dec: [], asm: '■=V1,4,7,10,13 ▲=V2,5,8,11,14 ●=V3,6,9,12,15' },
    },
    {
      id: '2-4', sector: 1, name: 'SAY AGAIN?',
      format: ORD,
      chain: [{ kind: 'garble', p: 0.15 }],
      enc: T2, dec: [...R2, 'IF_AGREE', 'IF_SAME', 'SAY_AGAIN'], arq: true, target: 1, budget: 5, par: { overhead: 4.5, blocks: 2 },
      briefing:
        "The static is lighter now, but airtime is rationed: at most 5 extra symbols per order on average — and every re-send counts.\n\nRadio is two-way. The field can reply SAY AGAIN and HQ will repeat the whole transmission. Spotting an error is much cheaper than fixing it.",
      hints: [
        'Three copies cost 6 extra symbols. Too much. What can two copies tell you?',
        'If two copies match, they are right. If they differ, ask again.',
        'Strip: REPEAT ×2 around ■ ▲ ●. Field work: CUT SIGNAL INTO 2 EQUAL PIECES · IF ALL IDENTICAL → YES: (nothing); NO: SAY AGAIN!',
      ],
      debrief: {
        title: 'ARQ — Automatic Repeat reQuest',
        text: 'Detect, then ask again. It is how TCP, Wi-Fi and every retry button work. It needs two things you will not always have: a return channel, and time.',
      },
      solution: { enc: '2x( ■ ▲ ● )', dec: [['IF_AGREE', { copies: 2 }, [], [['SAY_AGAIN', {}]]]], asm: '' },
    },

    // ================================================================ III. THE JAMMER
    {
      id: '3-1', sector: 2, name: 'LAMP SIGNALS',
      format: [B, B, B, B],
      chain: [{ kind: 'flip', p: 0.2 }],
      enc: T3, dec: [...R3, 'IF_AGREE', 'IF_PARITY', 'SAY_AGAIN'], arq: true, target: 1, budget: 3, par: { overhead: 2.75, blocks: 3 },
      briefing:
        "1950. Ships and outposts talk by signal lamp: every order is four flashes, lit (1) or dark (0). Enemy jammers flip a lamp now and then.\n\nYou have a return channel, but bandwidth is tight: 3 extra flashes per order on average, re-sends included. Two full copies would blow that.",
      hints: [
        'Count the lit lamps. Add one flash so the total is always even.',
        'A PARITY tile over ■▲●◆ does exactly that. If one lamp flips, the count turns odd.',
        'Field work: IF PARITY of #1–5 IS EVEN → (nothing); NO → SAY AGAIN!',
      ],
      debrief: {
        title: 'The Parity Bit',
        text: "One extra bit detects any single flip. Parity guarded punched cards, early memory chips and serial cables for decades. But it can only shout 'something is wrong', never 'what'.",
      },
      solution: { enc: '■ ▲ ● ◆ P(■▲●◆)', dec: [['IF_PARITY', { pos: [1, 2, 3, 4, 5] }, [], [['SAY_AGAIN', {}]]]], asm: '' },
    },
    {
      id: '3-2', sector: 2, name: 'HAND-BUILT SEALS',
      format: [B, B],
      chain: [{ kind: 'flip', p: 0.9 }],
      enc: T3, dec: [...R3, 'FLIP', 'IF_SAME', 'IF_PARITY'], arq: false, target: 1, budget: 3, par: { overhead: 3, blocks: 7 },
      briefing:
        "No return channel on this one. Orders are just two lamps, and the jammer flips one in nearly every order. Three copies of each would cost 4 extra lamps; Command allows 3.\n\nSeveral checks, each watching different lamps, can tell you not just THAT a lamp flipped, but WHICH one.",
      hints: [
        'Try ■ ▲ ■ ▲ P(■▲): each lamp is sent twice, plus one seal over both. Now every lamp is watched by two different checks.',
        'Three checks: IF #1 = #3 (the two copies of ■), IF #2 = #4 (the two copies of ▲), and IF PARITY of #1,#2,#5 IS EVEN (the seal). Lamp ■ flipping breaks the first and the seal; lamp ▲ breaks the second and the seal; a flip anywhere else breaks only one check.',
        'Build the tree: IF #1 = #3 → (IF #2 = #4 → nothing; NO → IF the seal holds → nothing; NO → FLIP #2); NO → (IF the seal holds → nothing; NO → FLIP #1). The assembly row reads ■ from #1 and ▲ from #2.',
      ],
      debrief: {
        title: 'Syndrome Decoding',
        text: 'The pattern of failed checks is called the syndrome. Give every position its own syndrome, and a single error points straight at itself. This is the heart of Hamming’s idea — and you just built a decoder for it by hand.',
      },
      solution: {
        enc: '■ ▲ ■ ▲ P(■▲)',
        dec: [
          ['IF_SAME', { a: 1, b: 3 },
            [['IF_SAME', { a: 2, b: 4 }, [], [['IF_PARITY', { pos: [1, 2, 5] }, [], [['FLIP', { pos: 2 }]]]]]],
            [['IF_PARITY', { pos: [1, 2, 5] }, [], [['FLIP', { pos: 1 }]]]]],
        ],
        asm: '',
      },
    },
    {
      id: '3-3', sector: 2, name: 'THE CODEBOOK',
      format: [B, B, B, B],
      chain: [{ kind: 'flip', p: 0.9 }],
      enc: T3, dec: [...R3, 'REPAIR', 'FLIP', 'IF_PARITY'], arq: false, target: 1, budget: 3,
      par: { overhead: 3, blocks: 4 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "Cryptography has issued you a CODEBOOK machine. It knows your HQ strip, lists every valid transmission, and can REPAIR a damaged signal to the nearest valid one.\n\nOrders are 4 lamps; the jammer flips one. Budget: 3 extra lamps. Watch the CODE ANALYZER: it measures the minimum distance d between any two valid transmissions. One flip moves a signal 1 step — so you need d ≥ 3.",
      hints: [
        'If every two valid transmissions differ in at least 3 lamps, one flip still leaves the true one nearest.',
        'Use three PARITY tiles, each over three of the four lamps — and make sure no two lamps are watched by the same set of tiles.',
        'P(■▲◆) P(■●◆) P(▲●◆). Field work: REPAIR SCATTER up to 1.',
      ],
      debrief: {
        title: 'The Hamming Code (1950)',
        text: 'Richard Hamming, fed up with weekend jobs at Bell Labs crashing over single bit errors, invented these codes: 4 data bits and 3 check bits fix any single flip. Rate 4/7 instead of repetition’s 1/3. Hamming codes still guard computer memory today.',
      },
      solution: { enc: '■ ▲ ● ◆ P(■▲◆) P(■●◆) P(▲●◆)', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
    },
    {
      id: '3-4', sector: 2, name: 'DOUBLE JAMMING',
      format: [B, B, B, B],
      chain: [
        { kind: 'flip', p: 0.3 },
        { kind: 'flip', p: 0.3, name: 'SECOND JAMMER' },
      ],
      enc: T3, dec: [...R3, 'REPAIR', 'IF_VALID', 'IF_PARITY', 'SAY_AGAIN'], arq: true, target: 1, budget: 5.5,
      par: { overhead: 5.25, blocks: 7 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "The enemy has doubled the jamming. Two flips can fool a Hamming code: it 'repairs' the signal into the WRONG order, with total confidence.\n\nYou have a return channel. Fix single flips on the spot; ask again when something worse happens. Budget: 5.5.",
      hints: [
        'With d = 3, two flips can land nearer to a wrong order. With d = 4, two flips are never repaired into a wrong order — they are simply too far from everything.',
        'Add a fourth PARITY tile and watch the analyzer. Not every choice reaches d = 4: the new lamp has to make ALL seven lamps’ parity even.',
        'P(■▲●) does it. Field work: REPAIR SCATTER up to 1 → IF SIGNAL IS IN CODEBOOK → (nothing); NO → SAY AGAIN!',
      ],
      debrief: {
        title: 'SECDED',
        text: 'Single Error Correction, Double Error Detection: a Hamming code plus one overall parity bit. It is exactly what the ECC memory in servers does, billions of times a second.',
      },
      solution: {
        enc: '■ ▲ ● ◆ P(■▲◆) P(■●◆) P(▲●◆) P(■▲●)',
        dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }], ['IF_VALID', {}, [], [['SAY_AGAIN', {}]]]],
        asm: '',
      },
    },

    // ================================================================ IV. SHELLS & MONSOON
    {
      id: '4-1', sector: 3, name: 'BARRAGE',
      format: ORD,
      chain: [{ kind: 'burst', p: 0.8, len: 3 }],
      enc: T3, dec: [...R3], arq: false, target: 1, budget: 6, par: { overhead: 6, blocks: 3 },
      briefing:
        '1960. Artillery cuts the line in bursts: three symbols in a row get shredded. At most one barrage per order.\n\nBandwidth for three copies is approved. But WHERE you put the copies matters.',
      hints: [
        '■■■▲▲▲●●● puts all copies of a symbol side by side — one barrage destroys all three.',
        'Spread them out: ■▲●■▲●■▲● keeps the copies of each symbol three positions apart.',
      ],
      debrief: {
        title: 'Interleaving',
        text: 'Burst errors are everywhere: scratches on a disc, fading radio, artillery. Spread each piece of information out in time and one burst becomes several small, separate, correctable errors. A CD interleaves its data across thousands of bytes.',
      },
      solution: { enc: '3x( ■ ▲ ● )', dec: [], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9' },
    },
    // ---------------------------------------------------------------- THE FLOODED DEPOT
    // An arc that builds the check digit by hand (weight dials + a modulus dial), then the locating pair, then
    // the check-matrix seal. Stock cards are bins marked 0/1/2 so the arithmetic stays tiny; requisitions
    // (4-3) are full decimal item numbers. Order of the advance: 4-2 → D1 → 4-3 → 4-4 → 4-5 → D2
    // (D1 and D2 live in levels-depot.js).
    {
      id: '4-2', sector: 3, name: 'MONSOON',
      format: [TRI, TRI, TRI, TRI],
      chain: [{ kind: 'smudge', p: 0.9 }],
      enc: T4, dec: [...R3, 'REPAIR'], arq: false, target: 1, budget: 1,
      par: { overhead: 1, blocks: 2 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "The river has burst its banks and the supply depot stands in a foot of water. Every stock card lists four bins, each marked 0 (empty), 1 (low) or 2 (full), and goes to the front as four digits. The monsoon smudges one digit on nearly every card, and the field logs it as ?.\n\nUnlike the jammer, a smudge tells you WHERE the damage is. Budget: one extra digit.\n\nNew issue: the CHECK DIGIT. You set a weight for each bin and a modulus. It multiplies every bin by its weight, adds them up and sends the remainder after dividing by the modulus. Mod 5 is a clock with five hours, so 7 counts as 2.",
      hints: [
        'A smudge tells you which bin is missing. What one extra digit would let the field work the missing bin out from the other three?',
        'Send the total of the four bins. When one bin is smudged, the total minus the three you can still read is the missing one. On the CHECK DIGIT that is weight 1 on every bin. A bin with weight 0 is left out of the total, and nothing can bring it back.',
        'Strip: ■ ▲ ● ◆ then a CHECK DIGIT with weights 1, 1, 1, 1 and modulus 5. Field work: REPAIR SCATTER up to 1 (smudges are free).',
      ],
      debrief: {
        title: 'Erasures',
        text: "An error at a known place is called an erasure, and it is cheap: one check digit refills one missing digit, because the total pins it down. A code with distance d refills d − 1 erasures but fixes only ⌊(d − 1)/2⌋ errors. Keeping only the remainder changes nothing as long as each bin's possible values leave different remainders. Weight 2 with modulus 4 would fail: an empty bin adds 0 and a full one adds 4, which is also 0. RAID-5 disk arrays rebuild a dead drive with this same trick, one sum over all the others.",
      },
      solution: { enc: '■ ▲ ● ◆ C5:1,1,1,1', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
      anti: [
        // the old lamp parity (blind to 0 vs 2), a bin left out, weights the modulus swallows, plain copies
        { enc: '■ ▲ ● ◆ P(■▲●◆)', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
        { enc: '■ ▲ ● ◆ C5:1,1,1,0', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
        { enc: '■ ▲ ● ◆ C4:2,2,2,2', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
        { enc: '■ ▲ ● ◆ C4:1,2,3,4', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
        { enc: '■ ▲ ● ◆ ■ ▲ ● ◆', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
      ],
    },
    {
      id: '4-3', sector: 3, name: 'QUARTERMASTER',
      format: [D, D, D, D],
      chain: [{ kind: 'clerk', p: 0.3, to: D }],
      enc: [...T4, ...STAMPS_POS], dec: [...R3, 'IF_VALID', 'IF_AGREE', 'SAY_AGAIN'], arq: true, target: 1,
      budget: 4.5, par: { overhead: 3.5, blocks: 3 }, metric: 'hamming',
      briefing:
        "Requisitions are not bin marks but 4-digit item numbers, 0000 to 9999, and the same tired clerk types them. He still mistypes a digit or swaps two neighbours, but now a digit can be anything from 0 to 9.\n\nA wrong crate is worse than a late one: catch every mistake and ask again. Budget: 4.5. The modulus dial goes up to 11.",
      hints: [
        'Start from your ledger check, scaled up to four digits. When a mistake slips through, look at which two digits the clerk confused, and how far apart they are.',
        'A typo can now move a digit by anything up to 9, and a swap moves the total by the weight gap times a digit gap of up to 9. Mod 10, 5 × 2 = 10 leaves 0, so some mistake always hides whatever the weights. A modulus that is too small fails as well: mod 7, a 0 typed as a 7 changes nothing. The modulus has to be prime and bigger than 9. Its check digit can come out as 10, which is written X.',
        'Strip: ■ ▲ ● ◆ then a CHECK DIGIT with weights 1, 2, 3, 4 and modulus 11. Field work: IF SIGNAL IS IN CODEBOOK → (nothing); NO → SAY AGAIN!',
      ],
      debrief: {
        title: 'ISBN-10',
        text: 'Position weights mod 11 catch every single typo and every swap of neighbours. That is the ISBN-10 printed in books from 1970, and it is why some ISBNs end in X, which stands for 10. Mod 10 can never catch both. Supermarket barcodes (weights 3, 1, 3, 1 … mod 10) miss a swap of two digits that differ by 5, and the Luhn check that Hans Peter Luhn of IBM designed for card numbers misses 09 ↔ 90. When books moved to 13-digit barcodes in 2007, ISBN-13 accepted that gap to fit the barcode standard.',
      },
      solution: { enc: '■ ▲ ● ◆ C11:1,2,3,4', dec: [['IF_VALID', {}, [], [['SAY_AGAIN', {}]]]], asm: '' },
      anti: [
        // mod 10 cannot win (any weights), a too-small modulus, and the plain sum
        { enc: '■ ▲ ● ◆ C10:1,2,3,4', dec: [['IF_VALID', {}, [], [['SAY_AGAIN', {}]]]], asm: '' },
        { enc: '■ ▲ ● ◆ C10:1,3,7,9', dec: [['IF_VALID', {}, [], [['SAY_AGAIN', {}]]]], asm: '' },
        { enc: '■ ▲ ● ◆ C10:3,1,3,1', dec: [['IF_VALID', {}, [], [['SAY_AGAIN', {}]]]], asm: '' },
        { enc: '■ ▲ ● ◆ C7:1,2,3,4', dec: [['IF_VALID', {}, [], [['SAY_AGAIN', {}]]]], asm: '' },
        { enc: '■ ▲ ● ◆ C11:1,1,1,1', dec: [['IF_VALID', {}, [], [['SAY_AGAIN', {}]]]], asm: '' },
      ],
    },
    {
      id: '4-4', sector: 3, name: 'NO RETREAT',
      format: [TRI, TRI, TRI, TRI],
      chain: [{ kind: 'garble', p: 0.9 }],
      enc: [...T4, ...STAMPS_POS], dec: [...R3, 'REPAIR'], arq: false, target: 1, budget: 2,
      par: { overhead: 2, blocks: 3 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "Shells are falling on the depot and the stock cards must reach the front now. There is no time to ask again. Static garbles one digit on nearly every card, and this time there is no ? to show which one.\n\nOne check digit tells you THAT a bin changed. Budget: two extra digits. Can two checks tell you WHICH bin?",
      hints: [
        'Two check digits, two questions. One should answer "by how much did a bin change?" The other should give an answer that depends on WHERE it changed.',
        'Weights 1, 1, 1, 1 report the change. Weights 1, 2, 3, 4 report the change times the bin number. Divide the second by the first and you have the bin, which needs a prime modulus to divide in. Two checks with the same pattern, or one a multiple of the other, are one witness telling the same story twice: the analyzer shows their columns pointing the same way. And do not start counting at 0, because a bin with weight 0 is invisible to that check.',
        'Strip: ■ ▲ ● ◆ then a CHECK DIGIT 1, 1, 1, 1 and a CHECK DIGIT 1, 2, 3, 4, both modulus 5. Field work: REPAIR SCATTER up to 1.',
      ],
      debrief: {
        title: 'Two Clues, Two Unknowns',
        text: "Give every bin a column of weights, here (1, its number). A garble in bin i by e moves your two checks by e and e × i, which is e times bin i's column. If two columns point the same way, a garble in one looks exactly like a garble in the other. If they all differ, the ratio of the two clues names the bin. Richard Hamming had this idea at Bell Labs in 1950 for lamps: he gave every position a different column. Irving Reed and Gustave Solomon took it to digits in 1960, with columns built from powers of the position.",
      },
      solution: {
        enc: '■ ▲ ● ◆ C5:1,1,1,1 C5:1,2,3,4',
        dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]],
        asm: '',
      },
      anti: [
        // the same witness twice (equal or parallel rows), counting from 0, one check, a modulus you cannot divide in
        { enc: '■ ▲ ● ◆ C5:1,2,3,4 C5:1,2,3,4', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
        { enc: '■ ▲ ● ◆ C5:1,2,3,4 C5:2,4,1,3', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
        { enc: '■ ▲ ● ◆ C5:1,1,1,1 C5:2,2,2,2', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
        { enc: '■ ▲ ● ◆ C5:1,1,1,1 C5:0,1,2,3', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
        { enc: '■ ▲ ● ◆ C5:1,1,1,1', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
        { enc: '■ ▲ ● ◆ C4:1,1,1,1 C4:1,2,3,4', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
        { enc: '■ ▲ ● ◆ C6:1,1,1,1 C6:1,2,3,4', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
      ],
    },
    {
      id: '4-5', sector: 3, name: 'FOG AND FIRE',
      format: [TRI, TRI, TRI],
      chain: [
        { kind: 'smudge', p: 0.9 },
        { kind: 'garble', p: 0.9 },
      ],
      enc: [...T4, ...STAMPS_POS], dec: [...R3, 'REPAIR'], arq: false, target: 1, budget: 3,
      par: { overhead: 3, blocks: 4 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        'Rain and static on the same line. On each 3-bin stock card one digit is smudged and another may be garbled. Budget: 3 extra digits.\n\nRemember the exchange rate: an erasure costs one check, an error costs two.',
      hints: [
        'Two checks found one garble. The smudge can eat one of your witnesses, so add a third witness who sees the bins differently from the first two.',
        'Weights 1, 1, 1 and 1, 2, 3, then the squares: 1, 4, 9. Pick the modulus with care. Mod 5, 2 × 2 and 3 × 3 both leave 4, so the squares row weighs bins 2 and 3 alike and adds nothing where you need it. Mod 7 or 11 keeps all three squares different.',
        'Strip: ■ ▲ ● then three CHECK DIGITS, all modulus 11: 1, 1, 1 / 1, 2, 3 / 1, 4, 9. Field work: REPAIR SCATTER up to 1.',
      ],
      debrief: {
        title: 'The Singleton Bound',
        text: "Your three rows are the first three powers of the bin number: i⁰, i¹, i². Each bin's column (1, i, i²) is a point on a parabola, and a parabola is fixed by any three of its points, so the columns of different bins never cancel each other out. That is why each new power bought exactly one more step of distance. No code does better: r check digits never give more than d = r + 1. This is the Singleton bound, and codes that reach it are called Maximum Distance Separable, the family Reed–Solomon codes belong to. Signals has noticed you dialling rows of powers by hand, and the depot's sealing machine is being brought up from the cellar.",
      },
      solution: {
        enc: '■ ▲ ● C11:1,1,1 C11:1,2,3 C11:1,4,9',
        dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]],
        asm: '',
      },
      anti: [
        // squares that collide mod 5, a doubled position row, a repeated row, and only two checks
        { enc: '■ ▲ ● C5:1,1,1 C5:1,2,3 C5:1,4,4', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
        { enc: '■ ▲ ● C11:1,1,1 C11:1,2,3 C11:2,4,6', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
        { enc: '■ ▲ ● C11:1,1,1 C11:1,2,3 C11:1,1,1', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
        { enc: '■ ▲ ● C11:1,1,1 C11:1,2,3', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
      ],
    },

    // ================================================================ V. THE NETWORK
    {
      id: '5-1', sector: 4, name: 'CROWDED BAND',
      format: ['ABCD', 'ABCD', 'ABCD'],
      chain: [{ kind: 'pad', p: 1, set: 'ABCD', max: 3 }],
      enc: T5, dec: [...R3, 'BETWEEN', 'STRIP'], arq: false, target: 1, budget: 2, par: { overhead: 2, blocks: 1 },
      briefing:
        '1974. Messages now share a busy wire. Your 3-letter order arrives buried in other traffic — random letters before and after it.\n\nWhere does yours start? Budget: 2.',
      hints: ['Put your order in an envelope, using marker literals that never appear in orders.', 'Strip: "[" ■ ▲ ● "]". Field work: OPEN ENVELOPE [ … ].'],
      debrief: {
        title: 'Framing',
        text: 'Every network packet starts with a known pattern so receivers can find it: Ethernet sends a 7-byte preamble, HDLC uses the flag 01111110. Synchronisation is the first job of any receiver.',
      },
      solution: { enc: '"[" ■ ▲ ● "]"', dec: [['BETWEEN', { open: '[', close: ']' }]], asm: '' },
    },
    {
      id: '5-2', sector: 4, name: 'SLIPPED SIGNAL',
      format: ['ABCD', 'ABCD', 'ABCD'],
      chain: [{ kind: 'drop', p: 0.9, name: 'WORN RELAY' }],
      enc: T5, dec: [...R3, 'REPAIR', 'IF_LENGTH'],
      arq: false, target: 1, budget: 3, par: { overhead: 3, blocks: 1 }, repair: ['SCATTER', 'EDIT'], metric: 'edit',
      briefing:
        "A worn relay sometimes skips a letter entirely. The message gets shorter and everything after the gap slides left.\n\nYour codebook machine has a new setting: EDIT repair, which also considers missing and extra symbols. Budget: 3.",
      hints: [
        'With ■▲●■▲●, one lost letter shifts every later copy out of line.',
        'Doubling each letter in place (■■▲▲●●) means a deletion only shortens one pair.',
        'Field work: REPAIR EDIT up to 1. Then read ■, ▲, ● from #1, #3, #5.',
      ],
      debrief: {
        title: 'Synchronisation Errors',
        text: 'Deletions and insertions are nastier than substitutions because they shift everything after them. Codes built for them — such as Varshamov–Tenengolts codes — are used today in DNA data storage, where the chemistry loses and gains letters.',
      },
      solution: { enc: '■ ■ ▲ ▲ ● ●', dec: [['REPAIR', { mode: 'EDIT', radius: 1 }]], asm: '▲=#3 ●=#5' },
    },
    {
      id: '5-3', sector: 4, name: 'COURIER CORPS',
      format: ['ABCD', 'ABCD', 'ABCD', 'ABCD', 'ABCD', 'ABCD'],
      chain: [{ kind: 'shuffle', p: 0.9, size: 3 }],
      enc: T5, dec: [...R3, 'REASSEMBLE', 'STRIP'], arq: false, target: 1, budget: 3, par: { overhead: 3, blocks: 1 },
      briefing:
        'Long orders (6 letters) go by motorcycle couriers, each carrying 3 symbols of the transmission. They take different roads and arrive in any order.\n\nBudget: 3.',
      hints: [
        'Number the pieces so the field unit can put them back in order.',
        'Each courier carries 3 symbols, and a number tag uses one of them — so tag every 2 letters with a literal digit.',
        'Strip: "1" ■ ▲ "2" ● ◆ "3" ★ ⬟. Field work: REASSEMBLE pieces of 3.',
      ],
      debrief: {
        title: 'Sequence Numbers',
        text: 'The internet chops data into packets that may take different routes. TCP numbers every byte so the receiver can rebuild the stream in order and notice what is missing.',
      },
      solution: { enc: '"1" ■ ▲ "2" ● ◆ "3" ★ ⬟', dec: [['REASSEMBLE', { size: 3 }]], asm: '' },
    },
    {
      id: '5-4', sector: 4, name: 'THE LONG WIRE',
      format: [D, D, D, D],
      chain: [
        { kind: 'pad', p: 1, set: D, max: 2 },
        { kind: 'smudge', p: 0.9, set: DX },
        { kind: 'garble', p: 0.9, set: DX, to: DX },
      ],
      enc: T7, dec: [...R3, 'BETWEEN', 'REPAIR', 'STRIP'], arq: false,
      target: 1, budget: 5, par: { overhead: 5, blocks: 3 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "A full protocol stack. Each 4-digit order arrives wrapped in junk digits, with one digit smudged and another garbled — and no return channel. Budget: 5.\n\nThe depot's check-matrix SEAL is on issue here, with the POWERS stamp that writes its rows for you: 1, 1, 1 … / 1, 2, 3 … / 1, 4, 9 … across every position, the seal digits included.",
      hints: [
        'You need two things: an envelope to find the order, and a code to fix it.',
        'A smudge costs one seal digit and a garble two, so three seal rows: the 1s, the position and its square, mod 11, over all seven positions. The codebook ignores envelope markers, so open the envelope before you REPAIR.',
        'Strip: "[" ■ ▲ ● ◆ SEAL mod 11 with rows 1,1,1,1,1,1,1 / 1,2,3,4,5,6,7 / 1,4,9,5,3,3,5 "]" (the POWERS stamp, 3 rows). Field work: OPEN ENVELOPE → REPAIR SCATTER up to 1.',
      ],
      debrief: {
        title: 'The Protocol Stack',
        text: 'Framing to find the message, a code to repair it, a reader to interpret it: you built a layered protocol. The internet is organised the same way — physical, link, network, transport — each layer solving one problem for the one above.',
      },
      solution: {
        enc: '"[" ■ ▲ ● ◆ RS3 "]"',
        dec: [['BETWEEN', { open: '[', close: ']' }], ['REPAIR', { mode: 'SCATTER', radius: 1 }]],
        asm: '',
      },
    },

    // ================================================================ VI. HIGH COMMAND
    {
      id: '6-1', sector: 5, name: 'THUNDERSTORM',
      format: [B, B, B, B, B, B, B, B],
      chain: [{ kind: 'burst', p: 0.9, len: 2, to: B, name: 'LIGHTNING SURGE' }],
      enc: T6, dec: [...R3, 'REPAIR'], arq: false,
      target: 1, budget: 6, par: { overhead: 6, blocks: 7 }, repair: ['SCATTER', 'BURST'], metric: 'burst',
      briefing:
        "A thunderstorm has settled over the pass. Lightning strikes near the field wire send surges down it, and each surge scrambles two NEIGHBOURING lamps at once. The return wire is down: whatever you send must arrive right the first time. Orders are 8 lamps. Budget: 6 extra lamps.\n\nThe codebook machine can now repair BURSTS. Signals' advice: two Hamming codes, woven together.",
      hints: [
        'One Hamming code fixes one flip, but a surge hits two neighbours.',
        'Build two codes: one over the odd lamps ■ ● ★ ✚ and one over the even lamps ▲ ◆ ⬟ ⬢. A surge always hits at most one lamp of each.',
        'Place the parity tiles alternately — odd code, even code, odd, even… — so neighbouring tiles belong to different codes. Repair with BURST up to 2.',
      ],
      debrief: {
        title: 'Interleaved Codes',
        text: 'Weaving codewords together turns one burst into single errors in different codewords, and each code fixes its own. Military HF radio modems interleave for exactly this reason: fading and lightning crashes arrive in bursts. CDs, DVDs and DSL do the same, and the Voyager probes later sent their pictures home from Uranus and Neptune under interleaved Reed–Solomon codes.',
      },
      solution: {
        enc: '■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(■●✚) P(▲◆⬢) P(■★✚) P(▲⬟⬢) P(●★✚) P(◆⬟⬢)',
        dec: [['REPAIR', { mode: 'BURST', radius: 2 }]],
        asm: '',
      },
    },
    {
      id: '6-2', sector: 5, name: 'H-HOUR',
      format: [D, D, D, D],
      chain: [
        { kind: 'pad', p: 1, set: D, max: 3, name: 'CROWDED AIRWAVES' },
        { kind: 'garble', p: 0.9, set: DX, to: DX, name: 'BARRAGE JAMMER' },
        { kind: 'garble', p: 0.9, set: DX, to: DX, name: 'SPARK JAMMER' },
      ],
      enc: T7, dec: [...R3, 'BETWEEN', 'REPAIR', 'STRIP'], arq: false,
      target: 1, budget: 6, par: { overhead: 6, blocks: 3 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        'Final operation. At H-hour every unit on the front goes over the top together, and the order to go is broadcast to all of them at once. Radio silence is in force: no unit may answer, so there is no SAY AGAIN. Each 4-digit order arrives buried in the chatter of a crowded band, and two enemy jammers may each corrupt a digit.\n\nBudget: 6. Everything you have learned, at once.',
      hints: [
        'A garble costs two steps of distance. Two garbles cost four, plus one more to be sure.',
        'Each seal row of powers adds exactly one step: you need four rows (1s, i, i², i³ over all eight positions, mod 11). Then an envelope against the chatter.',
        'Strip: "[" ■ ▲ ● ◆ SEAL mod 11 with rows 1,1,1,1,1,1,1,1 / 1,2,3,4,5,6,7,8 / 1,4,9,5,3,3,5,9 / 1,8,5,9,4,7,2,6 "]" (the POWERS stamp, 4 rows). Field work: OPEN ENVELOPE → REPAIR SCATTER up to 2.',
      ],
      debrief: {
        title: 'From the Trenches to Voyager',
        text: "The capital has fallen, and every unit got its order. Along the way you rebuilt the core of coding theory from scratch: redundancy, voting, retransmission, parity, syndromes, distance, erasures, interleaving, check digits, framing and Reed–Solomon. These ideas outlived the war. In 1977 the two Voyager probes left Earth carrying a convolutional code, later wrapped in a Reed–Solomon code, and they are still talking to us from interstellar space, hours of light away, where no one can say again. Outstanding work, General.",
      },
      solution: {
        enc: '"[" ■ ▲ ● ◆ RS4 "]"',
        dec: [['BETWEEN', { open: '[', close: ']' }], ['REPAIR', { mode: 'SCATTER', radius: 2 }]],
        asm: '',
      },
    },

    // ================================================================ THE RIVER FORDS — routes and unknown lines
    // Routing levels carry `network` instead of a fixed chain: the player picks a route (node ids HQ … FIELD),
    // the line is the concatenation of its links' relays, and `delayBudget` caps the average hours per order
    // (every re-send walks the whole route again). `chain` on these levels lists every relay on the map, for
    // the field's symbol pickers only. Black-box levels set `hiddenLine`: the relays stay secret and the
    // player gets `samples` intercepts (fixed `probe` transmissions, fixed `sampleSeed`) instead.
    {
      id: 'R1', sector: 4, name: 'THE RIVER FORDS',
      format: ORD,
      network: {
        nodes: [
          { id: 'HQ', label: 'HQ', x: 3, y: 50 },
          { id: 'RIDGE', label: 'Ridge post', x: 27, y: 6 },
          { id: 'BRIDGE', label: 'Stone bridge', x: 68, y: 6, kind: 'bridge' },
          { id: 'CROSS', label: 'Crossroads', x: 27, y: 50 },
          { id: 'FERRY', label: 'Ferry house', x: 68, y: 50, kind: 'ford' },
          { id: 'FARM', label: 'Farm', x: 27, y: 94 },
          { id: 'MILL', label: 'Old mill', x: 68, y: 94, kind: 'mill' },
          { id: 'FIELD', label: 'Front', x: 97, y: 50 },
        ],
        river: [[44, -12], [48, 10], [44, 34], [49, 58], [46, 80], [50, 112]],
        links: [
          { a: 'HQ', b: 'RIDGE', name: 'Ridge road', delay: 0.5, chain: [] },
          { a: 'RIDGE', b: 'BRIDGE', name: 'Stone bridge', delay: 0.5, chain: [{ kind: 'burst', p: 0.8, len: 3, name: 'BRIDGE GUNS' }] },
          { a: 'BRIDGE', b: 'FIELD', name: 'Ridge road', delay: 0.5, chain: [{ kind: 'garble', p: 0.9, name: 'ENEMY JAMMER' }] },
          { a: 'HQ', b: 'CROSS', name: 'Valley road', delay: 1, chain: [{ kind: 'burst', p: 0.9, len: 5, name: 'HEAVY SHELLING' }] },
          { a: 'CROSS', b: 'FERRY', name: 'The ford', delay: 1, chain: [{ kind: 'pad', p: 1, set: 'XYZ', max: 2, name: 'FERRYMEN' }] },
          { a: 'FERRY', b: 'FIELD', name: 'Valley road', delay: 0.5, chain: [{ kind: 'burst', p: 0.9, len: 5, name: 'MORTARS' }] },
          { a: 'HQ', b: 'FARM', name: 'Mill road', delay: 1.5, chain: [] },
          { a: 'FARM', b: 'MILL', name: 'Mill road', delay: 2, chain: [] },
          { a: 'MILL', b: 'FIELD', name: 'Telegraph wire', delay: 1, chain: [{ kind: 'garble', p: 0.02, set: 'NSEW1234ABCD', name: 'OLD WIRE' }] },
          { a: 'RIDGE', b: 'CROSS', name: 'Ridge track', delay: 0.5, chain: [] },
          { a: 'BRIDGE', b: 'FERRY', name: 'Bridge lane', delay: 0.5, chain: [{ kind: 'swap', p: 0.7 }] },
          { a: 'CROSS', b: 'FARM', name: 'Farm lane', delay: 1, chain: [] },
          { a: 'FERRY', b: 'MILL', name: 'Towpath', delay: 0.5, chain: [] },
        ],
      },
      get chain() {
        return this.network.links.flatMap((l) => l.chain);
      },
      enc: T2, dec: [...R2, 'STRIP'], arq: false, target: 1, budget: 6, delayBudget: 4, par: { overhead: 6, blocks: 4 },
      briefing:
        "The front is across the river, and the country between is a maze of roads, tracks and junctions. Each stretch has its own trouble: guns on the stone bridge and a jammer beyond it, heavy shelling and mortars on the valley road, ferrymen shouting across the ford, and an old telegraph wire that is right 98 times in 100. The quiet roads are long.\n\nPlot the route yourself, one stretch at a time: start at HQ and click a road leaving the place you have reached, until you reach the front. Command wants every order through with at most 6 extra symbols and in no more than 4 hours.",
      hints: [
        'No single road works. The ridge road hits an order twice, the valley road is shelled five symbols at a time, and the mill road is too slow. Mix stretches from different roads.',
        'Your code can survive ONE hit per order (three copies and a vote), and STRIP OUT removes the ferrymen’s X, Y and Z at no cost. Find a route of 4 hours or less where nothing worse than that happens.',
        'HQ → Ridge post → Crossroads → the ford → Ferry house → towpath → Old mill → telegraph wire → Front (3.5 h). Strip: REPEAT ×3 around ■ ▲ ●. Field work: STRIP OUT {X,Y,Z}. Votes over #1,4,7 / #2,5,8 / #3,6,9.',
      ],
      debrief: {
        title: 'Routing',
        text: 'A route is built hop by hop, and the best path is the one whose links suit the code you can afford. Network engineers make this trade every day. Routing protocols give each link a cost (delay, loss, load) and add the costs up along the path, and the error control is chosen to suit the links in between. On the early internet, messages crossed many independent hops, each with its own faults, just as your order crossed the river.',
      },
      solution: {
        enc: '3x( ■ ▲ ● )', dec: [['STRIP', { set: 'XYZ' }]], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9',
        route: ['HQ', 'RIDGE', 'CROSS', 'FERRY', 'MILL', 'FIELD'],
      },
      anti: [
        // the obvious single roads
        { enc: '3x( ■ ▲ ● )', dec: [['STRIP', { set: 'XYZ' }]], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9', route: ['HQ', 'RIDGE', 'BRIDGE', 'FIELD'] },
        { enc: '3x( ■ ▲ ● )', dec: [['STRIP', { set: 'XYZ' }]], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9', route: ['HQ', 'CROSS', 'FERRY', 'FIELD'] },
        { enc: '■ ▲ ●', dec: [], asm: '', route: ['HQ', 'FARM', 'MILL', 'FIELD'] },
        { enc: '3x( ■ ▲ ● )', dec: [], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9', route: ['HQ', 'FARM', 'MILL', 'FIELD'] },
        // tempting mixes, and the right route with the wrong code
        { enc: '3x( ■ ▲ ● )', dec: [['STRIP', { set: 'XYZ' }]], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9', route: ['HQ', 'RIDGE', 'CROSS', 'FERRY', 'FIELD'] },
        { enc: '3x( ■ ▲ ● )', dec: [['STRIP', { set: 'XYZ' }]], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9', route: ['HQ', 'RIDGE', 'BRIDGE', 'FERRY', 'MILL', 'FIELD'] },
        { enc: '■ ▲ ●', dec: [['STRIP', { set: 'XYZ' }]], asm: '', route: ['HQ', 'RIDGE', 'CROSS', 'FERRY', 'MILL', 'FIELD'] },
        { enc: '3x( ■ ▲ ● )', dec: [], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9', route: ['HQ', 'RIDGE', 'CROSS', 'FERRY', 'MILL', 'FIELD'] },
      ],
    },
    {
      id: 'X1', sector: 4, name: 'CAPTURED LOGBOOK',
      format: ORD,
      chain: [
        { kind: 'reverse', p: 1 },
        { kind: 'garble', p: 0.85, set: '1234', to: '1234' },
      ],
      hiddenLine: true, samples: 5, sampleSeed: 13, probe: ['N3A', 'E1C', 'W4B', 'S222D', 'N2B'],
      enc: T2, dec: [...R2], arq: false, target: 1, budget: 2, par: { overhead: 2, blocks: 1 },
      briefing:
        "Our wire to the east bank runs through country nobody has scouted. We do not know who sits on it or what they do to our traffic.\n\nWhat we do have is a logbook taken from a captured linesman: five messages, written down as they went in and as they came out. Study it. Command allows only 2 extra symbols per order, so you cannot simply send everything three times.",
      hints: [
        'Compare each pair symbol by symbol. What happens to the letters? To the digits? To the order of things?',
        'Every message comes out back to front, and at most one digit is changed — letters never are. The S222D entry shows that only one copy of a digit gets hit.',
        'Protect only the digit: strip ■ ▲ ▲ ▲ ●. It arrives reversed, so read ● from #1, vote ▲ over #2,3,4 and read ■ from #5.',
      ],
      debrief: {
        title: 'Known-Plaintext Analysis',
        text: 'When you cannot inspect a channel, compare what went in with what came out. Engineers do the same thing to identify a channel or a system: modems send training sequences, and mobile phones send known pilot symbols so the receiver can measure what the air is doing. Codebreakers call it known-plaintext analysis — at Bletchley Park, cribs like the daily weather report helped break Enigma. Once you know a channel’s habits, you only need to protect what it actually attacks.',
      },
      solution: { enc: '■ ▲ ▲ ▲ ●', dec: [], asm: '■=#5 ▲=V2,3,4 ●=#1' },
      anti: [
        { enc: '3x( ■ ▲ ● )', dec: [], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9' },
        { enc: '■ ▲ ▲ ▲ ●', dec: [], asm: '▲=V2,3,4 ●=#5' },
        { enc: '■ ▲ ●', dec: [], asm: '■=#3 ●=#1' },
      ],
    },
    {
      id: 'R2', sector: 4, name: 'THE FLOOD PLAIN',
      format: ORD,
      network: {
        nodes: [
          { id: 'HQ', label: 'HQ', x: 3, y: 50 },
          { id: 'RIDGE', label: 'Ridge post', x: 22, y: 6 },
          { id: 'BRIDGE', label: 'Rail bridge', x: 58, y: 6, kind: 'bridge' },
          { id: 'FORD', label: 'Ford', x: 36, y: 50, kind: 'ford' },
          { id: 'ISLAND', label: 'Island', x: 68, y: 50 },
          { id: 'MARSH', label: 'Marsh', x: 22, y: 94 },
          { id: 'MILL', label: 'Old mill', x: 58, y: 94, kind: 'mill' },
          { id: 'FIELD', label: 'Front', x: 97, y: 50 },
        ],
        river: [[49, -12], [46, 20], [52, 50], [47, 80], [50, 112]],
        links: [
          { a: 'HQ', b: 'RIDGE', name: 'Ridge road', delay: 1, chain: [] },
          { a: 'RIDGE', b: 'BRIDGE', name: 'Rail line', delay: 1, chain: [{ kind: 'garble', p: 0.9, name: 'ENEMY JAMMER' }] },
          { a: 'BRIDGE', b: 'FIELD', name: 'Rail line', delay: 1, chain: [{ kind: 'garble', p: 0.15, name: 'LIGHT STATIC' }] },
          { a: 'HQ', b: 'FORD', name: 'Ford track', delay: 1, chain: [{ kind: 'burst', p: 0.9, len: 3, name: 'MORTAR FIRE' }] },
          { a: 'FORD', b: 'ISLAND', name: 'The ford', delay: 0.5, chain: [] },
          { a: 'ISLAND', b: 'FIELD', name: 'Island road', delay: 2.5, chain: [{ kind: 'garble', p: 0.15, name: 'LIGHT STATIC' }] },
          { a: 'HQ', b: 'MARSH', name: 'Marsh road', delay: 1.5, chain: [] },
          { a: 'MARSH', b: 'MILL', name: 'Mill road', delay: 1.5, chain: [] },
          { a: 'MILL', b: 'FIELD', name: 'Mill road', delay: 1.5, chain: [{ kind: 'garble', p: 0.15, name: 'LIGHT STATIC' }] },
          { a: 'RIDGE', b: 'FORD', name: 'Ridge track', delay: 0.5, chain: [] },
          { a: 'ISLAND', b: 'BRIDGE', name: 'Causeway', delay: 0.5, chain: [] },
          { a: 'FORD', b: 'MARSH', name: 'Reed path', delay: 0.5, chain: [{ kind: 'swap', p: 0.7 }] },
          { a: 'ISLAND', b: 'MILL', name: 'Flooded lane', delay: 1, chain: [{ kind: 'garble', p: 0.9, name: 'RADIO STATIC' }] },
        ],
      },
      get chain() {
        return this.network.links.flatMap((l) => l.chain);
      },
      enc: T2, dec: [...R2, 'IF_AGREE', 'IF_SAME', 'SAY_AGAIN'], arq: true, target: 1, budget: 5, delayBudget: 4.5,
      par: { overhead: 4.5, blocks: 2 },
      briefing:
        "The river has flooded the plain. What is left is a web of roads, a ford out to an island, and a causeway from the island to the rail bridge. The field can radio SAY AGAIN, but every re-send walks the whole route again and costs its hours again.\n\nCommand's limits: every order through, at most 5 extra symbols and at most 4.5 hours per order on average, re-sends included.",
      hints: [
        'Three copies cost 6 extra symbols, which is too many. Two copies and SAY AGAIN cost 3 extra plus the re-sends, but only on a route where re-sends are rare.',
        'Light static hits about 1 order in 7. The mill road meets only that, but it takes 4.5 hours per attempt, so the re-sends push it over the limit. Build a faster route that meets nothing worse.',
        'Route: HQ → Ridge post → Ford → Island → Causeway → Rail bridge → Front (3.5 h). Strip: REPEAT ×2 around ■ ▲ ●. Field work: IF ALL 2 PIECES IDENTICAL → NO: SAY AGAIN!',
      ],
      debrief: {
        title: 'Shortest Paths',
        text: 'You found the cheapest path by joining short links into a route. In 1956 Edsger Dijkstra worked out how to do that efficiently, and routers still run his algorithm. ARPANET routed packets around slow and broken lines, and packet radio networks had to choose between retrying over a short noisy hop and taking a longer clean one. Retransmission is cheap on a fast path and ruinous on a slow one. That is why deep-space links correct errors instead of asking again.',
      },
      solution: {
        enc: '2x( ■ ▲ ● )', dec: [['IF_AGREE', { copies: 2 }, [], [['SAY_AGAIN', {}]]]], asm: '',
        route: ['HQ', 'RIDGE', 'FORD', 'ISLAND', 'BRIDGE', 'FIELD'],
      },
      anti: [
        // the obvious single roads
        { enc: '2x( ■ ▲ ● )', dec: [['IF_AGREE', { copies: 2 }, [], [['SAY_AGAIN', {}]]]], asm: '', route: ['HQ', 'MARSH', 'MILL', 'FIELD'] },
        { enc: '3x( ■ ▲ ● )', dec: [], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9', route: ['HQ', 'MARSH', 'MILL', 'FIELD'] },
        { enc: '2x( ■ ▲ ● )', dec: [['IF_AGREE', { copies: 2 }, [], [['SAY_AGAIN', {}]]]], asm: '', route: ['HQ', 'RIDGE', 'BRIDGE', 'FIELD'] },
        { enc: '3x( ■ ▲ ● )', dec: [], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9', route: ['HQ', 'FORD', 'ISLAND', 'FIELD'] },
        // the right route with the wrong code, and tempting mixes
        { enc: '3x( ■ ▲ ● )', dec: [], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9', route: ['HQ', 'RIDGE', 'FORD', 'ISLAND', 'BRIDGE', 'FIELD'] },
        { enc: '■ ▲ ●', dec: [], asm: '', route: ['HQ', 'RIDGE', 'FORD', 'ISLAND', 'BRIDGE', 'FIELD'] },
        { enc: '2x( ■ ▲ ● )', dec: [['IF_AGREE', { copies: 2 }, [], [['SAY_AGAIN', {}]]]], asm: '', route: ['HQ', 'RIDGE', 'FORD', 'ISLAND', 'FIELD'] },
        { enc: '2x( ■ ▲ ● )', dec: [['IF_AGREE', { copies: 2 }, [], [['SAY_AGAIN', {}]]]], asm: '', route: ['HQ', 'FORD', 'ISLAND', 'BRIDGE', 'FIELD'] },
      ],
    },
    {
      id: 'X2', sector: 4, name: 'DEAD RECKONING',
      format: [D, D, D, D],
      chain: [
        { kind: 'smudge', p: 0.9, set: DX },
        { kind: 'smudge', p: 0.9, set: DX },
        { kind: 'smudge', p: 0.9, set: DX },
        { kind: 'garble', p: 0.9, set: DX, to: DX },
        { kind: 'pad', p: 1, set: D, max: 2 },
      ],
      hiddenLine: true, samples: 5, sampleSeed: 30, probe: ['[4071]', '[23850]', '[999999]', '[61420017]', '[0000]'],
      enc: T7, dec: [...R3, 'BETWEEN', 'REPAIR', 'STRIP'], arq: false,
      target: 1, budget: 7, par: { overhead: 7, blocks: 3 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "The last stretch of the long wire is out of sight. Nobody knows what is on it, and there is no return channel. Intelligence has recovered five of our old enveloped transmissions as they arrived at the far end.\n\nOrders are 4 digits. Budget: 7 extra digits. Read the traffic, work out the worst the line can do, and build exactly enough code to survive it.",
      hints: [
        'List what you see: digits wrapped around the envelope, ?s, and digits that changed. Count the worst case of each in a single message.',
        'Up to three smudges and one garbled digit per message, plus junk outside the envelope. A smudge costs one seal digit and a garble two: five seal rows in all.',
        'Strip: "[" ■ ▲ ● ◆ SEAL mod 11 with five rows of powers over all nine positions: 1s, i, i², i³, i⁴ (the POWERS stamp, 5 rows) "]". Field work: OPEN ENVELOPE → REPAIR SCATTER up to 1.',
      ],
      debrief: {
        title: 'Channel Identification',
        text: 'Before you choose a code you need a model of the channel, and when nobody can hand you one you estimate it from data. That means measuring how often each kind of damage happens and how bad the worst case gets. Satellite and mobile links estimate the channel continuously and switch codes as it changes, which is called adaptive coding and modulation. Over-protect and you waste bandwidth; under-protect and orders are lost.',
      },
      solution: {
        enc: '"[" ■ ▲ ● ◆ RS5 "]"',
        dec: [['BETWEEN', { open: '[', close: ']' }], ['REPAIR', { mode: 'SCATTER', radius: 1 }]],
        asm: '',
      },
      anti: [
        { enc: '"[" ■ ▲ ● ◆ RS3 "]"', dec: [['BETWEEN', { open: '[', close: ']' }], ['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
        { enc: '"[" ■ ▲ ● ◆ RS4 "]"', dec: [['BETWEEN', { open: '[', close: ']' }], ['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
        { enc: '■ ▲ ● ◆ RS5', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
        { enc: '"[" ■ ▲ ● ◆ RS6 "]"', dec: [['BETWEEN', { open: '[', close: ']' }], ['REPAIR', { mode: 'SCATTER', radius: 2 }]], asm: '' },
      ],
    },
  ];

  // Defaults for optional fields.
  for (const lv of LEVELS) {
    lv.repair = lv.repair || ['SCATTER'];
    lv.metric = lv.metric || 'hamming';
  }

  CoC.data = { CHARACTERS, RANKS, LEVELS, fmtSet };
})();
