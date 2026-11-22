"""Render the portrait head front-on (orthographic) so MediaPipe can find its own landmarks on it.

The pixel grid maps linearly to the head (x across, z up, Blender units): the head builder casts each landmark found
on this render straight back onto the mesh. Writes <out>.png and <out>.json (the ortho mapping).
Run:  python scripts/blender/render_head_for_landmarks.py <portrait-head-v2.glb> <out-prefix>      (bpy module)
"""
import json, math, sys
import bpy
GLB, OUT = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
scene = bpy.context.scene
for o in scene.objects:
    if o.type != 'MESH': continue
    me = o.data; col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    if o.name.startswith('Eye'):
        import mathutils
        c = sum((v.co for v in me.vertices), mathutils.Vector()) / len(me.vertices)
        for v in me.vertices:
            d = (v.co - c).normalized(); a = math.degrees(math.acos(max(-1, min(1, -d.y))))
            col.data[v.index].color = (0.02, 0.015, 0.012, 1) if a < 6 else (0.25, 0.14, 0.07, 1) if a < 16 else (0.9, 0.88, 0.85, 1)
    else:
        for i in range(len(me.vertices)): col.data[i].color = (0.78, 0.55, 0.42, 1)
    if o.name.startswith(('Teeth', 'Tongue')): o.hide_render = True
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'VERTEX'
scene.display.shading.show_cavity = True
scene.render.resolution_x, scene.render.resolution_y = 1024, 1280
head = next(o for o in scene.objects if o.name.startswith('Head skin'))
import mathutils
wm = head.matrix_world
pts = [wm @ v.co for v in head.data.vertices]
eye_z = max(p.z for p in pts) - 0.12                                         # around the eyes (m)
cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = 0.30
co = bpy.data.objects.new('cam', cam); scene.collection.objects.link(co)
cx, cz = 0.0, eye_z - 0.03
co.location = (cx, -1.5, cz); co.rotation_euler = (math.radians(90), 0, 0)
scene.camera = co
scene.render.filepath = OUT + '.png'
bpy.ops.render.render(write_still=True)
W, H = scene.render.resolution_x, scene.render.resolution_y
# Blender's orthographic scale spans the image's longer side (sensor fit AUTO)
width_m, height_m = (cam.ortho_scale, cam.ortho_scale * H / W) if W >= H else (cam.ortho_scale * W / H, cam.ortho_scale)
json.dump({'cx': cx, 'cz': cz, 'width_m': width_m, 'height_m': height_m,
           'px': [scene.render.resolution_x, scene.render.resolution_y]}, open(OUT + '.json', 'w'))
print('rendered', OUT)
