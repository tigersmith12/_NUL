import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeadlessLab } from '../scripts/headless-harness.mjs';

function stripMeta(snapshot) {
  const clone = structuredClone(snapshot);
  delete clone.savedAt;
  return clone;
}

test('exportOntology -> importOntology transplants mind into a fresh world without altering PRNG', () => {
  const donor = createHeadlessLab({ width: 800, height: 520 });
  donor.lab.resetWorld(true, 424242);
  donor.lab.steps(1500);

  const exported = JSON.parse(JSON.stringify(donor.lab.exportOntology()));
  assert.equal(exported.format, 'nul-ontology');
  assert.equal(exported.version, 2);
  assert.equal(donor.lab.validOntology(exported), true);
  assert.ok(exported.agent.concepts.length > 0);
  assert.ok(exported.agent.macros.length > 0);
  assert.ok(exported.agent.selfSymbol);

  const recipient = createHeadlessLab({ width: 800, height: 520 });
  recipient.lab.resetWorld(true, 987654);
  recipient.lab.steps(45);
  const rngBefore = recipient.lab.getState().rngState;
  const seedBefore = recipient.lab.getState().seed;

  const summary = recipient.lab.importOntology(exported);
  const afterState = recipient.lab.getState();
  const afterSnap = JSON.parse(JSON.stringify(recipient.lab.createSnapshot()));

  assert.equal(afterState.seed, seedBefore, 'world seed must remain unchanged when importing an ontology');
  assert.equal(afterState.rngState, rngBefore, 'importing an ontology must not consume or alter world PRNG');
  assert.equal(summary.concepts, exported.agent.concepts.length);
  assert.equal(summary.beliefs, exported.agent.beliefs.length);
  assert.equal(afterSnap.agent.selfName, exported.agent.selfSymbol);
  assert.deepEqual(afterSnap.agent.operators, exported.agent.generatedOperators);
  assert.equal(afterSnap.agent.concepts.length, exported.agent.concepts.length);

  //Recipient world should continue stepping deterministically with the transplanted ontology
  assert.doesNotThrow(() => recipient.lab.steps(300));
  assert.equal(recipient.lab.validSnapshot(recipient.lab.createSnapshot()), true);
});

test('importOntology supports legacy v0.01.002 ontology exports without format/selfGlyph/relationCounts', () => {
  const legacyOntology = {
    experiment: 'NUL v0.01.002 / bootstrap 0.1',
    appVersion: '0.01.002',
    ruleset: 'BOOTSTRAP/0.1',
    seed: 123456,
    tick: 800,
    agent: {
      selfSymbol: 'pathi',
      energy: 0.68,
      concepts: [
        {
          id: 1,
          name: 'mora',
          glyph: { path: 'M4 4 L14 24 L24 14', dot: [14, 14] },
          prototype: [0.15, 0.72, 0.34, 0.81],
          born: 18,
          seen: 12,
          contacts: 5,
          valence: 0.42,
          totalEffect: 0.19,
          examples: 9
        },
        {
          id: 2,
          name: 'seli',
          glyph: { path: 'M24 4 L4 14 L14 24', dot: null },
          prototype: [0.84, 0.21, 0.66, 0.19],
          born: 44,
          seen: 8,
          contacts: 3,
          valence: -0.28,
          totalEffect: -0.08,
          examples: 6
        }
      ],
      beliefs: [
        { key: '1>2', fromId: 1, toId: 2, count: 3, born: 210, confidence: 0.62 }
      ],
      artifacts: [],
      episodicMemory: [],
      generatedOperators: { is: '::', sequence: '›', join: '⊕', create: '∴' }
    }
  };

  const env = createHeadlessLab({ width: 800, height: 520 });
  env.lab.resetWorld(true, 333444);
  const rngBefore = env.lab.getState().rngState;

  assert.equal(env.lab.validOntology(legacyOntology), true);
  const res = env.lab.importOntology(legacyOntology);
  assert.equal(res.concepts, 2);
  assert.equal(res.beliefs, 1);
  assert.equal(env.lab.getState().rngState, rngBefore, 'fallback selfGlyph must not touch world PRNG');

  const snap = env.lab.createSnapshot();
  assert.equal(snap.agent.selfName, 'pathi');
  assert.ok(snap.agent.selfGlyph && typeof snap.agent.selfGlyph.path === 'string');
  assert.equal(snap.agent.relationCounts['1>2'], 3);
});

test('malformed ontologies and accidentally selected world snapshots are rejected safely', () => {
  const env = createHeadlessLab({ width: 800, height: 520 });
  env.lab.resetWorld(true, 654321);
  env.lab.steps(300);

  const before = stripMeta(env.lab.createSnapshot());
  const fullWorldSnapshot = env.lab.createSnapshot();

  // Helpful specific message when user picks a full world snapshot in Import Ontology
  const snapValidation = env.lab.validateOntology(fullWorldSnapshot);
  assert.equal(snapValidation.valid, false);
  assert.match(snapValidation.reason, /Import snapshot/);

  const badPayloads = [
    null,
    {},
    fullWorldSnapshot,
    { format: 'unknown-format', agent: { concepts: [], beliefs: [] } },
    { format: 'nul-ontology', version: 99, agent: { concepts: [], beliefs: [] } },
    {
      format: 'nul-ontology',
      version: 1,
      agent: {
        concepts: [{ id: 1, name: 'ka', prototype: [0.1, 0.2], born: 1, seen: 1, contacts: 1, valence: 0, totalEffect: 0, examples: 1 }],
        beliefs: []
      }
    },
    {
      format: 'nul-ontology',
      version: 1,
      agent: {
        concepts: [{ id: 1, name: 'mora', prototype: [0.1, 0.2, 0.3, 0.4], born: 1, seen: 1, contacts: 1, valence: 0, totalEffect: 0, examples: 1 }],
        beliefs: [{ key: '1>9', fromId: 1, toId: 9, count: 2, born: 10, confidence: 0.5 }]
      }
    }
  ];

  for (const bad of badPayloads) {
    assert.equal(env.lab.validOntology(bad), false);
    assert.throws(() => env.lab.importOntology(bad));
  }

  const after = stripMeta(env.lab.createSnapshot());
  assert.deepEqual(after, before, 'failed ontology imports must never mutate the running world');
});

test('UI #import-ontology-file handler imports ontology and updates DOM indicators', async () => {
  const donor = createHeadlessLab({ width: 800, height: 520 });
  donor.lab.resetWorld(true, 424242);
  donor.lab.steps(900);
  const ontologyJson = JSON.stringify(donor.lab.exportOntology());

  const target = createHeadlessLab({ width: 800, height: 520 });
  target.lab.resetWorld(true, 111222);

  const fileInput = target.getElement('import-ontology-file');
  fileInput.files = [{
    size: Buffer.byteLength(ontologyJson, 'utf8'),
    text: async () => ontologyJson
  }];
  fileInput.dispatchEvent('change');
  await new Promise((r) => setImmediate(r));

  assert.equal(
    Number(target.getElement('stat-concepts').textContent),
    donor.lab.getState().counts.concepts
  );
  assert.match(target.getElement('save-indicator').textContent, /Imported ontology/);
});
