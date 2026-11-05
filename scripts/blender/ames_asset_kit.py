"""Reusable, opt-in studio/export kit. Run only on trusted local source scenes.

blender --background trusted-source.blend --python scripts/blender/ames_asset_kit.py -- brief.json NEW_OUTPUT_DIRECTORY
No shape is invented, no existing pack is overwritten, and no product is published.
"""
import bpy, json, math, sys, hashlib
from pathlib import Path
from mathutils import Vector

STANDARD=json.loads((Path(__file__).resolve().parents[2]/'standards/ames-visual-standard.v1.json').read_text(encoding='utf-8-sig'))

def rgba(hex_color):
    values=[int(hex_color[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values)+(1,)

def make_material(component):
    preset=STANDARD['materials'][component['materialPreset']]
    material=bpy.data.materials.new('AMES__'+component['id']+'__'+component['materialPreset'])
    material.use_nodes=True; nodes=material.node_tree.nodes; bsdf=nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=rgba(component.get('color') or preset['defaultColor'])
    for name,value in [('Metallic',preset['metallic']),('Roughness',preset['roughness']),('IOR',preset['ior']),('Transmission Weight',preset['transmission'])]:
        bsdf.inputs[name].default_value=value
    if preset.get('absorptionDensityPerMetre'):
        volume=nodes.new('ShaderNodeVolumeAbsorption')
        volume.inputs['Color'].default_value=rgba(component.get('color') or preset['defaultColor'])
        volume.inputs['Density'].default_value=preset['absorptionDensityPerMetre']
        material.node_tree.links.new(volume.outputs['Volume'],nodes.get('Material Output').inputs['Volume'])
        # Colour depth comes from an explicitly approximate volume, not only a tinted surface.
        bsdf.inputs['Base Color'].default_value=(.98,.98,.98,1)
    if preset['family']=='metal':
        finish=STANDARD['finishes'][component['finish']]
        bsdf.inputs['Roughness'].default_value=finish['roughness']
        anisotropy=bsdf.inputs.get('Anisotropic IOR Level') or bsdf.inputs.get('Anisotropic')
        if anisotropy is not None:anisotropy.default_value=finish['anisotropy']
        elif finish['anisotropy']:raise ValueError('This Blender version has no supported anisotropy input; preserve the supplied finish material.')
        if component['finish'] in ('brushed','hammered','engraved'):
            raise ValueError('Preserve supplied material/geometry for '+component['finish']+'; generic roughness cannot create this finish.')
    if component['role']=='pearl':
        bsdf.inputs['Coat Weight'].default_value=.22; bsdf.inputs['Coat Roughness'].default_value=.22
        bsdf.inputs['Subsurface Weight'].default_value=.06
    # No rainbow texture, emission, glitter or invented inclusions. Opal is explicitly approximate.
    return material

def aim(obj,target):obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()

def run(brief_path,output,*,samples=48,resolution=768):
    brief=json.loads(brief_path.read_text(encoding='utf-8-sig'))
    if brief.get('schemaVersion')!='ames.asset-brief/1' or brief.get('deliverable')!='interactive-3d':raise ValueError('This kit exports interactive 3D briefs only. Validate the brief with asset-system.mjs first.')
    if output.exists():raise ValueError('Output directory already exists. Choose a new review revision.')
    if not brief['product']['dimensionsMm'] or not brief['product']['scaleEvidence']:raise ValueError('Supply XYZ dimensions in mm and source scale evidence. No automatic size inference.')
    scene=bpy.context.scene
    if scene.unit_settings.system!='METRIC' or scene.unit_settings.scale_length!=1:raise ValueError('Set the trusted source scene to metres (METRIC, scale_length=1); use actual metre geometry. Do not merely relabel millimetres.')
    parts=[]
    for c in brief['components']:
        obj=bpy.data.objects.get(c['nodeName'])
        if not obj or obj.type!='MESH':raise ValueError('Missing exact mesh object: '+c['nodeName'])
        if c['materialPreset']!='preserve-source':
            material=make_material(c); obj.data=obj.data.copy();obj.data.materials.clear();obj.data.materials.append(material)
            for polygon in obj.data.polygons:polygon.material_index=0
        elif not obj.data.materials or any(m is None for m in obj.data.materials):raise ValueError('Source material assignment is incomplete: '+obj.name)
        if c['surface']=='faceted':
            for polygon in obj.data.polygons:polygon.use_smooth=False
        obj['ames_component_id']=c['id'];obj['ames_material_intent']=c['materialPreset'];parts.append(obj)
    if not parts:raise ValueError('Supply explicit component/material assignments.')
    supplied={o.name for o in scene.objects if o.type=='MESH'}
    if supplied!={o.name for o in parts}:raise ValueError('Record every source mesh in the brief; do not silently omit components.')
    points=[o.matrix_world@Vector(c) for o in parts for c in o.bound_box]
    low=Vector(tuple(min(p[i] for p in points) for i in range(3)));high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    size=high-low; expected=brief['product']['dimensionsMm']
    if any(abs(size[i]*1000-expected[i])>max(.05,expected[i]*.02) for i in range(3)):raise ValueError('Source world dimensions disagree with the brief. Check actual geometry units and assembly transforms.')
    output.mkdir(parents=True); bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.export_scene.gltf(filepath=str(output/'model.glb'),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
    # glTF Y-up maps Blender XYZ to XZY; record the export-space dimensions explicitly.
    delivery_brief=json.loads(json.dumps(brief));delivery_brief['product']['dimensionsMm']=[expected[0],expected[2],expected[1]]
    (output/'brief.json').write_text(json.dumps(delivery_brief,indent=2))
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'source.blend'))
    for obj in scene.objects:
        if obj.type in ('LIGHT','CAMERA'):obj.hide_render=True
    center=(low+high)/2; extent=max(size); distance=extent*4
    scene.render.engine='CYCLES';scene.cycles.samples=max(8,min(512,samples));scene.cycles.use_denoising=True;scene.cycles.max_bounces=16;scene.cycles.transmission_bounces=12;scene.cycles.glossy_bounces=8
    scene.render.resolution_x=max(256,min(2048,resolution));scene.render.resolution_y=scene.render.resolution_x;scene.render.resolution_percentage=100
    scene.render.film_transparent=brief['background']=='transparent';scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.world=bpy.data.worlds.new('AMES studio world');scene.world.use_nodes=True
    world_nodes=scene.world.node_tree.nodes;world_links=scene.world.node_tree.links;environment=world_nodes.get('Background');environment.inputs['Strength'].default_value=.5;environment.inputs['Color'].default_value=(.65,.65,.65,1)
    hdr=Path(__file__).resolve().parents[2]/'public/ames-engine/environments/studio-small-09-v1/studio.hdr'
    environment_record={'source':'neutral fallback','sha256':None}
    if hdr.exists():
        texture=world_nodes.new('ShaderNodeTexEnvironment');texture.image=bpy.data.images.load(str(hdr),check_existing=True);texture.image.pack();world_links.new(texture.outputs['Color'],environment.inputs['Color'])
        environment_record={'source':'Studio Small 09 · Sergej Majboroda / Poly Haven','license':'CC0','url':'https://polyhaven.com/a/studio_small_09','sha256':hashlib.sha256(hdr.read_bytes()).hexdigest()}
    # The camera backdrop does not tint the illumination or change material identity.
    backdrop=world_nodes.new('ShaderNodeBackground');backdrop.inputs['Color'].default_value=rgba(STANDARD['palette'].get(brief['background'],'#20211F'));backdrop.inputs['Strength'].default_value=1
    path=world_nodes.new('ShaderNodeLightPath');mix=world_nodes.new('ShaderNodeMixShader');world_links.new(path.outputs['Is Camera Ray'],mix.inputs[0]);world_links.new(environment.outputs['Background'],mix.inputs[1]);world_links.new(backdrop.outputs['Background'],mix.inputs[2]);world_links.new(mix.outputs[0],world_nodes.get('World Output').inputs['Surface'])
    for name,position,power,width in [('Key',(2,-3,3),650,2.5),('Fill',(-3,-1,1),180,3),('Rim',(1,3,2),700,1.5)]:
        data=bpy.data.lights.new('AMES '+name,'AREA');data.energy=power;data.shape='RECTANGLE';data.size=width*extent;data.size_y=extent*.8
        # Power scales with studio size, preserving an approximately consistent incident intensity.
        data.energy*=extent*extent
        obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=center+Vector(position)*extent;aim(obj,center)
    camera=bpy.data.cameras.new('AMES inspection camera');cam=bpy.data.objects.new(camera.name,camera);scene.collection.objects.link(cam);scene.camera=cam;camera.type='ORTHO';camera.ortho_scale=extent*1.55;camera.clip_start=max(.00001,extent/1000);camera.clip_end=distance*10;camera.dof.use_dof=False
    angles={'front':(0,-1,.1),'three-quarter':(1,-1,.65),'side':(1,0,.1),'back':(0,1,.1),'underside':(0,-.1,-1),'macro':(.5,-1,.6)}
    if brief['product']['category'].startswith('loose-'):
        angles.update({'front':(0,-.25,1),'three-quarter':(.6,-.6,1),'back':(0,.25,1),'macro':(.3,-.2,1)})
    for view in brief['views']:
        print('AMES: rendering '+view,flush=True)
        cam.location=center+Vector(angles[view]).normalized()*distance;aim(cam,center);camera.ortho_scale=extent*(.8 if view=='macro' else 1.55)
        scene.render.filepath=str(output/(view+'.png'));bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output/'studio.blend'))
    sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
    manifest={'schemaVersion':'ames.asset-build/1','assetId':brief['assetId'],'revision':brief['revision'],'sourceBriefSha256':sha(brief_path),'standardSha256':sha(Path(__file__).resolve().parents[2]/'standards/ames-visual-standard.v1.json'),'modelSha256':sha(output/'model.glb'),'files':{p.name:sha(p) for p in output.iterdir() if p.is_file()},'sourceDimensionsAxes':'Blender XYZ metres','exportDimensionsAxes':'glTF XYZ metres (source XZY)','renderSamples':scene.cycles.samples,'renderResolution':scene.render.resolution_x,'inspectionDepthOfField':False,'manufacturingCertified':False,'publicationApproved':False,'limitations':STANDARD['limitations']+['Opal play-of-colour, spectral dispersion and birefringence are not implemented by this RGB material kit.','Metal colours, pearl lustre and gemstone body colours are approximate starting points, not measured product properties.']}
    manifest['environment']=environment_record
    manifest['target']=brief['target'];manifest['deviceBudget']=brief['budget'];manifest['lods']=[{'tier':brief['budget'],'file':'model.glb','sha256':manifest['modelSha256']}]
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2))

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:];run(Path(args[0]).resolve(),Path(args[1]).resolve())
