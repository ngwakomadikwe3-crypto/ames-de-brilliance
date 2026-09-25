import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Module, { createRequire } from 'node:module';
import typescript from 'typescript';

const require = createRequire(import.meta.url);
Module._extensions['.ts'] = (module, filename) => {
  const source = readFileSync(filename, 'utf8');
  const output = typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
};
const { getPackEvidence, readPackFile } = require('../src/lib/jewelry-pack.ts');
const dist = resolve(process.cwd(), '..', 'ames-engine-main', 'dist');
const ids = [
  'dev-test-candidate-ring', 'dev-test-solitaire-mount',
  'dev-test-earring-001', 'dev-test-pendant-001',
];

test('completed engine packs remain readable as jewelry review evidence', {
  skip: !existsSync(dist) && !process.env.AMES_ENGINE_PACK_DIRS && !process.env.AMES_ENGINE_PACK_DIR,
}, async () => {
  for (const id of ids) {
    const pack = await getPackEvidence(id);
    assert.equal(pack.assetId, id);
    assert.equal(pack.revisionId, `${id}:1`);
    assert.equal(pack.technicalPass, true);
    assert.match(pack.sourceSha256, /^[a-f0-9]{64}$/);
    assert.match(pack.packHash, /^[a-f0-9]{64}$/);
    assert.match(pack.contentHash, /^[a-f0-9]{64}$/);
    assert.equal(pack.files.includes(pack.chat.stageAsset), true);
  }
  await assert.rejects(() => readPackFile(ids[0], '../private.obj'), /Unsafe pack path/);
});
