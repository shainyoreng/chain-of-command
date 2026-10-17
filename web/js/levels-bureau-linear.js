/* Chain of Command — additional campaign levels (levels-bureau-linear). Pushed into CoC.data.LEVELS; placed by theater-data.js.
 *
 *   THE CIPHER SCHOOL (tier 4): a requisitioned school, chalkboards and captured enemy paperwork.
 *   Generator and check matrices; decoding by syndrome, without the codebook machine.
 *     L0 THE MANUAL PAGE    the same captured decoder, and the sealing machine from the Depot turned down to mod 2:
 *                           copy the enemy's H into the seal, row for row, and every transmission satisfies it.
 *                           No parity tiles issued. The debrief asks what each seal lamp really was.
 *     L1 CAPTURED CODEBOOK  the enemy's check matrix H (Hamming's own layout, column #j = j in binary) is wired into a
 *                           captured decoder the field must use. Build the strip G that satisfies it: the tiles of
 *                           THE CODEBOOK, reordered so the checks sit at #1, #2, #4. The seal is back at HQ:
 *                           parity tiles only, so the seal's work has to be rebuilt by hand.
 *     L2 CHALK AND TABLE    no codebook machine: the SYNDROME plate. Five lamps need four checks (seven columns are all
 *                           three rows can give); write H and fill the table: a flip at #j leaves column #j.
 *     L3 THE SURGE          the THUNDERSTORM again (a surge garbles two neighbouring lamps), on 5 extra lamps instead of 6.
 *                           Every lamp and every neighbouring pair needs its own syndrome; the table holds pairs too.
 *                           The codebook machine is issued and cannot do it: it only knows "nearest", and no
 *                           13-lamp code puts every surge nearest its own order (checked exhaustively).
 *
 * Same schema as levels.js. `tableStamps` issues the syndrome plate's stamps (copy HQ rows, fill singles).
 * Numbers are tuned so the reference earns all three medals on every verification seed and every `anti` fails.
 */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});
  const LEVELS = CoC.data.LEVELS;

  const B = '01';
  const T7 = ['REPEAT', 'NOT', 'PARITY', 'CHECK', 'IF', 'SEAL', 'FILL_ONES', 'FILL_POS', 'FILL_SQ', 'FILL_POW'];
  const R3 = ['VOTE', 'READ_NOT'];

  // A syndrome plate from the columns of H (one bit-string per lamp, row 1 first): its check rows, and a table that
  // flips each lamp for its own column (+ each neighbouring pair for the sum of their columns, if `pairs`).
  function plate(cols, { pairs = false, only = null } = {}) {
    const r = cols[0].length;
    const rows = Array.from({ length: r }, (_, i) => cols.map((c, j) => (c[i] === '1' ? j + 1 : 0)).filter(Boolean));
    const table = {};
    cols.forEach((c, j) => {
      if (!only || only.includes(j + 1)) table[c] = [j + 1];
    });
    if (pairs)
      for (let j = 0; j + 1 < cols.length; j++)
        table[[...cols[j]].map((x, i) => (x === cols[j + 1][i] ? '0' : '1')).join('')] = [j + 1, j + 2];
    return ['SYNDROME', { rows, table }];
  }
  // L1's briefing figure: the captured manual page, worked through on one signal. Built from the machine's own rows.
  function capturedFigure(job) {
    const rows = (CoC.engine && CoC.engine.CAPTURED_H && CoC.engine.CAPTURED_H.rows) || [[4, 5, 6, 7], [2, 3, 6, 7], [1, 3, 5, 7]];
    const head = '<tr><th></th>' + [1, 2, 3, 4, 5, 6, 7].map((j) => `<th>#${j}</th>`).join('') + '<th></th></tr>';
    const hRows = (sig, jam) =>
      rows
        .map((row, i) => {
          let tr = `<tr><th>row ${i + 1}</th>`;
          for (let j = 1; j <= 7; j++) tr += `<td class="${row.includes(j) ? 'on' : ''}${jam === j && row.includes(j) ? ' jam' : ''}">${row.includes(j) ? 1 : 0}</td>`;
          if (sig) {
            const lit = row.filter((q) => sig[q - 1] === '1').length;
            tr += `<td class="res${lit % 2 ? ' odd' : ''}">${lit} lit → ${lit % 2 ? 'odd · 1' : 'even · 0'}</td>`;
          } else tr += '<td class="res"></td>';
          return tr + '</tr>';
        })
        .join('');
    const lampRow = (sig, jam) =>
      '<tr><th>lamps</th>' + [...sig].map((c, i) => `<td class="lamp${c === '1' ? ' lit' : ''}${jam === i + 1 ? ' jam' : ''}"></td>`).join('') + '<td class="res"></td></tr>';
    const table = (inner) => `<div class="fig-scroll"><table class="fig-h">${head}${inner}</table></div>`;
    const step = (n, body) => `<div class="fig-step"><span class="fig-n">${n}</span><div class="fig-body">${body}</div></div>`;
    const good = '0110011';
    const hitSig = '0110001';
    return (
      '<div class="brief-fig"><h5>The manual page, translated</h5>' +
      step(
        1,
        '<p>The machine reads 7 lamps, #1 to #7. Each of its three rows <b>watches</b> four of them, marked 1:</p>' +
          table(hRows(null)) +
          '<p>A row is <b>even</b> when 0, 2 or 4 of the lamps it watches are lit, and <b>odd</b> otherwise.</p>'
      ) +
      step(
        2,
        '<p>A good signal arrives, every row even. The machine changes nothing:</p>' +
          table(lampRow(good) + hRows(good))
      ) +
      step(
        3,
        '<p>The jammer flips lamp #6. Rows 1 and 2 watch #6, so exactly those two turn odd:</p>' +
          table(lampRow(hitSig, 6) + hRows(hitSig, 6)) +
          '<p>Read the rows top to bottom, odd = 1 and even = 0: <b>1 1 0</b>, which is <b>six</b> in binary. The machine flips #6 back. Every lamp is watched by a different set of rows, so every lamp spells its own number.</p>'
      ) +
      step(
        4,
        '<p><b>The catch:</b> the machine assumes every signal left HQ with all three rows even. Send lamp #1 lit alone and it arrives untouched, but row 3 is odd: <b>0 0 1</b> = one. The machine “repairs” #1 and the order is gone.</p>'
      ) +
      `<p><b>Your job:</b> ${job}</p>` +
      '</div>'
    );
  }

  const units = (r) => Array.from({ length: r }, (_, i) => Array.from({ length: r }, (_, k) => (k === i ? '1' : '0')).join(''));

  // L2: five order lamps, four checks; L3: eight lamps, five checks (odd columns: a single flip leaves an odd
  // syndrome, a neighbouring pair an even one; neighbours ordered so no two pairs leave the same one).
  const L2_COLS = ['1100', '1010', '1001', '0110', '0101', ...units(4)];
  const L3_COLS = ['00111', '01101', '10011', '01110', '10101', '11010', '01011', '11001', ...units(5)];

  const NEW = [
    // ================================================================ L0 — the enemy's H, copied straight into the seal
    {
      id: 'L0', sector: 5, name: 'THE MANUAL PAGE',
      format: [B, B, B, B],
      chain: [{ kind: 'flip', p: 0.9 }],
      enc: ['REPEAT', 'NOT', 'SEAL'], dec: ['CAPTURED', ...R3], arq: false, target: 1, budget: 3,
      par: { overhead: 3, blocks: 2 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "The school was requisitioned in the spring. The Signals people kept the blackboards, and the old staff room is where captured enemy paperwork gets sorted. Last night a raiding party brought back an enemy field decoder, intact, with its manual page clipped to the lid: three rows of noughts and ones. The School calls a page like that a check matrix, H.\n\nOur forward observers behind enemy lines have nothing else to decode with, and the machine cannot be rewired. So HQ must send signals the way this machine expects them. Orders are 4 lamps, the jammer flips one lamp in nearly every order, and Command allows 3 extra lamps.\n\nThe Depot has lent us its SEALING MACHINE for one night. On lamp orders it runs at modulus 2, and mod 2 “adds up to 0” means “an even number lit”.",
      briefingHTML: capturedFigure(
        'the seal writes its digits so that every row it is given comes out even. So give it the enemy’s page. Put the four order tiles first and the SEAL after them: its columns ■ ▲ ● ◆ S1 S2 S3 are then lamps #1 to #7 on the wire, the same columns as H. Copy H in, row for row. The decoder plate has a bench test: jam lamps yourself and watch what it does.'
      ),
      hints: [
        'The machine wants every row of H to come out even, whatever the order. The seal does exactly that for any rows you give it: it picks its digits so every row adds up to 0. Mod 2, that is “an even number lit”.',
        'Strip: the four order tiles, then a SEAL. Check the modulus reads 2. Its columns are ■ ▲ ● ◆ S1 S2 S3, which go out as lamps #1 to #7, so column for column it lines up with H. It needs three rows, one per seal digit.',
        'SEAL, mod 2, rows 0 0 0 1 1 1 1 / 0 1 1 0 0 1 1 / 1 0 1 0 1 0 1. Field work: the CAPTURED DECODER. The assembly row stays as it is: ■ ▲ ● ◆ from #1 to #4.',
      ],
      debrief: {
        title: 'A Page Is a Machine',
        text: "The seal did not understand the enemy's page. It solved three equations, once per order, and every transmission came out the way the page demands. That is all a check matrix is: a list of things every transmission must satisfy. Now look at what the seal actually sent. Each of S1, S2 and S3 is lit or dark depending only on the order lamps, and mod 2 the only such rule is the parity of some of them. Which ones? Tomorrow the sealing machine goes back to the Depot, and the forward stations still need these signals. They have parity tiles.",
      },
      solution: { enc: '■ ▲ ● ◆ H2:0,0,0,1,1,1,1|0,1,1,0,0,1,1|1,0,1,0,1,0,1', dec: [['CAPTURED', {}]], asm: '' },
      anti: [
        // our own Hamming code from THE CODEBOOK, sealed: a good code, but not the one their machine checks
        { enc: '■ ▲ ● ◆ H2:1,1,0,1,1,0,0|1,0,1,1,0,1,0|0,1,1,1,0,0,1', dec: [['CAPTURED', {}]], asm: '' },
        // the page copied with the modulus left at 11: the seal writes digits, not lamps
        { enc: '■ ▲ ● ◆ H11:0,0,0,1,1,1,1|0,1,1,0,0,1,1|1,0,1,0,1,0,1', dec: [['CAPTURED', {}]], asm: '' },
        // two rows copied, the third left off
        { enc: '■ ▲ ● ◆ H2:0,0,0,1,1,1|0,1,1,0,0,1', dec: [['CAPTURED', {}]], asm: '' },
        // no seal at all
        { enc: '■ ▲ ● ◆', dec: [['CAPTURED', {}]], asm: '' },
      ],
    },
    // ================================================================ L1 — the enemy's H: build the G that satisfies it
    {
      id: 'L1', sector: 5, name: 'CAPTURED CODEBOOK',
      format: [B, B, B, B],
      chain: [{ kind: 'flip', p: 0.9 }],
      enc: ['REPEAT', 'NOT', 'PARITY', 'IF'], dec: ['CAPTURED', ...R3], arq: false, target: 1, budget: 3,
      par: { overhead: 3, blocks: 4 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "The sealing machine went back to the Depot at dawn. The forward stations still have to talk to the captured decoder, the same enemy machine as last night, wired to the same page, and Command allows the same 3 extra lamps. What they do have is PARITY TILES: one lamp, lit when an odd number of the lamps it covers are lit.\n\nRebuild by hand what the seal worked out. Every one of the 16 orders must still leave HQ with all three rows of H even.",
      briefingHTML: capturedFigure('every transmission must leave HQ with all three rows even, as the seal made it last night, but now from parity tiles. A parity tile makes one count come out even. Work out which order lamps each check lamp must cover, and where on the strip each one must sit. The decoder plate has a bench test: jam lamps yourself and watch what it does.'),
      hints: [
        'Each seal lamp last night was the parity of some order lamps. Find which ones from H itself. Light only ■: which of #5, #6, #7 must light so all three rows come out even? Do the same for ▲, ● and ◆. Or skip the arithmetic: put each parity tile on a lamp that ONLY its own row watches, and then it answers to that row alone.',
        'Look down the columns of H. #1, #2 and #4 each have a single 1: #4 is watched only by row 1, #2 only by row 2, #1 only by row 3. Put the PARITY tiles there and the four order tiles on #3, #5, #6 and #7. The tile on #4 must cover everything else row 1 watches (the order tiles at #5, #6, #7). Do the same for #2 and #1. Then set the assembly row to read the order back from #3, #5, #6 and #7.',
        'Strip: P(■▲◆) P(■●◆) ■ P(▲●◆) ▲ ● ◆. Field work: the CAPTURED DECODER. Assembly: ■ from #3, ▲ from #5, ● from #6, ◆ from #7.',
      ],
      debrief: {
        title: 'Two Views of One Code',
        text: "Look at your strip. Mod 2, a check-matrix seal and a handful of parity tiles are the same machine: each tile is one row of H, solved for one lamp. They are also the parity tiles of THE CODEBOOK, the same three, only reordered. The enemy's H and your strip describe one code from two sides. The GENERATOR matrix G says how to make a transmission: which order lamps feed each lamp you send. The CHECK matrix H says what every transmission must satisfy. Every row of G passes every row of H, written G·Hᵀ = 0. This layout is Richard Hamming's own, from his 1950 paper: the checks sit at positions 1, 2 and 4, column j of H is j written in binary, and the failed checks spell out the number of the bad lamp. The enemy simply built his paper into a machine.",
      },
      solution: { enc: 'P(■▲◆) P(■●◆) ■ P(▲●◆) ▲ ● ◆', dec: [['CAPTURED', {}]], asm: '■=#3 ▲=#5 ●=#6 ◆=#7' },
      anti: [
        // our own Hamming layout from THE CODEBOOK: right code, wrong columns for their machine
        { enc: '■ ▲ ● ◆ P(■▲◆) P(■●◆) P(▲●◆)', dec: [['CAPTURED', {}]], asm: '' },
        // the right layout, read from the wrong places
        { enc: 'P(■▲◆) P(■●◆) ■ P(▲●◆) ▲ ● ◆', dec: [['CAPTURED', {}]], asm: '' },
        // checks in the right places, covering the wrong lamps
        { enc: 'P(▲●◆) P(■●◆) ■ P(■▲◆) ▲ ● ◆', dec: [['CAPTURED', {}]], asm: '■=#3 ▲=#5 ●=#6 ◆=#7' },
        // no checks at all
        { enc: '■ ▲ ● ◆', dec: [['CAPTURED', {}]], asm: '' },
      ],
    },

    // ================================================================ L2 — the syndrome table, by hand
    {
      id: 'L2', sector: 5, name: 'CHALK AND TABLE',
      format: [B, B, B, B, B],
      chain: [{ kind: 'flip', p: 0.9 }],
      enc: T7, dec: ['SYNDROME', ...R3], arq: false, target: 1, budget: 4,
      par: { overhead: 4, blocks: 5 }, repair: ['SCATTER'], metric: 'hamming',
      briefing:
        "The codebook machine has gone to the coast with the rest of Cryptography: a steel cabinet, one page for every possible order, and a clerk to search it. The School keeps the blackboards. Every outpost gets a SYNDROME BOARD instead: your check rows chalked across the top, and below them a short table. Each check comes out even (0) or odd (1). Read the results together as one word, the syndrome, then find that word in the table and flip the lamps it names.\n\nOrders are now 5 lamps. The jammer flips one lamp in nearly every order, and there is no return channel. Command allows 4 extra lamps. Build the strip, chalk its rows on the board, and fill the table.",
      hints: [
        'Three check rows give each lamp a column of three bits, and there are only seven non-zero columns. Five order lamps and three checks make eight lamps. You need a fourth check. Then make sure no two lamps are watched by exactly the same rows.',
        'A check row is a parity tile’s lamps plus the tile itself: P(■▲●) sent at #6 gives the row #1 #2 #3 #6. Now suppose lamp #j flips. Exactly the rows that watch #j turn odd, so the syndrome is column #j of your H, read top to bottom. Each table line is one column: that syndrome → flip that lamp.',
        'Strip: ■ ▲ ● ◆ ★ P(■▲●) P(■◆★) P(▲◆) P(●★). Rows: #1 #2 #3 #6 / #1 #4 #5 #7 / #2 #4 #8 / #3 #5 #9. Table: 1100→#1, 1010→#2, 1001→#3, 0110→#4, 0101→#5, 1000→#6, 0100→#7, 0010→#8, 0001→#9.',
      ],
      debrief: {
        title: 'Syndrome Decoding',
        text: "You replaced the codebook with a table of sixteen lines. The codebook needs a page for every order, 2 to the power of the order's lamps. The table needs a line for every syndrome, 2 to the power of the checks. Hamming's code on 11 lamps needs 2,048 pages, or a table of 16 lines. On 26 lamps it needs 67 million pages, or 32 lines. Why does the table work at all? Every transmission passes every check, so the syndrome ignores the order completely and sees only the damage. David Slepian at Bell Labs laid this out in 1956 for every code of this kind, the linear or 'group' codes: list the patterns of damage by syndrome, keep the likeliest for each, and decode by lookup. Seven years earlier Marcel Golay had published a single page that extended Hamming's idea to digits other than 0 and 1 and gave two perfect codes that still carry his name.",
      },
      solution: { enc: '■ ▲ ● ◆ ★ P(■▲●) P(■◆★) P(▲◆) P(●★)', dec: [plate(L2_COLS)], asm: '' },
      anti: [
        // three checks cannot give nine distinct columns: #1 and #6 share one here
        { enc: '■ ▲ ● ◆ ★ P(■▲◆★) P(■●◆) P(▲●★)', dec: [plate(['111', '101', '011', '110', '101', '100', '010', '001'])], asm: '' },
        // the right board, but the table only knows the check lamps
        { enc: '■ ▲ ● ◆ ★ P(■▲●) P(■◆★) P(▲◆) P(●★)', dec: [plate(L2_COLS, { only: [6, 7, 8, 9] })], asm: '' },
        // the right table, chalked under rows that are not the strip's
        { enc: '■ ▲ ● ◆ ★ P(■▲◆) P(■◆★) P(▲●) P(●★)', dec: [plate(L2_COLS)], asm: '' },
        // two lamps share a column: one table line cannot serve both
        { enc: '■ ▲ ● ◆ ★ P(■▲●) P(■◆★) P(▲◆) P(●◆)', dec: [plate(['1100', '1010', '1001', '0111', '0100', ...units(4)])], asm: '' },
      ],
    },

    // ================================================================ L3 — the table knows the storm
    {
      id: 'L3', sector: 5, name: 'THE SURGE',
      format: [B, B, B, B, B, B, B, B],
      chain: [{ kind: 'burst', p: 0.9, len: 2, to: B, name: 'LIGHTNING SURGE' }],
      enc: T7, dec: ['SYNDROME', 'REPAIR', ...R3], arq: false, target: 1, budget: 5,
      par: { overhead: 5, blocks: 6 }, repair: ['SCATTER'], metric: 'burst', tableStamps: true,
      briefing:
        "The thunderstorm is back over the pass. Each surge scrambles two NEIGHBOURING lamps, or only one of them, and the return wire is down again. Last time two Hamming codes woven together cost 6 extra lamps on an 8-lamp order. The School says 5 will do, if you stop asking the codebook machine for the nearest valid transmission and tell the table what lightning actually does.\n\nThe codebook machine is back from the coast. Try it if you like. Orders are 8 lamps. Budget: 5 extra lamps.\n\nNew issue for the syndrome board, two rubber stamps: COPY HQ ROWS chalks one row for each check lamp on your HQ strip, and FILL SINGLES writes every lamp's own column into the table.",
      hints: [
        'A surge leaves either one flipped lamp or two neighbours flipped. When two neighbours #j and #j+1 flip, the syndrome is column #j plus column #j+1 (mod 2). The table can flip a pair as easily as one lamp. What you need is a different syndrome for every single lamp AND every neighbouring pair: 13 + 12 = 25 of the 31 that five checks can give.',
        'Give every lamp an odd number of rows. The check lamps already have one; give each order lamp three or five. Then a single flip always leaves an odd syndrome and a neighbouring pair an even one, so they never collide. Then order the order lamps so that no two neighbouring pairs leave the same even syndrome. Watch the analyzer: it should say bursts are repairable up to 2. Then COPY HQ ROWS, FILL SINGLES, and write the twelve pairs yourself.',
        'Strip: ■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(●★⬟⬢) P(▲◆⬟✚⬢) P(■▲◆★) P(■●◆⬟✚) P(■▲●★✚⬢). Syndrome plate: COPY HQ ROWS, FILL SINGLES, then for each neighbouring pair (#1 #2, #2 #3 … #12 #13) find the line equal to their two columns added, and flip both.',
      ],
      debrief: {
        title: 'The Likeliest, Not the Nearest',
        text: "The codebook machine always repairs to the NEAREST valid transmission. Under lightning that is the wrong question: two flipped neighbours sit two steps from the truth and often just as close to a wrong order. The syndrome table lets you decide, for each syndrome, which damage you believe happened. Slepian called these the coset leaders: the most likely error for each syndrome. Norman Abramson built codes for exactly this storm in 1959, correcting any single error or any two adjacent ones, and they beat interleaving on cost, as you just did. The idea went a long way. Mariner 9 photographed Mars in 1971–72 through a Reed–Muller code decoded by a fast transform. Voyager sent its Jupiter and Saturn colour pictures with Golay's (24, 12) code. Today a syndrome table is wired into the memory controller of almost every server.",
      },
      solution: {
        enc: '■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(●★⬟⬢) P(▲◆⬟✚⬢) P(■▲◆★) P(■●◆⬟✚) P(■▲●★✚⬢)',
        dec: [plate(L3_COLS, { pairs: true })],
        asm: '',
      },
      anti: [
        // the right code, but a table that only knows single flips (the habit from the last board)
        { enc: '■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(●★⬟⬢) P(▲◆⬟✚⬢) P(■▲◆★) P(■●◆⬟✚) P(■▲●★✚⬢)', dec: [plate(L3_COLS)], asm: '' },
        // the codebook machine on the right code: nearest is not likeliest
        { enc: '■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(●★⬟⬢) P(▲◆⬟✚⬢) P(■▲◆★) P(■●◆⬟✚) P(■▲●★✚⬢)', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]], asm: '' },
        { enc: '■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(●★⬟⬢) P(▲◆⬟✚⬢) P(■▲◆★) P(■●◆⬟✚) P(■▲●★✚⬢)', dec: [['REPAIR', { mode: 'SCATTER', radius: 2 }]], asm: '' },
        // the thunderstorm answer: two woven Hamming codes, one lamp over budget
        {
          enc: '■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(■●✚) P(▲◆⬢) P(■★✚) P(▲⬟⬢) P(●★✚) P(◆⬟⬢)',
          dec: [['REPAIR', { mode: 'BURST', radius: 2 }]],
          asm: '',
        },
        // the order lamps in another order: two neighbouring pairs now leave the same syndrome
        {
          enc: '■ ● ▲ ◆ ★ ⬟ ✚ ⬢ P(●★⬟⬢) P(▲◆⬟✚⬢) P(■▲◆★) P(■●◆⬟✚) P(■▲●★✚⬢)',
          dec: [plate(['00111', '10011', '01101', '01110', '10101', '11010', '01011', '11001', ...units(5)], { pairs: true })],
          asm: '■=#1 ▲=#3 ●=#2',
        },
      ],
    },
  ];

  LEVELS.push(...NEW);
})();
