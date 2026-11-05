"""Create AMES's original 29-stone educational preview library.
Run with: /usr/local/bin/3dpy scripts/blender/create_gemstone_library.py
All geometry, surface patterns, lighting, and posters are generated here.
No third-party models, textures, screenshots, or brand imagery are used.
"""
import bpy
import json
import math
import os
import random
import sys
from pathlib import Path
from mathutils import Vector
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = json.loads((ROOT / 'src/lib/gemstone-registry.json').read_text())
PUBLIC = ROOT / 'public/ames-engine'
SOURCE = ROOT / 'source-assets/gemstones'
SOURCE.mkdir(parents=True, exist_ok=True)
SEED = 29031

COLORS = {
    'stone-alexandrite': '#267C72', 'stone-amber': '#D77B16',
    'stone-amethyst': '#743D9C', 'stone-ametrine': '#8250A0', 'stone-aquamarine': '#82D4E4',
    'stone-citrine': '#E5A928', 'stone-diamond': '#F4F7FA',
    'stone-emerald': '#087A4B', 'stone-fancy-color-diamond': '#F2D43F',
    'stone-garnet': '#76172B', 'stone-iolite': '#4B4B9A',
    'stone-jade': '#4D9470', 'stone-kunzite': '#D998BC',
    'stone-lapis-lazuli': '#173D86', 'stone-moonstone': '#DDE7EE',
    'stone-morganite': '#E7ADAA', 'stone-opal': '#E7E7DF',
    'stone-pearl': '#EEE8DA', 'stone-peridot': '#8DAF35',
    'stone-rose-quartz': '#DDA5B5', 'stone-ruby': '#B50932',
    'stone-sapphire': '#164CAB', 'stone-spinel': '#76528D',
    'stone-sunstone': '#C97344', 'stone-tanzanite': '#564BA8',
    'stone-topaz': '#62B7DB', 'stone-tourmaline': '#268359',
    'stone-turquoise': '#38A6A5', 'stone-zircon': '#C6A56B',
}


def linear_hex(value):
    value = value.lstrip('#')
    rgb = [int(value[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb) + (1,)


def material(name, color, roughness=.2, transmission=0, ior=1.6, metallic=0, coat=.2):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = linear_hex(color)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['IOR'].default_value = ior
    bsdf.inputs['Transmission Weight'].default_value = transmission
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = .12
    mat.diffuse_color = linear_hex(color)
    return mat


def mesh_object(name, vertices, faces, mats, indices=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for mat in mats:
        mesh.materials.append(mat)
    if indices:
        for face, index in zip(mesh.polygons, indices):
            face.material_index = index
    return obj


def shape_at(cut, angle):
    c, s = math.cos(angle), math.sin(angle)
    if cut == 'radiant':
        x = math.copysign(abs(c) ** .3, c)
        y = math.copysign(abs(s) ** .3, s) * 1.06
    elif cut == 'cushion':
        x = math.copysign(abs(c) ** .68, c)
        y = math.copysign(abs(s) ** .68, s)
    elif cut == 'oval':
        x, y = c, s * 1.28
    elif cut == 'pear':
        width = .78 - .25 * s
        x, y = c * width, s * 1.28
    elif cut == 'trillion':
        radius = .82 + .18 * math.cos(3 * (angle - math.pi / 2))
        x, y = radius * c, radius * s
    else:
        x, y = c, s
    return x, y


def outline(cut, n):
    return [shape_at(cut, 2 * math.pi * i / n) for i in range(n)]


OPTICAL_IOR = {
    'diamond': 2.417, 'corundum': 1.77, 'beryl': 1.58, 'quartz': 1.544,
    'chrysoberyl': 1.745, 'garnet': 1.79, 'cordierite': 1.54,
    'spodumene': 1.66, 'olivine': 1.65, 'spinel': 1.718, 'zoisite': 1.7,
    'topaz': 1.62, 'tourmaline': 1.62, 'zircon': 1.94,
}


def display_color(sid, color):
    """Retain saturated body colour under refractive studio lighting."""
    if sid == 'stone-diamond':
        return '#FFFFFF'
    amount = .34 if sid in ('stone-ruby', 'stone-emerald', 'stone-sapphire', 'stone-garnet') else .26
    value = color.lstrip('#')
    rgb = [int(value[i:i+2], 16) for i in (0, 2, 4)]
    lifted = [round(c + (255 - c) * amount) for c in rgb]
    return '#' + ''.join(f'{c:02X}' for c in lifted)


def oriented_face(vertices, face):
    if len(face) < 3:
        return face
    a, b, c = (Vector(vertices[i]) for i in face[:3])
    normal = (b - a).cross(c - a)
    center = sum((Vector(vertices[i]) for i in face), Vector()) / len(face)
    return tuple(reversed(face)) if normal.dot(center) < 0 else tuple(face)


def brilliant_geometry(cut):
    """57-facet brilliant family plus a closed, narrow girdle."""
    octants, sector = 8, math.tau / 8
    table_ratio = .56 if cut in ('round brilliant', 'radiant') else .6
    crown_angle, pavilion_angle = math.radians(34.5), math.radians(40.9)
    girdle = .035
    crown_height = (1 - table_ratio) * math.tan(crown_angle)
    table_z, girdle_top, girdle_bottom = girdle / 2 + crown_height, girdle / 2, -girdle / 2
    pavilion_depth = math.tan(pavilion_angle)
    culet_z = girdle_bottom - pavilion_depth
    crown_mid_ratio = .78
    crown_mid_z = table_z + crown_height * (table_ratio - crown_mid_ratio * math.cos(sector / 2)) / (1 - table_ratio)
    pavilion_mid_z = culet_z + pavilion_depth * .5 * math.cos(sector / 2)
    vertices = [(0, 0, table_z), (0, 0, culet_z)]
    rings = {key: [] for key in ('table', 'crown', 'top_main', 'top_valley', 'bottom_main', 'bottom_valley', 'pavilion')}
    for i in range(octants):
        main, half = i * sector, (i + .5) * sector
        for key, radius, angle, z in [
            ('table', table_ratio, main, table_z), ('crown', crown_mid_ratio, half, crown_mid_z),
            ('top_main', 1, main, girdle_top), ('top_valley', 1, half, girdle_top),
            ('bottom_main', 1, main, girdle_bottom), ('bottom_valley', 1, half, girdle_bottom),
            ('pavilion', .5, half, pavilion_mid_z),
        ]:
            x, y = shape_at(cut, angle)
            rings[key].append(len(vertices))
            vertices.append((x * radius, y * radius, z))
    faces = []
    for i in range(octants):
        n, p = (i + 1) % octants, (i - 1) % octants
        for face in [
            (0, rings['table'][i], rings['table'][n]),
            (rings['table'][i], rings['table'][n], rings['crown'][i]),
            (rings['table'][i], rings['crown'][i], rings['top_main'][i]),
            (rings['table'][i], rings['top_main'][i], rings['crown'][p]),
            (rings['top_main'][i], rings['top_valley'][i], rings['crown'][i]),
            (rings['top_valley'][p], rings['top_main'][i], rings['crown'][p]),
            (rings['bottom_main'][i], rings['bottom_valley'][i], rings['pavilion'][i]),
            (rings['bottom_valley'][p], rings['bottom_main'][i], rings['pavilion'][p]),
            (rings['bottom_main'][i], rings['pavilion'][i], 1),
            (rings['bottom_main'][i], 1, rings['pavilion'][p]),
        ]:
            faces.append(oriented_face(vertices, face))
    top, bottom = [], []
    for i in range(octants):
        top.extend((rings['top_main'][i], rings['top_valley'][i]))
        bottom.extend((rings['bottom_main'][i], rings['bottom_valley'][i]))
    for i in range(len(top)):
        n = (i + 1) % len(top)
        faces.append(oriented_face(vertices, (top[i], top[n], bottom[n])))
        faces.append(oriented_face(vertices, (top[i], bottom[n], bottom[i])))
    return vertices, faces


def step_cut_geometry(cut):
    """Broad, planar step facets for emerald-cut stones."""
    clip, yscale = .26, (1.3 if 'elongated' in cut else 1.06)
    shape = [(-1+clip,-1), (1-clip,-1), (1,-1+clip), (1,1-clip),
             (1-clip,1), (-1+clip,1), (-1,1-clip), (-1,-1+clip)]
    levels = [(.22,-.72), (.68,-.4), (1,-.025), (1,.025), (.82,.22), (.58,.43)]
    vertices = [(x*scale, y*scale*yscale, z) for scale,z in levels for x,y in shape]
    n = len(shape)
    faces = []
    for level in range(len(levels)-1):
        for i in range(n):
            face = (level*n+i, level*n+(i+1)%n, (level+1)*n+(i+1)%n, (level+1)*n+i)
            faces.append(oriented_face(vertices, face))
    faces.append(oriented_face(vertices, tuple(reversed(range(n)))))
    faces.append(oriented_face(vertices, tuple((len(levels)-1)*n+i for i in range(n))))
    return vertices, faces


def create_faceted(stone, rng):
    cut = stone['cut']
    vertices, faces = step_cut_geometry(cut) if cut in ('emerald', 'rectangular emerald', 'elongated emerald') else brilliant_geometry(cut)
    ior = OPTICAL_IOR.get(stone['category'], 1.6)
    main = material(f"{stone['name']} polished facets", display_color(stone['id'], COLORS[stone['id']]), .018, 1, ior, 0, .08)
    mats, indices = [main], []
    if stone['id'] == 'stone-ametrine':
        mats.append(material('Ametrine golden polished facets', '#F2CD5B', .018, 1, 1.544, 0, .08))
    for face in faces:
        xmid = sum(vertices[v][0] for v in face) / len(face)
        indices.append(1 if len(mats) > 1 and xmid > 0 else 0)
    obj = mesh_object(f"Gemstone {stone['name']}", vertices, faces, mats, indices)
    obj['ames_optical_mode'] = 'polished-gemstone-visual' if stone['id'] == 'stone-ametrine' else 'closed-dielectric-visual'
    obj['ames_gemstone_id'] = stone['id']
    obj.rotation_euler.z = rng.uniform(-.12, .12)
    return [obj]


def dome_point(angle, radial, cut, height, freeform=0):
    x, y = outline(cut, 1)[0] if False else (math.cos(angle), math.sin(angle))
    if cut == 'oval':
        y *= 1.28
    elif cut == 'cushion':
        x = math.copysign(abs(x) ** .68, x)
        y = math.copysign(abs(y) ** .68, y)
    elif cut == 'freeform cabochon':
        wobble = 1 + freeform * (math.sin(3 * angle + .7) + .45 * math.sin(5 * angle - .8))
        x *= wobble
        y *= 1.16 * wobble
    z = -.12 + height * math.sqrt(max(0, 1 - radial * radial))
    return (x * radial, y * radial, z)


def create_cabochon(stone, rng):
    cut = 'oval'
    if 'cushion' in stone['cut']:
        cut = 'cushion'
    if 'freeform' in stone['cut']:
        cut = 'freeform cabochon'
    n, rings = 160, 40
    height = .65 if 'high dome' in stone['cut'] else .48
    vertices = [dome_point(0, 0, cut, height)]
    for ring in range(1, rings + 1):
        radial = ring / rings
        for i in range(n):
            vertices.append(dome_point(2 * math.pi * i / n, radial, cut, height, .075))
    bottom_start = len(vertices)
    for i in range(n):
        x, y, _ = dome_point(2 * math.pi * i / n, 1, cut, height, .075)
        vertices.append((x * .92, y * .92, -.24))
    faces, pattern = [], []
    for i in range(n):
        faces.append((0, 1 + i, 1 + (i + 1) % n))
        pattern.append((0, 0, 0))
    for ring in range(rings - 1):
        a0, b0 = 1 + ring * n, 1 + (ring + 1) * n
        for i in range(n):
            face = (a0 + i, b0 + i, b0 + (i + 1) % n, a0 + (i + 1) % n)
            faces.append(face)
            center = sum((Vector(vertices[v]) for v in face), Vector()) / 4
            pattern.append(center)
    last = 1 + (rings - 1) * n
    for i in range(n):
        faces.append((last + i, bottom_start + i, bottom_start + (i + 1) % n, last + (i + 1) % n))
        pattern.append((0, 0, -1))
    faces.append(tuple(reversed([bottom_start + i for i in range(n)])))
    pattern.append((0, 0, -1))

    sid = stone['id']
    base = COLORS[sid]
    transmission = .72 if sid == 'stone-amber' else (.3 if sid in ('stone-moonstone', 'stone-rose-quartz') else 0)
    roughness = .12 if sid != 'stone-jade' else .22
    main = material(f"{stone['name']} polished cabochon", base, roughness, transmission, 1.54, 0, .55)
    if sid in ('stone-moonstone', 'stone-rose-quartz', 'stone-jade'):
        bsdf = main.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Subsurface Weight'].default_value = .12
    mats = [main]
    if sid == 'stone-opal':
        palette = ['#76CFE0', '#A8DFB4', '#E8A6C8', '#E6D578', '#9D9ADE', '#E8E7DD']
        mats = [material('Surface primary', '#E7E7DF', .2, .12, 1.45, 0, .4)]
        mats.extend(material(f'Surface flash {i}', c, .16, .08, 1.45, .06, .45) for i, c in enumerate(palette, 1))
    elif sid == 'stone-jade':
        mats.extend(material(f'Surface mottling {i}', c, .25, .04, 1.6, 0, .25) for i, c in enumerate(['#478A68', '#579B76', '#63A17D'], 1))
    elif sid == 'stone-turquoise':
        mats.append(material('Matrix', '#314C48', .42, 0, 1.5))
    indices = []
    for center in pattern:
        index = 0
        x, y, z = center
        if sid == 'stone-opal' and z > -.05:
            wave = math.sin(x * 11 + y * 7) + math.sin(y * 13 - x * 4) + math.cos((x + y) * 17)
            if wave > .8:
                index = 1 + int(abs(wave * 2.1)) % (len(mats) - 1)
        elif sid == 'stone-jade':
            wave = math.sin(x * 5 + y * 3) + math.cos(y * 6 - x * 2)
            index = 1 + int(abs(wave * 1.7)) % 3 if abs(wave) > .45 else 0
        elif sid == 'stone-turquoise':
            vein = abs(math.sin(x * 4.2 + math.sin(y * 3.1)) + .32 * math.sin(y * 8 - x * 2))
            index = 1 if vein < .105 else 0
        indices.append(index)
    obj = mesh_object(f"Gemstone {stone['name']}", vertices, faces, mats, indices)
    obj['ames_optical_mode'] = 'closed-dielectric-visual' if sid == 'stone-amber' else 'polished-cabochon-visual'
    obj['ames_gemstone_id'] = sid
    for poly in obj.data.polygons:
        poly.use_smooth = True
    objects = [obj]
    if sid in ('stone-lapis-lazuli', 'stone-sunstone', 'stone-amber'):
        objects.extend(add_inclusions(sid, cut, height, rng))
    return objects


def add_inclusions(sid, cut, height, rng):
    objects = []
    count = 46 if sid == 'stone-lapis-lazuli' else (32 if sid == 'stone-sunstone' else 9)
    mat = material('Inclusion', '#C9A74B' if sid != 'stone-amber' else '#6D391E', .28, 0, 1.5, .45 if sid != 'stone-amber' else 0, .1)
    pale = material('Veil', '#C4CBD0', .36)
    for i in range(count):
        angle = rng.uniform(0, math.tau)
        radial = rng.uniform(.12, .88)
        point = dome_point(angle, radial, cut, height, .075)
        size = rng.uniform(.009, .025) if sid != 'stone-amber' else rng.uniform(.012, .026)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=size, location=point)
        fleck = bpy.context.object
        fleck.name = 'Inclusion'
        fleck.scale.z = .35
        fleck.data.materials.append(pale if sid == 'stone-lapis-lazuli' and i % 5 == 0 else mat)
        if sid == 'stone-amber':
            fleck.location.z -= rng.uniform(.04, .15)
        objects.append(fleck)
    return objects


def create_pearl(stone, rng):
    mat = material('Surface nacre', COLORS[stone['id']], .19, 0, 1.53, .16, .52)
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Subsurface Weight'].default_value = .09
    if 'Thin Film Thickness' in bsdf.inputs:
        bsdf.inputs['Thin Film Thickness'].default_value = 320
        bsdf.inputs['Thin Film IOR'].default_value = 1.34
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=40, radius=1)
    obj = bpy.context.object
    obj.name = 'Gemstone Pearl'
    obj.scale = (1, .97, 1.035)
    obj['ames_optical_mode'] = 'nacre-visual'
    obj['ames_gemstone_id'] = stone['id']
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return [obj]


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def setup_studio():
    bpy.ops.object.camera_add(location=(3.6, -5.2, 3.0))
    camera = bpy.context.object
    camera.name = 'Presentation camera'
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 3.25
    camera.data.lens = 52
    camera.data.clip_start = .01
    camera.data.clip_end = 100
    aim(camera, (0, 0, .03))
    bpy.context.scene.camera = camera
    for name, location, energy, size, color in [
        ('Key softbox', (-3, -4, 5), 650, 4, (1, .94, .86)),
        ('Edge softbox', (4, 1, 3), 800, 3, (.82, .91, 1)),
        ('Front strip', (0, -4, .5), 180, 2, (1, 1, 1)),
    ]:
        bpy.ops.object.light_add(type='AREA', location=location)
        lamp = bpy.context.object
        lamp.name = name
        lamp.data.energy = energy
        lamp.data.shape = 'DISK'
        lamp.data.size = size
        lamp.data.color = color
        aim(lamp, (0, 0, 0))
    world = bpy.data.worlds.new('Studio world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.55, .6, .65, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .5
    bpy.context.scene.world = world


def configure_render():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 12
    scene.cycles.transmission_bounces = 10
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'


def write_contracts(stone):
    sid = stone['id']
    folder = PUBLIC / sid
    (folder / 'app').mkdir(parents=True, exist_ok=True)
    (folder / 'web').mkdir(parents=True, exist_ok=True)
    revision = f'{sid}:2'
    limitations = stone['limitations'] + ['Original parametric model and procedural surface work; physical scale is unverified and commercial approval is pending.']
    asset = {
        'schemaVersion': 'ames.app-asset/1', 'assetId': sid, 'revisionId': revision,
        'publicationStatus': 'review', 'visualApproval': 'pending', 'type': 'gemstone',
        'category': stone['category'], 'name': stone['name'], 'aliases': stone['aliases'],
        'form': stone['form'], 'representativeCut': stone['cut'], 'defaultColors': stone['defaultColors'],
        'educationalPreview': True,
        'status': {'technical': 'pending', 'viewer': 'pending', 'luxury': 'pending', 'campaign': 'pending'},
        'interactive': {'glb': 'web/jewelry.glb', 'poster': 'web/poster.webp'},
        'media': {'hero': 'web/poster.webp'},
        'specs': {'physicalScaleConfirmed': False, 'unitMeaning': 'unresolved', 'manufacturingReady': False},
        'verifiedClaims': {'representativeDefaultOnly': True},
        'limitations': limitations,
        'source': {'license': 'AMES original', 'generator': 'scripts/blender/create_gemstone_library.py', 'editableScene': f'source-assets/gemstones/{sid}.blend'},
    }
    chat = {
        'schemaVersion': 'ames.chat-content/1', 'assetId': sid, 'revisionId': revision,
        'publicationStatus': 'review', 'visualApproval': 'pending', 'type': 'gemstone',
        'stageAsset': 'web/jewelry.glb', 'poster': 'web/poster.webp', 'rotationEnabled': False,
        'defaultView': 'three_quarter',
        'supportedViewerActions': ['rotate', 'stop_rotation', 'zoom', 'reset', 'side_view'],
        'essentialSpecs': {'physicalScaleConfirmed': False, 'unitMeaning': 'unresolved', 'manufacturingReady': False},
        'heroImage': 'web/poster.webp', 'macroImage': 'web/poster.webp',
        'visualModes': ['interactive', 'side'],
    }
    (folder / 'app/asset.json').write_text(json.dumps(asset, indent=2) + '\n')
    (folder / 'app/chat.json').write_text(json.dumps(chat, indent=2) + '\n')


def main():
    only = set(sys.argv[sys.argv.index('--') + 1:]) if '--' in sys.argv else set()
    for position, stone in enumerate(REGISTRY):
        sid = stone['id']
        if only and sid not in only:
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        rng = random.Random(SEED + position)
        if stone['form'] == 'faceted' or stone['form'] == 'faceted bicolor':
            objects = create_faceted(stone, rng)
        elif stone['form'] == 'pearl':
            objects = create_pearl(stone, rng)
        else:
            objects = create_cabochon(stone, rng)
        write_contracts(stone)
        setup_studio()
        configure_render()
        folder = PUBLIC / sid
        scene_path = SOURCE / f'{sid}.blend'
        bpy.ops.wm.save_as_mainfile(filepath=str(scene_path))
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.export_scene.gltf(filepath=str(folder / 'web/jewelry.glb'), export_format='GLB', use_selection=True, export_apply=True, export_animations=False, export_cameras=False, export_lights=False, export_extras=True)
        poster_png = folder / 'web/poster.png'
        bpy.context.scene.render.filepath = str(poster_png)
        bpy.ops.render.render(write_still=True)
        with Image.open(poster_png) as poster:
            poster.save(folder / 'web/poster.webp', 'WEBP', quality=92, method=6)
        poster_png.unlink()
        print(f'AMES_STONE_READY {sid}', flush=True)
    index_path = PUBLIC / 'chat/index.json'
    index = json.loads(index_path.read_text())
    existing = [p for p in index['contracts'] if not p.startswith('stone-')]
    index['contracts'] = existing + [f"{s['id']}/app/chat.json" for s in REGISTRY]
    index_path.write_text(json.dumps(index, indent=2) + '\n')
    sources = {
        'schemaVersion': 'ames.asset-sources/1',
        'license': 'AMES original; created for this project. No third-party models, textures, screenshots, or GIA imagery used.',
        'generator': 'scripts/blender/create_gemstone_library.py',
        'registry': 'src/lib/gemstone-registry.json',
        'assets': [{'assetId': s['id'], 'name': s['name'], 'revisionId': f"{s['id']}:2", 'origin': 'Original parametric brilliant/step-cut geometry and procedural optical surface treatment', 'license': 'AMES original', 'editableScene': f"source-assets/gemstones/{s['id']}.blend", 'previousRevision': f"source-assets/gemstones/revision-1/{s['id']}.glb"} for s in REGISTRY],
    }
    (PUBLIC / 'gemstones/sources.json').parent.mkdir(parents=True, exist_ok=True)
    (PUBLIC / 'gemstones/sources.json').write_text(json.dumps(sources, indent=2) + '\n')


if __name__ == '__main__':
    main()
