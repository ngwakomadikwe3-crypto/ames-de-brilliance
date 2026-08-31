import * as THREE from "three";
export function createAMESCamera(aspect = 1) { return new THREE.PerspectiveCamera(35, aspect, 0.01, 100); }
