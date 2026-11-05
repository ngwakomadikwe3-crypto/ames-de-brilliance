"""Non-commercial pipeline calibration. Does not modify any customer asset."""
import bpy,json,sys,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
import runpy

project,root=map(lambda s:Path(s).resolve(),sys.argv[sys.argv.index('--')+1:])
root.mkdir(parents=True,exist_ok=False)
source=project/'public/ames-engine/stone-diamond/web/jewelry.glb'
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
if len(objects)!=1:raise ValueError('Calibration expects the single AMES educational diamond mesh.')
obj=objects[0];obj.data=obj.data.copy();obj.data.transform(obj.matrix_world);obj.parent=None;obj.matrix_world=Matrix.Identity(4)
low=Vector(tuple(min(v.co[i] for v in obj.data.vertices) for i in range(3)));high=Vector(tuple(max(v.co[i] for v in obj.data.vertices) for i in range(3)))
center=(low+high)/2;factor=.0065/(high.x-low.x)
for v in obj.data.vertices:v.co=(v.co-center)*factor
obj.name='Calibration_Diamond';obj.data.update();bpy.context.view_layer.update()
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
dimensions=list(obj.dimensions*1000)
standard=json.loads((project/'standards/ames-visual-standard.v1.json').read_text(encoding='utf-8-sig'))
brief={'schemaVersion':'ames.asset-brief/1','assetId':'ames-calibration-diamond-study','revision':1,'reviewedModelSha256':None,'product':{'name':'AMES optical calibration study — not stock','category':'loose-diamond','description':'Existing AMES educational cut, deliberately scaled to 6.5 mm width to exercise the production tools. Not a new verified jewellery product.','references':[{'id':'ames-educational-source','description':'Preserved AMES educational diamond GLB','source':'public/ames-engine/stone-diamond/web/jewelry.glb','sha256':hashlib.sha256(source.read_bytes()).hexdigest()}],'dimensionsMm':dimensions,'scaleEvidence':'The calibration author chose 6.5 mm width as a design input. These are not measured commercial stone specifications.','metalAndFinish':'No metal.','mainGemstone':'Educational diamond-like faceted volume. No carat, grade, origin, treatment or clarity claim.','additionalStones':'None in this calibration.','construction':'One loose educational stone; no setting or manufacturing claim.'},'deliverable':'interactive-3d','target':'ames-mobile','budget':'mobile-safe','background':'transparent','components':[{'id':'calibration-diamond','nodeName':'Calibration_Diamond','role':'gemstone','surface':'faceted','materialPreset':'preserve-source','finish':'polished','color':None,'evidenceIds':['ames-educational-source']}],'requestedEffects':[],'views':standard['requiredViews'],'assumptions':['6.5 mm is an explicit calibration design choice, not a supplied product measurement.','RGB refraction is approximate and does not include spectral dispersion.'],'reviews':[{'check':c,'status':'pending','reviewer':'','evidence':''} for c in standard['reviewChecks']]}
brief_path=root/'source-brief.json';brief_path.write_text(json.dumps(brief,indent=2))
kit=runpy.run_path(str(project/'scripts/blender/ames_asset_kit.py'),run_name='ames_asset_kit')
for key,preset in standard['materials'].items():
    role={'metal':'metal','faceted-dielectric':'gemstone','layered-lustre':'pearl','cabochon-diffraction':'opal'}[preset['family']]
    kit['make_material']({'id':'test-'+key,'materialPreset':key,'role':role,'finish':'polished','color':None})
kit['run'](brief_path,root/'delivery',samples=12,resolution=384)
