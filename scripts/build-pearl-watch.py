"""Create the pearl-dial watch from the articulated square case after it is built."""
import json
from pathlib import Path
import struct

root = Path("public/ames-engine")
source = (root / "ames-iced-watch/web/watch-square.glb").read_bytes()
length = struct.unpack_from("<I", source, 12)[0]
model = json.loads(source[20:20 + length])
materials = model["materials"]
dial = next(material for material in materials if material["name"] == "White enamel dial")
dial["extensions"] = {**dial.get("extensions", {}), "KHR_materials_iridescence": {
    "iridescenceFactor": 0.45, "iridescenceIor": 1.32,
    "iridescenceThicknessMinimum": 190, "iridescenceThicknessMaximum": 340}}
model.setdefault("extensionsUsed", [])
if "KHR_materials_iridescence" not in model["extensionsUsed"]:
    model["extensionsUsed"].append("KHR_materials_iridescence")
steel = {"name": "Blued hands", "pbrMetallicRoughness": {
    "metallicFactor": 0.88, "roughnessFactor": 0.21, "baseColorFactor": [0.014, 0.06, 0.19, 1]}}
materials.append(steel)
for node in model["nodes"]:
    if node.get("name") in ("Hour hand mesh", "Minute hand mesh") and "mesh" in node:
        for primitive in model["meshes"][node["mesh"]]["primitives"]:
            primitive["material"] = len(materials) - 1
header = json.dumps(model, separators=(",", ":")).encode()
header += b" " * (-len(header) % 4)
tail = source[20 + length:]
output = root / "ames-pearl-watch/web/watch.glb"
output.write_bytes(struct.pack("<4s4I", b"glTF", 2, 20 + len(header) + len(tail), len(header), 0x4e4f534a) + header + tail)
