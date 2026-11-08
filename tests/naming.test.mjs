import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import {
  classifyBranch,
  validatePrTitle,
  validateTag,
  validateVersionSync,
  parseAnyVersion,
  formatDisplayVersion
} from '../scripts/check-naming.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('version formatting maps SemVer <-> zero-padded v<M>.<MM>.<PPP>', () => {
  assert.equal(formatDisplayVersion(0, 1, 1), '0.01.001');
  assert.equal(formatDisplayVersion(0, 1, 12), '0.01.012');
  assert.equal(formatDisplayVersion(0, 2, 1), '0.02.001');

  const fromDisplay = parseAnyVersion('v0.01.001');
  assert.deepEqual(fromDisplay, {
    major: 0,
    minor: 1,
    patch: 1,
    semver: '0.1.1',
    display: '0.01.001',
    line: 'v0.01'
  });

  const fromSemver = parseAnyVersion('0.2.3');
  assert.equal(fromSemver.display, '0.02.003');
  assert.equal(fromSemver.line, 'v0.02');
});

test('branch classifier accepts v<M>.<MM>.xxx working branches, v<M>.<MM> line branches, trunk, and arena/*', () => {
  const validBranches = [
    'main',
    'Initial-reference',
    'v0.01',
    'v0.02',
    'build/v0.01.xxx-branch-scheme',
    'feat/v0.01.xxx-artifact-cap',
    'fix/v0.01.xxx-tray-restore',
    'perf/v0.02.xxx-memory-budget',
    'exp/v0.02.xxx-native-shell',
    'v0.01.xxx-feat-artifact-cap',
    'fix/v0.01.002-hotfix-bounds',
    'release/v0.01.xxx',
    'release/v0.01',
    'arena/9f3da8b6-nul'
  ];

  for (const branch of validBranches) {
    const res = classifyBranch(branch);
    assert.equal(res.valid, true, `Expected "${branch}" to be valid`);
  }
});

test('branch classifier rejects unformatted or ambiguous branch names', () => {
  const invalidBranches = [
    '',
    'patch-1',
    'my-feature',
    'feat/0.1.1-unpadded',
    'feat/v0.1.xxx-one-digit-minor',
    'feat/v0.01.xx-two-xs',
    'feat/v0.01.xxx-UpperCase',
    'feat/v0.01.xxx-',
    'unknown/v0.01.xxx-thing'
  ];

  for (const branch of invalidBranches) {
    const res = classifyBranch(branch);
    assert.equal(res.valid, false, `Expected "${branch}" to be invalid`);
  }
});

test('PR title validator requires .xxx to resolve to .001+ and match branch line/type & repo version', () => {
  const repoV1 = parseAnyVersion('v0.01.001');
  const workBranch = classifyBranch('build/v0.01.xxx-branch-scheme');
  const arenaBranch = classifyBranch('arena/9f3da8b6-nul');

  // Unresolved .xxx in PR title must fail
  assert.equal(
    validatePrTitle('[v0.01.xxx] build: unresolved placeholder', workBranch, repoV1).valid,
    false
  );

  // Valid resolved PR titles
  assert.equal(
    validatePrTitle('[v0.01.001] build: establish v0.01.xxx branch and PR naming scheme', workBranch, repoV1).valid,
    true
  );
  assert.equal(
    validatePrTitle('build/v0.01.001-branch-scheme', workBranch, repoV1).valid,
    true
  );
  assert.equal(
    validatePrTitle('v0.01.001-build-branch-scheme', arenaBranch, repoV1).valid,
    true
  );

  // Mismatched type or version line against working branch must fail
  assert.equal(
    validatePrTitle('[v0.01.001] feat: wrong type for build branch', workBranch, repoV1).valid,
    false
  );
  const v2Branch = classifyBranch('build/v0.02.xxx-branch-scheme');
  assert.equal(
    validatePrTitle('[v0.01.001] build: wrong version line', v2Branch, repoV1).valid,
    false
  );

  // Mismatched PR version against repo version must fail
  assert.equal(
    validatePrTitle('[v0.01.002] build: repo not bumped yet', arenaBranch, repoV1).valid,
    false
  );
});

test('release tag validator checks alignment with repo version', () => {
  const repoV1 = parseAnyVersion('v0.01.001');
  assert.equal(validateTag('v0.01.001', repoV1).valid, true);
  assert.equal(validateTag('v0.1.1', repoV1).valid, true);
  assert.equal(validateTag('v0.01.002', repoV1).valid, false);
  assert.equal(validateTag('0.01.001', repoV1).valid, false);
});

test('repository files are version-synced and free of JS syntax errors', () => {
  const errors = [];
  const parsed = validateVersionSync(errors, ROOT);
  assert.deepEqual(errors, []);
  assert.ok(parsed);

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'index.html should contain inline simulation script');
  assert.doesNotThrow(() => new vm.Script(scriptMatch[1], { filename: 'index.html' }));

  for (const rel of ['desktop/main.cjs', 'desktop/preload.cjs']) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.doesNotThrow(() => new vm.Script(code, { filename: rel }));
  }
});
