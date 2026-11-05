"""Private visualization conversion. Does not qualify CAD for manufacturing or publish assets."""
import bpy, sys, json, math, hashlib, os, bmesh
from pathlib import Path
from mathutils import Vector, Matrix

folder = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
job = json.loads((folder / 'job.json').read_text())
source = folder / ('source.' + job['extension'])
if hashlib.sha256(source.read_bytes()).hexdigest() != job['sourceSha256']:
    raise ValueError('Source checksum mismatch')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
limitations = ['Visualization only; not a manufacturing validation.', 'Material choices are declarations, not verified metal purity or gemstone certification.']
ext = job['extension']
if ext == 'obj':
    # A standalone OBJ has no bundled materials. Do not follow arbitrary mtllib paths.
    text = source.read_text(encoding='utf-8', errors='strict')
    if any(line.lstrip().startswith(('curv ', 'surf ')) for line in text.splitlines()):
        raise ValueError('OBJ contains CAD curves or surfaces. Export a tessellated polygon mesh from your CAD application.')
    clean = '\n'.join(line for line in text.splitlines() if not line.lstrip().startswith(('mtllib ', 'call ', 'csh ')))
    sanitized = folder / 'mesh.obj'; sanitized.write_text(clean, encoding='utf-8')
    bpy.ops.wm.obj_import(filepath=str(sanitized))
    limitations.append('Standalone OBJ material libraries are not imported. Assign materials to the components below or upload an embedded GLB.')
elif ext == 'stl':
    bpy.ops.wm.stl_import(filepath=str(source))
    limitations.append('STL contains geometry only. Separate metal and gemstone components must be supplied to assign different materials.')
elif ext == 'glb':
    bpy.ops.import_scene.gltf(filepath=str(source))
elif ext == 'fbx':
    bpy.ops.import_scene.fbx(filepath=str(source), use_image_search=False, use_anim=False)
    for image in bpy.data.images:
        if image.source == 'FILE' and not image.packed_file:
            raise ValueError('FBX references an external texture. Export GLB with embedded textures instead.')
else:
    raise ValueError('Unsupported automatic conversion format')

meshes = sorted([o for o in bpy.context.scene.objects if o.type == 'MESH'], key=lambda o:o.name)
if not meshes or len(meshes)>500:
    raise ValueError('Source must contain between 1 and 500 mesh components')
triangles = sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in meshes)
if triangles == 0 or triangles > 2000000:
    raise ValueError('Source must contain 1 to 2 million triangles. Export a lighter visualization mesh.')
# Capture every world matrix before detaching any parent in a CAD hierarchy.
world_matrices = {obj: obj.matrix_world.copy() for obj in meshes}
for obj in meshes:
    obj.data = obj.data.copy()
    obj.parent = None
    obj.matrix_world = Matrix.Identity(4)
    obj.data.transform(world_matrices[obj])
    obj.data.update()
for obj in list(bpy.context.scene.objects):
    if obj not in meshes:
        bpy.data.objects.remove(obj, do_unlink=True)
bpy.context.view_layer.update()
points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
minimum = Vector(tuple(min(p[i] for p in points) for i in range(3)))
maximum = Vector(tuple(max(p[i] for p in points) for i in range(3)))
size = maximum-minimum
if not all(math.isfinite(v) for p in points for v in p) or max(size) <= 0:
    raise ValueError('Invalid or empty model bounds')
center = (maximum+minimum)/2
factor = 2/max(size)
fit = Matrix.Translation(-center) @ Matrix.Identity(4)
fit = Matrix.Scale(factor, 4) @ fit
components=[]
colors = {'yellow_gold':(0.83,0.58,0.22,1),'rose_gold':(0.8,0.44,0.32,1),'white_gold':(0.82,0.83,0.8,1),'silver':(0.88,0.9,0.92,1),'platinum':(0.7,0.73,0.76,1), 'diamond':(0.96,0.99,1,1),'ruby':(0.55,0.008,0.035,1),'sapphire':(0.015,0.06,0.55,1),'emerald':(0.015,0.35,0.12,1),'unassigned':(0.65,0.65,0.65,1)}
gems={'diamond':2.417,'ruby':1.77,'sapphire':1.77,'emerald':1.58}

def closed_manifold(mesh):
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        return bool(bm.faces) and all(v.is_manifold for v in bm.verts) and all(e.is_manifold for e in bm.edges) and all(f.calc_area() > 1e-14 for f in bm.faces)
    finally:
        bm.free()

def clean_mesh(obj, smooth):
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=1e-10)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = smooth
    if smooth:
        # Preserve crisp CAD breaks while smoothing continuous polished surfaces.
        mesh.set_sharp_from_angle(angle=math.radians(35))

for index,obj in enumerate(meshes):
    key='part-'+str(index)
    choice=job['assignments'].get(key,'preserve')
    original=[m.name if m else 'Unassigned' for m in obj.data.materials]
    if choice=='preserve' and not any(obj.data.materials):
        choice='unassigned'
    declared_gem = choice in gems
    if choice!='preserve':
        if choice not in colors: raise ValueError('Invalid material choice')
        material=bpy.data.materials.new(key+'_'+choice);material.use_nodes=True
        bsdf=material.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value=colors[choice]
        bsdf.inputs['Metallic'].default_value=0 if declared_gem or choice=='unassigned' else 1
        bsdf.inputs['Roughness'].default_value=0.018 if declared_gem else 0.13 if choice!='unassigned' else 0.6
        if declared_gem:
            bsdf.inputs['Transmission Weight'].default_value=1
            bsdf.inputs['IOR'].default_value=gems[choice]
        elif choice != 'unassigned':
            bsdf.inputs['Coat Weight'].default_value=0.16
            bsdf.inputs['Coat Roughness'].default_value=0.1
        obj.data.materials.clear();obj.data.materials.append(material)
        for polygon in obj.data.polygons: polygon.material_index=0
    obj.data.transform(fit)
    clean_mesh(obj, smooth=not declared_gem)
    watertight = closed_manifold(obj.data)
    # Uploaded extras are not proof of geometry qualification. Recompute them here.
    for properties in (obj, obj.data):
        for tag in ('ames_optical_mode', 'ames_gemstone_id', 'ames_optical_ior'):
            if tag in properties:
                del properties[tag]
    optical = 'none'
    if declared_gem:
        if watertight:
            optical = 'closed-dielectric-visual'
            obj['ames_optical_mode'] = optical
            obj['ames_gemstone_id'] = 'cad-' + choice
            obj['ames_optical_ior'] = gems[choice]
        else:
            limitations.append(f'{obj.name} is assigned {choice} but is not a closed manifold; internal refraction was not enabled.')
    elif choice == 'preserve':
        # Preserve qualifying transmissive GLB materials, never infer gems from object names.
        transmissive = any(m and m.use_nodes and (m.node_tree.nodes.get('Principled BSDF') and m.node_tree.nodes.get('Principled BSDF').inputs['Transmission Weight'].default_value > .5) for m in obj.data.materials)
        if transmissive and watertight:
            optical = 'closed-dielectric-visual'
            obj['ames_optical_mode'] = optical
            obj['ames_gemstone_id'] = 'cad-preserved'
    components.append({'id':key,'name':obj.name,'triangles':sum(len(p.vertices)-2 for p in obj.data.polygons),'originalMaterials':original,'material':choice,'closedManifold':watertight,'opticalMode':optical})
if any(c['material']=='unassigned' for c in components): limitations.append('Some components have no assigned material and remain neutral gray.')
if job['units']=='unknown': limitations.append('Source units are unconfirmed. Display fitting does not establish physical size.')
limitations.append('Geometry is fitted to the viewer without adding missing stones, bevels, or changing intended component shapes.')
limitations.append('Smooth shading and optical materials affect display only; they do not repair or certify manufacturing geometry.')
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes: obj.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
bpy.ops.export_scene.gltf(filepath=str(folder/'preview.glb'),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
# Transparent, consistently framed product render; no baked studio square.
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=max(8,min(128,int(os.environ.get('AMES_CAD_RENDER_SAMPLES','48'))));scene.cycles.use_denoising=True
scene.cycles.max_bounces=12;scene.cycles.transmission_bounces=10;scene.cycles.glossy_bounces=6
render_size=max(128,min(1024,int(os.environ.get('AMES_CAD_RENDER_SIZE','768'))))
scene.render.resolution_x=render_size;scene.render.resolution_y=render_size;scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(0.3,0.34,0.37,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=0.35
for name,position,power,size_light in [('Key',(3,-4,4),500,3),('Fill',(-3,-2,1),240,2),('Rim',(1,3,3),650,2),('Strip',(-1,-3,4),180,0.7)]:
    light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size_light
    obj=bpy.data.objects.new(name,light);scene.collection.objects.link(obj);obj.location=position
    obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.cameras.new('Product camera');obj=bpy.data.objects.new('Product camera',camera);scene.collection.objects.link(obj)
obj.location=(3,-5,2.6);obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler();camera.type='ORTHO';camera.ortho_scale=3.1;scene.camera=obj
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.filepath=str(folder/'poster.png')
bpy.ops.render.render(write_still=True)
result={'components':components,'triangleCount':triangles,'sourceBounds':list(size),'declaredUnits':job['units'],'physicalScaleVerified':False,'manufacturingReady':False,'limitations':limitations,'previewSha256':hashlib.sha256((folder/'preview.glb').read_bytes()).hexdigest(),'posterSha256':hashlib.sha256((folder/'poster.png').read_bytes()).hexdigest()}
(folder/'result.json').write_text(json.dumps(result,indent=2))
