# NUL — A world before meaning

A standalone, non-LLM artificial-life experiment and desktop companion. For the browser version, open `index.html` in a modern browser; no installation, server, API key, model, or network connection is required.

**GitHub import:** see `GITHUB.md`. **New assistant/session handoff:** start with `project.md`.

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

**Export ontology** is different: it downloads a readable summary of the agent's mind, not a resumable world.

No save data is transmitted anywhere. If an embedded preview blocks browser storage, use portable snapshots instead. Downloaded snapshots are the recommended durable backup.

## Memory budget

The simulation's own data is small, but Electron's runtime dominates total RAM. A Linux/Xvfb measurement of the companion across all six Electron processes produced:

| Configuration | Companion baseline | Evolved world |
| --- | ---: | ---: |
| Standard Electron | ~307 MB PSS | ~335 MB PSS |
| `--low-memory` | ~259 MB PSS | ~284 MB PSS |

The evolved test contained 7–8 concepts, 25–32 retained memories, and 5–7 artifacts; its JSON snapshot was only about 20–28 KB. Main-process JavaScript heap use was about 4 MB. PSS (proportional set size) divides shared memory between processes; summing ordinary RSS/Task Manager working sets can report a substantially larger number.

Use the optional reduced-overhead mode with:

```bash
npm run start:low-memory
```

This disables hardware acceleration and unneeded Chromium background services. It is **not a hard 256 MB cap**, and results vary by OS, Electron version, graphics stack, and shared-runtime accounting. A strict 256 MB total-RAM requirement should use a native single-process UI and a measured budget with headroom. Merely switching to Tauri/system WebView does not guarantee the limit.

## Controls

- **Space** — pause or resume
- **Ctrl/⌘+Shift+C** — toggle lab / companion layout
- **N** — add an unlabelled perturbation
- **Click the world** — add a perturbation at that location
- **Step** — advance one tick while suspended
- **1× / 2× / 4× / 8×** — simulation speed
- **Reset** — replay the same seed
- **New world** — generate a new seed
- **Export ontology** — download the actual agent state as JSON

## Implementation

The simulation is contained in `index.html`: HTML, CSS, canvas rendering, persistence, and dependency-free JavaScript. The optional Electron shell lives in `desktop/main.cjs` and `desktop/preload.cjs`, with context isolation, no renderer Node access, blocked new windows, and native JSON save dialogs. A seeded PRNG makes a seed replayable. The simulation runs at 12 ticks per second per speed multiplier, while canvas rendering uses the browser's animation frame rate.
