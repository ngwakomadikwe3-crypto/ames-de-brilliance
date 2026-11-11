"""AMES pavé solitaire, revision 3: rebuilt as a jeweller would make it.

A true 57-facet round brilliant in a four-claw basket with filed claws that hold the stone over its bezel facets,
a comfort-fit band, and shoulder pavé in drilled seats with shared beads. Original AMES geometry; dimensions are
design inputs (not measured stock) and make no claim about metal purity, diamond grade or manufacturing readiness.

Run:  blender --background --python create_pave_solitaire_v3.py -- <out.blend> [<out.glb>]
  or: python create_pave_solitaire_v3.py <out.blend> [<out.glb>]   (with the bpy module)
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ames_jewel_kit as kit  # noqa: E402

MM = .001
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
out_blend = Path(argv[0]) if argv else Path('solitaire-v3.blend')
out_glb = Path(argv[1]) if len(argv) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'


def material(name, color, metallic, roughness, transmission=0, ior=1.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    s = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for k, v in {'Base Color': (*color, 1), 'Metallic': metallic, 'Roughness': roughness, 'Transmission Weight': transmission, 'IOR': ior}.items():
        s.inputs[k].default_value = v
    return m


# The names are what the AMES viewer and the photo studio recognise the surfaces by.
metal = material('Platinum tone | visual study', (.83, .81, .78), 1, .08)
diamond = material('Diamond | closed dielectric', (.99, .995, 1), 0, 0, 1, 2.417)

# --- design inputs (mm) ---------------------------------------------------------------------------------------
INNER = 8.68 * MM                 # finger radius (about a size 7)
CENTRE_R = 3.45 * MM              # 6.9 mm round brilliant
MELEE_R = .575 * MM               # 1.15 mm pavé stones
MELEE_STEP = 1.27 * MM            # spacing along the band
MELEE_COUNT = 12                  # a side
GIRDLE = .07                      # girdle thickness of the cuts, as a fraction of the stone's radius
width = lambda a: (1.72 + .26 * (1 - math.cos(a)) / 2) * MM       # 1.72 mm at the head, 1.98 mm under the finger
thickness = lambda a: (1.62 - .2 * (1 - math.cos(a)) / 2) * MM    # 1.62 mm at the head, 1.42 mm under the finger
OUTER_TOP = INNER + thickness(0)

metal_parts, stones = [], []
link = scene.collection.objects.link

# --- band -----------------------------------------------------------------------------------------------------
band = kit.shank('Comfort-fit band', INNER, width, thickness, metal)
link(band)

# --- shoulder pavé: drilled seats, stones, shared beads ---------------------------------------------------------
outer = lambda a: INNER + thickness(abs(a))
START = 2.95 * MM / OUTER_TOP     # first stone clears the foot of the head
cutters, seats = [], []
for side in (-1, 1):
    angle = side * START
    for j in range(MELEE_COUNT):
        radial = Vector((math.sin(angle), 0, math.cos(angle)))
        seats.append((side, j, angle, radial))
        angle += side * MELEE_STEP / outer(angle)
for side, j, angle, radial in seats:
    surface = radial * outer(angle)
    stone = kit.round_brilliant('Pave diamond %s %02d' % ('L' if side < 0 else 'R', j), MELEE_R, diamond, girdle=GIRDLE)
    # The girdle sits just above the metal: the crown stands proud, the pavilion goes down into its seat.
    stone.location = surface + radial * (.03 * MM)
    stone.rotation_euler = radial.to_track_quat('Z', 'Y').to_euler()
    stone.rotation_euler.rotate_axis('Z', (j * 37 % 45) * math.pi / 180)   # no two stones turned alike
    stone['ames_optical_mode'] = 'closed-dielectric-visual'
    stone['ames_gemstone_id'] = 'stone-diamond'
    stone['ames_cut'] = 'round'
    link(stone); stones.append(stone)
    # Seat: a cone the pavilion sits in, opening into a drilled hole through the band (as real pavé is drilled).
    rot = radial.to_track_quat('Z', 'Y')
    profile = [(MELEE_R * 1.02, .12 * MM), (MELEE_R * 1.02, .0), (MELEE_R * .98, -.04 * MM), (.3 * MM, -.47 * MM), (.3 * MM, -2.4 * MM)]
    verts, faces, n = [], [], 20
    for r, z in profile:
        for k in range(n):
            verts.append(tuple(surface + rot @ Vector((r * math.cos(k * math.tau / n), r * math.sin(k * math.tau / n), z))))
    for i in range(len(profile) - 1):
        for k in range(n):
            faces.append((i * n + k, i * n + (k + 1) % n, (i + 1) * n + (k + 1) % n, (i + 1) * n + k))
    faces.append(tuple(range(n))); faces.append(tuple(reversed(range((len(profile) - 1) * n, len(profile) * n))))
    cutters.append(kit._object('seat', verts, faces, smooth=False))
cutter = kit.join(cutters, 'Pavé seats')
link(cutter)
boolean = band.modifiers.new('Drill pavé seats', 'BOOLEAN')
boolean.operation = 'DIFFERENCE'; boolean.object = cutter; boolean.solver = 'EXACT'
bpy.context.view_layer.objects.active = band
bpy.ops.object.modifier_apply(modifier=boolean.name)
bpy.data.objects.remove(cutter)
kit.sharpen(band, 32)
metal_parts.append(band)
# Beads: raised grains of metal pushed over the girdles, two between each pair of stones and two at each end.
for side in (-1, 1):
    row = [s for s in seats if s[0] == side]
    edges = [row[0][2] - side * .5 * MELEE_STEP / outer(row[0][2])] + [(row[i][2] + row[i + 1][2]) / 2 for i in range(len(row) - 1)] + [row[-1][2] + side * .5 * MELEE_STEP / outer(row[-1][2])]
    for angle in edges:
        radial = Vector((math.sin(angle), 0, math.cos(angle)))
        for off in (-1, 1):
            bead = kit.sphere('Pavé bead', .205 * MM, radial * (outer(angle) + .075 * MM) + Vector((0, off * .46 * MM, 0)), metal, 16, 10)
            link(bead); metal_parts.append(bead)

# --- head: centre stone, four claws, gallery rail, foot --------------------------------------------------------
PAVILION = (GIRDLE + math.tan(math.radians(40.75)) - .012) * CENTRE_R      # girdle top to culet
FOOT_TOP = OUTER_TOP + .55 * MM
girdle_top = FOOT_TOP + .38 * MM + PAVILION                                  # culet clear of the foot
centre = kit.round_brilliant('Solitaire diamond', CENTRE_R, diamond, girdle=GIRDLE)
centre.location = (0, 0, girdle_top - GIRDLE * CENTRE_R / 2)
centre.rotation_euler = (0, 0, math.radians(45))       # bezel facets under the claws
centre['ames_optical_mode'] = 'closed-dielectric-visual'
centre['ames_gemstone_id'] = 'stone-diamond'
centre['ames_cut'] = 'round'
link(centre); stones.append(centre)

crown = lambda r: (1 - r / CENTRE_R) * math.tan(math.radians(34.5)) * CENTRE_R   # height of a bezel facet above the girdle
RAIL_Z, RAIL_R = girdle_top - 1.95 * MM, 2.18 * MM
for i in range(4):
    a = math.pi / 4 + i * math.pi / 2
    out = Vector((math.cos(a), math.sin(a), 0))
    at = lambda r, z: out * r + Vector((0, 0, z))
    tip_r = CENTRE_R - .78 * MM
    path = kit.catmull([
        at(.95 * MM, OUTER_TOP - .15 * MM),                 # rooted in the foot
        at(1.35 * MM, FOOT_TOP + .25 * MM),
        at(RAIL_R + .1 * MM, RAIL_Z),                        # through the gallery rail
        at(CENTRE_R + .12 * MM, girdle_top - .55 * MM),      # up the pavilion
        at(CENTRE_R + .30 * MM, girdle_top - GIRDLE * CENTRE_R / 2),   # outside the girdle
        at(CENTRE_R + .16 * MM, girdle_top + .34 * MM),      # bent over
        at(tip_r + .3 * MM, girdle_top + crown(tip_r + .3 * MM) + .27 * MM),
        at(tip_r, girdle_top + crown(tip_r) + .2 * MM),      # resting on the bezel facet
    ], 10)
    radius = lambda t: (.46 - .1 * min(1, t / .75) - .06 * max(0, (t - .75) / .25)) * MM
    # The tip is filed flatter and a little wider where it bears on the stone.
    flatten = lambda t: (1 + .28 * max(0, (t - .8) / .2), 1 - .34 * max(0, (t - .8) / .2))
    claw = kit.sweep('Claw %d' % i, path, radius, metal, sides=20, flatten=flatten)
    link(claw); metal_parts.append(claw)
rail = kit.sweep('Gallery rail', [(RAIL_R * math.cos(k * math.tau / 96), RAIL_R * math.sin(k * math.tau / 96), RAIL_Z) for k in range(96)], .27 * MM, metal, sides=16, closed=True)
link(rail); metal_parts.append(rail)
# Foot: a low rounded collet where the claws gather, sunk into the band so it reads as one piece of metal.
foot = kit.sphere('Head foot', 1.0, (0, 0, OUTER_TOP - .1 * MM), metal, 40, 20, scale=(1.5 * MM, .92 * MM, .68 * MM))
link(foot); metal_parts.append(foot)

# --- tidy up and save -------------------------------------------------------------------------------------------
for o in metal_parts:
    o['ames_optical_mode'] = 'conductor'
print('SOLITAIRE_V3 stones', len(stones), 'metal parts', len(metal_parts),
      'centre facets', len(centre.data.polygons), 'band faces', len(band.data.polygons),
      'head height mm', round((girdle_top + crown(.57 * CENTRE_R) - OUTER_TOP) / MM, 2), flush=True)
out_blend.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out_blend.resolve()))
if out_glb:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(out_glb.resolve()), export_format='GLB', use_selection=True, export_apply=True,
                              export_extras=True, export_animations=False, export_cameras=False, export_lights=False)
print('SOLITAIRE_V3_COMPLETE', flush=True)
