/* Chain of Command — additional campaign levels (levels-marsh-capital). Pushed into CoC.data.LEVELS; placed by theater-data.js.
 *
 *   THE MARSHES (tier 3): smudges or garbles? Routes priced in erasures and errors.
 *     M1 THE CAUSEWAYS     routing: a smudge costs one seal digit, a garble two; the exchange rate picks the road.
 *     M2 THE DROWNED LINE  hidden line: a flood that wipes three symbols in a row (markers too) and letter junk.
 *     M3 FERRY CROSSING    routing + ARQ: fix the smudges in place, only notice the rare garble and ask again.
 *   ENEMY HIGH COMMAND (final tier): everything at once.
 *     K1 THE BURNING CITY  routing: junk, smudges, jammers, rare garbles and a clock; price every road.
 *     K2 THE ENEMY EXCHANGE hidden line: back to front, envelope included, junk from our own symbols, two hits on the digit.
 *   (6-2, the campaign finale, lives in levels.js.)
 *
 * Same schema as levels.js. Routing levels carry `network` (+ `delayBudget`, `solution.route`); hidden lines carry
 * `hiddenLine`, `probe`, `samples`, `sampleSeed`. Numbers are tuned so the reference earns all three medals on every
 * verification seed and every `anti` fails (tests/verify.js).
 */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});
  const LEVELS = CoC.data.LEVELS;

  const D = '0123456789';
  const DX = '0123456789X';
  const ORD = ['NSEW', '1234', 'ABCD'];

  // The full kit by now (mirrors T6 / R3 in levels.js).
  const T6 = ['REPEAT', 'NOT', 'PARITY', 'CHECK', 'IF', 'SEAL'];
  // …plus the weight stamps the depot issues after its hand-built seal (FILL_POW writes every seal row as powers).
  const T7 = [...T6, 'FILL_ONES', 'FILL_POS', 'FILL_SQ', 'FILL_POW'];
  const R3 = ['VOTE', 'READ_NOT'];

  // Relays used on these maps.
  const smudge = (name, p = 0.9) => ({ kind: 'smudge', p, set: DX, name });
  const garble = (name, p = 0.9) => ({ kind: 'garble', p, set: DX, to: DX, name });
  const junk = (name) => ({ kind: 'pad', p: 1, set: D, max: 2, name });

  // Field-work shorthands for solutions.
  const REPAIR = (radius) => ['REPAIR', { mode: 'SCATTER', radius }];
  const ASK_IF_INVALID = ['IF_VALID', {}, [], [['SAY_AGAIN', {}]]];
  const OPEN = ['BETWEEN', { open: '[', close: ']' }];

  // Routing levels list every relay on the map as their chain (for the field's symbol pickers).
  const networkChain = {
    get chain() {
      return this.network.links.flatMap((l) => l.chain);
    },
  };
  const withNetworkChain = (lv) => Object.defineProperties(lv, Object.getOwnPropertyDescriptors(networkChain));

  const NEW = [
    // ================================================================ THE MARSHES
    withNetworkChain({
      id: 'M1', sector: 4, name: 'THE CAUSEWAYS',
      format: [D, D, D],
      network: {
        nodes: [
          { id: 'HQ', label: 'HQ', x: 3, y: 50 },
          { id: 'DYKE', label: 'Sea dyke', x: 26, y: 6 },
          { id: 'LOCK', label: 'Sluice gate', x: 67, y: 6, kind: 'bridge' },
          { id: 'REEDS', label: 'Reed beds', x: 30, y: 50, kind: 'ford' },
          { id: 'HIDE', label: 'Duck hide', x: 69, y: 50 },
          { id: 'BOAT', label: 'Boathouse', x: 26, y: 94 },
          { id: 'PUMP', label: 'Pump house', x: 67, y: 94, kind: 'mill' },
          { id: 'FIELD', label: 'Front', x: 97, y: 50 },
        ],
        river: [[48, -12], [45, 22], [51, 50], [46, 78], [50, 112]],
        links: [
          { a: 'HQ', b: 'DYKE', name: 'Dyke road', delay: 0.5, chain: [] },
          { a: 'DYKE', b: 'LOCK', name: 'Dyke top', delay: 1, chain: [smudge('WATERLOGGED WIRE')] },
          { a: 'LOCK', b: 'FIELD', name: 'Sluice road', delay: 1, chain: [garble('DEAF LOCK-KEEPER')] },
          { a: 'HQ', b: 'REEDS', name: 'Reed track', delay: 0.5, chain: [garble('BOG STATIC')] },
          { a: 'REEDS', b: 'HIDE', name: 'Punt channel', delay: 1, chain: [garble('DROWNED RELAY')] },
          { a: 'HIDE', b: 'FIELD', name: 'Duckboards', delay: 0.5, chain: [] },
          { a: 'HQ', b: 'BOAT', name: 'Polder road', delay: 1.5, chain: [] },
          { a: 'BOAT', b: 'PUMP', name: 'Polder road', delay: 2, chain: [] },
          { a: 'PUMP', b: 'FIELD', name: 'Polder road', delay: 1.5, chain: [] },
          { a: 'DYKE', b: 'REEDS', name: 'Reed cut', delay: 0.5, chain: [smudge('LEAKY PUNT')] },
          { a: 'LOCK', b: 'HIDE', name: 'Overflow channel', delay: 1.5, chain: [smudge('MARSH MIST')] },
          { a: 'REEDS', b: 'BOAT', name: 'Bog path', delay: 1.5, chain: [] },
          { a: 'HIDE', b: 'PUMP', name: 'Ditch', delay: 1, chain: [smudge('SEEPING CABLE')] },
        ],
      },
      enc: T7, dec: [...R3, 'REPAIR', 'IF_VALID'], arq: false, target: 1, budget: 2, delayBudget: 4,
      par: { overhead: 2, blocks: 2 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "The marshes begin here: reed beds, flooded fields and causeways one man wide. Every road out here is wet, but not wet in the same way. On some stretches the ink runs and the field logs a digit as ?. On others a deaf lock-keeper or bog static turns a digit into a different digit, and nobody can tell which one.\n\nOrders are 3 digits and there is no return channel. Plot the route yourself: start at HQ and click a road leaving the place you have reached, until you reach the front. Command allows 2 extra digits per order and 4 hours.",
      hints: [
        'Count what each route does to an order, but do not count every hit the same. A smudge shows you where the damage is. A garble does not.',
        'The exchange rate from the depot: a smudge costs one seal digit, a garble costs two. The fast routes carry a garble and a smudge (three) or two garbles (four). Find a route of 4 hours or less that meets only smudges.',
        'HQ → Sea dyke → Dyke top → Sluice gate → Overflow channel → Duck hide → Duckboards → Front (3.5 h): two smudges and no garbles. Strip: ■ ▲ ● then a SEAL, modulus 11, with two rows over all five positions: 1,1,1,1,1 / 1,2,3,4,5 (the POWERS stamp, 2 rows). Field work: REPAIR SCATTER up to 1.',
      ],
      debrief: {
        title: 'Erasures Are Cheaper',
        text: 'Two smudges cost what one garble costs, and you chose your road by that price, not by counting hits. Engineers buy the same bargain on purpose. A receiver that is unsure of a symbol can flag it as unknown instead of guessing, which turns an error into an erasure, and a Reed–Solomon code repairs twice as many erasures as errors. CD players do exactly this: the first decoder marks the bytes it could not trust, and the second fills them in. Lost packets on the internet are erasures too, since you know which one is missing.',
      },
      solution: { enc: '■ ▲ ● RS2', dec: [REPAIR(1)], asm: '', route: ['HQ', 'DYKE', 'LOCK', 'HIDE', 'FIELD'] },
      anti: [
        // the fast roads with the seals that suit the right road
        { enc: '■ ▲ ● RS2', dec: [REPAIR(1)], asm: '', route: ['HQ', 'DYKE', 'LOCK', 'FIELD'] },
        { enc: '■ ▲ ● RS2', dec: [REPAIR(1)], asm: '', route: ['HQ', 'DYKE', 'REEDS', 'HIDE', 'FIELD'] },
        { enc: '■ ▲ ● RS2', dec: [REPAIR(1)], asm: '', route: ['HQ', 'REEDS', 'HIDE', 'FIELD'] },
        // the fast roads with enough seals: too expensive
        { enc: '■ ▲ ● RS3', dec: [REPAIR(1)], asm: '', route: ['HQ', 'DYKE', 'LOCK', 'FIELD'] },
        { enc: '■ ▲ ● RS4', dec: [REPAIR(2)], asm: '', route: ['HQ', 'REEDS', 'HIDE', 'FIELD'] },
        // the right road with too few seals; the dry polder road: too slow; one garble, but too slow
        { enc: '■ ▲ ● RS1', dec: [REPAIR(1)], asm: '', route: ['HQ', 'DYKE', 'LOCK', 'HIDE', 'FIELD'] },
        { enc: '■ ▲ ●', dec: [], asm: '', route: ['HQ', 'BOAT', 'PUMP', 'FIELD'] },
        { enc: '■ ▲ ● RS2', dec: [REPAIR(1)], asm: '', route: ['HQ', 'BOAT', 'REEDS', 'HIDE', 'FIELD'] },
      ],
    }),
    {
      id: 'M2', sector: 4, name: 'THE DROWNED LINE',
      format: [D, D, D],
      chain: [
        { kind: 'burst', p: 0.9, len: 3, to: '?', name: 'FLOODWATER' },
        { kind: 'pad', p: 1, set: 'ABCDEF', max: 2, name: "REED-CUTTERS' CHATTER" },
      ],
      hiddenLine: true, samples: 5, sampleSeed: 1, probe: ['[407]', '58213', '[999999]', '[0000]', '[613]'],
      enc: T7, dec: [...R3, 'BETWEEN', 'STRIP', 'REPAIR'], arq: false, target: 1, budget: 5,
      par: { overhead: 3, blocks: 3 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "The telegraph line across the deep marsh runs underwater for half its length. Nobody can wade out to see what happens to traffic on it, and there is no return channel. Signals sent five test messages down it and copied what came out at the far end.\n\nOrders are 3 digits. Command allows 5 extra symbols per order. Read the intercepts, work out what the line does, then give it what it needs, and nothing it does not.",
      hints: [
        'Compare what went in with what came out. What gets added, and what is it made of? What gets lost, and how much of it at once? Look closely at the messages that were sent in an envelope.',
        'The junk around each message is letters, and our orders never contain letters. The flood wipes out three symbols in a row whenever it strikes, and it does not care whether they are digits or envelope markers. An envelope with a washed-out marker cannot be opened.',
        'No envelope. Strip: ■ ▲ ● then a SEAL, modulus 11, with three rows over all six positions: 1s, the position, its square (the POWERS stamp, 3 rows). Field work: STRIP OUT {A,B,C,D,E,F}, then REPAIR SCATTER up to 1 (smudges are free).',
      ],
      debrief: {
        title: 'Burst Erasures',
        text: 'Floodwater does not pick symbols at random; it soaks a patch. Three seal digits restore any three missing digits, even side by side, because a Reed–Solomon code only cares how many are missing. Scratched CDs and DVDs work the same way: a scratch wipes a run of bytes, and the drive marks them as erasures for the Reed–Solomon decoder. The other lesson was about framing. A marker the channel can destroy is a weak point, because losing sync loses the whole message. When the junk can never be mistaken for an order, throwing it away is cheaper and safer than an envelope.',
      },
      solution: { enc: '■ ▲ ● RS3', dec: [['STRIP', { set: 'ABCDEF' }], REPAIR(1)], asm: '' },
      anti: [
        // the habit from the long wire: an envelope, which the flood can wash open
        { enc: '"[" ■ ▲ ● RS3 "]"', dec: [OPEN, REPAIR(1)], asm: '' },
        { enc: '"[" ■ ▲ ● RS3 "]"', dec: [OPEN, ['STRIP', { set: 'ABCDEF' }], REPAIR(1)], asm: '' },
        // one seal short of three in a row; interleaved copies cost too much; seals without the codebook
        { enc: '■ ▲ ● RS2', dec: [['STRIP', { set: 'ABCDEF' }], REPAIR(1)], asm: '' },
        { enc: '3x( ■ ▲ ● )', dec: [['STRIP', { set: 'ABCDEF' }]], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9' },
        { enc: '■ ▲ ● RS3', dec: [['STRIP', { set: 'ABCDEF' }]], asm: '' },
      ],
    },
    withNetworkChain({
      id: 'M3', sector: 4, name: 'FERRY CROSSING',
      format: [D, D, D],
      network: {
        nodes: [
          { id: 'HQ', label: 'HQ', x: 3, y: 50 },
          { id: 'GATE', label: 'Causeway gate', x: 28, y: 6 },
          { id: 'FAR', label: 'Causeway end', x: 70, y: 6, kind: 'bridge' },
          { id: 'LAND', label: 'Ferry landing', x: 28, y: 50, kind: 'ford' },
          { id: 'BANK', label: 'Far bank', x: 70, y: 50 },
          { id: 'QUAY', label: 'Barge quay', x: 28, y: 94 },
          { id: 'LOCK', label: 'Canal lock', x: 70, y: 94, kind: 'mill' },
          { id: 'FIELD', label: 'Front', x: 97, y: 50 },
        ],
        river: [[50, -12], [47, 24], [52, 52], [47, 80], [51, 112]],
        links: [
          { a: 'HQ', b: 'GATE', name: 'Causeway', delay: 0.5, chain: [smudge('HIGH WATER')] },
          { a: 'GATE', b: 'FAR', name: 'Causeway', delay: 0.5, chain: [smudge('SPRING TIDE')] },
          { a: 'FAR', b: 'FIELD', name: 'Causeway', delay: 0.5, chain: [garble('ENEMY JAMMER')] },
          { a: 'HQ', b: 'LAND', name: 'Landing road', delay: 0.5, chain: [] },
          { a: 'LAND', b: 'BANK', name: 'The ferry', delay: 1, chain: [smudge('SPRAY'), garble('OLD FERRYMAN', 0.05)] },
          { a: 'BANK', b: 'FIELD', name: 'Bank road', delay: 0.5, chain: [] },
          { a: 'HQ', b: 'QUAY', name: 'Canal', delay: 1, chain: [garble('BARGEE', 0.2)] },
          { a: 'QUAY', b: 'LOCK', name: 'Canal', delay: 1, chain: [] },
          { a: 'LOCK', b: 'FIELD', name: 'Canal', delay: 1, chain: [garble('LOCK-KEEPER', 0.2)] },
          { a: 'GATE', b: 'LAND', name: 'Dyke path', delay: 0.5, chain: [smudge('WET CABLE')] },
          { a: 'FAR', b: 'BANK', name: 'Flooded lane', delay: 0.5, chain: [smudge('FLOODED CABLE')] },
          { a: 'LAND', b: 'QUAY', name: 'Towpath', delay: 1, chain: [] },
          { a: 'BANK', b: 'LOCK', name: 'Ditch', delay: 0.5, chain: [smudge('DRAINAGE DITCH')] },
        ],
      },
      enc: T7, dec: [...R3, 'REPAIR', 'IF_VALID', 'SAY_AGAIN'], arq: true, target: 1, budget: 2.5, delayBudget: 3,
      par: { overhead: 2.5, blocks: 4 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "The last line out of the marshes. The causeway is quick, but the tide is over it and a jammer sits at the end of it. The old ferry is slower: the spray smudges a digit of nearly every order, but the ferryman himself fumbles a digit only one order in twenty. The barge canal is quiet, but long.\n\nThis time the field can radio SAY AGAIN, and every re-send crosses the water again and costs its hours again. Orders are 3 digits. Command's limits: every order through, at most 2.5 extra digits and 3 hours per order on average, re-sends included.",
      hints: [
        'Correcting a garble costs two seal digits. Noticing one is cheaper, if you can afford to ask again. Where are garbles rare, and is that route fast enough to ask again?',
        'Take the ferry. Fix the smudge on the spot, and when the ferryman has garbled a digit as well, do not let the codebook guess: ask again. Two seal digits can fix one smudge and still notice one garble, if REPAIR fixes smudges only (up to 0) and you check that what is left is a valid transmission.',
        'Route: HQ → Ferry landing → the ferry → Far bank → Front (2 h). Strip: ■ ▲ ● then a SEAL, modulus 11, with rows 1,1,1,1,1 / 1,2,3,4,5 (the POWERS stamp, 2 rows). Field work: REPAIR SCATTER up to 0 → IF SIGNAL IS IN CODEBOOK → (nothing); NO → SAY AGAIN!',
      ],
      debrief: {
        title: 'Hybrid ARQ',
        text: 'Correct what you can see; ask about what you cannot. You fixed every smudge on the spot and asked again only when a garble slipped through, about one order in twenty. This is hybrid ARQ, and 4G and 5G phones do it many times a second: an error-correcting code repairs most damage in place, a check catches what it could not fix, and only then is the block sent again. On a slow link, like the barge canal or a satellite hop, every re-send costs so much time that the code has to carry more of the load.',
      },
      solution: { enc: '■ ▲ ● RS2', dec: [REPAIR(0), ASK_IF_INVALID], asm: '', route: ['HQ', 'LAND', 'BANK', 'FIELD'] },
      anti: [
        // the ferry, correcting everything (too expensive), guessing, or one seal short
        { enc: '■ ▲ ● RS3', dec: [REPAIR(1)], asm: '', route: ['HQ', 'LAND', 'BANK', 'FIELD'] },
        { enc: '■ ▲ ● RS2', dec: [REPAIR(1)], asm: '', route: ['HQ', 'LAND', 'BANK', 'FIELD'] },
        { enc: '■ ▲ ● RS1', dec: [REPAIR(0), ASK_IF_INVALID], asm: '', route: ['HQ', 'LAND', 'BANK', 'FIELD'] },
        // the quiet canal: asking again blows the clock, correcting blows the budget
        { enc: '■ ▲ ● SUM(■▲●)', dec: [ASK_IF_INVALID], asm: '', route: ['HQ', 'QUAY', 'LOCK', 'FIELD'] },
        { enc: '■ ▲ ● RS2', dec: [REPAIR(0), ASK_IF_INVALID], asm: '', route: ['HQ', 'QUAY', 'LOCK', 'FIELD'] },
        { enc: '■ ▲ ● RS4', dec: [REPAIR(2)], asm: '', route: ['HQ', 'QUAY', 'LOCK', 'FIELD'] },
        // the causeway, and the all-smudge detour that needs three seals
        { enc: '■ ▲ ● RS3', dec: [REPAIR(1)], asm: '', route: ['HQ', 'GATE', 'FAR', 'FIELD'] },
        { enc: '■ ▲ ● RS3', dec: [REPAIR(1)], asm: '', route: ['HQ', 'GATE', 'FAR', 'BANK', 'FIELD'] },
      ],
    }),

    // ================================================================ ENEMY HIGH COMMAND
    withNetworkChain({
      id: 'K1', sector: 5, name: 'THE BURNING CITY',
      format: [D, D, D],
      network: {
        nodes: [
          { id: 'HQ', label: 'HQ', x: 3, y: 50 },
          { id: 'GAS', label: 'Gasworks', x: 24, y: 6, kind: 'mill' },
          { id: 'RAIL', label: 'Rail yards', x: 50, y: 6, kind: 'bridge' },
          { id: 'MIN', label: 'Ministry', x: 76, y: 6 },
          { id: 'MAST', label: 'Radio mast', x: 24, y: 50 },
          { id: 'MARKET', label: 'Market square', x: 50, y: 50 },
          { id: 'CATH', label: 'Cathedral', x: 76, y: 50 },
          { id: 'METRO', label: 'Metro station', x: 24, y: 94 },
          { id: 'SEWER', label: 'Sewer outfall', x: 76, y: 94, kind: 'ford' },
          { id: 'FIELD', label: 'Front', x: 97, y: 50 },
        ],
        river: [[38, -12], [35, 24], [39, 52], [35, 80], [39, 112]],
        links: [
          { a: 'HQ', b: 'GAS', name: 'Gasworks road', delay: 0.5, chain: [smudge('BURNING GASWORKS')] },
          { a: 'GAS', b: 'RAIL', name: 'Rail line', delay: 0.5, chain: [garble('JAMMING TRAIN')] },
          { a: 'RAIL', b: 'MIN', name: 'Rail line', delay: 0.5, chain: [smudge('RUBBLE')] },
          { a: 'MIN', b: 'FIELD', name: 'Ministry steps', delay: 0.5, chain: [garble('ENEMY JAMMER')] },
          { a: 'HQ', b: 'MAST', name: 'Boulevard', delay: 0.5, chain: [junk('ENEMY RADIO TRAFFIC')] },
          { a: 'MAST', b: 'MARKET', name: 'Boulevard', delay: 0.5, chain: [smudge('SMOKE')] },
          { a: 'MARKET', b: 'CATH', name: 'Arcade', delay: 0.5, chain: [] },
          { a: 'CATH', b: 'FIELD', name: 'Cathedral close', delay: 0.5, chain: [garble('NERVOUS SIGNALLER', 0.05)] },
          { a: 'HQ', b: 'METRO', name: 'Metro tunnel', delay: 1, chain: [garble('TIRED OPERATOR', 0.15)] },
          { a: 'METRO', b: 'SEWER', name: 'Sewer', delay: 1, chain: [] },
          { a: 'SEWER', b: 'FIELD', name: 'Sewer', delay: 1, chain: [garble('DAMP CABLE', 0.15)] },
          { a: 'GAS', b: 'MAST', name: 'Back alley', delay: 0.5, chain: [] },
          { a: 'RAIL', b: 'MARKET', name: 'Goods lane', delay: 0.5, chain: [garble('JAMMING TRUCK')] },
        ],
      },
      enc: T7, dec: [...R3, 'BETWEEN', 'STRIP', 'REPAIR', 'IF_VALID', 'SAY_AGAIN'], arq: true, target: 1,
      budget: 4, delayBudget: 3, par: { overhead: 3.75, blocks: 4 }, repair: ['SCATTER', 'BURST', 'EDIT'], metric: 'hamming',
      briefing:
        "The siege lines have closed around the enemy capital. Between our HQ and the assault battalions lies a city on fire: the gasworks burning, jammers on the rail line and in the goods trucks, smoke down the boulevards, a nervous signaller at the cathedral, and the enemy's own radio traffic piling junk around anything that passes the radio mast. The metro tunnels are quieter, but slow, and their tired operators and damp cables still garble a digit now and then.\n\nOrders are 3 digits and the field can ask SAY AGAIN. Command's limits: every order through, at most 4 extra digits and 3 hours per order on average, re-sends included.",
      hints: [
        'Put a price on every road: how many extra digits does it cost to get an order across it? Junk costs an envelope. A smudge costs one seal digit and a garble two, or less, if the garble is rare and you have time to ask again.',
        'The road past the radio mast costs an envelope on top of its seals, and the tunnels are too slow to ask again. A back alley from the gasworks reaches the mast without its traffic. That route meets two smudges and the nervous signaller (one order in twenty): fix the smudges, notice his garble, and ask again.',
        'Route: HQ → Gasworks → back alley → Radio mast → Boulevard → Market square → Arcade → Cathedral → Front (2.5 h). Strip: ■ ▲ ● then a SEAL, modulus 11, with three rows of powers over all six positions: 1s, i, i² (the POWERS stamp, 3 rows). Field work: REPAIR SCATTER up to 0 → IF SIGNAL IS IN CODEBOOK → (nothing); NO → SAY AGAIN! (A fourth row, i³, with REPAIR up to 1 also gets through, at exactly 4 extra digits.)',
      ],
      debrief: {
        title: 'Every Link Its Code',
        text: 'You priced every road in the currency of the code: framing, erasures, errors, re-sends and hours, and the cheapest road was not the shortest. Real networks are planned this way. Each hop gets the protection its channel needs (heavy coding on radio and satellite hops, light checks and retransmission on clean wire), and routing protocols pick paths by total cost. Allied signal units advancing through Europe in 1944–45 did it by hand, patching captured enemy cables, field wire and radio relay into one network and sending each message over whatever mix of links would get it through.',
      },
      solution: {
        enc: '■ ▲ ● RS3', dec: [REPAIR(0), ASK_IF_INVALID], asm: '',
        route: ['HQ', 'GAS', 'MAST', 'MARKET', 'CATH', 'FIELD'],
      },
      anti: [
        // the direct road past the radio mast: envelope + seals, corrected or hybrid, both too expensive
        { enc: '"[" ■ ▲ ● RS3 "]"', dec: [OPEN, REPAIR(1)], asm: '', route: ['HQ', 'MAST', 'MARKET', 'CATH', 'FIELD'] },
        { enc: '"[" ■ ▲ ● RS2 "]"', dec: [OPEN, REPAIR(0), ASK_IF_INVALID], asm: '', route: ['HQ', 'MAST', 'MARKET', 'CATH', 'FIELD'] },
        { enc: '"[" ■ ▲ ● RS2 "]"', dec: [OPEN, REPAIR(1)], asm: '', route: ['HQ', 'MAST', 'MARKET', 'CATH', 'FIELD'] },
        // the tunnels: asking again is too slow, a short seal guesses wrong
        { enc: '■ ▲ ● SUM(■▲●)', dec: [ASK_IF_INVALID], asm: '', route: ['HQ', 'METRO', 'SEWER', 'FIELD'] },
        { enc: '■ ▲ ● RS2', dec: [REPAIR(1)], asm: '', route: ['HQ', 'METRO', 'SEWER', 'FIELD'] },
        // the right road: seals that guess, or one seal short
        { enc: '■ ▲ ● RS3', dec: [REPAIR(1)], asm: '', route: ['HQ', 'GAS', 'MAST', 'MARKET', 'CATH', 'FIELD'] },
        { enc: '■ ▲ ● RS2', dec: [REPAIR(0), ASK_IF_INVALID], asm: '', route: ['HQ', 'GAS', 'MAST', 'MARKET', 'CATH', 'FIELD'] },
        // the rail line: two jammers
        { enc: '■ ▲ ● RS4', dec: [REPAIR(2)], asm: '', route: ['HQ', 'GAS', 'RAIL', 'MIN', 'FIELD'] },
      ],
    }),
    {
      id: 'K2', sector: 5, name: 'THE ENEMY EXCHANGE',
      format: ORD,
      chain: [
        { kind: 'garble', p: 0.9, set: '1234', to: '1234', name: 'ENEMY JAMMER' },
        { kind: 'garble', p: 0.9, set: '1234', to: '1234', name: 'SECOND JAMMER' },
        { kind: 'reverse', p: 1, name: 'ENEMY SWITCHBOARD' },
        { kind: 'pad', p: 1, set: 'NSEW1234ABCD', max: 2, name: 'ENEMY TRAFFIC' },
      ],
      hiddenLine: true, samples: 5, sampleSeed: 11, probe: ['[N3A]', '[E1C]', '[S2222D]', '[W4B]', '[N3333A]'],
      enc: T6, dec: [...R3, 'BETWEEN', 'STRIP'], arq: false, target: 1, budget: 6,
      par: { overhead: 6, blocks: 2 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "Our engineers have tapped the enemy's central telephone exchange. Through it we can reach every one of our units inside the city at once, if we can work out what it does to traffic. Nobody has seen the switchboard. We have five test messages, sent in envelopes, and what came out at the far end.\n\nOrders are a heading, a company and an objective, like N3A. No return channel. Command allows 6 extra symbols per order.",
      hints: [
        'Line each pair up carefully. Which end of the message comes out first? What happens to the envelope? Which symbols ever change, and how many of them in one message?',
        'Everything comes out back to front, envelope included, wrapped in junk made of our own order symbols, so STRIP OUT cannot remove it. Only the digit is ever changed, up to twice in one message. The letters never are.',
        'Strip: "[" ■ ▲ ▲ ▲ ▲ ▲ ● "]". Field work: OPEN ENVELOPE ] … [, since it arrives reversed. Assembly: ● from #1, ▲ by vote over #2, #3, #4, #5, #6, ■ from #7.',
      ],
      debrief: {
        title: 'Byte Order',
        text: "The enemy's switchboard wrote everything out back to front. Computers disagree in exactly this way: some store a number's most significant byte first, others last. In 1980 Danny Cohen named the two camps big-endian and little-endian, after the egg-cracking factions in Gulliver's Travels, and every network protocol has to declare which end comes first (network byte order is big-endian). You worked the exchange out from its traffic, then protected only what it attacks: two hits need five votes, so the digit got five copies and the letters none.",
      },
      solution: { enc: '"[" ■ ▲ ▲ ▲ ▲ ▲ ● "]"', dec: [['BETWEEN', { open: ']', close: '[' }]], asm: '■=#7 ▲=V2,3,4,5,6 ●=#1' },
      anti: [
        // an envelope opened the usual way round; read front to back; no envelope
        { enc: '"[" ■ ▲ ▲ ▲ ▲ ▲ ● "]"', dec: [OPEN], asm: '■=#7 ▲=V2,3,4,5,6 ●=#1' },
        { enc: '"[" ■ ▲ ▲ ▲ ▲ ▲ ● "]"', dec: [['BETWEEN', { open: ']', close: '[' }]], asm: '■=#1 ▲=V2,3,4,5,6 ●=#7' },
        { enc: '■ ▲ ▲ ▲ ▲ ▲ ●', dec: [], asm: '■=#7 ▲=V2,3,4,5,6 ●=#1' },
        // too few copies for two hits; everything five times: too expensive
        { enc: '"[" ■ ▲ ▲ ▲ ● "]"', dec: [['BETWEEN', { open: ']', close: '[' }]], asm: '■=#5 ▲=V2,3,4 ●=#1' },
        { enc: '"[" ■ ▲ ▲ ▲ ▲ ● "]"', dec: [['BETWEEN', { open: ']', close: '[' }]], asm: '■=#6 ▲=V2,3,4,5 ●=#1' },
        { enc: '"[" 5x( ■ ▲ ● ) "]"', dec: [['BETWEEN', { open: ']', close: '[' }]], asm: '■=V3,6,9,12,15 ▲=V2,5,8,11,14 ●=V1,4,7,10,13' },
      ],
    },
  ];

  for (const lv of NEW) {
    if (LEVELS.some((l) => l.id === lv.id)) continue;
    lv.repair = lv.repair || ['SCATTER'];
    lv.metric = lv.metric || 'hamming';
    LEVELS.push(lv);
  }
})();
