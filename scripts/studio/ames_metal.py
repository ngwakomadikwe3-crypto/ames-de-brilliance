"""Jeweller's metals.

One flat metal material over a whole piece is the other half of the CGI look.
Real jewellery has a polished band, prongs that are brighter and rougher
because they are worked last, and recessed gallery metal that never gets the
same polish. The difference between those surfaces is what the eye reads as
"made by someone".
"""
import bpy

RECIPES = {
    # base colour, roughness, anisotropy, texture scale
    'band':    ((0.965, 0.965, 0.975), 0.045, 0.45, 260.0),
    'prong':   ((0.965, 0.965, 0.975), 0.060, 0.20, 620.0),
    'gallery': ((0.900, 0.902, 0.918), 0.185, 0.10, 380.0),
    'yellow':  ((1.000, 0.804, 0.437), 0.075, 0.38, 260.0),
    'rose':    ((0.976, 0.737, 0.655), 0.080, 0.38, 260.0),
}


def metal(kind='band', name=None):
    base, rough, aniso, scale = RECIPES[kind]
    m = bpy.data.materials.new(name or f'metal_{kind}')
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*base, 1)
    p.inputs['Metallic'].default_value = 1.0
    p.inputs['Anisotropic'].default_value = aniso
    p.inputs['IOR'].default_value = 0.47          # white gold / rhodium

    # Micro-roughness. A polished surface is not uniformly polished, and the
    # drift across it is what makes a highlight travel instead of sitting still.
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = 8.0
    noise.inputs['Roughness'].default_value = 0.62
    rng = nt.nodes.new('ShaderNodeMapRange')
    rng.inputs['To Min'].default_value = rough * 0.72
    rng.inputs['To Max'].default_value = rough * 1.65
    nt.links.new(noise.outputs['Fac'], rng.inputs['Value'])
    nt.links.new(rng.outputs['Result'], p.inputs['Roughness'])

    # Polishing leaves fine directional marks; a stretched noise bump is the
    # cheap, convincing version of them.
    marks = nt.nodes.new('ShaderNodeTexNoise')
    marks.inputs['Scale'].default_value = scale * 9.0
    marks.inputs['Detail'].default_value = 3.0
    stretch = nt.nodes.new('ShaderNodeMapping')
    stretch.inputs['Scale'].default_value = (1.0, 26.0, 1.0)
    tex = nt.nodes.new('ShaderNodeTexCoord')
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.055
    nt.links.new(tex.outputs['Object'], stretch.inputs['Vector'])
    nt.links.new(stretch.outputs['Vector'], marks.inputs['Vector'])
    nt.links.new(marks.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m


def reskin(objects, stone_material, kinds=('band',)):
    """Re-material a piece: metal by slot name, gems by the real gem shader."""
    cache = {}
    for ob in objects:
        if ob.type != 'MESH':
            continue
        for i, slot in enumerate(ob.material_slots):
            nm = (slot.material.name if slot.material else '').lower()
            if 'diamond' in nm or 'gem' in nm or 'stone' in nm:
                slot.material = stone_material
            else:
                # Prongs are the small parts; the band is everything else.
                kind = 'prong' if len(ob.data.polygons) < 2500 else kinds[0]
                if kind not in cache:
                    cache[kind] = metal(kind)
                slot.material = cache[kind]
