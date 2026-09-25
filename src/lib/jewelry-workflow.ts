export const jewelryStatuses = [
  "submitted", "processing", "technical_review", "visual_review",
  "approved", "published", "rejected", "revision_requested",
] as const;
export const jewelrySourceModes = ["cloud_source_upload", "operator_handoff"] as const;
export type JewelrySourceMode = (typeof jewelrySourceModes)[number];
export type JewelryStatus = (typeof jewelryStatuses)[number];
export type JewelryAction = "start_processing" | "attach_pack" | "technical_pass" | "approve" | "reject" | "request_revision" | "publish";
export type JewelrySource = { fileId?: string; filename: string; sha256: string; bytes: number; kind: "source" | "photo" | "document"; sourceMode?: JewelrySourceMode };
export type JewelryProduct = {
  id: string; trader_id: string; name: string; category: string; source_mode: JewelrySourceMode;
  source_files: JewelrySource[]; source_hashes: string[];
  workflow_status: JewelryStatus; asset_id: string; revision_id: string; pack_hash: string; content_hash: string;
  technical_pass: boolean; visual_approval: "pending" | "approved" | "rejected";
  publication_status: "review" | "published"; review_reason: string;
  status_history: { status: JewelryStatus; action: string; reason: string; at: string }[];
  verified_metadata: Record<string, unknown>; created_at: string; updated_at: string;
};
export type PackEvidence = {
  assetId: string; revisionId: string; name: string; category: string;
  sourceSha256: string; packHash: string; contentHash: string; technicalPass: boolean;
  visualApproval: "pending" | "approved" | "rejected";
  publicationStatus: "review" | "published";
  limitations: string[];
  files: string[];
  quality: Record<string, unknown>;
  geometry: Record<string, unknown>;
  materials: Record<string, unknown>;
  chat: { stageAsset: string; poster: string; defaultView: string; rotationEnabled: boolean; supportedViewerActions: string[] };
  boutique: { name: string; category: string; thumbnail: string; heroImage: string; interactiveGlb: string; poster: string; essentialSpecs: Record<string, unknown> };
  mediaItems: { id: string; mediaType: "image" | "video"; path: string; approvalState: string }[];
};

export function allowedJewelryFile(filename: string, bytes: number): JewelrySource["kind"] | null {
  const ext = filename.toLowerCase().split(".").pop();
  const kind = (["obj", "glb", "fbx", "zip"].includes(ext || "") ? "source"
    : ["jpg", "jpeg", "png", "webp"].includes(ext || "") ? "photo"
    : ext === "pdf" ? "document" : null);
  return kind && bytes > 0 && bytes <= 250 * 1024 * 1024 ? kind : null;
}

export function validSourceHash(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export function operatorSourceEntry(input: { filename: string; bytes: number; sha256: string }): JewelrySource {
  const kind = allowedJewelryFile(input.filename, input.bytes);
  if (kind !== "source") throw new Error("Operator handoff requires an OBJ, GLB, FBX, or ZIP source");
  const sha256 = input.sha256.trim().toLowerCase();
  if (!validSourceHash(sha256)) throw new Error("A valid SHA-256 hash is required");
  return { filename: input.filename, bytes: input.bytes, sha256, kind, sourceMode: "operator_handoff" };
}

export function handoffSourceDescriptor(productId: string, source: JewelrySource, productMode: JewelrySourceMode) {
  const sourceMode = source.sourceMode || productMode || "cloud_source_upload";
  return {
    ...(source.fileId ? { fileId: source.fileId } : {}),
    filename: source.filename, sha256: source.sha256, bytes: source.bytes, kind: source.kind, sourceMode,
    ...(source.fileId && sourceMode === "cloud_source_upload"
      ? { download: `/api/jewelry-products/${productId}/source/${source.fileId}` } : {}),
  };
}

export function safeAssetId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(value);
}

export function newJewelryProduct(input: {
  id: string; traderId: string; traderStatus: string; name: string; category: string;
  assetId?: string; sourceMode?: JewelrySourceMode; now: string;
}): JewelryProduct {
  if (input.traderStatus !== "Active") throw new Error("Select an approved trader");
  const name = input.name.trim();
  const category = input.category.trim().toLowerCase();
  if (!name || name.length > 255 || !/^[a-z][a-z-]{1,79}$/.test(category)) {
    throw new Error("A product name and valid category are required");
  }
  const assetId = input.assetId?.trim() || `ames-${input.id}`;
  if (!safeAssetId(assetId) || assetId.length > 100) throw new Error("Invalid engine asset ID");
  return {
    id: input.id, trader_id: input.traderId, name, category, source_mode: input.sourceMode || "cloud_source_upload",
    source_files: [], source_hashes: [], workflow_status: "submitted",
    asset_id: assetId, revision_id: "", pack_hash: "", content_hash: "",
    technical_pass: false, visual_approval: "pending", publication_status: "review",
    review_reason: "", status_history: [{ status: "submitted", action: "create", reason: "", at: input.now }],
    verified_metadata: {}, created_at: input.now, updated_at: input.now,
  };
}

export function isJewelryOwner(role: string | null): boolean {
  return role === "owner";
}

export function previewablePackPath(path: string): boolean {
  return !path.includes("\\") && !path.split("/").includes("..") &&
    (/^(web|ecommerce|luxury|motion)\//.test(path) || /^master\/[^/]+\.json$/.test(path));
}

export function technicalEvidenceValid(pack: PackEvidence, product: JewelryProduct): boolean {
  return pack.assetId === product.asset_id &&
    pack.category.toLowerCase() === product.category.toLowerCase() &&
    pack.name.trim().toLowerCase() === product.name.trim().toLowerCase() &&
    pack.revisionId.startsWith(`${product.asset_id}:`) &&
    pack.technicalPass && validSourceHash(pack.sourceSha256) &&
    product.source_hashes.includes(pack.sourceSha256);
}

function hasValidSource(product: JewelryProduct): boolean {
  return product.source_files.some(file => file.kind === "source" && validSourceHash(file.sha256) &&
    product.source_hashes.includes(file.sha256));
}

export function transitionJewelry(
  product: JewelryProduct, action: JewelryAction, pack?: PackEvidence, reason = "",
): Partial<JewelryProduct> {
  const status = product.workflow_status;
  const requirePack = (allowApprovalMetadataChange = false) => {
    if (!pack || !technicalEvidenceValid(pack, product)) throw new Error("Engine pack identity, source hash, or technical evidence is invalid");
    if (product.revision_id && (pack.revisionId !== product.revision_id ||
      (pack.packHash !== product.pack_hash && (!allowApprovalMetadataChange || pack.contentHash !== product.content_hash)))) {
      throw new Error("Reviewed pack revision or content changed");
    }
    return pack;
  };
  switch (action) {
    case "start_processing":
      if (!["submitted", "revision_requested"].includes(status)) break;
      if (!hasValidSource(product)) throw new Error("A source 3D file with a valid SHA-256 is required");
      return { workflow_status: "processing", review_reason: "" };
    case "attach_pack": {
      if (!["submitted", "processing", "revision_requested"].includes(status)) break;
      if (!hasValidSource(product)) throw new Error("A source 3D file with a valid SHA-256 is required");
      if (!pack || !technicalEvidenceValid(pack, product)) throw new Error("Engine pack identity, source hash, or technical evidence is invalid");
      return { workflow_status: "technical_review", revision_id: pack.revisionId, pack_hash: pack.packHash, content_hash: pack.contentHash,
        technical_pass: false, visual_approval: "pending", publication_status: "review", review_reason: "" };
    }
    case "technical_pass":
      if (status !== "technical_review") break;
      requirePack();
      return { workflow_status: "visual_review", technical_pass: true, review_reason: "" };
    case "approve":
      if (status !== "visual_review" || !product.technical_pass) break;
      requirePack();
      return { workflow_status: "approved", visual_approval: "approved", review_reason: "" };
    case "reject":
      if (!["technical_review", "visual_review", "approved"].includes(status)) break;
      if (!reason.trim()) throw new Error("A rejection reason is required");
      return { workflow_status: "rejected", visual_approval: "rejected", review_reason: reason.trim() };
    case "request_revision":
      if (!["technical_review", "visual_review", "approved", "rejected"].includes(status)) break;
      if (!reason.trim()) throw new Error("A revision reason is required");
      return { workflow_status: "revision_requested", revision_id: "", pack_hash: "", content_hash: "", technical_pass: false,
        visual_approval: "pending", publication_status: "review", review_reason: reason.trim() };
    case "publish": {
      if (status !== "approved" || product.visual_approval !== "approved" || !product.technical_pass) break;
      const checked = requirePack(true);
      if (checked.visualApproval !== "approved" || checked.publicationStatus !== "published" ||
        checked.quality.commercialVisualApproval !== "approved") {
        throw new Error("The engine App Content Pack is not visually approved and published");
      }
      return { workflow_status: "published", publication_status: "published", pack_hash: checked.packHash, review_reason: "" };
    }
  }
  throw new Error(`Cannot ${action} from ${status}`);
}
