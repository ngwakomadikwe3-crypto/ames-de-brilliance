import {z} from 'zod';
import standard from '../../standards/ames-visual-standard.v1.json' with {type:'json'};
export {standard};
export const assetCategories=['loose-diamond','loose-gemstone','ring','earrings','necklace','pendant','bracelet','chain','brooch','collection','accessory'] as const;
export const deliverables=['concept-image','product-render','animation','interactive-3d'] as const;
const text=z.string().trim().max(2000),id=z.string().regex(/^[a-z][a-z0-9-]{1,79}$/);
const dimensions=z.tuple([z.number().positive().max(10000),z.number().positive().max(10000),z.number().positive().max(10000)]).nullable();
export const assetBriefSchema=z.object({
 schemaVersion:z.literal('ames.asset-brief/1'),assetId:id,revision:z.number().int().positive(),reviewedModelSha256:z.string().regex(/^[a-f0-9]{64}$/).nullable(),
 product:z.object({name:z.string().trim().min(2).max(120),category:z.enum(assetCategories),description:text,references:z.array(z.object({id,description:text,source:z.string().max(2048),sha256:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict()).max(30),dimensionsMm:dimensions,scaleEvidence:text,metalAndFinish:text,mainGemstone:text,additionalStones:text,construction:text}).strict(),
 deliverable:z.enum(deliverables),target:z.enum(['ames-mobile','ames-desktop','blender-cycles']),
 budget:z.enum(['mobile-safe','desktop-inspection']),background:z.enum(['transparent','warm-ivory','soft-champagne','deep-charcoal','rich-black']),
 components:z.array(z.object({id,nodeName:z.string().trim().min(1).max(120),role:z.enum(['metal','gemstone','pearl','opal','other']),surface:z.enum(['faceted','polished-curved','textured']),materialPreset:z.string().max(80),finish:z.enum(['polished','brushed','satin','hammered','engraved']),color:z.string().regex(/^#[a-fA-F0-9]{6}$/).nullable(),evidenceIds:z.array(id).max(30)}).strict()).max(500),
 requestedEffects:z.array(z.enum(['dispersion','birefringence','pleochroism','opalDiffraction'])).max(4),
 views:z.array(z.enum(['front','three-quarter','side','back','underside','macro'])).max(6),
 assumptions:z.array(text.min(3)).max(30),
 reviews:z.array(z.object({check:z.enum(standard.reviewChecks as [string,...string[]]),status:z.enum(['pending','pass','fail']),reviewer:z.string().max(120),evidence:text}).strict()).max(30)
}).strict().superRefine((v,c)=>{
 if(v.target==='ames-mobile'&&v.budget!=='mobile-safe')c.addIssue({code:'custom',path:['budget'],message:'Mobile delivery requires the mobile-safe budget.'});
 if(new Set(v.components.map(p=>p.id)).size!==v.components.length||new Set(v.components.map(p=>p.nodeName)).size!==v.components.length)c.addIssue({code:'custom',path:['components'],message:'Use unique component IDs and exact, unique node names.'});
 if(new Set(v.reviews.map(r=>r.check)).size!==v.reviews.length)c.addIssue({code:'custom',path:['reviews'],message:'Each review check must occur once.'});
 const refs=new Set(v.product.references.map(r=>r.id));
 for(const [i,p] of v.components.entries()){if(p.evidenceIds.some(r=>!refs.has(r)))c.addIssue({code:'custom',path:['components',i,'evidenceIds'],message:'Evidence must identify a supplied reference.'});if(p.materialPreset==='preserve-source')continue;if(!Object.hasOwn(standard.materials,p.materialPreset))c.addIssue({code:'custom',path:['components',i,'materialPreset'],message:'Choose a supported starting point or preserve-source for supplied materials.'});else{const m=standard.materials[p.materialPreset as keyof typeof standard.materials],family={metal:'metal',gemstone:'faceted-dielectric',pearl:'layered-lustre',opal:'cabochon-diffraction',other:'custom'}[p.role];if(family!==m.family)c.addIssue({code:'custom',path:['components',i,'role'],message:'Assign the correct material family to each component.'});}}
 for(const r of v.reviews)if(r.status==='pass'&&(!r.reviewer.trim()||!r.evidence.trim()))c.addIssue({code:'custom',path:['reviews'],message:'A passed review requires a named reviewer and evidence.'});
});
export type AssetBrief=z.infer<typeof assetBriefSchema>;
export function newAssetBrief(assetId='new-ames-piece'):AssetBrief{return{schemaVersion:'ames.asset-brief/1',assetId,revision:1,reviewedModelSha256:null,product:{name:'Untitled AMES piece',category:'ring',description:'',references:[],dimensionsMm:null,scaleEvidence:'',metalAndFinish:'',mainGemstone:'',additionalStones:'',construction:''},deliverable:'interactive-3d',target:'ames-mobile',budget:'mobile-safe',background:'transparent',components:[],requestedEffects:[],views:[...standard.requiredViews] as AssetBrief['views'],assumptions:[],reviews:standard.reviewChecks.map(check=>({check,status:'pending',reviewer:'',evidence:''}))};}
export function assessBrief(input:unknown){const brief=assetBriefSchema.parse(input),missing:string[]=[],limitations:string[]=[...standard.limitations];
 for(const [label,value] of Object.entries({description:brief.product.description,references:brief.product.references.length,dimensions:brief.product.dimensionsMm,'scale evidence':brief.product.scaleEvidence,'metal and finish / none':brief.product.metalAndFinish,'main gemstone / none':brief.product.mainGemstone,'additional stones / none':brief.product.additionalStones,'construction / cutting description':brief.product.construction}))if(!value)missing.push(label);
 if(brief.deliverable==='interactive-3d'&&!brief.components.length)missing.push('named component/material assignments');
 for(const effect of brief.requestedEffects)if(!standard.capabilities[brief.target][effect])limitations.push(`${effect} is not implemented in ${brief.target}; supply an explicitly labelled approximation or another renderer.`);
 for(const view of standard.requiredViews)if(!brief.views.includes(view as AssetBrief['views'][number]))missing.push(view+' review view');
 const pending=standard.reviewChecks.filter(check=>!brief.reviews.some(r=>r.check===check&&r.status==='pass'));
 return{brief,missing,pending,limitations,canBeginProduction:missing.length===0,reviewComplete:pending.length===0,approval:'Not a publication or manufacturing approval.'};
}
export function evaluateModel(briefInput:unknown,model:import('./ames-glb-audit').GlbInspection,sha256:string){const report=assessBrief(briefInput),{brief}=report,budget=standard.budgets[brief.budget],blockers=[...report.missing.map(m=>'Missing '+m),...model.errors];
 if(brief.deliverable!=='interactive-3d')blockers.push('This brief requests '+brief.deliverable+'. It cannot be accepted as an interactive 3D deliverable.');
 if(model.bytes>budget.maxBytes)blockers.push('GLB exceeds the selected download budget.');if(model.triangles>budget.maxTriangles)blockers.push('Triangle count exceeds the selected device budget.');if(model.primitives>budget.maxPrimitives)blockers.push('Primitive count exceeds the selected device budget.');
 if(model.textures.some(t=>t.width>budget.maxTextureEdge||t.height>budget.maxTextureEdge))blockers.push('Texture dimensions exceed the selected device budget.');
 if(brief.product.dimensionsMm&&model.dimensionsMm.length===3&&model.dimensionsMm.some((v,i)=>Math.abs(v-brief.product.dimensionsMm![i])>Math.max(.05,brief.product.dimensionsMm![i]*.02)))blockers.push('World-space GLB dimensions differ from the declared XYZ dimensions by more than 2% / 0.05 mm. Check units and transforms.');
 for(const c of brief.components){const mesh=model.components.find(m=>m.name===c.nodeName);if(!mesh){blockers.push(c.id+': exact mesh node is missing.');continue;}if(['gemstone','pearl','opal'].includes(c.role)&&(!mesh.closed||!mesh.outward||mesh.shells!==1))blockers.push(c.id+': precious-material volume needs one closed, consistently oriented shell.');if(c.role==='gemstone'&&c.surface==='faceted'&&!mesh.faceted)blockers.push(c.id+': flat facet normals are required for a faceted gemstone.');if(c.role==='metal'&&mesh.materialParameters.some(p=>p.metallic<.8))blockers.push(c.id+': declared metal has a non-metallic source material.');if(['gemstone','pearl','opal'].includes(c.role)&&mesh.materialParameters.some(p=>p.metallic>.05))blockers.push(c.id+': precious material must not use a metallic shader.');if(c.role==='gemstone'&&c.surface==='faceted'&&mesh.materialParameters.some(p=>p.transmission<.5))blockers.push(c.id+': faceted transparent-gem material needs a recorded transmission path.');}
 for(const c of model.components)if(!brief.components.some(p=>p.nodeName===c.name))blockers.push(c.name+': component role and material intent are not recorded.');
 const reviewsBound=brief.reviewedModelSha256===sha256&&/^[a-f0-9]{64}$/.test(sha256),pending=[...report.pending,...(!reviewsBound?['Review evidence must be bound to this model SHA-256.']:[])];
 return{schemaVersion:'ames.asset-audit/1',assetId:brief.assetId,revision:brief.revision,modelSha256:sha256,status:blockers.length?'technical-review-required':pending.length?'visual-review-required':'human-signoff-recorded',blockers,pending,limitations:[...report.limitations,...model.warnings],metrics:model,manufacturingCertified:false,publicationApproved:false};
}

