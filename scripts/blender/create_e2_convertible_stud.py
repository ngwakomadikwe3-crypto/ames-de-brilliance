"""E2 The Convertible Stud: a solitaire stud with a detachable halo jacket (one pair, two looks).

Original AMES geometry built in Blender with ames_jewel_kit, in the house earring layout (laid out flat: X across,
Y up the ear, tables toward +Z; then stood up so the tables face the viewer). Each earring is the two pieces a
jeweller would make:
  E2_stud_<side>    a 0.5 ct round (5.1 mm) in four claws with a gallery wire and a post; on the post a small collar,
                    E2_lock_<side>, which the jacket's tube clicks over (stays when the jacket is off);
  E2_jacket_<side>  the halo: sixteen 1.3 mm brilliants on a two-wire rail with a bead between each pair, sitting a
                    touch behind the solitaire's girdle so the centre stone floats in it, and a tube behind that
                    slides over the post. The halo stones are named Accent so the accent choice makes a coloured halo.
The site hides every node named E2_jacket or E2_jacket_* for the "Solitaire" wear state (src/lib/custom-designs.ts).

Run:  python scripts/blender/create_e2_convertible_stud.py <out.glb>      (bpy module)
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ames_jewel_kit as kit  # noqa: E402

MM = .001
OUT = sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
link = scene.collection.objects.link


def material(name, color, metallic, roughness, transmission=0, ior=1.5):
    m = bpy.data.materials.new(name); m.use_nodes = True
    s = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for k, v in {'Base Color': (*color, 1), 'Metallic': metallic, 'Roughness': roughness, 'Transmission Weight': transmission, 'IOR': ior}.items():
        s.inputs[k].default_value = v
    return m


metal = material('White gold | visual study', (.87, .86, .84), 1, .05)
diamond = material('Diamond | closed dielectric', (.99, 1, 1), 0, .012, 1, 2.417)

ROUND = kit.superellipse_outline(2.0)
R = 2.55 * MM                                   # 0.5 ct round: 5.1 mm
HALO_N, HALO_D = 16, 1.3 * MM
HALO_R = R + .35 * MM + HALO_D / 2              # stone centres round the solitaire
HALO_Z = -.32 * MM                              # just behind the solitaire's girdle
STAND = Matrix.Rotation(math.pi / 2, 4, 'X')    # +Z (the tables) to the front, +Y up
SPACING = 6.5 * MM                              # half the distance between the pair (centres 13 mm apart)


def to_scene(o):
    if o.name not in scene.collection.objects: link(o)
    return o


def earring(side):
    tag = 'left' if side < 0 else 'right'
    root = bpy.data.objects.new('Earring ' + tag, None); link(root)
    root.matrix_world = Matrix.Translation((side * SPACING, 0, 0)) @ STAND
    stud = bpy.data.objects.new('E2_stud_' + tag, None); link(stud); stud.parent = root
    jacket = bpy.data.objects.new('E2_jacket_' + tag, None); link(jacket); jacket.parent = root
    groups = []

    # --- the stud ---------------------------------------------------------------------------------------------
    gem, info = kit.fancy_brilliant('Solitaire ' + tag, ROUND, R, diamond)
    gem['ames_optical_mode'] = 'closed-dielectric-visual'; gem['ames_gemstone_id'] = 'stone-diamond'; gem['ames_cut'] = 'round'
    gem.matrix_world = Matrix.Rotation(math.radians(11), 4, 'Z')
    claws = kit.claw_setting('Solitaire setting', ROUND, R, info, [math.pi / 4 + k * math.pi / 2 for k in range(4)], metal, wire=.36 * MM)
    depth = info['depth']
    post = kit.sweep('Ear post', [(0, 0, -depth * .6), (0, 0, -depth - 10.5 * MM)], .42 * MM, metal, sides=16)
    lock = kit.sweep('E2_lock_' + tag, [(0, 0, -depth - 2.9 * MM), (0, 0, -depth - 3.5 * MM)], .62 * MM, metal, sides=16, round_start=True)
    lock.name = 'E2_lock_' + tag
    groups.append((stud, [gem] + claws + [post, lock]))

    # --- the halo jacket --------------------------------------------------------------------------------------
    parts, stones = [], []
    for k in range(HALO_N):
        a = math.tau * (k + .5) / HALO_N
        s = kit.round_brilliant('Accent halo stone %s %d' % (tag, k + 1), HALO_D / 2, diamond)
        s.matrix_world = Matrix.Translation((HALO_R * math.cos(a), HALO_R * math.sin(a), HALO_Z)) @ Matrix.Rotation(k * .7, 4, 'Z')
        s['ames_optical_mode'] = 'closed-dielectric-visual'; s['ames_gemstone_id'] = 'stone-diamond'; s['ames_cut'] = 'round'
        stones.append(s)
        b = a + math.pi / HALO_N                                         # a shared bead between each pair of stones
        parts.append(kit.sphere('halo bead %d' % k, .2 * MM, (HALO_R * 1.02 * math.cos(b), HALO_R * 1.02 * math.sin(b), HALO_Z + .3 * MM), metal, segments=10, rings=6))
    for rr, z in ((HALO_R - HALO_D * .42, HALO_Z - .45 * MM), (HALO_R + HALO_D * .42, HALO_Z - .45 * MM), (HALO_R, HALO_Z - .95 * MM)):
        parts.append(kit.sweep('halo rail', [(rr * math.cos(t), rr * math.sin(t), z) for t in (math.tau * i / 64 for i in range(64))], .17 * MM, metal, sides=8, closed=True))
    for k in range(4):                                                   # four spokes from the rail to the tube
        a = k * math.pi / 2
        parts.append(kit.sweep('halo spoke', [(HALO_R * math.cos(a), HALO_R * math.sin(a), HALO_Z - .95 * MM), (.9 * MM * math.cos(a), .9 * MM * math.sin(a), -depth - 1.6 * MM)], .2 * MM, metal, sides=8))
    parts.append(kit.sweep('jacket tube', [(0, 0, -depth - 1.4 * MM), (0, 0, -depth - 2.85 * MM)], .75 * MM, metal, sides=16, round_start=True))
    bpy.context.view_layer.update()
    for p in parts: to_scene(p)
    rail = kit.join(parts, 'E2_jacket_%s_setting' % tag)
    for p in parts:
        if p.name in bpy.data.objects: bpy.data.objects.remove(p)
    to_scene(rail)
    groups.append((jacket, stones + [rail]))

    count = 0
    bpy.context.view_layer.update()
    for parent, members in groups:
        for p in members:
            to_scene(p)
            flat = p.matrix_world.copy()
            p.parent = parent; p.matrix_parent_inverse = Matrix(); p.matrix_basis = flat
            if p.type == 'MESH' and p.data.materials and p.data.materials[0] == metal:
                p['ames_optical_mode'] = 'conductor'
            count += 1
    return count


parts = earring(-1) + earring(1)
bpy.context.view_layer.update()
print('E2 parts', parts, flush=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True,
                          export_extras=True, export_animations=False, export_cameras=False, export_lights=False)
print('E2_COMPLETE', flush=True)
