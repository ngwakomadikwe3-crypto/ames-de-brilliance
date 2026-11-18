"""Build closed, flat-shaded loose-stone previews using each gallery stone's material."""
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CUTS = 'Round Princess Emerald Asscher Cushion Marquise Radiant Oval Pear Heart'.split()


def outline(cut):
    if cut in ('Princess', 'Emerald', 'Asscher', 'Radiant'):
        corner = {'Princess': 0, 'Asscher': .35}.get(cut, .22)
        length = 1.4 if cut in ('Emerald', 'Radiant') else 1
        points = [(1, 1-corner), (1-corner, 1), (corner-1, 1), (-1, 1-corner),
                  (-1, corner-1), (corner-1, -1), (1-corner, -1), (1, corner-1)]
        return list(dict.fromkeys((x, z*length) for x, z in points))
    points = []
    for i in range(32):
        t = i * math.tau / 32
        x, z = math.cos(t), math.sin(t)
        if cut == 'Oval': z *= 1.4
        if cut == 'Marquise': x, z = x/(1+abs(z)), 1.7*z
        if cut == 'Pear': x, z = x*(1-.55*z), 1.45*z
        if cut == 'Cushion': x, z = [math.copysign(abs(v)**.55, v) for v in (x,z)]
        if cut == 'Heart': x, z = math.sin(t)**3, (13*math.cos(t)-5*math.cos(2*t)-2*math.cos(3*t)-math.cos(4*t))/16
        points.append((x,z))
    return points


def geometry(cut):
    points = outline(cut)
    rings = []
    for scale,height in ((.55,.4),(.81,.23),(1,.018),(1,-.018),(.62,-.38)):
        ring = [(scale*x,height,scale*z) for x,z in points]
        if height in (.23,-.38) and cut not in ('Emerald','Asscher'):
            ring = [tuple((a+b)/2 for a,b in zip(p,ring[(i+1)%len(ring)])) for i,p in enumerate(ring)]
        rings.append(ring)
    positions, normals = [], []
    def face(a,b,c):
        u,v = [[q-p for p,q in zip(a,end)] for end in (b,c)]
        n = [u[(i+1)%3]*v[(i+2)%3]-u[(i+2)%3]*v[(i+1)%3] for i in range(3)]
        if cut != 'Heart': b,c,n = c,b,[-k for k in n]
        positions.extend((a,b,c))
        normals.extend([tuple(k/math.hypot(*n) for k in n)]*3)
    for i in range(len(points)):
        j = (i+1)%len(points)
        face((0,.4,0),rings[0][i],rings[0][j])
        for upper,lower in zip(rings,rings[1:]):
            face(upper[i],lower[i],upper[j])
            face(upper[j],lower[i],lower[j])
        face((0,-.85,0),rings[-1][j],rings[-1][i])
    return positions,normals


def write_model(path, source, cut):
    positions,normals = geometry(cut)
    count = len(positions)
    data = b''.join(struct.pack('<3f',*v) for v in positions+normals)
    node = dict(source['nodes'][0], mesh=0)
    node['extras'] = dict(node.get('extras',{}), ames_cut_name=cut)
    doc = dict(asset={'version':'2.0'}, scene=0, scenes=[{'nodes':[0]}], nodes=[node],
               extensionsUsed=source.get('extensionsUsed',[]), materials=source['materials'],
               meshes=[{'primitives':[{'attributes':{'POSITION':0,'NORMAL':1},'material':0}]}],
               buffers=[{'byteLength':len(data)}], bufferViews=[{'buffer':0,'byteOffset':i*count*12,'byteLength':count*12} for i in range(2)],
               accessors=[{'bufferView':i,'count':count,'componentType':5126,'type':'VEC3'} for i in range(2)])
    doc['accessors'][0].update(min=list(map(min,zip(*positions))),max=list(map(max,zip(*positions))))
    if source.get('textures'):
        for field in ('textures', 'images', 'samplers'):
            if field in source:
                doc[field] = source[field]
        xmax = max(abs(x) for x,_,_ in positions)
        zmax = max(abs(z) for _,_,z in positions)
        uv = b''.join(struct.pack('<2f', .5+.5*x/xmax, .5-.5*z/zmax) for x,_,z in positions)
        doc['bufferViews'].append({'buffer':0, 'byteOffset':len(data), 'byteLength':len(uv)})
        doc['accessors'].append({'bufferView':2,'count':count,'componentType':5126,'type':'VEC2'})
        doc['meshes'][0]['primitives'][0]['attributes']['TEXCOORD_0'] = 2
        data += uv
        doc['buffers'][0]['byteLength'] = len(data)
    header = json.dumps(doc,separators=(',',':')).encode()
    header += b' '*(-len(header)%4)
    path.write_bytes(struct.pack('<4sIIII',b'glTF',2,28+len(header)+len(data),len(header),0x4e4f534a)+header+struct.pack('<I4s',len(data),b'BIN\0')+data)


for stone in json.loads((ROOT/'src/lib/gemstone-registry.json').read_text()):
    if 'diamond' in stone['id']: continue
    folder = ROOT/'public/ames-engine'/stone['id']/'web'
    raw = (folder/'jewelry.glb').read_bytes()
    source = json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
    # Share embedded texture images across cuts. Image URIs resolve relative to each model.
    if source.get('images'):
        header_size = struct.unpack_from('<I', raw, 12)[0]
        binary = memoryview(raw)[28 + header_size:]
        texture_dir = ROOT/'public/ames-engine/gallery-cuts/textures'
        texture_dir.mkdir(parents=True, exist_ok=True)
        images = []
        for index, image in enumerate(source['images']):
            view = source['bufferViews'][image['bufferView']]
            start = view.get('byteOffset', 0)
            extension = {'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp'}[image['mimeType']]
            name = f"{stone['id']}-{index}.{extension}"
            (texture_dir/name).write_bytes(binary[start:start+view['byteLength']])
            images.append({'uri': '../textures/'+name, 'mimeType': image['mimeType']})
        source['images'] = images
    # Keep finished meshes outside the engine's legacy /stone-*/ representative-cut path.
    for cut in CUTS:
        out = ROOT/'public/ames-engine/gallery-cuts'/cut
        out.mkdir(parents=True, exist_ok=True)
        write_model(out/(stone['id']+'.glb'), source, cut)
