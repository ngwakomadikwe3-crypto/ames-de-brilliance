// Synthetic licence evidence only. Never used by production code.
export function reviewedLicensing() {
 const record = () => ({requirement:'required',holder:'PRIVATE test company',role:'Seller',authority:'PRIVATE test authority',number:'PRIVATE TEST-1',scope:'Test activity and stone scope',validFrom:'2020-01-01',expiresOn:'2099-12-31',verifiedOn:'2020-01-01',scopeConfirmed:true,evidence:'PRIVATE test verification reference'});
 return {operator:record(),seller:record()};
}
