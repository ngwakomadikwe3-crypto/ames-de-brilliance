"""Render photoreal studio stills without modifying supplied jewellery GLBs.

Examples:
  AMES_ASSET=dev-test-candidate-ring AMES_SHOT=editorial \
    /usr/local/bin/3dpy scripts/blender/render_photoreal_jewelry.py
  AMES_ASSET=dev-test-pendant-001 AMES_SHOT=all \
    /usr/local/bin/3dpy scripts/blender/render_photoreal_jewelry.py

AMES_OUTPUT_ROOT can point to a temporary review directory. Customer images are
Cycles visualizations, not stock photography or material/scale/approval claims.
"""
from __future__ import annotations

import hashlib
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

PROJECT = Path(os.environ.get("AMES_PROJECT_ROOT", "/mnt/agents/output/app"))
SOURCE_ROOT = PROJECT / "public/ames-engine"
OUTPUT_ROOT = Path(os.environ.get("AMES_OUTPUT_ROOT", str(SOURCE_ROOT)))
ASSET = os.environ.get("AMES_ASSET", "dev-test-candidate-ring")
SHOT = os.environ.get("AMES_SHOT", "all")
SAMPLES = int(os.environ.get("AMES_SAMPLES", "80"))
RESOLUTION_SCALE = float(os.environ.get("AMES_RESOLUTION_SCALE", "1"))
SKIP_EXISTING = os.environ.get("AMES_SKIP_EXISTING") == "1"

ASSETS = {
    "dev-test-candidate-ring": {
        "meshes": 2,
        "sha256": "5eefe57b5ddb6722c2c728fb6ea7820753fec8c5bebebcdd743c6edfd80dfe41",
        "editorial_distance": 3.75,
    },
    "dev-test-earring-001": {
        "meshes": 4,
        "sha256": "41c64f595766f514c5ba7230d8aaba05dc9f8f1d29b70f3ca255b853d1d41b16",
        "editorial_distance": 3.25,
    },
    "dev-test-pendant-001": {
        "meshes": 135,
        "sha256": "2de38267945204b13c4f7cc94dcb53a0ee31af624cc19d9fa4669c5c549928c8",
        "editorial_distance": 3.55,
    },
    "dev-test-solitaire-mount": {
        "meshes": 2,
        "sha256": "34b89bed9c4f5d952705634f20da9d08bf61b28de46a578037caa0fbb861003c",
        "editorial_distance": 3.45,
    },
}
if ASSET not in ASSETS:
    raise RuntimeError(f"Unsupported review asset: {ASSET}")
PACK = SOURCE_ROOT / ASSET
OUTPUT_PACK = OUTPUT_ROOT / ASSET
SOURCE = PACK / "web/jewelry.glb"


def aim(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def set_input(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


def material(name, color, metallic, roughness, *, ior=1.5, transmission=0.0, coat=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["IOR"].default_value = ior
    bsdf.inputs["Transmission Weight"].default_value = transmission
    set_input(bsdf, "Coat Weight", coat)
    set_input(bsdf, "Coat Roughness", 0.24)
    return mat


def area(name, location, target, energy, color, size, size_y):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "RECTANGLE"
    data.size = size
    data.size_y = size_y
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim(obj, target)
    return obj


def camera(name, target, radius, azimuth, elevation, distance, lens=82):
    az, el = math.radians(azimuth), math.radians(elevation)
    offset = Vector((
        distance * math.sin(az) * math.cos(el),
        -distance * math.cos(az) * math.cos(el),
        distance * math.sin(el),
    ))
    data = bpy.data.cameras.new(name)
    data.lens = lens
    data.sensor_width = 36
    data.clip_start = max(0.0005, radius / 1500)
    data.clip_end = max(100, radius * 100)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = target + offset
    aim(obj, target)
    return obj


def render(scene, cam, path, resolution):
    scene.camera = cam
    scene.render.resolution_x = max(320, round(resolution * RESOLUTION_SCALE))
    scene.render.resolution_y = scene.render.resolution_x
    scene.render.resolution_percentage = 100
    scene.cycles.samples = SAMPLES
    scene.render.filepath = str(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path, flush=True)


def assign_materials(objects):
    if ASSET == "dev-test-candidate-ring":
        metal = material("VISUAL | polished silver-toned conductor", (0.82, 0.86, 0.92), 1.0, 0.13)
        gem = material("VISUAL | qualified closed dielectric", (1.0, 1.0, 1.0), 0.0, 0.004, ior=2.417, transmission=1.0)
        accent = material("VISUAL | non-transmissive surface accents", (0.025, 0.025, 0.025), 0.0, 0.10)
        counts = {"conductor": 0, "closed-dielectric-visual": 0, "surface-only-unqualified": 0}
        for obj in objects:
            mode = obj.get("ames_optical_mode")
            if mode not in counts:
                raise RuntimeError(f"Unrecognised optical mode on {obj.name}: {mode!r}")
            counts[mode] += 1
            obj.data.materials.clear()
            obj.data.materials.append({"conductor": metal, "closed-dielectric-visual": gem, "surface-only-unqualified": accent}[mode])
            if mode == "closed-dielectric-visual":
                for polygon in obj.data.polygons:
                    polygon.use_smooth = False
            obj["review_treatment"] = mode
        expected = {"conductor": 1, "closed-dielectric-visual": 1, "surface-only-unqualified": 0}
        if counts != expected:
            raise RuntimeError(f"Unexpected optical assignment counts: {counts}")
        return

    neutral = material("VISUAL | neutral satin-polished unqualified surface", (0.76, 0.78, 0.82), 0.92, 0.21, coat=0.12)
    for obj in objects:
        if obj.get("ames_material_key") != "source-unqualified":
            raise RuntimeError(f"Refusing unreviewed optical assignment on {obj.name}")
        obj.data.materials.clear()
        obj.data.materials.append(neutral)
        obj["review_treatment"] = "neutral-satin-polished-source-unqualified"


def main():
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if digest != ASSETS[ASSET]["sha256"]:
        raise RuntimeError(f"Source GLB hash changed for {ASSET}: {digest}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    scene = bpy.context.scene
    scene.name = f"AMES | {ASSET} | photoreal studio visualization"
    objects = [obj for obj in scene.objects if obj.type == "MESH"]
    if len(objects) != ASSETS[ASSET]["meshes"]:
        raise RuntimeError(f"Expected {ASSETS[ASSET]['meshes']} meshes, found {len(objects)}")
    assign_materials(objects)

    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    lower = Vector(tuple(min(v[i] for v in points) for i in range(3)))
    upper = Vector(tuple(max(v[i] for v in points) for i in range(3)))
    center = (lower + upper) / 2
    size = upper - lower
    radius = max(size.x, size.y, size.z)
    if not math.isfinite(radius) or radius <= 0:
        raise RuntimeError("Asset has invalid bounds")

    floor_mat = material("STUDIO | matte charcoal silk", (0.016, 0.019, 0.023), 0.0, 0.48)
    floor_bsdf = floor_mat.node_tree.nodes.get("Principled BSDF")
    set_input(floor_bsdf, "Specular IOR Level", 0.24)
    bpy.ops.mesh.primitive_plane_add(size=radius * 30, location=(center.x, center.y, lower.z - radius * 0.008))
    floor = bpy.context.object
    floor.name = "STUDIO | floor"
    floor.data.materials.append(floor_mat)

    world = bpy.data.worlds.new("STUDIO | neutral reflection ambience")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.42, 0.44, 0.47, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.23 if ASSET == "dev-test-candidate-ring" else 0.14
    scene.world = world

    power = radius * radius
    qualified_ring = ASSET == "dev-test-candidate-ring"
    area("STUDIO | key tall silk", center + Vector((-2.8, -3.2, 3.8)) * radius, center, (500 if qualified_ring else 430) * power, (1.0, 0.975, 0.94), 1.65 * radius, 4.2 * radius)
    area("STUDIO | neutral strip", center + Vector((3.0, -1.0, 2.3)) * radius, center, (270 if qualified_ring else 240) * power, (0.94, 0.97, 1.0), 0.62 * radius, 3.4 * radius)
    area("STUDIO | overhead diffusion", center + Vector((0.0, 1.7, 4.5)) * radius, center, (390 if qualified_ring else 320) * power, (1.0, 1.0, 1.0), 2.5 * radius, 1.9 * radius)
    area("STUDIO | fine rear rim", center + Vector((-1.6, 2.5, 2.4)) * radius, center, (500 if qualified_ring else 440) * power, (0.96, 0.98, 1.0), 0.72 * radius, 2.7 * radius)
    if qualified_ring:
        area("STUDIO | frontal stone card", center + Vector((0.35, -3.8, 1.8)) * radius, center, 95 * power, (1.0, 1.0, 1.0), 0.72 * radius, 0.72 * radius)
        area("STUDIO | pavilion bounce", center + Vector((-0.3, -2.1, 0.15)) * radius, center, 55 * power, (1.0, 0.99, 0.97), 1.25 * radius, 0.42 * radius)

    flag_mat = material("STUDIO | dark reflection flags", (0.003, 0.003, 0.003), 0, 0.85)
    for name, loc, scale, rotation in [
        ("left", (-1.9, 0.1, 1.4), (0.012, 1.4, 2.1), -0.28),
        ("right", (1.9, 0.5, 1.4), (0.012, 1.2, 2.0), 0.32),
    ]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=center + Vector(loc) * radius)
        flag = bpy.context.object
        flag.name = f"STUDIO | {name} flag"
        flag.scale = Vector(scale) * radius
        flag.rotation_euler.z = rotation
        flag.data.materials.append(flag_mat)
        flag.visible_camera = False

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.use_denoising = True
    scene.cycles.adaptive_threshold = 0.014
    scene.cycles.max_bounces = 16
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 10
    scene.cycles.transmission_bounces = 12
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.sample_clamp_indirect = 8.0
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = os.environ.get("AMES_TRANSPARENT") == "1"
    if scene.render.film_transparent:
        floor.hide_render = True
    scene.render.threads_mode = "FIXED"
    scene.render.threads = int(os.environ.get("AMES_THREADS", "4"))
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.0 if qualified_ring else -0.12
    scene["ames_asset_id"] = ASSET
    scene["ames_source_sha256"] = digest
    scene["ames_physical_scale_confirmed"] = False
    scene["review_notice"] = "Cycles visualization of supplied geometry; not product photography or a material, scale, approval, or manufacturing claim."

    editorial_distance = ASSETS[ASSET]["editorial_distance"]
    shots = {
        "poster": (camera("CAMERA | poster", center, radius, 28, 18, 3.55 * radius, 80), OUTPUT_PACK / "web/poster.png", 1200),
        "editorial": (camera("CAMERA | editorial", center, radius, -24, 22, editorial_distance * radius, 84), OUTPUT_PACK / "luxury/editorial-hero.png", 1400),
        "macro": (camera("CAMERA | detail", center, radius, 8, 30, 2.1 * radius, 88), OUTPUT_PACK / "luxury/gemstone-macro.png", 1100),
        "setting": (camera("CAMERA | setting", center, radius, -52, 16, 2.4 * radius, 84), OUTPUT_PACK / "luxury/setting-detail-macro.png", 1100),
    }
    if ASSET == "dev-test-earring-001":
        shots["single"] = (camera("CAMERA | single earring", center, radius, 0, 10, 3.45 * radius, 84), OUTPUT_PACK / "luxury/single-earring.png", 1200)
    if ASSET == "dev-test-candidate-ring":
        shots.update({
            "chat": (camera("CAMERA | chat", center, radius, 34, 20, 3.6 * radius, 82), OUTPUT_PACK / "web/poster-chat.png", 1200),
            "reference": (camera("CAMERA | reference", center, radius, 0, 10, 3.65 * radius, 82), OUTPUT_PACK / "web/poster-reference.png", 1200),
            "presentation": (camera("CAMERA | presentation", center, radius, 28, 22, 3.55 * radius, 84), OUTPUT_PACK / "web/presentation-ring-v2.png", 1200),
        })
    for name, (cam, path, resolution) in shots.items():
        if SHOT in {"all", name}:
            if SKIP_EXISTING and path.exists():
                print("KEPT_EXISTING", path, flush=True)
                continue
            render(scene, cam, path, resolution)
    print("ASSET_COMPLETE", ASSET, SHOT, digest, "bounds", list(size), flush=True)


if __name__ == "__main__":
    main()
