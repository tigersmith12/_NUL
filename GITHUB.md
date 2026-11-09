# GitHub, Versioning & Branch Naming Guide

This guide defines how branches, pull requests, versions, and release tags are named in **NUL** so every branch and PR clearly shows its version line and purpose.

---

## 1. How `.xxx` Branches & `.001` PRs Work Together

NUL uses a **zero-padded version line with a `.xxx` placeholder on working branches** that resolves to a **sequential 3-digit PR number (`.001`, `.002`, …)** when opening a pull request:

```text
Version-line branch : v0.01
Working branch      : <type>/v0.01.xxx-<short-name>
Pull Request #1     : [v0.01.001] <type>: <short summary>   (or <type>/v0.01.001-<short-name>)
Pull Request #2     : [v0.01.002] <type>: <short summary>
...
Next version line   : v0.02  ->  <type>/v0.02.xxx-<short-name>  ->  PRs start at v0.02.001
```

Why `.xxx` on the branch? Because you never have to rename a working branch if PR numbers shift before merge—the concrete `.001`, `.002`, `.003` slot is locked in the PR and synced via `npm run version:next`.

### Working Branch Prefixes

| Prefix | Purpose | Working Branch Example | Resolved PR Example |
| --- | --- | --- | --- |
| `feat/` | New simulation, UI, or desktop companion capability | `feat/v0.01.xxx-artifact-cap` | `[v0.01.002] feat: cap world artifacts` |
| `fix/` | Bug fix, persistence repair, or window/tray fix | `fix/v0.01.xxx-tray-restore` | `[v0.01.003] fix: restore companion from tray` |
| `perf/` | Memory footprint or rendering/runtime optimization | `perf/v0.02.xxx-memory-budget` | `[v0.02.001] perf: reduce idle memory budget` |
| `refactor/` | Internal restructuring with unchanged behavior | `refactor/v0.01.xxx-canvas-split` | `[v0.01.004] refactor: isolate canvas renderer` |
| `docs/` | Documentation, handoff notes, or workflow guides | `docs/v0.01.xxx-handoff-notes` | `[v0.01.005] docs: update handoff notes` |
| `test/` | Deterministic snapshot, UI, or memory soak tests | `test/v0.01.xxx-snapshot-soak` | `[v0.01.006] test: add snapshot determinism suite` |
| `build/` | Electron packaging, CI workflows, or dev tooling | `build/v0.01.xxx-branch-scheme` | `[v0.01.001] build: establish v0.01.xxx branch and PR naming scheme` |
| `chore/` | Dependency updates or repository housekeeping | `chore/v0.01.xxx-deps-bump` | `[v0.01.007] chore: update build dependencies` |
| `exp/` | Bounded artificial-life or native-runtime experiments | `exp/v0.02.xxx-native-shell` | `[v0.02.001] exp: prototype native companion shell` |
| `release/` | Release preparation (`release/v0.01.xxx`) | `release/v0.01.xxx` | `[v0.01.008] release: prepare v0.01 release` |

### Trunk, Version-Line & Arena Session Branches

- **Version-line branches (`v1`, `v0.01`, `v0.02`, …):** Long-lived branches for each major/minor line where `.001`, `.002`, … PRs land.
- **Trunk / reference branches (`main`, `Initial-reference`):** Exempt from `<type>/` prefixes.
- **Arena session branches (`arena/<id>-<slug>`):** Arena locks each coding session to its auto-generated `arena/*` branch name. Those branches pass CI automatically and carry the resolved `v0.01.001` version in the PR title and app metadata. Once a PR merges on GitHub, the `arena/*` head branch can be deleted cleanly (or auto-deleted via GitHub **Settings → General → Automatically delete head branches**).

---

## 2. Version Identifiers & SemVer Mapping

NUL tracks three distinct version numbers, and maps the padded display version cleanly to strict SemVer for `npm` and `electron-builder`:

| Identifier | Current Value | Where It Lives | Purpose |
| --- | --- | --- | --- |
| **App / PR version** | `v0.01.003` (`0.1.3` in `package.json`) | `src/engine.js` (`APP_VERSION = '0.01.003'`), `index.html` (header, controls, footer), `package.json` (`"0.1.3"`), PR titles, Git tags | Tracks the `<M>.<MM>.<PPP>` release line and sequential PR number (`0.1.3` ↔ `v0.01.003` keeps `npm`/`electron-builder` SemVer valid without leading-zero errors) |
| **Simulation ruleset** | `BOOTSTRAP/0.1` | `src/engine.js` (`RULESET_VERSION`), `index.html` (controls bar, footer), ontology exports | Changes **only** when deterministic world/agent simulation mechanics change |
| **Snapshot schema** | `1` (`nul-resumable-world`) | `src/engine.js` (`SAVE_VERSION = 1`, `STORAGE_KEY = 'nul.world.autosave.v1'`) | Changes **only** on breaking saved-world JSON schema updates |
| **Ontology schema** | `1` (`nul-ontology`) | `src/engine.js` (`ONTOLOGY_FORMAT = 'nul-ontology'`, `ONTOLOGY_VERSION = 1`) | Portable agent-mind JSON schema for `Export ontology` / `Import ontology` (backward-compatible with `v0.01.002` exports) |

---

## 3. CLI Helpers & Automated CI Checks

All helper commands use built-in Node.js modules only (no `npm install` needed):

```bash
# Increment to the next PR number in the current line (e.g. v0.01.001 -> v0.01.002)
npm run version:next

# Or set a new version line explicitly (updates package.json, package-lock.json & index.html)
npm run version:set -- v0.02.001

# Generate a compliant .xxx working branch + resolved PR title
npm run branch:suggest -- feat artifact-memory-cap

# Validate version sync and active branch / PR / tag naming
npm run check:naming

# Run the automated naming & syntax integrity test suite
npm test
```

In GitHub Actions, `.github/workflows/branch-naming.yml` runs `npm test` and `node scripts/check-naming.mjs` on every pull request (`opened`, `edited`, `synchronize`, `reopened`), branch push, and `v*` tag push.

---

## 4. Setting Up `v0.01` After Merging PR #1

1. Merge **PR #1 (`v0.01.001`)** on GitHub when ready.
2. In GitHub's branch selector, create branch **`v0.01`** (and/or `main`) from the merged commit—and optionally set it as the default base branch under **Settings → General → Default branch**.
3. For each subsequent change on `v0.01`:
   - Branch locally as `<type>/v0.01.xxx-<short-name>` (or work in an Arena session targeting `v0.01`).
   - Run `npm run version:next` so `v0.01.001` → `v0.01.002` across `package.json`, `package-lock.json`, and `index.html`.
   - Open the PR with `[v0.01.002] <type>: <summary>`.

---

## 5. Release Tags & Cross-Platform Builds

Push a matching tag (`v0.01.001` or `v0.1.1`) or run **Build desktop apps** manually via `workflow_dispatch`:

```bash
git tag v0.01.001
git push origin v0.01.001
```

- **`.github/workflows/branch-naming.yml`** verifies the tag matches `package.json` and `index.html`.
- **`.github/workflows/desktop-builds.yml`** builds native Windows (`.exe`), macOS (`.dmg` + `.zip`), and Linux (`.AppImage`) artifacts and uploads them for 30 days.
- Store signing credentials only in GitHub's encrypted Actions secrets; never commit certificates, keys, or tokens.
