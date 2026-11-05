/** Do not surface HTML error pages or JSON parser internals to customers. */
export async function readApiJson<T>(response: Response, fallback: string): Promise<T> {
  if (response.redirected || response.status === 401) throw new Error('Please sign in to continue.');
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error(fallback); }
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? (body as {error: unknown}).error : null;
    throw new Error(response.status >= 500 ? fallback : typeof message === 'string' && message.length < 300 && !/[<>]/.test(message) ? message : fallback);
  }
  return body as T;
}
