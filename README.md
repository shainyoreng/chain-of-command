# Chain of Command

A signal-corps puzzle game. Command writes an order; a chain of faulty relays mangles it on the way to the front. You build the **HQ protocol** (how the order is transmitted) and the **field protocol** (how it is read back), and as you push the front forward you rediscover the real ideas behind modern communication: repetition, majority vote, retransmission, parity, Hamming codes, interleaving, erasures, check digits, Reed–Solomon, framing, sequence numbers, routing, channel identification, compression (Huffman) and authentication (challenge–response).

The game design and roadmap live in [GAME_DESIGN.md](GAME_DESIGN.md).

## Play

**Play online: https://shainyoreng.github.io/chain-of-command/**

The game is a static web page — no build step, no server code.

- **Locally:** open [web/index.html](web/index.html) in a browser (double-clicking works), or serve the folder:
  ```bash
  cd web
  python -m http.server 8000      # then visit http://localhost:8000
  ```
- **On a website:** upload the contents of `web/` to any static host. This repository deploys `web/` to GitHub Pages on every push to `main` (`.github/workflows/pages.yml`).

Add `?unlock` to the URL to open every operation (for testing): `index.html?unlock`.

Progress, medals and your protocols are saved in the browser's `localStorage`.

## How it plays

1. On the theater map — 21 sectors in four tiers, 71 operations — attack an enemy sector that borders your territory; the map zooms in to that sector's plan of advance. Capturing every objective takes the sector and opens the enemy sectors behind it — the campaign branches. Deeper tiers need stars; "contact lost" missions (authentication) guard three sectors; optional commando raids (compression) appear behind the lines. Winning the war plays a victory finale.
2. **HQ protocol** — build the transmission as a strip of tiles: copies of the order's symbols, literal markers, repeat groups, and (as you advance) parity tiles, check digits and Reed–Solomon seals.
3. **Field protocol** — clean the signal with field-work plates (strip noise, open envelopes, reassemble pieces, repair with the Codebook machine, branch on checks, ask HQ to SAY AGAIN), then assemble the order by choosing where each symbol is read from.
4. **Test transmission** shows one order travelling the line. **Field exercise** sends 300 orders; you pass when enough arrive intact within the bandwidth budget. Failed orders in the log can be replayed.
5. The **Proving Ground** lets you write your own order template and line.

## Project layout

```
web/
  index.html          page shell (all screens)
  css/style.css       game look: map, line, dossiers, console, plates
  css/strip.css       HQ strip and assembly-row editors
  css/theater.css     the theater map
  css/tape.css        test-transmission tape effects
  css/routing.css     route networks and hidden lines
  css/mode-*.css      special-mission modes
  js/engine.js        simulation: templates, strip encoder, channel (+effect records), decoder, codebook, analyzer, routes (no DOM)
  js/blocks.js        field-work plates and tool descriptions
  js/levels.js        characters, ranks and the core strip/field operations with reference solutions
  js/levels-*.js      further level packs (early & pass, marshes & capital, depot, forest & rail yard,
                      harbour & citadel, cipher school, rotor works)
  js/theater-data.js  the front: sectors, borders, gates, raids and the progression rules
  js/theater.js       the theater map: sectors, units, zoom, advance and capture animations
  js/modes/           special-mission mechanics as plug-ins (compress.js, auth.js; contract in README.md)
  js/routing.js       route networks (pick a path segment by segment) and black-box lines
  js/tape.js          physically accurate tape animations for TEST TRANSMISSION
  js/strip.js         HQ strip editor + assembly row editor
  js/editor.js        field-work plate editor (drag, nest, tune)
  js/art.js           inline SVG art (insignia, stations, medals, map symbols)
  js/audio.js         synthesized sound effects
  js/app.js           screens, map, animation, exercises, reports, archive, proving ground
  tests/verify.js     checks every level is solvable and that the obvious wrong approaches fail
```

## Verify the campaign

```bash
node web/tests/verify.js
```

Checks the theater graph (borders symmetric, every sector reachable, every mission placed once), runs every operation's hidden reference solution over 8 seeds, checks it meets the budget and medal pars, and confirms each level's "anti-solutions" (the tempting wrong approaches) fail. `--strict` also fails on missions the theater references but nobody has built.

## Adding a level

Append an entry to `LEVELS` in [web/js/levels.js](web/js/levels.js) and place its id in a sector's `missions` in [web/js/theater-data.js](web/js/theater-data.js). For a new kind of mission, write a mode in `web/js/modes/` (see its README). The header comment documents every field. Give it a `solution` in strip notation (for example `■ ▲ ● ◆ P(■▲◆) P(■●◆) P(▲●◆)`), then run the verifier. Order templates can use shared variables and literals: `template: '■=XYZ ▲=123\n■ ■ ▲ ■'`.

## The Python prototype

The game began as a Python prototype (Dear PyGui / Tkinter). The web version supersedes it, and the prototype is not part of this repository.
