"""Build a packed Cycles review scene from the unchanged representative-ring GLB.

Run with the preinstalled 3D runtime:
  /usr/local/bin/3dpy -c "exec(open('scripts/blender/build_realism_review.py').read())"

The source GLB is never modified. Optical treatment is assigned only from the
metadata embedded in that asset; surface-only band accents stay non-transmissive.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path("/mnt/agents/output/app")
SOURCE = ROOT / "public/ames-engine/dev-test-candidate-ring/web/jewelry.glb"
OUT = Path("/mnt/agents/output/ames-blender-review")
SCENE_PATH = OUT / "AMES Realism Review.blend"
EXPECTED_SHA256 = "97cbef4074acf745e2261a342566da4e880fe7ec83d2c00f9c6cccb002ae6c3f"


def aim(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def material(name: str, color, metallic: float, roughness: float, ior: float, transmission: float):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["IOR"].default_value = ior
    bsdf.inputs["Transmission Weight"].default_value = transmission
    return mat


def area(name: str, location, target, energy: float, color, size: float, size_y: float):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "RECTANGLE"
    data.size = size
    data.size_y = size_y
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim(obj, Vector(target))
    return obj


def camera(name: str, location, target, lens: float = 80.0):
    data = bpy.data.cameras.new(name)
    data.lens = lens
    data.sensor_width = 36.0
    data.clip_start = 0.01
    data.clip_end = 100.0
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim(obj, Vector(target))
    return obj


def main() -> None:
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise RuntimeError(f"Source GLB hash changed: {digest}")

    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    scene = bpy.context.scene
    scene.name = "AMES | controlled jewellery realism review"

    ring_objects = [obj for obj in scene.objects if obj.type == "MESH"]
    if len(ring_objects) != 50:
        raise RuntimeError(f"Expected 50 ring meshes, found {len(ring_objects)}")

    metal = material("REVIEW | polished warm metal", (1.0, 0.766, 0.336), 1.0, 0.13, 1.5, 0.0)
    dielectric = material("REVIEW | qualified closed dielectric", (1.0, 1.0, 1.0), 0.0, 0.008, 2.417, 1.0)
    surface = material("REVIEW | unqualified surface accents", (0.025, 0.025, 0.025), 0.0, 0.085, 1.5, 0.0)

    counts = {"conductor": 0, "closed-dielectric-visual": 0, "surface-only-unqualified": 0}
    for obj in ring_objects:
        mode = obj.get("ames_optical_mode")
        if mode not in counts:
            raise RuntimeError(f"Unrecognised optical mode on {obj.name}: {mode!r}")
        counts[mode] += 1
        if mode == "conductor":
            obj.data.materials.clear()
            obj.data.materials.append(metal)
        elif mode == "closed-dielectric-visual":
            obj.data.materials.clear()
            obj.data.materials.append(dielectric)
            for polygon in obj.data.polygons:
                polygon.use_smooth = False
        else:
            obj.data.materials.clear()
            obj.data.materials.append(surface)
        obj["review_treatment"] = mode

    expected_counts = {"conductor": 1, "closed-dielectric-visual": 17, "surface-only-unqualified": 32}
    if counts != expected_counts:
        raise RuntimeError(f"Unexpected optical assignment counts: {counts}")

    corners = [obj.matrix_world @ Vector(corner) for obj in ring_objects for corner in obj.bound_box]
    lower = Vector(tuple(min(v[i] for v in corners) for i in range(3)))
    upper = Vector(tuple(max(v[i] for v in corners) for i in range(3)))
    center = (lower + upper) / 2
    size = upper - lower

    # A neutral, seamless studio floor. It is deliberately excluded from framing calculations.
    floor_mat = material("REVIEW | charcoal silk floor", (0.025, 0.028, 0.033), 0.0, 0.38, 1.5, 0.0)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(center.x, center.y, lower.z - 0.006))
    floor = bpy.context.object
    floor.name = "STUDIO | charcoal floor"
    floor.data.materials.append(floor_mat)

    world = bpy.data.worlds.new("STUDIO | neutral low-level ambience")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.32, 0.35, 0.4, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.18
    scene.world = world

    target = center + Vector((0, 0, 0.04))
    area("STUDIO | left tall softbox", (-3.2, -3.0, 3.6), target, 440, (1.0, 0.94, 0.85), 2.0, 4.2)
    area("STUDIO | right strip", (3.0, -1.2, 2.5), target, 360, (0.88, 0.94, 1.0), 0.85, 3.2)
    area("STUDIO | overhead silk", (0.0, 1.8, 4.8), target, 360, (1.0, 0.98, 0.94), 2.6, 2.0)
    area("STUDIO | rear rim", (-1.8, 2.4, 2.6), target, 480, (0.86, 0.92, 1.0), 1.1, 2.8)
    area("STUDIO | frontal stone card", (0.2, -3.6, 1.6), target, 45, (1.0, 1.0, 1.0), 0.65, 0.65)

    # Large dark reflection flags give the polished shank readable dark/bright structure.
    flag_mat = material("STUDIO | black reflection flags", (0.004, 0.004, 0.004), 0.0, 0.8, 1.5, 0.0)
    for name, loc, scale, rot in [
        ("left", (-2.0, 0.1, 1.6), (0.02, 1.5, 2.3), (0, 0, -0.28)),
        ("right", (2.0, 0.5, 1.5), (0.02, 1.3, 2.1), (0, 0, 0.32)),
    ]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
        flag = bpy.context.object
        flag.name = f"STUDIO | {name} dark flag"
        flag.scale = scale
        flag.rotation_euler = rot
        flag.data.materials.append(flag_mat)
        flag.visible_camera = False

    hero = camera("CAMERA | hero", target + Vector((2.55, -4.65, 2.35)), target, 82)
    scene.camera = hero
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 128
    scene.cycles.use_denoising = True
    scene.cycles.adaptive_threshold = 0.015
    scene.cycles.max_bounces = 16
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 8
    scene.cycles.transmission_bounces = 12
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.sample_clamp_indirect = 8.0
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.filepath = str(OUT / "round-02" / "hero.png")
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.0

    scene["ames_asset_id"] = "dev-test-candidate-ring:3"
    scene["ames_source_sha256"] = digest
    scene["ames_physical_scale_confirmed"] = False
    scene["review_notice"] = "Cycles render, not product photography; no gemstone, alloy, scale, certification or manufacturing claim."
    scene["review_bounds"] = list(size)
    scene["review_assignment_counts"] = json.dumps(counts, sort_keys=True)
    text = bpy.data.texts.new("READ ME | AMES realism review")
    text.write(
        "AMES representative ring — controlled Cycles realism review\n"
        f"Source: {SOURCE}\nSHA-256: {digest}\n\n"
        "The original GLB is unchanged. C00 and A00–A15 are qualified closed dielectrics. "
        "B00–B31 remain surface-only, non-transmissive accents. M00 is a conductor.\n"
        "The warm metal colour is retained from the supplied material; it is not an alloy specification.\n"
        "No physical scale, gemstone identity, optical certification, manufacturing suitability, "
        "licence, product approval or stock-photography claim is established by this scene.\n"
    )

    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(SCENE_PATH))
    print("REVIEW_SCENE", SCENE_PATH)
    print("REVIEW_ASSIGNMENTS", counts)
    print("REVIEW_BOUNDS", list(lower), list(upper))
    bpy.ops.render.render(write_still=True)
    print("REVIEW_RENDER", scene.render.filepath)


if __name__ == "__main__":
    main()
