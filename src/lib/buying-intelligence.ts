import type { AssetManifest, AssetRecord } from '@ames/engine';

export type IntentStage = 'BROWSING' | 'INTERESTED' | 'CONSIDERING' | 'HIGH_INTENT' | 'READY_TO_RESERVE';
export type IntentConfidenceMode = 'EXPLORING' | 'DISCOVERING' | 'NARROWING' | 'HIGH_INTENT' | 'READY';
export type IntentField = 'category'|'jewelry_type'|'purpose'|'recipient'|'style'|'shape'|'metal'|'budget_min'|'budget_max'|'currency'|'carat_preference'|'color_preference'|'clarity_preference'|'certification_preference'|'urgency'|'dislikes'|'location'|'sourcing_intent'|'reserve_intent'|'comparison_intent'|'human_desk_intent'|'language';
export type BuyingIntent = {
  stage: IntentStage;
  confidenceMode?: IntentConfidenceMode;
  overallConfidence?: number;
  confidence?: Partial<Record<IntentField, number>>;
  occasion?: string;
  recipient?: string;
  category?: AssetRecord['category'];
  budget?: number;
  metal?: string;
  shape?: string;
  size?: string;
  timing?: string;
  style?: string;
  mode?: 'browsing' | 'comparing' | 'enquiring' | 'reserving';
  jewelry_type?: AssetRecord['category'];
  purpose?: string;
  budget_min?: number;
  budget_max?: number;
  currency?: string;
  carat_preference?: string;
  color_preference?: string;
  clarity_preference?: string;
  certification_preference?: string;
  urgency?: string;
  dislikes?: string[];
  location?: string;
  sourcing_intent?: boolean;
  reserve_intent?: boolean;
  comparison_intent?: boolean;
  human_desk_intent?: boolean;
  language?: ConversationLanguage;
};

export type BoutiqueRecommendation = AssetRecord & { price?: number; metal?: string; specs?: string };
export type ConversationLanguage = 'en' | 'zh' | 'ar';
export function detectMessageLanguage(message: string): ConversationLanguage {
  if (/[؀-ۿ]/.test(message)) return 'ar';
  if (/[㐀-鿿]/.test(message)) return 'zh';
  return 'en';
}
const knownDetails: Record<string, { price: number; metal: string; specs: string }> = {
  'aurora solitaire': { price: 6800, metal: 'platinum', specs: '1.20 ct · D / VVS1' },
  'halo pendant': { price: 3900, metal: 'platinum', specs: '0.90 ct halo · D / VS1' },
  'stellar studs': { price: 2400, metal: 'platinum', specs: '1.00 ct pair · D / VS1' },
  'river bracelet': { price: 5200, metal: 'platinum', specs: '3.50 ct total · D-F / VS' },
};
const categories: Record<string, AssetRecord['category']> = { ring: 'ring', rings: 'ring', necklace: 'necklace', necklaces: 'necklace', earrings: 'earring', earring: 'earring', bracelet: 'bracelet', bracelets: 'bracelet', '戒指': 'ring', '婚戒': 'ring', '钻戒': 'ring', '项链': 'necklace', '耳环': 'earring', '耳钉': 'earring', '手链': 'bracelet', '手镯': 'bracelet', 'خاتم': 'ring', 'عقد': 'necklace', 'قلادة': 'necklace', 'أقراط': 'earring', 'حلق': 'earring', 'سوار': 'bracelet' };
const metals: Record<string, string> = { '铂金': 'platinum', '白金': 'white gold', '黄金': 'yellow gold', '玫瑰金': 'rose gold', '银': 'silver', 'البلاتين': 'platinum', 'ذهب أبيض': 'white gold', 'ذهب أصفر': 'yellow gold', 'ذهب وردي': 'rose gold', 'فضة': 'silver' };
const shapes: Record<string, string> = { '椭圆': 'oval', '椭圆形': 'oval', '圆形': 'round', '祖母绿': 'emerald', '梨形': 'pear', 'بيضاوي': 'oval', 'دائري': 'round', 'زمردي': 'emerald', 'كمثري': 'pear' };

/* CONFIDENCE_ENGINE_START */
export function updateBuyingIntent(previous: BuyingIntent, message: string): BuyingIntent {
  const value = message.toLowerCase();
  const next: BuyingIntent = { ...previous };
  for (const [word, category] of Object.entries(categories)) if (value.includes(word) || new RegExp(`\\b${word}\\b`).test(value)) next.category = category;
  const budget = value.match(/(?:\$|usd\s*|usd|\u7f8e\u5143|\u7f8e\u91d1|\u7f8e\u5143\u5de6\u53f3|dollar(?:s)?|dollars?|\u062f\u0648\u0644\u0627\u0631(?:\u0627\u062a)?)\s*(\d[\d,]*(?:\.\d+)?)(?:\s*k)?|\b(\d[\d,]*(?:\.\d+)?)(?:\s*k)?\s*(?:usd|\u7f8e\u5143|\u7f8e\u91d1|dollars?|\u062f\u0648\u0644\u0627\u0631(?:\u0627\u062a)?)/i);
  if (budget) { const raw = Number((budget[1] || budget[2]).replace(/,/g, '')); next.budget = /k\b/i.test(budget[0]) ? raw * 1000 : raw; }
  const metal = value.match(/\b(platinum|white gold|yellow gold|rose gold|silver)\b|铂金|白金|黄金|玫瑰金|银|(?:البلاتين|ذهب أبيض|ذهب أصفر|ذهب وردي|فضة)/i);
  if (metal) next.metal = metals[metal[0]] || metal[0];
  const shape = value.match(/\b(oval|round|emerald|pear|cushion|marquise|princess|asscher)\b|椭圆形?|圆形|祖母绿|梨形|(?:بيضاوي|دائري|زمردي|كمثري)/i);
  if (shape) next.shape = shapes[shape[0]] || shape[0];
  const occasion = value.match(/\b(anniversary|birthday|engagement|wedding|gift|occasion)\b|求婚|订婚|婚礼|生日|周年|礼物|(?:خطوبة|زفاف|عيد ميلاد|ذكرى|هدية)/i);
  if (occasion) next.occasion = occasion[0];
  const recipient = value.match(/\b(she|her|wife|partner|him|his|husband|my daughter|my mother)\b|她|妻子|丈夫|女儿|母亲|(?:لها|زوجتي|زوجي|ابنتي|والدتي)/i);
  if (recipient) next.recipient = recipient[0];
  const timing = value.match(/\b(today|tomorrow|this week|urgent|asap|soon|by christmas)\b|尽快|急需|今天|本周|(?:اليوم|غداً|عاجل|بأسرع وقت|هذا الأسبوع)/i);
  if (timing) next.timing = timing[0];
  if (/\b(reserve|hold|take it|secure)\b|预订|预定|保留|留着|(?:احجز|حجز|احتفظ)/i.test(value)) next.mode = 'reserving';
  else if (/\b(compare|cheaper|instead|different)\b|比较|便宜|换一个|(?:مقارنة|أرخص|بديل)/i.test(value)) next.mode = 'comparing';
  else if (/\b(enquire|enquiry|availability|available)\b|咨询|有货|可用|(?:استفسار|متاح|التوفر)/i.test(value)) next.mode = 'enquiring';
  else if (/\b(just looking|browsing)\b|随便看看|浏览|(?:مجرد مشاهدة|أتصفح)/i.test(value)) next.mode = 'browsing';
  if (/\bcheaper|less expensive|lower budget\b|便宜|预算低|أرخص|ميزانية أقل/i.test(value) && next.budget) next.budget = Math.round(next.budget * 0.75);
  const hasSpecifics = !!next.category && (!!next.budget || !!next.metal || !!next.shape);
  const confidence: Partial<Record<IntentField, number>> = { ...(previous.confidence || {}) };
  const mark = (field: IntentField, present: boolean, inferred = false) => { if (!present) return; const prior = confidence[field] || 0; confidence[field] = Math.min(1, Math.max(inferred ? 0.58 : 0.88, prior + (prior ? 0.06 : 0))); };
  if (next.category) { next.jewelry_type = next.category; mark('category', true); mark('jewelry_type', true); }
  if (next.budget) { next.budget_min = next.budget; next.budget_max = next.budget; next.currency = 'USD'; mark('budget_min', true); mark('budget_max', true); mark('currency', true); }
  if (next.metal) mark('metal', true);
  if (next.shape) mark('shape', true);
  if (next.occasion) { next.purpose = next.occasion; mark('purpose', true); }
  if (next.recipient) mark('recipient', true);
  if (next.timing) { next.urgency = next.timing; mark('urgency', true); }
  const style = value.match(/\b(solitaire|halo|minimal|classic|vintage|simple|three[- ]stone)\b/i); if (style) { next.style = style[0]; mark('style', true); }
  const carat = value.match(/\b(\d+(?:\.\d+)?)\s*(?:ct|carat|carats)\b/i); if (carat) { next.carat_preference = `${carat[1]} ct`; mark('carat_preference', true); }
  const clarity = value.match(/\b(FL|IF|VVS1|VVS2|VS1|VS2|SI1|SI2)\b/i); if (clarity) { next.clarity_preference = clarity[1].toUpperCase(); mark('clarity_preference', true); }
  const color = value.match(/\b(?:colour|color)\s*([D-Z])\b|\b([D-Z])\s*(?:colour|color)\b/i); if (color) { next.color_preference = (color[1] || color[2]).toUpperCase(); mark('color_preference', true); }
  const cert = value.match(/\b(GIA|IGI|AGS)\b/i); if (cert) { next.certification_preference = cert[1].toUpperCase(); mark('certification_preference', true); }
  const reserveIntent = next.mode === 'reserving'; if (reserveIntent) { next.reserve_intent = true; mark('reserve_intent', true); }
  const comparisonIntent = next.mode === 'comparing'; if (comparisonIntent) { next.comparison_intent = true; mark('comparison_intent', true); }
  const sourcingIntent = /\b(source|sourcing|find for me|special order|bespoke)\b|定制|寻找|(?:توريد|ابحث لي|مخصص)/i.test(value); if (sourcingIntent) { next.sourcing_intent = true; mark('sourcing_intent', true); }
  const humanIntent = /\b(human|someone|whatsapp|private consultation|pricing confirmation)\b|人工|顾问|微信|咨询|(?:موظف|شخص|واتساب|استشارة)/i.test(value); if (humanIntent) { next.human_desk_intent = true; mark('human_desk_intent', true); }
  const weights: [IntentField, number][] = [['category', .25], ['budget_min', .2], ['purpose', .15], ['shape', .15], ['metal', .15], ['urgency', .1]];
  const overall = Math.min(1, weights.reduce((sum, [field, weight]) => sum + (confidence[field] || 0) * weight, 0));
  next.confidence = confidence;
  next.overallConfidence = Number(overall.toFixed(2));
  next.confidenceMode = overall >= .9 ? 'READY' : overall >= .75 ? 'HIGH_INTENT' : overall >= .55 ? 'NARROWING' : overall >= .3 ? 'DISCOVERING' : 'EXPLORING';
  // Keep the established stage contract for downstream flows; confidenceMode is the finer-grained gate.
  next.stage = next.mode === 'reserving' ? 'READY_TO_RESERVE' : hasSpecifics && next.budget ? 'HIGH_INTENT' : hasSpecifics ? 'CONSIDERING' : next.category || next.shape ? 'INTERESTED' : 'BROWSING';
  next.language = detectMessageLanguage(message);
  return next;
}

export function nextBestQuestion(intent: BuyingIntent): string | null {
  const confidence = intent.confidence || {};
  if ((confidence.budget_min || 0) < .65) return intent.language === 'zh' ? '您心中的预算范围是多少？' : intent.language === 'ar' ? 'ما النطاق التقريبي للميزانية؟' : 'Do you have a budget range in mind?';
  if ((confidence.shape || 0) < .65 && intent.category === 'ring') return intent.language === 'zh' ? '您偏好哪一种钻石形状？' : intent.language === 'ar' ? 'أي شكل من الألماس تفضل؟' : 'Which diamond shape speaks to you?';
  if ((confidence.metal || 0) < .65) return intent.language === 'zh' ? '您偏好哪一种金属？' : intent.language === 'ar' ? 'أي معدن تفضل؟' : 'Do you have a preferred metal?';
  return null;
}

function numeric(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') { const n = Number(value.replace(/[$,]/g, '')); return Number.isFinite(n) ? n : undefined; }
  return undefined;
}
export function matchBoutiquePiece(manifest: AssetManifest, intent: BuyingIntent): BoutiqueRecommendation | null {
  if (!intent.category || !intent.budget || intent.stage === 'BROWSING' || intent.stage === 'INTERESTED') return null;
  const candidates = manifest.assets.filter(asset => asset.status === 'published' && asset.category === intent.category) as BoutiqueRecommendation[];
  const budget = intent.budget;
  if (budget === undefined) return null;
  const scored = candidates.map(asset => {
    const data = asset as BoutiqueRecommendation & Record<string, unknown>;
    const known = data.kind === 'JEWELLER_INVENTORY' ? undefined : knownDetails[asset.name.trim().toLowerCase()];
    const price = numeric(data.price) ?? known?.price;
    const metal = typeof data.metal === 'string' ? data.metal : known?.metal;
    const specs = typeof data.specs === 'string' ? data.specs : known?.specs;
    const text = [asset.name, ...(asset.tags || []), metal, specs].filter(Boolean).join(' ').toLowerCase();
    if (intent.metal && !text.includes(intent.metal.toLowerCase())) return { asset, score: -Infinity };
    if (intent.shape && !text.includes(intent.shape.toLowerCase()) && intent.category === 'ring') return { asset, score: -Infinity };
    const distance = price ? Math.abs(price - budget) / budget : 1;
    return { asset, score: 10 - distance * 10 + (price ? 2 : 0), price };
  }).filter(item => Number.isFinite(item.score)).sort((a, b) => b.score - a.score);
  if (!scored.length || scored[0].score < 3) return null;
  const item = scored[0];
  const known = (item.asset as unknown as Record<string,unknown>).kind === 'JEWELLER_INVENTORY' ? undefined : knownDetails[item.asset.name.trim().toLowerCase()];
  return Object.assign(item.asset, known || {}, item.price === undefined ? {} : { price: item.price });
}

export function recommendationLabel(piece: BoutiqueRecommendation): string {
  const data = piece as BoutiqueRecommendation & Record<string, unknown>;
  const specs = typeof data.specs === 'string' ? data.specs : [data.metal, ...(piece.tags || [])].filter(Boolean).join(' · ');
  return [piece.name, piece.category, specs, data.price ? `$${Number(data.price).toLocaleString()}` : 'Price on request'].filter(Boolean).join(' · ');
}
