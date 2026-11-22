# Portrait bust: source and licence

`portrait-bust-v1.glb` is cut from the MakeHuman 1.x base mesh (`makehuman/data/3dobjs/base.obj`,
https://github.com/makehumancommunity/makehuman), whose assets are released under
**Creative Commons CC0 1.0 Universal** (public domain dedication; see LICENSE.ASSETS.md in that repository).

Changes by AMES (scripts/blender/create_portrait_bust.py): cut to a bust at the upper chest and deltoids, capped,
subdivided once, converted to millimetres, eye helpers subdivided and painted, try-on anchors computed.
CC0 requires no attribution; this note records provenance.

`face-landmarks-v1.json` holds the 468 landmark positions of MediaPipe's canonical face model
(`mediapipe/modules/face_geometry/data/canonical_face_model.obj`, https://github.com/google-ai-edge/mediapipe,
Apache License 2.0, copy in LICENSE-mediapipe-apache-2.0.txt), scaled and placed on this bust, and their pinned
points on the bust surface. Used to morph the bust to a customer's face.

`portrait-head-v2.glb` (the parametric head) is the MakeHuman base mesh with MakeHuman targets as morph targets:
the young-adult macro shapes, the face-detail targets and the expression units, all CC0 (data/targets in the
MakeHuman repository). Built by scripts/blender/create_portrait_head.py. `portrait-head-v2.json` holds the morph
names, MediaPipe's 478 landmarks as found by MediaPipe Face Mesh (@mediapipe/face_mesh, Apache 2.0) on a render of
the neutral head, and the lip contours. `lip-zones-v1.png` is derived from them.
