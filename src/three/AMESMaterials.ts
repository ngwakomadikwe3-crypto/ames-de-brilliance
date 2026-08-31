import * as THREE from "three";
import type { AMESMetal, AMESMaterialVariant } from "@/data/jewelry/jewelryTypes";

export const AMES_MATERIALS: Record<AMESMetal, THREE.MeshStandardMaterialParameters> = {
  "18k-yellow-gold": { color: "#d5b46b", metalness: 0.92, roughness: 0.2 },
  "18k-rose-gold": { color: "#b98273", metalness: 0.92, roughness: 0.22 },
  "18k-white-gold": { color: "#c8c8c4", metalness: 0.95, roughness: 0.18 },
  platinum: { color: "#d4d7d8", metalness: 0.96, roughness: 0.2 },
  silver: { color: "#bfc4c7", metalness: 0.9, roughness: 0.24 },
};
export const AMES_MATERIAL_MAP: Record<AMESMetal, string[]> = {
  "18k-yellow-gold": ["YELLOW_GOLD", "Yellow_Gold"], "18k-rose-gold": ["ROSE_GOLD", "Rose_Gold"], "18k-white-gold": ["WHITE_GOLD", "White_Gold"], platinum: ["Metal_Platinum", "PLATINUM"], silver: ["SILVER", "Silver"],
};
export const AMES_MATERIAL_VARIANTS: AMESMaterialVariant[] = Object.entries(AMES_MATERIAL_MAP).map(([id, materialNames]) => ({ id: id as AMESMetal, label: id.replaceAll("-", " "), materialNames }));
export function setMetal(root: THREE.Object3D, metal: AMESMetal) { const names = new Set(AMES_MATERIAL_MAP[metal]); root.traverse((node) => { if (!(node instanceof THREE.Mesh)) return; const materials = Array.isArray(node.material) ? node.material : [node.material]; materials.forEach((material) => { if (Object.values(AMES_MATERIAL_MAP).some((list) => list.includes(material.name)) && names.has(material.name)) Object.assign(material, AMES_MATERIALS[metal]); }); }); }
