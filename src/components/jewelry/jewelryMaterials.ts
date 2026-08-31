import * as THREE from "three";

export type MetalId = "platinum" | "whiteGold" | "yellowGold" | "roseGold" | "silver";
export type GemId = "diamond" | "sapphire" | "ruby" | "emerald";

export const metalPresets: Record<MetalId, THREE.MeshStandardMaterialParameters> = {
  platinum: { color: "#d7d9dc", metalness: 0.98, roughness: 0.22 },
  whiteGold: { color: "#e4e4df", metalness: 0.96, roughness: 0.2 },
  yellowGold: { color: "#c69a35", metalness: 0.97, roughness: 0.2 },
  roseGold: { color: "#b87968", metalness: 0.96, roughness: 0.22 },
  silver: { color: "#c8ccd0", metalness: 0.95, roughness: 0.24 },
};

export const materialMap: Record<MetalId | "diamond", string[]> = {
  platinum: ["Metal_Platinum", "PLATINUM", "Platinum"],
  whiteGold: ["Metal_WhiteGold", "WHITE_GOLD", "WhiteGold"],
  yellowGold: ["YELLOW_GOLD", "Metal_YellowGold", "YellowGold"],
  roseGold: ["Metal_RoseGold", "ROSE_GOLD", "RoseGold"],
  silver: ["Metal_Silver", "SILVER", "Silver"],
  diamond: ["DIAMOND", "Diamond", "diamond"],
};

export const gemstoneConfig: Record<GemId, { color: string; transmission: number; ior: number }> = {
  diamond: { color: "#ffffff", transmission: 1, ior: 2.417 },
  sapphire: { color: "#2456a6", transmission: 0.72, ior: 1.77 },
  ruby: { color: "#9d263b", transmission: 0.7, ior: 1.77 },
  emerald: { color: "#16805d", transmission: 0.68, ior: 1.57 },
};

export function createDiamondMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    color: gemstoneConfig.diamond.color,
    transmission: gemstoneConfig.diamond.transmission,
    ior: gemstoneConfig.diamond.ior,
    roughness: 0,
    metalness: 0,
    thickness: 1.5,
    flatShading: true,
  });
  if ("dispersion" in material) (material as THREE.MeshPhysicalMaterial & { dispersion: number }).dispersion = 0.08;
  return material;
}

export function setMetal(root: THREE.Object3D, id: string, metal: MetalId) {
  const names = new Set(materialMap[metal]);
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!names.has(material.name) && material.name !== id) return;
      const next = metalPresets[metal];
      material.color.set(next.color as string);
      material.metalness = next.metalness ?? material.metalness;
      material.roughness = next.roughness ?? material.roughness;
      material.needsUpdate = true;
    });
  });
}
