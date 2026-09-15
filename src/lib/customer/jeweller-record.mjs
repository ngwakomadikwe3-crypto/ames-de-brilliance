// Legacy manually entered profiles and application records share one ownership model.
// Normalize only surrounding kind whitespace; never infer identity from contact data.
export function isJewellerRecord(row){
  return !!row&&typeof row.kind==='string'&&['JEWELLER_APPLICATION','JEWELLER_PROFILE'].includes(row.kind.trim());
}
