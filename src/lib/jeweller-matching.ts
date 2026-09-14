import type { BuyingIntent } from './buying-intelligence';

export type JewellerProfile = {
  id: string;
  businessName: string;
  location?: string;
  countriesServed?: string[];
  languages?: string[];
  categories?: string[];
  shapes?: string[];
  metals?: string[];
  priceBands?: Array<{ min?: number; max?: number; currency?: string }>;
  bespoke?: boolean;
  looseDiamonds?: boolean;
  certifications?: string[];
  provenance?: boolean;
  deliveryCountries?: string[];
  leadTimeDays?: number;
  appointment?: boolean;
  reserve?: boolean;
  afterSales?: boolean;
  returns?: boolean;
  verified?: boolean;
  verificationStatus?: 'APPLIED'|'UNDER_REVIEW'|'VERIFIED'|'REJECTED'|'SUSPENDED';
  responseReliability?: number;
  responseTimeHours?: number;
  fulfillmentSuccess?: number;
  customerSatisfaction?: number;
  inventoryFreshness?: number;
  lastVerifiedAt?: string;
};

export function isMatchingEligible(profile: JewellerProfile): boolean {
  // Status is authoritative for onboarded jewellers. `verified` preserves
  // compatibility with approved profiles created before onboarding existed.
  return profile.verificationStatus ? profile.verificationStatus === 'VERIFIED' : profile.verified === true;
}

export type JewellerMatch = {
  jewellerId: string;
  businessName: string;
  matchScore: number;
  trustScore: number;
  reasons: string[];
  gaps: string[];
  hardFailures: string[];
  status: 'CANDIDATE';
};

const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const norm = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const has = (values: string[]|undefined, value: unknown) => { const target=norm(value); return Boolean(target && values?.some(item=>norm(item)===target)); };
const includesAny = (values: string[]|undefined, targets: unknown[]) => targets.some(target=>has(values,target));
const inBand = (profile: JewellerProfile, budget: number|undefined) => !budget || !profile.priceBands?.length || profile.priceBands.some(b=>(b.min===undefined||budget>=b.min)&&(b.max===undefined||budget<=b.max));

export function trustScore(profile: JewellerProfile, now = Date.now()): number {
  let score = 35;
  if (profile.verified === true) score += 25;
  if (profile.responseReliability !== undefined) score += Math.max(0, Math.min(15, profile.responseReliability * 15));
  if (profile.fulfillmentSuccess !== undefined) score += Math.max(0, Math.min(15, profile.fulfillmentSuccess * 15));
  if (profile.customerSatisfaction !== undefined) score += Math.max(0, Math.min(5, profile.customerSatisfaction * 5));
  if (profile.inventoryFreshness !== undefined) score += Math.max(0, Math.min(5, profile.inventoryFreshness * 5));
  if (profile.lastVerifiedAt) { const age = now - Date.parse(profile.lastVerifiedAt); if (Number.isFinite(age) && age > 31536000000) score -= Math.min(15, Math.floor(age / 31536000000) * 5); }
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function matchJeweller(intent: BuyingIntent, profile: JewellerProfile, options: { country?: string; requiredCertification?: string; now?: number } = {}): JewellerMatch {
  const reasons:string[] = [], gaps:string[] = [], hardFailures:string[] = [];
  const budget = finite(intent.budget_max ?? intent.budget);
  const category = intent.category || intent.jewelry_type;
  if (category && has(profile.categories, category)) reasons.push('correct category'); else if (category) gaps.push('category capability is unconfirmed');
  if (intent.shape && has(profile.shapes, intent.shape)) reasons.push(`${intent.shape} inventory`); else if (intent.shape) gaps.push(`${intent.shape} inventory unconfirmed`);
  if (intent.metal && has(profile.metals, intent.metal)) reasons.push(`${intent.metal} capability`); else if (intent.metal && profile.metals) hardFailures.push('required metal unavailable');
  if (budget && inBand(profile,budget)) reasons.push('within budget'); else if (budget && profile.priceBands?.length) hardFailures.push('budget ceiling or band mismatch');
  if (intent.currency && profile.priceBands?.length && !profile.priceBands.some(b=>!b.currency||norm(b.currency)===norm(intent.currency))) gaps.push('currency support unconfirmed');
  if (intent.certification_preference && !has(profile.certifications,intent.certification_preference)) hardFailures.push('required certification unavailable');
  if (options.country && profile.countriesServed && !has(profile.countriesServed,options.country) && profile.deliveryCountries && !has(profile.deliveryCountries,options.country)) hardFailures.push('does not serve destination country');
  if (intent.urgency && profile.leadTimeDays !== undefined) { const days=Number.parseInt(intent.urgency,10); if (Number.isFinite(days) && profile.leadTimeDays<=days) reasons.push('delivery window fits'); else if (profile.leadTimeDays>21) hardFailures.push('delivery deadline is not feasible'); }
  if (intent.sourcing_intent && profile.bespoke===true) reasons.push('bespoke sourcing capability');
  if (intent.language && includesAny(profile.languages,[intent.language, intent.language==='zh'?'Chinese':intent.language==='ar'?'Arabic':'English'])) reasons.push('language capability');
  if (profile.verified===true) reasons.push('verified jeweller');
  if ((profile.responseReliability ?? 0) >= .8) reasons.push('strong response reliability');
  if (!profile.afterSales) gaps.push('after-sales support unconfirmed');
  if (!profile.returns) gaps.push('return policy unconfirmed');
  if (!profile.leadTimeDays) gaps.push('lead time unconfirmed');
  const weights = [
    [Boolean(category && has(profile.categories,category)),20], [Boolean(intent.shape && has(profile.shapes,intent.shape)),15],
    [Boolean(intent.metal && has(profile.metals,intent.metal)),15], [Boolean(budget && inBand(profile,budget)),15],
    [Boolean(intent.certification_preference && has(profile.certifications,intent.certification_preference)),8],
    [Boolean(profile.leadTimeDays !== undefined && hardFailures.every(v=>!v.includes('deadline'))),10],
    [Boolean(options.country && (has(profile.countriesServed,options.country)||has(profile.deliveryCountries,options.country))),7],
    [Boolean(intent.sourcing_intent && profile.bespoke),5], [true,5]
  ] as Array<[boolean,number]>;
  let match = weights.reduce((sum,[ok,weight])=>sum+(ok?weight:0),0);
  if (!category && !intent.sourcing_intent) match += 10;
  if (reasons.includes('verified jeweller')) match += 3;
  match -= hardFailures.length * 22;
  return { jewellerId:profile.id, businessName:profile.businessName, matchScore:Math.max(0,Math.min(100,Math.round(match))), trustScore:trustScore(profile,options.now), reasons, gaps, hardFailures, status:'CANDIDATE' };
}

export function rankJewellers(intent: BuyingIntent, profiles: JewellerProfile[], options: { country?: string; requiredCertification?: string; now?: number } = {}): JewellerMatch[] {
  return profiles.map(profile=>matchJeweller(intent,profile,options)).filter(match=>match.matchScore>0).sort((a,b)=>b.matchScore-a.matchScore||b.trustScore-a.trustScore||a.jewellerId.localeCompare(b.jewellerId));
}
