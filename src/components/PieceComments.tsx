"use client";
import MediaCommunityActions from './MediaCommunityActions';
export default function PieceComments({assetId,name}:{assetId:string;name:string}) {
  return <MediaCommunityActions key={assetId} record={{key:`piece:${assetId}`,name}} active variant="piece" onView={()=>{}} onDialog={()=>{}} />;
}
