# Chain of Command: Game Design Document

*The grand plan: what the game is, how it feels, and how it grows from "scrub out the noise" to "rebuild Voyager's Reed–Solomon code from scratch."*

Status: the web campaign (25 operations, six sectors) is implemented on the **transmission strip** model described below, and every level is verified by `web/tests/verify.js`. Sections 5 and 7 mix what is built with what is planned; each says which.

## 0. Current structure (October 2026)

The campaign is **one front of 21 sectors in four tiers**, 71 operations in all (`web/js/theater-data.js`), on a wide, horizontally scrolling general's map. Capturing a sector opens every enemy sector it borders; deeper tiers ask for ~60% of the stars on offer before them; "contact lost" missions (enemy posing as HQ) guard three sectors; optional commando raids appear behind the lines. Finishing the war plays a victory finale (front page, a roll call of every idea rebuilt, final rank, credits).

| Tier | Sectors (idea) |
|---|---|
| 1 — one idea each | Beachhead (filtering, redundancy) · Muddle's Crossing (structure; first hidden line) · Radio Ridge (repetition, voting; first routing) · Relay Station (ARQ, parity) |
| 2 — one deeper idea | Artillery Line (bursts) · Jammer Valley (Hamming; contact A1) · Flooded Depot (check digits built by hand: weight and modulus dials → the written-row Reed–Solomon seal) · Signal Junction (framing, slips, sequence numbers) · Dark Forest (hidden lines vs. voting layouts) · Rail Yard (freight in pieces, retransmission, yard routing) |
| 3 — ideas combined | Mountain Pass (bursts × Hamming) · River Fords (routing × codes) · Marshes (erasures vs. errors priced by route) · Long Wire (the stack; contact A2) · Harbour (salt-smudged manifests, envelopes) · Airfield (a compression sector) · Radar Station (a friend-or-foe sector) |
| 4 — the deepest | The Cipher School (linear codes: captured check matrices, syndrome tables) · The Rotor Works (cyclic codes: shift-register CRC, primitive polynomials, rotation) · The Citadel (every trick combined) · Enemy High Command (final; contact A3) |

Mechanic families: strip encoder + field plates (all tiers), routing meshes, hidden lines with intercept logs, compression (mode), authentication (mode), check-matrix tools (dial checks, written-row seals, syndrome plates, the shift register), and the Code Analyzer with its Distance and Matrices views and field manual. Everything is verified by `node web/tests/verify.js --strict`.

**Ideas not yet supported (from level designers):** a single hidden road inside a routing map (a dark stretch known only by intercepts); REPAIR after REASSEMBLE (the codebook keeps the inner tags).

## 1. Pitch

You are a Signal Corps officer, and the campaign runs from 1917 to 1977. Command writes an order. A chain of relays carries it to the front, and every relay has a flaw: Pvt. Butterfingers drops digits, Cpl. Muddle swaps neighbours, the Enemy Jammer flips lamps, Artillery shreds whole stretches. You can't fix the relays. You can design two things: the **HQ protocol** that turns an order into a transmission, and the **Field protocol** that turns whatever arrives back into the order. Each operation is passed by delivering 300 test orders with the required accuracy (usually all of them) inside a bandwidth budget.

The player starts by stripping stray digits out of letter-only orders. Sixty in-game years later they are sealing four-digit probe commands with four joint check digits and decoding them through deep-space hiss. Along the way they have rebuilt repetition codes, ARQ, parity, syndrome decoding, Hamming codes, SECDED, interleaving, erasure coding, ISBN check digits, Reed–Solomon codes, framing and sequence numbers, each one built by hand before the game names it.

### Design pillars

1. **Every mechanic is a real idea.** Relays are channel models, tiles are encoding primitives, the Codebook is bounded-distance decoding, and the analyzer measures minimum distance. A mechanic an engineer wouldn't recognise doesn't ship.
2. **The player names nothing until they have built it.** Tools have functional names (PARITY, CHECK DIGIT). Concept names (syndrome, Hamming code, SECDED) appear only in the debrief. The one deliberate exception is the REED–SOLOMON SEAL, issued after Op 4-5 as Command "standardising your discovery", so the name arrives as a reward.
3. **Fail visibly, learn from replays.** Any failed order can be replayed symbol by symbol. The game never just says "wrong".
4. **Bandwidth is the antagonist.** Most levels have an obvious solution that is too expensive, or a cheap one that is subtly broken. The budget is tuned so that solution fails, and the test suite proves it.
5. **Know your channel.** The same tiles in a different order win or lose depending on the relay. The relays are characters so their behaviour sticks in the player's mind.
6. **You can see what's coming.** Locked tools are visible, greyed out with a padlock.

---

## 2. The feel: one operation, minute by minute

Walkthrough of **Op 3-3 THE CODEBOOK** (four lamp bits, one jammer flip per order, budget 3).

**0:00. The map.** A sepia military map. NATO signal-unit symbols sit along the front, phase lines divide the six sectors, and unreached sectors are hatched. Op 3-3 pulses; clicking it plays a short morse blip.

**0:10. Briefing.** A manila dossier slides up with a red **CLASSIFIED** stamp and typewritten text. Cryptography has issued a CODEBOOK machine, and the briefing states the rule in one line: *one flip moves a signal one step, so you need d ≥ 3.* **Acknowledged ▸** lands with a stamp thud.

**0:30. The mission screen.** The top half is **The Line**: HQ tent, one relay patch card (ENEMY JAMMER, "Flips one lamp"), field bunker, joined by a wire. The template `■ ▲ ● ◆` sits above the tent, with a legend showing each is `0/1`. Below is the console: the HQ strip starts with the four source tiles laid out, and the Field protocol has only the "assemble the order" row (■ from #1, ▲ from #2…).

**1:00. First attempt.** The player drags in a PARITY tile and clicks ■ and ▲ to make it watch them. A second tile watches ● and ◆, a third all four. The tape readout says *7 symbols (+3)*. The analyzer needle settles on **d = 2**, and its closest-pair line shows two transmissions only two lamps apart. The player has been warned, but tries it anyway.

**1:30. Test transmission.** The player adds a REPAIR plate (SCATTER, radius 1) to the Field protocol and presses **TEST TRANSMISSION**. An envelope travels the wire and shudders at the Jammer's card, and one tape tile turns red as it flips from 1 to 0. In the bunker the REPAIR plate whirs and snaps the tape to the *wrong* valid transmission. A **GARBLED** stamp lands with a two-tone fail. Watching the machine confidently pick the wrong neighbour is the lesson of this level.

**2:30. Iterate.** The closest pair shows the problem: lamps 1 and 2 are watched by the same seals, so the field can't tell which one flipped. The player re-points the seals until every lamp has its own combination. The needle swings to **d = 3** and "can fix: 1 error" lights.

**3:30. Field exercise.** **FIELD EXERCISE ×300**: a teletype log prints one line per order with a soft tick, and two analog gauges (*Orders delivered*, *Avg extra symbols*) settle at 300/300 and +3.00. Any log line can be clicked to replay that order on The Line.

**4:00. After-action report.** **MISSION ACCOMPLISHED** is stamped, then three medals one at a time, then a *Field Manual entry unlocked* card: **The Hamming Code (1950)**, about Hamming's weekend jobs crashing at Bell Labs. If the star total crosses a threshold, a promotion card follows with a bugle-like arpeggio. The matching Archive entry loses its redaction bars.

The target is under five minutes for an easy op and twenty to forty for the hard ones (3-2, 4-4, 6-1). There is no time pressure anywhere.

---

## 3. Core loop and systems

```
 briefing ─► build HQ strip + Field protocol ─► TEST TRANSMISSION (1 order, animated)
     ▲                     ▲                               │
     │                     └──── read analyzer / replay ◄──┤
     │                                                     ▼
 next op ◄── after-action report ◄── FIELD EXERCISE ×300 (gauges + teletype)
```

### 3.1 Orders and templates

An order is shown as a **template**: a row of coloured, shaped tiles. Every variable has both a colour and a shape (■ blue, ▲ orange, ● green, ◆ purple, ★ red, ⬟ teal, ✚ pink, ⬢ sand), so colour-blind players lose nothing. A legend lists each variable's set. Scenario text uses two lines:

```
■=XYZ ▲=123 ●=A-Z
■ ■ ▲ ■ ■ ●
```

- **Repeated shapes are the same variable.** `■ ■ ▲ ■ ■ ●` already holds four copies of ■: free redundancy the player can learn to use.
- **Literals** are fixed neutral tiles (`■ - ▲` gives `B-2`). They carry no information.
- The number of possible orders decides whether the Codebook can enumerate them (§3.5).

### 3.2 HQ protocol: the transmission strip

The HQ protocol is one left-to-right row of tiles, and what you see is exactly what gets sent.

| Tile | Effect | First needed |
|---|---|---|
| **Source tile** (■, ▲ …) | Copies a variable's symbol. Placing the same source twice sends it twice. | I |
| **Literal tile** | A fixed marker (`[`, `]`, `1`, `2` …). Used for envelopes, separators and sequence tags. | I / V |
| **REPEAT ×n group** | Repeats a bracketed run of tiles n times. | II |
| **¬ badge** | Sends a symbol's partner instead (0↔1, or a defined pairing). | III |
| **Inline IF tile** | Two mini-strips; which one is sent depends on the order. | V (optional; core in VII) |
| **PARITY tile** | Parity over the variables the player picks. | III |
| **CHECK DIGIT tile** | SUM / WEIGHTED / SQUARES / CUBES mod 11 over the chosen variables, written 0–9 or X (=10). | IV |
| **REED–SOLOMON SEAL ×n** | n joint check digits. Each one adds exactly 1 to the distance. | after IV |

Interleaving and framing aren't tools. They come from **tile order** and **literals**: `■▲● ■▲● ■▲●` spreads copies apart (beats a barrage), `■■ ▲▲ ●●` keeps them together (survives a deletion), `[ ■ ▲ ● ]` is an envelope, `1 ■ ▲ 2 ● ◆ 3 ★ ⬟` is a sequenced packet stream. The player discovers these as arrangements they made, not items they unlocked.

### 3.3 Field protocol: two stages

**Stage 1: field work.** Plates run top to bottom and deal with damage that shifts positions or needs a decision.

| Plate | Purpose |
|---|---|
| STRIP OUT {set} | Remove symbols that can't belong (chatter, junk). |
| SWAP #i ↔ #j, FLIP #i | Local surgery, usually inside a decision. |
| OPEN ENVELOPE [ … ] | Keep what lies between markers. |
| REASSEMBLE pieces of n | Sort courier pieces by their tag. |
| REPAIR (Codebook) | Snap to the unique nearest valid transmission (SCATTER / BURST / EDIT). |
| IF … YES / NO | Conditions: symbol in set, two positions equal, the signal cut into n equal pieces that all match, parity even, signal is in the codebook, length. Branches nest. |
| SAY AGAIN | Request a full resend (return channel only; max 10 attempts; resends cost bandwidth). |

**Stage 2: assemble the order.** This row mirrors the template. Each variable reads from a received position (`#3`), a **majority VOTE** over positions (`VOTE #1 #4 #7`), or the ¬ of a position. HQ chose where each copy goes, and the field chooses where to read it back.

### 3.4 The Line: middlemen

Each relay is a patch card with a portrait, name and one-line trait, and fires with probability *p* per order (engine kinds in `engine.js`).

| Character (`kind`) | Effect | Real-world analogue |
|---|---|---|
| Pvt. Reliable (`pass`) | Nothing | Ideal channel |
| Pvt. Butterfingers, Worn Relay (`drop`) | Deletes one symbol | Deletion channel |
| Sgt. Chatter (`add`) | Inserts a symbol from a set | Insertion noise |
| Cpl. Muddle (`swap`) | Swaps two neighbours | Transposition |
| Radio Static, Solar Flare (`garble`) | Replaces one symbol | Substitution channel |
| Enemy Jammer (`flip`) | Flips one lamp | Binary symmetric channel |
| Monsoon (`smudge`) | One symbol becomes `?` | Erasure channel |
| Artillery, Cosmic Ray (`burst`) | Shreds L symbols in a row | Burst errors |
| Crowded Band, Deep Space Hiss (`pad`) | Wraps it in junk | Unsynchronised stream |
| Q.M. Clerk (`clerk`) | Typo or neighbour swap | Human transcription |
| Courier Corps (`shuffle`) | Pieces arrive in any order | Packet reordering |

Relays stack in order (Butterfingers *then* Chatter), and that order matters.

### 3.5 The Codebook machine and the CODE ANALYZER

From Sector III the field can requisition the **Codebook**. It knows the HQ protocol and lists every valid transmission (envelopes excluded). It can **REPAIR** a signal to the *unique* nearest valid transmission within a radius (ties or anything farther pass through unchanged), using **SCATTER** (Hamming), **BURST** (longest damaged stretch) or **EDIT** (Levenshtein) distance, with `?` smudges free in all three. It also answers **IF SIGNAL IS IN CODEBOOK**, the detection primitive behind ARQ. Reading the order back out is the assembly row's job, so a repaired signal is read from its positions like any other.

The **CODE ANALYZER** sits next to the strip and updates live. It shows minimum distance **d**; what that buys (fix ⌊(d−1)/2⌋ errors, detect d−1, fill d−1 smudges); **burst safety** and **single-deletion safety** on the levels that need them; and the **closest pair**, the two valid transmissions nearest each other with their differences highlighted. The closest pair is the most useful hint in the game.

**The mid-game shift.** Before the Codebook, the player writes decoders by hand as decision trees of IF PARITY and FLIP. After it, decoding is solved, and the puzzle becomes *designing a code with large d at low cost*, the same shift coding theory made historically. Later, the Codebook's own limit adds pressure: it won't enumerate more than ~20,000 orders. That pushes the player toward structured codes, whose distance comes from algebra instead of enumeration (§10).

### 3.6 Scoring, medals, ranks

- **Pass:** accuracy ≥ target (usually 100% of 300 orders) **and** average extra symbols ≤ budget, resends included.
- **Medals:** ★ complete · ★ efficient (overhead ≤ par) · ★ lean (equipment count ≤ par).
- **Ranks** are based on total stars across 25 ops (75 possible):

| Stars | 0 | 8 | 18 | 32 | 46 | 60 | 75 |
|---|---|---|---|---|---|---|---|
| Rank | 2nd Lt | Lt | Capt | Maj | Lt Col | Col | Brig. Gen. |

Brigadier General requires a perfect campaign. The finale's debrief salutes the player as "General" — the rank the campaign is pointing at.

### 3.7 Hints, Archive, Proving Ground

- **Sealed orders.** Up to three hint envelopes per op, opened in sequence with a wax-seal break. They escalate from the idea to the mechanism to the full build.
- **Archive.** One Field Manual entry per op, redacted until earned. Complete, it reads as a history of the field from 1917 to 1977.
- **Proving Ground.** A sandbox: write your own template and line and build against it with the full toolbox. It is the seed for the community editor (§7).

---

## 4. The arc

### 4.1 Escalation of abstraction

| Stage | Sectors | The player thinks in… | Example |
|---|---|---|---|
| **Concrete** | I | symbols and positions | "the digit might vanish, so send it twice" |
| **Procedural** | II, early III | rules and decision trees | "if the copies disagree, ask again" |
| **Structural** | III–IV | properties of the whole code (distance) | "no two valid transmissions within 2 flips" |
| **Algebraic** | IV–VI | sums, weights, joint seals | "two weighted sums locate the error" |

Each sector introduces one new channel threat and one new tool, then pairs or stacks it with earlier ones.

### 4.2 Narrative beats

- **I. The Trenches, 1917.** Runners and field telephones. The relays are people, the tone is muddy and personal. Beat: *the line is unreliable, but in predictable ways.*
- **II. The Radio War, 1942.** Static everywhere, and the return channel appears. Beat: *pay for safety, or ask again.*
- **III. The Jammer, 1950.** Signal lamps in binary, an adversary in the dark, and Cryptography sends a machine. Beat: *stop writing decoders and start designing codes.*
- **IV. Shells & Monsoon, 1960.** Damage in bursts and smudges, and the quartermaster's ledgers. Beat: *location is information, and digits allow cleverer checks than bits.*
- **V. The Network, 1974.** Shared wires, couriers, the protocol stack. Beat: *before you can fix a message you have to find it and line it up.*
- **VI. Deep Space, 1977.** No return channel, hours of light delay. Beat: *everything at once, with no second chances.*

### 4.3 The 25 operations

Encoder solutions are given in strip terms. "Anti" is the tempting approach that `web/tests/verify.js` confirms fails.

| Op | Name | Threat | Player must discover | Anti-solution defeated | Debrief |
|---|---|---|---|---|---|
| 1-1 | First Contact | none | the controls | n/a | The Chain (Shannon's diagram) |
| 1-2 | Idle Chatter | inserts 1/2/3 into A–D orders | noise outside the alphabet is free to remove | do nothing | Know Your Alphabet |
| 1-3 | Butterfingers | drops a digit | send ▲ twice (`■ ▲ ▲`); read ▲ from a position that survives either way | no redundancy | Redundancy / code rate |
| 1-4 | Rough Line | drop, then X/Y/Z chatter | clean before you read | trimming before stripping | Layers |
| 1-5 | Crossed Wires | neighbour swap, budget 0 | "letter first" structure detects and undoes the swap | n/a | Structure Is Redundancy |
| 1-6 | Mirror Images | swap on digit-digit orders | `■ ■ ▲` makes every swap readable | zero overhead | Know Your Channel |
| 2-1 | Static | 1 garble, single heading | three copies, majority | n/a | The Repetition Code |
| 2-2 | Full Orders | 1 garble, 3-symbol orders | vote per symbol | n/a | Vote Per Symbol |
| 2-3 | Two Bad Links | up to 2 garbles | 2t+1 copies | 3 copies | 2t + 1 |
| 2-4 | Say Again? | light static, tight budget | two copies + compare + SAY AGAIN | 3 copies (over budget) | ARQ |
| 3-1 | Lamp Signals | 1 flip, budget 3 | one parity lamp detects; ask again | two copies + ARQ | The Parity Bit |
| 3-2 | Hand-Built Seals | 1 flip, 2 lamps, no ARQ | seals over {■},{▲},{■▲}; a hand-written syndrome tree that FLIPs the guilty lamp | n/a | Syndrome Decoding |
| 3-3 | The Codebook | 1 flip, 4 lamps | three seals with distinct "watch patterns" → d=3 | seals over {■▲},{●◆},{all} (d=2) | The Hamming Code (1950) |
| 3-4 | Double Jamming | up to 2 flips, ARQ | a fourth seal → d=4: fix one, detect two | plain Hamming (repairs 2 flips wrongly) | SECDED |
| 4-1 | Barrage | burst of 3 | `■▲● ■▲● ■▲●`, copies spread apart | `■■■▲▲▲●●●` (one shell kills a whole vote) | Interleaving |
| 4-2 | Monsoon | 1 smudge, budget 1 | one parity tile fills a known gap | n/a | Erasures / RAID-5 |
| 4-3 | Quartermaster | typo or swap, ARQ | position-weighted check digit catches swaps | SUM check (blind to swaps) | Check Digits (ISBN-10) |
| 4-4 | No Retreat | 1 garble, no ARQ, budget 2 | SUM + WEIGHTED: size and position of the error → d=3 | two WEIGHTED checks (identical, d=2) | Reed–Solomon (1960) |
| 4-5 | Fog and Fire | smudge + garble | SUM + WEIGHTED + SQUARES → d=4 | two checks | The Singleton Bound (MDS); RS SEAL issued |
| 5-1 | Crowded Band | junk before and after | literal envelope `[ … ]` | n/a | Framing |
| 5-2 | Slipped Signal | 1 deletion | `■■ ▲▲ ●●` + EDIT repair | `■▲● ■▲●` + vote (one slip misaligns every later copy) | Synchronisation Errors (VT codes) |
| 5-3 | Courier Corps | 3-symbol pieces, any order | tag every two symbols: `1■▲ 2●◆ 3★⬟` | wrong piece size | Sequence Numbers (TCP) |
| 5-4 | The Long Wire | junk + smudge + garble | RS SEAL ×3 inside an envelope; open before repair | n/a | The Protocol Stack |
| 6-1 | Cosmic Rays | 2-bit burst, 8 bits | two Hamming codes on odd/even bits, seals alternating; BURST repair | one code over all 8 bits | Interleaved Codes |
| 6-2 | Voyager | junk + 2 garbles, no ARQ | RS SEAL ×4 (d=5) + envelope, repair radius 2 | RS ×3 | Voyager |

### 4.4 The designed "aha" moments

1. **1-5 / 1-6.** An order's own grammar is redundancy, so zero overhead can be enough. Then "21, or a swapped 12?" stays ambiguous until one extra symbol makes every outcome distinct. This is the player's first design *for* a channel.
2. **2-4.** Detecting an error is cheaper than correcting it: two copies + ARQ fit the budget where three copies don't.
3. **3-2.** The hardest manual level, on purpose. Building a syndrome table out of IF PARITY branches is tedious enough that the Codebook in 3-3 feels like a relief, not a crutch.
4. **3-3 / 3-4.** d becomes the score the player watches. Then a code "repairs" two flips into the wrong order *with confidence*, and the player learns that detection and correction trade against each other.
5. **4-1 vs 5-2.** The same tiles in mirrored order: spread copies apart to survive bursts, keep them together to survive deletions.
6. **4-4 → 4-5.** One check gives *how much*, a weighted one gives *how much × where*, and dividing them gives the position. Hitting d = r + 1, then being handed a tile that does it in one step, is the strongest "you invented this" moment in the game.
7. **6-2.** No new idea, everything at once: a victory lap that closes the arc.

---

## 5. Visual and audio direction

**Materials.** Paper, ink, canvas, brass, bakelite, phosphor. Everything should look issued: manila dossiers, stitched relay patch cards, an olive-enamel console with analog gauges, a log on teletype paper. Rubber stamps (DELIVERED, GARBLED in red, SAY AGAIN in amber) land at a slight angle with ink bleed.

**Palette.** Sepia and khaki paper, olive drab and gunmetal console, one saturated signal red for stamps and damage. The eight variable colours are tuned for legibility on paper and colour-blind separation. Dark mode swaps paper for blackout canvas rather than inverting.

**Era drift.** The chrome changes slowly by sector: trench-map ink (I), valve-radio glow (II), signal-lamp brass and punch cards (III), teleprinter ribbon (IV), green phosphor (V), mission-control amber CRT (VI). You should be able to tell the decade from the console.

**Typography.** Typewriter face for dossiers and log, stencil face for headings, monospace for tape tiles so positions line up.

**Motion.** A radar sweep and morse ticker on the title screen. The envelope travels at a readable pace, and relays shudder when they act. On the tape, insertions push neighbours apart, deletions close the gap, and garbles flip like a split-flap display. Gauge needles overshoot and settle. Nothing moves without carrying information.

**Sound.** All synthesized with WebAudio (`audio.js`): morse, teletype ticks, stamp thud, placement click, a double beep for SAY AGAIN, a bugle-style arpeggio for success, a falling two-tone for failure. One global mute.

*Built today:* the palette, typography, materials, stamps, gauges, travelling envelope, relay shudder, tape diff animation, synthesized sound, colour+shape variables and `prefers-reduced-motion`. *Still direction:* era drift, split-flap garbles, keyboard reordering of strip tiles and screen-reader labels.

**Accessibility.** Colour is never the only channel: variables have shapes, and stamps carry words. `prefers-reduced-motion` is honoured: the envelope jumps between stations, the radar is static, stamps appear without the drop. Every tile, plate and button is keyboard-operable with visible focus, and strip tiles reorder with arrow keys. Tiles have screen-reader labels ("blue square, variable ■, set X Y Z"). There are no timers and no reflex input, and every order can be replayed, so no information exists only in an animation.

---

## 6. Rediscovery map

| Concept | Where | How the answer stays hidden |
|---|---|---|
| Filtering, redundancy, code rate | 1-2, 1-3 | Briefings give facts ("never digits", "one extra symbol"); no tool is called "repeat digit". |
| Channel-specific design | 1-5, 1-6 | No generic fix exists; the player reasons about what Muddle can do. |
| Repetition, 2t+1, ARQ | II | Tools are mechanical (copy, vote, SAY AGAIN); the theory is named only in debriefs. |
| Syndrome decoding | 3-2 | PARITY is a tile, but the syndrome table is built from IF branches by hand. |
| Hamming(7,4), SECDED | 3-3, 3-4 | The analyzer shows only d; the player searches seal patterns. |
| Interleaving | 4-1, 6-1 | There is no INTERLEAVE tile; it is tile order. |
| Erasures | 4-2 | `?` is free to the Codebook; the d−1 vs ⌊(d−1)/2⌋ rate is felt before it is told. |
| Check digits, RS locator, Singleton | 4-3 – 4-5 | SUM/WEIGHTED/SQUARES are offered as plain arithmetic; hints frame location as division. |
| Framing, sequencing, stacks | V | Envelopes and tags are just literal tiles; layers are plates the player orders. |

---

## 7. Future expansions

### 7.1 Sector VII+: level sketches

Each sketch lists a new threat, new tool, the discovery and the concept named afterward.

| Working title | Fiction and new mechanic | Player discovers | Debrief |
|---|---|---|---|
| **Airdrop** | Supply crates parachuted; some are lost. New tile: **MIXED CRATE** (sum of chosen variables). Field: **UNPACK** peels crates one at a time. | *Any* k of n crates suffice, with no need to know which will be lost. | Fountain / LT codes (Luby 2002) |
| **Rumour Mill** | Orders too long for the Codebook. Sparse PARITY tiles; field plate **ASK THE NEIGHBOURS ×n** animates gossip over a village graph. | Many cheap local checks, resolved by iterated local voting, beat one big lookup. | LDPC, belief propagation (Gallager 1962) |
| **Convoy in the Fog** | A streamed order with no block boundary. **SHIFT REGISTER** tile; field **TRACK CONVOY** draws a trellis of surviving routes. | Memory in the code; keep only the best route into each state. | Convolutional codes, Viterbi (1967), Voyager's inner code |
| **Signal Strength** | Each received symbol has a strength bar; **REPAIR SOFT** trusts weak symbols less. | A faint symbol is half an erasure. | Soft-decision decoding |
| **Lost Letters** | Deletions on orders too long to stutter. CHECK DIGIT mode **POSITION SUM mod (n+1)**. | One deletion costs about log n symbols, not n. | Varshamov–Tenengolts codes |
| **The Polynomial Clerk** | Long binary telegrams, ARQ. **LONG DIVISION** tile. | A remainder catches every burst up to its length. | CRC |
| **Polarization** | Pair relays so one route improves and one degrades; literals on bad routes are "frozen". | Send only on the channels that became good. | Polar codes (Arıkan 2009, 5G) |
| **The Clever Jammer** | An adversary with a budget attacks your *closest pair*. | Luck stops working; only d counts. | Adversarial vs random channels |
| **Two Roads** | Two independent lines; field plate **COMPARE ROUTES**. | Independent failures rarely coincide. | Diversity combining |
| **Telegram Rates** | Skewed order frequencies; inline **IF** tile gives common orders short strips; analyzer checks prefix-freeness. | Compress first, then add protection back deliberately. | Huffman (1952), source–channel separation |

Two prototype pitches are worth reviving as side ops: confusables with escaping (O/0, I/|) and corrupted framing markers.

### 7.2 Systems

- **Community level editor.** Extend the Proving Ground with equipment selection, budget/par, briefing and hints. Levels are shared as a URL hash, with no server needed. Authors must submit a passing solution, which the engine verifies.
- **Daily dispatch.** One seeded template + line per day, with a fixed exercise seed so results are comparable. Scored on overhead and tile count.
- **Solution histograms** (Zachtronics-style). Show where the player's overhead and tile count fall among other players. This needs a minimal backend or bundled static data.
- **"Codes you've built" gallery.** Each passing strip shown with its analyzer readout.

---

## 8. Technical notes

- **Stack.** A pure static web app (`web/index.html` + plain JS), with no build step and no dependencies.
- **Modules.** `engine.js` (simulation, strip encoder, codebook, analyzer; DOM-free), `levels.js` (campaign data), `blocks.js` (field plates and tool specs), `strip.js` (HQ strip + assembly row editors), `editor.js` (field-work plates), `app.js` (screens, modals, save), `art.js` (SVG), `audio.js` (WebAudio).
- **Determinism.** A seeded RNG drives sampling and the channel, so any order replays exactly.
- **Verification.** `node web/tests/verify.js` runs the engine in Node. For every level it checks that the reference solution passes on 8 seeds × 300 orders within budget and par, and that the `ANTI` approaches fail. It also prints d / burst / deletion readouts. Keep it green.
- **Save.** `localStorage`: medals, bests, programs per op, hints opened, sector progress, mute, sandbox.
- **Adding a level.** Add a `LEVELS` entry (id, sector, name, template, chain, equipment, arq, target, budget, par, repair modes, metric, briefing, 2–3 hints, debrief, reference `solution`). Add a tempting wrong approach to `ANTI`. Tune budget and *p* until the reference passes on every seed and the anti fails on every seed. Write the debrief last. Reference solutions use the strip notation (`■ ▲ ● ◆ P(■▲◆)`, `"["`, `3x( … )`, `SUM/W/SQ/CUBE(…)`, `RS4`) parsed by `engine.parseStrip`.

---

## 9. Lineage: what changed from the Python prototype

The Python/Tk prototype (not included in this repository) set up the loop that survived (format → encoder → middlemen → decoder → accuracy vs overhead) and the rule that levels are read-only. These changed:

- **Free node graph → strip + nested plate list.** Easier to read and still expressive enough.
- **Generic string ops → meaningful tools.** `SLICE` and `FREQ_SORT` were dropped. Shortcuts like `HAMMING74_ENCODE` were rejected because they hand over the answer (pillar 2).
- **Slot formats → templates** with repeated variables and literals.
- **Pitches adopted:** framing (L04), interleaving (L05), adjacent swaps (L06), erasures (L09), Hamming (L12), block permutation → Courier Corps (L13). The rest (length cues, comma codes, escaping, marker corruption, align-and-vote, adversary, dual path) feed §7.

---

## 10. Open questions and risks

1. **Strip expressiveness.** PARITY and CHECK tiles cover *variables*, not earlier check tiles. That is enough mathematically: SECDED's overall parity equals a parity over ■▲● when the seals watch {■▲◆},{■●◆},{▲●◆}. But it hides the textbook "overall parity bit", so the 3-4 debrief must bridge it. Does 6-1's alternating seal order still read as interleaving?
2. **Field-side staleness.** After 3-3 most decoders are REPAIR → assemble. Late levels need field puzzles too (framing, reassembly, decisions).
3. **Codebook scale.** REPAIR is brute force (≤ ~20,000 orders). The analyzer is exact only up to 1,500 codewords. RS seals cap at 10 digits (mod 11). Bigger orders need algebraic RS repair, or the "codebook too large" wall should become an intended puzzle (Rumour Mill).
4. **Randomness vs certainty.** 100% of 300 random orders can pass a flawed code by luck or fail a good one on budget variance. Options: fixed exercise seeds, or a "certify" mode that uses the analyzer for worst cases.
5. **Difficulty spikes.** 3-2 (hand-built syndrome tree, par 7 equipment) and 4-4 (algebraic leap) are the likeliest quit points. Watch hint-open rates there.
6. **Thin finale.** Sector VI has two ops. Candidates: interleaved RS (the real CD/Voyager structure), and junk + slips + bursts combined.
7. **Name leakage.** "REED–SOLOMON SEAL" and "WEIGHTED" are on tiles. Rename by function until the debrief? Should the third (full-build) hint cost a medal?
8. **Templates change counts.** Repeated variables shrink the order space, so budgets and pars must be re-derived per template.
9. **Equipment accounting.** Plain tiles, literals, repeat brackets and single-position reads are free; tools, plates, votes and ¬ count. Watch whether players read "lean" as intended or game it with tile copies instead of REPEAT (both are free by design).
