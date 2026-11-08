# NUL — A world before meaning

A standalone, non-LLM artificial-life experiment and desktop companion (`SUBSTRATE/0.2` · `v0.02.001`). For the browser version, open `index.html` in a modern browser; no installation, server, API key, neural network, model, or network connection is required.

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
- **macOS:** open the `.dmg`, or unzip and move `NUL Companion.app` to Applications.
- **Linux:** make the `.AppImage` executable (`chmod +x nul-companion-*.AppImage`) and open it.

For cross-platform builds without three local machines, the included **Build desktop apps** GitHub Actions workflow uses native Windows, macOS, and Linux runners. Run it manually or push a `v*` tag, then download the workflow artifacts or published GitHub Release assets (for example, the final `v0.01` desktop release at `v0.01.003`). Signing identities are not required to compile, but unsigned Windows and macOS apps can trigger SmartScreen/Gatekeeper warnings. Public distribution should use a Windows code-signing certificate and Apple Developer signing/notarization credentials.

Packaging changes distribution only; it does not reduce the measured RAM footprint.

## What the agent starts with (`SUBSTRATE/0.2`)

- Time, a mobile body, homeostatic viability, and an unlabelled **4-channel continuous medium** (`32×20×4` `Float32Array`: two fast oscillatory channels + two slow plastic/structural channels)
- Continuous raw motor gestures `(biasAngle, thrust, coupling[4])`
- A 4-stage symbolic causal cognitive cycle: **PurposeSeed → Proposer / Critic / Synthesizer → Anchored Execution → Operational Δ Evaluation**
- Sub-symbolic causal delta traces (`context[4], gesture → actualDelta[4], viabilityDelta, structuralGain`)
- Autonomous contour segmentation (8-ray local boundary detection) and motor macro-operator crystallization (`μ01`–`μ08`)
- Optional pressure-driven symbol compression (`Emergent` mode, starting with `0` symbols at `T+0`) or permanent `None` (strictly ontology-free) mode

## What it does not start with

- An LLM, neural network, training corpus, prompt, or API
- Pre-defined substrate object types ("food", "crystal", "obstacle") or pre-defined action verbs ("eat", "push", "mine")
- An observer-imposed coordinate grid on the canvas
- Object names, a taxonomy, or a dictionary (`0` concepts at `T+0`)
- Human-authored world laws or a prescribed final task

## Agent-defined canvas & ontology modes

Instead of consuming discrete food pellets on a pre-drawn grid, the agent senses, segments, and physically reshapes the slow channels of the continuous medium:

### Three live Canvas lenses (`L` key)

- **Combined** *(default)* — subtle raw 4-channel medium shimmer underneath crisp agent-segmented organic contours, stigmergic marks, and sculpted structures.
- **Agent** — starts as an empty dark void; **100% of visible canvas geometry** (imprinted sensory wake, segmented region contours, inscribed marks, and persistent sculpted structures) is defined or built by the agent itself.
- **Medium** — observer diagnostic view of the raw 4-channel continuous field and vector flow ticks.

### Meaning with or without ontology (`Mind` panel)

- **Emergent** *(default)* — begins strictly ontology-free (`0` concepts) and coins glyphs, names, and causal sequence beliefs only when recurring `(context, operator → Δ)` clusters exceed compression pressure; the internal **Critic** challenges and falsifies beliefs when predictions fail.
- **None** *(strictly ontology-free)* — disables lexical symbol/belief minting permanently (`0` concepts, `0` beliefs forever) while keeping `PurposeSeed → Critic → Δ Evaluation`, motor macro-operator discovery (`μ01..`), contour segmentation, stigmergic marks, and physical structure sculpting 100% active.
- **Imported** — transplants an exported `nul-ontology` (`v1` or `v2`) mind into any world seed so the Critic can test and falsify foreign beliefs against new physics without altering the world's seed or PRNG.

The observer translation and measurements are interface scaffolding; they are not meanings supplied to the agent. The program's mechanism is necessarily hard-coded, so this is an experiment in **causal & semantic bootstrapping**, not creation from literally nothing or a consciousness claim.

## Persistent saves

NUL supports two complementary portable formats:

- **Browser autosave** — the complete resumable world (including lossless IEEE-754 base64 encoding of the `Float32Array` medium and agent imprint map) is written to `localStorage` under `nul.world.autosave.v2` every 120 simulation ticks, when paused, after a manual perturbation, and when the page closes. Startup automatically restores it.
- **Portable world snapshot (`nul-resumable-world` `v2`)** — open **Saves** and choose **Download world snapshot**. The JSON includes the lossless 4-channel field, physics parameters, agent state, causal traces, macros, transcript, viewport dimensions, lens/ontology mode, and exact PRNG state. Restoration and subsequent ticks are bit-for-bit deterministic when viewport and rule version match.

**Export ontology** and **Import ontology** complement snapshots: **Export ontology** downloads the agent's discovered motor operators (`macros`), causal concepts, sequence beliefs, and operators (`nul-ontology` `v2`), and **Import ontology** transplants `v1` or `v2` ontologies into any world seed without overwriting the world's seed, physics, or PRNG state.

No save data is transmitted anywhere. If an embedded preview blocks browser storage, use portable snapshots instead.

## Memory budget

The simulation's own data is small (`src/engine.js` runs DOM-free in ~4.5–5.3 MB V8 heap), while Electron's multi-process Chromium runtime dominates desktop package RAM. Measured Linux memory across runtimes (`SUBSTRATE/0.2` · `v0.02.001`):

| Configuration | Baseline (`T+0`) | Evolved (`T+3,000`) | Extended soak (`T+100,000`) |
| --- | ---: | ---: | ---: |
| Single-process TUI / Pure Engine (`npm run start:tui` / `bench:memory`) | ~32.3 MB PSS | ~44.7 MB PSS | ~81.4 MB PSS |
| Local HTTP Preview Server (`npm run start:sandbox`) | ~54 MB RSS | — | — |
| Electron `--low-memory` | ~259 MB PSS | ~284 MB PSS | — |
| Standard Electron | ~307 MB PSS | ~335 MB PSS | — |

All collections remain strictly bounded indefinitely (`<= 16` active segmented loci, `<= 8` concepts, `<= 8` motor macro-operators, `<= 22` causal traces, `<= 18` stigmergic marks, `<= 60` episodic memories, `<= 24` active world structures, `<= 33` active symbols in `usedNames`, ~5.3 MB JS heap, and ~63.7 KB lossless JSON snapshot even at 100,000 ticks / ~2.3 hours at 1×, executing 100k ticks in ~5.3s).

Choose the runtime that matches your RAM budget:

```bash
npm run start:tui          # Single-process terminal companion (< 85 MB PSS; strictly < 256 MB)
npm run start:sandbox      # Zero-dependency local HTTP preview server (?mode=companion supported)
npm run world:inspect      # Fast CLI inspector (--seed, --ticks, --ontology-mode emergent|none, --import-ontology)
npm run start:low-memory   # Electron with reduced V8/GPU/spellcheck overhead (~259-284 MB PSS)
npm run bench:memory       # Run live PSS/RSS & 100,000-tick soak profiler
```

Electron's `--low-memory` mode disables hardware acceleration, spellcheck dictionaries, and unneeded Chromium background services, and bounds renderer old-space V8 heap—**but Electron itself is not a hard 256 MB cap**. Use `npm run start:tui` (which reads and writes the exact same `nul-resumable-world` `v2` JSON snapshots) or `index.html` in an already-running browser when a strict `< 256 MB` ceiling is required.

## Controls

- **Space** — pause or resume
- **L** — cycle Canvas lens (`Combined` → `Agent` → `Medium`)
- **Ctrl/⌘+Shift+C** — toggle lab / companion layout
- **Click an entity (agent, segmented locus, sculpted structure)** — inspect its observer readout & raw 4D channels without perturbing the world (`Esc` closes)
- **Click empty space / Shift+Click / N** — inject an unlabelled wave packet into the 4-channel medium
- **Click `SEED` (or open Saves)** — copy the current seed or load any integer seed (`1`–`2147483647`)
- **Ontology selector (`Emergent` / `None` / `Import`)** — switch between pressure-emergent symbols, strictly ontology-free causal control, or cross-world ontology testing
- **Step** — advance one tick while suspended
- **1× / 2× / 4× / 8×** — simulation speed
- **Reset** — replay the same seed
- **New world** — generate a new seed
