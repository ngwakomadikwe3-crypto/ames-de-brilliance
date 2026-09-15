import {publicUploadName} from '../public-upload.mjs';
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
export const assetRole=(kind,role)=>{const roles={image:['mainImage','gallery','detail'],video:['video'],glb:['web3d'],gltf:['web3d'],cad:['cad']};if(!roles[kind]?.includes(role))invalid('Invalid asset role');return role;};
export function validateInventoryUpload(file,bytes,kind){
 const extension=file.name.split('.').pop().toLowerCase();
 const fileName=file.name.replace(/[\\/\x00-\x1f\x7f]/g,'_').slice(0,180);
 let mimeType=file.type;
 if(kind==='image'||kind==='video'){
  const name=publicUploadName(file.name,bytes,kind),detected=name.split('.').pop();
  const aliases={jpg:['jpg','jpeg'],png:['png'],webp:['webp'],mp4:['mp4','mov'],mov:['mov'],webm:['webm']};
  const types={jpg:['image/jpeg'],png:['image/png'],webp:['image/webp'],mp4:['video/mp4','video/quicktime'],mov:['video/quicktime'],webm:['video/webm']};
  if(!aliases[detected]?.includes(extension)||!types[detected]?.includes(mimeType))invalid('File content, extension and MIME type must match');
 }else if(kind==='glb'||kind==='gltf'){
  if(extension!==kind||!['','application/octet-stream',kind==='glb'?'model/gltf-binary':'model/gltf+json',...(kind==='gltf'?['application/json']:[])].includes(mimeType))invalid('Invalid web 3D type');
  let model;
  try{
   if(kind==='glb'){
    if(bytes.length<20||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length||bytes.readUInt32LE(16)!==0x4e4f534a)throw Error();
    let offset=12;while(offset<bytes.length){if(offset+8>bytes.length)throw Error();const size=bytes.readUInt32LE(offset);if(size%4||offset+8+size>bytes.length)throw Error();offset+=8+size;}
    model=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
   }else model=JSON.parse(bytes.toString('utf8'));
   if(model.asset?.version!=='2.0'||model.extensionsUsed?.length||model.extensionsRequired?.length)throw Error();
   for(const resource of [...(model.buffers||[]),...(model.images||[])]){
    if(resource.uri!==undefined&&!/^data:(application\/(octet-stream|gltf-buffer)|image\/(png|jpeg|webp));base64,[A-Za-z0-9+/]+=*$/.test(resource.uri))throw Error();
    if(kind==='gltf'&&resource.uri===undefined&&resource.bufferView===undefined)throw Error();
   }
  }catch{invalid('Use self-contained glTF 2.0 with embedded resources and no extensions');}
  mimeType=kind==='glb'?'model/gltf-binary':'model/gltf+json';
 }else if(kind==='cad'){
  const allowed=['3dm','stl','obj','step','stp','iges','igs','fbx'];
  if(!allowed.includes(extension))invalid('Unsupported CAD format; DWG and DXF are not enabled');
  if(mimeType&&!['application/octet-stream','text/plain','model/stl','application/sla','model/obj','model/step','application/step','model/iges','application/iges','application/vnd.rhino','model/vnd.rhino','application/x-3dm','application/x-fbx'].includes(mimeType))invalid('Unsupported CAD MIME type');
  const source=bytes.toString('utf8'),numeric='[+\\-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+\\-]?\\d+)?';
  let valid=false;
  if(extension==='3dm')valid=bytes.length>32&&source.startsWith('3D Geometry File Format ');
  if(extension==='stl')valid=(bytes.length>=84&&84+50*bytes.readUInt32LE(80)===bytes.length)||(/^solid[^\n]*\r?\n/.test(source)&&/endsolid\s*[^\n]*\s*$/.test(source)&&new RegExp('vertex\\s+'+numeric+'\\s+'+numeric+'\\s+'+numeric).test(source)&&source.includes('endfacet'));
  if(extension==='obj'){const lines=source.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));valid=lines.some(s=>/^v\s/.test(s))&&lines.some(s=>/^f\s/.test(s))&&lines.every(s=>/^(v|vn|vt|vp|f|l|p|o|g|s|usemtl|mtllib)\s+[^<>`]+$/.test(s));}
  if(['step','stp'].includes(extension))valid=/^\s*ISO-10303-21;/.test(source)&&source.includes('HEADER;')&&source.includes('DATA;')&&/END-ISO-10303-21;\s*$/.test(source);
  if(['iges','igs'].includes(extension)){const lines=source.trimEnd().split(/\r?\n/);valid=lines.length>=5&&lines.every(s=>s.length===80&&/[SGDPT]/.test(s[72])&&/^ *\d+$/.test(s.slice(73)))&&lines.some(s=>s[72]==='T');}
  if(extension==='fbx')valid=bytes.length>27&&bytes.subarray(0,23).equals(Buffer.from('Kaydara FBX Binary  \0\x1a\0','binary'));
  if(!valid)invalid('CAD content does not match a supported file structure');
  mimeType='application/octet-stream';
 }else invalid('Unsupported media kind');
 return {fileName,extension,mimeType,size:bytes.length};
}
export function mediaSnapshot(record,role){return {fileId:record.fileId,kind:record.mediaKind,fileName:record.fileName||record.fileId,mimeType:record.mimeType,extension:record.extension||record.mediaKind,size:record.size??null,assetRole:role,uploadedAt:record.uploadedAt||record.createdAt,uploadedBy:record.uploadedBy||record.userId,visibility:record.mediaKind==='cad'?'PRIVATE':'REVIEW_REQUIRED',reviewStatus:'PENDING_REVIEW'};}
