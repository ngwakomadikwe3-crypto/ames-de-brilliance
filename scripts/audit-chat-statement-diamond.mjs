import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {newAssetBrief,evaluateModel} from '../src/lib/ames-asset-standard.ts';
import {inspectGlb} from '../src/lib/ames-glb-audit.ts';

const directory='docs/qa/chat-diamond-2026-11-04';
await mkdir(directory,{recursive:true});
const bytes=await readFile('public/ames-engine/demo-modern-diamond/web/diamond-v1.glb');
const hash=value=>createHash('sha256').update(value).digest('hex');
const brief=newAssetBrief('demo-modern-diamond');
brief.product={
  name:'AMES Éclat — Octagonal concept diamond',category:'loose-diamond',
  description:'Original elongated octagonal step-cut demonstration for the AMES Chat opening stage. Not physical stock or an offer for sale.',
  references:[{id:'authored-design',description:'Original parametric design and authored metre-scale envelope.',source:'scripts/blender/create_chat_statement_diamond.py',sha256:hash(await readFile('scripts/blender/create_chat_statement_diamond.py'))}],
  dimensionsMm:[12,8.94,18],scaleEvidence:'Authored design envelope, Blender metre geometry remapped to glTF XYZ. No physical stone was measured.',
  metalAndFinish:'None; loose polished concept diamond.',mainGemstone:'Colourless octagonal concept; representative IOR 2.417. No grade, carat, origin or certification.',
  additionalStones:'None.',construction:'Single closed convex faceted volume, graduated crown/pavilion, narrow girdle and small culet.'
};
brief.components=[{id:'concept-diamond',nodeName:'AMES Eclat | octagonal concept diamond',role:'gemstone',surface:'faceted',materialPreset:'preserve-source',finish:'polished',color:'#ffffff',evidenceIds:['authored-design']}];
brief.assumptions=['Authored dimensions describe only this demonstration model, not jeweller inventory.','Browser RGB optics are illustrative; no spectral dispersion, grading or manufacturing certification.'];
const inspection=inspectGlb(bytes);
const report=evaluateModel(brief,inspection,hash(bytes));
await writeFile(`${directory}/brief.json`,JSON.stringify(brief,null,2)+'\n');
await writeFile(`${directory}/model-audit.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,bytes:inspection.bytes,triangles:inspection.triangles,primitives:inspection.primitives,dimensionsMm:inspection.dimensionsMm,blockers:report.blockers,publicationApproved:report.publicationApproved},null,2));
if(report.blockers.length)process.exitCode=1;
