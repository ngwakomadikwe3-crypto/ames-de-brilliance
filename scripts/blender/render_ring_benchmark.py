"""Reproducible Cycles reference for the existing ring GLB, without synthetic sparkle.
blender -b -t 4 --python scripts/blender/render_ring_benchmark.py -- [samples] [size]
"""
import bpy, math, sys, json, hashlib, bmesh
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'public/ames-engine/demo-pave-solitaire/web/solitaire-v3.glb'
OUT=ROOT/'source-assets/pave-solitaire/benchmark';OUT.mkdir(parents=True,exist_ok=True)
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
samples=int(args[0]) if args else 512
size=int(args[1]) if len(args)>1 else 800
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
scene=bpy.context.scene
meshes=[o for o in scene.objects if o.type=='MESH']
points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
lo=Vector(tuple(min(v[k] for v in points) for k in range(3)))
hi=Vector(tuple(max(v[k] for v in points) for k in range(3)))
center=(lo+hi)/2;scale=2.6/max(hi-lo)
# Preserve the original source hierarchy and pose under one display-only transform.
root=bpy.data.objects.new('Display fitting (source units retained)',None);scene.collection.objects.link(root)
for o in list(scene.objects):
    if o!=root and not o.parent:o.parent=root
root.scale=(scale,)*3;root.location=-center*scale
bpy.context.view_layer.update()
report=[];material_cache={}
for o in meshes:
    gem=o.get('ames_optical_mode')=='closed-dielectric-visual'
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-8)
    closed=all(e.is_manifold for e in bm.edges)
    bm.free()
    if gem:
        report.append({'name':o.name,'closed':closed,'triangles':sum(len(p.vertices)-2 for p in o.data.polygons)})
        for f in o.data.polygons:f.use_smooth=False
    for slot in o.material_slots:
        original=slot.material
        if not original:continue
        key='diamond' if gem else original.name
        if key not in material_cache:
            mat=bpy.data.materials.new('Benchmark '+key);mat.use_nodes=True
            nodes=mat.node_tree.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputMaterial')
            if gem:
                shader=nodes.new('ShaderNodeBsdfGlass');shader.inputs['Color'].default_value=(1,1,1,1)
                shader.inputs['IOR'].default_value=2.417;shader.inputs['Roughness'].default_value=.003
            else:
                shader=nodes.new('ShaderNodeBsdfPrincipled');shader.inputs['Base Color'].default_value=(.78,.77,.75,1)
                shader.inputs['Metallic'].default_value=1;shader.inputs['Roughness'].default_value=.12
            mat.node_tree.links.new(shader.outputs[0],out.inputs['Surface']);material_cache[key]=mat
        slot.material=material_cache[key]
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=samples
scene.cycles.use_denoising=False # This runtime's Blender build has no OIDN.
scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.008
scene.cycles.max_bounces=32;scene.cycles.transmission_bounces=24;scene.cycles.glossy_bounces=16
scene.cycles.sample_clamp_indirect=8
scene.render.resolution_x=scene.render.resolution_y=size;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
world=bpy.data.worlds.new('Neutral studio');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(1,1,1,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.22
# Real area lights, visible to every ray type. No emissive dots, star overlays or gemstone-only room.
for name,pos,energy,width,height in [('Key',(-3,-4,4),450,4,2),('Strip',(3,-1,3),320,1,4),('Rim',(0,4,3),500,3,2)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='RECTANGLE';data.size=width;data.size_y=height
    light=bpy.data.objects.new(name,data);scene.collection.objects.link(light);light.location=pos
    light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,(lo.z-center.z)*scale-.015))
floor=bpy.context.object;floor.name='Matte studio floor'
mat=bpy.data.materials.new('Warm grey');mat.use_nodes=True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.24,.26,.25,1)
mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.75;floor.data.materials.append(mat)
data=bpy.data.cameras.new('85 mm reference');camera=bpy.data.objects.new('85 mm reference',data);scene.collection.objects.link(camera)
camera.location=(3,-5,7);camera.rotation_euler=(Vector((0,0,.3))-camera.location).to_track_quat('-Z','Y').to_euler()
data.lens=75;scene.camera=camera
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'ring-reference.png')
(OUT/'inspection.json').write_text(json.dumps({'source':str(SOURCE.relative_to(ROOT)),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'gemstones':report,'samples':samples,'resolution':size,'visualApproval':'pending','notes':'Source geometry retained. Benchmark isolates lighting and materials.'},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'ring-studio.blend'),compress=True)
bpy.ops.render.render(write_still=True)
