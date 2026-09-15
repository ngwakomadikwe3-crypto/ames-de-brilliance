/** Send one Chat message, recovering one expired Dify conversation. */
export async function requestChatWithRecovery({ fetcher = fetch, message, conversationToken, onExpired }) {
  let token = conversationToken;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetcher('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, conversationToken: token }) });
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (response.status === 409 && token && attempt === 0) { token = null; onExpired?.(); continue; }
    return { response, data };
  }
  throw new Error('AMES chat is unavailable. Please try again.');
}
