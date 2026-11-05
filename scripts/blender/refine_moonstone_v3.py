"""Original high-dome moonstone study; preserve the earlier source and GLB."""
import bpy,bmesh,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'source-assets/gemstones/stone-moonstone.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('ames_gemstone_id')=='stone-moonstone']
if len(objects)!=1:raise RuntimeError('Expected one original moonstone mesh.')
obj=objects[0]
for vertex in obj.data.vertices:
    if vertex.co.z>-.12:vertex.co.z=-.12+(vertex.co.z+.12)*1.65
bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
if any(not e.is_manifold for e in bm.edges):raise RuntimeError('Moonstone must remain closed.')
bm.to_mesh(obj.data);bm.free();obj.data.update()
for polygon in obj.data.polygons:polygon.use_smooth=True
obj['ames_shape_revision']=3
obj['ames_cabochon_base_fraction']=.12/.912
obj['ames_visual_approximation']='Original high-dome study; not measured inventory.'
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/ames-engine/stone-moonstone/web/jewelry-v3.glb'),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_animations=False,export_lights=False,export_cameras=False)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'source-assets/gemstones/stone-moonstone-v3.blend'))
for name in ['asset','chat']:
    p=ROOT/f'public/ames-engine/stone-moonstone/app/{name}.json';d=json.loads(p.read_text())
    d['revisionId']='stone-moonstone:3'
    if name=='chat':d['stageAsset']='web/jewelry-v3.glb'
    else:
        d['representativeCut']='high-dome oval cabochon'
        d['interactive']['glb']='web/jewelry-v3.glb'
        d['source']['editableScene']='source-assets/gemstones/stone-moonstone-v3.blend'
        d['source']['refinementGenerator']='scripts/blender/refine_moonstone_v3.py'
        d['limitations'][0]='Representative high-dome translucent cabochon with illustrative internal refraction and moving blue sheen.'
        d['limitations'][1]='The sheen is an angular visual approximation, not a microscopic feldspar diffraction simulation.'
    p.write_text(json.dumps(d,indent=2)+'\n')
print('AMES_MOONSTONE_V3_EXPORTED',flush=True)
