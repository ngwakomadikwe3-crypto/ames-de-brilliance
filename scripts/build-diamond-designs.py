"""Mount the ten authored cuts and prepare the two-tone watch for the house collection."""
import copy
import json
import math
import base64
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
    width *= 1.18
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
                factor = .69*reach/(setting_width/2)
                claw['scale']=[factor,.68,factor]
                claw['translation']=[0,.0032,0]
        rail = next(n for n in doc['nodes'] if n.get('name') == 'Gallery rail')
        rail['scale'] = [.68,1,.68]
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
# Preserve the printed face while giving the case, bracelet and hands their own finishes.
for m in watch['materials']:
    pbr=m.setdefault('pbrMetallicRoughness',{})
    if 'white gold' in m['name'].lower() or 'Blued hands' in m['name']:
        brushed='brushed' in m['name'].lower()
        m['name']=('Brushed' if brushed else 'Polished')+' silver steel'
        pbr.update(baseColorFactor=[.78,.82,.86,1],metallicFactor=1,roughnessFactor=.26 if brushed else .085)
    if m['name']=='Dial sunburst':
        m['name']='White enamel dial';pbr.update(baseColorFactor=[1,1,1,1],metallicFactor=0,roughnessFactor=.25)
binary=bytearray(binary)
def add_vec3(values, bounds=False):
    start=len(binary)
    for value in values: binary.extend(struct.pack('<3f',*value))
    view=len(watch['bufferViews'])
    watch['bufferViews'].append(dict(buffer=0,byteOffset=start,byteLength=len(binary)-start))
    accessor=dict(bufferView=view,componentType=5126,count=len(values),type='VEC3')
    if bounds: accessor.update(min=list(map(min,zip(*values))),max=list(map(max,zip(*values))))
    watch['accessors'].append(accessor)
    return len(watch['accessors'])-1

def add_beads(node):
    positions=[];normals=[]
    for x,y,z,qx,qy,qz,qw,d in struct.iter_unpack('<8f',base64.b64decode(node['extras']['ames_pave_layout'])):
        for side in (-1,1):
            for k in range(6):
                for t,h in [(k+1,0),(k,0),(k+.5,1)]:
                    angle=t*math.tau/6
                    u,v,w=math.cos(angle)*(1-h),h,math.sin(angle)*(1-h)
                    a,b,c=(side*.39+u*.085)*d,(.04+v*.12)*d,(side*.24+w*.085)*d
                    def orient(a,b,c):
                        i,j,l=2*(qy*c-qz*b),2*(qz*a-qx*c),2*(qx*b-qy*a)
                        return a+qw*i+qy*l-qz*j,b+qw*j+qz*i-qx*l,c+qw*l+qx*j-qy*i
                    dx,dy,dz=orient(a,b,c);positions.append((x+dx,y+dy,z+dz));normals.append(orient(u,v,w))
    prim=dict(attributes={'POSITION':add_vec3(positions,True),'NORMAL':add_vec3(normals)},material=0)
    parent=next(p for p in watch['nodes'] if watch['nodes'].index(node) in p.get('children',[]))
    parent['children'].append(len(watch['nodes']))
    watch['nodes'].append(dict(name='Setting beads '+node['name'],mesh=len(watch['meshes'])))
    watch['meshes'].append(dict(primitives=[prim]))

for node in gems:
    if node['name'].startswith('Pavé · bracelet '):
        # The six large stones occupy the centre of the link. Smaller pavé
        # covers the two exposed shoulders without bridging the moving links.
        packed = base64.b64decode(node['extras']['ames_pave_layout'])
        records = list(struct.iter_unpack('<8f', packed))
        for side in (-1, 1):
            for row in range(5):
                for col in range(5):
                    x = (col-2)*1.16 + (.18 if row%2 else -.18)
                    z = side*(2.72 + row*1.25)
                    records.append((x,1.36,z,0,0,0,1,1.10))
        node['extras']['ames_pave_layout'] = base64.b64encode(b''.join(struct.pack('<8f',*r) for r in records)).decode()
    pink = 'case side' in node['name'] or 'lugs' in node['name'] or ('bracelet ' in node['name'] and int(node['name'].split()[-1])%2==0)
    white = 'bezel' in node['name'] or 'Crown' in node['name'] or ('bracelet ' in node['name'] and int(node['name'].split()[-1])%3==0)
    colour = [1,1,1] if white else [0.96,0.34,0.51] if pink else [0.98,0.75,0.19]
    if 'ames_pave_layout' in node['extras']: add_beads(node)
    mesh = copy.deepcopy(watch['meshes'][node['mesh']])
    node['mesh'] = len(watch['meshes'])
    watch['meshes'].append(mesh)
    node['extras']['ames_gemstone_id'] = 'house-white-diamond' if white else 'house-pink-sapphire' if pink else 'house-yellow-sapphire'
    for prim in mesh['primitives']:
        m = copy.deepcopy(watch['materials'][prim['material']])
        m['name'] = node['extras']['ames_gemstone_id']
        m['extensions'] = {'KHR_materials_ior':{'ior':2.417 if white else 1.762},'KHR_materials_transmission':{'transmissionFactor':1},'KHR_materials_volume':{'thicknessFactor':1,'attenuationColor':colour}}
        prim['material'] = len(watch['materials'])
        watch['materials'].append(m)
watch['buffers'][0]['byteLength']=len(binary)
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

# A radial case shares the selected watch's movement, dial texture and bracelet.
def round_case(doc, geometry, buffer_index):
    head = next(n for n in doc['nodes'] if n['name'] == 'Watch head')
    children = head['children']
    parts = {doc['nodes'][i]['name']: doc['nodes'][i] for i in children}
    def accessor(rows, kind):
        offset = len(geometry)
        for row in rows:
            geometry.extend(struct.pack('<'+'f'*len(row), *row))
        view = len(doc['bufferViews'])
        doc['bufferViews'].append(dict(buffer=buffer_index, byteOffset=offset, byteLength=len(geometry)-offset))
        index = len(doc['accessors'])
        doc['accessors'].append(dict(bufferView=view, componentType=5126, count=len(rows), type=kind,
                                     min=list(map(min,zip(*rows))), max=list(map(max,zip(*rows)))))
        return index
    def surface(name, radius, inner, depth):
        node = parts[name]
        pos, norm, uv = [], [], []
        def vertex(r, angle, z, side=False):
            x,y=math.cos(angle),math.sin(angle)
            pos.append((r*x,r*y,z)); norm.append((x,y,0) if side else (0,0,1))
            uv.append((.5+.5*r*x/radius,.5-.5*r*y/radius))
        for k in range(96):
            a,b=k*math.tau/96,(k+1)*math.tau/96
            for r,t in [(inner,a),(radius,a),(radius,b),(inner,a),(radius,b),(inner,b)]:
                vertex(r,t,0)
            if depth:
                for t,z in [(a,-depth),(b,-depth),(b,0),(a,-depth),(b,0),(a,0)]:
                    vertex(radius,t,z,True)
        primitive=doc['meshes'][node['mesh']]['primitives'][0]
        mesh=dict(primitives=[dict(material=primitive['material'],attributes=dict(
            POSITION=accessor(pos,'VEC3'),NORMAL=accessor(norm,'VEC3'),TEXCOORD_0=accessor(uv,'VEC2')))])
        node['mesh']=len(doc['meshes']); doc['meshes'].append(mesh)
        node['scale']=[1,1,1]
    surface('Dial',14.5,0,0)
    surface('Watch glass',14.5,0,0)
    surface('Case and lugs',18.3,14.4,6)
    parts['Case and lugs']['translation']=[0,0,7.25]
    children[:]=[i for i in children if doc['nodes'][i]['name'] not in ('Pavé · bezel','Pavé · case side','Setting beads Pavé · bezel','Setting beads Pavé · case side')]
    # The rectangular case contained the original lugs and winding crown.
    # Rebuild both interfaces around the circular case in head-local millimetres.
    metal = doc['meshes'][parts['Case and lugs']['mesh']]['primitives'][0]['material']
    def solid(name, outline, lower, upper, crown=False):
        positions, normals = [], []
        def triangle(a,b,c):
            u=[b[i]-a[i] for i in range(3)]
            v=[c[i]-a[i] for i in range(3)]
            n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
            mag=math.hypot(*n)
            positions.extend((a,b,c)); normals.extend([tuple(x/mag for x in n)]*3)
        top=[(*p,upper) for p in outline]; bottom=[(*p,lower) for p in outline]
        for i in range(1,len(top)-1):
            triangle(top[0],top[i],top[i+1]); triangle(bottom[0],bottom[i+1],bottom[i])
        for i in range(len(top)):
            j=(i+1)%len(top)
            triangle(bottom[i],bottom[j],top[j]); triangle(bottom[i],top[j],top[i])
        mesh=len(doc['meshes'])
        doc['meshes'].append(dict(primitives=[dict(material=metal,attributes=dict(POSITION=accessor(positions,'VEC3'),NORMAL=accessor(normals,'VEC3')))]))
        node=dict(name=name,mesh=mesh)
        if crown: node.update(rotation=[0,math.sqrt(.5),0,math.sqrt(.5)],translation=[0,0,3.8])
        children.append(len(doc['nodes']));doc['nodes'].append(node)
    for side in [-1,1]:
        outline=[(-10.6,13),(10.6,13),(10.6,20.8),(8.5,24.7),(-8.5,24.7),(-10.6,20.8)]
        solid('Integrated bracelet end link '+str(side),[(x*side,y*side) for x,y in outline],1.3,7.1)
    rim=[(2.0*math.cos(k*math.tau/48),2.0*math.sin(k*math.tau/48)) for k in range(48)]
    solid('Winding crown',rim,17.6,20.7,True)
    parts['Crown diamond']['translation']=[20.9,0,3.8]
    disc=[(17.8*math.cos(k*math.tau/96),17.8*math.sin(k*math.tau/96)) for k in range(96)]
    solid('Circular caseback',disc,.9,1.5)
    for k in range(64):
        a=k*math.tau/64
        gem=copy.deepcopy(parts['Dial diamond 12'])
        gem.update(name=f'Round bezel diamond {k}',translation=[16.4*math.cos(a),16.4*math.sin(a),7.55])
        children.append(len(doc['nodes']));doc['nodes'].append(gem)

watch_dir=base/'ames-iced-watch/web'
doc,payload=read(watch_dir/'watch-pink-yellow.glb')
geometry=bytearray(payload)
round_case(doc,geometry,0)
doc['buffers'][0]['byteLength']=len(geometry)
save(watch_dir/'watch-round.glb',doc,bytes(geometry))
samples=base/'jewellery-samples'
for sample in samples.glob('stone-*-watch.gltf'):
    doc=json.loads(sample.read_text())
    geometry=bytearray()
    round_case(doc,geometry,len(doc['buffers']))
    doc['buffers'].append(dict(uri='watch-round.bin',byteLength=len(geometry)))
    (samples/'watch-round.bin').write_bytes(geometry)
    sample.with_name(sample.stem+'-round.gltf').write_text(json.dumps(doc,separators=(',',':')))
