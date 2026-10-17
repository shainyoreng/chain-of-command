/* Special-mission mode: compress — commando raids where the burst must be short.
 *
 * The enemy's direction-finding vans triangulate any transmission that runs long. The player designs a
 * codebook: a pattern of short (·) and long (–) flashes for every letter of the raid's alphabet. Each
 * flash costs the same. Frequent letters should get short patterns — but the field writes a letter down
 * the moment the flashes so far spell one, so no pattern may be the beginning of another (prefix-free).
 *
 * Codes are stored as strings of '0' (short ·) and '1' (long –): state = { codes: { N: '0', E: '10', … } }.
 * The field decodes by walking the code tree: read a flash, step down; the moment the flashes so far are a
 * codeword, write that letter and go back to the root (shortest match). A dead end writes '?'.
 *
 * The exercise message has the intercepted letter counts exactly (e.g. 500 N, 250 E, 125 W, 125 S) in a
 * seeded random order, so the burst length the codebook shows is exactly what the exercise measures.
 * See js/modes/README.md for the contract.
 */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});
  CoC.modes = CoC.modes || {};

  // ================================================================ levels
  const LEVELS = [
    {
      id: 'C1', name: 'SHORT BURST', mode: 'compress',
      compress: {
        letters: [
          { ch: 'N', name: 'North', count: 500 },
          { ch: 'E', name: 'East', count: 250 },
          { ch: 'W', name: 'West', count: 125 },
          { ch: 'S', name: 'South', count: 125 },
        ],
        limit: 1900, // the burst must be strictly shorter
        par: { bits: 1750, maxLen: 3 },
        maxCode: 6,
        preview: 'NEWSNNEN',
        burst: 8,
      },
      goal: '1000 letters in under 1900 flashes',
      objectives: [
        'The field must read back all 1000 letters exactly.',
        'The whole burst must be shorter than 1900 flashes. Command’s standard book needs 2000.',
      ],
      medalCaptions: ['Raid complete', 'Efficient · 1750 flashes or fewer', 'Lean · no letter longer than 3 flashes'],
      briefing:
        'Deep behind Jammer Valley, a commando team lies up above the enemy’s main supply road. For a week they have logged every convoy at the crossroads by the way it turned: N, E, W or S. Tonight they send the whole log, 1000 letters, in one burst.\n\n' +
        'The enemy runs direction-finding vans. Every flash the team keys gives them more to work with, and once the burst runs long their bearings cross on the hide. Command’s standard book gives every letter two flashes, which makes 2000. That is too long. Write the team a codebook that gets the log out in under 1900 flashes, and make sure the field can still read every letter back.',
      hints: [
        'Not every letter has to be the same length. Which letter does the team send most often?',
        'Give N a single flash. After that, no other letter may begin with that flash, because the field writes N down as soon as it sees it. On the code tree, nothing may grow below a letter.',
        'N = ·   E = – ·   W = – – ·   S = – – –.   That is 500×1 + 250×2 + 125×3 + 125×3 = 1750 flashes.',
      ],
      debrief: {
        title: 'Variable-Length Codes',
        text:
          'Frequent letters get short codes and rare letters get long ones. No code may be the start of another, so the field can write each letter down the instant it is complete. That is the prefix-free rule, and it is why letters sit only at the leaves of your code tree. Samuel Morse worked the same way in the 1830s: he counted the type in a printer’s case and gave E, the commonest letter in English, a single dot. (Morse cheats a little: it needs pauses between letters to stay readable. Your code needs none.) Here 1.75 flashes per letter is the best any code can do. Claude Shannon (1948) called that floor the entropy of the traffic: the sum of p·log₂(1/p), here 1/2·1 + 1/4·2 + 1/8·3 + 1/8·3.',
      },
      enc: [],
      dec: [],
      solution: { state: { codes: { N: '0', E: '10', W: '110', S: '111' } } },
      anti: [
        { codes: { N: '00', E: '01', W: '10', S: '11' } }, // the standard book: 2000 flashes
        { codes: { N: '0', E: '1', W: '01', S: '10' } }, // short, but codes clash
        { codes: { N: '0', E: '01', W: '011', S: '111' } }, // decodable only with look-ahead: the field reads greedily
        { codes: { N: '0', E: '10', W: '110', S: '' } }, // a letter with no code
      ],
    },
    {
      id: 'C2', name: 'NIGHT TRAIN', mode: 'compress',
      compress: {
        letters: [
          { ch: 'A', name: 'Ammunition', count: 120 },
          { ch: 'C', name: 'Coal', count: 160 },
          { ch: 'E', name: 'Empty stock', count: 175 },
          { ch: 'F', name: 'Freight', count: 250 },
          { ch: 'P', name: 'Panzers', count: 35 },
          { ch: 'S', name: 'Staff train', count: 20 },
          { ch: 'T', name: 'Troops', count: 240 },
        ],
        limit: 2800,
        par: { bits: 2565, maxLen: 4 },
        maxCode: 7,
        preview: 'FTCEFATSTP',
        burst: 10,
      },
      goal: '1000 trains in under 2800 flashes',
      objectives: [
        'The field must read back all 1000 letters exactly.',
        'The whole burst must be shorter than 2800 flashes. The standard book needs 3000.',
      ],
      medalCaptions: ['Raid complete', 'Efficient · 2565 flashes or fewer', 'Lean · no letter longer than 4 flashes'],
      briefing:
        'Beyond the Mountain Pass, commandos have watched the Kessel rail junction for a month: 1000 trains, logged one letter each by what they carried. High Command wants the whole log tonight. It tells them where the next offensive will come from.\n\n' +
        'The DF vans in the mountains are better, and the traffic is less obliging than last time. No train type is half the traffic. The ladder that worked at the crossroads (·, – ·, – – ·, …) leaves the rare letters six flashes deep. The standard book, three flashes a letter, makes 3000. Get the log out in under 2800 flashes. To earn the efficiency medal you will need the shortest codebook that can exist.',
      hints: [
        'Trust the counts, not the habit. With seven letters and none of them half the traffic, no letter deserves a single flash. The heavy hitters want two flashes each, and the stragglers go deep.',
        'Build the tree from the bottom up, the way you would merge under-strength units. Take the two rarest letters and make them one squad: they share a code and differ only in the last flash. The squad’s traffic is the sum of theirs. Repeat, always merging the two smallest units, until one unit is left. Every merge a letter goes through adds one flash to its code. When two units tie, merge the plain letter rather than the squad. That keeps the deepest code shorter.',
        'S+P = 55. Add A: 175. Then C (160) and E (175) pair up. Then T joins the A·P·S squad (415), and F joins C·E (585). Read the codes off the tree: T = · ·, A = · – ·, P = · – – ·, S = · – – –, F = – ·, C = – – ·, E = – – –. That makes 2565 flashes.',
      ],
      debrief: {
        title: 'Huffman Coding',
        text:
          'In 1951 Robert Fano offered his MIT students a choice: sit the final exam, or find the most efficient binary code. He and Shannon had a top-down method (split the letters into two halves of equal traffic, then split again), and it was good but not always the best. David Huffman was about to give up when he saw it: build the tree from the bottom, always merging the two rarest. His 1952 paper proved that no letter-by-letter code can beat it. Here that comes to 2.565 flashes per letter. Shannon’s entropy floor is 2.51, and you can only creep closer by coding pairs of letters at a time. Huffman codes still sit inside ZIP files, PNG, JPEG and MP3. DEFLATE even caps its codes at 15 bits, much as your lean medal capped yours at four flashes.',
      },
      enc: [],
      dec: [],
      solution: { state: { codes: { T: '00', A: '010', P: '0110', S: '0111', F: '10', C: '110', E: '111' } } },
      anti: [
        { codes: { A: '000', C: '001', E: '010', F: '011', P: '100', S: '101', T: '110' } }, // standard book: 3000
        { codes: { F: '0', T: '10', E: '110', C: '1110', A: '11110', P: '111110', S: '111111' } }, // the C1 ladder: 2825
        { codes: { F: '0', T: '100', E: '101', C: '1100', A: '1101', P: '1110', S: '1111' } }, // F gets one flash, the rest even: 2835
        { codes: { F: '0', T: '1', E: '10', C: '11', A: '100', P: '101', S: '110' } }, // short, but clashes
      ],
    },
    {
      id: 'C3', name: 'QUIET HOURS', mode: 'compress',
      compress: {
        letters: [
          { ch: 'Q', name: 'Quiet', count: 640 },
          { ch: 'D', name: 'Dispatch rider', count: 120 },
          { ch: 'M', name: 'Motorcade', count: 40 },
        ],
        pairs: true, // the pair book: codes for two-letter groups
        unit: 'entry',
        units: 'entries',
        limit: 900,
        par: { bits: 747, maxLen: 6 },
        maxCode: 8,
        preview: 'QQQDQQMQQQ',
        burst: 10,
      },
      goal: '800 entries in under 900 flashes',
      objectives: [
        'The field must read back all 800 entries exactly.',
        'The whole burst must be shorter than 900 flashes.',
      ],
      medalCaptions: ['Raid complete', 'Efficient · 747 flashes or fewer', 'Lean · no code longer than 6 flashes'],
      briefing:
        'The boldest raid of the war. A commando team is hidden in the bell tower above the château that houses Enemy High Command. Every quarter hour for eight days they have logged the gate: Q for quiet, D for a dispatch rider, M for a motorcade, which means somebody important. That makes 800 entries, and they tell Command exactly when the generals meet.\n\n' +
        'The DF net around High Command is the densest on the front, so the burst must stay under 900 flashes. Four entries in five are quiet, yet on a card that codes one letter at a time every quiet still costs a whole flash. Signals has sent up a bigger card, the pair book, which holds a code for every two-letter group.',
      hints: [
        'However you write a one-letter card, Q costs at least one flash, and Q is four entries in five. A whole flash is far too much for “nothing happened”. Switch the card to PAIRS and look at the counts again.',
        'In pairs, QQ is 256 of the 400 groups: it has earned a single flash. Build the rest of the tree as you did at the Mountain Pass. Merge the two rarest pairs into one squad, repeat until one unit is left, and remember that every merge adds a flash. When units tie, merge plain pairs before squads; that keeps the deepest code at 6 flashes.',
        'QQ = ·.  QD = – · ·, DQ = – · –.  QM = – – · ·, MQ = – – · –, DD = – – – ·.  MD = – – – – ·.  DM = – – – – – ·, MM = – – – – – –.  That is 256×1 + 96×3 + 41×4 + 3×5 + 4×6 = 747 flashes.',
      ],
      debrief: {
        title: 'Block Coding',
        text:
          'Any letter-by-letter code spends at least one flash per letter, even on a letter that carries almost no news. Quiet was 80% of the log, so it was worth far less than a flash. Coding pairs let one flash carry two quiet quarter-hours. Shannon’s source coding theorem (1948) says that coding longer and longer blocks creeps down to the entropy, here 0.884 flashes per entry. Single letters managed 1.2 and pairs 0.934, and triples would do better still. Fax machines (ITU T.4, 1980) code whole runs of white paper instead of single dots for the same reason. Arithmetic coding (Rissanen and Pasco, 1976) and Duda’s asymmetric numeral systems (2009, now inside Zstandard and JPEG XL) reach the entropy without an enormous codebook.',
      },
      enc: [],
      dec: [],
      solution: {
        state: { group: 2, codes: { QQ: '0', QD: '100', DQ: '101', QM: '1100', MQ: '1101', DD: '1110', MD: '11110', DM: '111110', MM: '111111' } },
      },
      anti: [
        { group: 1, codes: { Q: '0', D: '10', M: '11' } }, // best one-letter card: 960
        { group: 2, codes: { QQ: '0000', QD: '0001', QM: '0010', DQ: '0011', DD: '0100', DM: '0101', MQ: '0110', MD: '0111', MM: '1000' } }, // standard pair book: 1600
        { group: 2, codes: { QQ: '00', QD: '01', DQ: '10', QM: '1100', MQ: '1101', DD: '1110', MD: '11110', DM: '111110', MM: '111111' } }, // QQ on two flashes: 907
        { group: 2, codes: { QQ: '0', QD: '1', DQ: '01', QM: '10', MQ: '11', DD: '001', MD: '010', DM: '011', MM: '100' } }, // short, but clashes
      ],
    },
    // ================================================================ THE AIRFIELD (a sector of compression)
    {
      id: 'C4', name: 'WEATHER WATCH', mode: 'compress',
      compress: {
        letters: [
          { ch: 'C', name: 'Clear' },
          { ch: 'F', name: 'Fog' },
          { ch: 'L', name: 'Low cloud' },
          { ch: 'O', name: 'Overcast' },
          { ch: 'R', name: 'Rain' },
        ],
        // one card, two broadcasts: the dawn report for the fighters, the night report for the bombers
        streams: [
          { name: 'Dawn', counts: { C: 25, F: 200, L: 200, O: 50, R: 25 } },
          { name: 'Night', counts: { C: 325, F: 25, L: 25, O: 50, R: 75 } },
        ],
        limit: 2500,
        par: { bits: 2200, maxLen: 3 },
        maxCode: 6,
        preview: 'FLFOCCRC',
        burst: 8,
      },
      goal: 'Dawn + night: 1000 letters in under 2500 flashes',
      objectives: [
        'The squadrons must read back every letter of both broadcasts exactly.',
        'Both broadcasts go out on the same card. Together they must take fewer than 2500 flashes.',
      ],
      medalCaptions: ['Sector mission complete', 'Efficient · 2200 flashes or fewer', 'Lean · no letter longer than 3 flashes'],
      briefing:
        'The airfield broadcasts the weather to the squadrons twice a day: a dawn report before the fighters take off, and a night report for the bombers. Every flash on the air gives the enemy’s direction-finders another bearing on the airfield, so the reports go out in short codes.\n\n' +
        'Each letter of a report is one station’s sky: C clear, F fog, L low cloud, O overcast, R rain. Each one is a pattern of short and long flashes, and the field writes a letter down the moment the flashes spell one, so no pattern may begin another. The squadrons carry a single codebook card for both broadcasts. Dawn is all fog and low cloud; nights are mostly clear. Write one card that keeps the two broadcasts together under 2500 flashes.',
      hints: [
        'Write the card for the traffic it will actually carry: the dawn broadcast AND the night broadcast.',
        'Add the two columns: Clear 350, Fog 225, Low cloud 225, Overcast 100, Rain 100. A card tuned to dawn alone sends Clear four flashes deep, and Clear is the commonest letter of the whole day. Short codes go to the big totals. Remember that no code may begin another.',
        'C = · ·,  F = · –,  L = – ·,  O = – – ·,  R = – – –.  That is 2200 flashes: 1075 at dawn and 1125 at night.',
      ],
      debrief: {
        title: 'Matched Codes',
        text:
          'A code is a bet on the statistics. Tuned to the dawn broadcast, the card cost 2775 flashes on the real mix. Tuned to the night, it cost 2650. Tuned to the mix, it cost 2200. The extra cost of coding with the wrong statistics has a name: the Kullback–Leibler divergence (Kullback and Leibler, 1951). It is why DEFLATE, the method inside ZIP (Phil Katz, 1993), may send a fresh code table with every block of data, and why adaptive Huffman coders (Faller 1973, Gallager 1978, Knuth 1985) re-shape their tree as the traffic changes.',
      },
      enc: [],
      dec: [],
      solution: { state: { codes: { C: '00', F: '01', L: '10', O: '110', R: '111' } } },
      anti: [
        { codes: { C: '000', F: '001', L: '010', O: '011', R: '100' } }, // standard book: 3000
        { codes: { F: '0', L: '10', O: '110', C: '1110', R: '1111' } }, // tuned to dawn: 2775
        { codes: { C: '0', R: '10', O: '110', F: '1110', L: '1111' } }, // tuned to night: 2650
        { codes: { C: '0', F: '1', L: '01', O: '10', R: '11' } }, // short, but clashes
      ],
    },
    {
      id: 'C5', name: 'CALL SIGNS', mode: 'compress',
      compress: {
        letters: [
          { ch: 'A', name: 'Able', count: 75 },
          { ch: 'B', name: 'Baker', count: 260 },
          { ch: 'C', name: 'Charlie', count: 45 },
          { ch: 'D', name: 'Dog', count: 120 },
          { ch: 'E', name: 'Easy', count: 35 },
          { ch: 'F', name: 'Fox', count: 180 },
          { ch: 'G', name: 'George', count: 20 },
          { ch: 'H', name: 'How', count: 90 },
          { ch: 'I', name: 'Item', count: 50 },
          { ch: 'J', name: 'Jig', count: 25 },
          { ch: 'K', name: 'King', count: 60 },
          { ch: 'L', name: 'Love', count: 40 },
        ],
        board: true, // the plotting table
        limit: 3400,
        par: { bits: 3210, maxLen: 5 },
        maxCode: 8,
        preview: 'BFDBHAKBIC',
        burst: 10,
        unit: 'call sign',
        units: 'call signs',
      },
      goal: '1000 call signs in under 3400 flashes',
      objectives: [
        'The tower must read back every call sign exactly.',
        'The whole burst must be shorter than 3400 flashes. The standard book needs 4000.',
      ],
      medalCaptions: ['Sector mission complete', 'Efficient · 3210 flashes or fewer', 'Lean · no call sign over 5 flashes'],
      briefing:
        'Twelve aircraft fly from the airfield, from ABLE to LOVE, and every message to or from the tower starts with a call sign. Last night’s traffic log holds 1000 of them. BAKER leads the squadron and is never off the air. GEORGE flies the weather run and hardly speaks.\n\n' +
        'The standard book gives every call sign four flashes: 4000 in all, and the direction-finders will have the tower long before the end. Get it under 3400. Twelve codes are a lot to juggle by hand, so Signals has issued a plotting table. Pair two units on it and they become one squad that shares a code except for its last flash. When one unit is left, write the card from it.',
      hints: [
        'Use the plotting table. Pick any two units to pair them into a squad, and keep pairing until one unit is left, then press WRITE THE CARD. You choose which two units to pair; the table does the bookkeeping.',
        'Huffman’s rule: always pair the two SMALLEST units on the table, whether they are call signs or squads. Every pairing adds one flash to every call sign inside, so the rarest should be paired first and most often. When a call sign and a squad tie, pair the call sign; that keeps the deepest code shorter.',
        'Pairs in order: GEORGE+JIG (45); EASY+LOVE (75); CHARLIE+the G·J squad (90); ITEM+KING (110); ABLE+the E·L squad (150); HOW+the C·G·J squad (180); DOG+I·K (230); FOX+the A·E·L squad (330); the H·C·G·J squad+D·I·K (410); BAKER+the FOX squad (590); then the last two. BAKER gets 2 flashes; FOX, DOG and HOW 3; ABLE, CHARLIE, ITEM and KING 4; the rest 5. That is 3210 flashes.',
      ],
      debrief: {
        title: 'Huffman’s Algorithm',
        text:
          'Always merge the two rarest. David Huffman’s 1952 paper, “A Method for the Construction of Minimum-Redundancy Codes”, proved that this greedy rule can never be beaten by any letter-by-letter code. With a priority queue it takes moments even for thousands of symbols. Real systems do not even send the codes. DEFLATE transmits only each symbol’s length, and the codes follow from the lengths in a fixed order, which is exactly what WRITE THE CARD did. These are called canonical Huffman codes.',
      },
      enc: [],
      dec: [],
      solution: {
        state: {
          codes: { B: '00', F: '010', D: '011', H: '100', A: '1010', C: '1011', I: '1100', K: '1101', E: '11100', G: '11101', J: '11110', L: '11111' },
        },
      },
      anti: [
        { codes: { A: '0000', B: '0001', C: '0010', D: '0011', E: '0100', F: '0101', G: '0110', H: '0111', I: '1000', J: '1001', K: '1010', L: '1011' } }, // standard: 4000
        { codes: { B: '0', F: '10', D: '110', H: '1110', A: '1111000', K: '1111001', I: '1111010', C: '1111011', L: '1111100', E: '1111101', J: '1111110', G: '1111111' } }, // the ladder, then flat: 3790
        { codes: { B: '00', F: '010', D: '011', H: '100', A: '101', K: '1100', I: '1101', C: '1110', L: '1111', E: '11110', J: '111110', G: '111111' } }, // short, but clashes
        { codes: { B: '00', F: '0100', D: '0101', H: '0110', A: '0111', K: '1000', I: '1001', C: '1010', L: '1011', E: '1100', J: '1101', G: '1110' } }, // BAKER short, the rest flat: 3480
      ],
    },
    {
      id: 'C6', name: 'THE KEYER', mode: 'compress',
      compress: {
        letters: [
          { ch: 'A', name: 'Flak', count: 40 },
          { ch: 'B', name: 'Bridge work', count: 35 },
          { ch: 'D', name: 'Fuel dump', count: 20 },
          { ch: 'F', name: 'Fighters', count: 30 },
          { ch: 'G', name: 'Guns', count: 60 },
          { ch: 'H', name: 'Headquarters', count: 10 },
          { ch: 'I', name: 'Infantry', count: 80 },
          { ch: 'L', name: 'Lorries', count: 150 },
          { ch: 'R', name: 'Rail traffic', count: 50 },
          { ch: 'S', name: 'Shipping', count: 25 },
          { ch: 'T', name: 'Tanks', count: 100 },
          { ch: 'X', name: 'Nothing new', count: 400 },
        ],
        reserved: [{ ch: '!', label: 'SOS', name: 'MAYDAY', code: '11111' }],
        board: true,
        slots: true, // show the keyer's pattern board (the Kraft budget)
        keyer: true, // maxCode is the keyer's hard limit (wording)
        limit: 3100,
        par: { bits: 2990, full: true },
        maxCode: 5, // the keyer's hard limit
        preview: 'XXLTXIGXRA',
        burst: 10,
        unit: 'report',
        units: 'reports',
      },
      goal: '1000 reports in under 3100 flashes',
      objectives: [
        'HQ must read back every spotting report exactly.',
        'The whole burst must be shorter than 3100 flashes.',
        'The keyer holds codes of at most 5 flashes, and – – – – – is hard-wired to MAYDAY.',
      ],
      medalCaptions: ['Sector mission complete', 'Efficient · 2990 flashes or fewer', 'Lean · every keyer pattern in use'],
      briefing:
        'The reconnaissance flights report what they see in single letters: X for nothing new, L for lorries, T for tanks, and so on through twelve reports. A thousand of them come in each week. The aircraft send them on an automatic keyer, so there is no room for a wireless operator.\n\n' +
        'The keyer is the problem. It holds codes of at most 5 flashes, and its last pattern, five long flashes, is wired permanently to MAYDAY. The plotting table will happily draw you a tree six flashes deep; the keyer will not take it. Get the reports under 3100 flashes with every code on the keyer.',
      hints: [
        'Think of the keyer as 32 five-flash patterns. A code of length l takes up every pattern that starts with it, which is 2^(5−l) of them: 16 for one flash, 8 for two, 4 for three, 2 for four, 1 for five. MAYDAY holds one. You have 31 to share among twelve reports; watch the pattern board.',
        'Giving X a single flash eats 16 patterns, half the keyer. That leaves 15 for eleven reports, so nearly all of them end up five flashes deep. Two flashes for X (8 patterns) leaves room for lorries, tanks and infantry at 3 flashes and guns, rail and flak at 4. Spend every pattern.',
        'X = · ·;  L = · – ·,  T = · – –,  I = – · ·;  G = – · – ·,  R = – · – –,  A = – – · ·;  B = – – · – ·,  F = – – · – –,  S = – – – · ·,  D = – – – · –,  H = – – – – ·.  That is 2990 flashes.',
      ],
      debrief: {
        title: 'The Kraft Inequality',
        text:
          'A code of length l uses up 2^−l of the tree. A prefix-free code with given lengths exists exactly when those shares add up to at most 1. Leon Kraft proved it in his 1949 MIT master’s thesis, and Brockway McMillan showed in 1956 that no uniquely decodable code can do better. Your keyer turned the inequality into a budget of 32 patterns. Plain Huffman cannot respect a length cap. The best length-limited code comes from the package-merge algorithm (Larmore and Hirschberg, 1990), and real formats need it: DEFLATE caps its codes at 15 bits and JPEG at 16.',
      },
      enc: [],
      dec: [],
      solution: {
        state: {
          codes: { X: '00', L: '010', T: '011', I: '100', G: '1010', R: '1011', A: '1100', B: '11010', F: '11011', S: '11100', D: '11101', H: '11110' },
        },
      },
      anti: [
        { codes: { A: '0000', B: '0001', D: '0010', F: '0011', G: '0100', H: '0101', I: '0110', L: '0111', R: '1000', S: '1001', T: '1010', X: '1011' } }, // standard: 4000
        { codes: { X: '0', L: '100', T: '1010', I: '1011', G: '1100', R: '11010', A: '11011', B: '11100', F: '11101', S: '11110', D: '111110', H: '111111' } }, // plain Huffman: too long for the keyer
        { codes: { X: '0', L: '100', T: '101', I: '1100', G: '1101', R: '11100', A: '11101', B: '11110', F: '11111', S: '11000', D: '11001', H: '11010' } }, // squeezed in, but on top of MAYDAY and clashing
        { codes: { X: '00', L: '0100', T: '0101', I: '0110', G: '0111', R: '1000', A: '1001', B: '1010', F: '1011', S: '1100', D: '1101', H: '1110' } }, // X short, the rest flat: 3200
      ],
    },
  ];
  // app.js's briefing still counts the order template of every level; give it the raid alphabet so it
  // has one (the line panel is hidden for this mode, so it is never shown).
  for (const lv of LEVELS) lv.format = lv.format || [lv.compress.letters.map((l) => l.ch).join('')];
  // A level with several streams (e.g. dawn and night) counts each letter over all of them.
  for (const lv of LEVELS)
    if (lv.compress.streams)
      for (const l of lv.compress.letters) l.count = lv.compress.streams.reduce((a, s) => a + (s.counts[l.ch] || 0), 0);
  if (CoC.data && Array.isArray(CoC.data.LEVELS)) {
    for (const lv of LEVELS) if (!CoC.data.LEVELS.some((x) => x.id === lv.id)) CoC.data.LEVELS.push(lv);
  }

  // ================================================================ logic (DOM-free)
  const cfgOf = (level) => level.compress;
  const DOT = '·';
  const DASH = '–';
  const show = (bits) => [...(bits || '')].map((b) => (b === '0' ? DOT : DASH)).join('');
  const fmtAvg = (x) => String(+x.toFixed(3));
  const units1 = (cfg) => cfg.unit || 'letter';
  const unitsN = (cfg) => cfg.units || 'letters';
  const total = (cfg) => cfg.letters.reduce((a, l) => a + l.count, 0);

  // The symbols the card codes: single letters or, on a raid that issues the pair book, letter pairs.
  // Pair counts follow from the letter counts (the exercise log is built from exactly these pairs).
  function pairSyms(cfg) {
    if (cfg._pairs) return cfg._pairs;
    const n = total(cfg);
    const out = [];
    for (const a of cfg.letters)
      for (const b of cfg.letters)
        out.push({ ch: a.ch + b.ch, name: `${a.name} + ${b.name}`, count: (a.count * b.count) / (2 * n), pair: true });
    Object.defineProperty(cfg, '_pairs', { value: out, enumerable: false });
    return out;
  }
  const groupOf = (level, state) => (cfgOf(level).pairs && state && state.group === 2 ? 2 : 1);
  // Reserved codes (e.g. MAYDAY, hard-wired on the keyer) sit on the card with no traffic and a fixed code.
  function reservedSyms(cfg) {
    if (!cfg.reserved) return [];
    if (!cfg._reserved) Object.defineProperty(cfg, '_reserved', { value: cfg.reserved.map((r) => Object.assign({ count: 0, locked: true }, r)), enumerable: false });
    return cfg._reserved;
  }
  const symbolsOf = (level, state) =>
    groupOf(level, state) === 2 ? pairSyms(cfgOf(level)) : cfgOf(level).letters.concat(reservedSyms(cfgOf(level)));
  const labelOf = (s) => s.label || s.ch;
  const split = (msg, g) => (g === 1 ? [...msg] : msg.match(new RegExp(`.{1,${g}}`, 'g')) || []);

  function codesOf(level, state) {
    const codes = (state && state.codes) || {};
    return symbolsOf(level, state).map((l) => (l.locked ? l.code : String(codes[l.ch] || '').replace(/[^01]/g, '')));
  }

  // Problems with a codebook: letters with no code, identical codes, codes that sit on another's path.
  function check(syms, codes, cap = Infinity) {
    const L = syms.map((s) => Object.assign({}, s, { ch: labelOf(s) }));
    const empty = [];
    const long = [];
    codes.forEach((c, i) => c.length > cap && long.push(i));
    const clashes = []; // {a, b}: code a is a prefix of (or equal to) code b
    codes.forEach((c, i) => !c && empty.push(i));
    for (let i = 0; i < codes.length; i++)
      for (let j = 0; j < codes.length; j++) {
        if (i === j || !codes[i] || !codes[j]) continue;
        if (codes[i] === codes[j] ? i < j : codes[j].startsWith(codes[i])) clashes.push({ a: i, b: j, same: codes[i] === codes[j] });
      }
    const describe = () => {
      if (empty.length) return `${L[empty[0]].ch} has no code. The team cannot send it.`;
      if (long.length) return `${L[long[0]].ch} is ${codes[long[0]].length} flashes long. There is room for ${cap} at most.`;
      if (!clashes.length) return '';
      const { a, b, same } = clashes[0];
      return same
        ? `${L[a].ch} and ${L[b].ch} share the code ${show(codes[a])}. The field cannot tell them apart.`
        : `${L[a].ch} (${show(codes[a])}) sits on ${L[b].ch}’s path (${show(codes[b])}): the field writes ${L[a].ch} and never reaches ${L[b].ch}.`;
    };
    return { empty, long, clashes, invalid: empty.length > 0 || long.length > 0, ok: !empty.length && !long.length && !clashes.length, describe };
  }

  function stats(level, syms, codes) {
    const cfg = cfgOf(level);
    const n = total(cfg);
    const bits = syms.reduce((a, l, i) => a + l.count * codes[i].length, 0);
    const maxLen = Math.max(0, ...codes.map((c) => c.length));
    const entropy = cfg.letters.reduce((a, l) => a + (l.count / n) * Math.log2(n / l.count), 0);
    const fixedLen = Math.max(1, Math.ceil(Math.log2(cfg.letters.length)));
    const kraft = codes.reduce((a, c) => a + (c ? Math.pow(2, -c.length) : 0), 0);
    let streams = null;
    if (cfg.streams && !syms.some((x) => x.pair)) {
      const idx = Object.fromEntries(syms.map((x, i) => [x.ch, i]));
      streams = cfg.streams.map((st) => ({ name: st.name, bits: Object.entries(st.counts).reduce((a, [ch, c]) => a + c * (codes[idx[ch]] || '').length, 0) }));
    }
    return { n, bits, avg: bits / n, maxLen, entropy, floor: Math.ceil(entropy * n - 1e-9), fixed: fixedLen * n, kraft, streams };
  }

  // The field's reading: walk the tree; write a letter the moment the flashes spell one; '?' on a dead end.
  // Returns the letters written and, for animation, one event per flash.
  function decode(syms, codes, bits) {
    const L = syms;
    const book = new Map();
    const prefixes = new Set();
    codes.forEach((c, i) => {
      if (!c) return;
      if (!book.has(c)) book.set(c, i);
      for (let k = 1; k < c.length; k++) prefixes.add(c.slice(0, k));
    });
    const out = []; // {ch, from, to} (bit span, inclusive start / exclusive end)
    const events = [];
    let buf = '';
    let start = 0;
    for (let i = 0; i < bits.length; i++) {
      buf += bits[i];
      if (book.has(buf)) {
        out.push({ ch: L[book.get(buf)].ch, from: start, to: i + 1 });
        events.push({ i, buf, emit: L[book.get(buf)].ch });
        buf = '';
        start = i + 1;
      } else if (!prefixes.has(buf)) {
        out.push({ ch: '?', from: start, to: i + 1 });
        events.push({ i, buf, emit: '?' });
        buf = '';
        start = i + 1;
      } else events.push({ i, buf });
    }
    if (buf) out.push({ ch: '?', from: start, to: bits.length, cut: true });
    return { out, events, text: out.map((o) => o.ch).join('') };
  }

  function encode(syms, codes, units) {
    const idx = Object.fromEntries(syms.map((l, i) => [l.ch, i]));
    const spans = [];
    let bits = '';
    for (const ch of units) {
      const c = codes[idx[ch]] || '';
      spans.push({ ch, from: bits.length, to: bits.length + c.length });
      bits += c;
    }
    return { bits, spans };
  }

  const rngFor = (seed) => CoC.engine.makeRng(seed ?? (Date.now() ^ Math.floor(Math.random() * 1e9)));

  // The exercise log: exactly the intercepted counts, in a random order.
  function shuffled(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function makeMessage(level, rng) {
    const cfg = cfgOf(level);
    const fill = (pairs) => {
      const arr = [];
      for (const [ch, n] of pairs) for (let k = 0; k < n; k++) arr.push(ch);
      return shuffled(arr, rng).join('');
    };
    if (cfg.streams) return cfg.streams.map((st) => fill(Object.entries(st.counts))).join('');
    return fill((cfg.pairs ? pairSyms(cfg) : cfg.letters).map((l) => [l.ch, l.count]));
  }

  // A short random burst for TEST TRANSMISSION, drawn by the traffic shares.
  function makeBurst(level, rng, len) {
    const cfg = cfgOf(level);
    const n = total(cfg);
    let s = '';
    for (let k = 0; k < len; k++) {
      let r = rng.next() * n;
      const l = cfg.letters.find((x) => (r -= x.count) < 0) || cfg.letters[cfg.letters.length - 1];
      s += l.ch;
    }
    return s;
  }

  const groupLen = (cfg) => (cfg.pairs ? 6 : 5); // telegraph groups (whole pairs on a pair raid)

  function evaluate(level, state, opts = {}) {
    const cfg = cfgOf(level);
    const syms = symbolsOf(level, state);
    const g = groupOf(level, state);
    const codes = codesOf(level, state);
    const chk = check(syms, codes, cfg.maxCode);
    const st = stats(level, syms, codes);
    const gaugeMax = cfg.limit * 1.25;
    const capTxt = `lean medal: ≤ ${cfg.par.maxLen}`;
    if (chk.invalid) {
      const L = syms;
      return {
        passed: false,
        medals: [false, false, false],
        summary: chk.empty.length
          ? `${chk.empty.map((i) => L[i].ch).join(', ')} ${chk.empty.length === 1 ? 'has' : 'have'} no code. Every ${g === 2 ? 'pair' : 'letter'} needs one.`
          : chk.describe(),
        gauges: [
          { frac: 0, text: '—', ok: false },
          { frac: 0, text: '—', ok: false },
        ],
        log: chk.empty
          .map((i) => ({ ok: false, text: `${L[i].ch} (${L[i].name}): no code on the card` }))
          .concat(chk.long.map((i) => ({ ok: false, text: `${L[i].ch}: ${codes[i].length} flashes, room for ${cfg.maxCode}` }))),
        stats: [
          { label: 'Flashes sent', value: '—', note: `limit: under ${cfg.limit}` },
          { label: `Per ${units1(cfg)}`, value: '—', note: `floor ${st.entropy.toFixed(2)}` },
          { label: cfg.par.full ? 'Keyer patterns' : 'Longest code', value: '—', note: cfg.par.full ? 'lean medal: all in use' : capTxt },
        ],
      };
    }
    const rng = rngFor(opts.seed);
    const msg = makeMessage(level, rng);
    const units = split(msg, g);
    const { bits } = encode(syms, codes, units);
    const dec = decode(syms, codes, bits);
    let right = 0;
    for (let i = 0; i < units.length; i++) if (dec.out[i] && dec.out[i].ch === units[i]) right++;
    const intact = dec.text === msg;
    const acc = right / units.length;
    const unitName = g === 2 ? 'pairs' : unitsN(cfg);
    const short = bits.length < cfg.limit;
    const passed = intact && short;
    const lean = cfg.par.full ? Math.abs(st.kraft - 1) < 1e-9 : st.maxLen <= cfg.par.maxLen;
    const medals = [passed, passed && bits.length <= cfg.par.bits, passed && lean];

    // Teletype: the first groups, then the first few that went wrong. Each group can be replayed.
    const groups = [];
    const GL = groupLen(cfg);
    for (let k = 0; k < msg.length; k += GL) groups.push(msg.slice(k, k + GL));
    const line = (grp) => {
      const e = encode(syms, codes, split(grp, g));
      const d = decode(syms, codes, e.bits);
      return { ok: d.text === grp, text: `${grp} → ${d.text}`, data: { msg: grp } };
    };
    const log = [{ text: `${msg.length} ${unitsN(cfg)}, ${bits.length} flashes` }];
    if (st.streams) log.push({ text: st.streams.map((x) => `${x.name} ${x.bits}`).join(' · ') });
    const shown = groups.slice(0, 6).map(line);
    log.push(...shown);
    const bad = [];
    for (let k = 6; k < groups.length && bad.length < 4; k++) {
      const l = line(groups[k]);
      if (!l.ok) bad.push(Object.assign(l, { text: `#${k + 1}  ${l.text}` }));
    }
    if (!intact) log.push({ ok: false, text: `${right}/${units.length} ${unitName} read right` }, ...bad);
    log.push(
      short
        ? { ok: true, text: `Off the air before a DF fix` }
        : { ok: false, text: `DF fix at flash ${cfg.limit}` }
    );

    const reasons = [];
    if (!intact) reasons.push(chk.clashes.length ? chk.describe() : `the field read ${units.length - right} ${unitName} wrong`);
    if (!short) reasons.push(`${bits.length} flashes: ${bits.length - cfg.limit + 1} too many, and the DF vans get a fix`);
    return {
      passed,
      medals,
      summary: passed
        ? `${msg.length} ${unitsN(cfg)} in ${bits.length} flashes (${fmtAvg(st.avg)} per ${units1(cfg)}), read back intact`
        : reasons.join(' · '),
      gauges: [
        { frac: bits.length / gaugeMax, text: String(bits.length), ok: short },
        { frac: acc, text: (acc * 100).toFixed(acc === 1 ? 0 : 1) + '%', ok: intact },
      ],
      log,
      stats: [
        { label: 'Flashes sent', value: String(bits.length), note: `limit: under ${cfg.limit}` },
        { label: `Per ${units1(cfg)}`, value: st.avg.toFixed(3), note: `entropy floor ${st.entropy.toFixed(3)}` },
        cfg.par.full
          ? { label: 'Keyer patterns', value: `${Math.round(st.kraft * 2 ** cfg.maxCode)} / ${2 ** cfg.maxCode}`, note: 'lean medal: all in use' }
          : { label: 'Longest code', value: `${st.maxLen} flash${st.maxLen === 1 ? '' : 'es'}`, note: capTxt },
      ],
    };
  }

  // Command's standard book: every symbol the same length. A pair raid starts on single letters.
  function defaultState(level) {
    const cfg = cfgOf(level);
    const fixed = (syms) => {
      const w = Math.max(1, Math.ceil(Math.log2(syms.length)));
      return syms.map((l, i) => [l.ch, i.toString(2).padStart(w, '0')]);
    };
    const codes = Object.fromEntries([...fixed(cfg.letters), ...(cfg.pairs ? fixed(pairSyms(cfg)) : [])]);
    return cfg.pairs ? { group: 1, codes } : { codes };
  }

  // The plotting table: units start as the card's symbols; each merge pairs two units into a squad.
  // Returns the units still on the table and every symbol's depth (one flash per merge it went through).
  function boardTree(syms, merges) {
    const units = syms.map((s, i) => ({ id: i, members: [i], count: s.count, label: labelOf(s) }));
    const live = new Set(units.map((u) => u.id));
    const depth = syms.map(() => 0);
    for (const [a, b] of merges || []) {
      if (!live.has(a) || !live.has(b) || a === b) break;
      const A = units[a], B = units[b];
      const members = A.members.concat(B.members);
      members.forEach((m) => depth[m]++);
      units.push({ id: units.length, members, count: A.count + B.count, label: '', kids: [a, b] });
      live.delete(a);
      live.delete(b);
      live.add(units.length - 1);
    }
    for (const u of units) if (!u.label) u.label = u.members.slice().sort((x, y) => x - y).map((m) => labelOf(syms[m])).join('');
    return { units, live: [...live].map((id) => units[id]), depth };
  }

  // Canonical code from lengths (as DEFLATE does): shortest first, in card order; locked symbols last
  // within their length so a hard-wired all-long code like MAYDAY lands where it belongs.
  function canonical(syms, lens) {
    const order = syms.map((s, i) => i).sort((a, b) => lens[a] - lens[b] || (syms[a].locked ? 1 : 0) - (syms[b].locked ? 1 : 0) || a - b);
    const out = syms.map(() => '');
    let code = 0;
    let prev = lens[order[0]];
    order.forEach((i, k) => {
      if (k > 0) {
        code = (code + 1) << (lens[i] - prev);
        prev = lens[i];
      }
      out[i] = code.toString(2).padStart(lens[i], '0');
    });
    return out;
  }

  // ================================================================ UI
  let live = null; // the mounted controller (test() animates through it)

  const SVGNS = 'http://www.w3.org/2000/svg';

  function treeModel(codes) {
    const mk = (path) => ({ path, kids: [null, null], letters: [] });
    const root = mk('');
    codes.forEach((c, i) => {
      if (!c) return;
      let n = root;
      for (const b of c) n = n.kids[+b] || (n.kids[+b] = mk(n.path + b));
      n.letters.push(i);
    });
    const nodes = [];
    let leaves = 0;
    let depth = 0;
    (function walk(n, d, blocked) {
      n.d = d;
      n.blocked = blocked; // below a letter: the field never gets here
      depth = Math.max(depth, d);
      if (n.kids[0] || n.kids[1]) {
        for (const k of [0, 1]) if (!n.kids[k]) n.kids[k] = Object.assign(mk(n.path + k), { ghost: true });
        const under = blocked || n.letters.length > 0;
        walk(n.kids[0], d + 1, under);
        walk(n.kids[1], d + 1, under);
        n.x = (n.kids[0].x + n.kids[1].x) / 2;
      } else n.x = leaves++;
      nodes.push(n);
    })(root, 0, false);
    return { root, nodes, leaves, depth };
  }

  function mount(root, api) {
    const level = api.level;
    const cfg = cfgOf(level);
    const N = total(cfg);
    // The rows on the card: letters, or letter pairs once the pair book is in use.
    let L = cfg.letters;
    let symTotal = N;
    let maxShare = 1;
    let group = 1;
    function refreshSyms() {
      const st = api.getState();
      group = groupOf(level, st);
      L = symbolsOf(level, st);
      symTotal = L.reduce((a, l) => a + l.count, 0);
      maxShare = Math.max(...L.map((l) => l.count)) / symTotal;
    }
    refreshSyms();
    const streamMax = cfg.streams ? Math.max(...cfg.streams.flatMap((st) => Object.values(st.counts))) : 1;
    let sel = 0;
    let picked = null; // plotting table: the first unit picked
    let token = 0; // animation token
    let walkPath = null; // tree path highlighted during an animation

    const getCodes = () => codesOf(level, api.getState());
    function setCode(i, code) {
      const st = api.getState() || defaultState(level);
      const codes = Object.assign({}, st.codes);
      codes[L[i].ch] = code;
      api.setState(Object.assign({}, st, { codes }));
      api.changed();
      cancelAnim();
      render();
    }

    // Console labels for this mode (restored on destroy).
    const relabel = [
      ['#btn-test small', 'watch one burst'],
      ['#btn-exercise small', `× ${N} ${unitsN(cfg)}`],
      ['#console-idle', `Run a field exercise: the team keys all ${N} ${unitsN(cfg)} and the field reads them back. Results print here.`],
    ].map(([q, t]) => {
      const el = document.querySelector(q);
      if (!el) return null;
      const old = el.textContent;
      el.textContent = t;
      return () => (el.textContent = old);
    });

    // The code analyzer belongs to the strip levels; app.js only hides it when a strip level opens.
    const analyzer = document.getElementById('analyzer');
    if (analyzer) analyzer.hidden = true;

    root.innerHTML = `
      <div class="cz">
        <section class="cz-signal" aria-label="Signal">
          <div class="cz-sig-head">
            <span class="cz-label" data-k="siglabel">Sample burst</span>
            <span class="cz-legend"><i class="cz-dot"></i> short <i class="cz-dash"></i> long <em>each one flash</em></span>
            <button type="button" class="btn-chip cz-skip" data-k="skip" hidden>Skip ▸▸</button>
          </div>
          <div class="cz-tape-wrap"><div class="cz-tape" data-k="tape"></div></div>
          <div class="cz-sig-note" data-k="signote"></div>
          <div class="cz-stamp" data-k="stamp"></div>
        </section>

        <section class="cz-status" aria-label="Burst length">
          <div class="cz-df" data-k="df" title="Enemy direction-finding vans: their bearings creep in as the burst runs long"></div>
          <div class="cz-meter">
            <div class="cz-meter-top"><span class="cz-label">Burst for all ${N} ${unitsN(cfg)}</span><b data-k="bits"></b></div>
            <div class="cz-bar" data-k="bar"><div class="cz-fill" data-k="fill"></div><div class="cz-tick limit" data-k="tlimit"><span>DF fix ${cfg.limit}</span></div><div class="cz-tick floor" data-k="tfloor" title="Shannon’s floor: no code can go below this"></div></div>
            <div class="cz-meter-bot"><span data-k="risk"></span><span data-k="avg"></span></div>
            ${cfg.streams ? '<div class="cz-meter-streams" data-k="streams"></div>' : ''}
          </div>
        </section>

        <div class="cz-main">
          <section class="cz-book" aria-label="Codebook">
            <header class="cz-head">
              <div><h2>Codebook card</h2><span class="cz-sub">Click a letter, then key its flashes (or type · - ⌫)</span></div>
              <div class="cz-head-btns">
                ${cfg.pairs ? `<span class="cz-group" role="group" aria-label="What each code stands for"><button type="button" class="btn-chip" data-k="g1" title="One code per letter">Letters</button><button type="button" class="btn-chip" data-k="g2" title="One code per two-letter group: the pair book">Pairs</button></span>` : ''}
                <button type="button" class="btn-chip" data-k="std" title="Back to Command’s standard book">↺ Standard</button>
                <button type="button" class="btn-chip" data-k="clear" title="Wipe every code">Clear</button>
              </div>
            </header>
            <div class="cz-rows" data-k="rows" role="list"></div>
            <div class="cz-warn" data-k="warn" role="status"></div>
          </section>
          <section class="cz-treebox" aria-label="Code tree">
            ${cfg.board ? `<div class="cz-board" aria-label="Plotting table">
              <header class="cz-head"><div><h2>Plotting table</h2><span class="cz-sub">Pick two units to pair them into a squad. Each pairing adds a flash to everyone inside.</span></div>
                <div class="cz-head-btns"><button type="button" class="btn-chip" data-k="bundo">Undo</button><button type="button" class="btn-chip" data-k="bclear">Clear</button></div></header>
              <div class="cz-units" data-k="units"></div>
              <div class="cz-board-foot"><span data-k="bnote"></span><button type="button" class="btn-chip cz-write" data-k="bwrite" disabled>Write the card ▸</button></div>
            </div>` : ''}
            <header class="cz-head">
              <div><h2>Code tree</h2><span class="cz-sub">The field starts at the top: · goes left, – goes right. It writes a letter as soon as it lands on one.</span></div>
            </header>
            <div class="cz-tree" data-k="tree"></div>
            ${cfg.slots ? `<div class="cz-slots-box"><div class="cz-slots-head"><span class="cz-label">Keyer patterns · ${2 ** cfg.maxCode} of ${cfg.maxCode} flashes</span><span data-k="slotsum"></span></div><div class="cz-slots" data-k="slots"></div></div>` : ''}
          </section>
        </div>
      </div>`;
    const $ = (k) => root.querySelector(`[data-k="${k}"]`);

    // ---------------------------------------------------------------- codebook rows
    function renderRows(codes, chk) {
      const bad = new Set();
      chk.empty.forEach((i) => bad.add(i));
      chk.clashes.forEach((c) => (bad.add(c.a), bad.add(c.b)));
      $('rows').innerHTML = L.map((l, i) => {
        const c = codes[i];
        const share = l.count / symTotal;
        const lamps = c
          ? l.locked
            ? [...c].map((b) => `<span class="cz-lamp ${b === '0' ? 'dot' : 'dash'}"></span>`).join('')
            : [...c].map((b, k) => `<button type="button" class="cz-lamp ${b === '0' ? 'dot' : 'dash'}" data-flip="${i}:${k}" title="Flip this flash" aria-label="${b === '0' ? 'short' : 'long'} flash, click to flip"></button>`).join('')
          : '<span class="cz-none">no code</span>';
        const shareHTML = l.locked
          ? '<div class="cz-share"><span class="cz-wired">hard-wired</span></div>'
          : cfg.streams && !l.pair
            ? `<div class="cz-share cz-streams">${cfg.streams
                .map((st, k) => `<div class="cz-st s${k}" title="${api.esc(st.name)}: ${st.counts[l.ch] || 0}"><em>${api.esc(st.name.slice(0, 1))}</em><div class="cz-sbar"><i style="width:${(((st.counts[l.ch] || 0) / streamMax) * 100).toFixed(1)}%"></i></div><span>${st.counts[l.ch] || 0}</span></div>`)
                .join('')}</div>`
            : `<div class="cz-share"><div class="cz-sbar"><i style="width:${((share / maxShare) * 100).toFixed(1)}%"></i></div><span>${(share * 100).toFixed(share * 100 < 10 ? 1 : 0)}%<em> · ${l.count}</em></span></div>`;
        if (l.locked)
          return `<div class="cz-row locked" role="listitem" data-row="${i}">
          <div class="cz-letter wired"><b>${labelOf(l)}</b><small>${api.esc(l.name)}</small></div>
          ${shareHTML}
          <div class="cz-code">${lamps}</div>
          <div class="cz-keys"><span class="cz-lock" title="Hard-wired on the keyer">⚿</span></div>
          <div class="cz-cost"><span>no traffic</span><b>0</b></div>
        </div>`;
        return `<div class="cz-row ${i === sel ? 'sel' : ''} ${bad.has(i) ? 'bad' : ''}" role="listitem" data-row="${i}">
          <button type="button" class="cz-letter ${l.pair ? 'pair' : ''}" data-sel="${i}" aria-label="Select ${l.ch}, ${api.esc(l.name)}"><b>${l.ch}</b><small>${l.pair ? 'pair' : api.esc(l.name)}</small></button>
          ${shareHTML}
          <div class="cz-code" data-sel="${i}">${lamps}</div>
          <div class="cz-keys">
            <button type="button" class="cz-key" data-add="${i}:0" aria-label="Add a short flash to ${l.ch}" title="Add a short flash (·)"><i class="cz-dot"></i></button>
            <button type="button" class="cz-key" data-add="${i}:1" aria-label="Add a long flash to ${l.ch}" title="Add a long flash (–)"><i class="cz-dash"></i></button>
            <button type="button" class="cz-key del" data-del="${i}" aria-label="Remove the last flash of ${l.ch}" title="Remove the last flash" ${c ? '' : 'disabled'}>⌫</button>
          </div>
          <div class="cz-cost"><span>${c.length}×${l.count}</span><b>${c.length * l.count}</b></div>
        </div>`;
      }).join('');
      $('warn').textContent = chk.describe();
      $('warn').classList.toggle('on', !chk.ok);
    }

    // ---------------------------------------------------------------- status: burst bar + DF vans
    function renderStatus(codes, chk) {
      const st = stats(level, L, codes);
      const scale = Math.max(st.fixed, cfg.limit, st.bits) * 1.06;
      const pct = (v) => `${Math.min(100, (v / scale) * 100).toFixed(2)}%`;
      const over = st.bits >= cfg.limit;
      $('fill').style.width = pct(st.bits);
      $('fill').className = 'cz-fill ' + (over ? 'over' : st.bits <= cfg.par.bits ? 'best' : 'ok');
      $('tlimit').style.left = pct(cfg.limit);
      $('tfloor').style.left = pct(st.entropy * N);
      $('bits').innerHTML = `${st.bits}<small> flashes</small>`;
      $('bits').className = over ? 'over' : 'ok';
      $('avg').innerHTML = `<b>${st.avg.toFixed(3)}</b> per ${units1(cfg)}${chk.empty.length ? ' <em>(incomplete)</em>' : ''} <span class="cz-floor">· floor ${st.entropy.toFixed(3)}</span>`;
      if (st.streams && $('streams'))
        $('streams').innerHTML = st.streams.map((x, k) => `<span class="s${k}"><i></i>${api.esc(x.name)} broadcast <b>${x.bits}</b></span>`).join('');
      const e = st.bits / cfg.limit;
      $('risk').innerHTML = over
        ? '<b class="bad">FIX: the vans have the hide</b>'
        : e > 0.9
          ? `<b class="warn">Bearings closing</b> · ${cfg.limit - st.bits} flashes to spare`
          : `<b class="ok">Quiet</b> · ${cfg.limit - st.bits} flashes to spare`;
      $('df').innerHTML = dfSVG(e);
    }

    function dfSVG(e) {
      const cx = 60, cy = 42;
      const vans = [[10, 10], [112, 16], [24, 76]];
      const reach = Math.min(1, e); // how far the bearings have crept in
      const fix = e >= 1;
      const spread = fix ? 2.5 : 4 + 26 * Math.max(0, 1 - e);
      let g = '';
      for (const [x, y] of vans) {
        const a = Math.atan2(cy - y, cx - x);
        const d = Math.hypot(cx - x, cy - y) * (0.25 + 0.85 * reach);
        const s = (spread * Math.PI) / 180;
        const p1 = [x + Math.cos(a - s) * d, y + Math.sin(a - s) * d];
        const p2 = [x + Math.cos(a + s) * d, y + Math.sin(a + s) * d];
        g += `<path class="wedge" d="M${x} ${y} L${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}Z"/>`;
        g += `<line class="bearing" x1="${x}" y1="${y}" x2="${(x + Math.cos(a) * d).toFixed(1)}" y2="${(y + Math.sin(a) * d).toFixed(1)}"/>`;
        g += `<g class="van" transform="translate(${x - 6} ${y - 4})"><rect width="12" height="7" rx="1.5"/><circle cx="3" cy="8" r="1.6"/><circle cx="9" cy="8" r="1.6"/><line x1="6" y1="0" x2="6" y2="-4"/></g>`;
      }
      return `<svg viewBox="0 0 124 86" class="cz-dfsvg ${fix ? 'fix' : e > 0.9 ? 'close' : ''}" role="img" aria-label="Direction-finding risk ${fix ? 'fix obtained' : Math.round(e * 100) + ' percent'}">
        <rect class="map" x="1" y="1" width="122" height="84" rx="4"/>
        <path class="contour" d="M8 60 C30 50 40 70 70 62 S110 48 118 58 M14 30 C34 22 50 34 78 26 S104 20 116 30"/>
        ${g}
        <g class="hide"><circle cx="${cx}" cy="${cy}" r="3.2"/><line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 9}"/><path d="M${cx - 4} ${cy - 7} L${cx} ${cy - 9} L${cx + 4} ${cy - 7}"/></g>
        ${fix ? `<circle class="fixring" cx="${cx}" cy="${cy}" r="9"/><text class="fixtxt" x="${cx}" y="${cy + 21}">FIX</text>` : ''}
      </svg>`;
    }

    // ---------------------------------------------------------------- the tree
    function renderTree(codes) {
      const T = treeModel(codes);
      const slot = 44, row = 48, padX = 30, padY = 22;
      const W = Math.max(1, T.leaves) * slot + padX + 8;
      const H = T.depth * row + padY * 2 + 6;
      const X = (n) => padX + n.x * slot + slot / 2;
      const Y = (n) => padY + n.d * row;
      const selPath = codes[sel] || '';
      let edges = '';
      let marks = '';
      let nodes = '';
      for (let d = 1; d <= T.depth; d++)
        marks += `<text class="depth" x="4" y="${padY + d * row + 4}">${d}</text><line class="depth-rule" x1="${padX - 6}" y1="${padY + d * row}" x2="${W - 4}" y2="${padY + d * row}"/>`;
      for (const n of T.nodes) {
        for (const k of [0, 1]) {
          const c = n.kids[k];
          if (!c) continue;
          const cls = ['edge', k ? 'dash' : 'dot'];
          if (c.ghost) cls.push('ghost');
          if (c.blocked) cls.push('blocked');
          if (selPath.startsWith(c.path) && selPath) cls.push('selpath');
          const mx = (X(n) + X(c)) / 2, my = (Y(n) + Y(c)) / 2;
          edges += `<line class="${cls.join(' ')}" data-p="${c.path}" x1="${X(n)}" y1="${Y(n)}" x2="${X(c)}" y2="${Y(c)}"/>`;
          if (!c.ghost) edges += k ? `<rect class="emark" x="${mx - 4.5}" y="${my - 1.5}" width="9" height="3" rx="1.5"/>` : `<circle class="emark" cx="${mx}" cy="${my}" r="2.2"/>`;
        }
      }
      for (const n of T.nodes) {
        const x = X(n), y = Y(n);
        if (n.letters.length) {
          const i = n.letters[0];
          const clash = n.letters.length > 1 || n.kids[0] || n.blocked;
          const cls = `leaf ${clash ? 'clash' : ''} ${n.letters.includes(sel) ? 'sel' : ''} ${L[i].locked ? 'wired' : ''}`;
          const heat = L[i].count / symTotal / maxShare;
          nodes += `<g class="${cls}" data-p="${n.path}" data-sel="${i}" role="button" tabindex="-1" aria-label="${labelOf(L[i])}: ${show(n.path)}">
            <circle cx="${x}" cy="${y}" r="15" style="--heat:${heat.toFixed(2)}"/><text class="${labelOf(L[i]).length > 1 ? 'pair' : ''}" x="${x}" y="${y + (labelOf(L[i]).length > 1 ? 4 : 5)}">${n.letters.map((j) => labelOf(L[j])).join('')}</text></g>`;
        } else if (n.ghost) {
          nodes += `<g class="ghost-node" data-p="${n.path}" data-ghost="${n.path}" role="button" aria-label="Unused branch ${show(n.path)}"><title>Unused branch ${show(n.path)}: wasted signal space. Click to give it to ${labelOf(L[sel])}.</title><circle cx="${x}" cy="${y}" r="7"/></g>`;
        } else {
          nodes += `<g class="inner ${n.path === '' ? 'root' : ''}" data-p="${n.path}"><circle cx="${x}" cy="${y}" r="${n.path === '' ? 6 : 4}"/></g>`;
        }
      }
      // Letters with no code yet have no place on the tree: list them so they never just vanish.
      const unplaced = L.map((l, i) => (codes[i] ? null : i)).filter((i) => i !== null);
      const tray = unplaced.length
        ? `<div class="cz-unplaced">Not on the tree yet: ${unplaced.map((i) => `<button type="button" class="cz-chip ${i === sel ? 'sel' : ''}" data-sel="${i}">${L[i].ch}</button>`).join('')}</div>`
        : '';
      $('tree').innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="cz-svg" role="img" aria-label="Code tree">
        ${marks}<text class="depth head" x="4" y="${padY - 8}">flashes</text>${edges}${nodes}</svg>${tray}`;
      highlightWalk();
    }

    function highlightWalk() {
      const svg = $('tree').querySelector('svg');
      if (!svg) return;
      svg.querySelectorAll('[data-p]').forEach((el) => {
        const p = el.getAttribute('data-p');
        el.classList.toggle('walk', walkPath !== null && walkPath.startsWith(p) && (p !== '' || el.tagName === 'g'));
      });
    }

    // ---------------------------------------------------------------- the signal tape
    // Three aligned rows on a grid of flash cells: letters sent, the flashes, letters read back.
    function renderTape(msg, codes, opts = {}) {
      const units = split(msg, group);
      const enc = encode(L, codes, units);
      const dec = decode(L, codes, enc.bits);
      const nb = Math.max(1, enc.bits.length);
      const cells = [...enc.bits]
        .map((b, k) => `<div class="cz-cell ${b === '0' ? 'dot' : 'dash'} ${opts.hide ? '' : 'on'}" data-bit="${k}" style="grid-column:${k + 1}"><i></i></div>`)
        .join('');
      const sent = enc.spans
        .map((s, k) =>
          s.to > s.from
            ? `<div class="cz-sent ${s.ch.length > 1 ? 'pair' : ''}" data-sent="${k}" style="grid-column:${s.from + 1} / ${s.to + 1}"><b>${s.ch}</b></div>`
            : ''
        )
        .join('');
      const back = dec.out
        .map((o, k) => {
          const ok = o.ch === units[k];
          return `<div class="cz-back ${ok ? 'ok' : 'bad'} ${o.ch.length > 1 ? 'pair' : ''} ${opts.hide ? 'pending' : ''}" data-back="${k}" style="grid-column:${o.from + 1} / ${o.to + 1}"><b>${o.ch}</b></div>`;
        })
        .join('');
      $('tape').style.setProperty('--n', nb);
      $('tape').innerHTML = `<div class="cz-grid">${sent}${cells}${back}</div>`;
      const intact = dec.text === msg;
      return { enc, dec, intact, units };
    }

    function previewNote(res, msg) {
      const n = $('signote');
      if (!res.enc.bits.length) {
        n.className = 'cz-sig-note bad';
        n.textContent = 'No codes on the card yet.';
        return;
      }
      n.className = 'cz-sig-note ' + (res.intact ? 'good' : 'bad');
      n.textContent = res.intact
        ? `${msg.length} ${unitsN(cfg)} in ${res.enc.bits.length} flashes. The field reads it back intact.`
        : `The field reads “${res.dec.text}”. That is not what was sent.`;
    }

    function render() {
      refreshSyms();
      const codes = getCodes();
      const chk = check(L, codes, cfg.maxCode);
      if (sel >= L.length) sel = 0;
      root.querySelectorAll('[data-k="g1"],[data-k="g2"]').forEach((b) => b.classList.toggle('on', b.dataset.k === 'g' + group));
      renderRows(codes, chk);
      renderStatus(codes, chk);
      renderTree(codes);
      if (cfg.board) renderBoard();
      if (cfg.slots) renderSlots(codes, chk);
      if (!animating) {
        $('siglabel').textContent = 'Sample burst';
        const res = renderTape(cfg.preview, codes);
        previewNote(res, cfg.preview);
        $('stamp').innerHTML = '';
      }
    }

    // ---------------------------------------------------------------- the plotting table
    const merges = () => ((api.getState() || {}).board || []).slice();
    function setMerges(m) {
      api.setState(Object.assign({}, api.getState(), { board: m }));
      api.changed();
    }
    function renderBoard() {
      const bt = boardTree(L, merges());
      const units = bt.live.slice().sort((a, b) => b.count - a.count || a.id - b.id);
      if (picked !== null && !bt.live.some((u) => u.id === picked)) picked = null;
      $('units').innerHTML = units
        .map((u) => {
          const lab = u.label.length > 7 ? u.label.slice(0, 6) + '…' : u.label;
          return `<button type="button" class="cz-unit ${u.members.length > 1 ? 'squad' : ''} ${picked === u.id ? 'picked' : ''}" data-unit="${u.id}" title="${api.esc(u.label)}: ${u.count}"><b>${api.esc(lab)}</b><span>${u.count}</span></button>`;
        })
        .join('');
      const done = bt.live.length === 1;
      $('bwrite').disabled = !done;
      $('bwrite').classList.toggle('on', done);
      $('bnote').textContent = done
        ? 'One unit left: the tree is complete.'
        : picked !== null
          ? `Paired with what? Pick a second unit.`
          : `${bt.live.length} units on the table.`;
    }
    function writeCard() {
      const bt = boardTree(L, merges());
      if (bt.live.length !== 1) return;
      const lens = bt.depth;
      const tooLong = L.findIndex((l, i) => lens[i] > cfg.maxCode);
      if (tooLong >= 0)
        return api.toast(`Your tree puts ${labelOf(L[tooLong])} ${lens[tooLong]} flashes deep. ${roomMsg()}`, 'bad'), api.sfx.fail();
      const wired = L.findIndex((l, i) => l.locked && lens[i] !== l.code.length);
      if (wired >= 0)
        return api.toast(`${L[wired].name} must sit ${L[wired].code.length} flashes deep (${show(L[wired].code)}); your tree puts it at ${lens[wired]}.`, 'bad'), api.sfx.fail();
      const codes = canonical(L, lens);
      const bad = L.findIndex((l, i) => l.locked && codes[i] !== l.code);
      if (bad >= 0) return api.toast(`${L[bad].name} could not keep ${show(L[bad].code)} with this tree.`, 'bad'), api.sfx.fail();
      const st = api.getState() || defaultState(level);
      const next = Object.assign({}, st.codes);
      L.forEach((l, i) => !l.locked && (next[l.ch] = codes[i]));
      api.setState(Object.assign({}, st, { codes: next }));
      api.changed();
      cancelAnim();
      api.sfx.stamp();
      render();
    }

    // ---------------------------------------------------------------- the keyer's pattern board (Kraft)
    function renderSlots(codes, chk) {
      const K = cfg.maxCode;
      const W = 2 ** K;
      const owners = Array.from({ length: W }, () => []);
      const segs = [];
      codes.forEach((c, i) => {
        if (!c || c.length > K) return;
        const span = 2 ** (K - c.length);
        const start = parseInt(c, 2) * span;
        for (let k = start; k < start + span; k++) owners[k].push(i);
        segs.push({ i, start, span });
      });
      const clashCells = owners.filter((o) => o.length > 1).length;
      const used = owners.filter((o) => o.length).length;
      const cells = owners.map((o, k) => `<div class="cz-slot ${o.length ? '' : 'free'} ${o.length > 1 ? 'clash' : ''}" style="grid-column:${k + 1}"></div>`).join('');
      const labels = segs
        .map(({ i, start, span }) => {
          const clash = owners.slice(start, start + span).some((o) => o.length > 1);
          return `<div class="cz-seg ${L[i].locked ? 'wired' : ''} ${clash ? 'clash' : ''} ${i === sel ? 'sel' : ''}" style="grid-column:${start + 1} / span ${span}" title="${api.esc(labelOf(L[i]))}: ${show(codes[i])} takes ${span} pattern${span === 1 ? '' : 's'}"><b>${labelOf(L[i])}</b>${span >= 4 ? `<span>${span}</span>` : ''}</div>`;
        })
        .join('');
      $('slots').style.setProperty('--w', W);
      $('slots').innerHTML = `<div class="cz-slot-grid">${labels}${cells}</div>`;
      $('slotsum').innerHTML = clashCells
        ? `<b class="bad">${clashCells} pattern${clashCells === 1 ? '' : 's'} claimed twice</b>`
        : `<b class="${used === W ? 'ok' : 'warn'}">${used}/${W} in use</b>${used < W ? ` · ${W - used} wasted` : ''}`;
    }

    // ---------------------------------------------------------------- input
    const roomMsg = () => (cfg.keyer ? `The keyer holds codes of at most ${cfg.maxCode} flashes.` : `The card has room for ${cfg.maxCode} flashes per code.`);
    const lockedMsg = (l) => `${l.name} is hard-wired to ${show(l.code)}.`;
    function edit(i, fn) {
      if (L[i].locked) return api.toast(lockedMsg(L[i]), 'bad');
      const c = getCodes()[i];
      const next = fn(c);
      if (next === null || next === c) return;
      if (next.length > cfg.maxCode) {
        api.toast(roomMsg(), 'bad');
        return;
      }
      setCode(i, next);
    }
    const addBit = (i, b) => (edit(i, (c) => c + b), api.sfx.morse(b === '0' ? 'E' : 'T'));
    const delBit = (i) => (edit(i, (c) => (c ? c.slice(0, -1) : null)), api.sfx.remove());
    function select(i) {
      if (i === sel) return;
      sel = i;
      api.sfx.click();
      render();
    }

    const onClick = (e) => {
      const t = e.target.closest('[data-add],[data-del],[data-flip],[data-sel],[data-ghost],[data-unit],[data-k]');
      if (!t || !root.contains(t)) return;
      if (t.dataset.unit !== undefined) {
        const id = +t.dataset.unit;
        if (picked === null) picked = id;
        else if (picked === id) picked = null;
        else {
          setMerges(merges().concat([[picked, id]]));
          picked = null;
          api.sfx.place();
        }
        api.sfx.click();
        return renderBoard();
      }
      if (t.dataset.k === 'bundo') {
        picked = null;
        setMerges(merges().slice(0, -1));
        api.sfx.remove();
        return renderBoard();
      }
      if (t.dataset.k === 'bclear') {
        picked = null;
        setMerges([]);
        api.sfx.remove();
        return renderBoard();
      }
      if (t.dataset.k === 'bwrite') return writeCard();
      if (t.dataset.add) {
        const [i, b] = t.dataset.add.split(':');
        sel = +i;
        addBit(+i, b);
      } else if (t.dataset.del !== undefined) {
        sel = +t.dataset.del;
        delBit(+t.dataset.del);
      } else if (t.dataset.flip) {
        const [i, k] = t.dataset.flip.split(':').map(Number);
        sel = i;
        edit(i, (c) => c.slice(0, k) + (c[k] === '0' ? '1' : '0') + c.slice(k + 1));
        api.sfx.place();
      } else if (t.dataset.ghost !== undefined) {
        const p = t.dataset.ghost;
        if (p.length > cfg.maxCode) return api.toast(roomMsg(), 'bad');
        if (L[sel].locked) return api.toast(lockedMsg(L[sel]), 'bad');
        setCode(sel, p);
        api.sfx.place();
      } else if (t.dataset.sel !== undefined) select(+t.dataset.sel);
      else if (t.dataset.k === 'g1' || t.dataset.k === 'g2') {
        const g = t.dataset.k === 'g2' ? 2 : 1;
        if (g === group) return;
        api.setState(Object.assign({}, api.getState(), { group: g }));
        api.changed();
        cancelAnim();
        sel = 0;
        api.sfx.place();
        render();
      } else if (t.dataset.k === 'std') {
        api.setState(Object.assign(defaultState(level), cfg.pairs ? { group } : {}, (api.getState() || {}).board ? { board: api.getState().board } : {}));
        api.changed();
        cancelAnim();
        api.sfx.remove();
        render();
      } else if (t.dataset.k === 'clear') {
        const st = api.getState() || defaultState(level);
        api.setState(Object.assign({}, st, { codes: Object.assign({}, st.codes, Object.fromEntries(L.filter((l) => !l.locked).map((l) => [l.ch, '']))) }));
        api.changed();
        cancelAnim();
        api.sfx.remove();
        render();
      } else if (t.dataset.k === 'skip') speed = 0;
    };
    root.addEventListener('click', onClick);

    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const modal = document.getElementById('modal');
      const coach = document.getElementById('coach');
      if ((modal && !modal.hidden) || (coach && !coach.hidden)) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (!root.offsetParent) return; // not on screen
      const k = e.key;
      if (k === '.' || k === '0') addBit(sel, '0');
      else if (k === '-' || k === '1') addBit(sel, '1');
      else if (k === 'Backspace') delBit(sel);
      else if (k === 'ArrowDown') select((sel + 1) % L.length);
      else if (k === 'ArrowUp') select((sel + L.length - 1) % L.length);
      else {
        const i = L.findIndex((l) => l.ch === k.toUpperCase());
        if (i < 0) return;
        select(i);
      }
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);

    // ---------------------------------------------------------------- animation (TEST TRANSMISSION)
    let animating = false;
    let speed = 1;
    function cancelAnim() {
      token++;
      if (animating) {
        animating = false;
        walkPath = null;
        $('skip').hidden = true;
        root.classList.remove('cz-busy');
      }
    }
    const wait = async (ms, my) => {
      if (speed > 0) await api.sleep(ms * speed);
      if (my !== token) throw new Error('cancelled');
    };

    async function play(data) {
      const my = ++token;
      refreshSyms();
      const codes = getCodes();
      const chk = check(L, codes, cfg.maxCode);
      if (chk.empty.length) {
        sel = chk.empty[0];
        render();
        api.toast(chk.describe(), 'bad');
        api.sfx.fail();
        return;
      }
      const msg = data && data.msg ? data.msg : makeBurst(level, rngFor(), cfg.burst);
      animating = true;
      speed = 1;
      root.classList.add('cz-busy');
      $('skip').hidden = false;
      $('stamp').innerHTML = '';
      const sig = root.querySelector('.cz-signal');
      if (sig.getBoundingClientRect().top < 0 || sig.getBoundingClientRect().bottom > window.innerHeight)
        sig.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      try {
        $('siglabel').textContent = 'Team keying';
        const res = renderTape(msg, codes, { hide: true });
        $('signote').className = 'cz-sig-note';
        $('signote').textContent = `Sending ${msg} …`;
        const sent = root.querySelectorAll('.cz-sent');
        for (let k = 0; k < res.enc.spans.length; k++) {
          const s = res.enc.spans[k];
          const tile = root.querySelector(`[data-sent="${k}"]`);
          sent.forEach((x) => x.classList.remove('cur'));
          if (tile) tile.classList.add('cur');
          for (let b = s.from; b < s.to; b++) {
            const cell = root.querySelector(`[data-bit="${b}"]`);
            cell.classList.add('on', 'flash');
            if (speed > 0) api.sfx.morse(res.enc.bits[b] === '0' ? 'E' : 'T');
            await wait(res.enc.bits[b] === '0' ? 150 : 230, my);
            cell.classList.remove('flash');
          }
          await wait(60, my);
        }
        sent.forEach((x) => x.classList.remove('cur'));
        $('siglabel').textContent = 'Field reading';
        $('signote').textContent = 'The field walks the tree, one flash at a time…';
        let k = 0;
        for (const ev of res.dec.events) {
          const cell = root.querySelector(`[data-bit="${ev.i}"]`);
          root.querySelectorAll('.cz-cell.read').forEach((x) => x.classList.remove('read'));
          cell.classList.add('read');
          walkPath = ev.buf;
          highlightWalk();
          if (speed > 0) api.sfx.tick();
          await wait(170, my);
          if (ev.emit) {
            const t = root.querySelector(`[data-back="${k}"]`);
            if (t) t.classList.remove('pending');
            if (speed > 0) ev.emit === res.units[k] ? api.sfx.place() : api.sfx.hit();
            k++;
            walkPath = '';
            highlightWalk();
            await wait(110, my);
          }
        }
        root.querySelectorAll('.cz-back.pending').forEach((t) => t.classList.remove('pending'));
        root.querySelectorAll('.cz-cell.read').forEach((x) => x.classList.remove('read'));
        walkPath = null;
        highlightWalk();
        const ok = res.intact;
        $('signote').className = 'cz-sig-note ' + (ok ? 'good' : 'bad');
        $('signote').textContent = ok
          ? `${msg.length} ${unitsN(cfg)} in ${res.enc.bits.length} flashes, read back intact.`
          : `Sent ${msg}, but the field read ${res.dec.text}.${chk.clashes.length ? ' ' + chk.describe() : ''}`;
        $('stamp').innerHTML = `<div class="stamp ${ok ? 'ok' : 'bad'}">${ok ? 'Delivered' : 'Garbled'}</div>`;
        api.sfx.stamp();
        setTimeout(() => my === token && (ok ? api.sfx.success() : api.sfx.fail()), 180);
        if (ok) {
          const ex = document.getElementById('btn-exercise');
          if (ex && !ex.disabled) ex.classList.add('nudge');
        }
      } catch (err) {
        if (err.message !== 'cancelled') throw err;
        return;
      } finally {
        if (my === token) {
          animating = false;
          $('skip').hidden = true;
          root.classList.remove('cz-busy');
        }
      }
    }

    render();
    const ctl = {
      render,
      play,
      destroy() {
        token++;
        animating = false;
        document.removeEventListener('keydown', onKey);
        root.removeEventListener('click', onClick);
        relabel.forEach((f) => f && f());
        if (live === ctl) live = null;
      },
    };
    live = ctl;
    return ctl;
  }

  function briefingHTML(level, api) {
    const cfg = cfgOf(level);
    const N = total(cfg);
    const maxShare = Math.max(...cfg.letters.map((l) => l.count)) / N;
    const st = stats(level, cfg.letters, codesOf(level, { codes: defaultState(level).codes }));
    const sMax = cfg.streams ? Math.max(...cfg.streams.flatMap((x) => Object.values(x.counts))) : 1;
    const rows = cfg.streams
      ? `<div class="czb-row czb-headrow"><b></b><span></span>${cfg.streams.map((x) => `<span class="czb-sh">${api.esc(x.name)}</span>`).join('')}</div>` +
        cfg.letters
          .map(
            (l) =>
              `<div class="czb-row czb-two"><b>${l.ch}</b><span>${api.esc(l.name)}</span>${cfg.streams
                .map((x, k) => `<span class="czb-cell s${k}"><i style="--w:${(((x.counts[l.ch] || 0) / sMax) * 100).toFixed(1)}%"></i><em>${x.counts[l.ch] || 0}</em></span>`)
                .join('')}</div>`
          )
          .join('')
      : cfg.letters
          .map((l) => {
            const s = l.count / N;
            return `<div class="czb-row"><b>${l.ch}</b><span>${api.esc(l.name)}</span><i style="--w:${((s / maxShare) * 100).toFixed(1)}%"></i><em>${l.count}</em></div>`;
          })
          .join('');
    return `<h4>Intercepted traffic · ${N} ${unitsN(cfg)}</h4>
      <div class="czb">${rows}</div>
      ${cfg.reserved ? `<h4>The keyer</h4><p class="small">Codes of at most ${cfg.maxCode} flashes. ${cfg.reserved.map((r) => `${api.esc(r.name)} is hard-wired to ${show(r.code)}`).join('; ')}.</p>` : ''}
      ${cfg.board && !cfg.reserved ? `<h4>New: the plotting table</h4><p class="small">Pick two units to pair them into a squad: they will share a code except for its last flash. Keep pairing until one unit is left, then write the card from the tree.</p>` : ''}
      ${cfg.pairs ? `<h4>New: the pair book</h4><p class="small">Switch the card to PAIRS and it holds one code for every two-letter group (QQ, QD, …). The log is then keyed two entries at a time.</p>` : ''}
      <h4>Standard book</h4>
      <p class="small">${st.fixed / N} flashes per ${units1(cfg)}, ${st.fixed} in all. Short (·) and long (–) flashes cost the same.</p>
      <h4>How the field reads</h4>
      <p class="small">Flash by flash, left to right. The moment the flashes so far spell a letter on the card, the field writes it down and starts afresh.</p>`;
  }

  CoC.modes.compress = {
    defaultState,
    evaluate,
    hideLine: true,
    runningText: 'KEYING THE FULL LOG…',
    gauges(level) {
      const cfg = cfgOf(level);
      return [
        { title: 'Burst (flashes)', zone: [0, cfg.limit / (cfg.limit * 1.25)] },
        { title: 'Read back intact', zone: [0.985, 1] },
      ];
    },
    briefingHTML,
    mount,
    test(api, data) {
      return live ? live.play(data) : Promise.resolve();
    },
    // for tests / tooling
    _internals: { codesOf, symbolsOf, pairSyms, check, stats, decode, encode, makeMessage, treeModel, boardTree, canonical },
  };
})();
