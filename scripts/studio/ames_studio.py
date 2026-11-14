"""AMES studio - the lighting rig and gem materials the renders use.

Two things here are what separate a render from a photograph:

  * The tent. Jewellery is never lit by one lamp; it sits inside a white
    cylinder that wraps light right around it. The tent here is visible to
    the stone's reflection and refraction rays but NOT to the camera, so the
    stone gets full wraparound white while the frame stays dark and the piece
    reads against it.

  * Dispersion. A diamond refracts red, green and blue at different indices,
    which is where fire comes from. Rather than one glass at one index, the
    material below adds three glass lobes - one per channel, each at that
    channel's real index for diamond. They sum back to white, so the stone
    stays colourless while the edges throw colour the way a real one does.
"""
import bpy, math

# Refractive index of diamond at the C, e and g lines. The spread across
# them (0.044) is diamond's dispersion, and is the whole source of fire.
IOR_R, IOR_G, IOR_B = 2.4099, 2.4260, 2.4541


def scene(res=1100, samples=1024):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = samples
    s.cycles.max_bounces = 64
    s.cycles.transmission_bounces = 48
    s.cycles.glossy_bounces = 24
    s.cycles.transparent_max_bounces = 32
    s.cycles.use_denoising = True
    s.cycles.blur_glossy = 0.0
    s.cycles.sample_clamp_indirect = 0.0
    s.render.resolution_x = res
    s.render.resolution_y = res
    s.render.film_transparent = False
    s.view_settings.view_transform = 'AgX'
    s.view_settings.look = 'AgX - Punchy'
    return s


def _emitter(name, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (1, 1, 1, 1)
    e.inputs['Strength'].default_value = strength
    nt.links.new(e.outputs['Emission'], out.inputs['Surface'])
    return m


def _hide_from_camera(ob):
    """Light the stone, stay out of the picture."""
    ob.visible_camera = False
    ob.visible_shadow = False


def tent(radius=6.0, height=7.0, strength=1.05, lid_strength=None):
    """White cylinder + ceiling: the wraparound that gives jewellery its body."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=radius,
                                        depth=height, location=(0, 0, height / 2 - 0.4))
    wall = bpy.context.object
    wall.name = 'tent_wall'
    wall.data.materials.append(_emitter('tent_wall_e', strength))
    # Normals face out by default; flip so the emission points inward.
    wall.scale = (-1, 1, 1)
    _hide_from_camera(wall)

    bpy.ops.mesh.primitive_plane_add(size=radius * 2.1,
                                     location=(0, 0, height - 0.4))
    lid = bpy.context.object
    lid.name = 'tent_lid'
    lid.data.materials.append(_emitter('tent_lid_e', lid_strength if lid_strength is not None else strength * 2.1))
    _hide_from_camera(lid)

    world = bpy.context.scene.world or bpy.data.worlds.new('w')
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.004, 0.005, 0.007, 1)
    bg.inputs['Strength'].default_value = 1.0


def bounce_card(z, size=3.0, strength=2.6):
    """A white card just under the piece, hidden from the camera.

    A diamond shows whatever is beneath it, so over a dark sweep it goes
    charcoal no matter how bright the tent is. Every catalogue shot has one
    of these; without it the stones read as black glass.
    """
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z))
    c = bpy.context.object
    c.name = 'bounce_card'
    c.data.materials.append(_emitter('bounce_e', strength))
    _hide_from_camera(c)
    return c


def accents():
    """Small hard sources. These are the pinpoint sparkles; the tent can't
    make them, because a broad source gives a broad highlight."""
    def spark(name, loc, size, power):
        d = bpy.data.lights.new(name, 'AREA')
        d.shape = 'SQUARE'
        d.size = size
        d.energy = power
        o = bpy.data.objects.new(name, d)
        o.location = loc
        bpy.context.collection.objects.link(o)
        c = o.constraints.new('TRACK_TO')
        c.target = bpy.data.objects['aim']
        c.track_axis = 'TRACK_NEGATIVE_Z'
        c.up_axis = 'UP_Y'
        return o

    spark('key_spark',  (-1.9,  -2.4, 2.9), 0.14, 320)
    spark('rim_spark',  ( 2.5,   1.9, 1.5), 0.10, 210)
    spark('low_spark',  ( 0.4,  -2.9, 0.35), 0.08, 90)


def flag():
    """Black card. Without it the tent wraps the whole stone evenly and the
    girdle and facet junctions lose their edge."""
    bpy.ops.mesh.primitive_plane_add(size=5, location=(3.6, -2.1, 1.8),
                                     rotation=(0, math.radians(90), math.radians(34)))
    f = bpy.context.object
    f.name = 'flag'
    m = bpy.data.materials.new('flag_m')
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (0, 0, 0, 1)
    p.inputs['Roughness'].default_value = 1
    f.data.materials.append(m)
    f.visible_camera = False


def sweep():
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    g = bpy.context.object
    g.name = 'sweep'
    m = bpy.data.materials.new('sweep_m')
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (0.46, 0.465, 0.48, 1)
    p.inputs['Roughness'].default_value = 0.10
    p.inputs['Specular IOR Level'].default_value = 0.55
    g.data.materials.append(m)


def aim(height):
    t = bpy.data.objects.new('aim', None)
    t.location = (0, 0, height)
    bpy.context.collection.objects.link(t)
    return t


def camera(dist=4.9, elev=22.0, lens=110, fstop=6.3):
    a = math.radians(elev)
    bpy.ops.object.camera_add(location=(0, -dist * math.cos(a),
                                        bpy.data.objects['aim'].location[2] + dist * math.sin(a)))
    cam = bpy.context.object
    cam.data.lens = lens
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = dist
    cam.data.dof.aperture_fstop = fstop
    c = cam.constraints.new('TRACK_TO')
    c.target = bpy.data.objects['aim']
    c.track_axis = 'TRACK_NEGATIVE_Z'
    c.up_axis = 'UP_Y'
    bpy.context.scene.camera = cam
    return cam


def _body_colour(nt, out, tint, absorb, tint2=None):
    """Body colour lives in the volume, the way it does in a real gem: thick
    parts of the stone go deeper in colour, thin edges stay pale."""
    if not tint or absorb <= 0:
        return
    v = nt.nodes.new('ShaderNodeVolumeAbsorption')
    v.inputs['Density'].default_value = absorb
    if tint2:
        # Two-colour stones (ametrine) change colour along their length.
        tc = nt.nodes.new('ShaderNodeTexCoord')
        sx = nt.nodes.new('ShaderNodeSeparateXYZ')
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = -0.35; mr.inputs['From Max'].default_value = 0.35
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
        mix.inputs['A'].default_value = (*tint, 1); mix.inputs['B'].default_value = (*tint2, 1)
        nt.links.new(tc.outputs['Object'], sx.inputs['Vector'])
        nt.links.new(sx.outputs['X'], mr.inputs['Value'])
        nt.links.new(mr.outputs['Result'], mix.inputs['Factor'])
        nt.links.new(mix.outputs['Result'], v.inputs['Color'])
    else:
        v.inputs['Color'].default_value = (*tint, 1)
    nt.links.new(v.outputs['Volume'], out.inputs['Volume'])


def gem_material(name='diamond', tint=None, absorb=0.0, ior=2.4175, disp=0.044, tint2=None):
    """Three glass lobes, one per colour channel, each at its own index.

    Summed they are colourless, but each channel bends by a different amount,
    so facet edges throw colour the way a real stone does. The index and the
    spread are per gem: a zircon flashes almost like a diamond, a quartz
    barely at all, and that difference is a large part of telling them apart.
    """
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    lobes = []
    for chan, n in (((1, 0, 0, 1), ior - 0.36 * disp), ((0, 1, 0, 1), ior), ((0, 0, 1, 1), ior + 0.64 * disp)):
        g = nt.nodes.new('ShaderNodeBsdfGlass')
        g.inputs['Color'].default_value = chan
        g.inputs['Roughness'].default_value = 0.0
        g.inputs['IOR'].default_value = n
        lobes.append(g)
    a1 = nt.nodes.new('ShaderNodeAddShader'); a2 = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(lobes[0].outputs['BSDF'], a1.inputs[0]); nt.links.new(lobes[1].outputs['BSDF'], a1.inputs[1])
    nt.links.new(a1.outputs['Shader'], a2.inputs[0]); nt.links.new(lobes[2].outputs['BSDF'], a2.inputs[1])
    nt.links.new(a2.outputs['Shader'], out.inputs['Surface'])
    _body_colour(nt, out, tint, absorb, tint2)
    return m


def bruted_girdle(tint=None, absorb=0.0, ior=2.4175, tint2=None):
    """A real girdle is bruted - finely frosted, not polished. It carries the
    same body colour as the rest of the stone so light leaving through it is
    tinted exactly like light leaving through a facet."""
    m = bpy.data.materials.new('girdle_bruted')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    g = nt.nodes.new('ShaderNodeBsdfGlass')
    g.inputs['Color'].default_value = (1, 1, 1, 1)
    g.inputs['IOR'].default_value = ior
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 900.0
    noise.inputs['Detail'].default_value = 6.0
    r = nt.nodes.new('ShaderNodeMapRange')
    r.inputs['To Min'].default_value = 0.16
    r.inputs['To Max'].default_value = 0.36
    nt.links.new(noise.outputs['Fac'], r.inputs['Value'])
    nt.links.new(r.outputs['Result'], g.inputs['Roughness'])
    nt.links.new(g.outputs['BSDF'], out.inputs['Surface'])
    _body_colour(nt, out, tint, absorb, tint2)
    return m


def stage_floor(colour=(0.010, 0.026, 0.023), reach=1.9, squares=9.0, strength=3.2, pattern=True):
    """One floor that is two things at once.

    To the camera it is a dark polished surface that takes shadows and a soft
    reflection, so the piece sits on something. To every other ray - the ones
    travelling through a stone - it is a bright chequered light table, which is
    what keeps stones lit from beneath on a dark frame. The chequer fades out
    away from the piece so it does not flood the set.
    """
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    g = bpy.context.object
    g.name = 'stage_floor'
    m = bpy.data.materials.new('stage_floor_m'); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    dark = nt.nodes.new('ShaderNodeBsdfPrincipled')
    dark.inputs['Base Color'].default_value = (colour[0] * 0.22, colour[1] * 0.22, colour[2] * 0.22, 1)
    dark.inputs['Roughness'].default_value = 0.55
    dark.inputs['Specular IOR Level'].default_value = 0.07
    tc = nt.nodes.new('ShaderNodeTexCoord')
    ck = nt.nodes.new('ShaderNodeTexChecker'); ck.inputs['Scale'].default_value = squares
    ck.inputs['Color1'].default_value = (1, 1, 1, 1); ck.inputs['Color2'].default_value = (0, 0, 0, 1)
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / reach, 1 / reach, 1 / reach)
    gr = nt.nodes.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1.0
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = strength
    lp = nt.nodes.new('ShaderNodeLightPath'); mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(tc.outputs['Object'], ck.inputs['Vector'])
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], gr.inputs['Vector'])
    # A single large stone shows the chequer itself through its table, so hero
    # stones get a plain soft glow; small set stones need the pattern.
    if pattern:
        nt.links.new(ck.outputs['Color'], mul.inputs['A'])
    else:
        mul.inputs['A'].default_value = (1, 1, 1, 1)
    nt.links.new(gr.outputs['Color'], mul.inputs['B'])
    nt.links.new(mul.outputs['Result'], em.inputs['Color'])
    nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs['Fac'])
    nt.links.new(em.outputs['Emission'], mix.inputs[1]); nt.links.new(dark.outputs['BSDF'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    g.data.materials.append(m)
    bg = bpy.context.scene.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (*colour, 1)
    return g


def _face_outward(me):
    """Make every facet face out of the stone. Glass with a facet facing in
    reads the inside as outside, and the stone renders as grey slabs."""
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free(); me.update()


def build_stone(V, F, G, scale=0.9, spin=14.0, tint=None, absorb=0.0, ior=2.4175, disp=0.044, tint2=None):
    me = bpy.data.meshes.new('gem')
    me.from_pydata(V, [], F)
    me.validate()
    me.update()
    _face_outward(me)
    for poly in me.polygons:
        poly.use_smooth = False            # a cut stone has no smooth surface

    ob = bpy.data.objects.new('gem', me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(gem_material(tint=tint, absorb=absorb, ior=ior, disp=disp, tint2=tint2))
    ob.data.materials.append(bruted_girdle(tint, absorb, ior, tint2))
    lo, hi = G['girdle']
    for i in range(lo, hi):
        me.polygons[i].material_index = 1

    lowest = min(v[1] for v in V)
    ob.scale = (scale, scale, scale)
    ob.rotation_euler = (math.radians(90), 0, math.radians(spin))
    ob.location = (0, 0, abs(lowest) * scale + 0.0015)
    return ob


def chequer_card(location, rotation, size=3.4, squares=26.0, strength=3.4):
    """Bright-and-dark card placed behind or under a piece, hidden from camera.

    Stones show whatever lies behind them. Plain white makes them milky, plain
    dark makes them charcoal; a chequer gives every facet a different thing to
    pick up, which is the contrast that reads as sparkle.
    """
    bpy.ops.mesh.primitive_plane_add(size=size, location=location, rotation=rotation)
    card = bpy.context.object
    card.name = 'chequer_card'
    m = bpy.data.materials.new('chequer_e'); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); e = nt.nodes.new('ShaderNodeEmission')
    ck = nt.nodes.new('ShaderNodeTexChecker'); ck.inputs['Scale'].default_value = squares
    ck.inputs['Color1'].default_value = (1, 1, 1, 1); ck.inputs['Color2'].default_value = (0, 0, 0, 1)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nt.links.new(tc.outputs['UV'], ck.inputs['Vector'])
    nt.links.new(ck.outputs['Color'], e.inputs['Color']); e.inputs['Strength'].default_value = strength
    nt.links.new(e.outputs['Emission'], out.inputs['Surface'])
    card.data.materials.append(m)
    card.visible_camera = False
    return card


def strips(energy=950):
    """Two long narrow lights that draw a clean bright line along polished metal."""
    d = bpy.data.lights.new('strip', 'AREA'); d.shape = 'RECTANGLE'
    d.size = 3.6; d.size_y = 0.10; d.energy = energy
    for name, loc in (('strip_hi', (0, -2.7, 3.6)), ('strip_lo', (0, -3.0, 0.5))):
        o = bpy.data.objects.new(name, d); o.location = loc
        bpy.context.collection.objects.link(o)
        c = o.constraints.new('TRACK_TO'); c.target = bpy.data.objects['aim']
        c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'


def observer(elev_deg, radius=1.3, height=6.2, azimuth_deg=0.0):
    """Dark disc where a flat table mirrors the ceiling back to the camera.

    In life this is the viewer leaning over the stone. Without it a table
    reflects the bright ceiling and wears a grey window over its colour.
    """
    el = math.radians(elev_deg)
    d = height / math.tan(el)
    az = math.radians(azimuth_deg)
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=radius, fill_type='NGON',
                                      location=(-d * math.sin(az), d * math.cos(az), height))
    head = bpy.context.object
    head.name = 'observer'
    m = bpy.data.materials.new('observer_m'); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (0, 0, 0, 1); p.inputs['Roughness'].default_value = 1
    head.data.materials.append(m)
    head.visible_camera = False; head.visible_shadow = False
    return head


def use_gpu_if_asked():
    """GPU=1 renders on the graphics card (CUDA; OptiX failed on the rented L40S)."""
    import os
    if os.environ.get('GPU') != '1':
        return
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = os.environ.get('GPU_API', 'CUDA')
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type != 'CPU'
    if not any(d.use for d in prefs.devices):
        # Never fall back to the CPU on a rented GPU box: it would bill for
        # hours of rendering at a fraction of the speed.
        raise SystemExit('STUDIO: no graphics card visible to Cycles - stopping instead of rendering on the CPU')
    bpy.context.scene.cycles.device = 'GPU'
    print('STUDIO graphics card:', [d.name for d in prefs.devices if d.use], flush=True)


def turntable(target, frames, outdir, size, detail_size=0):
    """Turn `target` one full revolution about the vertical through its centre.

    The camera, lights, cards and floor stay still, the way a real studio
    turntable works - so highlights travel across the piece as it turns.
    Writes frame-NNN.png (and detail-NNN.png at a larger size if asked).
    Frames already on disk are skipped, so an interrupted run resumes.
    """
    import os
    from mathutils import Vector
    os.makedirs(outdir, exist_ok=True)
    s = bpy.context.scene
    # Spin about the visual centre of everything under the target. A piece's
    # root empty sits wherever the fitting maths left it, not at the middle
    # of the jewellery, and turning about it makes the piece orbit.
    meshes = [o for o in [target] + list(target.children_recursive) if o.type == 'MESH']
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector([min(p[k] for p in pts) for k in range(3)])
    hi = Vector([max(p[k] for p in pts) for k in range(3)])
    centre = (lo + hi) / 2.0
    pivot = bpy.data.objects.new('turn_pivot', None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = (centre.x, centre.y, 0.0)
    bpy.context.view_layer.update()
    mw = target.matrix_world.copy()
    target.parent = pivot
    target.matrix_world = mw
    passes = [('frame', size)] + ([('detail', detail_size)] if detail_size else [])
    for prefix, px in passes:
        s.render.resolution_x = s.render.resolution_y = px
        s.render.resolution_percentage = 100
        for i in range(frames):
            path = os.path.join(outdir, '%s-%03d.png' % (prefix, i))
            if os.path.exists(path):
                continue
            pivot.rotation_euler = (0, 0, 2 * math.pi * i / frames)
            bpy.context.view_layer.update()
            s.render.filepath = path
            bpy.ops.render.render(write_still=True)
            print('TURN %s %d/%d' % (prefix, i + 1, frames), flush=True)
