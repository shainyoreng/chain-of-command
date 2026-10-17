/* Chain of Command — additional campaign levels (levels-bureau-cyclic). Pushed into CoC.data.LEVELS; placed by theater-data.js.
 *
 *   THE ROTOR WORKS (sector 'cyclic', tier 4): the shift register (CRC tile, engine item {t:'crc', g}).
 *     Q1 THE REGISTER ROOM  bursts of four on a teleprinter line: r register lamps catch every burst up to r —
 *                           if g(x) has its "+ 1". Field: IF THE REGISTER CLEARS → else SAY AGAIN.
 *     Q2 THE FAULT FINDER   no wire back; one flipped lamp. The remainder of a lone flip is its address, and only a
 *                           primitive g(x) (period 15 ≥ 12 lamps) gives every hole a different one. REPAIR.
 *     Q3 THE TAPE LOOP      hidden line: the far teleprinter reads the loop two holes late (a rotation) and tears
 *                           bursts of three. The field's register only clears a rotated tape when the code is
 *                           cyclic: g(x) must divide xⁿ + 1 (n = 7, the cyclic Hamming code).
 *
 * Also registers the rotating relay's card (engine MIDDLEMEN.rotate) for the proving ground and reports.
 * Numbers are tuned so the reference earns all three medals on every verification seed and every `anti` fails.
 */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});
  const data = (CoC.data = CoC.data || {});

  // The tape-loop clerk is a real relay kind (engine MIDDLEMEN.rotate): give it a card.
  if (data.CHARACTERS && !data.CHARACTERS.rotate)
    data.CHARACTERS.rotate = {
      name: 'CPL. ROUNDABOUT',
      icon: 'shuffle',
      trait: (m) => {
        const k = m.by ?? m.len ?? 1;
        return `Reads the tape loop ${k} hole${k === 1 ? '' : 's'} late: the first ${k === 1 ? 'symbol comes' : k + ' come'} out last`;
      },
    };

  const B = '01';
  const B4 = [B, B, B, B];
  const B8 = [B, B, B, B, B, B, B, B];

  // The full kit by now (mirrors T7 / R3 in levels.js), plus the shift register.
  const T7 = ['REPEAT', 'NOT', 'PARITY', 'CHECK', 'IF', 'SEAL', 'FILL_ONES', 'FILL_POS', 'FILL_SQ', 'FILL_POW'];
  const TQ = [...T7, 'CRC'];
  const R3 = ['VOTE', 'READ_NOT'];

  const LAMPS8 = '■ ▲ ● ◆ ★ ⬟ ✚ ⬢';
  const LAMPS4 = '■ ▲ ● ◆';
  const ASK_UNLESS_CLEAR = ['IF_CRC_OK', {}, [], [['SAY_AGAIN', {}]]];
  const ASK_IF_INVALID = ['IF_VALID', {}, [], [['SAY_AGAIN', {}]]];
  const REPAIR1 = ['REPAIR', { mode: 'SCATTER', radius: 1 }];
  const HAMMING8 = `${LAMPS8} P(■▲◆★✚) P(■●◆⬟✚) P(▲●◆⬢) P(★⬟✚⬢)`;

  const LEVELS = [
    // ================================================================ Q1 — the register: bursts up to r
    {
      id: 'Q1', sector: 9, name: 'THE REGISTER ROOM',
      format: B8,
      chain: [{ kind: 'burst', p: 0.2, len: 4, to: B, name: 'TORN TAPE' }],
      enc: TQ, dec: [...R3, 'IF_PARITY', 'IF_VALID', 'IF_CRC_OK', 'SAY_AGAIN'], arq: true, target: 1, budget: 8,
      par: { overhead: 7.5, blocks: 3 }, repair: ['SCATTER', 'BURST'], metric: 'burst',
      briefing:
        "The Rotor Works was a loom factory before the war. Now its sheds turn out shift registers, rotating drums and miles of teleprinter tape — and the orders go out on that tape. The tape tears: four holes in a row chewed up at once, whatever was punched there.\n\nThe Works' fitters have built you a shift register: a row of lamps that the tape is clocked through, with switches (taps) that fold the outgoing lamp back in. What is left in the register at the end is stamped onto the tape. Their twin at the far post divides the tape the same way: if it clears to all zeros, the order is good.\n\nOrders are 8 lamps. The field may call SAY AGAIN. Budget: 8 extra lamps per order, re-sends included.",
      hints: [
        'Your interleaved parity lamps from the High Wire caught bursts as long as the number of lamps you spent. Tears here are four long. How many register lamps (the degree of g(x)) will that take?',
        'With r register lamps, the remainder catches every burst of r or fewer — as long as g(x) ends in “+ 1”. Without it, g(x) is secretly x·(something) and the last register lamp is dead weight. A shorter register misses some four-hole tears.',
        `Strip: ${LAMPS8}, then the shift register with g(x) = x⁴ + x + 1 (any degree-4 g with a + 1 will do). Field work: IF THE REGISTER CLEARS → (nothing); NO → SAY AGAIN!`,
      ],
      debrief: {
        title: 'The Cyclic Redundancy Check',
        text: 'Read the lamps as the coefficients of a polynomial and divide by g(x): the remainder is a fingerprint, and a burst of r or fewer flips can never be a multiple of a g of degree r with its + 1 — so it always leaves a mark. W. Wesley Peterson set this out in 1961, and showed it costs nothing but a shift register and a few exclusive-OR gates. Your interleaved parity from the mountain was the special case g(x) = x² + 1. The same register guards every Ethernet frame (CRC-32), HDLC and X.25 links, ZIP archives and the sectors of your disk.',
      },
      solution: { enc: `${LAMPS8} CRC:10011`, dec: [ASK_UNLESS_CLEAR], asm: '' },
      anti: [
        // the High Wire's code: two interleaved parity lamps catch tears of two, not four
        { enc: `${LAMPS8} P(■●★✚) P(▲◆⬟⬢)`, dec: [ASK_IF_INVALID], asm: '' },
        // a register one lamp too short (with and without the obvious taps)
        { enc: `${LAMPS8} CRC:1011`, dec: [ASK_UNLESS_CLEAR], asm: '' },
        { enc: `${LAMPS8} CRC:1001`, dec: [ASK_UNLESS_CLEAR], asm: '' },
        // four lamps, but no + 1: g = x·(x³ + 1), and plain x⁴ (it always stamps 0000)
        { enc: `${LAMPS8} CRC:10010`, dec: [ASK_UNLESS_CLEAR], asm: '' },
        { enc: `${LAMPS8} CRC:10000`, dec: [ASK_UNLESS_CLEAR], asm: '' },
        // a field register with nothing to match at HQ never clears
        { enc: `${LAMPS8} P(■●★✚) P(▲◆⬟⬢) P(■▲●◆) P(★⬟✚⬢)`, dec: [ASK_UNLESS_CLEAR], asm: '' },
      ],
    },

    // ================================================================ Q2 — the remainder as an address
    {
      id: 'Q2', sector: 9, name: 'THE FAULT FINDER',
      format: B8,
      chain: [{ kind: 'flip', p: 0.9, name: 'BAD RELAY CONTACT' }],
      enc: TQ, dec: [...R3, 'IF_PARITY', 'IF_VALID', 'IF_CRC_OK', 'REPAIR'], arq: false, target: 1, budget: 4,
      par: { overhead: 4, blocks: 2 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "The wire to the forward battery runs one way only: no SAY AGAIN. A sticky relay contact in the Works' old telephone exchange flips one lamp of nearly every order.\n\nThe drum-shop foreman says a register can do more than notice the damage. A lone flipped lamp leaves a remainder that depends only on WHERE it is — an address. If every hole on the tape has its own address, the field can find the bad lamp and turn it back. If two holes share one, the field is left guessing.\n\nOrders are 8 lamps. Budget: 4 extra lamps, no more.",
      hints: [
        'Four register lamps, so 12 lamps on the wire. The Code Analyzer tells you whether every single flip can be repaired: you want d = 3. Try different taps and watch it.',
        'A flip at hole i leaves the remainder of xⁱ divided by g(x). Those remainders repeat with the PERIOD of g (shown on the tile) — after that, two holes share an address. With 12 holes you need a period of at least 12. Of the degree-4 g with a + 1, most repeat after 4, 5, 6 or 7.',
        `Strip: ${LAMPS8}, then the shift register with g(x) = x⁴ + x + 1 (or x⁴ + x³ + 1): period 15. Field work: REPAIR SCATTER up to 1.`,
      ],
      debrief: {
        title: 'Primitive Polynomials',
        text: 'A g(x) of degree r whose remainders xⁱ mod g run through all 2ʳ − 1 non-zero patterns before repeating is called primitive. With one, the register’s remainder names the position of any single flip in up to 2ʳ − 1 lamps: you have rebuilt Hamming’s code as a shift register. Irreducible is not enough — x⁴ + x³ + x² + x + 1 cannot be factored, yet repeats after 5. The tables of primitive polynomials that engineers still use go back to Peterson’s 1961 book; Bose, Ray-Chaudhuri and Hocquenghem (1959–60) multiplied such factors together to correct several flips at once — the BCH codes in compact discs, QR codes and deep-space links.',
      },
      solution: { enc: `${LAMPS8} CRC:10011`, dec: [REPAIR1], asm: '' },
      anti: [
        // the reducible and the short-period registers: two holes share an address
        { enc: `${LAMPS8} CRC:11101`, dec: [REPAIR1], asm: '' }, // (x+1)(x³+x+1), period 7
        { enc: `${LAMPS8} CRC:10001`, dec: [REPAIR1], asm: '' }, // x⁴+1, period 4
        { enc: `${LAMPS8} CRC:10101`, dec: [REPAIR1], asm: '' }, // (x²+x+1)², period 6
        { enc: `${LAMPS8} CRC:11111`, dec: [REPAIR1], asm: '' }, // irreducible but period 5
        // the Q1 lesson alone is not enough: three lamps cannot name twelve holes
        { enc: `${LAMPS8} CRC:1011`, dec: [REPAIR1], asm: '' },
        // detection without repair
        { enc: `${LAMPS8} CRC:10011`, dec: [], asm: '' },
      ],
    },

    // ================================================================ Q3 — the tape loop: cyclic codes survive rotation
    {
      id: 'Q3', sector: 9, name: 'THE TAPE LOOP',
      format: B4,
      chain: [
        { kind: 'rotate', p: 1, by: 2, name: 'THE FAR TELEPRINTER' },
        { kind: 'burst', p: 0.25, len: 3, to: B, name: 'TORN TAPE' },
      ],
      hiddenLine: true,
      // An authored log: every test tape comes out two holes late (the first two lamps at the end); two were torn.
      intercepts: [
        { sent: '10000000', recv: '00000010' },
        { sent: '11000000', recv: '00000011' },
        { sent: '10110000', recv: '11000010' },
        { sent: '11111111', recv: '11101011' },
        { sent: '00001111', recv: '00111100' },
        { sent: '10010000', recv: '01000010' },
        { sent: '00000000', recv: '10100000' },
        { sent: '11100000', recv: '10000011' },
      ],
      enc: TQ, dec: [...R3, 'IF_CRC_OK', 'SAY_AGAIN'], arq: true, target: 1, budget: 6,
      par: { overhead: 5.5, blocks: 3 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "The forward post has no tape reels, only loops: each order is punched onto a closed ring of tape and fed through their teleprinter. Their machine never starts at the right hole. The signals office logged eight test tapes — what we punched, and what their printer typed out.\n\nTheir register is wired like yours and reads the tape exactly as their printer gives it. The Works has nothing out there to turn a tape back round. Orders are 4 lamps. The field may call SAY AGAIN. Budget: 6 extra lamps per order, re-sends included.",
      hints: [
        'Compare the log line by line. Where do the first lamps of each test tape end up? And what else happens now and then?',
        'Every tape arrives turned round by two holes, and some are torn three holes long. The field can read the order from wherever it lands (assembly row) — but its register divides the turned tape. A rotated valid tape is still valid only when the code is CYCLIC: when g(x) divides xⁿ + 1 for the n lamps you send. The period on the tile tells you which n.',
        `Strip: ${LAMPS4}, then the shift register with g(x) = x³ + x + 1 (period 7 — and 4 + 3 = 7 lamps). Field work: IF THE REGISTER CLEARS → (nothing); NO → SAY AGAIN! Assembly: ■ from #6, ▲ from #7, ● from #1, ◆ from #2.`,
      ],
      debrief: {
        title: 'Cyclic Codes',
        text: 'Eugene Prange at the Air Force Cambridge Research Center noticed in 1957 that some of the best codes are closed under rotation: turn a valid word round and it is still valid. That happens exactly when g(x) divides xⁿ + 1, and it is what lets a code be checked — and later decoded — by a few shift registers instead of a codebook. The code you just sent is Hamming’s (7,4) code, rebuilt as a ring. Cyclic codes became the backbone of the field: BCH codes (1959–60), Reed–Solomon codes (1960) and the CRCs of every network all live in this algebra of polynomials.',
      },
      solution: { enc: `${LAMPS4} CRC:1011`, dec: [ASK_UNLESS_CLEAR], asm: '■=#6 ▲=#7 ●=#1 ◆=#2' },
      anti: [
        // the right code, read as if nothing turned
        { enc: `${LAMPS4} CRC:1011`, dec: [ASK_UNLESS_CLEAR], asm: '' },
        // registers whose code is not a ring at this length
        { enc: `${LAMPS4} CRC:1001`, dec: [ASK_UNLESS_CLEAR], asm: '■=#6 ▲=#7 ●=#1 ◆=#2' }, // x³+1: period 3
        { enc: `${LAMPS4} CRC:10011`, dec: [ASK_UNLESS_CLEAR], asm: '■=#7 ▲=#8 ●=#1 ◆=#2' }, // period 15, 8 lamps
        // rings, but too weak for tears of three: one parity lamp, and x² + x + 1 on six lamps
        { enc: `${LAMPS4} CRC:11`, dec: [ASK_UNLESS_CLEAR], asm: '■=#4 ▲=#5 ●=#1 ◆=#2' },
        { enc: `${LAMPS4} CRC:111`, dec: [ASK_UNLESS_CLEAR], asm: '■=#5 ▲=#6 ●=#1 ◆=#2' },
        // no check at all
        { enc: LAMPS4, dec: [], asm: '■=#3 ▲=#4 ●=#1 ◆=#2' },
      ],
    },
  ];

  (data.LEVELS = data.LEVELS || []).push(...LEVELS);
})();
