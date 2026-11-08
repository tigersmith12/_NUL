import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeadlessLab } from '../scripts/headless-harness.mjs';

function stripSavedAt(snapshot) {
  const clone = structuredClone(snapshot);
  delete clone.savedAt;
  return clone;
}

test('same numeric seed produces bit-for-bit identical world state after 1,500 ticks', () => {
  const runA = createHeadlessLab({ width: 800, height: 520 });
  runA.lab.resetWorld(true, 424242);
  runA.lab.steps(1500);
  const snapA = stripSavedAt(runA.lab.createSnapshot());

  const runB = createHeadlessLab({ width: 800, height: 520 });
  runB.lab.resetWorld(true, 424242);
  runB.lab.steps(1500);
  const snapB = stripSavedAt(runB.lab.createSnapshot());

  assert.equal(snapA.seed, 424242);
  assert.equal(snapA.tick, 1500);
  assert.ok(snapA.agent.concepts.length > 0, 'expected concepts to emerge within 1,500 ticks');
  assert.ok(snapA.agent.selfName, 'expected self-symbol to form within 1,500 ticks');
  assert.deepEqual(snapA, snapB);
});

test('snapshot export -> restore -> +1 tick and +120 ticks reproduces exact PRNG and agent state', () => {
  const original = createHeadlessLab({ width: 800, height: 520 });
  original.lab.resetWorld(true, 777111);
  original.lab.steps(600);

  const midSnapshot = JSON.parse(JSON.stringify(original.lab.createSnapshot()));
  assert.equal(original.lab.validSnapshot(midSnapshot), true);

  // Advance uninterrupted world +1 tick and +120 ticks
  original.lab.step();
  const expected601 = stripSavedAt(original.lab.createSnapshot());
  original.lab.steps(119);
  const expected720 = stripSavedAt(original.lab.createSnapshot());

  // Restore snapshot in a separate VM instance and step identically
  const restored = createHeadlessLab({ width: 800, height: 520 });
  restored.lab.restoreSnapshot(structuredClone(midSnapshot));
  restored.lab.step();
  const actual601 = stripSavedAt(restored.lab.createSnapshot());
  assert.deepEqual(actual601, expected601);

  restored.lab.steps(119);
  const actual720 = stripSavedAt(restored.lab.createSnapshot());
  assert.deepEqual(actual720, expected720);
});

test('snapshot restore scales coordinates proportionally when viewport changes without altering PRNG', () => {
  const labA = createHeadlessLab({ width: 800, height: 520 });
  labA.lab.resetWorld(true, 314159);
  labA.lab.steps(400);
  const snap = JSON.parse(JSON.stringify(labA.lab.createSnapshot()));

  const labCompanion = createHeadlessLab({ width: 400, height: 390 });
  labCompanion.lab.restoreSnapshot(structuredClone(snap));
  const scaled = labCompanion.lab.createSnapshot();

  assert.equal(scaled.rngState, snap.rngState);
  assert.ok(Math.abs(scaled.agent.x - snap.agent.x * 0.5) < 1e-9);
  assert.ok(Math.abs(scaled.agent.y - snap.agent.y * 0.75) < 1e-9);
});

test('malformed snapshots are rejected without corrupting or replacing the running world', () => {
  const { lab } = createHeadlessLab({ width: 800, height: 520 });
  lab.resetWorld(true, 909090);
  lab.steps(250);
  const before = stripSavedAt(lab.createSnapshot());

  const malformedInputs = [
    null,
    {},
    { ...before, format: 'wrong-format' },
    { ...before, version: 999 },
    { ...before, tick: -5 },
    { ...before, rngState: Number.NaN },
    { ...before, agent: { ...before.agent, x: Infinity } },
    { ...before, signals: [{ id: 1, x: 10, y: 10, vx: 0, vy: 0, features: [1, 2], effect: 0, born: 0, life: 10, phase: 0 }] }
  ];

  for (const bad of malformedInputs) {
    assert.equal(lab.validSnapshot(bad), false);
    assert.throws(() => lab.restoreSnapshot(bad), /not a valid NUL world snapshot/);
  }

  const after = stripSavedAt(lab.createSnapshot());
  assert.deepEqual(after, before);
});

test('blocked localStorage falls back gracefully without throwing during startup or autosave ticks', () => {
  const env = createHeadlessLab({ width: 800, height: 520, blockStorage: true });
  env.lab.resetWorld(true, 123456);
  assert.doesNotThrow(() => env.lab.steps(250));
  assert.equal(env.lab.saveWorld(false), false);
  assert.equal(env.getElement('save-indicator').textContent, 'Storage blocked · use snapshots');

  // Portable snapshot creation still succeeds when localStorage is blocked
  const snap = env.lab.createSnapshot();
  assert.equal(env.lab.validSnapshot(snap), true);
});

test('canvas entity inspection reads agent/signal/artifact state without altering PRNG or spawning perturbations', () => {
  const env = createHeadlessLab({ width: 800, height: 520 });
  env.lab.resetWorld(true, 555777);
  env.lab.steps(900);

  const before = stripSavedAt(env.lab.createSnapshot());
  const hitAgent = env.lab.inspectAt(before.agent.x, before.agent.y);
  assert.ok(hitAgent);
  assert.equal(hitAgent.kind, 'agent');
  assert.equal(env.getElement('entity-inspector').hidden, false);

  if (before.artifacts.length > 0) {
    const art = before.artifacts[0];
    const hitArt = env.lab.inspectAt(art.x, art.y);
    assert.ok(hitArt);
    assert.equal(hitArt.kind, 'artifact');
    assert.match(env.getElement('inspector-title').textContent, new RegExp(art.name));
  }

  // Inspecting entities must not change rngState, totalEvents, or agent state
  const afterInspect = stripSavedAt(env.lab.createSnapshot());
  assert.deepEqual(afterInspect, before);

  env.lab.clearInspection();
  assert.equal(env.getElement('entity-inspector').hidden, true);
});
