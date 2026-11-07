"""Original interactive interpretation of the user's solitaire photograph.
Run in a separate background Blender process; dimensions are design inputs only.
"""
import bpy,bmesh,math,json,hashlib,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
ID='demo-pave-solitaire'
OUT=ROOT/'public/ames-engine'/ID
SOURCE=ROOT/'source-assets/pave-solitaire/revision-2'
for p in [OUT/'web',OUT/'app',SOURCE]:p.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
scene.unit_settings.scale_length=1
def material(name,color,metal,rough,transmission=0,ior=1.5):
 m=bpy.data.materials.new(name);m.use_nodes=True
 s=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 for k,v in {'Base Color':(*color,1),'Metallic':metal,'Roughness':rough,'Transmission Weight':transmission,'IOR':ior}.items():s.inputs[k].default_value=v
 return m
metal=material('Platinum tone | visual study',(.78,.83,.9),1,.15)
diamond=material('Diamond | closed dielectric',(.99,.995,1),0,.012,1,2.417)
objects=[]
def mesh(name,verts,faces,mat,smooth=False):
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
 bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
 o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);data.materials.append(mat)
 for p in data.polygons:p.use_smooth=smooth
 objects.append(o);return o
def tube(name,points,radius,steps=10):
 verts=[]
 for i,p in enumerate(points):
  p=Vector(p);t=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
  t.normalize();ref=Vector((0,1,0)) if abs(t.y)<.9 else Vector((1,0,0));u=t.cross(ref).normalized();v=t.cross(u)
  for j in range(steps):verts.append(tuple(p+radius*(u*math.cos(j*math.tau/steps)+v*math.sin(j*math.tau/steps))))
 faces=[]
 for i in range(len(points)-1):
  for j in range(steps):a=i*steps+j;b=i*steps+(j+1)%steps;faces.append((a,b,b+steps,a+steps))
 faces.extend([tuple(reversed(range(steps))),tuple((len(points)-1)*steps+j for j in range(steps))])
 return mesh(name,verts,faces,metal,True)
# A single slim rounded shank, with gently swept shoulders below the central basket.
verts=[];faces=[];N=192;S=12
for i in range(N):
 a=i*math.tau/N;radial=Vector((math.sin(a),0,math.cos(a)))
 center=radial*.0093+Vector((0,.00065*math.sin(2*a)*max(math.cos(a),0),0))
 width=.00095;thickness=.00062
 for j in range(S):
  b=j*math.tau/S;verts.append(tuple(center+radial*(thickness*math.cos(b))+Vector((0,width*math.sin(b),0))))
for i in range(N):
 for j in range(S):faces.append((i*S+j,i*S+(j+1)%S,((i+1)%N)*S+(j+1)%S,((i+1)%N)*S+j))
mesh('Polished single shank',verts,faces,metal,True)
# A closed faceted round brilliant, shared for the center and the pavé stones.
def gem(name,radius,location,normal):
 n=16;v=[]
 for r,h,offset in [(.018,-.62,0),(1,-.015,0),(1,.015,0),(.78,.17,.5),(.53,.34,0)]:
  for i in range(n):a=(i+offset)*math.tau/n;v.append((radius*r*math.cos(a),radius*r*math.sin(a),radius*h))
 bm=bmesh.new()
 for p in v:bm.verts.new(p)
 result=bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
 discard=list(set(result.get('geom_interior',[])+result.get('geom_unused',[])))
 if discard:bmesh.ops.delete(bm,geom=discard,context='VERTS')
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 assert all(e.is_manifold for e in bm.edges)
 data=bpy.data.meshes.new(name);bm.to_mesh(data);bm.free()
 o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);data.materials.append(diamond)
 o.location=location;o.rotation_euler=Vector(normal).to_track_quat('Z','Y').to_euler()
 o['ames_optical_mode']='closed-dielectric-visual';o['ames_gemstone_id']='stone-diamond'
 objects.append(o);return o
gem('Solitaire diamond',.00345,(0,0,.0122),(0,0,1))
# Four delicate basket supports and rounded claws, leaving the pavilion visible.
for i in range(4):
 a=math.pi/4+i*math.pi/2;c,s=math.cos(a),math.sin(a)
 tube('Basket claw %d'%i,[(.0016*c,.0016*s,.0093),(.00255*c,.00255*s,.0107),(.00345*c,.00345*s,.01225),(.00312*c,.00312*s,.01265)],.00022)
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=.00024,location=(.00312*c,.00312*s,.01265))
 o=bpy.context.object;o.name='Rounded claw tip';o.data.materials.append(metal)
 for f in o.data.polygons:f.use_smooth=True
 objects.append(o)
tube('Open gallery rail',[(.0025*math.cos(i*math.tau/64),.0025*math.sin(i*math.tau/64),.0106) for i in range(65)],.00018)
# Shoulder pave, revision 2: larger 1.12 mm melee raised so the crown and girdle sit proud of
# the band, held by shared claws, running from the head down past the sides of the ring so
# the row of diamonds reads from the side as well as from above.
PAVE_R=.000565;PAVE_SEAT=.00998;STEP=.1225;COUNT=11;START=.455
def shoulder(a):
 radial=Vector((math.sin(a),0,math.cos(a)));return radial,Vector((0,.00065*math.sin(2*a)*max(math.cos(a),0),0))
for side in [-1,1]:
 for j in range(COUNT):
  a=side*(START+j*STEP);radial,lift=shoulder(a)
  gem('Pave diamond %s %02d'%(side,j),PAVE_R,radial*PAVE_SEAT+lift,radial)
 for j in range(COUNT+1):
  a=side*(START+(j-.5)*STEP);radial,lift=shoulder(a)
  for off in [-1,1]:
   bpy.ops.mesh.primitive_uv_sphere_add(segments=10,ring_count=8,radius=.00017,location=radial*.00995+lift+Vector((0,off*.00047,0)))
   o=bpy.context.object;o.name='Pave claw';o.data.materials.append(metal)
   for f in o.data.polygons:f.use_smooth=True
   objects.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
glb=OUT/'web/solitaire-v2.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.cycles.max_bounces=16;scene.cycles.transmission_bounces=12
scene.render.threads_mode='FIXED';scene.render.threads=2
scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='AgX'
world=bpy.data.worlds.new('Jewelry studio');world.use_nodes=True;scene.world=world
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
env=world.node_tree.nodes.new('ShaderNodeTexEnvironment');env.image=bpy.data.images.load(str(ROOT/'source-assets/environments/studio_small_09_1k.hdr'))
world.node_tree.links.new(env.outputs['Color'],bg.inputs['Color']);bg.inputs['Strength'].default_value=.65
target=Vector((0,0,.0015))
for name,loc,power,size in [('Key',(.02,-.025,.045),.12,.025),('Rim',(-.03,.012,.025),.08,.02)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size
 o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Solitaire portrait');o=bpy.data.objects.new('Solitaire portrait',d);scene.collection.objects.link(o);scene.camera=o
o.location=(.032,-.052,.029);o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=.029;d.clip_start=.0001
scene.render.filepath=str(OUT/'web/poster-v2.png')
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'solitaire-v2.blend'))
(SOURCE/'provenance.json').write_text(json.dumps({'assetId':ID,'modelSha256':hashlib.sha256(glb.read_bytes()).hexdigest(),'source':'Original geometry interpreting the supplied solitaire photograph','hiddenGeometry':'Authored interpretation, not measured','manufacturingReady':False,'physicalScaleConfirmed':False},indent=2),encoding='utf-8')
if '--skip-render' not in sys.argv:bpy.ops.render.render(write_still=True)
print('SOLITAIRE_COMPLETE',flush=True)
