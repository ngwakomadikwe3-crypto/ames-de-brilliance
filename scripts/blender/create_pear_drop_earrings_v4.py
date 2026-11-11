"""AMES pear drop earrings, revision 4: rebuilt in Blender as a jeweller would make them.

Each earring: a pear brilliant on the ear, a cushion turned on its point, and a large pear drop, each in a claw
setting with a gallery wire, joined by jump rings so the lower parts swing. Original AMES geometry; sizes are design
inputs, not measured stock, and make no claim about metal, diamond grade or manufacture.

Run:  blender --background --python create_pear_drop_earrings_v4.py -- <out.blend> [<out.glb>]
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ames_jewel_kit as kit  # noqa: E402

MM = .001
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
out_blend = Path(argv[0]) if argv else Path('earrings-v4.blend')
out_glb = Path(argv[1]) if len(argv) > 1 else None
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

# --- design inputs (mm): the earring is laid out flat (X across, Y up the ear, table toward +Z), then stood up --------
PEAR = kit.pear_outline(1.55)
CUSHION = kit.superellipse_outline(3.0)
TOP_W, LINK_W, DROP_W = 2.3 * MM, 2.0 * MM, 5.0 * MM            # half-widths: 4.6 mm pear, 4 mm cushion, 10 mm drop
TIP = (2 * 1.55 - 1)                                             # pear point, in half-widths above its centre
GAP = 1.5 * MM                                                   # room for a jump ring between stones
link_reach = LINK_W * 2 ** .5 * .93                              # the cushion stands on its point
top_y = 0
link_y = top_y - TOP_W - GAP - link_reach
drop_y = link_y - link_reach - GAP - DROP_W * TIP
STAND = Matrix.Rotation(math.pi / 2, 4, 'X')                     # +Z (the tables) to the front, +Y up
SPACING = 11.5 * MM


def stone(name, outline, half_width, at, spin, cut, claws, wide=None, wire=.36 * MM):
    """One set stone at (x, y) in the flat layout. Returns its parts (stone first), placed but not yet stood up."""
    gem, info = kit.fancy_brilliant(name, outline, half_width, diamond, turn=math.pi / 2 if cut == 'pear' else 0, keel=TIP - 1.05 if cut == 'pear' else 0)
    # No ames_cut tag: the viewer then keeps these facets (its own pear points the other way and has no keel).
    gem['ames_optical_mode'] = 'closed-dielectric-visual'; gem['ames_gemstone_id'] = 'stone-diamond'
    parts = [gem] + kit.claw_setting(name + ' setting', outline, half_width, info, claws, metal, wire=wire, wide=wide)
    place = Matrix.Translation((at[0], at[1], 0)) @ Matrix.Rotation(spin, 4, 'Z')
    for p in parts:
        p.matrix_world = place
    return parts, info


def earring(side):
    x = side * SPACING
    root = bpy.data.objects.new('Earring ' + ('left' if side < 0 else 'right'), None); link(root)
    root.matrix_world = Matrix.Translation((x, 0, 0)) @ STAND
    quarter = math.pi / 2
    groups = []
    # On the ear: a pear, point up. A V claw guards the point; four more hold the shoulders and the round end.
    top, top_info = stone('Ear pear', PEAR, TOP_W, (0, top_y), 0, 'pear',
                          [quarter, math.radians(22), math.radians(158), math.radians(-52), math.radians(-128)], wide=[quarter], wire=.27 * MM)
    post = kit.sweep('Ear post', [(0, top_y + TOP_W * .5, -top_info['depth'] * .55), (0, top_y + TOP_W * .5, -top_info['depth'] - 9.5 * MM)], .42 * MM, metal, sides=16)
    groups.append((root, top + [post]))
    # First hinge: under the round end of the ear pear.
    hinge1 = (0, top_y - TOP_W - GAP * .5)
    swing1 = bpy.data.objects.new('Link dangle', None); link(swing1); swing1['ames_dangle'] = 1
    swing1.parent = root; swing1.matrix_parent_inverse = Matrix(); swing1.location = (hinge1[0], hinge1[1], 0)
    cushion, _ = stone('Link cushion', CUSHION, LINK_W, (0, link_y), math.pi / 4, 'cushion', [math.pi / 4 + k * quarter for k in range(4)], wire=.26 * MM)
    ring1 = kit.ring_link('Jump ring upper', GAP * .42, .2 * MM, (hinge1[0], hinge1[1], -.25 * MM), (1, 0, 0), metal)
    groups.append((swing1, cushion + [ring1]))
    # Second hinge: under the cushion's lower point, above the drop's point.
    hinge2 = (0, link_y - link_reach - GAP * .5)
    swing2 = bpy.data.objects.new('Drop dangle', None); link(swing2); swing2['ames_dangle'] = 1
    swing2.parent = swing1; swing2.matrix_parent_inverse = Matrix(); swing2.location = (hinge2[0] - hinge1[0], hinge2[1] - hinge1[1], 0)
    drop, _ = stone('Pear drop', PEAR, DROP_W, (0, drop_y), 0, 'pear',
                    [quarter, math.radians(24), math.radians(156), math.radians(-38), math.radians(-142), -quarter], wide=[quarter], wire=.34 * MM)
    ring2 = kit.ring_link('Jump ring lower', GAP * .42, .2 * MM, (hinge2[0], hinge2[1], -.3 * MM), (1, 0, 0), metal)
    groups.append((swing2, drop + [ring2]))
    count = 0
    bpy.context.view_layer.update()
    for parent, parts in groups:
        for p in parts:
            link(p)
            flat = p.matrix_world.copy()                         # where it lies in the flat layout
            p.parent = parent
            p.matrix_parent_inverse = Matrix()
            # Parent frames are the flat layout moved to the hinge, so local = flat placement minus the hinge.
            offset = Vector((0, 0, 0))
            node = parent
            while node is not root:
                offset += node.location; node = node.parent
            p.matrix_basis = Matrix.Translation(-offset) @ flat
            if p.type == 'MESH' and p.data.materials and p.data.materials[0] == metal:
                p['ames_optical_mode'] = 'conductor'
            count += 1
    return count


parts = earring(-1) + earring(1)
bpy.context.view_layer.update()
print('EARRINGS_V4 parts', parts, 'length mm', round((top_y + TOP_W * TIP - (drop_y - DROP_W)) / MM, 1), flush=True)
out_blend.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out_blend.resolve()))
if out_glb:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(out_glb.resolve()), export_format='GLB', use_selection=True, export_apply=True,
                              export_extras=True, export_animations=False, export_cameras=False, export_lights=False)
print('EARRINGS_V4_COMPLETE', flush=True)
