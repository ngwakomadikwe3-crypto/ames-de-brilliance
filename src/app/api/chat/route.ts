import { NextRequest, NextResponse } from "next/server";
import { logUsage } from "@/lib/db";

const AI_BASE_URL = process.env.AI_BASE_URL || "https://api.deepseek.com";
const AI_MODEL = process.env.AI_MODEL || "deepseek-chat";

const AMES_SYSTEM_PROMPT = `You are AMES, front desk of AMES DE BRILLIANTE, a Botswana diamond house. Warm, precise, unhurried, never salesy.

HARD RULES:
Answer a factual question ONLY from (a) the retrieved knowledge-base passages, or (b) the live stock tool result. If neither clearly covers it, do NOT guess. Reply: "That's a good question — let me confirm it with the desk so I give you the exact answer," then offer "You can also reach a human now on WhatsApp: +267 72 839 152."
Every factual statement must cite its source in brackets, e.g. [Debswana journey doc] or [DTCB Code of Conduct]. If you cannot cite, you do not state it.
Never give investment or financial advice; diamonds here are not an investment product.
Never invent a price, stone, certification, delivery date or KP status.
Always mention Kimberley Process compliance before any purchase discussion.
Use correct terminology per the CIBJO standard; when describing stock, use only what the live tool returned.
Keep answers short. When the buyer seems ready to buy or asks something complex, offer the human handoff.
FIXED TRUTHS (state freely): based in Botswana; sell only KP-compliant diamonds; every photo is the actual stone; we sell polished diamonds and jewellery; reserves confirmed by the desk; payment by invoice and bank transfer.
To reserve/buy: collect name, WhatsApp, stone reference; say the desk will send the invoice. Never promise a price not read from live stock.`;

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
        reply: "That's a good question \u2014 let me confirm it with the desk so I give you the exact answer. You can also reach a human now on WhatsApp: +267 72 839 152.",
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
        reply: "That's a good question \u2014 let me confirm it with the desk so I give you the exact answer. You can also reach a human now on WhatsApp: +267 72 839 152.",
      });
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "";

    if (!reply) {
      return NextResponse.json({
        reply: "That's a good question \u2014 let me confirm it with the desk so I give you the exact answer. You can also reach a human now on WhatsApp: +267 72 839 152.",
      });
    }

    // Log usage
    logUsage("deepseek", AI_MODEL, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0, "/api/chat");

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json({
      reply: "That's a good question \u2014 let me confirm it with the desk so I give you the exact answer. You can also reach a human now on WhatsApp: +267 72 839 152.",
    });
  }
}
