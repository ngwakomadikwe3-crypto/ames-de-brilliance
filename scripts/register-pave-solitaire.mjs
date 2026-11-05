import {readFileSync,writeFileSync} from 'node:fs';
import sharp from 'sharp';
const id='demo-pave-solitaire',root=`public/ames-engine/${id}`;
const write=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const shared={assetId:id,revisionId:id+':1',publicationStatus:'review',visualApproval:'pending'};
const specs={physicalScaleConfirmed:false,unitMeaning:'Authored concept; not measured inventory.',manufacturingReady:false};
await sharp(root+'/web/poster-v1.png').webp({quality:95,alphaQuality:100}).toFile(root+'/web/poster-v1.webp');
write(root+'/app/asset.json',{schemaVersion:'ames.app-asset/1',...shared,type:'jewelry',category:'ring',name:'Pavé solitaire',verifiedClaims:{originalConcept:true,commercialStock:false},limitations:['Original 3D interpretation of the supplied photograph; hidden geometry is inferred.','Dimensions, metal purity, diamond grading and manufacturing readiness are not verified.'],interactive:{glb:'web/solitaire-v1.glb',poster:'web/poster-v1.webp'}});
write(root+'/app/chat.json',{schemaVersion:'ames.chat-content/1',...shared,type:'jewelry',presentation:'interactive',stageAsset:'web/solitaire-v1.glb',poster:'web/poster-v1.webp',rotationEnabled:false,defaultView:'three_quarter',supportedViewerActions:['rotate','stop_rotation','zoom','reset','side_view','inspect_setting'],essentialSpecs:specs,heroImage:'web/poster-v1.webp',macroImage:'web/poster-v1.webp',visualModes:['interactive','side']});
write(root+'/app/boutique.json',{schemaVersion:'ames.boutique-content/1',...shared,category:'ring',name:'Pavé solitaire',thumbnail:'web/poster-v1.webp',heroImage:'web/poster-v1.webp',interactiveGlb:'web/solitaire-v1.glb',poster:'web/poster-v1.webp',essentialSpecs:specs});
write(root+'/app/media.json',{schemaVersion:'ames.media-content/1',...shared,items:[{assetId:id,id:'solitaire_concept',mediaType:'image',path:'web/poster-v1.webp',aspectRatio:1,approvalState:'pending'}]});
for(const section of ['chat','boutique','media']){
 const path=`public/ames-engine/${section}/index.json`,index=JSON.parse(readFileSync(path));
 index.contracts=index.contracts.filter(p=>!p.startsWith(id+'/')&&(section==='chat'||!p.startsWith('dev-test-candidate-ring/')));
 index.contracts.unshift(`${id}/app/${section}.json`);write(path,index);
}
write('src/lib/chat-default.json',{assetId:id,ringAssetId:'dev-test-candidate-ring'});
console.log('Registered interactive solitaire; prior source assets retained.');
