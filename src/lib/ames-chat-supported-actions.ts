import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Server-side reader for the viewer actions the SAME chat stage currently supports.
 *
 * The chat content is described by an index at public/ames-engine/chat/index.json
 * (schema ames.chat-index/1) that lists per-asset contracts
 * (<assetId>/app/chat.json, schema ames.chat-content/1). Each contract carries its
 * own supportedViewerActions allowlist. Reading the index first is required:
 * a bare public/ames-engine/chat.json file does not exist.
 *
 * Returns [] whenever the index or contract is missing or malformed so the API
 * route can fall back to "no viewer actions" instead of failing the chat reply.
 */
export async function loadSupportedChatActions(publicDir?: string, assetId?: string): Promise<string[]> {
  const root = join(publicDir ?? join(process.cwd(), 'public'), 'ames-engine');
  const index = JSON.parse(await readFile(join(root, 'chat', 'index.json'), 'utf8'));
  if (index.schemaVersion !== 'ames.chat-index/1' || !Array.isArray(index.contracts) || index.contracts.length === 0) {
    return [];
  }
  const path = assetId ? `${assetId}/app/chat.json` : index.contracts[0];
  if (!index.contracts.includes(path)) return [];
  const contract = JSON.parse(await readFile(join(root, path), 'utf8'));
  return contract.schemaVersion === 'ames.chat-content/1' && Array.isArray(contract.supportedViewerActions)
    ? contract.supportedViewerActions
    : [];
}
