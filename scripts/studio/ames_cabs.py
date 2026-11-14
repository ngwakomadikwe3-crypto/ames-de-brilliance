"""Cabochons and pearls - the stones that are polished smooth, not faceted.

These are never cut with facets in the trade, because their beauty is in the
body of the stone: jade's glow, opal's play of colour, the matrix veins in
turquoise. Rendering them as faceted glass is why they came out washed white.
"""
import bpy, math


def dome(kind='oval'):
    """Smooth dome on a flat base; a sphere for a pearl."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1.0)
    ob = bpy.context.object
    if kind != 'sphere':
        ob.scale = (1.0, 0.76, 0.62)
        bpy.ops.object.transform_apply(scale=True)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.bisect(plane_co=(0, 0, -0.12), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        ob.location = (0, 0, 0.12 + 0.002)
    else:
        ob.scale = (0.8, 0.8, 0.8)
        ob.location = (0, 0, 0.802)
    bpy.ops.object.shade_smooth()
    return ob


def _base(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    return m, m.node_tree, m.node_tree.nodes['Principled BSDF']


def _set(p, **kw):
    for k, v in kw.items():
        if k in p.inputs:
            p.inputs[k].default_value = v


def _coords(nt):
    return nt.nodes.new('ShaderNodeTexCoord').outputs['Object']


def amber():
    m, nt, p = _base('amber')
    _set(p, **{'Base Color': (1.0, 0.62, 0.12, 1), 'Roughness': 0.04, 'IOR': 1.54, 'Transmission Weight': 1.0})
    v = nt.nodes.new('ShaderNodeVolumeAbsorption')
    v.inputs['Color'].default_value = (1.0, 0.50, 0.06, 1); v.inputs['Density'].default_value = 1.1
    nt.links.new(v.outputs['Volume'], nt.nodes['Material Output'].inputs['Volume'])
    return m


def jade():
    m, nt, p = _base('jade')
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 2.2; n.inputs['Detail'].default_value = 5
    r = nt.nodes.new('ShaderNodeValToRGB')
    r.color_ramp.elements[0].color = (0.03, 0.30, 0.12, 1); r.color_ramp.elements[1].color = (0.20, 0.62, 0.30, 1)
    nt.links.new(_coords(nt), n.inputs['Vector']); nt.links.new(n.outputs['Fac'], r.inputs['Fac'])
    nt.links.new(r.outputs['Color'], p.inputs['Base Color'])
    _set(p, **{'Roughness': 0.13, 'IOR': 1.66, 'Subsurface Weight': 1.0, 'Subsurface Scale': 0.22,
               'Subsurface Radius': (0.5, 1.0, 0.5), 'Coat Weight': 0.6, 'Coat Roughness': 0.05})
    return m


def lapis():
    m, nt, p = _base('lapis')
    co = _coords(nt)
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 3.0; n.inputs['Detail'].default_value = 8
    r = nt.nodes.new('ShaderNodeValToRGB')
    r.color_ramp.elements[0].position = 0.30; r.color_ramp.elements[0].color = (0.010, 0.030, 0.33, 1)
    r.color_ramp.elements[1].position = 0.78; r.color_ramp.elements[1].color = (0.05, 0.11, 0.55, 1)
    e = r.color_ramp.elements.new(0.90); e.color = (0.75, 0.78, 0.85, 1)      # calcite streaks
    nt.links.new(co, n.inputs['Vector']); nt.links.new(n.outputs['Fac'], r.inputs['Fac'])
    # Pyrite: sparse gold flecks, metallic where they fall.
    vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 16.0
    lt = nt.nodes.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'; lt.inputs[1].default_value = 0.22
    nt.links.new(co, vo.inputs['Vector']); nt.links.new(vo.outputs['Distance'], lt.inputs[0])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.inputs['B'].default_value = (0.95, 0.74, 0.30, 1)
    nt.links.new(lt.outputs['Value'], mix.inputs['Factor']); nt.links.new(r.outputs['Color'], mix.inputs['A'])
    nt.links.new(mix.outputs['Result'], p.inputs['Base Color']); nt.links.new(lt.outputs['Value'], p.inputs['Metallic'])
    _set(p, **{'Roughness': 0.16, 'Coat Weight': 0.5, 'Coat Roughness': 0.06})
    return m


def moonstone():
    m, nt, p = _base('moonstone')
    # A cloudy, half-clear body with the blue sheen (adularescence) floating
    # in the middle of the dome, where the stone faces the viewer.
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.30
    inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
    pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 2.6
    sc = nt.nodes.new('ShaderNodeMath'); sc.operation = 'MULTIPLY'; sc.inputs[1].default_value = 3.0
    nt.links.new(lw.outputs['Facing'], inv.inputs[1]); nt.links.new(inv.outputs['Value'], pw.inputs[0])
    nt.links.new(pw.outputs['Value'], sc.inputs[0]); nt.links.new(sc.outputs['Value'], p.inputs['Emission Strength'])
    _set(p, **{'Base Color': (0.20, 0.24, 0.32, 1), 'Roughness': 0.12, 'IOR': 1.52, 'Transmission Weight': 0.7,
               'Subsurface Weight': 0.5, 'Subsurface Scale': 0.3, 'Emission Color': (0.18, 0.42, 1.0, 1),
               'Coat Weight': 0.7, 'Coat Roughness': 0.03})
    return m


def opal():
    m, nt, p = _base('opal')
    co = _coords(nt)
    # Play of colour: soft-edged patches whose hue depends on where they are
    # and on the viewing angle, so they roll as the stone turns.
    hue_n = nt.nodes.new('ShaderNodeTexNoise'); hue_n.inputs['Scale'].default_value = 3.2; hue_n.inputs['Detail'].default_value = 1.5
    mask_n = nt.nodes.new('ShaderNodeTexNoise'); mask_n.inputs['Scale'].default_value = 5.5; mask_n.inputs['Detail'].default_value = 3.0
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    nt.links.new(co, hue_n.inputs['Vector']); nt.links.new(co, mask_n.inputs['Vector'])
    h1 = nt.nodes.new('ShaderNodeMath'); h1.operation = 'MULTIPLY'; h1.inputs[1].default_value = 3.0
    h2 = nt.nodes.new('ShaderNodeMath'); h2.operation = 'ADD'
    h3 = nt.nodes.new('ShaderNodeMath'); h3.operation = 'FRACT'
    nt.links.new(hue_n.outputs['Fac'], h1.inputs[0]); nt.links.new(h1.outputs['Value'], h2.inputs[0])
    nt.links.new(lw.outputs['Facing'], h2.inputs[1]); nt.links.new(h2.outputs['Value'], h3.inputs[0])
    hsv = nt.nodes.new('ShaderNodeCombineColor'); hsv.mode = 'HSV'
    hsv.inputs[1].default_value = 0.95; hsv.inputs[2].default_value = 1.0
    nt.links.new(h3.outputs['Value'], hsv.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.interpolation_type = 'SMOOTHSTEP'
    mr.inputs['From Min'].default_value = 0.48; mr.inputs['From Max'].default_value = 0.62
    mr.inputs['To Min'].default_value = 0.0; mr.inputs['To Max'].default_value = 2.2
    nt.links.new(mask_n.outputs['Fac'], mr.inputs['Value'])
    nt.links.new(hsv.outputs['Color'], p.inputs['Emission Color']); nt.links.new(mr.outputs['Result'], p.inputs['Emission Strength'])
    _set(p, **{'Base Color': (0.55, 0.62, 0.72, 1), 'Roughness': 0.08, 'IOR': 1.45,
               'Subsurface Weight': 1.0, 'Subsurface Scale': 0.35, 'Coat Weight': 0.8, 'Coat Roughness': 0.03})
    return m


def pearl():
    m, nt, p = _base('pearl')
    # Lustre is a sharp mirror-like reflection over a soft glowing body, with
    # the overtone - the rose blush - showing toward the edge of the sphere.
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.45
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.94, 0.72, 0.76, 1)      # edge: rose overtone
    ramp.color_ramp.elements[1].color = (0.82, 0.78, 0.72, 1)      # centre: cream body
    nt.links.new(lw.outputs['Facing'], ramp.inputs['Fac'])
    inv = nt.nodes.new('ShaderNodeInvert'); nt.links.new(ramp.outputs['Color'], inv.inputs['Color'])
    inv2 = nt.nodes.new('ShaderNodeInvert'); nt.links.new(inv.outputs['Color'], inv2.inputs['Color'])
    nt.links.new(inv2.outputs['Color'], p.inputs['Base Color'])
    _set(p, **{'Roughness': 0.26, 'IOR': 1.53, 'Subsurface Weight': 0.35, 'Subsurface Scale': 0.06,
               'Subsurface Radius': (1.0, 0.8, 0.7), 'Coat Weight': 1.0, 'Coat Roughness': 0.015, 'Coat IOR': 1.68,
               'Thin Film Thickness': 430.0, 'Thin Film IOR': 1.53})
    return m


def rose_quartz():
    m, nt, p = _base('rose_quartz')
    # Milky pink that glows from inside; rose quartz is cloudy, never clear.
    _set(p, **{'Base Color': (0.95, 0.33, 0.46, 1), 'Roughness': 0.12, 'IOR': 1.544,
               'Subsurface Weight': 0.4, 'Subsurface Scale': 0.25, 'Subsurface Radius': (1.0, 0.45, 0.5),
               'Coat Weight': 0.6, 'Coat Roughness': 0.04})
    return m


def sunstone():
    m, nt, p = _base('sunstone')
    co = _coords(nt)
    # Aventurescence: copper platelets inside the stone that flash back light.
    # They are made to glint (a little light of their own) because flat
    # metallic specks only show up as dark dots.
    vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 26.0
    lt = nt.nodes.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'; lt.inputs[1].default_value = 0.16
    nt.links.new(co, vo.inputs['Vector']); nt.links.new(vo.outputs['Distance'], lt.inputs[0])
    gl = nt.nodes.new('ShaderNodeMath'); gl.operation = 'MULTIPLY'; gl.inputs[1].default_value = 5.0
    nt.links.new(lt.outputs['Value'], gl.inputs[0]); nt.links.new(gl.outputs['Value'], p.inputs['Emission Strength'])
    _set(p, **{'Base Color': (0.88, 0.28, 0.06, 1), 'Emission Color': (1.0, 0.66, 0.28, 1), 'Roughness': 0.10, 'IOR': 1.54,
               'Subsurface Weight': 0.35, 'Subsurface Scale': 0.2, 'Subsurface Radius': (1.0, 0.4, 0.15),
               'Coat Weight': 0.8, 'Coat Roughness': 0.03})
    return m


def turquoise():
    m, nt, p = _base('turquoise')
    co = _coords(nt)
    # Matrix: the dark web of host rock that runs through natural turquoise.
    vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.feature = 'DISTANCE_TO_EDGE'; vo.inputs['Scale'].default_value = 3.2
    ns = nt.nodes.new('ShaderNodeTexNoise'); ns.inputs['Scale'].default_value = 5.0
    warp = nt.nodes.new('ShaderNodeVectorMath'); warp.operation = 'ADD'
    nt.links.new(co, ns.inputs['Vector']); nt.links.new(co, warp.inputs[0]); nt.links.new(ns.outputs['Color'], warp.inputs[1])
    nt.links.new(warp.outputs['Vector'], vo.inputs['Vector'])
    lt = nt.nodes.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'; lt.inputs[1].default_value = 0.035
    nt.links.new(vo.outputs['Distance'], lt.inputs[0])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = (0.08, 0.62, 0.66, 1); mix.inputs['B'].default_value = (0.10, 0.06, 0.03, 1)
    nt.links.new(lt.outputs['Value'], mix.inputs['Factor']); nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
    _set(p, **{'Roughness': 0.22, 'IOR': 1.62, 'Coat Weight': 0.35, 'Coat Roughness': 0.10})
    return m
