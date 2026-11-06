# Cycles product still for an AMES GLB (raw, uncompressed). Usage:
#   python3 cycles.py in.glb out.png --theta 10 --phi 84 --res 900 --spp 128 [--ground] [--hdr tent2.hdr] [--time 10:10:35]
import sys, math, argparse, bpy, mathutils
import os
p = argparse.ArgumentParser(); p.add_argument('glb'); p.add_argument('out')
p.add_argument('--theta', type=float, default=0); p.add_argument('--phi', type=float, default=80)
p.add_argument('--res', type=int, default=900); p.add_argument('--spp', type=int, default=128)
p.add_argument('--ground', action='store_true'); p.add_argument('--hdr', default='/home/claude/models/render/tent2.hdr')
p.add_argument('--fill', type=float, default=.82); p.add_argument('--lens', type=float, default=85)
p.add_argument('--strength', type=float, default=1.0); p.add_argument('--time', default=None); p.add_argument('--sparkle', type=float, default=1.0)
a = p.parse_args(sys.argv[1:])

bpy.ops.wm.read_factory_settings(use_empty=True)
import addon_utils; addon_utils.enable('cycles', default_set=True)
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; cy = sc.cycles
cy.device = 'CPU'; cy.samples = a.spp; cy.use_denoising = True
cy.max_bounces = 32; cy.transmission_bounces = 24; cy.glossy_bounces = 16; cy.transparent_max_bounces = 16
cy.caustics_reflective = False; cy.caustics_refractive = False; cy.sample_clamp_indirect = 12
sc.render.resolution_x = sc.render.resolution_y = a.res; sc.render.film_transparent = True
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
import time; T0 = time.time(); print('T import start', flush=True)
bpy.ops.import_scene.gltf(filepath=a.glb); print('T imported', time.time() - T0, flush=True)

def principled(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; return m, m.node_tree.nodes['Principled BSDF']
diamond, bd = principled('Diamond'); bd.inputs['Base Color'].default_value = (1, 1, 1, 1)
bd.inputs['Transmission Weight'].default_value = 1; bd.inputs['IOR'].default_value = 2.417; bd.inputs['Roughness'].default_value = 0
if 'Dispersion' in bd.inputs: bd.inputs['Dispersion'].default_value = .36
gold, bg = principled('White gold'); bg.inputs['Base Color'].default_value = (.74, .72, .69, 1)
bg.inputs['Metallic'].default_value = 1; bg.inputs['Roughness'].default_value = .07
for ob in [o for o in sc.objects if o.type == 'MESH']:
    me = ob.data
    # Flat facets on stones; smooth curves on metal.
    gem = 'Diamond' in (me.materials[0].name if me.materials else '') or ob.get('ames_optical_mode') == 'closed-dielectric-visual'
    for poly in me.polygons: poly.use_smooth = not gem
    for i, mat in enumerate(me.materials):
        n = mat.name if mat else ''
        if gem: me.materials[i] = diamond
        elif 'gold' in n.lower() or 'platinum' in n.lower(): me.materials[i] = gold
        elif 'hands' in n.lower():
            hb = mat.node_tree.nodes['Principled BSDF']; hb.inputs['Base Color'].default_value = (.03, .08, .36, 1); hb.inputs['Metallic'].default_value = 1; hb.inputs['Roughness'].default_value = .16
        elif 'dial' in n.lower():
            mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .38
if a.time:
    H, M, S = [float(x) for x in a.time.split(':')]; mm = M + S / 60; hh = H % 12 + mm / 60
    for ob in sc.objects:
        k = ob.get('ames_watch_hand')
        if not k: continue
        t = hh / 12 if k == 'hour' else mm / 60 if k == 'minute' else S / 60
        ob.rotation_mode = 'QUATERNION'; ob.rotation_quaternion = mathutils.Quaternion((0, 1, 0), t * 2 * math.pi)
# World: the AMES jewellery tent HDR.
w = bpy.data.worlds.new('Tent'); sc.world = w; w.use_nodes = True; nt = w.node_tree
env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(a.hdr)
mapn = nt.nodes.new('ShaderNodeMapping'); tc = nt.nodes.new('ShaderNodeTexCoord')
nt.links.new(tc.outputs['Generated'], mapn.inputs['Vector']); nt.links.new(mapn.outputs['Vector'], env.inputs['Vector'])
# glTF/three: +y up, +z front. Blender: +z up, -y front. Rotate the equirect to match three's lookup.
mapn.inputs['Rotation'].default_value = (0, 0, math.radians(-90))
nt.nodes['Background'].inputs['Strength'].default_value = a.strength
nt.links.new(env.outputs['Color'], nt.nodes['Background'].inputs['Color'])

objs = [o for o in sc.objects if o.type == 'MESH']
lo = mathutils.Vector((1e9,) * 3); hi = -lo
for o in objs:
    for c in o.bound_box:
        v = o.matrix_world @ mathutils.Vector(c); lo = mathutils.Vector(map(min, lo, v)); hi = mathutils.Vector(map(max, hi, v))
ctr = (lo + hi) / 2; size = (hi - lo).length
if a.ground:
    bpy.ops.mesh.primitive_plane_add(size=size * 20, location=(ctr.x, ctr.y, lo.z)); g = bpy.context.object; g.is_shadow_catcher = True
cam_data = bpy.data.cameras.new('Cam'); cam_data.lens = a.lens; cam = bpy.data.objects.new('Cam', cam_data); sc.collection.objects.link(cam); sc.camera = cam
th, ph = math.radians(a.theta), math.radians(a.phi)
# three spherical (theta from +z toward +x, phi from +y) mapped into Blender axes (x, -z_three -> y, y_three -> z).
d3 = mathutils.Vector((math.sin(ph) * math.sin(th), math.cos(ph), math.sin(ph) * math.cos(th)))
dirb = mathutils.Vector((d3.x, -d3.z, d3.y))
fov = 2 * math.atan(18 / a.lens); dist = (size / 2) / math.tan(fov / 2) / a.fill
cam.location = ctr + dirb * dist; cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = (-dirb).to_track_quat('-Z', 'Y')
cam_data.clip_start = dist / 100; cam_data.clip_end = dist * 10
# Small, hard studio lights: they make each facet flash the way spot-lit jewellery photography does.
for i, (az, el, power) in enumerate([(-35, 50, 900), (40, 35, 650), (160, 60, 500), (-140, 20, 380)]):
    ld = bpy.data.lights.new(f'Spark {i}', 'AREA'); ld.shape = 'DISK'; ld.size = size * .06; ld.energy = power * a.sparkle * (size / 60) ** 2
    lo_ = bpy.data.objects.new(f'Spark {i}', ld); sc.collection.objects.link(lo_)
    az_r, el_r = math.radians(az), math.radians(el)
    rel = mathutils.Matrix.Rotation(math.atan2(dirb.x, -dirb.y), 4, 'Z') @ mathutils.Vector((math.sin(az_r) * math.cos(el_r), -math.cos(az_r) * math.cos(el_r), math.sin(el_r)))
    lo_.location = ctr + rel * size * 2.2; lo_.rotation_mode = 'QUATERNION'; lo_.rotation_quaternion = (-rel).to_track_quat('-Z', 'Y')
print('T render start', time.time() - T0, flush=True); sc.render.threads_mode = 'FIXED'; sc.render.threads = 2
sc.render.filepath = os.path.abspath(a.out); bpy.ops.render.render(write_still=True); print('T done', time.time() - T0, flush=True)
print('rendered', a.out)
