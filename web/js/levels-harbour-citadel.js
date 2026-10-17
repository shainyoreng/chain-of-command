/* Chain of Command — additional campaign levels (levels-harbour-citadel). Pushed into CoC.data.LEVELS; placed by theater-data.js.
 *
 *   THE HARBOUR (tier 3): salt-water damage — envelopes, smudged manifests and check digits.
 *     H1 THE MANIFEST        one smudge, but the flag hoist has no flag for X: mod 11 is out, below 10 two digits
 *                            collide, so mod 10 with weights that 10 cannot swallow (1, 3, 7, 9).
 *     H2 LAMPS ACROSS THE WATER  hidden line: the other ships' traffic is digits AND brackets, one misread digit.
 *                            An envelope of markers nobody else in the harbour uses, and two seal rows.
 *     H3 THE OUTER ROADS     routing: every quick route climbs the flag hoist (no X → mod 10, which refills only one
 *                            smudge), so the road with one smudge and the merchants' traffic: a mod-10 check in a
 *                            private envelope.
 *   THE CITADEL (tier 4): every trick of the war, combined.
 *     Z1 THE GLACIS          routing + SAY AGAIN under a clock: fix the ditch's smudge, ask again when the rare
 *                            sentry meddles, strip the buglers' letters; the glacis is shot to pieces, the mine too slow.
 *     Z2 THE COUNTERMINE     hidden line: cave-ins smudge two neighbours (markers too), the tappers add digits, a
 *                            rare tamper. Envelope + seal, and SAY AGAIN rescues an envelope the earth has buried.
 *     Z3 THE KEEP            routing: two enemy exchanges each write the message back to front; through both it
 *                            arrives straight and the seal works. Through one, the codebook cannot read it.
 *
 * Same schema as levels.js. Check digits are dial tiles (C<mod>:weights) and seals are written rows (H<mod>:rows),
 * never presets. Numbers are tuned so the reference earns all three medals on every verification seed and every
 * `anti` fails (tests/verify.js).
 */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});
  const LEVELS = CoC.data.LEVELS;

  const D = '0123456789';
  const DX = '0123456789X';

  // The full kit (mirrors T7 / R3 in levels.js): every weight stamp is on issue by now.
  const T7 = ['REPEAT', 'NOT', 'PARITY', 'CHECK', 'IF', 'SEAL', 'FILL_ONES', 'FILL_POS', 'FILL_SQ', 'FILL_POW'];
  const R3 = ['VOTE', 'READ_NOT'];

  // Relays.
  const smudge = (name, p = 0.9) => ({ kind: 'smudge', p, set: DX, name });
  const garble = (name, p = 0.9) => ({ kind: 'garble', p, set: DX, to: DX, name });
  const flags = (name) => ({ kind: 'drop', p: 1, set: 'X', name }); // ten numeral flags: an X is never hoisted
  const traffic = (name) => ({ kind: 'pad', p: 1, set: D + '[]', max: 2, name }); // other ships frame with [ ] too
  const tapping = (name) => ({ kind: 'pad', p: 1, set: D, max: 2, name });
  const chatter = (name) => ({ kind: 'pad', p: 1, set: 'ABCDEF', max: 2, name });
  const shells = (name, len, p = 0.9) => ({ kind: 'burst', p, len, to: DX, name });
  const cavein = (name, len, p = 0.9) => ({ kind: 'burst', p, len, to: '?', name });
  const clerk = (name, p) => ({ kind: 'clerk', p, to: D, name });
  const exchange = (name) => ({ kind: 'reverse', p: 1, name });

  // Seal rows written out: the powers of the position, mod 11 (what the POWERS stamp writes).
  const POW = (rows, len) =>
    'H11:' +
    Array.from({ length: rows }, (_, e) =>
      Array.from({ length: len }, (_, j) => {
        let r = 1;
        for (let k = 0; k < e; k++) r = (r * (j + 1)) % 11;
        return r;
      }).join(',')
    ).join('|');

  // Field-work shorthands.
  const REPAIR = (radius) => ['REPAIR', { mode: 'SCATTER', radius }];
  const ASK_IF_INVALID = ['IF_VALID', {}, [], [['SAY_AGAIN', {}]]];
  const OPEN = (open, close) => ['BETWEEN', { open, close }];
  const STRIP_LETTERS = ['STRIP', { set: 'ABCDEF' }];

  // Routing levels list every relay on the map as their chain (for the field's symbol pickers).
  const withNetworkChain = (lv) =>
    Object.defineProperty(lv, 'chain', {
      get() {
        return this.network.links.flatMap((l) => l.chain);
      },
      enumerable: true,
      configurable: true,
    });

  const NEW = [
    // ================================================================ THE HARBOUR
    {
      id: 'H1', sector: 4, name: 'THE MANIFEST',
      format: [D, D, D],
      chain: [flags('NUMERAL FLAGS'), smudge('SALT SPRAY')],
      enc: T7, dec: [...R3, 'REPAIR', 'IF_VALID'], arq: false, target: 1, budget: 1,
      par: { overhead: 1, blocks: 2 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "The harbour at last: cranes, bollards and a forest of masts. Every ship's manifest goes out as three digits (hold, deck and crate count), and the harbour-master sends it across the basin to the quay by flag hoist, one numeral flag per digit. Spray comes off the water all day; nearly every hoist has one flag the quay cannot make out, and logs it as ?.\n\nBudget: one extra digit. The signal yard keeps the ten numeral flags of the International Code, 0 to 9.",
      hints: [
        'One smudge, one extra digit: the monsoon trick. But watch what the flag hoist does to your check digit before the quay ever sees it.',
        'There is no flag for X, so a check that can come out as 10 sometimes never arrives: mod 11 is out. A modulus below 10 is no better, because two of the ten digits leave the same remainder (mod 9, a 0 and a 9 look alike). That leaves mod 10, where a weight of 2, 4, 5, 6 or 8 swallows some difference (5 × 2 = 10 leaves 0).',
        'Strip: ■ ▲ ● then a CHECK DIGIT with weights 1, 1, 1 and modulus 10 (any of 1, 3, 7, 9 work as weights). Field work: REPAIR SCATTER up to 1.',
      ],
      debrief: {
        title: 'Ten Flags, Mod 10',
        text: "To refill one smudge, each weight only has to be undoable: multiplying by it must never send two digits to the same remainder. Mod 10 that leaves the weights 1, 3, 7 and 9; the others share a factor with 10. A prime modulus like 11 makes every weight safe and catches swaps as well, but it needs an eleventh symbol, the X, and a channel with only ten symbols cannot carry it. Designers in that position settle for mod 10. The UPC barcode (1973) weights its digits 3, 1, 3, 1 … mod 10, and Hans Peter Luhn's check on card numbers is mod 10 as well. Both refill a missing digit perfectly; it is only certain swaps they miss. Ships still hoist the same ten numeral pennants of the International Code of Signals.",
      },
      solution: { enc: '■ ▲ ● C10:1,1,1', dec: [REPAIR(1)], asm: '' },
      anti: [
        // the ISBN habit (mod 11: the X is never hoisted); a modulus too small for ten digits; weights 10 swallows
        { enc: '■ ▲ ● C11:1,1,1', dec: [REPAIR(1)], asm: '' },
        { enc: '■ ▲ ● C11:1,2,3', dec: [REPAIR(1)], asm: '' },
        { enc: '■ ▲ ● C9:1,1,1', dec: [REPAIR(1)], asm: '' },
        { enc: '■ ▲ ● C10:1,2,3', dec: [REPAIR(1)], asm: '' },
        { enc: '■ ▲ ● C10:5,5,5', dec: [REPAIR(1)], asm: '' },
      ],
    },
    {
      id: 'H2', sector: 4, name: 'LAMPS ACROSS THE WATER',
      format: [D, D, D],
      chain: [garble('MISREAD FLASH'), traffic('MERCHANT TRAFFIC')],
      hiddenLine: true,
      // An authored night-watch log: the other ships' flashes wrap every message, digits and brackets alike,
      // and at most one digit of ours is misread.
      intercepts: [
        { sent: '[407]', recv: '3[[497]1' },
        { sent: '[999999]', recv: ']8[999939]]' },
        { sent: '[0000]', recv: '6[0000]2[' },
        { sent: '[5312]', recv: '[[5372]0' },
        { sent: '86104', recv: '4861841[' },
      ],
      enc: T7, dec: [...R3, 'BETWEEN', 'STRIP', 'REPAIR', 'IF_VALID'], arq: false, target: 1, budget: 4,
      par: { overhead: 4, blocks: 3 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "At night the harbour talks by lamp. Our signal station flashes orders across the water to the destroyers at the far moorings, but the roads are full of merchant ships flashing their own traffic, and from the far side it all runs together. Nobody can say exactly what the lookouts over there make of it. The night watch logged five of our test signals as they were sent and as the far moorings wrote them down.\n\nOrders are 3 digits and nobody can flash back. Command allows 4 extra symbols per order. Read the log first.",
      hints: [
        'Compare each pair. What gets added around our signal, and what is it made of? Look closely at it. How many of our own digits change?',
        "The other ships' flashes are digits AND brackets: every navy frames its signals the same way we do, so OPEN ENVELOPE [ … ] sometimes opens THEIR envelope. Frame yours with a marker nobody else in the harbour uses. Inside, one digit can be misread, and a misread costs two seal digits.",
        'Strip: "<" ■ ▲ ● then a SEAL, modulus 11, with rows 1,1,1,1,1 / 1,2,3,4,5 (the POWERS stamp, 2 rows) ">". Field work: OPEN ENVELOPE < … > → REPAIR SCATTER up to 1.',
      ],
      debrief: {
        title: 'A Flag Nobody Else Flies',
        text: "An envelope only works if its marker can never turn up anywhere else. The merchant ships' brackets were somebody else's envelopes, and the field opened them. Every framed protocol faces this. HDLC, the link protocol standardised in 1979 from IBM's SDLC, marks each frame with the flag 01111110, and whenever five 1s in a row appear inside the data the sender stuffs in an extra 0, so the flag can never occur by accident. Ethernet starts each frame with a fixed preamble and a start-of-frame byte for the same reason. At sea, a lamp signal opened with the call sign of the ship it was meant for, so every other ship could ignore it.",
      },
      solution: { enc: `"<" ■ ▲ ● ${POW(2, 5)} ">"`, dec: [OPEN('<', '>'), REPAIR(1)], asm: '' },
      anti: [
        // the habit: square brackets, which the merchants also flash; no envelope; one seal row; copies
        { enc: `"[" ■ ▲ ● ${POW(2, 5)} "]"`, dec: [OPEN('[', ']'), REPAIR(1)], asm: '' },
        { enc: `■ ▲ ● ${POW(2, 5)}`, dec: [REPAIR(1)], asm: '' },
        { enc: `"<" ■ ▲ ● ${POW(1, 4)} ">"`, dec: [OPEN('<', '>'), REPAIR(1)], asm: '' },
        { enc: '"<" 3x( ■ ▲ ● ) ">"', dec: [OPEN('<', '>')], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9' },
      ],
    },
    withNetworkChain({
      id: 'H3', sector: 4, name: 'THE OUTER ROADS',
      format: [D, D, D],
      network: {
        nodes: [
          { id: 'HQ', label: 'Harbour office', x: 3, y: 50 },
          { id: 'TOWER', label: 'Signal tower', x: 26, y: 8 },
          { id: 'LIGHT', label: 'Lighthouse', x: 70, y: 8, kind: 'bridge' },
          { id: 'QUAY', label: 'Customs quay', x: 30, y: 50 },
          { id: 'BUOY', label: 'Bell buoy', x: 70, y: 50, kind: 'ford' },
          { id: 'SLIP', label: 'Tug slip', x: 26, y: 92 },
          { id: 'DOCK', label: 'Dry dock', x: 70, y: 92, kind: 'mill' },
          { id: 'FIELD', label: 'The fleet', x: 97, y: 50 },
        ],
        river: [[48, -12], [45, 22], [51, 50], [46, 78], [50, 112]],
        links: [
          { a: 'HQ', b: 'TOWER', name: 'Flag hoist', delay: 0.5, chain: [flags('NUMERAL FLAGS')] },
          { a: 'TOWER', b: 'LIGHT', name: 'Lamp across the basin', delay: 1, chain: [smudge('SALT SPRAY')] },
          { a: 'LIGHT', b: 'FIELD', name: 'Lighthouse lamp', delay: 0.5, chain: [garble('FOG')] },
          { a: 'HQ', b: 'QUAY', name: 'Quay road', delay: 1.5, chain: [] },
          { a: 'QUAY', b: 'BUOY', name: 'Pilot launch', delay: 1, chain: [traffic('MERCHANT TRAFFIC')] },
          { a: 'BUOY', b: 'FIELD', name: 'Buoy lamp', delay: 0.5, chain: [smudge('SPRAY')] },
          { a: 'HQ', b: 'SLIP', name: 'Shore road', delay: 0.5, chain: [] },
          { a: 'SLIP', b: 'BUOY', name: 'Tug run', delay: 1.5, chain: [garble("TUG'S WAKE"), smudge('BOW SPRAY')] },
          { a: 'SLIP', b: 'DOCK', name: 'Slipway', delay: 1, chain: [] },
          { a: 'DOCK', b: 'FIELD', name: 'Dock road', delay: 2, chain: [] },
          { a: 'TOWER', b: 'QUAY', name: 'Harbour steps', delay: 0.5, chain: [] },
          { a: 'LIGHT', b: 'BUOY', name: 'Breakwater cable', delay: 0.5, chain: [smudge('WAVES')] },
          { a: 'QUAY', b: 'SLIP', name: 'Fish market', delay: 1, chain: [] },
        ],
      },
      enc: T7, dec: [...R3, 'BETWEEN', 'STRIP', 'REPAIR', 'IF_VALID'], arq: false, target: 1, budget: 3, delayBudget: 2.5,
      par: { overhead: 3, blocks: 3 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "The fleet sails on the evening tide and lies in the outer roads, beyond the breakwater, waiting for its orders. Three digits per order, and the fleet keeps radio silence: nobody out there may answer.\n\nEvery way out of the harbour does its own damage. The flag hoist on the signal tower has no flag for X, the lamps smudge in the spray, fog sits on the lighthouse, the merchant ships crowd the anchorage with their own traffic, and the tugs churn up the water. Plot the route yourself, from the harbour office to the fleet. Command's limits: at most 3 extra digits per order, and every order out within 2½ hours.",
      hints: [
        'Price every route you can finish in 2½ hours. A smudge costs a check digit, a garble two, the merchants\' traffic an envelope. And remember what the flag hoist cannot fly.',
        "Every route that quick climbs the signal tower first, so no X: your checks must be mod 10, and mod 10 can never refill two smudges (two checks mod 10 always leave a pair of positions they cannot tell apart). Only one quick route meets a single smudge and no garble: down the harbour steps and out on the pilot launch, through the merchants' traffic, brackets and all.",
        'Route: Harbour office → Signal tower → Harbour steps → Customs quay → Pilot launch → Bell buoy → Buoy lamp → The fleet (2½ h). Strip: "<" ■ ▲ ● then a CHECK DIGIT with weights 1, 1, 1 and modulus 10 ">". Field work: OPEN ENVELOPE < … > → REPAIR SCATTER up to 1.',
      ],
      debrief: {
        title: 'The Alphabet Decides',
        text: "The quick road chose your alphabet, and the alphabet chose your code. Seals like Reed–Solomon need arithmetic where every nonzero weight can be divided back out, which means a prime modulus (or a power of one, with a different kind of arithmetic). Ten digits are not such a field, so with ten symbols you get one good check digit and no more. That is why digital codes work in bytes: the CD (1982) runs its Reed–Solomon codes in a field of 256 elements, exactly one byte each. Print has the same trouble with the ISBN's X. When books moved to 13-digit EAN barcodes in 2007, the X had to go, and with it the mod-11 check.",
      },
      solution: {
        enc: '"<" ■ ▲ ● C10:1,1,1 ">"', dec: [OPEN('<', '>'), REPAIR(1)], asm: '',
        route: ['HQ', 'TOWER', 'QUAY', 'BUOY', 'FIELD'],
      },
      anti: [
        // the right road: the mod-11 habit, square brackets, a weight 10 swallows
        { enc: '"<" ■ ▲ ● C11:1,1,1 ">"', dec: [OPEN('<', '>'), REPAIR(1)], asm: '', route: ['HQ', 'TOWER', 'QUAY', 'BUOY', 'FIELD'] },
        { enc: '"[" ■ ▲ ● C10:1,1,1 "]"', dec: [OPEN('[', ']'), REPAIR(1)], asm: '', route: ['HQ', 'TOWER', 'QUAY', 'BUOY', 'FIELD'] },
        { enc: '"<" ■ ▲ ● C10:1,2,3 ">"', dec: [OPEN('<', '>'), REPAIR(1)], asm: '', route: ['HQ', 'TOWER', 'QUAY', 'BUOY', 'FIELD'] },
        // the lighthouse (spray + fog) and the breakwater (three smudges): seals the hoist cannot fly
        { enc: `■ ▲ ● ${POW(3, 6)}`, dec: [REPAIR(1)], asm: '', route: ['HQ', 'TOWER', 'LIGHT', 'FIELD'] },
        { enc: `■ ▲ ● ${POW(3, 6)}`, dec: [REPAIR(0)], asm: '', route: ['HQ', 'TOWER', 'LIGHT', 'BUOY', 'FIELD'] },
        { enc: '■ ▲ ● C10:1,1,1 C10:1,3,7 C10:1,9,3', dec: [REPAIR(0)], asm: '', route: ['HQ', 'TOWER', 'LIGHT', 'BUOY', 'FIELD'] },
        // the tugs: a garble and two smudges, four seal digits; the quay road: too slow
        { enc: `■ ▲ ● ${POW(4, 7)}`, dec: [REPAIR(1)], asm: '', route: ['HQ', 'SLIP', 'BUOY', 'FIELD'] },
        { enc: '"<" ■ ▲ ● C11:1,1,1 ">"', dec: [OPEN('<', '>'), REPAIR(1)], asm: '', route: ['HQ', 'QUAY', 'BUOY', 'FIELD'] },
      ],
    }),

    // ================================================================ THE CITADEL
    withNetworkChain({
      id: 'Z1', sector: 5, name: 'THE GLACIS',
      format: [D, D, D],
      network: {
        nodes: [
          { id: 'HQ', label: 'Siege lines', x: 3, y: 50 },
          { id: 'SAP', label: 'Sap head', x: 26, y: 8 },
          { id: 'CREST', label: 'Glacis crest', x: 70, y: 8, kind: 'bridge' },
          { id: 'PAR', label: 'Third parallel', x: 30, y: 50 },
          { id: 'RAV', label: 'Ravelin', x: 70, y: 50, kind: 'ford' },
          { id: 'SHAFT', label: 'Mine shaft', x: 26, y: 92 },
          { id: 'CHAMBER', label: 'Mine chamber', x: 70, y: 92, kind: 'mill' },
          { id: 'FIELD', label: 'The breach', x: 97, y: 50 },
        ],
        river: [[50, -12], [47, 24], [52, 52], [47, 80], [51, 112]],
        links: [
          { a: 'HQ', b: 'SAP', name: 'The sap', delay: 0.5, chain: [smudge('MUD')] },
          { a: 'SAP', b: 'CREST', name: 'The glacis', delay: 0.5, chain: [shells('GRAPESHOT', 2)] },
          { a: 'CREST', b: 'FIELD', name: 'The breach', delay: 0.5, chain: [] },
          { a: 'HQ', b: 'PAR', name: 'Approach trench', delay: 1, chain: [] },
          { a: 'PAR', b: 'RAV', name: 'Covered way', delay: 1, chain: [chatter('ENEMY BUGLERS'), clerk('ENEMY SENTRY', 0.15)] },
          { a: 'RAV', b: 'FIELD', name: 'The ditch', delay: 0.5, chain: [smudge('FLOODED DITCH')] },
          { a: 'HQ', b: 'SHAFT', name: 'Mine gallery', delay: 1, chain: [] },
          { a: 'SHAFT', b: 'CHAMBER', name: 'Mine gallery', delay: 1, chain: [cavein('CAVE-IN', 3)] },
          { a: 'CHAMBER', b: 'FIELD', name: 'Mine gallery', delay: 1.5, chain: [] },
          { a: 'SAP', b: 'PAR', name: 'Zigzag', delay: 0.5, chain: [] },
          { a: 'CREST', b: 'RAV', name: 'Ravelin bridge', delay: 0.5, chain: [garble('SHARPSHOOTER')] },
          { a: 'PAR', b: 'SHAFT', name: 'Shaft ladder', delay: 0.5, chain: [] },
          { a: 'RAV', b: 'CHAMBER', name: 'Countermine', delay: 0.5, chain: [tapping('ENEMY TAPPING')] },
        ],
      },
      enc: T7, dec: [...R3, 'BETWEEN', 'STRIP', 'REPAIR', 'IF_VALID', 'SAY_AGAIN'], arq: true, target: 1,
      budget: 3, delayBudget: 3.25, par: { overhead: 2.85, blocks: 5 }, repair: ['SCATTER', 'BURST'], metric: 'hamming',
      briefing:
        "The Citadel: a star fort three hundred years old, all angles and earth-backed stone, with a ditch, a ravelin and a long bare slope, the glacis, swept by its guns. Our storming party is in the breach at the foot of the walls. Every order from the siege lines must reach it.\n\nThe sap is quick but muddy, and the glacis beyond it is raked with grapeshot that tears up two digits at once. The covered way is quieter: enemy buglers blare letters across it and a sentry there now and then mistypes a digit or swaps two, perhaps one order in seven. The ditch is flooded. The mine gallery under it all is safe from the guns but caves in, and it is slow. The breach can call SAY AGAIN, and every re-send crawls the whole route again.\n\nOrders are 3 digits. Command's limits: at most 3 extra digits and 3¼ hours per order on average, re-sends included.",
      hints: [
        'For every road, ask two questions: what does it do to an order, and how often? Damage that strikes nearly every order has to be fixed on the spot. Damage that is rare can simply be noticed, if there is time to ask again.',
        "The covered way: the buglers' letters are not digits, so STRIP OUT throws them away for free. The ditch smudges one digit: fix it in place. The sentry meddles about one order in seven: do not correct him, notice him and ask again. A swap moves two digits, but a row of positions sees it. Two seal rows fill one smudge and still notice his work. The glacis needs too many seal digits, the mine gallery too many hours.",
        'Route: Siege lines → Approach trench → Third parallel → Covered way → Ravelin → The ditch → The breach (2½ h per send). Strip: ■ ▲ ● then a SEAL, modulus 11, with rows 1,1,1,1,1 / 1,2,3,4,5 (the POWERS stamp, 2 rows). Field work: STRIP OUT {A,B,C,D,E,F} → REPAIR SCATTER up to 0 → IF SIGNAL IS IN CODEBOOK → (nothing); NO → SAY AGAIN!',
      ],
      debrief: {
        title: 'Correct, or Ask Again?',
        text: "Damage that comes on nearly every order has to be repaired where it lands. Damage that is rare is cheaper to notice and ask about, as long as the clock allows a second try. You split the work that way: the code fixed the ditch's smudge and only reported the sentry. Every hybrid ARQ system strikes this balance, from mobile phones to the links to Mars, where a re-send costs twenty minutes and almost everything is corrected on the spot. The ground you crossed is Vauban's. At Maastricht in 1673 Sébastien Le Prestre de Vauban brought a siege to the walls through zigzag saps and parallel trenches, and his star forts guarded Europe's frontiers for two centuries.",
      },
      solution: {
        enc: `■ ▲ ● ${POW(2, 5)}`, dec: [STRIP_LETTERS, REPAIR(0), ASK_IF_INVALID], asm: '',
        route: ['HQ', 'PAR', 'RAV', 'FIELD'],
      },
      anti: [
        // the right road: correcting the sentry (too dear), one row, no asking, the letters left in
        { enc: `■ ▲ ● ${POW(5, 8)}`, dec: [STRIP_LETTERS, REPAIR(2)], asm: '', route: ['HQ', 'PAR', 'RAV', 'FIELD'] },
        { enc: `■ ▲ ● ${POW(1, 4)}`, dec: [STRIP_LETTERS, REPAIR(0), ASK_IF_INVALID], asm: '', route: ['HQ', 'PAR', 'RAV', 'FIELD'] },
        { enc: `■ ▲ ● ${POW(2, 5)}`, dec: [STRIP_LETTERS, REPAIR(1)], asm: '', route: ['HQ', 'PAR', 'RAV', 'FIELD'] },
        { enc: `■ ▲ ● ${POW(2, 5)}`, dec: [REPAIR(0), ASK_IF_INVALID], asm: '', route: ['HQ', 'PAR', 'RAV', 'FIELD'] },
        // the glacis: mud and grapeshot (a smudge and two garbles), or grapeshot alone by the zigzag
        { enc: `■ ▲ ● ${POW(5, 8)}`, dec: [REPAIR(2)], asm: '', route: ['HQ', 'SAP', 'CREST', 'FIELD'] },
        { enc: `■ ▲ ● ${POW(4, 7)}`, dec: [REPAIR(2)], asm: '', route: ['HQ', 'PAR', 'SAP', 'CREST', 'FIELD'] },
        // the mine gallery: three seal digits fill the cave-in, but it takes 3½ hours
        { enc: `■ ▲ ● ${POW(3, 6)}`, dec: [REPAIR(0)], asm: '', route: ['HQ', 'SHAFT', 'CHAMBER', 'FIELD'] },
        // the sap into the covered way: two smudges and the sentry
        { enc: `■ ▲ ● ${POW(3, 6)}`, dec: [STRIP_LETTERS, REPAIR(0), ASK_IF_INVALID], asm: '', route: ['HQ', 'SAP', 'PAR', 'RAV', 'FIELD'] },
      ],
    }),
    {
      id: 'Z2', sector: 5, name: 'THE COUNTERMINE',
      format: [D, D, D],
      chain: [
        cavein('CAVE-IN', 2, 0.6),
        garble('COUNTER-MINER', 0.15),
        tapping('ENEMY TAPPING'),
      ],
      hiddenLine: true,
      // An authored log from the listening gallery: the tappers' digits on both sides of every message, cave-ins that
      // turn two neighbours into ?, the envelope's markers included, and one digit tampered with.
      intercepts: [
        { sent: '[407]', recv: '5[4??]81' },
        { sent: '[0000]', recv: '72??000]4' },
        { sent: '[613]', recv: '0[613]95' },
        { sent: '[5555]', recv: '8[5525]1' },
        { sent: '[2846]', recv: '1[284??37' },
        { sent: '[777]', recv: '46[7??]2' },
      ],
      enc: T7, dec: [...R3, 'BETWEEN', 'STRIP', 'REPAIR', 'IF_VALID', 'SAY_AGAIN'], arq: true, target: 1, budget: 9.5,
      par: { overhead: 8.25, blocks: 5 }, repair: ['SCATTER', 'BURST'], metric: 'hamming',
      briefing:
        "Under the bastions the war goes on in the dark. Our miners are driving a gallery toward the walls, the enemy's counter-miners are digging to meet them, and a field telephone wire runs back along our tunnel. Nobody can walk the length of it while the picks are going. A listening post at the far end copied six of our test messages as they arrived.\n\nOrders are 3 digits. The wire works both ways, so the far end can call SAY AGAIN. Command allows 9½ extra digits per order on average, re-sends included.",
      hints: [
        'List what the log shows: what is wrapped around each message, what turns into ?, how many at a time and where, and what changes into a different digit. Then look at what happened to the envelopes.',
        "The tappers add digits, so you need an envelope, and STRIP OUT cannot help. A cave-in smudges two neighbours (two seal digits fill them), and the tamper changes one digit now and then: notice it with one more row and ask again. But a cave-in can bury a marker too, and then no envelope opens. A buried envelope is just one more thing to notice: if what comes out of it is not a valid transmission, ask again.",
        'Strip: "[" ■ ▲ ● then a SEAL, modulus 11, with three rows of powers over all six positions: 1s, i, i² (the POWERS stamp, 3 rows) "]". Field work: OPEN ENVELOPE [ … ] → REPAIR SCATTER up to 1 → IF SIGNAL IS IN CODEBOOK → (nothing); NO → SAY AGAIN!',
      ],
      debrief: {
        title: 'When the Frame Breaks',
        text: "Framing is a weak point: lose a marker and you lose the whole message, however good the code inside. You did not try to make the envelope unbreakable; you made its failure visible. A frame that does not open into a valid transmission is treated like any other damage and sent again. Real links do exactly this. An HDLC or Ethernet frame whose check fails, or whose boundaries are lost, is simply discarded, and the sender retransmits it when no acknowledgement comes back. The gallery was real enough too. In the First World War both sides tunnelled under the trenches, and miners lay in listening galleries with stethoscopes and geophones, counting the enemy's pick strokes through the clay.",
      },
      solution: {
        enc: `"[" ■ ▲ ● ${POW(3, 6)} "]"`,
        dec: [OPEN('[', ']'), REPAIR(1), ASK_IF_INVALID],
        asm: '',
      },
      anti: [
        // no asking again: a buried marker loses the order; the flood's lesson (no envelope) fails on the tappers' digits
        { enc: `"[" ■ ▲ ● ${POW(3, 6)} "]"`, dec: [OPEN('[', ']'), REPAIR(1)], asm: '' },
        { enc: `"[" ■ ▲ ● ${POW(4, 7)} "]"`, dec: [OPEN('[', ']'), REPAIR(1)], asm: '' },
        { enc: `■ ▲ ● ${POW(3, 6)}`, dec: [REPAIR(1), ASK_IF_INVALID], asm: '' },
        // one row short: the tamper slips through next to a cave-in
        { enc: `"[" ■ ▲ ● ${POW(2, 5)} "]"`, dec: [OPEN('[', ']'), REPAIR(0), ASK_IF_INVALID], asm: '' },
        // ask about every cave-in instead of filling it: too dear
        { enc: `"[" ■ ▲ ● ${POW(1, 4)} "]"`, dec: [OPEN('[', ']'), ASK_IF_INVALID], asm: '' },
      ],
    },
    withNetworkChain({
      id: 'Z3', sector: 5, name: 'THE KEEP',
      format: [D, D, D],
      network: {
        nodes: [
          { id: 'HQ', label: 'The breach', x: 3, y: 50 },
          { id: 'GATE', label: 'Gatehouse', x: 26, y: 8, kind: 'bridge' },
          { id: 'BASTION', label: 'North bastion', x: 70, y: 8 },
          { id: 'COURT', label: 'Parade ground', x: 30, y: 50 },
          { id: 'CHAPEL', label: 'Chapel', x: 70, y: 50, kind: 'mill' },
          { id: 'WELL', label: 'Well house', x: 26, y: 92, kind: 'ford' },
          { id: 'ARMOURY', label: 'Armoury', x: 70, y: 92 },
          { id: 'FIELD', label: 'The keep', x: 97, y: 50 },
        ],
        links: [
          { a: 'HQ', b: 'GATE', name: 'Gate passage', delay: 0.5, chain: [exchange('ENEMY EXCHANGE')] },
          { a: 'GATE', b: 'BASTION', name: 'Rampart walk', delay: 1, chain: [smudge('SMOKE')] },
          { a: 'BASTION', b: 'FIELD', name: 'Keep bridge', delay: 0.5, chain: [garble('MARKSMEN')] },
          { a: 'HQ', b: 'COURT', name: 'Sally port', delay: 1.5, chain: [smudge('RAIN')] },
          { a: 'COURT', b: 'CHAPEL', name: 'Cloister', delay: 0.5, chain: [chatter('GARRISON SHOUTING'), smudge('DUST')] },
          { a: 'CHAPEL', b: 'FIELD', name: 'Crypt passage', delay: 0.5, chain: [exchange('OLD EXCHANGE')] },
          { a: 'HQ', b: 'WELL', name: 'Well stair', delay: 1, chain: [] },
          { a: 'WELL', b: 'ARMOURY', name: 'Cistern', delay: 1.5, chain: [cavein('FLOODED CISTERN', 3)] },
          { a: 'ARMOURY', b: 'FIELD', name: 'Armoury stair', delay: 1, chain: [] },
          { a: 'GATE', b: 'COURT', name: 'Gate yard', delay: 0.5, chain: [smudge('BURNING STABLES')] },
          { a: 'BASTION', b: 'CHAPEL', name: 'Rampart stair', delay: 0.5, chain: [smudge('FALLING MASONRY')] },
          { a: 'COURT', b: 'WELL', name: 'Pump yard', delay: 1, chain: [] },
          { a: 'CHAPEL', b: 'ARMOURY', name: 'Vestry', delay: 0.5, chain: [garble('SNIPER')] },
        ],
      },
      enc: T7, dec: [...R3, 'BETWEEN', 'STRIP', 'REPAIR', 'IF_VALID'], arq: false, target: 1, budget: 2, delayBudget: 2.5,
      par: { overhead: 2, blocks: 3 }, repair: ['SCATTER', 'BURST'], metric: 'hamming',
      briefing:
        "We are inside the walls. The last of the garrison holds the keep, and our assault companies are closing on it through a maze of courtyards, ramparts and cellars. The order to go in must reach them all at once, and there is no answering it: radio silence until the keep falls.\n\nThe enemy built two telephone exchanges into the Citadel, one in the gatehouse and an old one down in the chapel crypt. Both are ours now, both still in circuit, and both write every message out back to front. Smoke, rain and dust smudge what passes the courtyards, marksmen and snipers cover the open ground, the garrison shouts across the cloister, and the cistern under the armoury is flooded.\n\nOrders are 3 digits. Command's limits: at most 2 extra digits per order, every order through within 2½ hours.",
      hints: [
        'Plot a few quick routes and run a test. What does the codebook make of a transmission that arrives back to front? Then count the exchanges on your route.',
        'The codebook only knows transmissions the way HQ sends them, so after one exchange REPAIR finds nothing, and votes over three copies blow the budget. But back to front, written back to front again, is the right way round. Go through BOTH exchanges, and in between take the cheapest damage: the garrison shouts letters, which STRIP OUT removes, and two smudges cost two seal digits.',
        'Route: The breach → Gate passage → Gatehouse → Gate yard → Parade ground → Cloister → Chapel → Crypt passage → The keep (2 h). Strip: ■ ▲ ● then a SEAL, modulus 11, with rows 1,1,1,1,1 / 1,2,3,4,5 (the POWERS stamp, 2 rows). Field work: STRIP OUT {A,B,C,D,E,F} → REPAIR SCATTER up to 0.',
      ],
      debrief: {
        title: 'Two Wrongs Make a Right',
        text: "Some transformations undo themselves: do them twice and nothing has happened at all. You turned the enemy's habit against itself by sending the order through both exchanges. Engineers lean on this constantly. A computer swaps a number's bytes into network order and the receiver swaps them back, and a signal inverted by one line driver is inverted again by the next. Gilbert Vernam's teleprinter cipher of 1917 adds the same key tape twice, once to scramble and once to unscramble. The Citadel has fallen, and the road to the enemy's high command lies open.",
      },
      solution: {
        enc: `■ ▲ ● ${POW(2, 5)}`, dec: [STRIP_LETTERS, REPAIR(0)], asm: '',
        route: ['HQ', 'GATE', 'COURT', 'CHAPEL', 'FIELD'],
      },
      anti: [
        // the right road: one row short, the shouting left in, reading as if reversed
        { enc: `■ ▲ ● ${POW(1, 4)}`, dec: [STRIP_LETTERS, REPAIR(0)], asm: '', route: ['HQ', 'GATE', 'COURT', 'CHAPEL', 'FIELD'] },
        { enc: `■ ▲ ● ${POW(2, 5)}`, dec: [REPAIR(0)], asm: '', route: ['HQ', 'GATE', 'COURT', 'CHAPEL', 'FIELD'] },
        { enc: `■ ▲ ● ${POW(2, 5)}`, dec: [STRIP_LETTERS, REPAIR(0)], asm: '■=#3 ●=#1', route: ['HQ', 'GATE', 'COURT', 'CHAPEL', 'FIELD'] },
        // the sally port: one exchange; the seal read back to front works only while no seal digit is X
        { enc: `■ ▲ ● ${POW(2, 5)}`, dec: [STRIP_LETTERS, REPAIR(0)], asm: '', route: ['HQ', 'COURT', 'CHAPEL', 'FIELD'] },
        { enc: `■ ▲ ● ${POW(2, 5)}`, dec: [STRIP_LETTERS, REPAIR(0)], asm: '■=#5 ▲=#4 ●=#3', route: ['HQ', 'COURT', 'CHAPEL', 'FIELD'] },
        { enc: '■ ▲ ● H10:1,1,1,1', dec: [STRIP_LETTERS, REPAIR(0)], asm: '■=#4 ▲=#3 ●=#2', route: ['HQ', 'COURT', 'CHAPEL', 'FIELD'] },
        // the ramparts: one exchange, votes read back to front. (Both exchanges by the rampart stair also work: two smudges.)
        { enc: '3x( ■ ▲ ● )', dec: [], asm: '■=V9,6,3 ▲=V8,5,2 ●=V7,4,1', route: ['HQ', 'GATE', 'BASTION', 'FIELD'] },
        { enc: `■ ▲ ● ${POW(4, 7)}`, dec: [REPAIR(1)], asm: '', route: ['HQ', 'GATE', 'BASTION', 'CHAPEL', 'FIELD'] },
      ],
    }),
  ];

  for (const lv of NEW) {
    if (LEVELS.some((l) => l.id === lv.id)) continue;
    lv.repair = lv.repair || ['SCATTER'];
    lv.metric = lv.metric || 'hamming';
    LEVELS.push(lv);
  }
})();
