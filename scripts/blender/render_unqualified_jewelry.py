"""Render supplied source-unqualified jewellery without changing its GLB or claims.

AMES_ASSET=dev-test-earring-001 AMES_SHOT=poster \
  /usr/local/bin/3dpy -c "exec(open('scripts/blender/render_unqualified_jewelry.py').read())"

Every mesh must carry ames_material_key=source-unqualified. The neutral polished
material is a studio visualization, never an alloy or gemstone identification.
"""
from __future__ import annotations

import hashlib
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path("/mnt/agents/output/app/public/ames-engine")
ASSET = os.environ.get("AMES_ASSET", "dev-test-earring-001")
SHOT = os.environ.get("AMES_SHOT", "all")
EXPECTED = {"dev-test-earring-001": 4, "dev-test-pendant-001": 135, "dev-test-solitaire-mount": 2}
if ASSET not in EXPECTED:
    raise RuntimeError(f"Unsupported review asset: {ASSET}")
PACK = ROOT / ASSET
SOURCE = PACK / "web/jewelry.glb"


def aim(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def material(name, color, metallic, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Coat Weight"].default_value = 0.28 if metallic else 0.0
    bsdf.inputs["Coat Roughness"].default_value = 0.2
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


def camera(name, target, radius, azimuth, elevation, distance, lens=80):
    az, el = math.radians(azimuth), math.radians(elevation)
    offset = Vector((distance * math.sin(az) * math.cos(el), -distance * math.cos(az) * math.cos(el), distance * math.sin(el)))
    data = bpy.data.cameras.new(name)
    data.lens = lens
    data.sensor_width = 36
    data.clip_start = max(0.001, radius / 1000)
    data.clip_end = max(100, radius * 100)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = target + offset
    aim(obj, target)
    return obj


def render(scene, cam, path, resolution=1200, samples=40):
    scene.camera = cam
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.cycles.samples = samples
    scene.render.filepath = str(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path, flush=True)


def main():
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    scene = bpy.context.scene
    scene.name = f"AMES | {ASSET} | neutral studio visualization"
    objects = [obj for obj in scene.objects if obj.type == "MESH"]
    if len(objects) != EXPECTED[ASSET]:
        raise RuntimeError(f"Expected {EXPECTED[ASSET]} meshes, found {len(objects)}")
    for obj in objects:
        if obj.get("ames_material_key") != "source-unqualified":
            raise RuntimeError(f"Refusing unreviewed optical assignment on {obj.name}")
        obj.data.materials.clear()
        obj.data.materials.append(material("VISUAL | neutral polished unqualified surface", (0.72, 0.70, 0.66), 0.94, 0.17))
        obj["review_treatment"] = "neutral-polished-source-unqualified"

    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    lower = Vector(tuple(min(v[i] for v in points) for i in range(3)))
    upper = Vector(tuple(max(v[i] for v in points) for i in range(3)))
    center = (lower + upper) / 2
    size = upper - lower
    radius = max(size.x, size.y, size.z)
    if not math.isfinite(radius) or radius <= 0:
        raise RuntimeError("Asset has invalid bounds")

    floor_mat = material("STUDIO | charcoal silk", (0.018, 0.022, 0.026), 0, 0.34)
    bpy.ops.mesh.primitive_plane_add(size=radius * 30, location=(center.x, center.y, lower.z - radius * 0.008))
    floor = bpy.context.object
    floor.name = "STUDIO | floor"
    floor.data.materials.append(floor_mat)

    world = bpy.data.worlds.new("STUDIO | neutral ambience")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.30, 0.33, 0.38, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.16
    scene.world = world

    power = radius * radius
    area("STUDIO | warm tall softbox", center + Vector((-2.8, -3.2, 3.8)) * radius, center, 420 * power, (1.0, 0.94, 0.86), 1.8 * radius, 4.0 * radius)
    area("STUDIO | cool strip", center + Vector((3.0, -1.0, 2.3)) * radius, center, 330 * power, (0.86, 0.93, 1.0), 0.72 * radius, 3.2 * radius)
    area("STUDIO | overhead silk", center + Vector((0.0, 1.7, 4.5)) * radius, center, 350 * power, (1.0, 0.98, 0.94), 2.4 * radius, 1.8 * radius)
    area("STUDIO | rear rim", center + Vector((-1.6, 2.5, 2.4)) * radius, center, 440 * power, (0.88, 0.93, 1.0), 0.9 * radius, 2.6 * radius)

    flag_mat = material("STUDIO | dark reflection flags", (0.003, 0.003, 0.003), 0, 0.8)
    for name, loc, scale, rotation in [
        ("left", (-1.9, 0.1, 1.4), (0.015, 1.4, 2.1), -0.28),
        ("right", (1.9, 0.5, 1.4), (0.015, 1.2, 2.0), 0.32),
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
    scene.cycles.adaptive_threshold = 0.022
    scene.cycles.max_bounces = 12
    scene.cycles.glossy_bounces = 8
    scene.cycles.sample_clamp_indirect = 6.0
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.15
    scene["ames_asset_id"] = ASSET
    scene["ames_source_sha256"] = digest
    scene["ames_physical_scale_confirmed"] = False
    scene["review_notice"] = "Cycles visualization of supplied geometry; not product photography or a material, scale, approval, or manufacturing claim."

    shots = {
        "poster": (camera("CAMERA | poster", center, radius, 28, 18, 3.8 * radius, 78), PACK / "web/poster.png", 1200),
        "editorial": (camera("CAMERA | editorial", center, radius, -24, 22, 4.0 * radius, 82), PACK / "luxury/editorial-hero.png", 1400),
        "macro": (camera("CAMERA | detail", center, radius, 8, 30, 2.1 * radius, 88), PACK / "luxury/gemstone-macro.png", 1000),
        "setting": (camera("CAMERA | setting", center, radius, -52, 16, 2.4 * radius, 84), PACK / "luxury/setting-detail-macro.png", 1000),
    }
    if ASSET == "dev-test-earring-001":
        shots["single"] = (camera("CAMERA | single earring", center, radius, 0, 10, 4.0 * radius, 82), PACK / "luxury/single-earring.png", 1200)
    for name, (cam, path, resolution) in shots.items():
        if SHOT in {"all", name}:
            render(scene, cam, path, resolution)
    print("ASSET_COMPLETE", ASSET, SHOT, digest, "bounds", list(size), flush=True)


if __name__ == "__main__":
    main()
