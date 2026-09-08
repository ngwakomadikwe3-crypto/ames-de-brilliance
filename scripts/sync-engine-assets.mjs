import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'

// Only the five intentionally PUBLIC canonical stones. Never copy protected catalog originals.
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
const dependency = pkg.dependencies['@ames/engine']
if ((!dependency?.startsWith('file:') || dependency.endsWith('.tgz')) && !process.env.AMES_ENGINE_ROOT) throw new Error('Set AMES_ENGINE_ROOT to the source engine release when refreshing public GLBs. Staged public assets are already included in this app checkout.')
const root = process.env.AMES_ENGINE_ROOT ?? resolve(dependency.slice(5), '..')
const names = ['round_brilliant','oval_brilliant','emerald_cut','pear_brilliant','asscher_cut']
const pending = []
for (const name of names) {
  const stem = `ames_${name}_v1`, source = resolve(root, 'public/models/canonical', stem)
  const bytes = await readFile(source + '.glb'), validation = JSON.parse(await readFile(source + '.validation.json', 'utf8'))
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== (validation.exportSha256 ?? validation.export_sha256)) throw new Error(`Canonical integrity failed: ${stem}`)
  pending.push({ path: `public/models/canonical/${stem}.glb`, bytes, sha256 })
}
for (const item of pending) { await mkdir(dirname(item.path), { recursive: true }); await writeFile(item.path, item.bytes) }
await writeFile('public/models/canonical/integrity.json', JSON.stringify(pending.map(({path,bytes,sha256}) => ({ path: path.slice(6), byteLength: bytes.length, sha256 })), null, 2))
console.log('Verified and staged five public canonical GLBs; no protected assets copied.')
