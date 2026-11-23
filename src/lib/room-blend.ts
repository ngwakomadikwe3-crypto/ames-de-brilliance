// Room light for the portrait twin: while the camera is on, the twin and its jewellery take on some of the customer's
// own light, so gold and skin sit in the same room as the face on screen. The camera frame gives a first-order
// spherical-harmonic read of the room (room-light.ts: the mean, i.e. L0, as brightness and colour; the weighted
// centroid, i.e. L1, as the light's direction). It is blended into the studio rig, never replacing it: at most half
// the key's direction and colour, and a bounded change of overall exposure, eased over about a second.
import type { RoomLight } from './ar/room-light';
import { exposureFor } from './ar/room-light';

export const ROOM_MIX = 0.5;
export type RoomBlend = { keyDir: [number, number, number]; keyColour: [number, number, number]; exposure: number; env: number };

/** The studio values moved toward the room by `mix` (0 = studio only). `studioDir` is the key's unit direction. */
export function blendRoom(room: RoomLight, studioDir: [number, number, number], studioExposure: number, mix = ROOM_MIX): RoomBlend {
  // the camera is mirrored to the screen and faces the customer: light from the screen's left is on the twin's
  // screen-left too; the room's light comes toward the face, i.e. from in front (+z)
  const d = [room.direction[0], Math.max(0.15, room.direction[1]), Math.max(0.3, room.direction[2])];   // never from below or behind
  const l = Math.hypot(d[0], d[1], d[2]);
  const mixed = studioDir.map((s, i) => s * (1 - mix) + (d[i] / l) * mix), ml = Math.hypot(mixed[0], mixed[1], mixed[2]) || 1;
  // colour: the room's white balance, normalised so the key's brightness is kept
  const c = room.colour, cm = Math.max(c[0], c[1], c[2]) || 1;
  const keyColour = c.map(v => 1 - mix + mix * (v / cm)) as [number, number, number];
  // exposure: toward the room's brightness, within +-25 % of the studio's
  const target = Math.max(studioExposure * 0.75, Math.min(studioExposure * 1.25, studioExposure * exposureFor(room.luminance) / exposureFor(0.18)));
  const exposure = studioExposure + (target - studioExposure) * mix * 2 * 0.5;
  return { keyDir: mixed.map(v => v / ml) as [number, number, number], keyColour, exposure, env: Math.max(0.7, Math.min(1.3, exposure / studioExposure)) };
}
