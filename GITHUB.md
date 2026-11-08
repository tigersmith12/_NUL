# GitHub, Versioning & Branch Naming Guide

This guide defines how branches, pull requests, versions, and release tags are named in **NUL** so it is immediately clear what version and purpose any branch or change belongs to.

---

## 1. Branch Naming Scheme

All human-created working branches follow **`<type>/v<X.Y.Z>-<short-name>`** (lowercase kebab-case for `<short-name>`):

```text
<type>/v<major>.<minor>.<patch>-<short-name>
```

| Prefix | Purpose | Example |
| --- | --- | --- |
| `feat/` | New simulation, UI, or desktop companion capability | `feat/v0.2.1-artifact-cap` |
| `fix/` | Bug fix, persistence repair, or window/tray behavior fix | `fix/v0.2.1-tray-restore` |
| `perf/` | Memory footprint or rendering/runtime optimization | `perf/v0.3.0-memory-budget` |
| `refactor/` | Internal code restructuring with unchanged behavior | `refactor/v0.2.1-canvas-split` |
| `docs/` | Documentation, handoff notes, or architecture guides | `docs/v0.2.0-branch-scheme` |
| `test/` | Deterministic snapshot, UI, or memory soak tests | `test/v0.2.1-snapshot-determinism` |
| `build/` | Electron packaging, CI workflows, or developer scripts | `build/v0.2.0-windows-signing` |
| `chore/` | Dependency updates or repository housekeeping | `chore/v0.2.1-deps-bump` |
| `exp/` | Bounded artificial-life or native-runtime experiments | `exp/v0.3.0-native-shell` |
| `release/` | Release preparation (`release/v<X.Y.Z>` or with suffix) | `release/v0.2.0` |

### Trunk & Automated Session Branches

- **Trunk / baseline branches:** `main` and `Initial-reference` are exempt from `<type>/v...` prefixes.
- **Arena session branches (`arena/<id>-<slug>`):** Arena locks each coding session to its auto-generated `arena/*` branch name. Those branches are accepted by CI and rely on the **Pull Request title** below to display the version, type, and readable name on GitHub.

---

## 2. Pull Request Title Scheme

Every pull request—whether opened from a local `<type>/v<X.Y.Z>-<short-name>` branch or a fixed `arena/*` branch—uses:

```text
[v<X.Y.Z>] <type>: <short summary>
```

Examples:

- `[v0.2.0] build: add readable branch and version naming scheme`
- `[v0.2.1] fix: preserve companion bounds across display changes`
- `[v0.3.0] exp: prototype single-process native companion`

When a PR comes from a standard `<type>/v<X.Y.Z>-<short-name>` branch, CI also checks that the branch's `<type>` and `v<X.Y.Z>` match the PR title so they never drift apart.

---

## 3. Version Identifiers in NUL

NUL tracks three distinct version numbers with separate jobs:

| Identifier | Current Value | Where It Lives | When to Increment |
| --- | --- | --- | --- |
| **App version** | `0.2.0` (`v0.2.0`) | `package.json` `"version"`, `index.html` (`APP_VERSION`, topbar, controls bar, footer), branch names, PR titles, Git tags | Patch (`0.2.x`) for fixes/docs/tooling, minor (`0.x.0`) for notable features or runtime milestones, major (`x.0.0`) for milestone architecture shifts |
| **Simulation ruleset** | `BOOTSTRAP/0.1` | `index.html` (`RULESET_VERSION`, controls bar, footer, ontology exports) | Only when deterministic agent/world rules change |
| **Snapshot schema** | `1` (`nul-resumable-world`) | `index.html` (`SAVE_VERSION = 1`, `STORAGE_KEY = 'nul.world.autosave.v1'`) | Only on breaking changes to saved-world JSON structure |

Whenever you bump `"version"` in `package.json`, update `APP_VERSION` and the three static `vX.Y.Z` labels (`#brand-version`, `#controls-version`, `#footer-version`) in `index.html`. Run `npm run check:naming` to verify they match.

---

## 4. Helper Commands & Automated Checks

These scripts use built-in Node.js modules only (no `npm install` required to run them):

```bash
# Generate a compliant branch name + matching PR title (uses package.json version by default)
npm run branch:suggest -- feat artifact-memory-cap
npm run branch:suggest -- fix tray-restore --version 0.2.1

# Validate version sync (package.json <-> index.html) and current branch name
npm run check:naming

# Test any candidate branch, PR title, or release tag locally
node scripts/check-naming.mjs --branch "feat/v0.2.0-artifact-cap" --pr-title "[v0.2.0] feat: cap world artifacts"
node scripts/check-naming.mjs --tag "v0.2.0"
```

In GitHub Actions, `.github/workflows/branch-naming.yml` runs `node scripts/check-naming.mjs` automatically on branch pushes, pull requests (`opened`, `edited`, `synchronize`, `reopened`), and `v*` tag pushes.

---

## 5. Release Tags & Cross-Platform Builds

Release tags use exact SemVer prefixed with `v` (matching `package.json`):

```bash
git tag v0.2.0
git push origin v0.2.0
```

Pushing a `v*` tag (or triggering **Build desktop apps** manually via `workflow_dispatch`) runs:

1. **`.github/workflows/branch-naming.yml`** — verifies the tag matches `v<X.Y.Z>` and aligns with `package.json` and `index.html`.
2. **`.github/workflows/desktop-builds.yml`** — builds native Windows (`.exe`), macOS (`.dmg` + `.zip`), and Linux (`.AppImage`) artifacts and uploads them for 30 days.

Add code-signing credentials only through GitHub's encrypted Actions secrets; never commit certificates, private keys, notarization credentials, or tokens.

---

## 6. Requirements Summary

- **Repository development & CI:** Node.js **22.12+**
- **Standalone browser runtime:** open `index.html` directly; no Node, server, or network required
- **Packaged desktop recipients:** download and open the built app; no Node, npm, or internet connection required
