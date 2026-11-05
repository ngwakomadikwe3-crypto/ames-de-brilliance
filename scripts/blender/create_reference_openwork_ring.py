"""Create an original visual interpretation of the supplied openwork ring reference.

This is visualization geometry reconstructed from one photograph. It does not claim
exact hidden geometry, physical dimensions, metal purity, or manufacturing readiness.
Run with /usr/local/bin/3dpy and set AMES_RING_OUTPUT to a private review directory.
"""
from __future__ import annotations

import math
import os
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

OUT = Path(os.environ.get("AMES_RING_OUTPUT", "/tmp/ames-reference-ring"))
OUT.mkdir(parents=True, exist_ok=True)
TAU = math.tau
BAND_COUNT = 7
RADIUS = 1.28
BAND_SPACING = 0.39

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "AMES | reference openwork ring | visualization"


def material(name, color, metallic, roughness, *, ior=1.5, transmission=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["IOR"].default_value = ior
    bsdf.inputs["Transmission Weight"].default_value = transmission
    return mat


silver = material("VISUAL | polished silver-toned conductor", (0.82, 0.86, 0.92), 1.0, 0.13)
diamond = material("VISUAL | qualified closed diamond dielectric", (1, 1, 1), 0.0, 0.006, ior=2.417, transmission=1.0)
metal_objects = []
gem_objects = []


def mesh_object(name, vertices, faces, mat, collection):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    collection.append(obj)
    return obj


def band_center(index, theta):
    phase = (index - (BAND_COUNT - 1) / 2) * 0.34
    # Each complete shank undulates gently; staggered phases form the openwork silhouette.
    z = (index - (BAND_COUNT - 1) / 2) * BAND_SPACING
    z += 0.16 * math.sin(3 * theta + phase) + 0.055 * math.sin(theta - phase)
    radius = RADIUS + 0.035 * math.cos(2 * theta + phase)
    return Vector((radius * math.cos(theta), radius * math.sin(theta), z))


def rounded_section(half_radial, half_vertical, corner, steps=3):
    points = []
    for cx, cy, start in [
        (half_radial - corner, half_vertical - corner, 0),
        (-half_radial + corner, half_vertical - corner, 90),
        (-half_radial + corner, -half_vertical + corner, 180),
        (half_radial - corner, -half_vertical + corner, 270),
    ]:
        for step in range(steps + 1):
            angle = math.radians(start + step * 90 / steps)
            points.append((cx + corner * math.cos(angle), cy + corner * math.sin(angle)))
    return points


def create_band(index):
    segments = 256
    section = rounded_section(0.058, 0.122, 0.026)
    vertices = []
    faces = []
    for step in range(segments):
        theta = TAU * step / segments
        center = band_center(index, theta)
        radial = Vector((math.cos(theta), math.sin(theta), 0))
        before = band_center(index, theta - 0.002)
        after = band_center(index, theta + 0.002)
        tangent = (after - before).normalized()
        vertical = tangent.cross(radial).normalized()
        if vertical.z < 0:
            vertical = -vertical
        for x, y in section:
            vertices.append(tuple(center + radial * x + vertical * y))
    count = len(section)
    for step in range(segments):
        nxt = (step + 1) % segments
        for side in range(count):
            side_next = (side + 1) % count
            faces.append((step * count + side, nxt * count + side, nxt * count + side_next, step * count + side_next))
    faces.append(tuple(reversed(range(count))))
    faces.append(tuple((segments - 1) * count + side for side in range(count)))
    obj = mesh_object(f"BAND | openwork {index + 1:02d}", vertices, faces, silver, metal_objects)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def brilliant_mesh():
    segments = 16
    rings = [(0.50, 0.0), (1.0, 0.36), (0.76, 0.67), (0.43, 0.79)]
    vertices = [(0, 0, -0.58)]
    for radius, z in rings:
        for i in range(segments):
            angle = TAU * i / segments
            vertices.append((radius * math.cos(angle), radius * math.sin(angle), z))
    faces = []
    for i in range(segments):
        faces.append((0, 1 + (i + 1) % segments, 1 + i))
    for ring in range(len(rings) - 1):
        a = 1 + ring * segments
        b = a + segments
        for i in range(segments):
            j = (i + 1) % segments
            faces.extend([(a + i, a + j, b + j), (a + i, b + j, b + i)])
    faces.append(tuple(1 + (len(rings) - 1) * segments + i for i in range(segments)))
    mesh = bpy.data.meshes.new("GEM | closed brilliant master")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    mesh.materials.append(diamond)
    return mesh


gem_mesh = brilliant_mesh()


def add_gem(name, position, normal, radius):
    obj = bpy.data.objects.new(name, gem_mesh)
    scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = Vector(normal).to_track_quat("Z", "Y").to_euler()
    obj.scale = (radius, radius, radius)
    gem_objects.append(obj)
    return obj


def rounded_box(name, position, tangent, radial, dimensions, bevel=0.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.name = name
    vertical = tangent.cross(radial).normalized()
    if vertical.z < 0:
        vertical = -vertical
    basis = Matrix((tangent, radial, vertical)).transposed()
    obj.rotation_euler = basis.to_euler()
    obj.scale = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(silver)
    mod = obj.modifiers.new("Soft jewellery edges", "BEVEL")
    mod.width = bevel
    mod.segments = 3
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    metal_objects.append(obj)
    return obj


def cylinder_between(name, start, end, radius):
    delta = end - start
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=delta.length, location=(start + end) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    obj.data.materials.append(silver)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    metal_objects.append(obj)
    return obj


for index in range(BAND_COUNT):
    create_band(index)
    for station, theta in enumerate([-math.pi / 2, 0, math.pi / 2, math.pi]):
        center = band_center(index, theta)
        radial = Vector((math.cos(theta), math.sin(theta), 0))
        tangent = Vector((-math.sin(theta), math.cos(theta), 0))
        bar_center = center + radial * 0.095
        rounded_box(f"STATION | {index + 1:02d}.{station + 1}", bar_center, tangent, radial, (0.37, 0.095, 0.105))
        for stone in range(3):
            position = bar_center + tangent * ((stone - 1) * 0.105) + radial * 0.065
            add_gem(f"PAVE | {index + 1:02d}.{station + 1}.{stone + 1}", position, radial, 0.066)
        for side in [-1, 1]:
            bead = bar_center + tangent * (side * 0.17) + radial * 0.055
            cylinder_between(f"BEAD | {index + 1:02d}.{station + 1}.{side}", bead - radial * 0.025, bead + radial * 0.025, 0.025)

# A articulated pavé spine ties the seven bands together at the reference's front.
front_theta = -math.pi / 2
front_radial = Vector((math.cos(front_theta), math.sin(front_theta), 0))
front_tangent = Vector((-math.sin(front_theta), math.cos(front_theta), 0))
spine_radius = RADIUS + 0.24
for side in [-1, 1]:
    offset = front_tangent * (side * 0.10)
    cylinder_between(
        f"SPINE | rail {side}",
        front_radial * spine_radius + offset + Vector((0, 0, -1.19)),
        front_radial * spine_radius + offset + Vector((0, 0, 1.19)),
        0.022,
    )
for index in range(9):
    z = (index - 4) * 0.31
    position = front_radial * (spine_radius + 0.055) + Vector((0, 0, z))
    add_gem(f"SPINE | brilliant {index + 1:02d}", position, front_radial, 0.105)
    if index < 8:
        center = front_radial * spine_radius + Vector((0, 0, z + 0.155))
        cylinder_between(f"SPINE | link {index + 1:02d}", center - front_tangent * 0.12, center + front_tangent * 0.12, 0.025)


def join_objects(objects, name, mode):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = name
    joined["ames_optical_mode"] = mode
    joined["review_notice"] = "Visualization only; reconstructed from one image; dimensions and materials unverified."
    return joined


metal = join_objects(metal_objects, "RING | silver-toned openwork conductor", "conductor")
gems = join_objects(gem_objects, "STONES | closed brilliant dielectrics", "closed-dielectric-visual")

# Put the asset origin at its measured centre without changing its proportions.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
scene["asset_id"] = "dev-test-candidate-ring"
scene["revision_id"] = "dev-test-candidate-ring:3"
scene["reference"] = "User-supplied openwork multi-band ring photograph"
scene["physical_scale_confirmed"] = False
scene["manufacturing_ready"] = False

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "reference-openwork-ring.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(OUT / "reference-openwork-ring.glb"),
    export_format="GLB",
    export_extras=True,
    export_yup=True,
    export_apply=True,
    export_animations=False,
    export_cameras=False,
    export_lights=False,
)

# Neutral review render; final customer stills use the existing AMES Cycles pipeline.
floor_mat = material("STUDIO | charcoal", (0.018, 0.022, 0.026), 0, 0.42)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -1.63))
floor = bpy.context.object
floor.name = "STUDIO | floor"
floor.data.materials.append(floor_mat)
world = bpy.data.worlds.new("STUDIO | soft ambience")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.38, 0.42, 0.48, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.28
scene.world = world


def aim(obj, target=(0, 0, 0)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def area(name, location, energy, size, size_y):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "RECTANGLE"
    data.size = size
    data.size_y = size_y
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    aim(obj)


area("STUDIO | key", (-3, -4, 5), 650, 3, 5)
area("STUDIO | strip", (4, -1, 2), 430, 1, 4)
area("STUDIO | rim", (-2, 3, 3), 700, 2, 3)
area("STUDIO | stone card", (0, -4, 1), 100, 1, 1)
cam_data = bpy.data.cameras.new("CAMERA | review")
cam = bpy.data.objects.new("CAMERA | review", cam_data)
scene.collection.objects.link(cam)
cam.location = (3.7, -6.2, 2.7)
cam_data.type = "ORTHO"
cam_data.ortho_scale = 4.25
cam_data.clip_end = 200
aim(cam, (0, 0, 0.05))
scene.camera = cam
scene.render.engine = "CYCLES"
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 14
scene.cycles.transmission_bounces = 10
scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = str(OUT / "review.png")
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
bpy.ops.render.render(write_still=True)
print("REFERENCE_RING_COMPLETE", OUT, "objects", len(scene.objects), "gems", len(gem_objects), flush=True)
