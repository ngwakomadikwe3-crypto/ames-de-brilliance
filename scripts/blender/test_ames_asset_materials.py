"""Exercise every kit material in the installed Blender; no commercial assets are written."""
import runpy,sys,json
from pathlib import Path
project=Path(sys.argv[sys.argv.index('--')+1]).resolve()
kit=runpy.run_path(str(project/'scripts/blender/ames_asset_kit.py'),run_name='ames_asset_kit')
for key,preset in kit['STANDARD']['materials'].items():
    role={'metal':'metal','faceted-dielectric':'gemstone','layered-lustre':'pearl','cabochon-diffraction':'opal'}[preset['family']]
    mat=kit['make_material']({'id':'test-'+key,'materialPreset':key,'role':role,'finish':'polished','color':None})
    assert mat.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value==preset['metallic']
try:
    kit['make_material']({'id':'test-brushed','materialPreset':'yellow-gold','role':'metal','finish':'brushed','color':None})
    raise AssertionError('Brushed finish must require actual directional surface detail.')
except ValueError:pass
print('PASS all AMES Blender material presets and unsupported finish guard')
