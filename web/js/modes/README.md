# Special-mission modes

A level with `mode: '<name>'` is played through `CoC.modes[<name>]` instead of the HQ strip + field
editors. Each mode lives in one file, `js/modes/<name>.js`, plus its stylesheet `css/mode-<name>.css`.
The file registers the mode **and pushes its own levels** into `CoC.data.LEVELS`. It must load in Node
without a DOM (only touch `document` inside `mount`/`test`), because `tests/verify.js` loads it.

## Level fields (in addition to the usual `id, name, briefing, hints, debrief`)

| field | meaning |
|---|---|
| `mode` | the mode name |
| `goal` | one-line goal shown in the mission top bar, e.g. `"≤ 1900 bits for 1000 letters"` |
| `objectives` | array of strings for the briefing |
| `medalCaptions` | 3 strings: complete / efficient / lean — shown in the report and as tooltips |
| `template`, `chain` | optional: if present the order template and relay line are shown in the line panel |
| `enc`, `dec` | tools issued (for "NEW" badges); may be `[]` |
| `hints`, `debrief` | as for normal levels |
| `solution` | `{ state }` — a passing design, checked by `tests/verify.js` |
| `anti` | array of `state`s that must NOT pass (the tempting wrong designs) |

Campaign placement lives in `js/theater-data.js` (sectors, gates, raids) — reference levels by `id`.

## Mode object

```js
CoC.modes.<name> = {
  // ---- logic (DOM-free) ----
  defaultState(level) -> state                 // JSON-serialisable player design; saved per level
  evaluate(level, state, opts) -> {
    passed: bool, medals: [bool, bool, bool],
    summary: 'one line',                         // console line under OBJECTIVES MET / NOT YET
    gauges: [{ frac: 0..1, text, ok }, { frac, text, ok }],   // the two console gauges
    log: [{ ok: true|false|undefined, text, data? }],         // teletype lines; data → replay via test()
    stats: [{ label, value, note? } ×3],         // the after-action report boxes
    avgOverhead?: number, blocks?: number,       // optional "your best" tracking
  }
  // opts.seed may be given (tests use fixed seeds); otherwise randomise.

  // ---- UI ----
  hideLine?: bool                                // hide the relay-line panel for this mode
  gauges?(level) -> [{ title, zone: [f0, f1] }, { title, zone: [f0, f1] }]   // console gauge titles + green zones
  runningText?: 'TRANSMITTING…'
  briefingHTML?(level, api) -> html              // replaces the Orders / Line sections of the briefing
  mount(root, api) -> { destroy?(), render?() } // root = #mode-root (spans the HQ + Field columns)
  test?(api, data?) -> Promise                   // TEST TRANSMISSION (animated single run); data = replay
}
```

`api` (from app.js `modeApi()`): `level, getState(), setState(s), changed()` (call after every edit —
it saves and marks results stale), `line.{tape(before, after), label(t), note(t, cls), stamp(kind, text), el}`,
`toast, sfx, art, engine, esc, tiles(str), renderTemplate(level, el), sleep(ms), isDone(id)`.

The editors in `js/strip.js` (`CoC.StripEditor`, `CoC.AssemblyEditor`) are reusable inside a mode.
Shared look: use the CSS tokens on `:root` in `css/style.css` (`--paper`, `--ink`, `--brass`, `--olive-*`,
`--red`, `--f-stencil`, `--f-type`, `--f-mono`, …) and existing classes (`.panel`, `.btn-chip`,
`.btn-stamp`, `.tile`, `.tpl-cell`, `.popover`).
