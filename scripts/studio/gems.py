"""Render one review still per gemstone. Usage: gems.py [id ...] (default all)."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import ames_cuts as C, ames_studio as S, ames_cabs as K

OUT = os.path.expanduser(os.environ.get('OUTDIR', '~/cuts/out/gems')); os.makedirs(OUT, exist_ok=True)

# cut, refractive index, dispersion, body colour, depth of colour.
# Softer, lower-index stones get a steeper pavilion, as cutters give them,
# so they do not go see-through in the middle.
LOW = {'pavilion_angle': 42.6, 'crown_angle': 36.0}
MID = {'pavilion_angle': 41.6, 'crown_angle': 35.0}
FACETED = {
    'stone-diamond':             ('round',   None, 2.4175, 0.044, None, 0.0),
    'stone-fancy-color-diamond': ('cushion', None, 2.4175, 0.044, (1.00, 0.86, 0.22), 0.55),
    'stone-zircon':              ('round',   None, 1.950, 0.039, (0.42, 0.82, 0.93), 0.75),
    'stone-garnet':              ('round',   MID,  1.760, 0.024, (0.70, 0.04, 0.08), 0.85),
    'stone-ruby':                ('oval',    MID,  1.765, 0.018, (0.86, 0.03, 0.13), 1.15),
    'stone-sapphire':            ('oval',    MID,  1.765, 0.018, (0.07, 0.17, 0.80), 0.72),
    'stone-spinel':              ('cushion', MID,  1.718, 0.020, (0.90, 0.12, 0.30), 0.95),
    'stone-alexandrite':         ('cushion', MID,  1.746, 0.015, (0.12, 0.66, 0.50), 0.85),
    'stone-tanzanite':           ('oval',    MID,  1.695, 0.021, (0.27, 0.22, 0.84), 0.80),
    'stone-peridot':             ('oval',    MID,  1.670, 0.020, (0.56, 0.82, 0.14), 0.85),
    'stone-kunzite':             ('step',    None, 1.666, 0.017, (0.95, 0.62, 0.88), 0.60),
    'stone-tourmaline':          ('step',    None, 1.635, 0.017, (0.06, 0.60, 0.34), 0.92),
    'stone-topaz':               ('oval',    LOW,  1.620, 0.014, (0.36, 0.72, 0.96), 0.75),
    'stone-morganite':           ('oval',    LOW,  1.585, 0.014, (0.98, 0.70, 0.66), 0.60),
    'stone-emerald':             ('step',    None, 1.577, 0.014, (0.03, 0.66, 0.28), 0.95),
    'stone-aquamarine':          ('step',    None, 1.577, 0.014, (0.42, 0.84, 0.97), 1.10),
    'stone-iolite':              ('oval',    LOW,  1.550, 0.017, (0.32, 0.32, 0.86), 0.58),
    'stone-amethyst':            ('oval',    LOW,  1.544, 0.013, (0.47, 0.15, 0.78), 0.78),
    'stone-citrine':             ('oval',    LOW,  1.544, 0.013, (1.00, 0.69, 0.14), 0.80),
    'stone-ametrine':            ('step',    None, 1.544, 0.013, (0.47, 0.15, 0.78), 0.95),
}
CABS = {
    'stone-amber': K.amber, 'stone-jade': K.jade, 'stone-lapis-lazuli': K.lapis,
    'stone-moonstone': K.moonstone, 'stone-opal': K.opal, 'stone-pearl': K.pearl,
    'stone-rose-quartz': K.rose_quartz, 'stone-sunstone': K.sunstone, 'stone-turquoise': K.turquoise,
}
RES = int(os.environ.get('RES', 520)); SPP = int(os.environ.get('SPP', 220))

def one(gid):
    S.scene(res=RES, samples=SPP)
    if gid in FACETED:
        cut, prop, ior, disp, tint, absorb = FACETED[gid]
        V, F, G = C.shaped(cut, prop) if cut != 'step' else C.step_cut()
        tint2 = (1.00, 0.72, 0.16) if gid == 'stone-ametrine' else None
        absorb *= float(os.environ.get('DEPTH', 2.6))
        ob = S.build_stone(V, F, G, scale=0.9, spin=14.0, tint=tint, absorb=absorb, ior=ior, disp=disp, tint2=tint2)
        h = ob.location[2]
    else:
        ob = K.dome('sphere' if gid == 'stone-pearl' else 'oval')
        ob.rotation_euler = (0, 0, math.radians(22))
        ob.data.materials.append(CABS[gid]())
        h = 0.4
    if gid in FACETED:
        # Three-quarter profile under the full tent: the view that shows table,
        # girdle and pavilion together, and the one the stone test frame proved.
        S.aim(h * 0.62)
        # Dark walls, bright ceiling. Under an evenly white tent every crown
        # facet mirrors the wall and the stone wears a grey veil; with the walls
        # dark the facets go clear and the colour inside shows through.
        if cut == 'step':
            # Step cuts are a hall of mirrors: each step reflects the wall it
            # faces, so they need light all round, not the hard overhead-only
            # contrast that makes a brilliant sparkle.
            S.tent(strength=float(os.environ.get('SWALL', 0.45)), lid_strength=float(os.environ.get('SLID', 3.0)))
        else:
            S.tent(strength=float(os.environ.get('WALL', 0.035)), lid_strength=float(os.environ.get('LID', 4.4)))
        S.accents()
        S.stage_floor(strength=float(os.environ.get('GLOW', 0.05)), pattern=False)
        # Dark disc where the table mirrors the ceiling (the viewer's head).
        # Lit walls light the steps from inside; the dark disc stops the big
        # flat table mirroring those walls back as a grey veil.
        S.observer(float(os.environ.get('ELEV', 62.0)), radius=float(os.environ.get('SHEAD', 2.2)) if cut == 'step' else 1.6)
        S.camera(dist=7.6, elev=float(os.environ.get('ELEV', 62.0)), lens=100, fstop=9.0)
    else:
        S.aim(0.30)
        # Smooth stones are lit softly: the full tent that suits facets burns a
        # polished dome out to plain white.
        S.tent(strength=0.50)
        S.accents(); S.flag()
        S.stage_floor(strength=0.25, pattern=False)
        S.camera(dist=8.2, elev=34.0, lens=100, fstop=11.0)
        bpy.context.scene.view_settings.exposure = -0.4
    S.use_gpu_if_asked()
    if os.environ.get('FRAMES'):
        S.turntable(ob, int(os.environ['FRAMES']), os.path.expanduser('~/cuts/spin/%s' % gid),
                    int(os.environ.get('SIZE', 1080)), int(os.environ.get('DETAIL', 0)))
        return
    bpy.context.scene.render.filepath = os.path.join(OUT, gid)
    bpy.ops.render.render(write_still=True)

ids = [a for a in sys.argv[1:] if a.startswith('stone-')] or list(FACETED) + list(CABS)
for gid in ids:
    if os.environ.get('FRAMES'):
        d = os.path.expanduser('~/cuts/spin/%s' % gid)
        if os.path.isdir(d) and len([f for f in os.listdir(d) if f.startswith('frame-')]) >= int(os.environ['FRAMES']):
            continue
    elif os.path.exists(os.path.join(OUT, gid + '.png')) and not os.environ.get('REDO'):
        continue
    one(gid); print('GEM DONE', gid, flush=True)
print('ALL DONE')
