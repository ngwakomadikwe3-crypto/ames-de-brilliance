"""Render the saved AMES scene through the fixed inspection shot set.

Select a batch with AMES_RENDER_SET=orbit|details|hero|all. Every invocation
opens the packed scene before rendering; no source geometry is edited.
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

OUT = Path("/mnt/agents/output/ames-blender-review")
SCENE_PATH = OUT / "AMES Realism Review.blend"
FINAL = OUT / "final"
BATCH = os.environ.get("AMES_RENDER_SET", "all")


def aim(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def make_camera(collection, name, target, distance, lens, azimuth=0.0, elevation=20.0):
    az = math.radians(azimuth)
    el = math.radians(elevation)
    offset = Vector((distance * math.sin(az) * math.cos(el), -distance * math.cos(az) * math.cos(el), distance * math.sin(el)))
    data = bpy.data.cameras.new(name)
    data.lens = lens
    data.sensor_width = 36
    data.clip_start = 0.005
    data.clip_end = 100
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    obj.location = target + offset
    aim(obj, target)
    return obj


def center_of(obj):
    points = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    return sum(points, Vector()) / 8


def render(scene, camera, filename, width=800, samples=56):
    scene.camera = camera
    scene.render.resolution_x = width
    scene.render.resolution_y = width
    scene.render.resolution_percentage = 100
    scene.cycles.samples = samples
    scene.cycles.adaptive_threshold = 0.025 if samples < 100 else 0.012
    scene.render.filepath = str(filename)
    bpy.ops.render.render(write_still=True)
    print("RENDERED", filename, flush=True)


def main():
    bpy.ops.wm.open_mainfile(filepath=str(SCENE_PATH))
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    FINAL.mkdir(parents=True, exist_ok=True)
    ring = [o for o in scene.objects if o.type == "MESH" and o.get("ames_part_id")]
    points = [o.matrix_world @ Vector(c) for o in ring for c in o.bound_box]
    lower = Vector(tuple(min(v[i] for v in points) for i in range(3)))
    upper = Vector(tuple(max(v[i] for v in points) for i in range(3)))
    center = (lower + upper) / 2 + Vector((0, 0, 0.04))
    cameras = bpy.data.collections.get("REVIEW | inspection cameras")
    if cameras is None:
        cameras = bpy.data.collections.new("REVIEW | inspection cameras")
        scene.collection.children.link(cameras)
    hero = bpy.data.objects["CAMERA | hero"]
    manifest = []

    if BATCH in {"orbit", "all"}:
        for index in range(8):
            angle = index * 45
            cam = make_camera(cameras, f"CAMERA | orbit {angle:03d}", center, 5.6, 82, angle, 23)
            path = FINAL / f"orbit-{angle:03d}.png"
            render(scene, cam, path)
            manifest.append({"file": path.name, "set": "orbit", "azimuth": angle, "elevation": 23})
        data = bpy.data.cameras.new("CAMERA | top")
        data.lens = 82
        data.clip_start = 0.005
        data.clip_end = 100
        top = bpy.data.objects.new("CAMERA | top", data)
        cameras.objects.link(top)
        top.location = center + Vector((0, 0, 5.6))
        aim(top, center)
        path = FINAL / "top.png"
        render(scene, top, path)
        manifest.append({"file": path.name, "set": "orbit", "view": "top"})

    if BATCH in {"details", "all"}:
        specifications = [
            ("center", bpy.data.objects["AMES_PART_C00"], 1.20, 76, [(-34, 28), (-17, 35), (0, 42), (17, 35), (34, 28)]),
            ("accent", bpy.data.objects["AMES_PART_A00"], 0.43, 72, [(-45, 24), (-22, 34), (0, 40), (22, 34), (45, 24)]),
            ("metal", bpy.data.objects["AMES_PART_M00"], 1.75, 80, [(-38, 20), (-19, 28), (0, 32), (19, 28), (38, 20)]),
        ]
        only = os.environ.get("AMES_DETAIL_ONLY")
        for label, obj, distance, lens, angles in specifications:
            if only and label != only:
                continue
            target = center_of(obj)
            if label == "metal":
                target = Vector((0, 0, 0.52))
            for index, (azimuth, elevation) in enumerate(angles, 1):
                cam = make_camera(cameras, f"CAMERA | {label} detail {index}", target, distance, lens, azimuth, elevation)
                filename = f"detail-{label}-{index}.png" if not (label == "metal" and index == 2) else f"detail-{label}-02.png"
                path = FINAL / filename
                if not path.exists():
                    render(scene, cam, path)
                manifest.append({"file": path.name, "set": "detail", "part": obj.get("ames_part_id"), "azimuth": azimuth, "elevation": elevation})

    if BATCH in {"hero", "all"}:
        path = FINAL / "AMES Realism Hero.png"
        render(scene, hero, path, 1400, 192)
        manifest.append({"file": path.name, "set": "hero", "samples": 192, "resolution": 1400})

    # Reopenable delivery defaults to the high-quality hero, not the last inspection angle.
    scene.camera = hero
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 1400
    scene.cycles.samples = 192
    scene.cycles.adaptive_threshold = 0.012
    scene.render.filepath = "//final/AMES Realism Hero.png"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(SCENE_PATH))
    manifest_path = FINAL / f"manifest-{BATCH}.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print("BATCH_COMPLETE", BATCH, len(manifest), flush=True)


if __name__ == "__main__":
    main()
