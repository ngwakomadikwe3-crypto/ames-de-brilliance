"""Build the original AMES Eclat concept diamond in metres, without third-party geometry.

Run with Blender --background --python-exit-code 1 --python this-file.py.
This is an illustrative design, not stock, a cut grade, or a manufacturing model.
"""
import bpy
import bmesh
import hashlib
import json
import math
import sys
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSET = 'demo-modern-diamond'
OUT = ROOT / 'public/ames-engine' / ASSET / 'web'
SOURCE = ROOT / 'source-assets/chat-statement-diamond/revision-1'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)

# A new background process owns this scene; the user's interactive Blender is untouched.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1

# Clipped corners and graduated pavilion/crown slopes form a convex octagonal volume.
# Design envelope: 12 x 18 x 8.94 mm in Blender XYZ; no physical stone is implied.
outline = [(-.72,-1),(.72,-1),(1,-.72),(1,.72),(.72,1),(-.72,1),(-1,.72),(-1,-.72)]
levels = [(.035,-1.05),(.38,-.70),(.72,-.34),(1,-.02),(1,.02),(.86,.20),(.68,.37),(.52,.44)]
bm = bmesh.new()
for radius, height in levels:
    for x,y in outline:
        bm.verts.new((x * radius * .006, y * radius * .009, height * .006))
result = bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
discarded = list(set(result.get('geom_interior', []) + result.get('geom_unused', [])))
if discarded:
    bmesh.ops.delete(bm, geom=discarded, context='VERTS')
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
if any(not edge.is_manifold for edge in bm.edges):
    raise RuntimeError('The concept diamond must be a closed manifold.')
mesh = bpy.data.meshes.new('Eclat octagonal step facets')
bm.to_mesh(mesh)
bm.free()
mesh.update()
obj = bpy.data.objects.new('AMES Eclat | octagonal concept diamond', mesh)
scene.collection.objects.link(obj)
for face in mesh.polygons:
    face.use_smooth = False
obj['ames_gemstone_id'] = 'stone-diamond'  # Material family, not the content-pack identity.
obj['ames_asset_id'] = ASSET
obj['ames_optical_mode'] = 'closed-dielectric-visual'
obj['ames_cut_revision'] = 1
obj['ames_mobile_optics'] = 'convex-facet-volume'
obj['ames_demonstration_only'] = True

mat = bpy.data.materials.new('Colourless diamond | illustrative dielectric')
mat.use_nodes = True
bsdf = next(node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
bsdf.inputs['Base Color'].default_value = (.995,.998,1,1)
bsdf.inputs['Metallic'].default_value = 0
bsdf.inputs['Roughness'].default_value = .008
bsdf.inputs['IOR'].default_value = 2.417
bsdf.inputs['Transmission Weight'].default_value = 1
mesh.materials.append(mat)
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
glb = OUT / 'diamond-v1.glb'
bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True,
    export_apply=True, export_animations=False, export_cameras=False,
    export_lights=False, export_extras=True)

scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 20
scene.cycles.transmission_bounces = 16
scene.cycles.glossy_bounces = 12
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX'
world = bpy.data.worlds.new('AMES photographic studio')
scene.world = world
world.use_nodes = True
background = next(node for node in world.node_tree.nodes if node.type == 'BACKGROUND')
hdr = ROOT / 'source-assets/environments/studio_small_09_1k.hdr'
if not hdr.exists():
    raise RuntimeError('The existing licensed studio HDR is required.')
environment = world.node_tree.nodes.new('ShaderNodeTexEnvironment')
environment.image = bpy.data.images.load(str(hdr), check_existing=True)
world.node_tree.links.new(environment.outputs['Color'], background.inputs['Color'])
background.inputs['Strength'].default_value = .7

def area(name, location, power, size, color):
    light = bpy.data.lights.new(name, 'AREA')
    light.energy, light.shape, light.size, light.color = power, 'DISK', size, color
    item = bpy.data.objects.new(name, light)
    scene.collection.objects.link(item)
    item.location = location
    item.rotation_euler = (-item.location).to_track_quat('-Z','Y').to_euler()

# Broad, physically separate softboxes; no emissive gem or artificial sparkle geometry.
area('Softbox key', (.022,-.018,.035), .045, .025, (1,.97,.92))
area('Softbox rim', (-.018,.016,.025), .032, .016, (.91,.96,1))
camera_data = bpy.data.cameras.new('Concept inspection camera')
camera = bpy.data.objects.new('Concept inspection camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.lens = 85
camera_data.clip_start = .0001
camera_data.clip_end = 10
target = Vector((0,0,-.00183))
distance = .058
phi, theta = math.radians(27), math.radians(30)
camera.location = target + Vector((distance*math.sin(phi)*math.sin(theta),
    -distance*math.sin(phi)*math.cos(theta),distance*math.cos(phi)))
camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath = str(SOURCE / 'poster-v1.png')
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'eclat-diamond.blend'))
if '--skip-render' not in sys.argv:
    bpy.ops.render.render(write_still=True)
manifest = {
    'assetId': ASSET, 'revisionId': ASSET+':1', 'demonstrationOnly': True,
    'generator': 'scripts/blender/create_chat_statement_diamond.py',
    'geometrySource': 'Original parametric convex octagonal step-cut design',
    'modelSha256': hashlib.sha256(glb.read_bytes()).hexdigest(),
    'sourceDesignEnvelopeMmXYZ': [12,18,8.94],
    'gltfDesignEnvelopeMmXYZ': [12,8.94,18],
    'physicalStoneMeasured': False, 'manufacturingCertified': False,
    'posterSource': 'Cycles render of the same original geometry',
    'lightingSource': 'Existing AMES studio_small_09_1k.hdr; see source-assets/environments',
    'limitations': ['Illustrative RGB refraction; no spectral dispersion or cut grading.',
        'Design dimensions are authored inputs, not measured inventory or carat evidence.',
        'Not for sale; no origin, certification, clarity, colour grade or stock claim.']
}
(SOURCE / 'provenance.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('AMES_ECLAT_CREATED', json.dumps(manifest), flush=True)
