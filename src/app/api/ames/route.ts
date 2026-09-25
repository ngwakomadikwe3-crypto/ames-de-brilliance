import { NextRequest, NextResponse } from "next/server";
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { actionFromSameResponse } from '@/lib/chat-viewer-actions';

async function supportedChatActions(): Promise<string[]> {
  const path = join(process.cwd(), 'public', 'ames-engine', 'chat.json');
  const contract = JSON.parse(await readFile(path, 'utf8'));
  return contract.schemaVersion === 'ames.chat-content/1' && Array.isArray(contract.supportedViewerActions)
    ? contract.supportedViewerActions : [];
}

export async function POST(req: NextRequest) {
  const { query, conversation_id, user } = await req.json();

  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const apiKey = process.env.DIFY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DIFY_API_KEY not configured" }, { status: 500 });
  }

  const res = await fetch("https://api.dify.ai/v1/chat-messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      inputs: {},
      query,
      response_mode: "blocking",
      conversation_id: conversation_id || "",
      user: user || "web-visitor",
      auto_generate_name: true,
    }),
  });

  const data = await res.json();
  const supported = await supportedChatActions().catch(() => []);
  const viewerAction = actionFromSameResponse(query, data.viewer_action ?? data.outputs?.viewer_action, supported);
  return NextResponse.json(viewerAction ? { ...data, viewer_action: viewerAction } : data);
}
