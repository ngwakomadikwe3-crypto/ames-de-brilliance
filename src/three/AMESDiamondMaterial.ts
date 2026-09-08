import * as THREE from "three";

export function createAMESDiamondMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xdbeaff,
    transmission: 0.28,
    ior: 2.417,
    roughness: 0.028,
    metalness: 0,
    thickness: 1.5,
    flatShading: true,
    clearcoat: 1,
    clearcoatRoughness: 0.018,
    envMapIntensity: 3.4,
    emissive: 0x152335,
    emissiveIntensity: 0.42,
    specularIntensity: 1,
    side: THREE.DoubleSide,
  });
  if ("dispersion" in material) (material as THREE.MeshPhysicalMaterial & { dispersion: number }).dispersion = 0.18;
  return material;
}
