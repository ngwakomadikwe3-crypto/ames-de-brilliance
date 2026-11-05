import { z } from 'zod';


export const reviewChecks = ['identity', 'physicalMatch', 'sellerAuthority', 'provenance', 'licensing'] as const;
const text = z.string().trim().max(2000);



const date = z.string().refine(value => value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value), 'Enter a valid calendar date');
export const licenceSchema = z.object({
  requirement: z.enum(['unknown', 'required', 'not-required']),
  holder: text, role: text, authority: text, number: text, scope: text,
  validFrom: date, expiresOn: date, verifiedOn: date,
  scopeConfirmed: z.boolean(), evidence: text,
}).strict();
export type LicenceReview = z.infer<typeof licenceSchema>;
export const emptyLicenceReview = (): LicenceReview => ({
  requirement: 'unknown', holder: '', role: '', authority: '', number: '', scope: '',
  validFrom: '', expiresOn: '', verifiedOn: '', scopeConfirmed: false, evidence: '',
});
export const botswanaLicensingSchema = z.object({
  operator: licenceSchema, seller: licenceSchema,
}).strict();
export const emptyBotswanaLicensing = () => ({ operator: emptyLicenceReview(), seller: emptyLicenceReview() });

/** Business review gate, not an automatic interpretation of Botswana licensing law. */
export function botswanaLicenceBlockers(licensing: z.infer<typeof botswanaLicensingSchema>, now = new Date()): string[] {
  // Botswana civil dates (UTC+02:00), inclusive through the recorded expiry date.
  const today = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const errors: string[] = [];
  for (const party of ['operator', 'seller'] as const) {
    const review = licensing[party];
    const label = `Botswana ${party} licensing`;
    if (review.requirement === 'unknown') { errors.push(`${label}: assess whether a licence is required.`); continue; }
    if (!review.holder || !review.role || !review.authority || !review.evidence || !review.scope || !review.scopeConfirmed) errors.push(`${label}: record the legal entity, role, authority or legal basis, applicable scope and verification evidence.`);
    if (!review.verifiedOn || review.verifiedOn > today) errors.push(`${label}: record a verification date that is not in the future.`);
    if (review.requirement === 'required') {
      if (!review.number || !review.validFrom || !review.expiresOn) errors.push(`${label}: record the licence number and validity dates.`);
      if (review.validFrom && review.validFrom > today) errors.push(`${label}: licence is not yet valid.`);
      if (review.expiresOn && review.expiresOn < today) errors.push(`${label}: licence has expired.`);
      if (review.validFrom && review.expiresOn && review.validFrom > review.expiresOn) errors.push(`${label}: expiry precedes the start date.`);
    }
  }
  return errors;
}

const check = z.object({ checked: z.boolean(), evidence: text });
export const stoneReviewSchema = z.object({
  botswanaLicensing: botswanaLicensingSchema.default(emptyBotswanaLicensing),
  title: z.string().trim().max(160),
  species: z.enum(['unknown', 'diamond', 'ruby', 'sapphire', 'emerald', 'other-precious-stone']),
  otherSpecies: z.string().trim().max(100),
  form: z.enum(['unknown', 'rough', 'polished']),
  origin: z.enum(['unknown', 'natural', 'laboratory-grown', 'simulant']),
  treatments: z.enum(['unknown', 'none-reported', 'treated']),
  treatmentDetails: text,
  carats: z.number().finite().nonnegative(),
  measurements: z.string().trim().max(200),
  gradeSummary: text,
  reportStatus: z.enum(['unknown', 'verified', 'not-issued']),
  laboratory: z.string().trim().max(100), reportNumber: z.string().trim().max(100),
  reportUrl: z.union([z.literal(''), z.string().url().refine(value => value.startsWith('https://'), 'Use HTTPS')]),
  reportEvidence: text,
  tradeScope: z.enum(['unknown', 'domestic', 'cross-border']), kpEvidence: text,
  checks: z.object({ identity: check, physicalMatch: check, sellerAuthority: check, provenance: check, licensing: check }),
}).strict();
export type StoneReview = z.infer<typeof stoneReviewSchema>;
export function emptyStoneReview(): StoneReview {
  return { botswanaLicensing: emptyBotswanaLicensing(), title: '', species: 'unknown', otherSpecies: '', form: 'unknown', origin: 'unknown', treatments: 'unknown', treatmentDetails: '', carats: 0,
    measurements: '', gradeSummary: '', reportStatus: 'unknown', laboratory: '', reportNumber: '', reportUrl: '', reportEvidence: '', tradeScope: 'unknown', kpEvidence: '',
    checks: { identity: {checked:false,evidence:''}, physicalMatch:{checked:false,evidence:''},sellerAuthority:{checked:false,evidence:''},provenance:{checked:false,evidence:''},licensing:{checked:false,evidence:''} } };
}
export function publicationBlockers(review: StoneReview, available: boolean, sellerActive: boolean): string[] {
  const errors: string[] = botswanaLicenceBlockers(review.botswanaLicensing);
  if (!available) errors.push('The inventory stone must be Available.');
  if (!sellerActive) errors.push('The consigned seller must be active.');
  if (!review.title) errors.push('Enter the public stone title.');
  if (review.species === 'unknown' || (review.species === 'other-precious-stone' && !review.otherSpecies)) errors.push('Identify the stone species.');
  if (review.form === 'unknown') errors.push('Identify rough or polished form.');
  if (review.origin === 'unknown' || review.origin === 'simulant') errors.push('Declare natural or laboratory-grown origin; simulants cannot enter this stone catalogue.');
  if (review.treatments === 'unknown' || (review.treatments === 'treated' && !review.treatmentDetails)) errors.push('Complete treatment disclosure.');
  if (!(review.carats > 0) || !review.measurements) errors.push('Record measured carat weight and dimensions.');
  if (review.reportStatus === 'unknown') errors.push('Record report status.');
  if (review.reportStatus === 'verified' && (!review.laboratory || !review.reportNumber || !review.reportUrl || !review.reportEvidence)) errors.push('Record the laboratory, report number, verification URL and check evidence.');
  if (review.reportStatus === 'not-issued' && !review.reportEvidence) errors.push('Explain the absence of a laboratory report and record supporting identification evidence.');
  if (review.tradeScope === 'unknown') errors.push('Record the intended domestic or cross-border trade scope.');
  if (review.species === 'diamond' && review.form === 'rough' && review.origin === 'natural' && review.tradeScope === 'cross-border' && !review.kpEvidence) errors.push('Record applicable rough-diamond Kimberley Process shipment evidence.');
  for (const key of reviewChecks) if (!review.checks[key].checked || !review.checks[key].evidence.trim()) errors.push(`Complete ${key} verification with an evidence reference.`);
  return errors;
}
export function publicationMatches(draftId: string, draftHash: string, liveHash: string, receipt: { draftId: string; sourceHash: string } | null): boolean {
  return !!receipt && receipt.draftId === draftId && receipt.sourceHash === draftHash && draftHash === liveHash;
}
export function publicStoneRecord(stoneId: string, ref: string, review: StoneReview) {
  return { stoneId, ref, title: review.title, species: review.species === 'other-precious-stone' ? review.otherSpecies : review.species,
    form: review.form, origin: review.origin, treatments: review.treatments, treatmentDetails: review.treatmentDetails,
    carats: review.carats, measurements: review.measurements, gradeSummary: review.gradeSummary,
    laboratory: review.reportStatus === 'verified' ? review.laboratory : '', reportNumber: review.reportStatus === 'verified' ? review.reportNumber : '',
    reportUrl: review.reportStatus === 'verified' ? review.reportUrl : '', reportStatus: review.reportStatus };
}
export type PublicStoneRecord = ReturnType<typeof publicStoneRecord>;
