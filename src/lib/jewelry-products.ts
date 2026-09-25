import { createHash, randomUUID } from "node:crypto";
import { ID, Query } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { DB_ID, JEWELRY_SOURCES_BUCKET, doc, ensureReady, getDb, getStorage, nowISO } from "./appwrite";
import { allowedJewelryFile, newJewelryProduct, operatorSourceEntry, type JewelryProduct, type JewelrySource, type JewelrySourceMode } from "./jewelry-workflow";

const COLLECTION = "jewelry_products";
const asJson = <T>(value: unknown, fallback: T): T => {
  try { return typeof value === "string" ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
};
function normalize(row: Record<string, unknown>): JewelryProduct {
  return {
    ...row,
    source_mode: row.source_mode === "operator_handoff" ? "operator_handoff" : "cloud_source_upload",
    source_files: asJson(row.source_files, []),
    source_hashes: asJson(row.source_hashes, []),
    status_history: asJson(row.status_history, []),
    verified_metadata: asJson(row.verified_metadata, {}),
  } as unknown as JewelryProduct;
}
function encode(updates: Partial<JewelryProduct>): Record<string, unknown> {
  const data: Record<string, unknown> = { ...updates };
  if (updates.source_files) data.source_files = JSON.stringify(updates.source_files);
  if (updates.source_hashes) data.source_hashes = JSON.stringify(updates.source_hashes);
  if (updates.status_history) data.status_history = JSON.stringify(updates.status_history);
  if (updates.verified_metadata) data.verified_metadata = JSON.stringify(updates.verified_metadata);
  delete data.id;
  return data;
}

export async function listJewelryProducts(): Promise<JewelryProduct[]> {
  await ensureReady();
  const products: JewelryProduct[] = [];
  let cursor = "";
  for (;;) {
    const queries = [Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])];
    const page = await getDb().listDocuments({ databaseId: DB_ID, collectionId: COLLECTION, queries });
    products.push(...page.documents.map(row => normalize(doc(row))));
    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1].$id;
  }
  return products.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getJewelryProduct(id: string): Promise<JewelryProduct | null> {
  await ensureReady();
  try { return normalize(doc(await getDb().getDocument({ databaseId: DB_ID, collectionId: COLLECTION, documentId: id }))); }
  catch { return null; }
}

export async function createJewelryProduct(input: { traderId: string; name: string; category: string; assetId?: string; sourceMode?: JewelrySourceMode }): Promise<JewelryProduct> {
  await ensureReady();
  const trader = await getDb().getDocument({ databaseId: DB_ID, collectionId: "traders", documentId: input.traderId }).catch(() => null);
  const id = randomUUID();
  const product = newJewelryProduct({ id, traderId: input.traderId, traderStatus: trader?.status || "",
    name: input.name, category: input.category, assetId: input.assetId, sourceMode: input.sourceMode, now: nowISO() });
  const duplicate = await getDb().listDocuments({ databaseId: DB_ID, collectionId: COLLECTION, queries: [Query.equal("asset_id", product.asset_id), Query.limit(1)] });
  if (duplicate.total) throw new Error("Engine asset ID is already linked to a jewelry product");
  const row = await getDb().createDocument({ databaseId: DB_ID, collectionId: COLLECTION, documentId: id, data: encode(product) });
  return normalize(doc(row));
}

export async function updateJewelryProduct(id: string, updates: Partial<JewelryProduct>): Promise<JewelryProduct> {
  await ensureReady();
  const row = await getDb().updateDocument({
    databaseId: DB_ID, collectionId: COLLECTION, documentId: id,
    data: encode({ ...updates, updated_at: nowISO() }),
  });
  return normalize(doc(row));
}

export async function addJewelryFile(product: JewelryProduct, file: File): Promise<JewelryProduct> {
  if (!["submitted", "revision_requested"].includes(product.workflow_status)) throw new Error("Source files are locked after processing begins");
  const kind = allowedJewelryFile(file.name, file.size);
  if (!kind) throw new Error("Unsupported or oversized jewelry file");
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const stored = await getStorage().createFile({
    bucketId: JEWELRY_SOURCES_BUCKET, fileId: ID.unique(),
    file: InputFile.fromBuffer(bytes, safeName),
  });
  const entry: JewelrySource = { fileId: stored.$id, filename: file.name, sha256, bytes: file.size, kind, sourceMode: "cloud_source_upload" };
  try {
    return await updateJewelryProduct(product.id, {
      source_files: [...product.source_files, entry],
      source_hashes: kind === "source" ? [...product.source_hashes, sha256] : product.source_hashes,
      source_mode: "cloud_source_upload",
    });
  } catch (error) {
    await getStorage().deleteFile({ bucketId: JEWELRY_SOURCES_BUCKET, fileId: stored.$id }).catch(() => {});
    throw error;
  }
}

export async function registerOperatorSource(product: JewelryProduct, input: { filename: string; bytes: number; sha256: string }): Promise<JewelryProduct> {
  if (!["submitted", "revision_requested"].includes(product.workflow_status)) throw new Error("Source files are locked after processing begins");
  const entry = operatorSourceEntry(input);
  return updateJewelryProduct(product.id, {
    source_mode: "operator_handoff",
    source_files: [...product.source_files, entry],
    source_hashes: [...product.source_hashes, entry.sha256],
  });
}
