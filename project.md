# NUL — Project Handoff

> **Start here in a new session.** This file captures the user’s goals, the `SUBSTRATE/0.2` (`v0.02.001`) implementation, release history, test results, and standing constraints.

## 1. Project summary

NUL is an **offline, non-LLM artificial-life experiment and desktop companion** (`v0.02.001` · `SUBSTRATE/0.2`).

The original `v0.01` (`BOOTSTRAP/0.1`, finalized and released as `v0.01.003`) proved deterministic zero-LLM semantic bootstrapping over discrete signals. **`v0.02.001` (`SUBSTRATE/0.2`)** removes pre-defined substrate objects, pre-drawn grids, and pellet-eating rules altogether:

1. **Zero pre-defined substrates or preset verbs:** The world is an unlabelled **4-channel continuous reaction-advection-diffusion medium** (`32×20×4` `Float32Array`: two fast wave/gradient channels + two slow plastic/structural channels) whose conservative physics constants are generated per seed. Viability is homeostatic rather than food-based.
2. **Agent-defined canvas (`Combined` / `Agent` / `Medium` lenses):** The agent autonomously segments coherent regions (`loci`) with 8-ray organic contours, inscribes stigmergic `marks`, and sculpts persistent slow-channel `structures` (`artifacts`) that physically anchor and redirect future medium dynamics.
3. **4-stage causal cognitive cycle (`pyai`-inspired):** Every 8-tick motor episode runs **PurposeSeed → Proposer / Critic / Synthesizer → Anchored Execution → Operational Δ Evaluation**, comparing `predictedDelta[4]` against `actualDelta[4]` (`completion`, `accuracy`, `efficiency`, `overall`) and crystallizing repeatable continuous gestures `(biasAngle, thrust, coupling[4])` into reusable motor `MacroOperators` (`μ01`–`μ08`).
4. **Meaning with or without ontology:**
   - **Emergent** *(default)*: starts strictly ontology-free (`0` concepts at `T+0`) and mints glyphs, names, self-symbol, and fallible causal beliefs only under trace compression pressure, with Critic belief falsification when predictions fail.
   - **None** *(strictly ontology-free)*: permanently suppresses lexical symbols and beliefs (`0` concepts, `0` beliefs) while full causal control, operator discovery, contour segmentation, and canvas sculpting continue unabated.
   - **Imported**: transplants `nul-ontology` (`v1` or `v2`) into any seed so the Critic evaluates and falsifies foreign concepts/beliefs against new physics without mutating world PRNG.

## 2. User priorities and constraints

1. **No LLM and no runtime network dependency.** Strictly symbolic/statistical rules, typed arrays, and seeded PRNG—never neural networks, prompts, or external APIs.
2. **Agent-defined world & canvas.** Do not pre-author object categories ("food", "rock") or preset verbs ("eat", "mine"); let the agent segment loci, discover motor operators, and sculpt structures that reshape the world further.
3. **Persistent deterministic worlds.** Reloads, snapshots, and restarts must restore exact state (including lossless `Float32Array` medium serialization).
4. **Sticky Lab & Desktop Companion experience.** Keep the locked-topbar Lab & compact Companion (`360×480`) core layout intact in one shared simulation window.
5. **Honest RAM reporting.** Electron requires ~259–335 MB PSS (exceeding a strict 256 MB ceiling), whereas the single-process terminal companion (`npm run start:tui`) and pure engine stay well under 256 MB (~32–81 MB PSS).

## 3. Release & branch status

- **`v0.01` line (finalized):** Final cross-OS desktop release **`v0.01.003`** published at `https://github.com/tigersmith12/_NUL/releases/tag/v0.01.003` (`AppImage`, `dmg`, `zip`, `win-portable.exe`, `win-setup.exe`, `SHA256SUMS.txt`).
- **`v0.02` line (active):** Flagship **`v0.02.001` (`SUBSTRATE/0.2`)** synced to SemVer `0.2.1`.

## 4. Current file map

| Path | Purpose |
| --- | --- |
| `index.html` | Semantic browser/desktop shell with sticky `.topbar`, Canvas lens switcher (`Combined`/`Agent`/`Medium`), Ontology mode bar (`Emergent`/`None`/`Import`), Causal Cycle card, and Discovered Operators view |
| `src/engine.js` | Pure zero-dependency, DOM-free `SUBSTRATE/0.2` engine (`32×20×4` `Float32Array` medium, 4-stage `PurposeSeed → Critic → Δ Evaluation` loop, macro-operator crystallization, lossless base64 `SAVE_VERSION = 2` snapshots, `ONTOLOGY_VERSION = 2` + `v1` import) |
| `src/app.js` | Browser & Electron UI controller, multi-lens Canvas 2D renderer (organic `Path2D` contours, agent imprint field, stigmergic marks, sculpted structures), autosave (`nul.world.autosave.v2`), and `window.__NUL_LAB__` hook |
| `src/styles.css` | Stylesheet with sticky Lab `.topbar`, sticky `.mind-panel`, sticky `<dialog>` headers, `.lens-modes`, `.ont-mode-bar`, `.causal-card`, `.macro-card`, and Companion layout |
| `desktop/main.cjs` | Electron lifecycle, single BrowserWindow, companion/lab switching, tray, pinning, window state, native JSON save dialogs, low-memory mode |
| `desktop/preload.cjs` | Context-isolated IPC bridge exposed as `window.nulDesktop` |
| `assets/icon.png` | Generated 512×512 application/tray icon |
| `scripts/check-naming.mjs` | Validator & version sync utility (`v<M>.<MM>.xxx` branches ↔ `[v<M>.<MM>.<PPP>]` PRs ↔ SemVer `package.json`, `src/engine.js`, `index.html`) |
| `scripts/headless-harness.mjs` | Fast Node `vm` + native-JIT `NULCore` UI/DOM test harness |
| `scripts/sandbox-server.mjs` | Zero-dependency `0.0.0.0` HTTP preview server (`npm run start:sandbox`) |
| `scripts/companion-tui.mjs` | Single-process `< 85 MB` PSS terminal companion (`--save`, `--ontology-mode`, `--import-ontology`, `--export-ontology`) |
| `scripts/inspect-world.mjs` | CLI world runner & causal/ontology inspector (`npm run world:inspect`) |
| `scripts/measure-memory.mjs` | Live PSS/RSS & 100,000-tick soak profiler (`npm run bench:memory`) |
| `tests/*.test.mjs` | 26 automated `node:test` checks (`naming`, `ontology`, `simulation`, `soak`, `substrate-v2`, `ui-layout`) |
| `.github/workflows/desktop-builds.yml` | Cross-OS Windows/macOS/Linux Electron build + `SHA256SUMS.txt` + GitHub Release publisher |
| `.github/workflows/branch-naming.yml` | Fast CI gate enforcing branch/PR/tag naming & version sync |

## 5. Persistence & compatibility

1. **Resumable world snapshots (`nul-resumable-world` `v2`)** store lossless IEEE-754 base64 representations of `field` (`32×20×4` `Float32Array`) and `imprint` (`32×20` `Float32Array`), plus `worldPhysics`, `loci`, `artifacts`, `macros`, `causalTraces`, `marks`, `lastCycle`, `ontologyMode`, `canvasLens`, and exact `mulberry32` PRNG state (`< 65 KB` even after 100,000 ticks).
2. **Portable ontologies (`nul-ontology` `v2`, backward-compatible with `v1` & `v0.01.002`)** store `concepts`, `beliefs` (including `falsifications`), `macros`, `relationCounts`, `generatedOperators`, `selfSymbol`, and `selfGlyph`. Importing sets `ontologyMode = 'imported'` without altering world seed or PRNG state.

## 6. Measured RAM & performance (`v0.02.001`)

Linux `smaps_rollup` PSS + V8 heap profile (`npm run bench:memory`, `seed 8675309`):

| Stage | Tick | Single-Process PSS | V8 Heap | Lossless Snapshot | Concepts | Structures | `usedNames` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | `T+0` | `32.34 MB` | `4.45 MB` | `18.7 KB` | `0` | `0/0` | `0` |
| Evolved | `T+3,000` | `44.71 MB` | `4.93 MB` | `57.9 KB` | `3` | `12/12` | `16` |
| Extended soak | `T+100,000` | `81.44 MB` | `5.27 MB` | `63.7 KB` | `7` | `24/108` | `32` |

- **100,000-tick soak runtime:** `~5.3 seconds` (`26/26` automated tests pass in `~8.9 seconds`).
- **Desktop Electron footprint:** `~259–284 MB PSS` (`--low-memory`) / `~307–335 MB PSS` (standard).

## 7. Validation suite (`npm test` — 26 tests)

- `tests/naming.test.mjs` — SemVer ↔ `v<M>.<MM>.<PPP>` mapping, branch/PR/tag rules, version sync, and JS syntax checks.
- `tests/ontology.test.mjs` — `v2` ontology export/import round-trips (including `macros`), `v1` / `v0.01.002` backward compatibility, PRNG invariance, and malformed/snapshot rejection.
- `tests/simulation.test.mjs` — 1,500-tick seed determinism, lossless `Float32Array` snapshot restore (`+1` & `+120` ticks), viewport coordinate scaling, malformed snapshot rejection, blocked `localStorage` fallback, and non-perturbing entity inspection.
- `tests/soak.test.mjs` — Reload artifact deduplication and 100,000-tick soak bounds (`< 65 KB` snapshot, bounded collections and `usedNames`).
- `tests/substrate-v2.test.mjs` — Pre-symbolic `T+0` birth → trace-pressure concept emergence, permanent `ontologyMode="none"` causal control (`0` concepts/beliefs forever while macros/loci/structures thrive), 4-stage `PurposeSeed → Critic → Δ Evaluation` cycle, and `Combined`/`Agent`/`Medium` lens rendering invariance.
- `tests/ui-layout.test.mjs` — Sticky `.topbar`/`.mind-panel`/dialog CSS, `100dvh` iframe sizing, `?mode=companion` boot, packaging asset parity, and `world:inspect` CLI JSON output.
