export type CadComponent = { id: string; name: string; triangles: number; originalMaterials: string[]; material: string; closedManifold?: boolean; opticalMode?: string };
export type CadJob = {
  id: string; productId: string; assetId: string; name: string; category: string;
  sourceFileId: string; sourceFilename: string; sourceSha256: string;
  units: string; assignments: Record<string, string>; createdAt: string;
  status: "queued" | "processing" | "ready" | "failed"; error: string | null;
  result: null | { components: CadComponent[]; triangleCount: number; limitations: string[]; previewSha256: string; posterSha256: string };
};
