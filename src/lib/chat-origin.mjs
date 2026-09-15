export function chatOriginAllowed(req, env = process.env) {
  const origin = req.headers.get('origin');
  // Only next dev accepts these exact local origins; production fails closed.
  if (env.NODE_ENV === 'development' &&
      (origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000')) return true;
  if (!env.AMES_APP_ORIGIN || !origin) return false;
  try {
    const configured = new URL(env.AMES_APP_ORIGIN);
    const expected = `${configured.protocol}//${configured.host}`;
    return configured.pathname === '/' && !configured.search && !configured.hash && origin === expected;
  } catch { return false; }
}
