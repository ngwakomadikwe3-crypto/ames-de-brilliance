import { Quaternion, Vector3 } from 'three';

// --- anatomical joint limits -----------------------------------------------------------------------------------------
const DEG = Math.PI / 180;
// [min flex, max flex, max sideways] in degrees; flex > 0 bends toward the palm, < 0 is hyperextension.
const LIMITS: Record<number, [number, number, number]> = {};
for (let f = 0; f < 4; f++) { const k = 5 + 4 * f; LIMITS[k] = [-25, 95, 25]; LIMITS[k + 1] = [-3, 110, 6]; LIMITS[k + 2] = [-5, 85, 5]; }
LIMITS[2] = [-10, 60, 15]; LIMITS[3] = [-12, 85, 8];

/** Clamp each finger bone's swing to anatomical limits, so tracking can never bend a finger backwards. */
export function clampPose(local: Quaternion[], rest: Vector3[]) {
  const d = new Vector3(), palmar = new Vector3(), side = new Vector3(), v = new Vector3(), out = new Vector3();
  return local.map((q, i) => {
    const lim = LIMITS[i]; if (!lim) return q;
    d.copy(rest[i + 1]).sub(rest[i]).normalize();
    palmar.set(0, 0, -1).addScaledVector(d, d.z).normalize();         // toward the palm, square to the bone
    side.crossVectors(d, palmar);
    v.copy(d).applyQuaternion(q);
    let flex = Math.atan2(v.dot(palmar), v.dot(d)), abd = Math.asin(Math.max(-1, Math.min(1, v.dot(side))));
    const f2 = Math.min(lim[1] * DEG, Math.max(lim[0] * DEG, flex)), a2 = Math.min(lim[2] * DEG, Math.max(-lim[2] * DEG, abd));
    if (f2 === flex && a2 === abd) return q;
    flex = f2; abd = a2;
    out.copy(d).multiplyScalar(Math.cos(flex)).addScaledVector(palmar, Math.sin(flex)).multiplyScalar(Math.cos(abd)).addScaledVector(side, Math.sin(abd)).normalize();
    return new Quaternion().setFromUnitVectors(d, out);
  });
}

