/* Chain of Command — the theater of operations: sectors on one front, who borders whom,
 * which missions each sector holds, special operations, and the progression rules.
 *
 * Shape of the campaign
 *   Tier 1 — one idea per sector (filtering, structure, repetition, detection).
 *   Tier 2 — one deeper idea per sector (bursts, Hamming, erasures & check digits, framing & sync).
 *   Tier 3 — sectors that COMBINE ideas (bursts × Hamming, routing × codes, erasures × routing, the stack),
 *            plus whole sectors of one special mechanic (compression at the airfield, contact at the radar station).
 *   Tier 4 — the deepest: the Cipher School (linear codes), the Rotor Works (cyclic codes), the Citadel and Enemy High Command.
 *   Scattered across all tiers: hidden lines, routings, commando raids (compression) and
 *   "contact lost" missions (authentication: the enemy poses as HQ while you re-establish contact).
 *
 * Progression
 *   - The start sector is open. A sector is CAPTURED when every mission in it is complete.
 *   - An enemy sector you border (shares an edge with a captured sector) is OPEN to attack —
 *     unless you lack the stars for it (state SHORT: deeper tiers ask for ~60% of the stars on offer
 *     in the tiers before them, so nobody can sprint for the far side and leave whole sectors behind),
 *     or contact with its units is lost (`contact`): then that mission must be won first (state GATED).
 *   - Inside a sector, missions are an advance: each one opens when the previous is done.
 *   - Commando raids open after a number of missions, wherever the front is. They are optional.
 *
 * Geometry for the map (polygons, unit positions, arrows) lives in theater.js.
 */
(function () {
  'use strict';
  const CoC = (globalThis.CoC = globalThis.CoC || {});

  const SECTORS = [
    // ------------------------------------------------------------ tier 1: one idea each
    {
      id: 'beachhead', code: 'BH', name: 'THE BEACHHEAD', difficulty: 1, tier: 1, start: true,
      idea: 'Getting the order through: filtering and redundancy',
      missions: ['1-1', '1-2', '1-3', '1-4'],
      neighbors: ['crossing', 'ridge', 'relay'],
    },
    {
      id: 'crossing', code: 'MC', name: "MUDDLE'S CROSSING", difficulty: 1, tier: 1,
      idea: 'Structure is redundancy; know your channel',
      missions: ['1-5', '1-6', 'X0'],
      neighbors: ['beachhead', 'ridge', 'artillery', 'forest'],
    },
    {
      id: 'ridge', code: 'RR', name: 'RADIO RIDGE', difficulty: 2, tier: 1,
      idea: 'Repetition and majority vote',
      missions: ['2-1', '2-2', 'R0'],
      neighbors: ['beachhead', 'crossing', 'relay', 'artillery', 'valley', 'forest'],
    },
    {
      id: 'relay', code: 'RS', name: 'RELAY STATION', difficulty: 2, tier: 1,
      idea: 'Detect, then ask again; the parity bit',
      missions: ['2-4', '3-1'],
      neighbors: ['beachhead', 'ridge', 'valley', 'railyard'],
    },
    // ------------------------------------------------------------ tier 2: one deeper idea each
    {
      id: 'artillery', code: 'AL', name: 'THE ARTILLERY LINE', difficulty: 3, tier: 2,
      idea: 'Heavier fire: more copies, and bursts',
      missions: ['2-3', '4-1'],
      neighbors: ['crossing', 'ridge', 'forest', 'fords', 'airfield'],
    },
    {
      id: 'valley', code: 'JV', name: 'JAMMER VALLEY', difficulty: 3, tier: 2, contact: 'A1',
      idea: 'Parity seals, syndromes and the Hamming code',
      missions: ['3-2', '3-3', '3-4'],
      neighbors: ['ridge', 'relay', 'depot', 'junction', 'pass', 'railyard', 'radar'],
    },
    {
      id: 'depot', code: 'FD', name: 'THE FLOODED DEPOT', difficulty: 4, tier: 2,
      idea: 'Check digits built by hand: weights, moduli, and the Reed–Solomon seal',
      missions: ['4-2', 'D1', '4-3', '4-4', '4-5', 'D2'],
      neighbors: ['valley', 'junction', 'marshes', 'harbour'],
    },
    {
      id: 'junction', code: 'SJ', name: 'SIGNAL JUNCTION', difficulty: 4, tier: 2,
      idea: 'Framing, slips and sequence numbers',
      missions: ['5-1', '5-2', '5-3'],
      neighbors: ['valley', 'depot', 'railyard', 'harbour'],
    },
    // ------------------------------------------------------------ tier 3: ideas combined
    {
      id: 'pass', code: 'MP', name: 'THE MOUNTAIN PASS', difficulty: 4, tier: 3,
      idea: 'Bursts meet Hamming: interleaved seals, unknown lines',
      missions: ['P1', '6-1', 'P2'],
      neighbors: ['valley', 'longwire', 'radar'],
    },
    {
      id: 'fords', code: 'RF', name: 'THE RIVER FORDS', difficulty: 4, tier: 3,
      idea: 'Choosing the route to fit the code; reading an unknown line',
      missions: ['R1', 'X1', 'R2'],
      neighbors: ['artillery', 'airfield', 'citadel'],
    },
    {
      id: 'marshes', code: 'MS', name: 'THE MARSHES', difficulty: 5, tier: 3,
      idea: 'Smudges or garbles? Routes priced in erasures and errors',
      missions: ['M1', 'M2', 'M3'],
      neighbors: ['depot', 'harbour', 'longwire', 'linear'],
    },
    {
      id: 'longwire', code: 'LW', name: 'THE LONG WIRE', difficulty: 5, tier: 3, contact: 'A2',
      idea: 'The full protocol stack',
      missions: ['5-4', 'X2'],
      neighbors: ['pass', 'marshes', 'radar', 'citadel'],
    },
    {
      id: 'capital', code: 'HC', name: 'ENEMY HIGH COMMAND', difficulty: 5, tier: 4, contact: 'A3',
      idea: 'The final assault: every idea at once',
      missions: ['K1', 'K2', '6-2'],
      neighbors: ['citadel', 'linear', 'cyclic'],
    },
    // ------------------------------------------------------------ added sectors (existing mechanics)
    {
      id: 'forest', code: 'DF', name: 'THE DARK FOREST', difficulty: 2, tier: 2,
      idea: 'Unknown lines in the trees: read the habit, then outvote it',
      missions: ['F1', 'F2', 'F3'],
      neighbors: ['crossing', 'ridge', 'artillery'],
    },
    {
      id: 'railyard', code: 'RY', name: 'THE RAIL YARD', difficulty: 3, tier: 2,
      idea: 'Freight in pieces: sequence numbers, retransmission and routes',
      missions: ['RY1', 'RY2', 'RY3'],
      neighbors: ['relay', 'valley', 'junction'],
    },
    {
      id: 'harbour', code: 'HB', name: 'THE HARBOUR', difficulty: 4, tier: 3,
      idea: 'Salt-water damage: envelopes, smudged manifests and check digits',
      missions: ['H1', 'H2', 'H3'],
      neighbors: ['depot', 'junction', 'marshes'],
    },
    {
      id: 'airfield', code: 'AF', name: 'THE AIRFIELD', difficulty: 4, tier: 3,
      idea: 'Short bursts to the squadrons: compression under direction-finding',
      missions: ['C4', 'C5', 'C6'],
      neighbors: ['artillery', 'fords'],
    },
    {
      id: 'radar', code: 'RD', name: 'THE RADAR STATION', difficulty: 4, tier: 3,
      idea: 'Friend or foe: challenge, answer and the enemy in our voice',
      missions: ['A4', 'A5', 'A6'],
      neighbors: ['valley', 'pass', 'longwire'],
    },
    {
      id: 'citadel', code: 'CT', name: 'THE CITADEL', difficulty: 5, tier: 4,
      idea: 'The old fortress: every trick of the war, combined',
      missions: ['Z1', 'Z2', 'Z3'],
      neighbors: ['fords', 'longwire', 'capital'],
    },
    // ------------------------------------------------------------ the codebreakers' two sectors: linear codes (school) and cyclic codes (works)
    {
      id: 'linear', code: 'CS', name: 'THE CIPHER SCHOOL', difficulty: 5, tier: 4,
      idea: 'Generator and check matrices; decoding by syndrome',
      missions: ['L0', 'L1', 'L2', 'L3'],
      neighbors: ['marshes', 'cyclic', 'capital'],
    },
    {
      id: 'cyclic', code: 'RW', name: 'THE ROTOR WORKS', difficulty: 5, tier: 4,
      idea: 'Shift registers, polynomial division and the CRC',
      missions: ['Q1', 'Q2', 'Q3'],
      neighbors: ['linear', 'capital'],
    },
  ];

  // Optional commando raids (compression under enemy direction-finding). `after` = completed regular
  // missions needed; `behind` = the enemy sector the raid is staged in, for placing its marker.
  const SPECIALS = [
    { level: 'C1', after: 4, behind: 'valley' },
    { level: 'C2', after: 13, behind: 'pass' },
    { level: 'C3', after: 22, behind: 'capital' },
  ];

  const byId = Object.fromEntries(SECTORS.map((s) => [s.id, s]));
  const sectorOfLevel = {};
  for (const s of SECTORS) s.missions.forEach((m) => (sectorOfLevel[m] = s.id));
  const contactOf = {};
  for (const s of SECTORS) if (s.contact) contactOf[s.contact] = s.id;

  const done = (save, id) => !!(save.medals[id] && save.medals[id][0]);

  // Stars needed to attack a sector: STAR_SHARE of the stars on offer in all earlier tiers
  // (3 per regular mission). A guideline more than a wall — raids and contact missions add stars too.
  const STAR_SHARE = 0.6;
  function starsNeeded(sector) {
    const before = SECTORS.filter((s) => s.tier < sector.tier).reduce((a, s) => a + s.missions.length, 0);
    return Math.round(STAR_SHARE * 3 * before);
  }
  const starsOf = (save) => Object.values(save.medals || {}).reduce((a, m) => a + m.filter(Boolean).length, 0);

  // The whole state of the front, derived from the save (medals) alone.
  function status(save, unlockAll = false) {
    const sectors = {};
    const need = {};
    const stars = starsOf(save);
    for (const s of SECTORS) sectors[s.id] = s.missions.every((m) => done(save, m)) ? 'captured' : 'locked';
    for (const s of SECTORS) {
      need[s.id] = starsNeeded(s);
      if (sectors[s.id] === 'captured') continue;
      const borders = s.start || s.neighbors.some((n) => sectors[n] === 'captured');
      if (unlockAll) sectors[s.id] = 'open';
      else if (!borders) continue;
      else if (stars < need[s.id]) sectors[s.id] = 'short';
      else sectors[s.id] = s.contact && !done(save, s.contact) ? 'gated' : 'open';
    }
    const missions = {};
    for (const s of SECTORS) {
      let prevDone = true;
      for (const m of s.missions) {
        const st = sectors[s.id];
        missions[m] = done(save, m) ? 'done' : (st === 'open' || st === 'captured') && (prevDone || unlockAll) ? 'open' : 'locked';
        prevDone = done(save, m);
      }
      if (s.contact) missions[s.contact] = done(save, s.contact) ? 'done' : sectors[s.id] === 'gated' || unlockAll ? 'open' : 'locked';
    }
    const regular = SECTORS.reduce((a, s) => a + s.missions.filter((m) => done(save, m)).length, 0);
    for (const sp of SPECIALS) missions[sp.level] = done(save, sp.level) ? 'done' : unlockAll || regular >= sp.after ? 'open' : 'locked';
    return { sectors, missions, regular, stars, need };
  }

  // Where to go after winning `levelId`: the next mission of the same advance, if any.
  function nextInSector(levelId) {
    const s = byId[sectorOfLevel[levelId]];
    if (!s) return null;
    const i = s.missions.indexOf(levelId);
    return i >= 0 && i + 1 < s.missions.length ? s.missions[i + 1] : null;
  }

  // The sector a level belongs to: its own, the one whose contact it restores, or the one a raid is staged behind.
  function sectorFor(levelId) {
    if (sectorOfLevel[levelId]) return byId[sectorOfLevel[levelId]];
    if (contactOf[levelId]) return byId[contactOf[levelId]];
    const sp = SPECIALS.find((x) => x.level === levelId);
    return sp ? byId[sp.behind] : null;
  }

  // 'mission' | 'contact' (restore contact before the sector opens) | 'raid' (optional commando op)
  function kindOf(levelId) {
    if (contactOf[levelId]) return 'contact';
    if (SPECIALS.some((x) => x.level === levelId)) return 'raid';
    return 'mission';
  }

  // Every level the theater references, in a sensible play order (for archive, tests, ranks).
  function allLevelIds() {
    const out = [];
    for (const s of SECTORS) {
      if (s.contact) out.push(s.contact);
      out.push(...s.missions);
    }
    for (const sp of SPECIALS) out.push(sp.level);
    return out;
  }

  CoC.theater = { SECTORS, SPECIALS, byId, status, nextInSector, sectorFor, kindOf, allLevelIds, starsNeeded };
})();
