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
| `index.html` | Complete browser app: UI, CSS, canvas renderer, simulation, persistence, companion layout, and browser fallbacks |
| `desktop/main.cjs` | Electron lifecycle, single BrowserWindow, companion/lab switching, tray, pinning, window state, native JSON save dialogs, low-memory mode |
| `desktop/preload.cjs` | Context-isolated IPC bridge exposed as `window.nulDesktop` |
| `assets/icon.png` | Generated 512×512 application/tray icon |
| `package.json` | Node engine, Electron scripts, electron-builder targets, app metadata |
| `package-lock.json` | Locked development/build dependencies |
| `.github/workflows/desktop-builds.yml` | Native Windows/macOS/Linux build matrix; manual or `v*` tag trigger |
| `README.md` | User/developer instructions, persistence, distribution, controls, and RAM measurements |
| `LICENSE` | MIT license |
| `.gitignore` | Excludes dependencies, build outputs, logs, OS metadata, and local signing secrets |
| `.gitattributes` | Normalizes source line endings and marks binary formats |
| `GITHUB.md` | GitHub import, upload, Actions, and publishing instructions |
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

There are two distinct exports:

1. **Resumable world snapshots** contain the full simulation and PRNG state.
2. **Ontology exports** are readable summaries of the agent’s mind and are not resumable saves.

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

## 7. Measured RAM — important unresolved requirement

Measurements were taken on Linux/Xvfb using the actual Electron process tree. PSS (proportional set size) was used to divide shared memory fairly between processes.

| Configuration | Companion baseline | Evolved world |
| --- | ---: | ---: |
| Standard Electron | ~307 MB PSS | ~335 MB PSS |
| Low-memory mode | ~259 MB PSS | ~284 MB PSS |

Test conditions and observations:

- Six Electron-related processes
- Evolved runs contained roughly 7–8 concepts, 25–32 retained memories, and 5–7 artifacts
- World snapshots were approximately 20–28 KB
- Main-process JavaScript heap was approximately 4 MB
- Summed RSS was approximately 546–634 MB, but RSS double-counts shared libraries and should not be treated as equivalent to PSS
- Platform, graphics stack, Electron version, and OS memory accounting will change results

**Conclusion:** the agent and save data are small; Chromium/Electron overhead dominates. The current app cannot guarantee the user’s requested 256 MB total ceiling. A strict ceiling should use a native single-process UI and target roughly 180–200 MB measured usage to leave headroom. Merely switching to Tauri/system WebView does not guarantee the target because webview runtimes also spawn substantial processes.

## 8. Validation already completed

Temporary Playwright/native smoke tests were run successfully, but no formal test suite has been committed.

- Browser simulation ran without renderer errors
- A long browser run reached 2,880 ticks with 8 concepts, 45 retained memories, 4 beliefs, and 6 artifacts
- Save → reload → restore preserved identity, concepts, tick, and paused/running state
- Imported snapshot + one tick reproduced the original next state exactly, including PRNG state
- Invalid snapshot imports were rejected without replacing the current world
- Blocked browser storage produced the snapshot fallback rather than crashing
- Mobile layout had no horizontal overflow
- Browser companion preview and return-to-lab worked
- Native Electron companion resized to 360×480
- Native always-on-top and pin/unpin worked
- Lab bounds restored correctly
- World and companion mode survived separate app restarts
- An unpacked packaged Linux executable launched directly, reported `app.isPackaged === true`, and entered companion mode

Do not infer that native Windows/macOS packages have already been tested; they have not.

## 9. Known limitations and risks

- **The 256 MB RAM requirement is not met by Electron.**
- No final signed installer has been attached for end users.
- The cross-platform workflow is configured but has not been executed in this session.
- No code-signing or notarization credentials are configured.
- No committed automated regression or memory-budget test suite exists yet.
- No long-duration soak test or strict artifact/entity memory cap has been established.
- Browser autosave is origin/profile specific and is not cloud backup.
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
