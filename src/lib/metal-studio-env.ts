// A jewellery photographer's studio, as an HDR environment for polished metal (also copied into the AMES engine
// by scripts/prepare-view-gestures.mjs, so keep it free of app imports).
// Polished metal is a mirror: what makes it read as steel or gold is what it reflects. A near-black room with
// three large, very bright softboxes gives the long white streaks; black flag cards between them give the
// near-black bands. The key strip sits in front of and above the camera's default view so one streak runs across
// a watch face and the tops of bracelet links; a tall side strip lights the case flank; a rim strip behind
// separates the outline.
import { BackSide, BoxGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, PMREMGenerator, Scene, type WebGLRenderer, type Texture } from 'three';

type Panel = { w: number; h: number; at: [number, number, number]; look?: [number, number, number]; light: number; tint?: string };
const SOFTBOXES: Panel[] = [
  { w: 9, h: 2.2, at: [0.6, 4.2, 6.5], light: 9, tint: '#fffaf2' },        // key strip: in front, above
  { w: 1.8, h: 9, at: [-7.5, 1.5, 2.5], light: 6, tint: '#f4f7ff' },       // tall side strip: case flanks
  { w: 7, h: 1.6, at: [2, 3.5, -7.5], light: 4.5, tint: '#ffffff' },       // rim strip behind
  { w: 3, h: 3, at: [0, -6, 3], light: 0.9, tint: '#ffffff' },             // faint fill bounce from below
];
const FLAGS: Panel[] = [
  { w: 2.6, h: 9, at: [-3.2, 1, 5.5], light: 0 },                         // between key and side: the dark band
  { w: 9, h: 2.4, at: [0, 7.5, 1], light: 0 },
  { w: 2.4, h: 8, at: [6, 0.5, 3], light: 0 },
];

/** PMREM environment; rotation (radians about +y) turns the whole studio round the piece. */
export function createMetalStudioEnvironment(renderer: WebGLRenderer, rotation = 0): { texture: Texture; dispose(): void } {
  const scene = new Scene();
  const room = new Mesh(new BoxGeometry(24, 24, 24), new MeshBasicMaterial({ color: new Color('#0b0c0e'), side: BackSide }));
  scene.add(room);
  const plane = new PlaneGeometry(1, 1);
  for (const p of [...SOFTBOXES, ...FLAGS]) {
    const material = new MeshBasicMaterial({ color: new Color(p.tint ?? '#000000').multiplyScalar(p.light), side: DoubleSide });
    const m = new Mesh(plane, material);
    m.scale.set(p.w, p.h, 1); m.position.set(...p.at); m.lookAt(0, 0, 0);
    scene.add(m);
  }
  scene.rotation.y = rotation;
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.012);
  pmrem.dispose();
  scene.traverse(o => { const m = o as Mesh; if (m.isMesh) { (m.material as MeshBasicMaterial).dispose(); } });
  plane.dispose(); room.geometry.dispose();
  return { texture: target.texture, dispose: () => target.dispose() };
}
