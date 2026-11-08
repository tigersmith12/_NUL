<!--
PR Title Format (checked in CI):
  [v<X.Y.Z>] <type>: <short summary>

Examples:
  [v0.2.0] build: add readable branch and version naming scheme
  [v0.2.1] fix: preserve companion bounds across display changes
  [v0.3.0] exp: evaluate single-process native shell

Allowed <type> values:
  feat | fix | perf | refactor | docs | test | build | chore | release | exp

Standard working branch format:
  <type>/v<X.Y.Z>-<short-name>   (e.g. feat/v0.2.1-artifact-cap)
  (Automated `arena/*` session branches are also accepted when paired with a valid PR title above.)
-->

## Summary

- **Target version:** `v0.2.0`
- **Change type:** `feat | fix | perf | refactor | docs | test | build | chore | release | exp`
- **What changed & why:**
  - 

## Impact & Constraints Check

- [ ] Offline / non-LLM constraint preserved (zero runtime network calls or external models)
- [ ] `package.json` version and `index.html` (`APP_VERSION` / UI labels) match (`npm run check:naming`)
- [ ] Resumable snapshot compatibility (`nul-resumable-world` v1) preserved — or version bump explicitly documented
- [ ] Single-window / single-world architecture preserved between Lab and Companion views

## Verification

- 
