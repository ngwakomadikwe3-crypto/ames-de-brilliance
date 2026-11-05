import { checkChatOrigin, requireVisitor, ownedChat, readChatJson, consumeQuota, chatFailure, ChatError, privateHeaders } from '@/lib/chat-security';
import { getDb, DB_ID, nowISO, doc } from '@/lib/appwrite';
import { ID } from 'node-appwrite';
import { customerAnswer } from '@/lib/same-answer';
import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { actionFromSameResponse } from '@/lib/chat-viewer-actions';
import { loadChatStageContent } from '@/lib/ames-chat-content';
import { parseAssetSelection, validatedAssetSelection, DEFAULT_CHAT_ASSET_ID } from '@/lib/chat-asset-selection';

async function supportedChatActions(assetId?: string): Promise<string[]> {
  const content = await loadChatStageContent(assetId, async input => {
    const url = String(input);
    const listing = /^\/api\/catalogue\/([a-f0-9-]{36})$/.exec(url);
    if (listing) {
      const [{ getListing }, { verifiedListingProfile }, { publicListing }] = await Promise.all([import('@/lib/jeweller-listing-store'), import('@/lib/jeweller-access'), import('@/lib/jeweller-listing')]);
      const record = await getListing(listing[1]);
      return Response.json(publicListing(record, (await verifiedListingProfile(record)).businessName));
    }
    if (!/^\/ames-engine\/(?:chat\/index\.json|[a-z0-9][a-z0-9-]*\/app\/(?:chat|asset)\.json)$/.test(url)) {
      throw new Error('Invalid Chat metadata path');
    }
    const body = await readFile(join(process.cwd(), 'public', url.slice(1)), 'utf8');
    return new Response(body);
  });
  return content.contract.supportedViewerActions;
}

export async function POST(req: NextRequest) {
  try {
    checkChatOrigin(req);
    requireVisitor(req);
    const body = await readChatJson(req);
    const { query, chatId, assetId } = body;
    if (typeof chatId !== 'string') throw new ChatError(400, 'Select a private conversation');
    const { chat, owner } = await ownedChat(req, chatId);
    await consumeQuota(`same:${owner}`, 20);

    if (!query || typeof query !== 'string' || query.length > 4000) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }
    if (assetId != null && typeof assetId !== 'string') {
      return NextResponse.json({ error: 'Invalid Chat assetId' }, { status: 400 });
    }

    const requestedIntent = parseAssetSelection(query, assetId ?? null);
    const requestedSelection = requestedIntent.kind === 'select' || requestedIntent.kind === 'ring'
      ? { assetId: requestedIntent.assetId } : null;
    let selectedAssetId = requestedSelection?.assetId ?? assetId ?? undefined;
    let supported: string[];
    try {
      supported = await supportedChatActions(selectedAssetId);
    } catch {
      return NextResponse.json({ error: 'Selected Chat asset is unavailable' }, { status: 400 });
    }

    const apiKey = process.env.DIFY_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'DIFY_API_KEY not configured' }, { status: 500 });

    const res = await fetch('https://api.dify.ai/v1/chat-messages', {
      method: 'POST',
      signal: AbortSignal.timeout(45000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        inputs: { ames_asset_id: selectedAssetId ?? DEFAULT_CHAT_ASSET_ID },
        query,
        response_mode: 'blocking',
        conversation_id: chat.provider_id || '',
        user: `ames-${owner}`,
        auto_generate_name: true,
      }),
    });

    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: 'SAME is temporarily unavailable' }, { status: 502 });

    // Model-provided selection is optional, exact-ID only, and validated against the same registry.
    const remoteSelection = requestedSelection ? null : validatedAssetSelection(data.asset_selection ?? data.outputs?.asset_selection);
    if (remoteSelection && remoteSelection.assetId !== selectedAssetId) {
      try {
        supported = await supportedChatActions(remoteSelection.assetId);
        selectedAssetId = remoteSelection.assetId;
      } catch {
        return NextResponse.json({ error: 'Selected Chat asset is unavailable' }, { status: 400 });
      }
    }
    const finalSelection = requestedSelection ?? (remoteSelection ? { assetId: selectedAssetId! } : null);
    const viewerAction = actionFromSameResponse(query, data.viewer_action ?? data.outputs?.viewer_action, supported);
    const answer = customerAnswer(data.answer) || 'Please rephrase your question, or contact the AMES desk.';
    const now = nowISO();
    const message = await getDb().createDocument({
      databaseId: DB_ID, collectionId: 'chat_messages', documentId: ID.unique(), permissions: [],
      data: { chat_id: chatId, role: 'assistant', text: answer.slice(0, 20000), thinking: '', created_at: now },
    });
    await getDb().updateDocument({
      databaseId: DB_ID, collectionId: 'chats', documentId: chatId,
      data: { updated_at: now, ...(typeof data.conversation_id === 'string' && data.conversation_id.length <= 128 ? { provider_id: data.conversation_id } : {}) },
    });
    return NextResponse.json({
      answer,
      message: doc(message),
      ...(viewerAction ? { viewer_action: viewerAction } : {}),
      ...(finalSelection ? { asset_selection: finalSelection } : {}),
    }, { headers: privateHeaders });
  } catch (error) {
    return chatFailure(error);
  }
}
