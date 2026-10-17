/* Chain of Command — additional campaign levels (levels-early-pass). Pushed into CoC.data.LEVELS; placed by theater-data.js.
 *
 *   X0  MUDDLE'S CROSSING  tier 1 — the first hidden line: read a relay's habit from intercepts.
 *   R0  RADIO RIDGE        tier 1 — the first routing: pick the stretches your three copies can survive.
 *   P1  THE MOUNTAIN PASS  tier 3 — a hidden line that strikes in bursts: interleaved parity + SAY AGAIN.
 *   P2  THE MOUNTAIN PASS  tier 3 — roads that do different damage: route × interleaved code × repair mode.
 * (6-1, the pass's middle mission, lives in levels.js.)
 */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});

  const B = '01';
  const ORD = ['NSEW', '1234', 'ABCD'];
  const B8 = [B, B, B, B, B, B, B, B];

  // Strip tools and readers, as in levels.js (cumulative unlocks).
  const T1 = [];
  const T2 = ['REPEAT'];
  const T3 = [...T2, 'NOT', 'PARITY'];
  const R2 = ['VOTE'];
  const R3 = ['VOTE', 'READ_NOT'];

  const net = function () {
    return this.network.links.flatMap((l) => l.chain);
  };

  // The 6-1 code: two Hamming codes (odd lamps, even lamps) with their seals laid alternately.
  const WOVEN = '■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(■●✚) P(▲◆⬢) P(■★✚) P(▲⬟⬢) P(●★✚) P(◆⬟⬢)';
  // One plain Hamming code over all eight lamps (fixes one flip anywhere, nothing more).
  const HAMMING8 = '■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(■▲◆★✚) P(■●◆⬟✚) P(▲●◆⬢) P(★⬟✚⬢)';

  const LEVELS = [
    // ================================================================ MUDDLE'S CROSSING — the first unknown line
    {
      id: 'X0', sector: 0, name: 'THE FAR BANK',
      format: ORD,
      chain: [
        { kind: 'reverse', p: 1 },
        { kind: 'add', p: 0.5, set: 'XYZ' },
      ],
      hiddenLine: true, samples: 5, sampleSeed: 20, probe: ['N3A', 'E1C', 'NSEW', 'W4B', 'S2D'],
      enc: T1, dec: ['STRIP', 'IF_IN', 'IF_SAME', 'SWAP'], arq: false, target: 1, budget: 0, par: { overhead: 0, blocks: 1 },
      briefing:
        "Beyond the crossing our wire runs into country nobody has walked. We do not know who mans it — only that orders come out the far end wrong.\n\nA linesman copied five of our messages as they went in and as they came out. Orders are a heading, a company and an objective, like N3A. Not one extra symbol is authorised. Study the log, work out what the line does every time, and undo it in the field.",
      hints: [
        'Line up each pair and compare them symbol by symbol. Some changes happen to every message; some only to a few.',
        'Every message comes out back to front — look at NSEW. Some also pick up a stray X, Y or Z, which is never part of an order.',
        'Field work: STRIP OUT {X,Y,Z}. Then read ■ from #3 and ● from #1 in the assembly row (or send the strip as ● ▲ ■ and it arrives the right way round).',
      ],
      debrief: {
        title: 'Reading the Channel',
        text: 'You never saw the relays; you worked out their habits from what went in and what came out. Engineers call this channel identification, and it starts the same way: send something you know, see what arrives. Telephone engineers sent test tones down new lines, and modems still open every call with a training sequence. Once a habit is known, undoing it can cost nothing at all.',
      },
      solution: { enc: '■ ▲ ●', dec: [['STRIP', { set: 'XYZ' }]], asm: '■=#3 ●=#1' },
      anti: [
        { enc: '■ ▲ ●', dec: [['STRIP', { set: 'XYZ' }]], asm: '' },
        { enc: '■ ▲ ●', dec: [], asm: '■=#3 ●=#1' },
        { enc: '■ ▲ ●', dec: [['STRIP', { set: 'XYZ' }], ['IF_IN', { pos: 1, set: '1234' }, [['SWAP', { a: 1, b: 2 }]], []]], asm: '' },
      ],
    },

    // ================================================================ RADIO RIDGE — the first choice of route
    {
      id: 'R0', sector: 1, name: 'THE RIDGE ROADS',
      format: ORD,
      network: {
        nodes: [
          { id: 'HQ', label: 'HQ', x: 3, y: 50 },
          { id: 'MAST', label: 'Radio mast', x: 30, y: 8 },
          { id: 'SADDLE', label: 'The saddle', x: 66, y: 8 },
          { id: 'VILLAGE', label: 'Village', x: 30, y: 92 },
          { id: 'CHAPEL', label: 'Chapel', x: 66, y: 92 },
          { id: 'FIELD', label: 'Front', x: 97, y: 50 },
        ],
        links: [
          { a: 'HQ', b: 'MAST', name: 'Ridge road', delay: 1, chain: [{ kind: 'garble', p: 0.9, name: 'HILLTOP STATIC' }] },
          { a: 'MAST', b: 'SADDLE', name: 'Ridge road', delay: 0.5, chain: [] },
          { a: 'SADDLE', b: 'FIELD', name: 'Ridge road', delay: 1, chain: [{ kind: 'garble', p: 0.9, name: 'ENEMY JAMMER' }] },
          { a: 'HQ', b: 'VILLAGE', name: 'Valley road', delay: 1.5, chain: [] },
          { a: 'VILLAGE', b: 'CHAPEL', name: 'Valley road', delay: 1.5, chain: [] },
          { a: 'CHAPEL', b: 'FIELD', name: 'Valley road', delay: 1.5, chain: [] },
          { a: 'MAST', b: 'VILLAGE', name: 'Goat track', delay: 0.5, chain: [{ kind: 'swap', p: 0.7 }] },
          { a: 'SADDLE', b: 'CHAPEL', name: 'Goat track', delay: 0.5, chain: [] },
        ],
      },
      get chain() {
        return net.call(this);
      },
      enc: T2, dec: [...R2], arq: false, target: 1, budget: 6, delayBudget: 3.5, par: { overhead: 6, blocks: 3 },
      briefing:
        "Two roads cross the ridge to the front. The ridge road is quick, but static sits on the hilltop and an enemy jammer on the far slope. The valley road is clean — and slow. Goat tracks join the two, and Cpl. Muddle has strung his wire along one of them.\n\nYou may mix the roads: start at HQ and click one stretch at a time until you reach the front. Command allows 6 extra symbols per order and wants every order through within 3½ hours.",
      hints: [
        'Neither road works alone: the ridge road garbles an order twice, the valley road takes 4½ hours. Count what each stretch can do to one order.',
        'Three copies and a vote survive ONE garbled symbol — not two, and not a garble plus Muddle’s swap, which damages two copies at once. Find a route of 3½ hours where only one relay can touch the order.',
        'HQ → Radio mast → the saddle → goat track → Chapel → Front (3½ h). Strip: REPEAT ×3 around ■ ▲ ●. Votes over #1,4,7 / #2,5,8 / #3,6,9.',
      ],
      debrief: {
        title: 'Paths and Hops',
        text: 'A message crosses a network hop by hop, and every hop adds its own damage. Your code can absorb a fixed amount, so the route has to stay inside it — and inside the time allowed. Telephone exchanges and radio relay chains were planned this way from the 1940s: count the hops, add up the noise, and keep it below what the equipment at the ends can repair.',
      },
      solution: {
        enc: '3x( ■ ▲ ● )', dec: [], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9',
        route: ['HQ', 'MAST', 'SADDLE', 'CHAPEL', 'FIELD'],
      },
      anti: [
        // the obvious single roads
        { enc: '3x( ■ ▲ ● )', dec: [], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9', route: ['HQ', 'MAST', 'SADDLE', 'FIELD'] },
        { enc: '5x( ■ ▲ ● )', dec: [], asm: '■=V1,4,7,10,13 ▲=V2,5,8,11,14 ●=V3,6,9,12,15', route: ['HQ', 'MAST', 'SADDLE', 'FIELD'] },
        { enc: '■ ▲ ●', dec: [], asm: '', route: ['HQ', 'VILLAGE', 'CHAPEL', 'FIELD'] },
        // the mix through Muddle's goat track, and the right route without votes
        { enc: '3x( ■ ▲ ● )', dec: [], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9', route: ['HQ', 'VILLAGE', 'MAST', 'SADDLE', 'FIELD'] },
        { enc: '■ ■ ■ ▲ ▲ ▲ ● ● ●', dec: [], asm: '■=V1,2,3 ▲=V4,5,6 ●=V7,8,9', route: ['HQ', 'VILLAGE', 'MAST', 'SADDLE', 'FIELD'] },
        { enc: '3x( ■ ▲ ● )', dec: [], asm: '', route: ['HQ', 'MAST', 'SADDLE', 'CHAPEL', 'FIELD'] },
        { enc: '■ ▲ ●', dec: [], asm: '', route: ['HQ', 'MAST', 'SADDLE', 'CHAPEL', 'FIELD'] },
      ],
    },

    // ================================================================ THE MOUNTAIN PASS
    {
      id: 'P1', sector: 2, name: 'THE HIGH WIRE',
      format: B8,
      chain: [{ kind: 'burst', p: 0.2, len: 2, to: B }],
      hiddenLine: true,
      // An authored log (a bad afternoon): three test signals got through untouched; each of the others
      // lost exactly two NEIGHBOURING lamps, at the start, middle and end, and inside an alternating pattern.
      intercepts: [
        { sent: '0000000000', recv: '0000000000' },
        { sent: '0000000000', recv: '0001100000' },
        { sent: '1111111111', recv: '1111111111' },
        { sent: '1111111111', recv: '1001111111' },
        { sent: '0000000000', recv: '0000000011' },
        { sent: '0101010101', recv: '0101001101' },
        { sent: '1111111111', recv: '1111111111' },
        { sent: '0000000000', recv: '0000001100' },
      ],
      enc: T3, dec: [...R3, 'REPAIR', 'IF_VALID', 'IF_PARITY', 'SAY_AGAIN'], arq: true, target: 1, budget: 5,
      par: { overhead: 4.5, blocks: 4 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "The field wire over the pass was strung in a hurry, high on frozen poles. Nobody has climbed up to see what goes wrong on it. The linesmen at the top reckon about one message in five comes through damaged. On a bad afternoon they logged eight test signals of ten lamps each — what went up the wire, and what came down.\n\nOrders are 8 lamps. The wire works both ways, so the field can call SAY AGAIN — but airtime is short: 5 extra lamps per order on average, re-sends included. Read the log before you trust your old seals.",
      hints: [
        'Compare each received row with what was sent, lamp by lamp. How many lamps change in a damaged message, and are they ever far apart?',
        'The wire scrambles two NEIGHBOURING lamps at once, and both can flip. A single parity lamp misses a double flip. Two parity lamps, each watching every other lamp, never both miss: neighbours always fall under different ones. Mind where the parity lamps themselves sit.',
        'Strip: ■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(■●★✚) P(▲◆⬟⬢) — the odd seal lands on an odd place, the even seal on an even one. Field work: IF SIGNAL IS IN CODEBOOK → (nothing); NO → SAY AGAIN!',
      ],
      debrief: {
        title: 'Burst Detection',
        text: 'Damage in real lines comes in bursts — a lightning strike, a scratch, a fade — and a burst flips neighbours together, which is exactly what fools a single parity bit. Interleave the checks so that neighbours fall under different ones, and any burst up to their number is caught. This is the idea behind the longitudinal checks on magnetic tape and, in polished form, the cyclic redundancy check (CRC, W. Wesley Peterson, 1961): a CRC with r check bits catches every burst of length r or less. Every Ethernet frame still carries one.',
      },
      solution: {
        enc: '■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(■●★✚) P(▲◆⬟⬢)',
        dec: [['IF_VALID', {}, [], [['SAY_AGAIN', {}]]]],
        asm: '',
      },
      anti: [
        // the old habit: one parity lamp over everything
        { enc: '■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(■▲●◆★⬟✚⬢)', dec: [['IF_VALID', {}, [], [['SAY_AGAIN', {}]]]], asm: '' },
        // a parity lamp per half: a burst inside one half flips two of its lamps
        { enc: '■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(■▲●◆) P(★⬟✚⬢)', dec: [['IF_VALID', {}, [], [['SAY_AGAIN', {}]]]], asm: '' },
        // a full Hamming code catches every burst, but costs too much airtime
        { enc: HAMMING8, dec: [['IF_VALID', {}, [], [['SAY_AGAIN', {}]]]], asm: '' },
        // and repairing instead of asking again
        { enc: HAMMING8, dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
      ],
    },
    {
      id: 'P2', sector: 2, name: 'AVALANCHE COUNTRY',
      format: B8,
      network: {
        nodes: [
          { id: 'HQ', label: 'HQ', x: 3, y: 50 },
          { id: 'COL', label: 'High col', x: 40, y: 8 },
          { id: 'HUT', label: 'Mule station', x: 50, y: 50 },
          { id: 'GORGE', label: 'Gorge bridge', x: 40, y: 92, kind: 'bridge' },
          { id: 'FIELD', label: 'Front', x: 97, y: 50 },
        ],
        links: [
          { a: 'HQ', b: 'COL', name: 'High road', delay: 0.5, chain: [{ kind: 'burst', p: 0.9, len: 2, to: B, name: 'LIGHTNING' }] },
          { a: 'COL', b: 'FIELD', name: 'High road', delay: 1, chain: [{ kind: 'flip', p: 0.9, name: 'ICE ON THE WIRE' }] },
          { a: 'HQ', b: 'GORGE', name: 'Gorge road', delay: 1, chain: [{ kind: 'flip', p: 0.9, name: 'FROZEN SPLICE' }] },
          { a: 'GORGE', b: 'FIELD', name: 'Gorge road', delay: 1, chain: [{ kind: 'flip', p: 0.9, name: 'ICE ON THE WIRE' }] },
          { a: 'HQ', b: 'HUT', name: 'Mule track', delay: 2, chain: [] },
          { a: 'HUT', b: 'FIELD', name: 'Mule track', delay: 2, chain: [] },
          { a: 'COL', b: 'HUT', name: 'Scree path', delay: 0.5, chain: [] },
          { a: 'GORGE', b: 'HUT', name: 'Goat path', delay: 0.5, chain: [] },
        ],
      },
      get chain() {
        return net.call(this);
      },
      enc: T3, dec: [...R3, 'REPAIR', 'IF_VALID', 'IF_PARITY'], arq: false, target: 1, budget: 6, delayBudget: 3,
      par: { overhead: 6, blocks: 7 }, repair: ['SCATTER', 'BURST'], metric: 'burst',
      briefing:
        "The storm has cut the return wire: whatever you send over the pass must arrive right the first time. Three ways run to the front. The high road is quick, but lightning strikes the col and ice weighs on the wire beyond it. The gorge road is iced on both stretches. The mule track is clean, and takes four hours. Paths cut between them.\n\nOrders are 8 lamps. Budget: 6 extra lamps. Every order must be through within 3 hours.",
      hints: [
        'Each code you own survives ONE kind of hit per order. Count, stretch by stretch, what each route does to an order — and find the quick one that does only one thing to it.',
        'Up the high road to the col, then down the scree path to the mule station and along the mule track: lightning only. Lightning scrambles two neighbours, so you need the woven code from the storm, repaired as a burst.',
        'Route: HQ → High col → Mule station → Front (3 h). Strip: ■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(■●✚) P(▲◆⬢) P(■★✚) P(▲⬟⬢) P(●★✚) P(◆⬟⬢). Field work: REPAIR BURST up to 2.',
      ],
      debrief: {
        title: 'Matching Code to Channel',
        text: 'A burst code is no good against scattered flips, and a Hamming code is no good against bursts. The road decides which damage you face, and the code has to fit it. Engineers still pair the two: mobile networks pick their coding scheme for the conditions on each link, and the old trunk lines were tested for burst noise before anyone chose their error control.',
      },
      solution: {
        enc: WOVEN, dec: [['REPAIR', { mode: 'BURST', radius: 2 }]], asm: '',
        route: ['HQ', 'COL', 'HUT', 'FIELD'],
      },
      anti: [
        // the obvious single roads
        { enc: WOVEN, dec: [['REPAIR', { mode: 'BURST', radius: 2 }]], asm: '', route: ['HQ', 'COL', 'FIELD'] },
        { enc: HAMMING8, dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '', route: ['HQ', 'GORGE', 'FIELD'] },
        { enc: WOVEN, dec: [['REPAIR', { mode: 'BURST', radius: 2 }]], asm: '', route: ['HQ', 'GORGE', 'FIELD'] },
        { enc: '■ ▲ ● ◆ ★ ⬟ ✚ ⬢', dec: [], asm: '', route: ['HQ', 'HUT', 'FIELD'] },
        // the tempting mix: lightning AND ice
        { enc: WOVEN, dec: [['REPAIR', { mode: 'BURST', radius: 2 }]], asm: '', route: ['HQ', 'COL', 'HUT', 'GORGE', 'FIELD'] },
        // the right route with the wrong repair mode, or the wrong code
        { enc: WOVEN, dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '', route: ['HQ', 'COL', 'HUT', 'FIELD'] },
        { enc: HAMMING8, dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '', route: ['HQ', 'COL', 'HUT', 'FIELD'] },
        { enc: HAMMING8, dec: [['REPAIR', { mode: 'BURST', radius: 2 }]], asm: '', route: ['HQ', 'COL', 'HUT', 'FIELD'] },
      ],
    },
  ];

  for (const lv of LEVELS) {
    lv.repair = lv.repair || ['SCATTER'];
    lv.metric = lv.metric || 'hamming';
  }
  const data = (CoC.data = CoC.data || {});
  (data.LEVELS = data.LEVELS || []).push(...LEVELS);
})();
