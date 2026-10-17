/* Chain of Command — block catalogue (the player's equipment).
 * `parts` is the label: plain strings and {k: paramKey} slots rendered as inline controls.
 */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});

  const CATEGORIES = {
    redundancy: { name: 'Redundancy', color: 'olive' },
    seal: { name: 'Seals', color: 'brass' },
    sync: { name: 'Transport', color: 'steel' },
    clean: { name: 'Field work', color: 'khaki' },
    logic: { name: 'Decisions', color: 'rust' },
    codebook: { name: 'Codebook', color: 'teal' },
    matrix: { name: 'Check matrix', color: 'navy' },
    terminal: { name: 'Radio', color: 'red' },
  };

  const BLOCKS = {
    // ------------------------------------------------------------ Field (decoder)
    STRIP: {
      side: 'dec', cat: 'clean', title: 'Strip out',
      parts: ['STRIP OUT', { k: 'set' }],
      params: { set: { type: 'set', def: '' } },
      desc: 'Throw away every symbol from the chosen set.', example: 'A2B1 strip {1,2} → AB',
    },
    SWAP: {
      side: 'dec', cat: 'clean', title: 'Swap',
      parts: ['SWAP', { k: 'a', pre: '#' }, '↔', { k: 'b', pre: '#' }],
      params: { a: { type: 'int', min: 1, max: 16, def: 1 }, b: { type: 'int', min: 1, max: 16, def: 2 } },
      desc: 'Exchange two symbols.', example: '1A swap #1↔#2 → A1',
    },
    FLIP: {
      side: 'dec', cat: 'clean', title: 'Flip lamp',
      parts: ['FLIP LAMP', { k: 'pos', pre: '#' }],
      params: { pos: { type: 'int', min: 1, max: 16, def: 1 } },
      desc: 'Turn a lit lamp dark or a dark lamp lit.', example: '0110 flip #1 → 1110',
    },
    BETWEEN: {
      side: 'dec', cat: 'sync', title: 'Open envelope',
      parts: ['OPEN ENVELOPE', { k: 'open' }, '…', { k: 'close' }],
      params: { open: { type: 'sym', def: '[' }, close: { type: 'sym', def: ']' } },
      desc: 'Keep only what lies between the first opening marker and the next closing marker.',
      example: 'XQ[ABC]Z → ABC',
    },
    REASSEMBLE: {
      side: 'dec', cat: 'sync', title: 'Reassemble',
      parts: ['REASSEMBLE pieces of', { k: 'size' }],
      params: { size: { type: 'int', min: 2, max: 9, def: 3 } },
      desc: 'Cut into pieces, sort them by their first symbol (the tag), then remove the tags.',
      example: '2CD1AB3EF pieces of 3 → ABCDEF',
    },
    REPAIR: {
      side: 'dec', cat: 'codebook', title: 'Repair',
      parts: ['REPAIR', { k: 'mode' }, 'up to', { k: 'radius' }],
      params: {
        mode: { type: 'enum', options: ['SCATTER', 'BURST', 'EDIT'], def: 'SCATTER' },
        radius: { type: 'int', min: 0, max: 3, def: 1 },
      },
      desc: 'Replace the signal with the single nearest valid transmission from the codebook, if it is close enough. SCATTER counts changed symbols, BURST measures the longest damaged stretch, EDIT also counts lost or extra symbols. Smudges (?) are free.',
      example: '1011010 → 1011011',
    },
    // The Cipher School: decoding by syndrome. The plate draws its own panel (editor.js): the check
    // rows as a grid of lamps (H) and the table, one line per syndrome. `rows` = lamp positions per check row;
    // `table` = { 'syndrome bits s1 s2 …': [lamps to flip] }.
    SYNDROME: {
      side: 'dec', cat: 'matrix', title: 'Syndrome table', panel: 'syndrome',
      parts: ['CHECK ROWS → SYNDROME → TABLE'],
      params: { rows: { type: 'rows', def: [[], [], []] }, table: { type: 'table', def: {} } },
      desc: 'Your own check matrix H, chalked on a board. Light the lamps each check row watches. The plate takes every row’s parity, which gives one bit per row: that string is the SYNDROME. Then it looks the syndrome up in your table and flips the lamps you wrote there. All zeros means every check holds, so the signal passes on untouched.',
      example: 'rows #1 #3 #5 #7 · #2 #3 #6 #7 · #4 #5 #6 #7\n0110101 → syndrome 1 1 0 → table: flip #3 → 0100101',
    },
    CAPTURED: {
      side: 'dec', cat: 'matrix', title: 'Captured decoder', panel: 'captured',
      parts: ['CAPTURED DECODER · H AS SEIZED'],
      params: {},
      desc: 'An enemy field decoder, taken intact. Its three check rows are wired in and cannot be changed. It works on lamps #1 to #7: row 1 watches #4 #5 #6 #7, row 2 watches #2 #3 #6 #7, row 3 watches #1 #3 #5 #7. It reads the three results as a binary number and flips that lamp.',
      example: 'H (as captured)\n0 0 0 1 1 1 1\n0 1 1 0 0 1 1\n1 0 1 0 1 0 1\nsyndrome 1 0 1 = five → flip #5',
    },
    SAY_AGAIN: {
      side: 'dec', cat: 'terminal', title: 'Say again',
      parts: ['SAY AGAIN!'],
      params: {},
      desc: 'Radio HQ to send the order again. Every re-send costs a full transmission.',
      example: '',
    },
    IF_IN: {
      side: 'dec', cat: 'logic', cond: true, title: 'If symbol is one of',
      parts: ['IF', { k: 'pos', pre: '#' }, 'IS ONE OF', { k: 'set' }],
      params: { pos: { type: 'int', min: 1, max: 16, def: 1 }, set: { type: 'set', def: '' } },
      desc: 'Branch on what a symbol is.', example: '',
    },
    IF_SAME: {
      side: 'dec', cat: 'logic', cond: true, title: 'If symbols match',
      parts: ['IF', { k: 'a', pre: '#' }, '=', { k: 'b', pre: '#' }],
      params: { a: { type: 'int', min: 1, max: 16, def: 1 }, b: { type: 'int', min: 1, max: 16, def: 2 } },
      desc: 'Branch on whether two symbols are equal.', example: '',
    },
    IF_AGREE: {
      side: 'dec', cat: 'logic', cond: true, title: 'If equal pieces match',
      parts: ['CUT SIGNAL INTO', { k: 'copies' }, 'EQUAL PIECES · IF ALL IDENTICAL'],
      params: { copies: { type: 'int', min: 2, max: 7, def: 2 } },
      desc: 'Cut the received signal into this many equal-length pieces, left to right. YES if every piece is exactly the same; NO if any differ (or the length doesn’t divide evenly).',
      example: 'N3AN3A into 2 → N3A | N3A → YES\nN3AN7A into 2 → N3A | N7A → NO',
    },
    IF_PARITY: {
      side: 'dec', cat: 'logic', cond: true, title: 'If parity is even',
      parts: ['IF PARITY of', { k: 'pos' }, 'IS EVEN'],
      params: { pos: { type: 'positions', def: [] } },
      desc: 'Branch on whether an even number of the chosen lamps are lit.', example: '',
    },
    IF_VALID: {
      side: 'dec', cat: 'codebook', cond: true, title: 'If in codebook',
      parts: ['IF SIGNAL IS IN CODEBOOK'],
      params: {},
      desc: 'Branch on whether the signal is exactly some valid transmission.', example: '',
    },
    IF_LENGTH: {
      side: 'dec', cat: 'logic', cond: true, title: 'If length is',
      parts: ['IF LENGTH =', { k: 'n' }],
      params: { n: { type: 'int', min: 0, max: 32, def: 3 } },
      desc: 'Branch on the number of symbols received.', example: '',
    },
    IF_CRC_OK: {
      side: 'dec', cat: 'logic', cond: true, title: 'If the register clears',
      parts: ['IF THE REGISTER CLEARS'],
      params: {},
      desc: 'Clock every lamp of the signal through a shift register wired like HQ’s (the same g(x) as the strip’s shift register tile). YES if it ends holding all zeros: the whole signal divides exactly by g(x). It clocks lamps only: a smudge (?), a marker or junk never clears — and with no register tile at HQ, nothing does.',
      example: 'g = x³+x+1:  1101001 → remainder 000 → YES\n                 1111001 → remainder 110 → NO',
    },
  };

  // Strip tools (HQ) and assembly readers (field): shown in briefings and the tray.
  const TOOLS = {
    REPEAT: { side: 'enc', title: 'Repeat group', desc: 'Wrap tiles in a bracket and stamp them n times.', example: '[■▲]×2 → ■▲■▲' },
    NOT: { side: 'enc', title: '¬ badge', desc: 'Send a symbol’s partner instead (1↔0, N↔S, E↔W…: 1st↔2nd, 3rd↔4th in its set).', example: '¬■ with ■=N → S' },
    IF: { side: 'enc', title: 'If tile', desc: 'Two mini-strips: one is sent when a variable is one of a chosen set, the other otherwise.', example: 'IF ■ is X: ■■■ else ■' },
    PARITY: { side: 'enc', title: 'Parity tile', desc: 'One lamp: lit (1) if an odd number of the chosen lamps are lit, dark (0) otherwise.', example: 'P(■▲●) with 1,0,1 → 0' },
    CHECK: { side: 'enc', title: 'Check digit', desc: 'One symbol: multiply every digit of the order by its weight dial, add it all up, and keep the remainder after dividing by the modulus dial (4–11; 10 is written X). A weight of 0 leaves that digit out.', example: '■▲●◆ = 2 0 1 2, weights 1 2 3 4, mod 5 → 1·2+2·0+3·1+4·2 = 13 → 13 mod 5 = 3' },
    SEAL: { side: 'enc', title: 'Check-matrix seal', desc: 'Write your own check equations: one row of weights per seal digit, over the order’s digits and the seal digits themselves. HQ picks the seal digits so every row adds up to 0 (mod m). If the rows cannot pin a seal digit down, the seal jams.', example: 'rows 1 1 1 1 | 1 0  and  1 2 3 4 | 0 1, mod 11 → two seal digits' },
    CRC: { side: 'enc', title: 'Shift register (CRC)', desc: 'Reads every lamp already on the tape as a polynomial (first lamp = highest power), multiplies it by xʳ and divides by the generator g(x) you wire with its tap switches. The r lamps left in the register — the remainder — are stamped on. A tape that ends in its remainder divides exactly by g(x).', example: 'g = x³+x+1 (1011):  1101 → 1101·x³ mod g = 001 → 1101 001' },
    FILL_ONES: { side: 'enc', title: 'Stamp: all ones', desc: 'A rubber stamp for a check tile or a seal row: sets every weight to 1 — the plain sum.', example: 'weights → 1 1 1 1' },
    FILL_POS: { side: 'enc', title: 'Stamp: position', desc: 'Sets every weight to its position: digit #i gets weight i (mod m).', example: 'weights → 1 2 3 4' },
    FILL_SQ: { side: 'enc', title: 'Stamp: squares', desc: 'Sets every weight to the square of its position: digit #i gets weight i² (mod m).', example: 'weights → 1 4 9 16→5 (mod 11)' },
    FILL_POW: { side: 'enc', title: 'Stamp: power rows', desc: 'Fills every row of a seal at once: row r gives column #i the weight i^(r−1) (mod m), counting the order’s digits and the seal digits together — the Reed–Solomon pattern.', example: 'row 1: 1 1 1 1 1 1 · row 2: 1 2 3 4 5 6 · row 3: 1 4 9 5 3 3' },
    VOTE: { side: 'read', title: 'Vote reader', desc: 'Read a symbol by majority vote over several received positions.', example: '■ = vote #1,#4,#7' },
    READ_NOT: { side: 'read', title: '¬ reader', desc: 'Read a symbol’s partner (undo a ¬ badge).', example: '■ = ¬#2' },
  };

  let uid = 0;
  function newBlock(op, overrides) {
    const spec = BLOCKS[op];
    const p = {};
    for (const [k, def] of Object.entries(spec.params)) {
      p[k] = Array.isArray(def.def) ? [...def.def] : def.def;
    }
    Object.assign(p, overrides || {});
    const b = { id: 'b' + ++uid + '_' + Math.floor(Math.random() * 1e6).toString(36), op, p };
    if (spec.cond) {
      b.then = [];
      b.else = [];
    }
    return b;
  }

  // Build a program from a compact solution spec: [['REPEAT',{times:3}], ['IF_AGREE',{copies:2}, [...then], [...else]]]
  function fromSpec(spec) {
    return spec.map(([op, p, yes, no]) => {
      const b = newBlock(op, p);
      if (BLOCKS[op].cond) {
        b.then = fromSpec(yes || []);
        b.else = fromSpec(no || []);
      }
      return b;
    });
  }

  function cloneProgram(list) {
    return list.map((b) => {
      const c = { id: b.id, op: b.op, p: JSON.parse(JSON.stringify(b.p)) };
      if (b.then) c.then = cloneProgram(b.then);
      if (b.else) c.else = cloneProgram(b.else);
      return c;
    });
  }

  // Re-id a stored program so ids never collide with freshly created blocks.
  function reviveProgram(list) {
    return (list || [])
      .filter((b) => BLOCKS[b.op])
      .map((b) => {
        const fresh = newBlock(b.op, b.p);
        if (fresh.then) {
          fresh.then = reviveProgram(b.then);
          fresh.else = reviveProgram(b.else);
        }
        return fresh;
      });
  }

  CoC.blocks = { CATEGORIES, BLOCKS, TOOLS, newBlock, fromSpec, cloneProgram, reviveProgram };
})();
