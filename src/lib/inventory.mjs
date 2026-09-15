export const CATEGORIES = Object.freeze({Rings:'ring',Watches:'watch',Bracelets:'bracelet',Necklaces:'necklace',Earrings:'earring'});
export const categoryKey=value=>CATEGORIES[value] || (Object.values(CATEGORIES).includes(value)?value:null);
export const categoryLabel=value=>Object.keys(CATEGORIES).find(k=>CATEGORIES[k]===value)||value;
export const approvedAsset=a=>a?.status==='published'&&(a.kind!=='JEWELLER_INVENTORY'||a.inventoryStatus==='APPROVED');
export function inventoryPublic(a){return Object.fromEntries(['id','name','category','description','sku','diamondShape','carat','color','clarity','cut','certification','certificationReference','metal','setting','price','currency','availability','stockQuantity','leadTime','deliveryRegions','provenanceNotes','origin','jewellerId','jewellerName','images','video','glb','inventoryStatus','kind','specs','revision'].filter(k=>a[k]!==undefined).map(k=>[k,a[k]]));}
