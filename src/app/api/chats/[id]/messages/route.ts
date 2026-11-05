import { NextRequest, NextResponse } from 'next/server';
import { ID, Query } from 'node-appwrite';
import { getDb, DB_ID, nowISO, doc } from '@/lib/appwrite';
import { ownedChat, readChatJson, consumeQuota, privateHeaders, chatFailure, ChatError } from '@/lib/chat-security';
import { customerAnswer } from '@/lib/same-answer';
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params; const { owner } = await ownedChat(req, id);
    await consumeQuota(`read:${owner}`, 120);
    const result = await getDb().listDocuments({ databaseId: DB_ID, collectionId: 'chat_messages', queries: [Query.equal('chat_id', id), Query.orderAsc('created_at'), Query.limit(500)] });
    return NextResponse.json(result.documents.map(d => ({ id: d.$id, chat_id: d.chat_id, role: d.role, text: d.role === 'assistant' ? customerAnswer(d.text) : d.text, created_at: d.created_at })), { headers: privateHeaders });
  } catch (error) { return chatFailure(error); }
}
export async function POST(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params; const { chat, owner } = await ownedChat(req, id);
    await consumeQuota(`message:${owner}`, 20);
    const body = await readChatJson(req);
    if (body.role !== 'user' || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 4000) throw new ChatError(400, 'Provide a user message of up to 4000 characters');
    const now = nowISO(), db = getDb();
    const message = await db.createDocument({ databaseId: DB_ID, collectionId: 'chat_messages', documentId: ID.unique(), permissions: [], data: { chat_id: id, role: 'user', text: body.text.trim(), thinking: '', created_at: now } });
    await db.updateDocument({ databaseId: DB_ID, collectionId: 'chats', documentId: id, data: { updated_at: now, ...(chat.title === 'New chat' ? { title: body.text.trim().slice(0, 80) } : {}) } });
    return NextResponse.json(doc(message), { status: 201, headers: privateHeaders });
  } catch (error) { return chatFailure(error); }
}
