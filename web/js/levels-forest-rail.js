/* Chain of Command — additional campaign levels (levels-forest-rail). Pushed into CoC.data.LEVELS; placed by theater-data.js.
 *
 *   THE DARK FOREST (tier 2): unknown lines in the trees — read the habit, then lay out the copies to outvote it.
 *     F1  LISTENING PINES   hidden line: a tapped wire slips one of OUR symbols in. Grouped copies beat it
 *                           (interleaved ones fall out of step); pairs voted over a sliding window beat it at +3.
 *     F2  THE FOREST RIDES  routing: tapped wires and snipers (shifts) vs falling timber (bursts). Pick a route whose
 *                           trouble suits one layout; a single shift of one kind is beaten by two copies.
 *     F3  OWL LIGHT         hidden line: back to front + junk digits 5–9 + three-symbol bursts → strip, interleave.
 *   THE RAIL YARD (tier 2): freight in pieces — sequence numbers, retransmission and routes.
 *     RY1 SHUNTING          wagons of 3 in any order: number them, and fill the last wagon (fixed-size cells).
 *     RY2 SPARKS IN THE YARD wagons of 4 + a flipped lamp: numbers, a parity lamp in the spare seat, SAY AGAIN.
 *     RY3 THE HUMP          yard map: the slow lines make every re-send cost hours; go over the hump with numbers.
 *
 * Same schema as levels.js. Numbers are tuned so the reference earns all three medals on every verification seed
 * and every `anti` fails (tests/verify.js).
 */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});

  const B = '01';
  const L4 = 'ABCD';
  const ORD = ['NSEW', '1234', 'ABCD'];
  const ORD_ALPHA = 'NSEW1234ABCD';

  // Strip tools and readers, as in levels.js (cumulative unlocks).
  const T2 = ['REPEAT'];
  const T3 = [...T2, 'NOT', 'PARITY'];
  const R2 = ['VOTE'];
  const R3 = ['VOTE', 'READ_NOT'];

  // Routing levels list every relay on the map as their chain (for the field's symbol pickers).
  const net = function () {
    return this.network.links.flatMap((l) => l.chain);
  };

  // Forest relays.
  const tapped = () => ({ kind: 'add', p: 0.9, set: ORD_ALPHA, name: 'TAPPED WIRE' });
  const sniper = () => ({ kind: 'drop', p: 0.9, name: 'SNIPER' });
  const timber = () => ({ kind: 'burst', p: 0.9, len: 3, name: 'FALLING TIMBER' });
  const gnawed = () => ({ kind: 'garble', p: 0.9, name: 'GNAWED WIRE' });

  // Yard relays.
  const hump = (name = 'HUMP SHUNTER') => ({ kind: 'shuffle', p: 0.9, size: 4, name });
  const sparks = (name = 'SPARKING TELEGRAPH') => ({ kind: 'flip', p: 0.15, name });
  const welders = () => ({ kind: 'flip', p: 0.9, name: 'ARC WELDERS' });

  // Codes and field-work shorthands for solutions and anti-solutions.
  const GROUPED = { enc: '■ ■ ■ ▲ ▲ ▲ ● ● ●', dec: [], asm: '■=V1,2,3 ▲=V4,5,6 ●=V7,8,9' };
  const SPREAD = { enc: '3x( ■ ▲ ● )', dec: [], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9' };
  const PAIRS_SLIDE = { enc: '■ ■ ▲ ▲ ● ●', dec: [], asm: '■=V1,2,3 ▲=V3,4,5 ●=V5,6,7' };
  const PAIRS_FIRST = { enc: '■ ■ ▲ ▲ ● ●', dec: [], asm: '▲=#3 ●=#5' };
  const PLAIN = { enc: '■ ▲ ●', dec: [], asm: '' };
  const JUNK = ['STRIP', { set: '56789' }];
  const RA = (size) => ['REASSEMBLE', { size }];
  const ASK_IF_ODD = (n) => ['IF_PARITY', { pos: Array.from({ length: n }, (_, i) => i + 1) }, [], [['SAY_AGAIN', {}]]];
  const ASK_IF_DIFFER = ['IF_AGREE', { copies: 2 }, [], [['SAY_AGAIN', {}]]];

  // RY3: eight lamps and their parity lamp fill three wagons of four exactly.
  const RY3_CODE = '"A" ■ ▲ ● "B" ◆ ★ ⬟ "C" ✚ ⬢ P(■▲●◆★⬟✚⬢)';

  const LEVELS = [
    // ================================================================ THE DARK FOREST
    {
      id: 'F1', sector: 1, name: 'LISTENING PINES',
      format: ORD,
      chain: [tapped()],
      hiddenLine: true,
      // An authored log: one test message came through clean; every other one came out ONE symbol longer, the
      // extra symbol always one of our own (letter or digit), at the front, the middle or the end.
      intercepts: [
        { sent: 'N3A', recv: 'N3A' },
        { sent: 'E1C', recv: 'E1BC' },
        { sent: 'W4B', recv: 'SW4B' },
        { sent: 'S2D', recv: 'S2D3' },
        { sent: 'NSEW1234', recv: 'NSEW12A34' },
        { sent: 'E1C', recv: 'E11C' },
        { sent: 'N3AN3AN3A', recv: 'N3AN43AN3A' },
      ],
      enc: T2, dec: [...R2, 'STRIP', 'IF_IN', 'IF_SAME', 'SWAP'], arq: false, target: 1, budget: 6,
      par: { overhead: 3, blocks: 3 },
      briefing:
        "The wire to the forest outposts is strung from tree to tree through miles of pine. Two patrols went in to walk it and neither came back. Something in there is changing our orders, and nobody knows what.\n\nThe linesmen at the edge of the wood logged seven test messages, as they went in and as they came out. Orders are a heading, a company and an objective, like N3A. Command allows 6 extra symbols per order. Read the log before you lay out a single copy.",
      hints: [
        'Line up each pair and count the symbols. Is anything ever changed, or lost, or is something else going on?',
        'Every damaged message comes out one symbol LONGER: the wire is tapped, and the tap slips in one of our own letters or digits, anywhere. Everything after it moves one place right, so copies laid out N3AN3AN3A fall out of step (log #7). Keep each symbol’s copies side by side instead: then a copy can only ever move one place.',
        'Strip: ■ ■ ▲ ▲ ● ●. Each symbol is either where you put it or one place to the right, so vote over its pair and the place after: ■ = vote #1,2,3, ▲ = vote #3,4,5, ● = vote #5,6,7. Yes, #7: you send six symbols, but a tapped message arrives seven long, and the last ● is then sitting at #7. When nothing was slipped in, #7 is simply empty and the vote is between the two ●s. (Three side-by-side copies, ■■■▲▲▲●●● voted over #1–3, #4–6 and #7–9, also get through, at twice the cost.)',
      ],
      debrief: {
        title: 'Insertions',
        text: 'Most damage swaps one symbol for another. This line ADDED one, and that is worse: it moves everything after it, so copies spread through the message fall out of step. Copies kept side by side survive it, because a shift can only nudge each one a single place. Vladimir Levenshtein studied exactly these errors in 1965, and the edit distance that counts inserted and deleted symbols still carries his name. They turn up wherever timing slips: in magnetic tape and disk drives, in DNA sequencing, and in DNA data storage today.',
      },
      solution: PAIRS_SLIDE,
      anti: [
        // the habit from the ridge: copies spread out; plain orders; pairs read from fixed places
        SPREAD,
        PLAIN,
        PAIRS_FIRST,
        { enc: '■ ■ ▲ ▲ ● ●', dec: [], asm: '■=#2 ▲=#4 ●=#6' },
        // side by side, but voted over the wrong windows
        { enc: '■ ■ ▲ ▲ ● ●', dec: [], asm: '■=V1,2 ▲=V3,4 ●=V5,6' },
      ],
    },
    {
      id: 'F2', sector: 1, name: 'THE FOREST RIDES',
      format: ORD,
      network: {
        nodes: [
          { id: 'HQ', label: 'HQ', x: 3, y: 50 },
          { id: 'LODGE', label: 'Hunting lodge', x: 27, y: 8 },
          { id: 'GLADE', label: 'Glade', x: 38, y: 50 },
          { id: 'MILL', label: 'Sawmill', x: 24, y: 92, kind: 'mill' },
          { id: 'TOWER', label: 'Fire tower', x: 71, y: 8 },
          { id: 'KILNS', label: 'Charcoal kilns', x: 61, y: 50 },
          { id: 'BRIDGE', label: 'Footbridge', x: 68, y: 92, kind: 'bridge' },
          { id: 'FIELD', label: 'Front', x: 97, y: 50 },
        ],
        links: [
          { a: 'HQ', b: 'LODGE', name: 'Forest ride', delay: 0.5, chain: [tapped()] },
          { a: 'LODGE', b: 'TOWER', name: 'Forest ride', delay: 1, chain: [] },
          { a: 'TOWER', b: 'FIELD', name: 'Forest ride', delay: 0.5, chain: [timber()] },
          { a: 'HQ', b: 'GLADE', name: 'Woodcutters’ track', delay: 1, chain: [sniper()] },
          { a: 'GLADE', b: 'KILNS', name: 'Woodcutters’ track', delay: 1, chain: [] },
          { a: 'KILNS', b: 'FIELD', name: 'Woodcutters’ track', delay: 1, chain: [tapped()] },
          { a: 'HQ', b: 'MILL', name: 'Mill road', delay: 1.5, chain: [] },
          { a: 'MILL', b: 'BRIDGE', name: 'Mill road', delay: 1.5, chain: [timber()] },
          { a: 'BRIDGE', b: 'FIELD', name: 'Mill road', delay: 1, chain: [] },
          { a: 'LODGE', b: 'GLADE', name: 'Deer path', delay: 0.5, chain: [] },
          { a: 'TOWER', b: 'KILNS', name: 'Firebreak', delay: 0.5, chain: [sniper()] },
          { a: 'GLADE', b: 'MILL', name: 'Stream path', delay: 0.5, chain: [gnawed()] },
          { a: 'KILNS', b: 'BRIDGE', name: 'Charcoal lane', delay: 0.5, chain: [] },
        ],
      },
      get chain() {
        return net.call(this);
      },
      enc: T2, dec: [...R2, 'STRIP'], arq: false, target: 1, budget: 6, delayBudget: 3.5,
      par: { overhead: 3, blocks: 3 },
      briefing:
        "Deeper in, the forest is a maze of rides, woodcutters’ tracks and firebreaks, and our wire runs along all of them. The linesmen have walked it now, and every stretch has its trouble: the tapped wire from the pines, snipers who shoot a symbol clean out of the line, timber that crashes down across three symbols at once, and a stretch where something has gnawed the wire.\n\nPlot the route yourself: start at HQ and click one stretch at a time until you reach the front. Command allows 6 extra symbols per order, and every order must be through within 3½ hours.",
      hints: [
        'Three copies survive one kind of trouble, if they are laid out to match it: side by side against symbols slipped in or shot out, spread out against falling timber. Look for a route of 3½ hours or less where the trouble suits ONE layout.',
        'A sniper’s shot removes a symbol, and everything after it moves one place LEFT: the mirror of the tapped wire. Side-by-side copies survive a shot, a tap, or even one of each. For the efficiency medal, find a route that meets only a single sniper or only a single tapped wire; then two copies of each symbol are enough.',
        'Route: HQ → Glade → Charcoal kilns → Charcoal lane → Footbridge → Front (3½ h): one sniper and nothing else. Strip: ■ ■ ▲ ▲ ● ●. After a shot, the symbol at #1, #3 and #5 is still a copy of ■, ▲ and ●: read them from there. (The route through the Hunting lodge and the Deer path meets only a tapped wire; there, vote over #1,2,3 / #3,4,5 / #5,6,7 as in the pines.)',
      ],
      debrief: {
        title: 'Routing Around Damage',
        text: 'Slipped-in and shot-out symbols throw everything after them out of step; bursts and garbles do not. No single layout of copies beats both, so you picked the route to suit the layout. In 1964 Paul Baran of the RAND Corporation proposed a communications network that could survive attacks on its lines: a mesh of many cheap links, with each message finding its own way around the damage. His study fed into the ARPANET. Your cheap code and your choice of route were the same bargain in miniature.',
      },
      solution: { ...PAIRS_FIRST, route: ['HQ', 'GLADE', 'KILNS', 'BRIDGE', 'FIELD'] },
      anti: [
        // the fast forest ride (a tap AND falling timber): no layout survives both
        { ...GROUPED, route: ['HQ', 'LODGE', 'TOWER', 'FIELD'] },
        { ...SPREAD, route: ['HQ', 'LODGE', 'TOWER', 'FIELD'] },
        // the mill road: spread copies beat the timber, but it is too slow
        { ...SPREAD, route: ['HQ', 'MILL', 'BRIDGE', 'FIELD'] },
        // the woodcutters' track (a shot and a tap): only three side-by-side copies, and two pairs do not do
        { ...PAIRS_FIRST, route: ['HQ', 'GLADE', 'KILNS', 'FIELD'] },
        { ...PAIRS_SLIDE, route: ['HQ', 'GLADE', 'KILNS', 'FIELD'] },
        // two taps in a row; and the right single-trouble routes with the wrong pairs reading
        { ...GROUPED, route: ['HQ', 'LODGE', 'GLADE', 'KILNS', 'FIELD'] },
        { ...PAIRS_SLIDE, route: ['HQ', 'GLADE', 'KILNS', 'BRIDGE', 'FIELD'] },
        { ...PAIRS_FIRST, route: ['HQ', 'LODGE', 'GLADE', 'KILNS', 'BRIDGE', 'FIELD'] },
        { ...SPREAD, route: ['HQ', 'GLADE', 'KILNS', 'BRIDGE', 'FIELD'] },
      ],
    },
    {
      id: 'F3', sector: 1, name: 'OWL LIGHT',
      format: ORD,
      chain: [
        { kind: 'reverse', p: 1 },
        { kind: 'burst', p: 0.8, len: 3 },
        { kind: 'add', p: 0.9, set: '56789' },
      ],
      hiddenLine: true,
      // An authored log: every message comes out back to front; most pick up one extra digit 5–9 (never ours);
      // some lose three neighbouring symbols to random letters and digits of our own alphabet.
      intercepts: [
        { sent: 'N3A', recv: 'A3N7' },
        { sent: 'NNNNSSSS', recv: 'SSSS9NNNN' },
        { sent: 'W4B', recv: 'B4W' },
        { sent: 'NSEW1234ABCD', recv: 'DCBAS1B1W8ESN' },
        { sent: 'E1C', recv: '6C1E' },
        { sent: 'N3AN3AN3A', recv: 'A3E2WN5A3N' },
        { sent: 'AAAAAAAAA', recv: '6AAAC1SAAA' },
      ],
      enc: T2, dec: [...R2, 'STRIP', 'IF_IN', 'IF_SAME', 'SWAP'], arq: false, target: 1, budget: 6,
      par: { overhead: 6, blocks: 4 },
      briefing:
        "Dusk in the deep wood. The last stretch of wire to the forward battalion runs past the old forestry telephone exchange and under the biggest trees in the forest, and no linesman has walked it since the light went. The return wire was cut at sundown: whatever you send must arrive right the first time.\n\nSignals pushed seven test messages through before dark and logged what came out. Orders are a heading, a company and an objective. Command allows 6 extra symbols per order. This line does more than one thing to a message; find every one of them.",
      hints: [
        'Line up each pair and look for three things: what comes out in the wrong order, what comes out extra, and what comes out damaged.',
        'Every message comes out back to front (look at #2). Most pick up one extra digit, always 5 to 9, never one of ours, so a STRIP plate takes it out for nothing. And now and then three symbols IN A ROW are shredded (look at #7): side-by-side copies die together under that, so spread them out.',
        'Strip: REPEAT ×3 around ● ▲ ■ (back to front, so it arrives the right way round). Field work: STRIP OUT {5,6,7,8,9}. Votes: ■ over #1,4,7, ▲ over #2,5,8, ● over #3,6,9.',
      ],
      debrief: {
        title: 'Channel Estimation',
        text: 'One careful look at the log split the line into three habits, and only one of them needed paying for. The reversal cost nothing to undo, the junk from outside your alphabet cost nothing to strip, and only the falling branches needed copies, spread out so one fall could take just one copy of each symbol. Receivers do this all the time: a mobile phone estimates the channel from known pilot symbols many times a second, and the code is chosen for what is left. Spreading copies against bursts is interleaving. GSM phones spread each slice of speech over eight radio bursts, so a single fade cannot wipe out a word.',
      },
      solution: { enc: '3x( ● ▲ ■ )', dec: [JUNK], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9' },
      anti: [
        // the pines' answer: side by side (the bursts eat whole groups)
        { enc: '■ ■ ■ ▲ ▲ ▲ ● ● ●', dec: [JUNK], asm: '■=V7,8,9 ▲=V4,5,6 ●=V1,2,3' },
        { enc: '■ ■ ▲ ▲ ● ●', dec: [JUNK], asm: '■=V5,6,7 ▲=V3,4,5 ●=V1,2,3' },
        // spread out, but the junk left in; or read the wrong way round
        { enc: '3x( ● ▲ ■ )', dec: [], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9' },
        { enc: '3x( ■ ▲ ● )', dec: [JUNK], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9' },
        { enc: '● ▲ ■', dec: [JUNK], asm: '' },
      ],
    },

    // ================================================================ THE RAIL YARD
    {
      id: 'RY1', sector: 4, name: 'SHUNTING',
      format: [L4, L4, L4, L4, L4],
      chain: [{ kind: 'shuffle', p: 0.9, size: 3, name: 'SHUNTING ENGINE' }],
      enc: T2, dec: [...R2, 'REASSEMBLE', 'STRIP'], arq: false, target: 1, budget: 4, par: { overhead: 4, blocks: 1 },
      briefing:
        "The rail yard behind the lines is a tangle of points and sidings, and the yard telegraph works like the freight. Every transmission is cut into wagons of 3 symbols, and the shunting engine couples the wagons up again in whatever order it likes. Orders are five letters, like ABDCA.\n\nYou may chalk a number on each wagon. The field’s REASSEMBLE plate cuts what arrives into wagons, sorts them by their first symbol and rubs those first symbols out. Budget: 4 extra symbols.",
      hints: [
        'Chalk a number at the front of every wagon: a literal digit, then two letters of the order.',
        'Five letters and three numbers make 8 symbols: two full wagons and a short one of 2. The yard cuts every 3 symbols, so when the short wagon is shunted into the middle, every wagon after it is cut in the wrong place. Fill the last wagon: any symbol will do.',
        'Strip: "1" ■ ▲ "2" ● ◆ "3" ★ ★. Field work: REASSEMBLE pieces of 3.',
      ],
      debrief: {
        title: 'Sequence Numbers and Fixed Cells',
        text: 'Numbers let the receiver put pieces back in order however they arrive, and TCP still numbers every byte it sends for exactly that reason. The short wagon taught the other half: a network that cuts traffic at fixed places needs every piece to be full. ATM, the telephone backbone of the 1990s, carried everything in cells of exactly 53 bytes and padded the last one, so its switches could handle every cell the same way in hardware.',
      },
      solution: { enc: '"1" ■ ▲ "2" ● ◆ "3" ★ ★', dec: [RA(3)], asm: '' },
      anti: [
        // the short last wagon; no numbers; pieces of the wrong size
        { enc: '"1" ■ ▲ "2" ● ◆ "3" ★', dec: [RA(3)], asm: '' },
        { enc: '■ ▲ ● ◆ ★', dec: [], asm: '' },
        { enc: '"1" ■ ▲ ● "2" ◆ ★', dec: [RA(4)], asm: '' },
        { enc: '"1" ■ ▲ "2" ● ◆ "3" ★ ★', dec: [], asm: '' },
      ],
    },
    {
      id: 'RY2', sector: 4, name: 'SPARKS IN THE YARD',
      format: [B, B, B, B, B],
      chain: [
        { kind: 'shuffle', p: 0.9, size: 4, name: 'SHUNTING ENGINE' },
        { kind: 'flip', p: 0.2, name: 'SPARKING TELEGRAPH' },
      ],
      enc: T3, dec: [...R3, 'REASSEMBLE', 'IF_AGREE', 'IF_PARITY', 'SAY_AGAIN'], arq: true, target: 1, budget: 6.5,
      par: { overhead: 5.75, blocks: 4 },
      briefing:
        "The yard’s points are set by lamp signals: five lamps per order, lit (1) or dark (0). The telegraph now cuts transmissions into wagons of 4 and shunts them in any order, and its old wiring sparks: about one order in five arrives with a lamp flipped. A wrong lamp sends a train into the wrong siding.\n\nThe return line works, so the field can call SAY AGAIN, but every re-send is a whole new train. Budget: 6.5 extra lamps per order on average, re-sends included.",
      hints: [
        'Two problems, two tools you already own: numbers on the wagons, and a parity lamp to notice the flip. Ask again when the parity is wrong.',
        'Five lamps and two wagon numbers leave one seat empty in the second wagon of 4. Last time you filled the empty seat with a spare copy. Put the parity lamp there instead, and it costs nothing extra. Letters make good wagon numbers here: they are not lamps, so the sparks cannot touch them.',
        'Strip: "A" ■ ▲ ● "B" ◆ ★ P(■▲●◆★). Field work: REASSEMBLE pieces of 4 → IF PARITY of #1–6 IS EVEN → (nothing); NO → SAY AGAIN!',
      ],
      debrief: {
        title: 'Checksums and Retransmission',
        text: 'Number the pieces, check them, ask again for what fails: that is how TCP works, the transport protocol Vint Cerf and Bob Kahn described in 1974. Every TCP segment carries a sequence number and a checksum. Your one parity lamp guarded the whole consignment, so a single bad lamp cost a whole new train. Real networks go one step further with selective repeat: each piece has its own check, and only the damaged pieces are sent again.',
      },
      solution: { enc: '"A" ■ ▲ ● "B" ◆ ★ P(■▲●◆★)', dec: [RA(4), ASK_IF_ODD(6)], asm: '' },
      anti: [
        // numbers but no check; a check but no numbers; two copies (too many wagons); three copies and votes
        { enc: '"A" ■ ▲ ● "B" ◆ ★ ★', dec: [RA(4)], asm: '' },
        { enc: '■ ▲ ● ◆ ★ P(■▲●◆★)', dec: [ASK_IF_ODD(6)], asm: '' },
        { enc: '"A" ■ ▲ ● "B" ◆ ★ ★ "C" ■ ▲ ● "D" ◆ ★ ★', dec: [RA(4), ASK_IF_DIFFER], asm: '' },
        {
          enc: '"A" ■ ▲ ● "B" ◆ ★ ■ "C" ▲ ● ◆ "D" ★ ■ ▲ "E" ● ◆ ★',
          dec: [RA(4)],
          asm: '■=V1,6,11 ▲=V2,7,12 ●=V3,8,13 ◆=V4,9,14 ★=V5,10,15',
        },
      ],
    },
    {
      id: 'RY3', sector: 4, name: 'THE HUMP',
      format: [B, B, B, B, B, B, B, B],
      network: {
        nodes: [
          { id: 'HQ', label: 'HQ', x: 3, y: 50 },
          { id: 'SIGNAL', label: 'Signal box', x: 24, y: 8 },
          { id: 'HUMP', label: 'Hump yard', x: 34, y: 50 },
          { id: 'SIDINGS', label: 'Coal sidings', x: 27, y: 92 },
          { id: 'JUNC', label: 'Junction', x: 73, y: 8 },
          { id: 'SHED', label: 'Engine shed', x: 60, y: 50 },
          { id: 'TOWER', label: 'Water tower', x: 73, y: 92 },
          { id: 'FIELD', label: 'Railhead', x: 97, y: 50 },
        ],
        links: [
          { a: 'HQ', b: 'SIGNAL', name: 'Main line', delay: 1, chain: [] },
          { a: 'SIGNAL', b: 'JUNC', name: 'Main line', delay: 1, chain: [sparks()] },
          { a: 'JUNC', b: 'FIELD', name: 'Main line', delay: 1.5, chain: [] },
          { a: 'HQ', b: 'HUMP', name: 'Over the hump', delay: 0.5, chain: [hump()] },
          { a: 'HUMP', b: 'SHED', name: 'Yard lead', delay: 0.5, chain: [sparks()] },
          { a: 'SHED', b: 'FIELD', name: 'Fast line', delay: 1, chain: [] },
          { a: 'HQ', b: 'SIDINGS', name: 'Coal road', delay: 0.5, chain: [welders()] },
          { a: 'SIDINGS', b: 'TOWER', name: 'Coal road', delay: 1, chain: [] },
          { a: 'TOWER', b: 'FIELD', name: 'Coal road', delay: 0.5, chain: [] },
          { a: 'SIGNAL', b: 'HUMP', name: 'Shunting neck', delay: 0.5, chain: [] },
          { a: 'JUNC', b: 'SHED', name: 'Loop', delay: 0.5, chain: [hump('SHUNTING ENGINE')] },
          { a: 'SHED', b: 'TOWER', name: 'Shed road', delay: 0.5, chain: [sparks('LEAKY CABLE')] },
        ],
      },
      get chain() {
        return net.call(this);
      },
      enc: T3, dec: [...R3, 'REASSEMBLE', 'IF_AGREE', 'IF_PARITY', 'SAY_AGAIN'], arq: true, target: 1,
      budget: 8, delayBudget: 3, par: { overhead: 7.5, blocks: 4 },
      briefing:
        "A supply train must leave for the railhead, and its orders go ahead of it over the yard’s telegraph: eight lamps per order. The yard is a web of lines. The main line is long and its telegraph sparks now and then. The quickest way runs over the hump, where the shunters break every transmission into wagons of 4 and send them down in any order. The coal road is quick too, but arc welders are at work beside it.\n\nThe field can call SAY AGAIN, but a re-send runs the whole route again and costs its hours again. Command’s limits: at most 8 extra lamps per order and at most 3 hours per order on average, re-sends included.",
      hints: [
        'A re-send costs time as well as lamps. On a slow line, even a few re-sends break the 3-hour limit.',
        'The main line and the shunting neck stay clear of the hump, but they take 3 hours or more before a single re-send. The arc welders flip a lamp in nearly every order, so asking again there never ends. Go over the hump and number your wagons: eight lamps and a parity lamp fill three wagons of 4 exactly.',
        'Route: HQ → over the hump → Hump yard → yard lead → Engine shed → fast line → Railhead (2 h). Strip: "A" ■ ▲ ● "B" ◆ ★ ⬟ "C" ✚ ⬢ P(■▲●◆★⬟✚⬢). Field work: REASSEMBLE pieces of 4 → IF PARITY of #1–9 IS EVEN → (nothing); NO → SAY AGAIN!',
      ],
      debrief: {
        title: 'Packet Switching',
        text: 'Your orders crossed the yard as numbered pieces that could be shuffled on the way and put back together at the far end. That is packet switching: Donald Davies at the National Physical Laboratory named the packet in 1965, and the ARPANET carried its first packets in 1969. Retransmission is paid twice, in bandwidth and in time, and the time is a full trip over the route. That is why TCP measures the round-trip time of every connection, and why a link that takes long to cross, like a satellite hop, corrects its errors instead of asking again.',
      },
      solution: { enc: RY3_CODE, dec: [RA(4), ASK_IF_ODD(9)], asm: '', route: ['HQ', 'HUMP', 'SHED', 'FIELD'] },
      anti: [
        // around the hump with a parity lamp: cheap on lamps, but the re-sends run out the clock
        { enc: '■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(■▲●◆★⬟✚⬢)', dec: [ASK_IF_ODD(9)], asm: '', route: ['HQ', 'SIGNAL', 'HUMP', 'SHED', 'FIELD'] },
        { enc: '■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(■▲●◆★⬟✚⬢)', dec: [ASK_IF_ODD(9)], asm: '', route: ['HQ', 'SIGNAL', 'JUNC', 'FIELD'] },
        // …or three copies there, with no re-sends: too many lamps
        {
          enc: '3x( ■ ▲ ● ◆ ★ ⬟ ✚ ⬢ )', dec: [],
          asm: '■=V1,9,17 ▲=V2,10,18 ●=V3,11,19 ◆=V4,12,20 ★=V5,13,21 ⬟=V6,14,22 ✚=V7,15,23 ⬢=V8,16,24',
          route: ['HQ', 'SIGNAL', 'HUMP', 'SHED', 'FIELD'],
        },
        // the coal road: the welders flip nearly every order
        { enc: '■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(■▲●◆★⬟✚⬢)', dec: [ASK_IF_ODD(9)], asm: '', route: ['HQ', 'SIDINGS', 'TOWER', 'FIELD'] },
        // over the hump but past the leaky cable too (two flips cancel); and the right route without numbers
        { enc: RY3_CODE, dec: [RA(4), ASK_IF_ODD(9)], asm: '', route: ['HQ', 'HUMP', 'SHED', 'TOWER', 'FIELD'] },
        { enc: '■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(■▲●◆★⬟✚⬢)', dec: [ASK_IF_ODD(9)], asm: '', route: ['HQ', 'HUMP', 'SHED', 'FIELD'] },
        // the right route with numbers but no check
        { enc: '"A" ■ ▲ ● "B" ◆ ★ ⬟ "C" ✚ ⬢ ⬢', dec: [RA(4)], asm: '', route: ['HQ', 'HUMP', 'SHED', 'FIELD'] },
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
