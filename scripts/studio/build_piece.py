"""Build and render one review frame of a jewellery piece.

Usage: build_piece.py <piece> [name-suffix]
Each piece says where its mesh is, which stone families get which cut, and
whether it is shot hanging (against a backdrop) or resting (on the floor).
"""
import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ames_studio as S, ames_metal as M, ames_restone as R
from mathutils import Vector, Matrix

P = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pieces') + '/'
PIECES = {
    'bracelet': dict(src=P + 'bracelet-draped.blend', stones={'Tennis diamond': 'round'},
                     layout='floor', cam=dict(dist=5.6, elev=32.0, lens=85, fstop=16.0), res=(1100, 1100), tent=(0.25, 3.0), observer=True),
    'necklace': dict(src=P + 'necklace-draped.blend', stones={'Riviera diamond': 'round', 'Pear drop diamond': 'pear'},
                     layout='wall', cam=dict(dist=3.9, elev=3.0, lens=85, fstop=16.0), res=(1300, 950), aim=0.42, tent=(0.22, 2.4), black_behind=True, card=0.3),
    'earrings': dict(src=P + 'earrings.glb', stones={'Ear pear': 'pear', 'Link cushion': 'cushion', 'Pear drop': 'pear'},
                     layout='wall', cam=dict(dist=5.4, elev=2.0, lens=85, fstop=16.0), res=(1100, 1100), turn=8.0, tent=(0.22, 2.4), black_behind=True),
    'ring':     dict(src=P + 'ring.glb', stones={'Solitaire diamond': 'round', 'Pave diamond': 'round'},
                     layout='floor', cam=dict(dist=6.6, elev=54.0, lens=90, fstop=14.0), res=(1100, 1100), turn=38.0, plain_floor=True, tent=(0.18, 3.4), observer=True, floor_glow=0.35),
}
name = [a for a in sys.argv if a in PIECES][0]
cfg = PIECES[name]
suffix = sys.argv[-1] if sys.argv[-1] not in PIECES else 'v1'

if cfg['src'].endswith('.blend'):
    bpy.ops.wm.open_mainfile(filepath=cfg['src'])
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=cfg['src'])

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
is_stone = lambda o: any(o.name.startswith(p) for p in cfg['stones']) and not any(
    w in o.name for w in ('setting', 'claw', 'gallery'))
metal = [o for o in meshes if not is_stone(o)]

gem = S.gem_material(name + '_gem'); girdle = S.bruted_girdle()
cut = []
# Longest prefixes first so "Pear drop diamond" is not claimed by "Pear drop".
for prefix in sorted(cfg['stones'], key=len, reverse=True):
    group = [o for o in bpy.context.scene.objects if o.type == 'MESH' and is_stone(o)
             and o.name.startswith(prefix) and o not in cut]
    made = R.restone(group, cfg['stones'][prefix], gem, girdle)
    print('%-20s %-8s %s' % (prefix, cfg['stones'][prefix], R.verify(made)))
    cut += made
M.reskin(metal, gem)

s = bpy.context.scene
s.render.engine = 'CYCLES'; s.cycles.device = 'CPU'
s.cycles.samples = int(os.environ.get('SPP', 520)); s.cycles.max_bounces = 64
s.cycles.transmission_bounces = 48; s.cycles.glossy_bounces = 24
# Cycles clamps indirect light to 10 by default, and every flash inside a cut
# stone is indirect light: the clamp is what was turning set stones grey.
s.cycles.sample_clamp_indirect = 0.0
s.cycles.use_denoising = True; s.cycles.blur_glossy = 0.0
s.render.resolution_x, s.render.resolution_y = cfg['res']
s.render.resolution_percentage = int(os.environ.get('PCT', 100))
s.view_settings.view_transform = 'AgX'; s.view_settings.look = 'AgX - Punchy'
if s.world is None:
    s.world = bpy.data.worlds.new('w')

body = metal + cut
def centres():
    return [sum((o.matrix_world @ Vector(c) for c in o.bound_box), Vector()) / 8 for o in body]
pts = centres()
mid = sum(pts, Vector()) / len(pts)
span = max((p - mid).length for p in pts)

# One root for the whole piece: fit it to a unit span and place it.
root = bpy.data.objects.new('piece_root', None)
bpy.context.collection.objects.link(root)
def top_of(o):
    while o.parent is not None: o = o.parent
    return o
for o in {top_of(o).name: top_of(o) for o in body}.values():
    if o is root: continue
    mw = o.matrix_world.copy(); o.parent = root; o.matrix_world = mw
bpy.context.view_layer.update()
k = 1.0 / span
turn = Matrix.Rotation(math.radians(cfg.get('turn', 0.0)), 4, 'Z')
root.matrix_world = turn @ Matrix.Scale(k, 4) @ Matrix.Translation(-mid)
bpy.context.view_layer.update()
low = min(min((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in body)
lift = 1.2 if cfg['layout'] == 'wall' else 0.004
root.matrix_world = Matrix.Translation((0, 0, lift - low)) @ root.matrix_world   # lowest point sits at `lift`
bpy.context.view_layer.update()
print('fitted: span %.4f -> 1.0' % span)

if cfg['layout'] == 'wall':
    top = max(max((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in body)
    centre_h = cfg['aim'] if 'aim' in cfg else (top - 1.2) / 2.0   # middle of the piece unless told otherwise
    S.aim(1.2 + centre_h)
    wall_s, lid_s = cfg.get('tent', (0.82, None))
    S.tent(strength=wall_s, lid_strength=lid_s)
    # Backdrop glows its own colour, so nothing can cast a band across it.
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 5.2, 5), rotation=(math.radians(90), 0, 0))
    wall = bpy.context.object
    wm = bpy.data.materials.new('wall'); wm.use_nodes = True
    nt = wm.node_tree; nt.nodes.clear()
    wo = nt.nodes.new('ShaderNodeOutputMaterial'); we = nt.nodes.new('ShaderNodeEmission')
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (0.11, 0.11, 0.11)
    gr = nt.nodes.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'
    rp = nt.nodes.new('ShaderNodeValToRGB')
    rp.color_ramp.elements[0].color = (0.006, 0.017, 0.015, 1)
    rp.color_ramp.elements[1].color = (0.017, 0.040, 0.035, 1)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], gr.inputs['Vector'])
    nt.links.new(gr.outputs['Fac'], rp.inputs['Fac']); nt.links.new(rp.outputs['Color'], we.inputs['Color'])
    nt.links.new(we.outputs['Emission'], wo.inputs['Surface'])
    wall.data.materials.append(wm)
    back = max(max((o.matrix_world @ Vector(c)).y for c in o.bound_box) for o in body)
    S.chequer_card((0, back + 0.06, 1.2 + centre_h), (math.radians(90), 0, 0), size=3.4, strength=float(os.environ.get('CARD', cfg.get('card', 0.9))))
else:
    top = max(max((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in body)
    S.aim(top * 0.52)
    # A piece led by one big stone gets darker walls and a brighter ceiling,
    # the same contrast that made the loose stones light up.
    wall_s, lid_s = cfg.get('tent', (0.82, None))
    S.tent(strength=wall_s, lid_strength=lid_s)
    # A broad polished band mirrors a chequer as a visible pattern, so pieces
    # that are mostly metal get the plain glow.
    if cfg.get('plain_floor'):
        S.stage_floor(strength=cfg.get('floor_glow', 1.3), pattern=False, reach=3.5)
    else:
        S.stage_floor(squares=44.0, strength=1.0, reach=3.6)
S.accents(); S.flag(); S.strips()
if cfg.get('observer'):
    S.observer(cfg['cam']['elev'], radius=1.6)
cam = S.camera(**cfg['cam'])
if cfg.get('black_behind'):
    # Black card behind the camera, out of shot. A stone facing the lens
    # mirrors whatever is behind the lens; bright tent there turns every
    # table milky, dark there gives the facets their contrast.
    from mathutils import Vector as _V
    aim_p = bpy.data.objects['aim'].location
    back = (cam.location - aim_p).normalized()
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=1.9, fill_type='NGON',
                                      location=cam.location + back * 0.6)
    bc = bpy.context.object
    c = bc.constraints.new('TRACK_TO'); c.target = bpy.data.objects['aim']
    c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    bm = bpy.data.materials.new('behind'); bm.use_nodes = True
    bm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0, 0, 0, 1)
    bm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
    bc.data.materials.append(bm); bc.visible_camera = False; bc.visible_shadow = False

S.use_gpu_if_asked()
if os.environ.get('FRAMES'):
    S.turntable(root, int(os.environ['FRAMES']), os.path.expanduser('~/cuts/spin/%s' % name),
                int(os.environ.get('SIZE', 1080)), int(os.environ.get('DETAIL', 0)))
else:
    s.render.filepath = os.path.expanduser('~/cuts/out/%s-%s' % (name, suffix))
    bpy.ops.render.render(write_still=True)
print('DONE')
