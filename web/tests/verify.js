// Verifies the campaign:
//   - the theater graph is sound (symmetric borders, every sector reachable, every level placed once),
//   - every level's reference solution passes on many seeds,
//   - the tempting-but-wrong approaches fail.
//   node web/tests/verify.js            (levels the theater references but nobody has built yet: warning)
//   node web/tests/verify.js --strict   (…: failure)
const fs = require('fs');
const path = require('path');
const JS = path.join(__dirname, '..', 'js');
for (const f of ['engine.js', 'blocks.js', 'levels.js']) require(path.join(JS, f));
// Extra level packs (levels-*.js) push into CoC.data.LEVELS after the core campaign.
for (const f of fs.readdirSync(JS).filter((f) => /^levels-.+\.js$/.test(f)).sort()) require(path.join(JS, f));
for (const f of fs.readdirSync(path.join(JS, 'modes')).filter((f) => f.endsWith('.js')).sort()) require(path.join(JS, 'modes', f));
require(path.join(JS, 'theater-data.js'));
const { engine, blocks, data, theater } = globalThis.CoC;
const modes = globalThis.CoC.modes || {};
const STRICT = process.argv.includes('--strict');

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const TRIALS = 300;

// Approaches that should NOT pass, to keep each level honest. Same notation as level solutions.
// (Levels may also carry their own `anti` list; mode levels always do.)
const ANTI = {
  '1-2': { enc: '■ ▲', dec: [] },
  '1-3': { enc: '■ ▲', dec: [] },
  '1-6': { enc: '■ ▲', dec: [] },
  '2-3': { enc: '3x( ■ ▲ ● )', dec: [], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9' },
  '2-4': { enc: '3x( ■ ▲ ● )', dec: [], asm: '■=V1,4,7 ▲=V2,5,8 ●=V3,6,9' },
  '3-1': { enc: '2x( ■ ▲ ● ◆ )', dec: [['IF_AGREE', { copies: 2 }, [], [['SAY_AGAIN', {}]]]] },
  '3-3': { enc: '■ ▲ ● ◆ P(■▲) P(●◆) P(■▲●◆)', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]] },
  '3-4': [
    { enc: '■ ▲ ● ◆ P(■▲◆) P(■●◆) P(▲●◆)', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }], ['IF_VALID', {}, [], [['SAY_AGAIN', {}]]]] },
    { enc: '■ ▲ ● ◆ P(■▲◆) P(■●◆) P(▲●◆) P(■▲●◆)', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }], ['IF_VALID', {}, [], [['SAY_AGAIN', {}]]]] },
  ],
  '4-1': { enc: '■ ■ ■ ▲ ▲ ▲ ● ● ●', dec: [], asm: '■=V1,2,3 ▲=V4,5,6 ●=V7,8,9' },
  '4-3': { enc: '■ ▲ ● ◆ SUM(■▲●◆)', dec: [['IF_VALID', {}, [], [['SAY_AGAIN', {}]]]] },
  '4-4': { enc: '■ ▲ ● ◆ W(■▲●◆) W(■▲●◆)', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]] },
  '4-5': { enc: '■ ▲ ● SUM(■▲●) W(■▲●)', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]] },
  '5-1': { enc: '■ ▲ ●', dec: [] },
  '5-2': { enc: '■ ▲ ● ■ ▲ ●', dec: [['REPAIR', { mode: 'EDIT', radius: 1 }]] },
  '5-3': { enc: '"1" ■ ▲ ● "2" ◆ ★ ⬟', dec: [['REASSEMBLE', { size: 4 }]] },
  '6-1': { enc: '■ ▲ ● ◆ ★ ⬟ ✚ ⬢ P(■▲◆★✚) P(■●◆⬟✚) P(▲●◆⬢) P(★⬟✚⬢)', dec: [['REPAIR', { mode: 'SCATTER', radius: 1 }]] },
  '6-2': { enc: '"[" ■ ▲ ● ◆ RS3 "]"', dec: [['BETWEEN', { open: '[', close: ']' }], ['REPAIR', { mode: 'SCATTER', radius: 1 }]] },
};

let failures = 0;
let warnings = 0;
const fail = (msg) => (failures++, console.log('FAIL ' + msg));
const warn = (msg) => (warnings++, console.log('WARN ' + msg));
const fmt = (x) => (typeof x === 'number' ? x.toFixed(2) : String(x));

// ------------------------------------------------------------ theater graph
const byId = theater.byId;
for (const s of theater.SECTORS)
  for (const n of s.neighbors) {
    if (!byId[n]) fail(`sector ${s.id} borders unknown sector ${n}`);
    else if (!byId[n].neighbors.includes(s.id)) fail(`border ${s.id}–${n} is not symmetric`);
  }
{
  const start = theater.SECTORS.filter((s) => s.start);
  if (start.length !== 1) fail(`expected exactly one start sector, found ${start.length}`);
  const seen = new Set(start.map((s) => s.id));
  const queue = [...seen];
  while (queue.length) for (const n of byId[queue.shift()].neighbors) if (!seen.has(n)) (seen.add(n), queue.push(n));
  for (const s of theater.SECTORS) if (!seen.has(s.id)) fail(`sector ${s.id} cannot be reached from the start`);
}
const placed = theater.allLevelIds();
const dupes = placed.filter((id, i) => placed.indexOf(id) !== i);
if (dupes.length) fail(`levels placed more than once: ${dupes.join(', ')}`);
const levelIds = new Set(data.LEVELS.map((l) => l.id));
for (const id of placed) if (!levelIds.has(id)) (STRICT ? fail : warn)(`theater references level ${id}, which is not built yet`);
for (const lv of data.LEVELS) if (!placed.includes(lv.id)) warn(`level ${lv.id} exists but is not placed in the theater`);

// ------------------------------------------------------------ levels
function program(lv, sol) {
  return {
    enc: engine.parseStrip(lv, sol.enc),
    dec: blocks.fromSpec(sol.dec || []),
    asm: engine.parseAsm(lv, sol.asm || ''),
    route: sol.route,
  };
}
const runStrip = (lv, sol, seeds) => {
  const prog = program(lv, sol);
  return seeds.map((seed) => engine.evaluate(lv, prog, { seed, trials: TRIALS }));
};
const runMode = (lv, state, seeds) => seeds.map((seed) => modes[lv.mode].evaluate(lv, JSON.parse(JSON.stringify(state)), { seed }));

for (const lv of data.LEVELS) {
  const t0 = Date.now();
  const isMode = !!lv.mode;
  if (isMode && !modes[lv.mode]) {
    fail(`${lv.id} uses unknown mode "${lv.mode}"`);
    continue;
  }
  let runs;
  try {
    runs = isMode ? runMode(lv, lv.solution.state, SEEDS) : runStrip(lv, lv.solution, SEEDS);
  } catch (e) {
    fail(`${lv.id} reference solution threw: ${e.stack || e.message}`);
    continue;
  }
  const allPass = runs.every((r) => r.passed);
  const allMedals = runs.every((r) => r.medals.every(Boolean));
  let line;
  if (isMode) {
    line = `${allPass ? 'PASS' : 'FAIL'} ${lv.id.padEnd(4)} ${lv.name.padEnd(18)} [${lv.mode}] ${runs[0].summary || ''}${allMedals ? '' : '  <-- reference misses a medal'}`;
  } else {
    const worstAcc = Math.min(...runs.map((r) => r.accuracy));
    const worstOv = Math.max(...runs.map((r) => r.avgOverhead));
    const an = engine.analyze(lv, engine.parseStrip(lv, lv.solution.enc));
    line = `${allPass ? 'PASS' : 'FAIL'} ${lv.id.padEnd(4)} ${lv.name.padEnd(18)} acc>=${fmt(worstAcc)} ov<=${fmt(worstOv)} (budget ${lv.budget}, par ${lv.par.overhead}/${lv.par.blocks}eq, sol ${runs[0].blocks}eq) d=${an.d ?? '-'}${an.burstSafe !== undefined ? ' burst=' + an.burstSafe : ''}${an.deletionSafe !== undefined ? ' delSafe=' + an.deletionSafe : ''}${allMedals ? '' : '  <-- reference misses par'}`;
  }
  if (!allPass || !allMedals) failures++;
  const antis = isMode ? lv.anti || [] : [].concat(ANTI[lv.id] || [], lv.anti || []);
  if (isMode && !antis.length) warn(`${lv.id} has no anti-solutions`);
  for (const anti of antis) {
    let ar;
    try {
      ar = isMode ? runMode(lv, anti, SEEDS.slice(0, 3)) : runStrip(lv, anti, SEEDS.slice(0, 3));
    } catch (e) {
      line += ` | anti threw: ${e.message}`;
      failures++;
      continue;
    }
    const antiPasses = ar.filter((r) => r.passed).length;
    line += ` | anti ${antiPasses ? 'PASSES?!' : 'fails ok'}`;
    if (antiPasses) failures++;
  }
  console.log(line + ` ${Date.now() - t0}ms`);
}

console.log(
  failures ? `\n${failures} problem(s)${warnings ? `, ${warnings} warning(s)` : ''}` : `\nAll levels verified.${warnings ? ` (${warnings} warning(s))` : ''}`
);
process.exit(failures ? 1 : 0);
