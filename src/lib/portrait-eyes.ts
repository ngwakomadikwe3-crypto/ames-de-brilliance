// What makes the twin's eyes and mouth read as alive, beyond the eyeballs' own material (portrait-materials.ts):
//  - the cornea: a clear dome over each iris that bulges out of the eyeball's curve, so the studio's highlights slide
//    over it as the head turns (drawn additively: only its reflection shows, the iris stays sharp beneath);
//  - the tear line: the thin wet meniscus along each lower lid, where the lid meets the eye, catching light;
//  - the mouth cavity: a dark, warm interior behind the teeth, so parted lips never show the back of the head.
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, SphereGeometry, Vector3, type Texture } from 'three';
import type { P3 } from './face-morph';

const CORNEA_R = 7.8, IRIS_R = 6;            // mm: the cornea's radius of curvature and the visible iris

/** A corneal dome for an eyeball (centre and radius in mm, looking along +z). */
export function cornea(centre: P3, eyeRadius: number, env: Texture | null) {
  const theta = Math.asin(IRIS_R / CORNEA_R);
  // place the dome so its rim sits on the eyeball's surface: the clear bulge only over the iris
  const along = Math.sqrt(Math.max(0, eyeRadius ** 2 - IRIS_R ** 2)) - CORNEA_R * Math.cos(theta);
  const g = new SphereGeometry(CORNEA_R, 40, 16, 0, Math.PI * 2, 0, theta); g.rotateX(Math.PI / 2);   // the cap's pole on +z
  const m = new MeshPhysicalMaterial({ color: '#000000', roughness: 0.03, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.0, specularIntensity: 0.55, ior: 1.376,
    envMap: env, envMapIntensity: 0.9, transparent: true, blending: AdditiveBlending, depthWrite: false });
  const mesh = new Mesh(g, m); mesh.name = 'cornea'; mesh.position.set(centre[0], centre[1], centre[2] + along); mesh.renderOrder = 3;
  return mesh;
}

/** The wet line along a lower lid: a thin ribbon just inside the lid margin (landmarks along the lower lid, corner to
 *  corner), tilted toward the eye, glossy and faintly pink. */
export function tearLine(lid: P3[], eyeCentre: P3, env: Texture | null) {
  const pts = lid.map(p => new Vector3(...p)), c = new Vector3(...eyeCentre), pos: number[] = [], idx: number[] = [];
  pts.forEach((p, i) => {
    const toEye = c.clone().sub(p).normalize(), out = new Vector3(0, 0, 1);
    const taper = Math.sin(Math.PI * (i / (pts.length - 1))) * 0.6 + 0.4;          // thinner at the corners
    const a = p.clone().addScaledVector(toEye, 0.2).addScaledVector(out, 0.15), b = p.clone().addScaledVector(toEye, 0.2 + 0.75 * taper).addScaledVector(out, 0.05);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  });
  const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new MeshPhysicalMaterial({ color: new Color('#e9b3a8'), roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMap: env, envMapIntensity: 1.2,
    transparent: true, opacity: 0.55, side: 2, depthWrite: false });
  const mesh = new Mesh(g, m); mesh.name = 'tear line'; mesh.renderOrder = 3;
  return mesh;
}

/** A dark, warm mouth interior behind the lips (centre between the lips, in mm). */
export function mouthCavity(lipCentre: P3, mouthWidth: number) {
  const g = new SphereGeometry(1, 24, 16);
  const m = new MeshBasicMaterial({ color: new Color('#2a0f0e'), side: BackSide });
  const mesh = new Mesh(g, m); mesh.name = 'mouth cavity';
  mesh.scale.set(mouthWidth * 0.55, mouthWidth * 0.34, mouthWidth * 0.62);
  mesh.position.set(lipCentre[0], lipCentre[1] - 2, lipCentre[2] - mouthWidth * 0.62 - 3);
  return mesh;
}

/** The eye and mouth details for a fitted head. `lm` are the skin landmarks (mm), eyes the eyeball centres. */
export function eyeAndMouthDetails(lm: P3[], eyes: { left: P3; right: P3 }, eyeRadius: number, env: Texture | null) {
  const g = new Group(); g.name = 'eye and mouth details';
  g.add(cornea(eyes.left, eyeRadius, env), cornea(eyes.right, eyeRadius, env));
  // lower lids, outer to inner corner (MediaPipe): the right eye in image terms is the model's -x side
  const lower = [[33, 7, 163, 144, 145, 153, 154, 155, 133], [263, 249, 390, 373, 374, 380, 381, 382, 362]];
  const nearest = (lid: number[]) => { const p = lm[lid[4]]; return Math.hypot(p[0] - eyes.left[0], p[1] - eyes.left[1]) < Math.hypot(p[0] - eyes.right[0], p[1] - eyes.right[1]) ? eyes.left : eyes.right; };
  for (const lid of lower) g.add(tearLine(lid.map(i => lm[i]), nearest(lid), env));
  const lipC: P3 = [(lm[13][0] + lm[14][0]) / 2, (lm[13][1] + lm[14][1]) / 2, (lm[13][2] + lm[14][2]) / 2];
  g.add(mouthCavity(lipC, Math.hypot(lm[291][0] - lm[61][0], lm[291][1] - lm[61][1])));
  return g;
}
