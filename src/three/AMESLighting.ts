import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
export function createAMESLighting(renderer: THREE.WebGLRenderer) { renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1; const pmrem = new THREE.PMREMGenerator(renderer); const room = new RoomEnvironment(); const texture = pmrem.fromScene(room).texture; room.dispose(); pmrem.dispose(); return texture; }
