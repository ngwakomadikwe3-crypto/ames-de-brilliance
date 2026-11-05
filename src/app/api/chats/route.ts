import { NextRequest, NextResponse } from 'next/server';
import { getDb, DB_ID, nowISO } from '@/lib/appwrite';
import { ID } from 'node-appwrite';
import { checkChatOrigin, requireVisitor, visitorResponse, listOwnedChats, consumeQuota, publicChat, privateHeaders, chatFailure } from '@/lib/chat-security';

export async function GET(req: NextRequest) {
  try { return await visitorResponse(req, listOwnedChats); } catch (error) { return chatFailure(error); }
}
export async function POST(req: NextRequest) {
  try {
    checkChatOrigin(req); const owner = requireVisitor(req);
    await consumeQuota(`create:${owner}`, 10);
    const now = nowISO();
    const chat = await getDb().createDocument({ databaseId: DB_ID, collectionId: 'chats', documentId: ID.unique(), permissions: [], data: { title: 'New chat', owner_id: owner, provider_id: '', created_at: now, updated_at: now } });
    return NextResponse.json(publicChat(chat), { status: 201, headers: privateHeaders });
  } catch (error) { return chatFailure(error); }
}
