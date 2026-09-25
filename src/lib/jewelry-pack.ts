import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, delimiter, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { safeAssetId, type PackEvidence } from "./jewelry-workflow";

const execFileAsync = promisify(execFile);
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function withoutApproval(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutApproval);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) =>
      !["publicationStatus", "visualApproval", "approvalState"].includes(key))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, withoutApproval(nested)]));
  }
  return value;
}

function candidatePackRoots(assetId: string): string[] {
  const configured = process.env.AMES_ENGINE_PACK_DIRS || process.env.AMES_ENGINE_PACK_DIR;
  return configured
    ? configured.split(delimiter).map(value => resolve(value.trim())).filter(value => basename(value) === assetId)
    : [resolve(process.cwd(), "..", "ames-engine-main", "dist", assetId)];
}

export async function packRootFor(assetId: string): Promise<string> {
  if (!safeAssetId(assetId)) throw new Error("Invalid engine asset ID");
  for (const candidate of candidatePackRoots(assetId)) {
    try {
      const root = await realpath(candidate);
      if ((await stat(join(root, "manifest.json"))).isFile()) return root;
    } catch { /* Try next configured pack. */ }
  }
  throw new Error(`AMES Engine pack is unavailable: ${assetId}`);
}

export function safePackPath(path: string): boolean {
  return !!path && !path.startsWith("/") && !path.includes("\\") && !path.split("/").includes("..");
}

export async function readPackFile(assetId: string, path: string): Promise<Buffer> {
  if (!safePackPath(path)) throw new Error("Unsafe pack path");
  const root = await packRootFor(assetId);
  const target = await realpath(/* turbopackIgnore: true */ resolve(root, path));
  if (!target.startsWith(root + sep) || !(await stat(target)).isFile()) throw new Error("Pack file is unavailable");
  return readFile(target);
}

export async function getPackEvidence(assetId: string): Promise<PackEvidence> {
  const root = await packRootFor(assetId);
  const read = async (path: string) => JSON.parse((await readPackFile(assetId, path)).toString("utf8"));
  const [manifest, quality, checksums, asset, chat, boutique, media, geometry, materials] = await Promise.all([
    read("manifest.json"), read("quality-report.json"), read("sha256.json"),
    read("app/asset.json"), read("app/chat.json"), read("app/boutique.json"), read("app/media.json"),
    read("master/geometry-validation.json"), read("master/gemstone-material-metadata.json"),
  ]);
  const revisionId = `${assetId}:${manifest.revision}`;
  if (manifest.assetId !== assetId || quality.assetId !== assetId ||
      !Array.isArray(manifest.files) || !manifest.files.every((path: unknown) => typeof path === "string" && safePackPath(path)) ||
      [asset, chat, boutique, media].some(contract =>
        contract.assetId !== assetId || contract.revisionId !== revisionId ||
        contract.visualApproval !== asset.visualApproval || contract.publicationStatus !== asset.publicationStatus) ||
      (manifest.category !== undefined && asset.category !== manifest.category) || boutique.category !== asset.category ||
      (asset.publicationStatus === "published" && (asset.visualApproval !== "approved" ||
        media.items?.some((item: { approvalState: string; assetId: string }) => item.approvalState !== "approved" || item.assetId !== assetId)))) {
    throw new Error("Engine pack identity, category, revision, or approval mismatch");
  }
  for (const path of ["manifest.json", "quality-report.json", ...manifest.files]) {
    const expected = checksums.files?.[path];
    if (typeof expected !== "string" || hash(await readPackFile(assetId, path)) !== expected) {
      throw new Error(`Engine pack checksum mismatch: ${path}`);
    }
  }
  const archive = await readFile(join(root, "delivery.zip"));
  const assetForReview = { ...asset };
  delete assetForReview.status; // Approval milestones may change without changing the reviewed piece.
  const reviewedContent = {
    files: Object.fromEntries(manifest.files.filter((path: string) => !path.startsWith("app/"))
      .map((path: string) => [path, checksums.files[path]])),
    contracts: withoutApproval({ asset: assetForReview, chat, boutique, media }),
  };
  return {
    assetId, revisionId, name: asset.name, category: asset.category,
    sourceSha256: manifest.sourceSha256, packHash: hash(archive), contentHash: hash(Buffer.from(JSON.stringify(reviewedContent))),
    technicalPass: quality.requiredFilesPresent === true && quality.sourceHashVerified === true &&
      quality.preparedMasterHashVerified === true && quality.browserValidationPassed === true,
    visualApproval: asset.visualApproval, publicationStatus: asset.publicationStatus,
    limitations: Array.isArray(asset.limitations) ? asset.limitations : [],
    files: manifest.files, quality, geometry, materials,
    chat: { stageAsset: chat.stageAsset, poster: chat.poster, defaultView: chat.defaultView,
      rotationEnabled: chat.rotationEnabled, supportedViewerActions: chat.supportedViewerActions },
    boutique: { name: boutique.name, category: boutique.category, thumbnail: boutique.thumbnail,
      heroImage: boutique.heroImage, interactiveGlb: boutique.interactiveGlb, poster: boutique.poster,
      essentialSpecs: boutique.essentialSpecs },
    mediaItems: media.items,
  };
}

export async function syncEngineContent(): Promise<void> {
  for (const script of ["sync-ames-chat.mjs", "sync-ames-boutique.mjs", "sync-ames-media.mjs"]) {
    await execFileAsync(process.execPath, [join(process.cwd(), "scripts", script)], {
      cwd: process.cwd(), timeout: 120_000,
    });
  }
}
