import { NextRequest, NextResponse } from "next/server";
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { actionFromSameResponse } from '@/lib/chat-viewer-actions';
import { loadChatStageContent } from '@/lib/ames-chat-content';

async function supportedChatActions(assetId?: string): Promise<string[]> {
  const content = await loadChatStageContent(assetId, async input => {
    const url = String(input);
    if (!/^\/ames-engine\/(?:chat\/index\.json|[a-z0-9][a-z0-9-]*\/app\/(?:chat|asset)\.json)$/.test(url)) {
      throw new Error('Invalid Chat metadata path');
    }
    const body = await readFile(join(process.cwd(), 'public', url.slice(1)), 'utf8');
    return new Response(body);
  });
  return content.contract.supportedViewerActions;
}

export async function POST(req: NextRequest) {
  const { query, conversation_id, user, assetId } = await req.json();

  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  if (assetId != null && typeof assetId !== 'string') {
    return NextResponse.json({ error: 'Invalid Chat assetId' }, { status: 400 });
  }
  let supported: string[];
  try {
    supported = await supportedChatActions(assetId ?? undefined);
  } catch {
    return NextResponse.json({ error: 'Selected Chat asset is unavailable' }, { status: 400 });
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
  const viewerAction = actionFromSameResponse(query, data.viewer_action ?? data.outputs?.viewer_action, supported);
  return NextResponse.json(viewerAction ? { ...data, viewer_action: viewerAction } : data);
}
