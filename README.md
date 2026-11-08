# NUL — A world before meaning

A standalone, non-LLM artificial-life experiment and desktop companion. For the browser version, open `index.html` in a modern browser; no installation, server, API key, model, or network connection is required.

**Git, branches & versioning:** see `GITHUB.md`. **New assistant/session handoff:** start with `project.md`.

## Desktop companion

The Electron shell turns the same running simulation into a small desktop companion rather than starting a second agent.

### Run from source (developers)

Development and packaging require **Node.js 22.12 or newer**. End users of a packaged app do not need Node, npm, or an internet connection.

```bash
npm install
npm start
```

- Choose **Companion** or press **Ctrl/⌘+Shift+C** to switch between the full lab and the compact desktop window.
- Drag the companion by its top bar. **Pin** toggles always-on-top; **Lab** restores the full interface.
- **×** hides the app to the system tray. The tray menu restores the window, changes modes, toggles pinning, or quits.
- The simulation, autosave, snapshots, and generated ontology are shared between both views.
- Electron stores window bounds/mode in its desktop `userData` directory; the world remains in the same profile's local storage.
- A single-instance lock prevents two app processes from overwriting the same world.

### Build apps anyone can download

Electron bundles the Node and Chromium runtimes into each package. A recipient only downloads and opens the app—there is no `npm install`, Node installation, source folder, or runtime download step.

Build on the target operating system where practical:

```bash
npm run dist:win     # Windows installer + portable .exe
npm run dist:mac     # macOS DMG + portable .app in a ZIP
npm run dist:linux   # Linux AppImage
```

Packages are written to `dist/`:

- **Windows:** run the NSIS setup `.exe` to install, or the portable `.exe` to run without installation.
- **macOS:** open the `.dmg`, or unzip and move `NUL.app` to Applications.
- **Linux:** make the `.AppImage` executable (`chmod +x NUL-*.AppImage`) and open it.

For cross-platform builds without three local machines, the included **Build desktop apps** GitHub Actions workflow uses native Windows, macOS, and Linux runners. Run it manually or push a `v*` tag, then download the three workflow artifacts. Signing identities are not required to compile, but unsigned Windows and macOS apps can trigger SmartScreen/Gatekeeper warnings. Public distribution should use a Windows code-signing certificate and Apple Developer signing/notarization credentials.

Packaging changes distribution only; it does not reduce the measured RAM footprint.

## What the agent starts with

- Time, a body, and a bounded world
- Raw sensations represented by four numbers
- Energy and contact outcomes
- Episodic memory
- Prototype similarity and novelty-weighted attention
- Movement and a concept-combination operator
- A mechanism for generating names and glyphs

## What it does not start with

- An LLM, neural network, training corpus, or API
- Object names, a taxonomy, or a dictionary
- Labelled object categories
- A prescribed final task
- Human-authored beliefs about particular world patterns
- A list of artifacts waiting to be unlocked

## Emergent run state

During a run, the agent differentiates sensations into concepts, creates names and glyphs, learns valence from contact, records fallible sequence beliefs, chooses intents based on its own learned associations, creates a self-symbol, and combines concepts into named artifacts.

The observer translation and measurements are interface scaffolding; they are not meanings supplied to the agent. The program's mechanism is necessarily hard-coded, so this is an experiment in **semantic bootstrapping**, not creation from literally nothing or a consciousness claim.

## Persistent saves

NUL supports two complementary formats:

- **Browser autosave** — the complete resumable world is written to `localStorage` under `nul.world.autosave.v1` every 120 simulation ticks, when paused, after a manual perturbation, and when the page closes. Startup automatically restores it. This storage is specific to the current browser and site; clearing site data deletes it.
- **Portable world snapshot** — open **Saves** and choose **Download world snapshot**. The JSON includes the world, agent, transcript, viewport dimensions, UI state, and current PRNG position. Choose **Import snapshot** to restore it in the same or another browser. Restoration and the next simulation tick are deterministic when the viewport and rule version match.

**Export ontology** and **Import ontology** complement snapshots: **Export ontology** downloads the agent's learned prototypes, glyphs, names, valences, sequence beliefs, and operators (`nul-ontology` `v1`), and **Import ontology** transplants that mind into any world seed without overwriting the world's seed, physics, or PRNG state.

No save data is transmitted anywhere. If an embedded preview blocks browser storage, use portable snapshots instead. Downloaded snapshots are the recommended durable backup.

## Memory budget

The simulation's own data is small (`src/engine.js` runs DOM-free in ~4.5 MB V8 heap), while Electron's multi-process Chromium runtime dominates desktop package RAM. A Linux measurement across runtimes produced:

| Configuration | Companion baseline | Evolved world | Extended soak (100k ticks) |
| --- | ---: | ---: | ---: |
| Single-process TUI / Pure Engine (`npm run start:tui` / `bench:memory`) | ~28.6 MB PSS | ~27.6 MB PSS | ~46.7 MB PSS |
| Local HTTP Preview Server (`npm run start:sandbox`) | ~53.6 MB RSS | — | — |
| Electron `--low-memory` | ~259 MB PSS | ~284 MB PSS | — |
| Standard Electron | ~307 MB PSS | ~335 MB PSS | — |

The simulation's own data stays bounded indefinitely (`<= 8` concepts, `<= 100` memories, `<= 24` active world artifacts, `<= 33` active symbols in `usedNames`, ~4.5 MB JS heap, and ~49 KB JSON snapshot even at 100,000 ticks / ~2.3 hours at 1×, executing 100k ticks in ~0.6s). PSS (proportional set size) divides shared memory between processes; summing ordinary RSS/Task Manager working sets can report a substantially larger number.

Choose the runtime that matches your RAM budget:

```bash
npm run start:tui          # Single-process terminal companion (~28-47 MB PSS; strictly < 256 MB)
npm run start:sandbox      # Zero-dependency local HTTP preview server (~54 MB RSS; ?mode=companion supported)
npm run world:inspect      # Fast CLI inspector & cross-seed ontology runner (--seed, --ticks, --import-ontology)
npm run start:low-memory   # Electron with reduced V8/GPU/spellcheck overhead (~259-284 MB PSS)
npm run bench:memory       # Run live PSS/RSS & 100,000-tick soak profiler
```

Electron's `--low-memory` mode disables hardware acceleration, spellcheck dictionaries, and unneeded Chromium background services, and bounds renderer old-space V8 heap—**but Electron itself is not a hard 256 MB cap**. Use `npm run start:tui` (which reads and writes the exact same `nul-resumable-world` `v1` JSON snapshots) or `index.html` in an already-running browser when a strict `< 256 MB` ceiling is required.

## Controls

- **Space** — pause or resume
- **Ctrl/⌘+Shift+C** — toggle lab / companion layout
- **Click an entity (agent, signal, artifact)** — inspect its observer readout & raw 4D vector without perturbing the world (`Esc` closes)
- **Click empty space / Shift+Click / N** — add an unlabelled perturbation
- **Click `SEED` (or open Saves)** — copy the current seed or load any integer seed (`1`–`2147483647`)
- **Step** — advance one tick while suspended
- **1× / 2× / 4× / 8×** — simulation speed
- **Reset** — replay the same seed
- **New world** — generate a new seed
- **Import / Export ontology** — transplant or download the agent's learned concepts, beliefs, and symbols as JSON

## Versioning & branch naming

NUL separates four version identifiers so app releases, deterministic rules, saved worlds, and portable ontologies stay clear:

- **App / PR version (`v0.01.003`, SemVer `0.1.3` in `package.json`)** — defined in `src/engine.js` (`APP_VERSION`), displayed in `index.html`, and used across branches, PRs, and release tags.
- **Simulation ruleset (`BOOTSTRAP/0.1`)** — identifies the deterministic symbolic simulation rules.
- **Snapshot format (`nul-resumable-world` `v1`)** — identifies the resumable save schema.
- **Ontology format (`nul-ontology` `v1`)** — identifies the portable agent-mind export/import schema.

Naming conventions (enforced in CI via `.github/workflows/branch-naming.yml` and locally via `npm run check:naming` / `npm test`; full details in `GITHUB.md`):

- **Version-line branches:** `v1`, `v0.01`, `v0.02`, …
- **Working branches (`.xxx` placeholder):** `<type>/v0.01.xxx-<short-name>` (e.g., `feat/v0.01.xxx-artifact-cap`, `fix/v0.01.xxx-tray-restore`, `exp/v0.02.xxx-native-shell`)
- **Pull requests (resolves `.xxx` → `.001`, `.002`, …):** `[v0.01.002] <type>: <short summary>` (or `<type>/v0.01.002-<short-name>`)
- **Quick helpers:** `npm test` · `npm run branch:suggest -- feat short-name` · `npm run version:next` · `npm run version:set -- v0.02.001`

## Implementation

The simulation is contained in `index.html`: HTML, CSS, canvas rendering, persistence, and dependency-free JavaScript. The optional Electron shell lives in `desktop/main.cjs` and `desktop/preload.cjs`, with context isolation, no renderer Node access, blocked new windows, and native JSON save dialogs. A seeded PRNG makes a seed replayable. The simulation runs at 12 ticks per second per speed multiplier, while canvas rendering uses the browser's animation frame rate.
