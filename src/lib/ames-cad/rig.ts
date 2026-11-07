// Moving parts of a piece: groups in their own frames that the viewer animates (bracelet links, earring drops).
import type { Vec3 } from './geometry';

/** A moving part: origin and axes in piece coordinates (mm), its parent part (-1: the piece), and its glTF extras. */
export type RigNode = { name: string; parent: number; o: Vec3; x: Vec3; y: Vec3; z: Vec3; extras: Record<string, unknown> };
export type Rig = {
  nodes: RigNode[];
  /** Part of each shell: -1 the piece itself, -2 a long shell cut triangle by triangle (triangleNode). */
  shellNode: Int32Array;
  triangleNode: Map<number, Uint16Array>;
  /** Part of any point (a stone centre). */
  nodeOf: (p: Vec3) => number;
  /** Extras for the piece root. */
  extras: Record<string, unknown>;
};
