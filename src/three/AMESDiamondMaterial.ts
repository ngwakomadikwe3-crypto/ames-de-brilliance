import * as THREE from "three";

export function createAMESDiamondMaterial() {
  const material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, ior: 2.42, roughness: 0, metalness: 0, thickness: 1.5, flatShading: true, envMapIntensity: 1.25 });
  if ("dispersion" in material) (material as THREE.MeshPhysicalMaterial & { dispersion: number }).dispersion = 0.18;
  return material;
}
