# NUL — Project Handoff

> **Start here in a new session.** This file captures the user’s goals, the current implementation, test results, constraints, and unresolved decisions. Application code was frozen at handoff; the subsequent request was limited to preparing the source for GitHub import.

## 1. Project summary

NUL is an **offline, non-LLM artificial-life experiment and desktop companion**.

The original request was to place an AI in a world with no semantic knowledge and let it define things on its own. The user specifically requested a non-LLM approach, referencing early symbolic AI. The implementation therefore uses hand-written rules, vector similarity, episodic memory, seeded randomness, and generated symbols—not a language model, neural network, training corpus, prompt, API, or cloud service.

The agent begins without object names, a taxonomy, a dictionary, semantic values, authored world laws, or a final objective. During a run it can:

- Differentiate raw four-number sensations into prototype concepts
- Generate names and glyphs for those concepts
- Learn positive or negative associations from contact outcomes
- Select intents using learned associations, energy, and novelty
- Store episodic memories
- Infer fallible repeated-sequence beliefs
- Assign a persistent self-symbol
- Combine concepts into named persistent artifacts

This is an experiment in **semantic bootstrapping**, not a consciousness or AGI claim. The mechanisms—time, a body, energy, sensory vectors, memory, similarity clustering, movement, attention, and combination—are engineered. Observer translations are interface scaffolding, not meanings supplied to the agent.

## 2. User priorities and constraints

1. **No LLM and no runtime network dependency.** Preserve this unless the user explicitly changes direction.
2. **Persistent worlds.** Reloads and app restarts must restore the same running agent, not start over.
3. **Desktop-companion experience.** Small, draggable, pinnable window with a full lab view and tray behavior.
4. **Accessible distribution.** Packaged recipients should not need Node, npm, source files, API keys, or internet access.
5. **Desired RAM ceiling: about 256 MB total.** The current Electron version does **not** reliably meet this requirement. Do not claim otherwise.
6. **Transparency.** Clearly distinguish hard-coded mechanisms from emergent run state and distinguish source builds from recipient-ready installers.

## 3. Current file map

| Path | Purpose |
| --- | --- |
| `index.html` | Semantic browser/desktop shell loading `src/styles.css`, `src/engine.js`, and `src/app.js` (works over `file://`, HTTP, and Electron) |
| `src/engine.js` | Pure zero-dependency, DOM-free deterministic simulation, snapshot persistence, and `nul-ontology` export/validate/import core (`globalThis.NULCore` + CommonJS export) |
| `src/app.js` | Browser & Electron UI controller, Canvas 2D renderer (with cached `monoFont`), sticky Lab/Companion modes (`?mode=companion` supported), autosave, and `window.__NUL_LAB__` hook |
| `src/styles.css` | Stylesheet with sticky Lab `.topbar`, sticky `.mind-panel`, sticky `<dialog>` headers, `100dvh` iframe viewport rules, and Companion layout |
| `desktop/main.cjs` | Electron lifecycle, single BrowserWindow, companion/lab switching, tray, pinning, window state, native JSON save dialogs, low-memory mode |
| `desktop/preload.cjs` | Context-isolated IPC bridge exposed as `window.nulDesktop` |
| `assets/icon.png` | Generated 512×512 application/tray icon |
| `package.json` | Node engine, Electron scripts, `world:inspect` CLI, electron-builder targets (`src/**/*` included), app metadata |
| `package-lock.json` | Locked development/build dependencies |
| `scripts/check-naming.mjs` | Zero-dependency validator & version sync utility (`v<M>.<MM>.xxx` branches ↔ `v<M>.<MM>.<PPP>` PRs ↔ SemVer `package.json` & `src/engine.js`) |
| `scripts/headless-harness.mjs` | Zero-dependency Node `vm` UI/DOM harness executing `src/engine.js` + `src/app.js` |
| `scripts/sandbox-server.mjs` | Zero-dependency `0.0.0.0` HTTP preview server (`npm run start:sandbox`) |
| `scripts/companion-tui.mjs` | Single-process `< 50 MB` PSS terminal companion importing `src/engine.js` directly (`--save`, `--import-ontology`, `--export-ontology`) |
| `scripts/inspect-world.mjs` | Fast CLI world runner & ontology inspector (`npm run world:inspect`) |
| `scripts/measure-memory.mjs` | Live PSS/RSS & 100,000-tick soak budget profiler (`npm run bench:memory`) |
| `scripts/binaries-mirror.mjs` | Syncs GitHub Release desktop binaries into a standalone binaries branch (`binaries/v0.01`) without bloating source history |
| `scripts/generate-checksums.mjs` | Cross-platform `dist/SHA256SUMS.txt` generator for desktop builds |
| `scripts/verify-dist.mjs` | Cross-platform built binary & checksum verifier (`win` / `mac` / `linux`) |
| `tests/naming.test.mjs` | `node:test` suite for branch/PR/tag rules, version sync, and JS syntax integrity |
| `tests/ontology.test.mjs` | `node:test` suite for `exportOntology` / `importOntology` cross-seed transplants, PRNG non-perturbation, legacy `v0.01.002` compatibility, and malformed/snapshot rejection |
| `tests/simulation.test.mjs` | `node:test` suite for seed determinism, snapshot round-trips, viewport scaling, malformed import rejection, blocked storage, and canvas inspection |
| `tests/soak.test.mjs` | `node:test` suite for reload deduplication and 100,000-tick entity/name/snapshot bounds |
| `tests/ui-layout.test.mjs` | `node:test` suite for sticky `.topbar`/`.mind-panel`/dialog headers, `100dvh` iframe rules, `?mode=companion`, asset packaging parity, and `world:inspect` CLI |
| `.github/workflows/desktop-builds.yml` | Native Windows/macOS/Linux build matrix with pre-build test gate, checksum generation, and artifact verification |
| `.github/workflows/branch-naming.yml` | Fast CI check validating branch names, `[vX.Y.Z] <type>: ...` PR titles, tags, and version sync |
| `.github/pull_request_template.md` | Pull request checklist & `[vX.Y.Z] <type>: <summary>` title guide |
| `README.md` | User/developer instructions, persistence, distribution, controls, versioning, and RAM measurements |
| `LICENSE` | MIT license |
| `.gitignore` | Excludes dependencies, build outputs, logs, OS metadata, and local signing secrets |
| `.gitattributes` | Normalizes source line endings and marks binary formats |
| `GITHUB.md` | Branch, PR, tag, and version naming scheme plus GitHub Actions release instructions |
| `project.md` | This handoff and session-continuity guide |

There is also a convenience archive outside the project directory at `/home/user/nul-desktop-source.zip`. The repository files are the canonical source going forward.

## 4. Runtime architecture

### Browser

`index.html` can run directly in a modern browser with no installation or server. It has no external URLs or runtime dependencies. The simulation runs at **12 ticks per second per speed multiplier**, with 1×, 2×, 4×, and 8× controls. Canvas rendering uses `requestAnimationFrame`.

The browser also supports a compact companion-layout preview. Native window behavior is enabled only when the Electron preload API is present.

### Desktop

The desktop shell uses **Electron 45.2.3** and electron-builder **26.18.0**. Development requires **Node 22.12 or newer**.

Important design choice: lab and companion modes use **one BrowserWindow and one simulation**. Switching modes resizes/reconfigures the same window; it does not launch a second agent that could overwrite the autosave.

Desktop features include:

- 360×480 default companion window
- Draggable companion bar
- Always-on-top pin/unpin
- Full lab restoration
- System tray menu; close/hide sends to tray when tray support exists
- Single-instance lock
- Native window controls
- Native JSON save dialogs
- Persisted window bounds, mode, and pin state
- Context isolation, no renderer Node integration, sandboxed renderer, and blocked new windows

Window state is stored as `window-state.json` under Electron’s `userData` directory. `NUL_USER_DATA_DIR` can override that directory for testing.

## 5. Persistence design

There are two distinct portable formats:

1. **Resumable world snapshots (`nul-resumable-world` `v1`)** contain the full simulation, viewport, active entities, and PRNG state.
2. **Portable ontologies (`nul-ontology` `v1`)** export and import the agent’s learned mind (`concepts`, `beliefs`, `relationCounts`, `generatedOperators`, `selfSymbol`, `selfGlyph`) into any world seed without overwriting the destination world’s seed or consuming PRNG state (also backward-compatible with `v0.01.002` ontology exports).

Autosave details:

- Browser storage key: `nul.world.autosave.v1`
- Snapshot format: `nul-resumable-world`
- Snapshot version: `1`
- Saves every 120 simulation ticks, on pause, after manual perturbations, and on page close/hide
- Startup automatically restores the latest valid autosave
- Includes agent, concepts, memories, beliefs, artifacts, active signals, particles, transcript, speed, running state, viewport dimensions, and PRNG position
- Includes validation and safe failure for malformed imports
- Portable snapshots can be imported in another browser or desktop profile

Browser storage is local to the browser/site and can be deleted by clearing site data. Embedded sandboxed previews may block storage; downloadable snapshots are the fallback. There is no account system or cloud synchronization.

## 6. Commands

### Run from source

Requires Node 22.12+:

```bash
npm install
npm start
```

Optional reduced-overhead mode:

```bash
npm run start:low-memory
```

Equivalent direct flag:

```bash
electron . --low-memory
```

`NUL_LOW_MEMORY=1` is also supported. This mode disables hardware acceleration and selected Chromium background services. It is **not a hard RAM cap**.

### Naming & version checks

```bash
npm test
npm run check:naming
npm run branch:suggest -- feat short-description
npm run version:next
```

- **Version-line branches:** `v0.01`, `v0.02`, …
- **Working branches:** `<type>/v<M>.<MM>.xxx-<short-name>` (`feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `chore`, `exp`), plus `release/v<M>.<MM>.xxx`.
- **Pull requests:** `.xxx` resolves to the 3-digit PR sequence number (`.001`, `.002`, …), e.g. `[v0.01.001] build: establish v0.01.xxx branch and PR naming scheme` (also accepts `<type>/v0.01.001-<short-name>`).
- **Arena session branches:** `arena/<id>-<slug>` names are fixed by Arena; bump with `npm run version:next` (or `version:set`) and put the resolved `[v<M>.<MM>.<PPP>] <type>: <summary>` in the PR title.
- **Version sync:** `package.json` / `package-lock.json` store SemVer without leading zeros (`"0.1.1"`), mapped 1-to-1 to `v0.01.001` in `index.html` (`APP_VERSION` + `#brand-version`, `#controls-version`, `#footer-version`). Simulation ruleset (`BOOTSTRAP/0.1`) and snapshot schema (`SAVE_VERSION = 1`) are tracked separately. See `GITHUB.md`.

### Build packages

```bash
npm run dist:win     # Windows NSIS installer + portable .exe
npm run dist:mac     # macOS DMG + zipped NUL.app
npm run dist:linux   # Linux AppImage
```

Build output goes to `dist/`. Building on the target OS is preferred. The included GitHub Actions workflow provides native runners for all three platforms and uploads build artifacts for 30 days. It does not, by itself, create a signed public release.

### Recipient requirements

A packaged Electron app includes its own Node and Chromium runtimes. Recipients do **not** install Node or run npm. A temporary packaged Linux build was verified with bundled **Node 24.22.2** and **Electron 45.2.3**.

Unsigned Windows/macOS builds may trigger SmartScreen/Gatekeeper warnings. Public distribution should add Windows code signing and Apple Developer signing/notarization.

## 7. Measured RAM & runtime options

Measurements on Linux (`smaps_rollup` PSS + V8 heap):

| Configuration | Companion baseline | Evolved world | 100,000-tick soak |
| --- | ---: | ---: | ---: |
| Single-process TUI / Pure Engine (`npm run start:tui` / `bench:memory`) | ~28.6 MB PSS | ~27.6 MB PSS | ~46.7 MB PSS |
| Local HTTP Preview Server (`npm run start:sandbox`) | ~53.6 MB RSS | — | — |
| Electron `--low-memory` | ~259 MB PSS | ~284 MB PSS | — |
| Standard Electron | ~307 MB PSS | ~335 MB PSS | — |

- Simulation data is strictly bounded (`<= 8` concepts, `<= 100` memories, `<= 24` active world artifacts, `<= 33` active symbols in `usedNames`, `<= 70` logs, ~4.5 MB JS heap, ~49 KB JSON snapshot at 100,000 ticks, executing 100k ticks in ~0.6s).
- **Conclusion:** Electron's multi-process Chromium runtime dominates desktop package RAM and still exceeds a strict 256 MB total ceiling, while `npm run start:tui` (and opening `index.html` in an existing browser or via `npm run start:sandbox`) runs in ~28.6–46.7 MB PSS using the exact same `nul-resumable-world` `v1` saves and `nul-ontology` `v1` mind files.

## 8. Validation completed & committed (`npm test`)

Committed automated regression suites (`tests/naming.test.mjs`, `tests/ontology.test.mjs`, `tests/simulation.test.mjs`, `tests/soak.test.mjs`, `tests/ui-layout.test.mjs` — 22 tests via `npm test`):

- Deterministic replay: identical seed (`424242`) reproduces bit-for-bit identical world state at T+01500
- Exact snapshot round-trip: `createSnapshot` → `restoreSnapshot` + 1 tick and + 120 ticks reproduces exact PRNG and agent state
- Cross-seed ontology round-trip: `exportOntology` → `importOntology` transplants concepts, glyphs, valences, sequence beliefs, and operators without altering destination PRNG, supports legacy `v0.01.002` exports, and rejects malformed payloads or full snapshots safely
- Sticky Lab UI & iframe readiness: sticky `.topbar`, sticky `.mind-panel`, sticky `<dialog>` headers, `100dvh` sizing, `?mode=companion` query boot, and asset parity across `index.html`, `package.json`, and `sandbox-server.mjs`
- Proportional coordinate scaling when restoring snapshots across different viewport dimensions
- Malformed/corrupt snapshot rejection without mutating the active world
- Blocked `localStorage` fallback without runtime errors
- Non-perturbing canvas entity inspection (zero PRNG calls or world mutations) and custom numeric seed loading
- Reload artifact deduplication across repeated save/restore cycles
- 100,000-tick (~2.3h at 1×) soak test proving all collections, `usedNames`, and snapshot bytes stay bounded
- Live memory budget check (`npm run bench:memory`) verifying single-process PSS (~28.6–46.7 MB) stays well below 200 MB (< 256 MB ceiling)

## 9. Known limitations and next-generation roadmap (`v0.02.xxx`)

- **The 256 MB RAM requirement is not met by Electron** (use `npm run start:tui`, browser `index.html`, or a future native WebView/Canvas shell when a hard `< 256 MB` standalone desktop binary is needed).
- Cross-platform unsigned Windows (`.exe`), macOS (`.dmg` / `.zip`), and Linux (`.AppImage`) builds are published via GitHub Actions on `v*` tags; no commercial code-signing or Apple notarization certificates are configured yet.
- Browser autosave is origin/profile specific and is not cloud backup.
- In `BOOTSTRAP/0.1` (`v0.01.xxx`), world interactions are still constrained to consuming signals (`±energy`) and combining concept pairs into decorative artifacts on an observer-drawn grid. The planned **`v0.02.xxx` (`SUBSTRATE/0.2`)** line removes that ceiling: agent-authored canvas geometry/substrates, unconstrained physical operators beyond eating (`probe`, `modulate`, `carry`, `bind/catalyze`, `inscribe/anchor`), self-authored `PurposeSeed` + counterfactual `Evaluation` loops, and decoupled ontology modes (`OFF` / `EMERGENT` / `SYMBOLIC`).
- The agent is a constrained symbolic/statistical simulation, not evidence of understanding, consciousness, or general intelligence.

## 10. Recommended next decisions

1. **Resolve the runtime requirement before adding more desktop features.** If 256 MB is a hard ceiling, evaluate a native single-process implementation rather than spending more time on Electron micro-optimizations.
2. **Create recipient-ready releases.** Run the native build workflow, smoke-test each OS artifact, and add signing/notarization for public distribution.
3. **Commit tests.** Preserve the deterministic-save, native-mode, malformed-import, and standalone-package checks as reproducible tests.
4. **Add a memory soak test.** Measure several hours of simulation, artifact growth, save size, and total process PSS before promising a budget.
5. **Keep claims precise.** Do not call source ZIPs standalone installers, do not call low-memory mode a 256 MB cap, and do not describe the simulation as conscious or fully unbounded.

## 11. Guidance for the next assistant/session

- Read this file, `README.md`, and `package.json` before changing anything.
- Do not assume `node_modules`, cached Electron binaries, test browsers, servers, or temporary test scripts survived the session transition.
- The source is self-contained apart from development/build dependencies; runtime simulation code has no package imports.
- Preserve the single-world/single-window architecture and deterministic snapshot behavior.
- Ask before undertaking a native rewrite or producing large platform-specific binaries.
- The user first froze the application code, then explicitly requested GitHub-import preparation. Repository preparation adds no functional application changes. Await their next explicit direction before feature or runtime work.
