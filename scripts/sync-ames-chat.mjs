import { copyFile, mkdir, realpath, stat, writeFile } from 'node:fs/promises'
import { resolve, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { enginePackSources, readPackContracts } from './ames-engine-packs.mjs'

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const publicRoot = join(appRoot, 'public', 'ames-engine')
const contracts = []
for (const packRoot of await enginePackSources(appRoot)) {
  const { chat } = await readPackContracts(packRoot)
  if (contracts.includes(`${chat.assetId}/app/chat.json`)) throw new Error(`Duplicate AMES Chat asset ID: ${chat.assetId}`)
  const paths = ['app/chat.json', 'app/asset.json', chat.stageAsset, chat.poster, chat.heroImage, chat.macroImage]
  const targetRoot = join(publicRoot, chat.assetId)
  for (const path of new Set(paths)) {
    if (typeof path !== 'string' || !path || path.includes('\\') || path.split('/').includes('..') || path.startsWith('/')) throw new Error(`Unsafe pack path: ${path}`)
    const source = await realpath(resolve(packRoot, path))
    if (!source.startsWith(packRoot + sep) || !(await stat(source)).isFile()) throw new Error(`Missing pack file: ${path}`)
    const target = resolve(targetRoot, path)
    if (!target.startsWith(targetRoot + sep)) throw new Error(`Unsafe target path: ${path}`)
    await mkdir(resolve(target, '..'), { recursive: true })
    await copyFile(source, target)
  }
  contracts.push(`${chat.assetId}/app/chat.json`)
}
await mkdir(join(publicRoot, 'chat'), { recursive: true })
await writeFile(join(publicRoot, 'chat', 'index.json'), JSON.stringify({ schemaVersion: 'ames.chat-index/1', contracts }, null, 2) + '\n')
console.log(`Synced ${contracts.length} AMES Chat contract(s)`)
