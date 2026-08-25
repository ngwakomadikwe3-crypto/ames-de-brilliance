import { NextRequest, NextResponse } from "next/server";
import { ensureReady, getDb, getStorage, doc, nowISO, DB_ID, REPORTS_BUCKET } from "@/lib/appwrite";
import { ID, Query } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { ReportPDF } from "@/lib/report-pdf";

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";

interface AggregatedData {
  reportType: string;
  issueLabel: string;
  tierLabel: string;
  period: { start: string; end: string };
  stones: {
    total: number;
    byCategory: Record<string, number>;
    priceMin: number | null;
    priceMax: number | null;
    priceMedian: number | null;
  };
  orders: {
    total: number;
    reserved: number;
    sold: number;
    totalValue: number;
  };
  topQuestions: string[];
  generatedAt: string;
}

async function aggregateData(reportType: string): Promise<AggregatedData> {
  const db = getDb();
  const now = new Date();
  const periodStart = reportType === "ground_report"
    ? new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
    : new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
  const periodEnd = now.toISOString();
  const label = reportType === "ground_report"
    ? `Ground Report — ${now.toLocaleString("en-US", { month: "long", year: "numeric" })}`
    : `Compliance Briefing — Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;

  // Stones
  const stoneRes = await db.listDocuments({
    databaseId: DB_ID, collectionId: "stones",
    queries: [Query.limit(1000)],
  });
  const stones = stoneRes.documents.map(d => doc<any>(d));
  const byCategory: Record<string, number> = {};
  const prices: number[] = [];
  for (const s of stones) {
    const cat = s.listing_category || "Other";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    if (s.price && s.price > 0) prices.push(s.price);
  }
  prices.sort((a, b) => a - b);

  // Orders in period
  const orderRes = await db.listDocuments({
    databaseId: DB_ID, collectionId: "orders",
    queries: [Query.greaterThanEqual("created_at", periodStart), Query.limit(1000)],
  });
  const orders = orderRes.documents.map(d => doc<any>(d));
  const reserved = orders.filter((o: any) => o.status === "Reserved").length;
  const sold = orders.filter((o: any) => o.status === "Paid" || o.status === "Closed").length;
  const totalValue = orders.reduce((sum: number, o: any) => sum + (o.price || 0), 0);

  // Top questions from chat messages
  const chatRes = await db.listDocuments({
    databaseId: DB_ID, collectionId: "chat_messages",
    queries: [Query.equal("role", "user"), Query.limit(200), Query.orderDesc("created_at")],
  });
  const userMsgs = chatRes.documents.map(d => doc<any>(d));
  // Deduplicate by similarity (simple: take first 10 unique-ish messages)
  const seen = new Set<string>();
  const topQuestions: string[] = [];
  for (const m of userMsgs) {
    const key = m.text.toLowerCase().slice(0, 40);
    if (!seen.has(key)) {
      seen.add(key);
      topQuestions.push(m.text.slice(0, 120));
      if (topQuestions.length >= 10) break;
    }
  }

  const issueLabel = reportType === "ground_report"
    ? `Ground Report — ${now.toLocaleString("en-US", { month: "long", year: "numeric" })}`
    : `Compliance Briefing — Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;

  const tierLabel = reportType === "ground_report"
    ? "Tier I \u2014 Briefing"
    : "Tier I \u2014 Briefing";

  return {
    reportType,
    issueLabel,
    tierLabel,
    period: { start: periodStart, end: periodEnd },
    stones: {
      total: stones.length,
      byCategory,
      priceMin: prices.length ? prices[0] : null,
      priceMax: prices.length ? prices[prices.length - 1] : null,
      priceMedian: prices.length ? prices[Math.floor(prices.length / 2)] : null,
    },
    orders: {
      total: orders.length,
      reserved,
      sold,
      totalValue,
    },
    topQuestions,
    generatedAt: now.toISOString(),
  };
}

const STYLE_GUIDE = `You are the intelligence desk of AMES DE BRILLIANTE, a licensed diamond dealer in Botswana. Write in a calm, authoritative voice — precise, never speculative, never promotional. Use only the data provided. Write four sections:

1. Market Overview — current inventory snapshot and price range
2. On the Ground — what is active right now (reserves, sales, movement)
3. Demand Signals — anonymised buyer questions and what they reveal
4. Compliance Notes — any notes on Kimbere Process or licensing status

Rules:
- Use only the numbers provided. Do not invent statistics, prices, or trends.
- If data is insufficient for a section, say so plainly.
- Tone: like a handwritten note from a trusted dealer, not a corporate report.
- Keep each section to 2-4 paragraphs.
- Total length: 600-900 words.`;

async function generateWithDeepSeek(data: AggregatedData): Promise<string> {
  if (!DEEPSEEK_KEY) {
    return `AMES Intelligence — ${data.issueLabel}\n\n[DeepSeek API key not configured. Report data summary below.]\n\nStones in inventory: ${data.stones.total}\nBy category: ${Object.entries(data.stones.byCategory).map(([k,v]) => `${k}: ${v}`).join(", ")}\nPrice range: ${data.stones.priceMin ? `$${data.stones.priceMin.toLocaleString()}` : "N/A"} – ${data.stones.priceMax ? `$${data.stones.priceMax.toLocaleString()}` : "N/A"}\nOrders this period: ${data.orders.total} (${data.orders.reserved} reserved, ${data.orders.sold} sold)\nTotal value: $${data.orders.totalValue.toLocaleString()}\n\nTop buyer questions:\n${data.topQuestions.map((q, i) => `${i+1}. ${q}`).join("\n") || "None recorded."}`;
  }

  const userPrompt = `Here is the aggregated data for this period:\n\nPeriod: ${data.period.start} to ${data.period.end}\nStones in inventory: ${data.stones.total}\nBy category: ${JSON.stringify(data.stones.byCategory)}\nPrice range: ${data.stones.priceMin} to ${data.stones.priceMax} (median: ${data.stones.priceMedian})\nOrders this period: ${data.orders.total} (${data.orders.reserved} reserved, ${data.orders.sold} sold)\nTotal order value: ${data.orders.totalValue}\nTop buyer questions:\n${data.topQuestions.map((q, i) => `${i+1}. ${q}`).join("\n") || "None recorded."}\n\nWrite the four sections now.`;

  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: STYLE_GUIDE },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) throw new Error(`DeepSeek API error: ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "Failed to generate report.";
}

export async function GET(req: NextRequest) {
  // Vercel cron calls GET with ?type=...
  const type = req.nextUrl.searchParams.get("type") || "ground_report";
  try {
    await ensureReady();
    const data = await aggregateData(type);
    const prose = await generateWithDeepSeek(data);
    const pdfBuffer = await renderToBuffer(      // @ts-expect-error react-pdf types
      React.createElement(ReportPDF, { data, prose })
    );

    const sto = getStorage();
    const filename = `intelligence-${type}-${ID.unique()}.pdf`;
    const file = await sto.createFile({
      bucketId: REPORTS_BUCKET,
      fileId: ID.unique(),
      file: InputFile.fromBuffer(pdfBuffer, filename),
      permissions: [],
    });
    const pdfUrl = `${process.env.APPWRITE_ENDPOINT}/storage/buckets/${REPORTS_BUCKET}/files/${file.$id}/view?project=${process.env.APPWRITE_PROJECT_ID}`;
    const db = getDb();
    await db.createDocument({
      databaseId: DB_ID,
      collectionId: "report_issues",
      documentId: ID.unique(),
      data: { report_type: type, issue_label: data.issueLabel, pdf_url: pdfUrl, created_at: nowISO() },
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[intelligence/cron]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureReady();
    const body = await req.json();
    const reportType = body.reportType || "ground_report";

    // 1. Aggregate data
    const data = await aggregateData(reportType);

    // 2. Generate prose
    const prose = await generateWithDeepSeek(data);

    // 3. Render PDF
    const pdfBuffer = await renderToBuffer(
      // @ts-expect-error react-pdf types
      React.createElement(ReportPDF, { data, prose })
    );

    // 4. Upload to Appwrite Storage
    const sto = getStorage();
    const filename = `intelligence-${reportType}-${ID.unique()}.pdf`;
    const file = await sto.createFile({
      bucketId: REPORTS_BUCKET,
      fileId: ID.unique(),
      file: InputFile.fromBuffer(pdfBuffer, filename),
      permissions: [/* inherit bucket permissions */],
    });

    const pdfUrl = `${process.env.APPWRITE_ENDPOINT}/storage/buckets/${REPORTS_BUCKET}/files/${file.$id}/view?project=${process.env.APPWRITE_PROJECT_ID}`;

    // 5. Save record
    const db = getDb();
    const now = nowISO();
    const issue = await db.createDocument({
      databaseId: DB_ID,
      collectionId: "report_issues",
      documentId: ID.unique(),
      data: {
        report_type: reportType,
        issue_label: data.issueLabel,
        pdf_url: pdfUrl,
        created_at: now,
      },
    });

    return NextResponse.json({ ...doc(issue), data });
  } catch (err: any) {
    console.error("[intelligence/generate]", err);
    return NextResponse.json({ error: err.message || "Generation failed" }, { status: 500 });
  }
}
