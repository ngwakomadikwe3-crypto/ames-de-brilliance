import { Account, Client } from 'node-appwrite';
import type { NextRequest } from 'next/server';
import { ChatError } from './chat-security';
const accounts = new WeakMap<NextRequest, Promise<{ api: Account; user: Awaited<ReturnType<Account['get']>> }>>();
export async function customerSession(req: NextRequest, verified = false) {
  let pending = accounts.get(req);
  if (!pending) {
    pending = (async () => {
      const secret = req.cookies.get('ames_customer_session')?.value;
      if (!secret) throw new ChatError(401, 'Sign in to your AMES account.');
      const endpoint = process.env.APPWRITE_ENDPOINT, project = process.env.APPWRITE_PROJECT_ID;
      if (!endpoint || !project) throw new ChatError(503, 'Account service is not configured.');
      const api = new Account(new Client().setEndpoint(endpoint).setProject(project).setSession(secret));
      try { const user = await api.get(); if (user.status === false) throw new ChatError(403, 'This account is disabled.'); return { api, user }; }
      catch (e) { if ((e as { code?: number }).code === 401) throw new ChatError(401, 'Your session expired. Please sign in again.'); throw e; }
    })();
    accounts.set(req, pending);
  }
  const session = await pending;
  if (verified && !session.user.emailVerification) throw new ChatError(403, 'Verify your account email to complete this step.');
  return session;
}
