"""AMES photo studio: a jewellery photographer's table in Blender Cycles.

Opens a piece (.blend or .glb), dresses it in studio materials by surface name, lights it the way fine jewellery
is shot (a white light tent for soft wrap, black cards for contrast in the metal, small hard lamps for the flash
in the stones), and photographs it through a macro lens onto a transparent background with its own soft shadow,
so the picture sits on the HOUSEofAMES page.

Run:  blender --background --python ames_photo_studio.py -- piece.blend out.png [options]
  or: python ames_photo_studio.py piece.blend out.png [options]      (with the bpy module)

Surfaces are recognised by material name: "diamond" -> diamond; "platinum", "white gold", "silver" -> white
metal; "yellow gold" / "rose gold" -> those alloys' colours. These are looks for a picture, not alloy or grade claims.
"""
import argparse
import math
import os
import sys
import time

import bpy
from mathutils import Matrix, Vector

p = argparse.ArgumentParser()
p.add_argument('piece'); p.add_argument('out')
_HERE = os.path.dirname(os.path.abspath(__file__))
_TENT = os.path.join(_HERE, '..', '..', 'public', 'ames-engine', 'environments', 'jewellery-tent-v2.hdr')
p.add_argument('--hdr', default=_TENT if os.path.exists(_TENT) else os.path.join(_HERE, 'jewellery-tent-v2.hdr'), help='the light tent (the same one the AMES viewer uses)')
p.add_argument('--azimuth', type=float, default=20, help='camera angle round the piece, degrees from the front')
p.add_argument('--elevation', type=float, default=33, help='camera height above the table, degrees')
p.add_argument('--lens', type=float, default=100, help='focal length, mm (a macro portrait lens)')
p.add_argument('--fstop', type=float, default=0, help='aperture; high numbers keep the whole piece crisp like a focus-stacked macro, 0 = all sharp')
p.add_argument('--fill', type=float, default=1.08, help='how much of the frame the piece fills')
p.add_argument('--res', type=int, default=1200); p.add_argument('--spp', type=int, default=256)
p.add_argument('--tent', type=float, default=.5, help='light tent brightness')
p.add_argument('--sparkle', type=float, default=1.0, help='strength of the small hard lamps')
p.add_argument('--key', type=float, default=1.0, help='strength of the broad soft key light')
p.add_argument('--exposure', type=float, default=0, help='camera exposure, stops')
p.add_argument('--table', type=float, default=.02, help='how light the table is (0 black .. 1 white); it shows only as reflections and shadow')
p.add_argument('--threads', type=int, default=0)
p.add_argument('--room', type=float, default=6.5, help='brightness of the white panels the stones see')
p.add_argument('--aim', type=float, default=0, help='where the lens points: 0 the middle of the piece, 1 its top (for close-ups of a setting)')
p.add_argument('--hang', action='store_true', help='a piece that hangs (earrings, pendants): no table or shadow under it')
p.add_argument('--clay', action='store_true', help='plain grey model check, no studio materials')
p.add_argument('--frames', type=int, default=0, help='turntable: number of frames round the piece (0 = one still)')
p.add_argument('--save', default='', help='also save the lit studio scene as a .blend')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
a = p.parse_args(argv)
T0 = time.time()

if a.piece.lower().endswith('.blend'):
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.piece))
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(a.piece))
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
cy = sc.cycles
cy.device = 'CPU'
cy.samples = a.spp
cy.use_adaptive_sampling = True; cy.adaptive_threshold = .01
cy.use_denoising = True
cy.max_bounces = 72; cy.transmission_bounces = 64; cy.glossy_bounces = 64;   # light bounces many times inside a stone before it leaves
cy.diffuse_bounces = 4; cy.transparent_max_bounces = 16
# Light may pass through the stones onto metal and table (it is what lights a setting from inside).
cy.caustics_refractive = True; cy.caustics_reflective = True; cy.blur_glossy = .6
cy.sample_clamp_indirect = 14; cy.sample_clamp_direct = 0
sc.render.resolution_x = sc.render.resolution_y = a.res
sc.render.resolution_percentage = 100
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '16'
sc.view_settings.view_transform = 'AgX'; sc.view_settings.exposure = a.exposure
try: sc.view_settings.look = 'AgX - Medium High Contrast'
except TypeError: pass
if a.threads: sc.render.threads_mode = 'FIXED'; sc.render.threads = a.threads


# --- studio materials -------------------------------------------------------------------------------------------
def nodes_of(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    return m, nt, nt.nodes.new('ShaderNodeOutputMaterial')


def diamond_material():
    """Clear diamond. Its fire is real dispersion: red, green and blue light each bend by their own index."""
    m, nt, out = nodes_of('AMES studio diamond')
    last = None
    for colour, ior in (((1, 0, 0, 1), 2.4105), ((0, 1, 0, 1), 2.4180), ((0, 0, 1, 1), 2.4320)):
        g = nt.nodes.new('ShaderNodeBsdfGlass'); g.distribution = 'BECKMANN'
        g.inputs['Color'].default_value = colour; g.inputs['Roughness'].default_value = 0; g.inputs['IOR'].default_value = ior
        if last is None: last = g.outputs[0]
        else:
            add = nt.nodes.new('ShaderNodeAddShader'); nt.links.new(last, add.inputs[0]); nt.links.new(g.outputs[0], add.inputs[1]); last = add.outputs[0]
    nt.links.new(last, out.inputs['Surface'])
    return m


def metal_material(name, colour, roughness=.055):
    """Hand-polished precious metal: bright, but not a mirror. The polish varies a little from place to place and
    carries the faintest lines of the polishing wheel, which is what stops it looking like chrome."""
    m, nt, out = nodes_of(name)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (*colour, 1); b.inputs['Metallic'].default_value = 1
    coord = nt.nodes.new('ShaderNodeTexCoord')
    patches = nt.nodes.new('ShaderNodeTexNoise'); patches.inputs['Scale'].default_value = 900; patches.inputs['Detail'].default_value = 3
    nt.links.new(coord.outputs['Object'], patches.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeMapRange'); ramp.inputs['From Min'].default_value = .3; ramp.inputs['From Max'].default_value = .7
    ramp.inputs['To Min'].default_value = roughness * .75; ramp.inputs['To Max'].default_value = roughness * 1.55
    nt.links.new(patches.outputs['Fac'], ramp.inputs['Value']); nt.links.new(ramp.outputs['Result'], b.inputs['Roughness'])
    # Polishing lines: noise stretched hard along one direction, as a very slight bump.
    stretch = nt.nodes.new('ShaderNodeMapping'); stretch.inputs['Scale'].default_value = (60000, 1800, 60000)
    lines = nt.nodes.new('ShaderNodeTexNoise'); lines.inputs['Scale'].default_value = 1; lines.inputs['Detail'].default_value = 2
    nt.links.new(coord.outputs['Object'], stretch.inputs['Vector']); nt.links.new(stretch.outputs['Vector'], lines.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .012; bump.inputs['Distance'].default_value = .00002
    nt.links.new(lines.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    return m


METALS = {'yellow gold': (.94, .70, .33), 'rose gold': (.90, .62, .52), 'white': (.84, .82, .79)}
studio = {}
if not a.clay:
    for ob in sc.objects:
        if ob.type != 'MESH': continue
        for i, mat in enumerate(ob.data.materials):
            n = (mat.name if mat else '').lower()
            if 'diamond' in n or ob.get('ames_optical_mode') == 'closed-dielectric-visual': key = 'diamond'
            elif 'yellow gold' in n: key = 'yellow gold'
            elif 'rose gold' in n: key = 'rose gold'
            elif any(w in n for w in ('platinum', 'white gold', 'silver', 'palladium')) or ob.get('ames_optical_mode') == 'conductor': key = 'white'
            else: continue
            if key not in studio:
                studio[key] = diamond_material() if key == 'diamond' else metal_material('AMES studio ' + key + ' metal', METALS[key])
            ob.data.materials[i] = studio[key]
else:
    clay = bpy.data.materials.new('Clay'); clay.use_nodes = True
    clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.55, .55, .55, 1)
    for ob in sc.objects:
        if ob.type == 'MESH':
            ob.data.materials.clear(); ob.data.materials.append(clay)

# --- the table: where the piece is, and its shadow ---------------------------------------------------------------
meshes = [o for o in sc.objects if o.type == 'MESH']
lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
for o in meshes:
    for c in o.bound_box:
        v = o.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, v)); hi = Vector(map(max, hi, v))
centre, size = (lo + hi) / 2, (hi - lo).length
tops = [o for o in sc.objects if o.parent is None]
# A hanging piece (--hang) has no table under it: the plane is kept, far below and unseen, only so the script reads the same.
bpy.ops.mesh.primitive_plane_add(size=size * 30, location=(centre.x, centre.y, lo.z - (size * 40 if a.hang else 0)))
table = bpy.context.object; table.name = 'Table (shadow only)'; table.is_shadow_catcher = True
# A dark table: a pale one would bounce light up into the piece and turn polished metal flat white.
cloth = bpy.data.materials.new('Dark table'); cloth.use_nodes = True
cloth.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (a.table, a.table, a.table, 1)
cloth.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .55
table.data.materials.append(cloth)
pivot = bpy.data.objects.new('Turntable', None); sc.collection.objects.link(pivot); pivot.location = (centre.x, centre.y, lo.z)
bpy.context.view_layer.update()
for o in tops:
    o.parent = pivot; o.matrix_parent_inverse = pivot.matrix_world.inverted()

# --- light: tent, black cards, small hard lamps -------------------------------------------------------------------
w = bpy.data.worlds.new('Light tent'); sc.world = w; w.use_nodes = True; nt = w.node_tree
env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(os.path.abspath(a.hdr))
mapping = nt.nodes.new('ShaderNodeMapping'); tc = nt.nodes.new('ShaderNodeTexCoord')
nt.links.new(tc.outputs['Generated'], mapping.inputs['Vector']); nt.links.new(mapping.outputs['Vector'], env.inputs['Vector'])
nt.nodes['Background'].inputs['Strength'].default_value = a.tent
nt.links.new(env.outputs['Color'], nt.nodes['Background'].inputs['Color'])

az, el = math.radians(a.azimuth), math.radians(a.elevation)
view = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))     # from the piece toward the camera
mapping.inputs['Rotation'].default_value = (0, 0, az - math.radians(90))
turn = Matrix.Rotation(az, 4, 'Z')


def lamp(name, azimuth, elevation, power, width, distance=2.4, colour=(1, 1, 1)):
    d = bpy.data.lights.new(name, 'AREA'); d.shape = 'DISK'; d.size = size * width; d.energy = power * (size / .03) ** 2; d.color = colour
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o)
    aa, ee = math.radians(azimuth), math.radians(elevation)
    rel = turn @ Vector((math.sin(aa) * math.cos(ee), -math.cos(aa) * math.cos(ee), math.sin(ee)))
    o.location = centre + rel * size * distance
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = (-rel).to_track_quat('-Z', 'Y')
    return o


if not a.clay:
    # Small and hard: each one is a point of fire in the stones. They are seen only through the stones (not by the
    # camera, not in the metal, and they light nothing directly): on polished metal a lamp this bright smears into
    # a white haze, and a real photographer flags them off the metal for the same reason.
    glow = bpy.data.materials.new('Sparkle lamp'); glow.use_nodes = True
    gnt = glow.node_tree
    for n in list(gnt.nodes): gnt.nodes.remove(n)
    emit = gnt.nodes.new('ShaderNodeEmission'); emit.inputs['Strength'].default_value = 420 * a.sparkle
    gnt.links.new(emit.outputs[0], gnt.nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])
    for i, (laz, lel, wide) in enumerate([(-38, 52, .13), (44, 38, .11), (155, 58, .12), (-135, 24, .1), (8, 78, .13), (-14, 36, .09), (22, 58, .1),
                                          (-70, 66, .1), (78, 62, .1), (-104, 44, .09), (118, 34, .09), (-170, 40, .1), (60, 20, .08), (-55, 22, .08)]):
        aa, ee = math.radians(laz), math.radians(lel)
        rel = turn @ Vector((math.sin(aa) * math.cos(ee), -math.cos(aa) * math.cos(ee), math.sin(ee)))
        bpy.ops.mesh.primitive_circle_add(vertices=24, radius=size * wide / 2, fill_type='NGON', location=centre + rel * size * 2.4)
        o = bpy.context.object; o.name = 'Sparkle lamp %d' % i
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = (-rel).to_track_quat('-Z', 'Y')
        o.data.materials.append(glow)
        o.visible_camera = False; o.visible_glossy = False; o.visible_diffuse = False; o.visible_shadow = False; o.visible_volume_scatter = False
    # What the stones see is their own room, as in the AMES viewer: broad white panels with dark gaps between them,
    # all the way round and underneath. A diamond is bright because it gathers light from everywhere and dark where
    # there is none to gather; that black-and-white is its sparkle. Seen only through the stones.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=size * 3.2, location=centre)
    room = bpy.context.object; room.name = 'Diamond room (seen only through the stones)'
    rm = bpy.data.materials.new('Diamond room'); rm.use_nodes = True; rnt = rm.node_tree
    for n in list(rnt.nodes): rnt.nodes.remove(n)
    rc = rnt.nodes.new('ShaderNodeTexCoord'); xyz = rnt.nodes.new('ShaderNodeSeparateXYZ'); rnt.links.new(rc.outputs['Object'], xyz.inputs[0])
    def math_node(op, x, y=None):
        n = rnt.nodes.new('ShaderNodeMath'); n.operation = op
        for socket, value in ((0, x), (1, y)):
            if value is None: continue
            if isinstance(value, (int, float)): n.inputs[socket].default_value = value
            else: rnt.links.new(value, n.inputs[socket])
        return n.outputs[0]
    around = math_node('ARCTAN2', xyz.outputs['Y'], xyz.outputs['X'])
    panels = math_node('GREATER_THAN', math_node('SINE', math_node('ADD', math_node('MULTIPLY', around, 8), math.pi / 2 - 8 * (az - math.pi / 2))), -.35)       # 8 panels, narrower gaps (an even number, turned so a panel faces the piece from the camera's side and another from behind)
    height = math_node('DIVIDE', xyz.outputs['Z'], size * 3.2)                                                # -1 .. 1
    band = math_node('GREATER_THAN', math_node('SINE', math_node('MULTIPLY', height, 9)), -.75)            # thin dark rings
    level = math_node('MULTIPLY', math_node('MULTIPLY', panels, band), a.room)
    level = math_node('ADD', level, a.room * .018)                                                        # the gaps are dim, not black
    re = rnt.nodes.new('ShaderNodeEmission'); rnt.links.new(level, re.inputs['Strength'])
    rnt.links.new(re.outputs[0], rnt.nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])
    room.data.materials.append(rm)
    room.visible_camera = False; room.visible_glossy = False; room.visible_diffuse = False; room.visible_shadow = False; room.visible_volume_scatter = False
    table.visible_transmission = False
    # A broad soft key from the upper left, as a strip box would give.
    lamp('Soft key', -55, 48, 1.3 * a.key, 1.8, distance=3.2)

    # Black cards: without something dark to reflect, polished metal and diamonds turn flat and milky.
    def card(name, azimuth, elevation, wide, tall, distance=2.0, through_stones=False):
        aa, ee = math.radians(azimuth), math.radians(elevation)
        rel = turn @ Vector((math.sin(aa) * math.cos(ee), -math.cos(aa) * math.cos(ee), math.sin(ee)))
        bpy.ops.mesh.primitive_plane_add(size=1, location=centre + rel * size * distance)
        o = bpy.context.object; o.name = name; o.scale = (size * wide, size * tall, 1)
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = (-rel).to_track_quat('-Z', 'Y')
        m = bpy.data.materials.get('Black card')
        if not m:
            m = bpy.data.materials.new('Black card'); m.use_nodes = True
            bs = m.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value = (.004, .004, .004, 1); bs.inputs['Roughness'].default_value = 1
        o.data.materials.append(m)
        o.visible_camera = False; o.visible_shadow = False; o.visible_diffuse = False
        # The cards shape the metal only. A stone that saw them would go dark and smoky.
        o.visible_transmission = through_stones
        return o
    card('Black card left', -92, 14, 1.6, 2.8, distance=1.8)
    card('Black card right', 96, 18, 1.5, 2.6, distance=1.8)
    card('Black card behind', 180, 30, 2.4, 1.6, distance=2.2)
    # The camera itself: a small dark shape straight ahead of the piece gives a diamond its crisp dark pattern.
    card('The camera, seen in the stones', 0, a.elevation, .26, .26, distance=1.9, through_stones=True)
    card('Black card under the lens', 0, -14, 2.2, .7, distance=1.7)
else:
    lamp('Key', -40, 50, .25, 1.5)

# --- camera -----------------------------------------------------------------------------------------------------
cam_data = bpy.data.cameras.new('Macro'); cam_data.lens = a.lens; cam_data.sensor_width = 36
cam = bpy.data.objects.new('Macro', cam_data); sc.collection.objects.link(cam); sc.camera = cam
fov = 2 * math.atan(18 / a.lens)
distance = (size / 2) / math.tan(fov / 2) / a.fill
aim = centre + Vector((0, 0, (hi.z - centre.z) * a.aim))
cam.location = aim + view * distance
cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = (-view).to_track_quat('-Z', 'Y')
cam_data.clip_start = distance / 100; cam_data.clip_end = distance * 20
if a.fstop > 0:
    # Focus on the nearest stone-height point of the piece: a touch in front of centre, as a photographer would.
    focus = bpy.data.objects.new('Focus', None); sc.collection.objects.link(focus)
    focus.location = centre + Vector((0, 0, (hi.z - centre.z) * .7)) + view * size * .08
    cam_data.dof.use_dof = True; cam_data.dof.focus_object = focus; cam_data.dof.aperture_fstop = a.fstop
    # Blender's lens works in scene units; the piece is modelled in metres, so the real f-number applies as is.

if a.save:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a.save))
print('STUDIO ready %.1fs  size %.2f mm  distance %.0f mm' % (time.time() - T0, size * 1000, distance * 1000), flush=True)
out = os.path.abspath(a.out)
if a.frames:
    stem, ext = os.path.splitext(out)
    for f in range(a.frames):
        pivot.rotation_euler = (0, 0, f * math.tau / a.frames)
        sc.render.filepath = '%s-%03d%s' % (stem, f, ext)
        bpy.ops.render.render(write_still=True)
        print('FRAME', f, '%.1fs' % (time.time() - T0), flush=True)
else:
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
print('STUDIO done %.1fs %s' % (time.time() - T0, out), flush=True)
