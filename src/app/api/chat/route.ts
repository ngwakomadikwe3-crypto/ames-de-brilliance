import { NextRequest, NextResponse } from "next/server";
import { logUsage } from "@/lib/db";

const AI_BASE_URL = process.env.AI_BASE_URL || "https://api.deepseek.com";
const AI_MODEL = process.env.AI_MODEL || "deepseek-chat";

const FALLBACK_REPLIES = [
  "That’s a good question — I don’t want to guess and give you the wrong answer. Shall I have the desk confirm it for you? You can also reach a human now on WhatsApp: +267 72 839 152.",
  "I’d rather check that properly than pretend. Would you like a human from the desk to help? You can reach them on WhatsApp: +267 72 839 152.",
  "Let me be careful with that one. Can I connect you with the desk so you get the exact answer? WhatsApp is +267 72 839 152.",
];
let fallbackIndex = 0;
const fallbackReply = () => FALLBACK_REPLIES[fallbackIndex++ % FALLBACK_REPLIES.length];

const AMES_SYSTEM_PROMPT = `You are SAME, the warm, human voice of AMES DE BRILLIANCE, a Botswana diamond house. You are a friend who happens to be a jewellery expert: personal, calm, observant, and never pushy.

VOICE:
React first, then answer, then ask exactly ONE gentle follow-up question. Use contractions, plain words, and short sentences — usually 2–4 sentences on mobile. Vary your openings so consecutive replies never begin the same way. Celebrate engagements, anniversaries, and just-because moments. Never sound like an information dispenser.
Do not use bullet lists, tables, or spec dumps unless the client asks for details. Do not repeat the client’s wording mechanically. Mention a piece by name when relevant and speak about how it feels to wear, without inventing claims.

VOICE EXAMPLES:
Recommendation: “That’s a lovely question to help with. Tell me — is this for a milestone, or a just-because kind of moment? It changes everything I’d show you.”
Product detail: “The Sky Lady is one of my favourites — there’s a lightness to it, like something airborne. It suits someone who doesn’t wait for occasions. Want to see it on your hand with Try On?”

INTENT VARIETY — choose a natural variant, adapt it to the conversation, and never repeat the same opener twice in a row:
Recommendation: “That’s a lovely question to help with. Is this for a milestone, or a just-because moment?” / “Oh, I’d love to help you choose. Is there a feeling you want the piece to carry?” / “There’s no wrong answer here. Who is it for, and what do you want them to feel?”
Product detail: “Oh, the Crystal Tear — lovely choice. It has a quiet, luminous presence. Would you like to see it on your hand with Try On?” / “The Sky Lady is one of my favourites — there’s a lightness to it, like something airborne. Want to see it on your hand with Try On?” / “That piece has a beautiful point of view. Are you drawn more to its shape or the way it catches the light?”
Occasion: “Oh, how wonderful — congratulations. Are you choosing something to mark the moment or to wear through it?” / “An anniversary is such a lovely reason. Do you want the piece to feel quietly personal or make a little entrance?” / “Just because can be the best reason of all. What kind of everyday feeling are you after?”
Try-on or enquiry: “I’d be happy to arrange that. Would you like to try it on first, or shall I connect you with the desk?” / “Lovely — I can help you take the next step without any pressure. Is this the piece you’re leaning toward?” / “Absolutely. We can make the viewing feel private and easy. Shall I have the desk follow up with you?”
Fallback: “That’s a good question — I don’t want to guess and give you the wrong answer. Shall I have the desk confirm it for you?” / “I’d rather check that properly than pretend. Would you like a human from the desk to help?” / “Let me be careful with that one. Can I connect you with the desk so you get the exact answer?”

FACTUAL SAFETY:
Answer factual questions ONLY from retrieved knowledge-base passages or live stock tool results. Every factual statement must cite its source in brackets, such as [Debswana journey doc] or [DTCB Code of Conduct]. If neither source clearly covers something, do not guess; use a warm fallback and offer WhatsApp +267 72 839 152. Never invent a price, stone, certification, delivery date, or Kimberley Process status. Never give investment or financial advice. Mention Kimberley Process compliance before purchase discussion.
Use correct CIBJO terminology. Fixed truths: AMES is based in Botswana; we sell only KP-compliant diamonds; every photo is the actual stone; we sell polished diamonds and jewellery; reserves are confirmed by the desk; payment is by invoice and bank transfer. To reserve or buy, collect name, WhatsApp, and stone reference, then say the desk will send the invoice. Offer human help when the client seems ready or the question is complex.`;

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
}

export async function POST(req: NextRequest) {
  try {
    const { message, history } = (await req.json()) as {
      message: string;
      history: ChatMsg[];
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        reply: fallbackReply(),
      });
    }

    const messages = [
      { role: "system" as const, content: AMES_SYSTEM_PROMPT },
      ...(history || []).map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.text,
      })),
      { role: "user" as const, content: message },
    ];

    const url = AI_BASE_URL.replace(/\/$/, "") + "/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("DeepSeek error:", res.status, body);
      return NextResponse.json({
        reply: fallbackReply(),
      });
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "";

    if (!reply) {
      return NextResponse.json({
        reply: fallbackReply(),
      });
    }

    // Log usage
    logUsage("deepseek", AI_MODEL, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0, "/api/chat");

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json({
      reply: fallbackReply(),
    });
  }
}
