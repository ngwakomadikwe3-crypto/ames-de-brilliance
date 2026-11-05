"""Refine AMES original faceted cuts; preserve revision 2 source and export revision 4.
Run Blender --background --python scripts/blender/refine_mobile_gemstones.py [-- stone-id ...].
No third-party geometry or textures are used. Ring and non-faceted assets are untouched.
"""
import bpy
import bmesh
import json
import math
import shutil
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'public/ames-engine'
SOURCE = ROOT / 'source-assets/gemstones'
REGISTRY = json.loads((ROOT / 'src/lib/gemstone-registry.json').read_text(encoding='utf-8'))

def shape(cut, a):
    c, s = math.cos(a), math.sin(a)
    if cut == 'radiant': return math.copysign(abs(c)**.3,c), math.copysign(abs(s)**.3,s)*1.06
    if cut == 'cushion': return math.copysign(abs(c)**.68,c), math.copysign(abs(s)**.68,s)
    if cut == 'oval': return c,s*1.28
    if cut == 'pear': return c*(.78-.25*s),s*1.28
    if cut == 'trillion':
        r=.82+.18*math.cos(3*(a-math.pi/2));return r*c,r*s
    return c,s

def refined_points(obj, cut, ior):
    if 'emerald' in cut:
        clip,yscale=.26,(1.3 if 'elongated' in cut else 1.06)
        outline=[(-1+clip,-1),(1-clip,-1),(1,-1+clip),(1,1-clip),(1-clip,1),(-1+clip,1),(-1,1-clip),(-1,-1+clip)]
        critical=math.asin(1/max(1.01,ior))
        inner=max(math.radians(42),critical+math.radians(6))
        outer=inner+math.radians(3);middle=inner+math.radians(1.5)
        z_outer=-.025-.26*math.tan(outer)
        z_middle=z_outer-.29*math.tan(middle)
        z_culet=z_middle-.415*math.tan(inner)
        levels=[(.035,z_culet),(.45,z_middle),(.74,z_outer),(1,-.025),(1,.025),(.86,.18),(.72,.31),(.58,.43)]
        return [(x*r,y*r*yscale,z) for r,z in levels for x,y in outline]
    points=[tuple(v.co) for v in obj.data.vertices]
    critical=math.asin(1/max(1.01,ior))
    pavilion=max(math.radians(40.9),critical+math.radians(5))
    radial_extent=max(math.hypot(x,y) for x,y,z in points)
    depth_scale=math.tan(pavilion)*radial_extent/math.tan(math.radians(40.9))
    points=[(x,y,-.0175+(z+.0175)*depth_scale if z<-.0175 else z) for x,y,z in points]
    # Preserve the original crown/star/pavilion proportions, refine the girdle silhouette.
    for i in range(32):
        x,y=shape(cut,math.tau*i/32)
        points.extend([(x,y,.0175),(x,y,-.0175)])
    return points

def main():
    only=set(sys.argv[sys.argv.index('--')+1:]) if '--' in sys.argv else set()
    for stone in REGISTRY:
        if not stone['form'].startswith('faceted') or (only and stone['id'] not in only):continue
        sid=stone['id'];folder=PUBLIC/sid; source=SOURCE/f'{sid}.blend';backup=SOURCE/'revision-2'
        backup.mkdir(parents=True,exist_ok=True)
        for old,target in [(source,backup/f'{sid}.blend'),(folder/'web/jewelry.glb',backup/f'{sid}.glb')]:
            if not target.exists():shutil.copy2(old,target)
        bpy.ops.wm.open_mainfile(filepath=str(backup/f'{sid}.blend'))
        objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('ames_gemstone_id')==sid]
        if len(objects)!=1:raise RuntimeError(f'Expected one gem mesh: {sid}')
        obj=objects[0];original_materials=list(obj.data.materials)
        bsdf=next((n for n in original_materials[0].node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
        ior=float(bsdf.inputs['IOR'].default_value) if bsdf else 1.6
        bm=bmesh.new()
        for point in refined_points(obj,stone['cut'],ior):bm.verts.new(point)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
        result=bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
        discarded=list(set(result.get('geom_interior',[])+result.get('geom_unused',[])))
        if discarded:bmesh.ops.delete(bm,geom=discarded,context='VERTS')
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        # Elongated and clipped outlines change actual facet slopes. Measure the
        # finished hull, then deepen its pavilion to retain the optical margin.
        slopes=[math.hypot(f.normal.x,f.normal.y)/-f.normal.z for f in bm.faces
                if f.normal.z<-.01 and math.hypot(f.normal.x,f.normal.y)>.01]
        target=math.tan(math.asin(1/ior)+math.radians(5))
        if slopes and min(slopes)<target:
            factor=target/min(slopes)
            girdle=-.025 if 'emerald' in stone['cut'] else -.0175
            for v in bm.verts:
                if v.co.z<girdle:v.co.z=girdle+(v.co.z-girdle)*factor
            bm.normal_update()
        if any(not e.is_manifold for e in bm.edges):raise RuntimeError(f'Open cut: {sid}')
        mesh=bpy.data.meshes.new(f'{stone["name"]} refined convex cut');bm.to_mesh(mesh);bm.free();mesh.update()
        obj.data=mesh
        for material in original_materials:mesh.materials.append(material)
        for face in mesh.polygons:
            face.use_smooth=False
            if len(original_materials)>1:face.material_index=1 if face.center.x>0 else 0
        calibrated={'stone-ruby':'d71d42','stone-emerald':'15945e','stone-sapphire':'2453d4','stone-garnet':'b52339'}
        if sid in calibrated:
            rgb=[int(calibrated[sid][i:i+2],16)/255 for i in (0,2,4)]
            linear=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb]+[1]
            for material in original_materials:
                material.diffuse_color=linear
                if material.use_nodes:
                    bsdf=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
                    if bsdf:bsdf.inputs['Base Color'].default_value=linear
        obj['ames_cut_revision']=4;obj['ames_mobile_optics']='convex-facet-volume'
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.export_scene.gltf(filepath=str(folder/'web/jewelry.glb'),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(source))
        for path in (folder/'app').glob('*.json'):
            contract=json.loads(path.read_text(encoding='utf-8'))
            if contract.get('assetId')==sid and 'revisionId' in contract:
                contract['revisionId']=f'{sid}:4'
                if path.name=='asset.json':contract.setdefault('source',{})['refinementGenerator']='scripts/blender/refine_mobile_gemstones.py'
                path.write_text(json.dumps(contract,indent=2)+'\n',encoding='utf-8')
        print(f'AMES_REFINED {sid} {len(mesh.vertices)} vertices {len(mesh.polygons)} faces',flush=True)
    sources=PUBLIC/'gemstone-quality.json'
    manifest=json.loads(sources.read_text(encoding='utf-8')) if sources.exists() else {'schemaVersion':'ames.gemstone-quality/1','license':'AMES original geometry','assets':[{'assetId':s['id'],'revisionId':f"{s['id']}:2"} for s in REGISTRY]}
    for entry in manifest['assets']:
        contract=json.loads((PUBLIC/entry['assetId']/'app/asset.json').read_text(encoding='utf-8'))
        if contract['revisionId'].endswith(':4'):
            entry.update(revisionId=contract['revisionId'],origin='Original convex cuts with IOR-aware pavilion depth and a small step-cut culet',generator='scripts/blender/refine_mobile_gemstones.py',previousRevision=f'source-assets/gemstones/revision-3/{entry["assetId"]}.glb')
    sources.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':main()
