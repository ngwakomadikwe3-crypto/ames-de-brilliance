import { NextRequest, NextResponse } from 'next/server';
import { getDb, DB_ID } from '@/lib/appwrite';
import { ownedChat, readChatJson, consumeQuota, publicChat, privateHeaders, chatFailure, ChatError } from '@/lib/chat-security';
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const { owner } = await ownedChat(req, id);
    await consumeQuota(`edit:${owner}`, 20);
    const body = await readChatJson(req);
    if (Object.keys(body).some(key => key !== 'title') || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 120) throw new ChatError(400, 'Provide a title of up to 120 characters');
    const chat = await getDb().updateDocument({ databaseId: DB_ID, collectionId: 'chats', documentId: id, data: { title: body.title.trim() } });
    return NextResponse.json(publicChat(chat), { headers: privateHeaders });
  } catch (error) { return chatFailure(error); }
}
