"""Reopen and verify the packed AMES Blender realism review."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import bpy

OUT = Path("/mnt/agents/output/ames-blender-review")
SOURCE = Path("/mnt/agents/output/app/public/ames-engine/dev-test-candidate-ring/web/jewelry.glb")
EXPECTED_SHA256 = "97cbef4074acf745e2261a342566da4e880fe7ec83d2c00f9c6cccb002ae6c3f"


def socket(material, name):
    return material.node_tree.nodes.get("Principled BSDF").inputs[name].default_value


def main():
    bpy.ops.wm.open_mainfile(filepath=str(OUT / "AMES Realism Review.blend"))
    scene = bpy.context.scene
    ring = [o for o in scene.objects if o.type == "MESH" and o.get("ames_part_id")]
    groups = {"conductor": [], "closed-dielectric-visual": [], "surface-only-unqualified": []}
    for obj in ring:
        groups[obj["ames_optical_mode"]].append(obj)
    assert len(ring) == 50
    assert {k: len(v) for k, v in groups.items()} == {"conductor": 1, "closed-dielectric-visual": 17, "surface-only-unqualified": 32}
    for obj in groups["conductor"]:
        mat = obj.data.materials[0]
        assert socket(mat, "Metallic") == 1.0
        assert socket(mat, "Transmission Weight") == 0.0
    for obj in groups["closed-dielectric-visual"]:
        mat = obj.data.materials[0]
        assert abs(socket(mat, "IOR") - 2.417) < 0.0001
        assert socket(mat, "Transmission Weight") == 1.0
        assert all(not p.use_smooth for p in obj.data.polygons)
    for obj in groups["surface-only-unqualified"]:
        mat = obj.data.materials[0]
        assert socket(mat, "Transmission Weight") == 0.0
        assert socket(mat, "Metallic") == 0.0
    assert scene.render.engine == "CYCLES"
    assert scene.cycles.device == "CPU"
    assert scene.camera.name == "CAMERA | hero"
    assert scene.render.resolution_x == scene.render.resolution_y == 1400
    assert scene.cycles.samples == 192
    assert len(bpy.data.libraries) == 0
    external_images = [im.filepath for im in bpy.data.images if im.source == "FILE" and not im.packed_file]
    assert not external_images, external_images
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    assert digest == EXPECTED_SHA256 == scene["ames_source_sha256"]
    required = [OUT / "final" / "AMES Realism Hero.png"]
    required += [OUT / "final" / f"orbit-{a:03d}.png" for a in range(0, 360, 45)]
    required += [OUT / "final" / "top.png"]
    required += [OUT / "final" / f"detail-center-{i}.png" for i in range(1, 6)]
    required += [OUT / "final" / f"detail-accent-{i}.png" for i in range(1, 6)]
    required += [OUT / "final" / f"detail-metal-{i}.png" for i in [1, 3, 4, 5]]
    required += [OUT / "final" / "detail-metal-02.png"]
    missing = [str(p) for p in required if not p.is_file() or p.stat().st_size < 10000]
    assert not missing, missing
    report = {
        "status": "passed",
        "blender_version": bpy.app.version_string,
        "scene_reopened": True,
        "scene_engine": scene.render.engine,
        "scene_device": scene.cycles.device,
        "hero_resolution": [scene.render.resolution_x, scene.render.resolution_y],
        "hero_samples": scene.cycles.samples,
        "ring_mesh_count": len(ring),
        "optical_assignment_counts": {k: len(v) for k, v in groups.items()},
        "qualified_dielectric_ior": 2.417,
        "surface_accents_transmission": 0.0,
        "external_libraries": len(bpy.data.libraries),
        "unpacked_file_images": external_images,
        "source_sha256": digest,
        "required_render_count": len(required),
        "required_renders_present": True,
        "physical_scale_confirmed": bool(scene["ames_physical_scale_confirmed"]),
        "notice": scene["review_notice"],
    }
    (OUT / "final" / "verification.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
