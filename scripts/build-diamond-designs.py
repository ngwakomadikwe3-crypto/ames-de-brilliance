"""Mount the ten authored cuts and prepare the two-tone watch for the house collection."""
import copy
import json
import math
import struct
from pathlib import Path

base = Path('public/ames-engine')


def read(path):
    raw = path.read_bytes()
    n = struct.unpack_from('<I', raw, 12)[0]
    return json.loads(raw[20:20+n]), raw[28+n:]


def save(path, doc, binary):
    data = json.dumps(doc, separators=(',', ':')).encode()
    data += b' ' * (-len(data) % 4)
    binary += bytes(-len(binary) % 4)
    path.write_bytes(struct.pack('<4sIIII', b'glTF', 2, 28+len(data)+len(binary), len(data), 0x4e4f534a) + data + struct.pack('<I4s', len(binary), b'BIN\0') + binary)


folder = base/'demo-pave-solitaire/web'
for path in sorted((base/'gallery-cuts').glob('*/stone-amethyst.glb')):
    cut = path.parent.name
    ring, binary = read(folder/'solitaire-all-blue.glb')
    shape, data = read(path)
    centre = next(n for n in ring['nodes'] if n['name'] == 'Solitaire diamond')
    prim = ring['meshes'][centre['mesh']]['primitives'][0]
    original = ring['accessors'][prim['attributes']['POSITION']]
    incoming = shape['accessors'][0]
    def span(accessor, i):
        return accessor['max'][i] - accessor['min'][i]
    # Preserve the authored outline's proportions and seat the girdle at the original height.
    width = max(span(original, i) for i in (0, 2))
    setting_width = width
    width *= 1.04
    scale = [width/max(span(incoming, 0), span(incoming, 2))]*3
    scale[1] = span(original, 1)/span(incoming, 1)
    centre['scale'] = scale
    offset = [(original['max'][i]+original['min'][i] - scale[i]*(incoming['max'][i]+incoming['min'][i]))/2 for i in range(3)]
    # Bake the offset into local positions before the authored node rotation.
    data = bytearray(data)
    for k in range(incoming['count']):
        xyz = struct.unpack_from('<3f', data, k*12)
        struct.pack_into('<3f',data,k*12,*(xyz[i]+offset[i]/scale[i] for i in range(3)))
    for key in ('min','max'):
        incoming[key] = [v+offset[i]/scale[i] for i,v in enumerate(incoming[key])]
    # Align the fancy cut with the shank. Seat the four claws on its actual
    # silhouette on their respective diagonals, including the heart's shoulders.
    def fit_setting(doc, node):
        node.pop('rotation', None)
        points = [struct.unpack_from('<3f', data, k*12) for k in range(incoming['count'])]
        for claw in (n for n in doc['nodes'] if n.get('name','').startswith('Claw ')):
            quadrant = int(claw['name'].split()[-1])
            sx, sz = [(1,-1),(-1,-1),(-1,1),(1,1)][quadrant]
            reach = 0
            for k in range(0,len(points),3):
                triangle = points[k:k+3]
                for a,b in zip(triangle,triangle[1:]+triangle[:1]):
                    u,v = sx*a[0]-sz*a[2], sx*b[0]-sz*b[2]
                    if u*v>0 or abs(u-v)<1e-12: continue
                    x = sx*(a[0]+u/(u-v)*(b[0]-a[0]))
                    reach = max(reach, math.sqrt(2)*x*scale[0])
            if reach:
                factor = .95*reach/(setting_width/2)
                claw['scale']=[factor,1,factor]
    fit_setting(ring,centre)
    start = len(ring['bufferViews'])
    for view in shape['bufferViews']:
        ring['bufferViews'].append(dict(view, byteOffset=len(binary)+view.get('byteOffset',0)))
    first = len(ring['accessors'])
    ring['accessors'].extend(dict(a,bufferView=start+a['bufferView']) for a in shape['accessors'])
    prim.clear()
    prim.update(attributes={'POSITION':first,'NORMAL':first+1},material=next(i for i,m in enumerate(ring['materials']) if 'Ice blue' in m['name']))
    centre['extras']['ames_cut'] = cut.lower()
    ring['buffers'][0]['byteLength'] = len(binary)+len(data)
    save(folder/('solitaire-'+cut.lower()+'.glb'),ring,binary+data)

    # Share the fitted centre mesh across all gemstone rings, retaining each stone's material.
    samples = base/'jewellery-samples'
    cut_folder = samples/cut
    cut_folder.mkdir(exist_ok=True)
    uv = bytearray()
    for k in range(incoming['count']):
        x, _, z = struct.unpack_from('<3f',data,k*12)
        uv.extend(struct.pack('<2f',(x-incoming['min'][0])/span(incoming,0),(z-incoming['min'][2])/span(incoming,2)))
    (samples/(cut+'.bin')).write_bytes(data+uv)
    for sample in samples.glob('stone-*-ring.gltf'):
        variant = json.loads(sample.read_text())
        for resource in variant['buffers'] + variant.get('images',[]):
            if 'uri' in resource: resource['uri'] = '../'+resource['uri']
        n = next(n for n in variant['nodes'] if n['name']=='Solitaire diamond')
        n['scale'] = scale
        fit_setting(variant,n)
        n['extras'].pop('ames_cut',None)
        buf = len(variant['buffers'])
        variant['buffers'].append(dict(uri='../'+cut+'.bin',byteLength=len(data)+len(uv)))
        start = len(variant['bufferViews'])
        variant['bufferViews'].extend(dict(v,buffer=buf) for v in shape['bufferViews'])
        variant['bufferViews'].append(dict(buffer=buf,byteOffset=len(data),byteLength=len(uv)))
        first = len(variant['accessors'])
        variant['accessors'].extend(dict(a,bufferView=start+a['bufferView']) for a in shape['accessors'])
        variant['accessors'].append(dict(bufferView=start+2,count=incoming['count'],componentType=5126,type='VEC2'))
        primitive = variant['meshes'][n['mesh']]['primitives'][0]
        material = primitive['material']
        primitive.clear()
        primitive.update(attributes=dict(POSITION=first,NORMAL=first+1,TEXCOORD_0=first+2),material=material)
        (cut_folder/sample.name).write_text(json.dumps(variant,separators=(',',':')))

folder = base/'ames-iced-watch/web'
watch, binary = read(folder/'watch-v8.glb')
gems = [n for n in watch['nodes'] if n.get('extras',{}).get('ames_gemstone_id')]
for node in gems:
    pink = 'case side' in node['name'] or 'lugs' in node['name'] or ('bracelet ' in node['name'] and int(node['name'].split()[-1])%2==0)
    colour = [0.96,0.30,0.51] if pink else [0.98,0.72,0.12]
    mesh = copy.deepcopy(watch['meshes'][node['mesh']])
    node['mesh'] = len(watch['meshes'])
    watch['meshes'].append(mesh)
    node['extras']['ames_gemstone_id'] = 'house-pink-diamond' if pink else 'house-yellow-diamond'
    for prim in mesh['primitives']:
        m = copy.deepcopy(watch['materials'][prim['material']])
        m['name'] = node['extras']['ames_gemstone_id']
        m['extensions'] = {'KHR_materials_ior':{'ior':2.417},'KHR_materials_transmission':{'transmissionFactor':1},'KHR_materials_volume':{'thicknessFactor':1,'attenuationColor':colour}}
        prim['material'] = len(watch['materials'])
        watch['materials'].append(m)
for ext in ('KHR_materials_ior','KHR_materials_volume','KHR_materials_transmission'):
    if ext not in watch['extensionsUsed']: watch['extensionsUsed'].append(ext)
# Set real diamond hour markers between the dial surface and the crystal.
head = next(n for n in watch['nodes'] if n['name']=='Watch head')
crown = next(n for n in watch['nodes'] if n['name']=='Crown diamond')
for hour in range(12):
    angle = hour*math.tau/12
    marker = copy.deepcopy(crown)
    marker.update(name=f'Dial diamond {hour or 12}',translation=[12.1*math.sin(angle),12.1*math.cos(angle),6.58],
                  rotation=[math.sqrt(.5),0,0,math.sqrt(.5)],scale=[.93,.78,.93])
    head['children'].append(len(watch['nodes']))
    watch['nodes'].append(marker)
save(folder/'watch-pink-yellow.glb',watch,binary)

for name, width in [('square', 1.19), ('slim', .81)]:
    head = next(n for n in watch['nodes'] if n['name'] == 'Watch head')
    head['scale'] = [width, 1, 1]
    save(folder/('watch-'+name+'.glb'), watch, binary)
