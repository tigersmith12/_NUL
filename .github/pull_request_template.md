<!--
Branch & PR Naming Scheme (checked in CI):
  • Version-line branch : v<M>.<MM>                       (e.g. v0.01)
  • Working branch      : <type>/v<M>.<MM>.xxx-<slug>     (e.g. feat/v0.01.xxx-artifact-cap)
  • PR title (resolves .xxx -> .001, .002, ...):
      [v0.01.001] <type>: <short summary>
      (or <type>/v0.01.001-<slug> / v0.01.001-<type>-<slug>)

Allowed <type> values:
  feat | fix | perf | refactor | docs | test | build | chore | release | exp

Before opening the next PR in the line, bump the PR counter with:
  npm run version:next          (e.g. v0.01.001 -> v0.01.002)
  npm run version:set -- v0.02.001
-->

## Summary

- **PR Version:** `v0.01.001` (line `v0.01`, SemVer `0.1.1`)
- **Change type:** `feat | fix | perf | refactor | docs | test | build | chore | release | exp`
- **What changed & why:**
  - 

## Impact & Constraints Check

- [ ] Offline / non-LLM constraint preserved (zero runtime network calls or external models)
- [ ] Version synced across `package.json`, `package-lock.json`, and `index.html` (`npm run check:naming`)
- [ ] Resumable snapshot compatibility (`nul-resumable-world` v1) preserved — or schema bump explicitly documented
- [ ] Single-window / single-world architecture preserved between Lab and Companion views

## Verification

- 
