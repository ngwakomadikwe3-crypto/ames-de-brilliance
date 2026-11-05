export const hasHostedCad = () => !!process.env.AMES_CAD_SERVICE_URL;
export async function hostedCad(path: string, init: RequestInit = {}) {
  const base = process.env.AMES_CAD_SERVICE_URL;
  const token = process.env.AMES_CAD_SERVICE_TOKEN;
  if (!base || !token || token.length < 48) throw new Error('Hosted CAD is not configured');
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('CAD service requires a private HTTPS origin');
  const response = await fetch(new URL(path, url.origin), { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(55000), headers: { 'Content-Type': 'application/json', ...init.headers, Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Hosted CAD is temporarily unavailable');
  return response;
}
