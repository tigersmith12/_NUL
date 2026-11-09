import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeadlessLab } from '../scripts/headless-harness.mjs';

test('reload deduplication prevents artifact double-pushing across repeated save/restore cycles', () => {
  const env = createHeadlessLab({ width: 800, height: 520 });
  env.lab.resetWorld(true, 246810);

  for (let cycle = 0; cycle < 5; cycle++) {
    env.lab.steps(400);
    const snap = JSON.parse(JSON.stringify(env.lab.createSnapshot()));
    env.lab.restoreSnapshot(snap);
  }

  const finalSnap = env.lab.createSnapshot();
  const ids = finalSnap.artifacts.map(a => a.id);
  const uniqueIds = new Set(ids);
  assert.equal(ids.length, uniqueIds.size, 'artifact IDs must never duplicate across reload cycles');
});

test('100,000-tick (~2.3h at 1x) soak test keeps all collections, names, and snapshot bytes strictly bounded', () => {
  const env = createHeadlessLab({ width: 800, height: 520 });
  env.lab.resetWorld(true, 8675309);

  // Also inject periodic manual perturbations to exercise signal/particle/ripple caps
  for (let block = 0; block < 100; block++) {
    env.lab.steps(1000);
    if (block % 10 === 0) env.lab.perturb({ x: 220, y: 180 });
  }

  const state = env.lab.getState();
  const { counts } = state;
  const { constants } = env.lab;

  assert.equal(state.tick, 100000);
  assert.ok(counts.concepts <= constants.MAX_CONCEPTS, `concepts ${counts.concepts} > ${constants.MAX_CONCEPTS}`);
  assert.ok(counts.artifacts <= constants.MAX_ARTIFACTS, `artifacts ${counts.artifacts} > ${constants.MAX_ARTIFACTS}`);
  assert.ok(counts.totalArtifactsCreated > constants.MAX_ARTIFACTS, 'soak run should exceed MAX_ARTIFACTS total creations to exercise eviction');
  assert.ok(counts.memories <= constants.MAX_MEMORIES, `memories ${counts.memories} > ${constants.MAX_MEMORIES}`);
  assert.ok(counts.logs <= constants.MAX_LOGS, `logs ${counts.logs} > ${constants.MAX_LOGS}`);
  assert.ok(counts.trail <= constants.MAX_TRAIL, `trail ${counts.trail} > ${constants.MAX_TRAIL}`);
  assert.ok(counts.signals <= constants.MAX_SIGNALS, `signals ${counts.signals} > ${constants.MAX_SIGNALS}`);
  assert.ok(
    counts.usedNames <= 1 + constants.MAX_CONCEPTS + constants.MAX_ARTIFACTS,
    `usedNames (${counts.usedNames}) must be pruned when old artifacts retire`
  );
  assert.ok(counts.beliefs <= constants.MAX_CONCEPTS * (constants.MAX_CONCEPTS - 1));

  const snapshotJson = JSON.stringify(env.lab.createSnapshot());
  const snapshotBytes = Buffer.byteLength(snapshotJson, 'utf8');
  assert.ok(
    snapshotBytes < 65 * 1024,
    `Expected 100k-tick snapshot (${snapshotBytes} bytes) to stay under 65 KB`
  );
});
