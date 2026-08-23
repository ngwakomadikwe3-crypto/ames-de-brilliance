import { z } from "zod";

export const ParsedRequestSchema = z.object({
  buyerName: z.string().min(1), company: z.string().min(1),
  country: z.string().default(""), contact: z.string().min(1),
  type: z.enum(["Rough", "Polished"]), shape: z.string().min(1),
  caratMin: z.string().min(1), caratMax: z.string().min(1),
  color: z.string().min(1), clarity: z.string().min(1),
  certification: z.string().default("None"), notes: z.string().default(""),
});
export type ParsedRequest = z.infer<typeof ParsedRequestSchema>;

export const ParsedStoneSchema = z.object({
  stone_type: z.enum(["rough", "polished"]).default("polished"),
  shape: z.string().default(""), carat: z.number().positive(),
  color: z.string().min(1), clarity: z.string().default(""),
  cut: z.string().default(""), certification: z.string().default("None"),
  category: z.string().default(""), crystal_form: z.string().default(""),
  clarity_notes: z.string().default(""),
  kp_status: z.boolean().default(false),
  price: z.number().nullable().default(null),
  source: z.enum(["Own stock", "Consigned"]).default("Own stock"),
  traderName: z.string().default(""), traderWhatsapp: z.string().default(""),
  traderLicence: z.string().default(""),
  commission: z.number().min(0).max(100).default(0),
});
export type ParsedStone = z.infer<typeof ParsedStoneSchema>;

export const DraftReplySchema = z.object({ reply: z.string().min(1) });
export type DraftReply = z.infer<typeof DraftReplySchema>;

/* ── Parsed Stock interfaces ── */

export interface ParsedStockStone {
  type: "rough" | "polished";
  shape_or_form: string;
  category: string;
  carat: number;
  color: string;
  clarity: string;
  certification: string;
  price: number | null;
  notes: string;
}

export interface ParsedStockResult {
  stones: ParsedStockStone[];
  skipped: string[];
}

/* ── DeepSeek client ── */

const AI_BASE_URL = process.env.AI_BASE_URL || "https://api.deepseek.com";
const AI_MODEL = process.env.AI_MODEL || "deepseek-chat";

async function callDeepSeek(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");
  const url = AI_BASE_URL.replace(/\/$/, '') + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
  });
  if (!res.ok) { const body = await res.text(); throw new Error("DeepSeek " + res.status + ": " + body); }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function parseRequest(rawText: string): Promise<ParsedRequest> {
  const sys = "You are a diamond trade assistant. Parse raw text into a sourcing request. Return JSON: buyerName, company, country, contact, type (Rough/Polished), shape, caratMin (string), caratMax (string), color, clarity, certification, notes. Defaults for unknown. ONLY valid JSON.";
  const result = await callDeepSeek(sys, rawText);
  return ParsedRequestSchema.parse(JSON.parse(result));
}

export async function parseStone(rawText: string): Promise<ParsedStone> {
  const sys = "You are a diamond trade assistant for AMES DE BRILLIANCE (Botswana). Parse raw text into a stone entry. Determine if stone_type is 'rough' or 'polished'. For rough stones return: stone_type=\"rough\", carat, color, category (Sawable/Makeable/Near-gem/Industrial), crystal_form (Octahedron/Macle/Irregular), clarity_notes, kp_status (true/false). For polished return: stone_type=\"polished\", shape (Round Brilliant/Princess/Oval/Emerald/Cushion/Marquise/Pear/Heart), carat, color, clarity, cut, certification. Also: price (number|null), source (Own stock/Consigned), traderName, traderWhatsapp, traderLicence, commission. ONLY valid JSON.";
  const result = await callDeepSeek(sys, rawText);
  return ParsedStoneSchema.parse(JSON.parse(result));
}

export async function parseStock(rawText: string): Promise<ParsedStockResult> {
  const sys = `You are a diamond trade listing agent for AMES DE BRILLIANCE (Botswana). Parse the pasted stock text into a JSON array of stones.
Return JSON with two keys: "stones" (array) and "skipped" (array of raw lines you could not parse).

Each stone in "stones" must have:
- type: "rough" or "polished"
- shape_or_form: the shape (polished) or crystal form (rough), e.g. "Round Brilliant" or "Octahedron"
- category: for rough only — one of Sawable, Makeable, Near-gem, Industrial; empty string for polished
- carat: number
- color: string
- clarity: string (polished clarity grade or rough clarity notes)
- certification: string (GIA, IGI, HRD, None, etc.)
- price: number if explicitly stated in the text, otherwise null
- notes: any extra detail

RULES:
- Never invent values not present in the source text. If a field is missing, use sensible defaults (empty string, null, 0).
- If a line cannot be parsed as a stone entry at all, put the raw line in "skipped".
- Detect type automatically: keywords like "rough", "sawable", "makeable", "crystal" = rough; "round", "princess", "cut", "polished" = polished.
- Return ONLY valid JSON. No markdown, no explanation.`;
  const result = await callDeepSeek(sys, rawText);
  return JSON.parse(result) as ParsedStockResult;
}

export async function draftReply(requestMandate: string, context?: string): Promise<DraftReply> {
  const sys = "You are a sourcing assistant for AMES DE BRILLIANCE, licensed diamond dealer Botswana. Draft SHORT professional reply (3-5 sentences). RULES: Only draft text to copy. NEVER quote prices. NEVER discuss shipping/logistics. NEVER promise availability. Reference requirements. Mention sourcing underway. Return JSON with reply field.";
  const NL = String.fromCharCode(10);
  const userMsg = context
    ? "Buyer request:" + NL + requestMandate + NL + NL + "Context: " + context
    : "Buyer request:" + NL + requestMandate;
  const result = await callDeepSeek(sys, userMsg);
  return DraftReplySchema.parse(JSON.parse(result));
}

export async function draftOffer(requestSpecs: string, availableStones: string): Promise<string> {
  const sys = "You are the offer desk for AMES DE BRILLIANCE, a licensed diamond dealer in Botswana. Produce a plain-text offer sheet. List only stones from the provided inventory that plausibly match the buyer's specifications. Never invent stones, specifications or prices. If a stone has a price in the data, show it; otherwise write 'price on request'. Format: header with auto offer reference (OFF-0001 style) and today's date, buyer company name; one block per stone with reference, type, specs, price; then the lines: 'Validity 48 hours, subject to prior sale.' and 'All indications are subject to written confirmation and final verification against certificate.' and, if any listed stone is rough, 'Rough diamonds are offered only against a valid Kimberley Process import licence.' and the company licence line: 'AMES DE BRILLIANCE (Pty) Ltd - Licensed Diamond Dealer, Republic of Botswana, Licence No. [].' Return ONLY the plain text offer. No JSON wrapping.";
  const NL = String.fromCharCode(10);
  const userMsg = "BUYER REQUEST SPECS:" + NL + NL + requestSpecs + NL + NL + "AVAILABLE STONES:" + NL + NL + availableStones;
  return await callDeepSeek(sys, userMsg);
}

export async function draftSourcingAck(companyName: string): Promise<string> {
  const sys = `You are the offer desk for AMES DE BRILLIANCE, a licensed diamond dealer in Botswana. The buyer's requirements do not match any stones currently in inventory. Draft a short sourcing acknowledgement (3-4 sentences) confirming the mandate is being worked. Include today's date. End with these exact lines on separate lines: 'Validity 48 hours, subject to prior sale.' 'All indications are subject to written confirmation and final verification against certificate.' 'AMES DE BRILLIANCE (Pty) Ltd - Licensed Diamond Dealer, Republic of Botswana, Licence No. [].' Return ONLY the plain text. No JSON wrapping.`;
  return await callDeepSeek(sys, "Buyer: " + companyName + ". No matching stones in current inventory. Draft a sourcing acknowledgement.");
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try { return await fn(); } catch (err) { if (retries > 0) return withRetry(fn, retries - 1); throw err; }
}
