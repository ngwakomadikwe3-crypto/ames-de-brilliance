import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function loadModule(path, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    console,
  });
  return exports;
}

test('normal database imports make no Appwrite calls and retain an explicit demo utility', async () => {
  const calls = [];
  const appwrite = new Proxy({}, {
    get(_target, property) {
      return () => {
        calls.push(property);
        throw new Error('No Appwrite access is allowed during this test');
      };
    },
  });
  const db = await loadModule('../src/lib/db.ts', {
    './appwrite': appwrite,
    'node-appwrite': {},
    'node-appwrite/file': {},
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, []);
  assert.equal(typeof db.seedDemoIfEmpty, 'function');
  assert.equal(typeof db.getStaffByCodeAndPassword, 'function');
  assert.equal(typeof db.getAllTraders, 'function');
});

test('trader GET waits for the database and preserves the resolved array response', async () => {
  let resolveTraders;
  const pending = new Promise(resolve => { resolveTraders = resolve; });
  const route = await loadModule('../src/app/api/traders/route.ts', {
    'next/server': { NextResponse: { json: value => Response.json(value) } },
    '@/lib/db': { getAllTraders: () => pending },
  });
  let completed = false;
  const response = route.GET().then(value => { completed = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false);
  const traders = [{ id: 'existing-trader', name: 'Existing trader', status: 'Active' }];
  resolveTraders(traders);
  assert.deepEqual(await (await response).json(), traders);
});

test('trader GET preserves an empty resolved list', async () => {
  const route = await loadModule('../src/app/api/traders/route.ts', {
    'next/server': { NextResponse: { json: value => Response.json(value) } },
    '@/lib/db': { getAllTraders: async () => [] },
  });
  assert.deepEqual(await (await route.GET()).json(), []);
});
