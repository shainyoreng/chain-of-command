/* Chain of Command — additional campaign levels (levels-depot). Pushed into CoC.data.LEVELS; placed by theater-data.js.
 *
 *   THE FLOODED DEPOT (tier 2): build the check digit by hand, then the locating pair, then the check-matrix seal.
 *   The advance is 4-2 → D1 → 4-3 → 4-4 → 4-5 → D2; 4-2…4-5 live in levels.js.
 *     4-2 MONSOON        stock cards (bins 0–2), one smudge: one CHECK DIGIT, weight 1 on every bin, refills it.
 *     D1  THE LEDGER     typos and swapped neighbours, ask again: weights must differ, and mod 4 hides 2 × 2.
 *     4-3 QUARTERMASTER  the same on decimal item numbers: only mod 11 survives (ISBN-10, the X).
 *     4-4 NO RETREAT     one garble, no asking: CHECK 1,1,1,1 + CHECK 1,2,3,4 locate it (columns must all differ).
 *     4-5 FOG AND FIRE   a smudge and a garble: add the squares row (mod 5 fails: 2² = 3²).
 *     D2  SANDBAGS       six bins: three check tiles stall at d = 3 (5² = 6² mod 11); the SEAL with rows
 *                        1s / i / i² over ALL nine positions, its own digits included, reaches d = 4.
 *
 * Weight stamps (FILL_ONES, FILL_POS, FILL_SQ, FILL_POW) are issued only after the player has dialled that row
 * by hand: FILL_ONES from D1, FILL_POS from 4-3, FILL_SQ and FILL_POW only after D2 (the tier-3 seal levels).
 * Same schema as levels.js; numbers are tuned so the reference earns all three medals on every verification
 * seed and every `anti` fails (tests/verify.js).
 */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});
  const LEVELS = CoC.data.LEVELS;

  const TRI = '012'; // depot stock cards: each bin empty (0), low (1) or full (2)

  // Strip tools and readers, as in levels.js (T4 = up to the CHECK DIGIT).
  const T4 = ['REPEAT', 'NOT', 'PARITY', 'CHECK'];
  const R3 = ['VOTE', 'READ_NOT'];

  const REPAIR1 = ['REPAIR', { mode: 'SCATTER', radius: 1 }];
  const ASK_IF_INVALID = ['IF_VALID', {}, [], [['SAY_AGAIN', {}]]];

  const NEW = [
    // ================================================================ D1 — swaps: weights that differ, a modulus that can't be fooled
    {
      id: 'D1', sector: 3, name: 'THE LEDGER',
      format: [TRI, TRI, TRI],
      chain: [{ kind: 'clerk', p: 0.3 }],
      enc: [...T4, 'FILL_ONES'], dec: [...R3, 'IF_VALID', 'IF_AGREE', 'SAY_AGAIN'], arq: true, target: 1,
      budget: 3.5, par: { overhead: 3, blocks: 3 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "The depot ledger goes out by wire, three bins to a line, each marked 0, 1 or 2. The quartermaster's clerk is typing by lamplight. Now and then he hits the wrong key, or types two neighbouring digits the wrong way round.\n\nA wrong delivery is worse than a late one. Let the field notice every mistake and ask again. Budget: 3.5. New issue: the ONES stamp fills a check digit's weights with 1s.",
      hints: [
        'Your monsoon check adds the bins up. Does a total notice when two of them trade places?',
        'Give the bins DIFFERENT weights, like 1, 2, 3, so a digit that moves one place changes the total. A swap then moves the total by (the weight gap) × (the digit gap). Now watch the modulus: mod 4, a weight gap of 2 times a digit gap of 2 is 4, which leaves 0, and the swap vanishes. Choose a modulus where no such product can come out as 0.',
        'Strip: ■ ▲ ● then a CHECK DIGIT with weights 1, 2, 3 and modulus 5 (7 and 11 work too). Field work: IF SIGNAL IS IN CODEBOOK → (nothing); NO → SAY AGAIN!',
      ],
      debrief: {
        title: 'Weights and Primes',
        text: "A plain sum cannot see order: 1 + 2 is 2 + 1. With different weights, a swap moves the total by the weight gap times the digit gap, and a typo by the weight times the change. The mistake hides only if that product leaves 0. With a prime modulus that never happens unless one of the factors is already 0: if a prime divides a product, it divides one of the factors. That is why check-digit designers reach for primes. Mod 4 has 2 × 2 = 4, mod 6 has 2 × 3 = 6, and somewhere a mistake slips through.",
      },
      solution: { enc: '■ ▲ ● C5:1,2,3', dec: [ASK_IF_INVALID], asm: '' },
      anti: [
        // the monsoon sum (blind to swaps); moduli that swallow a product; plain copies (too dear)
        { enc: '■ ▲ ● C5:1,1,1', dec: [ASK_IF_INVALID], asm: '' },
        { enc: '■ ▲ ● C4:1,2,3', dec: [ASK_IF_INVALID], asm: '' },
        { enc: '■ ▲ ● C4:1,3,1', dec: [ASK_IF_INVALID], asm: '' },
        { enc: '■ ▲ ● C6:1,2,3', dec: [ASK_IF_INVALID], asm: '' },
        { enc: '2x( ■ ▲ ● )', dec: [['IF_AGREE', { copies: 2 }, [], [['SAY_AGAIN', {}]]]], asm: '' },
      ],
    },

    // ================================================================ D2 — the check-matrix seal, built by hand
    {
      id: 'D2', sector: 3, name: 'SANDBAGS',
      format: [TRI, TRI, TRI, TRI, TRI, TRI],
      chain: [
        { kind: 'smudge', p: 0.9 },
        { kind: 'garble', p: 0.9 },
      ],
      enc: [...T4, 'SEAL', 'FILL_ONES', 'FILL_POS'], dec: [...R3, 'REPAIR'], arq: false, target: 1, budget: 3,
      par: { overhead: 3, blocks: 2 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "High water. The full depot manifest, six bins of 0 to 2, must go out on the same wet, shelled line: one digit smudged, another garbled, no asking again. Budget: 3 extra digits.\n\nNew issue: the SEALING MACHINE. You write the check rows: a weight for EVERY position, the six bins and the seal's own three digits. The machine then picks its digits so that every row adds up to 0 (mod your modulus). If your rows cannot pin its digits down, the seal jams.",
      hints: [
        'Try the three checks from the last card first. The analyzer stops one step short. Find the two bins its closest pair confuses, and ask what each of your check digits is doing in that picture.',
        'Mod 11, bins 5 and 6 add up to 11, so their squares leave the same remainder (25 and 36 both leave 3). The squares row cannot tell them apart, and each old check digit answers to only one row. Bring the seal digits into the pattern: give every position, 1 to 9, the weights 1, i and i². Then every position has a column (1, i, i²), and any three such columns are independent. A seal with zeros on its own columns jams.',
        'Strip: ■ ▲ ● ◆ ★ ⬟ then a SEAL, modulus 11, with rows 1,1,1,1,1,1,1,1,1 / 1,2,3,4,5,6,7,8,9 / 1,4,9,5,3,3,5,9,4. Field work: REPAIR SCATTER up to 1.',
      ],
      debrief: {
        title: 'Reed–Solomon, by Hand',
        text: "Every position, seal digits included, now carries the column (1, i, i²), the powers of its own number. Any three such columns are independent (that is the parabola again), so three seal digits buy exactly distance 4, on any length up to the modulus minus one. That is a Reed–Solomon code (Irving Reed and Gustave Solomon, 1960), written the way you just wrote it: as a CHECK MATRIX H, whose rows every valid transmission satisfies. Your old check tiles were the other view of the same thing, a GENERATOR MATRIX G that says how each check digit is made from the order. Remainders mod a prime form a finite field, where you can add, multiply and divide as with ordinary numbers. Évariste Galois described these fields in 1830 and died in a duel two years later, at twenty. Signals now issues the SQUARES and POWERS stamps, which write such rows for you.",
      },
      solution: { enc: '■ ▲ ● ◆ ★ ⬟ H11:1,1,1,1,1,1,1,1,1|1,2,3,4,5,6,7,8,9|1,4,9,5,3,3,5,9,4', dec: [REPAIR1], asm: '' },
      anti: [
        // the last card's answer, stretched to six bins (5² = 6² mod 11), and its twin written as a seal
        { enc: '■ ▲ ● ◆ ★ ⬟ C11:1,1,1,1,1,1 C11:1,2,3,4,5,6 C11:1,4,9,5,3,3', dec: [REPAIR1], asm: '' },
        { enc: '■ ▲ ● ◆ ★ ⬟ H11:1,1,1,1,1,1,1,0,0|1,2,3,4,5,6,0,1,0|1,4,9,5,3,3,0,0,1', dec: [REPAIR1], asm: '' },
        // cubes instead of squares do not save the check tiles (5 + 6 = 11 again)
        { enc: '■ ▲ ● ◆ ★ ⬟ C11:1,1,1,1,1,1 C11:1,2,3,4,5,6 C11:1,8,5,9,4,7', dec: [REPAIR1], asm: '' },
        // a seal one row short; a modulus too small for nine positions (8 = 1 mod 7)
        { enc: '■ ▲ ● ◆ ★ ⬟ H11:1,1,1,1,1,1,1,1|1,2,3,4,5,6,7,8', dec: [REPAIR1], asm: '' },
        { enc: '■ ▲ ● ◆ ★ ⬟ H7:1,1,1,1,1,1,1,1,1|1,2,3,4,5,6,0,1,2|1,4,2,2,4,1,0,1,4', dec: [REPAIR1], asm: '' },
      ],
    },
  ];

  LEVELS.push(...NEW);
  for (const lv of NEW) {
    lv.repair = lv.repair || ['SCATTER'];
    lv.metric = lv.metric || 'hamming';
  }
})();
