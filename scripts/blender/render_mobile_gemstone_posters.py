"""Render revision 4 fallback posters from the editable source scenes."""
import bpy,json,sys,math
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'.ames-cad/mobile-optics/posters';OUT.mkdir(parents=True,exist_ok=True)
registry=json.loads((ROOT/'src/lib/gemstone-registry.json').read_text(encoding='utf-8'))
only=set(sys.argv[sys.argv.index('--')+1:]) if '--' in sys.argv else set()
for stone in registry:
    if not stone['form'].startswith('faceted') or (only and stone['id'] not in only):continue
    sid=stone['id']
    scene_path=ROOT/f'source-assets/gemstones/{sid}.blend'
    if (OUT/f'{sid}.png').exists() and (OUT/f'{sid}.png').stat().st_mtime>=scene_path.stat().st_mtime:continue
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/f'source-assets/gemstones/{sid}.blend'))
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
    scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    objects=[o for o in scene.objects if o.type=='MESH' and o.get('ames_gemstone_id')==sid]
    corners=[o.matrix_world@Vector(p) for o in objects for p in o.bound_box]
    lower=Vector(tuple(min(p[i] for p in corners) for i in range(3)))
    upper=Vector(tuple(max(p[i] for p in corners) for i in range(3)))
    target=(lower+upper)*.5
    camera=scene.camera;camera.data.type='PERSP';camera.data.lens=85;camera.data.sensor_width=36
    distance=max(upper-lower)/(2*math.tan(math.atan(36/(2*85)))*.78)
    phi,theta=math.radians(7),math.radians(30)
    camera.location=target+Vector((distance*math.sin(phi)*math.sin(theta),-distance*math.sin(phi)*math.cos(theta),distance*math.cos(phi)))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    hdr=ROOT/'source-assets/environments/studio_small_09_1k.hdr'
    if hdr.exists():
        world=scene.world;world.use_nodes=True
        background=next((n for n in world.node_tree.nodes if n.type=='BACKGROUND'),None)
        if background:
            image_node=world.node_tree.nodes.new('ShaderNodeTexEnvironment');image_node.image=bpy.data.images.load(str(hdr),check_existing=True)
            image_node.image.filepath='//../environments/studio_small_09_1k.hdr'
            world.node_tree.links.new(image_node.outputs['Color'],background.inputs['Color']);background.inputs['Strength'].default_value=.35
    bpy.ops.wm.save_as_mainfile(filepath=str(scene_path))
    scene.render.filepath=str(OUT/f'{sid}.png');bpy.ops.render.render(write_still=True)
    print(f'AMES_POSTER {sid}',flush=True)
