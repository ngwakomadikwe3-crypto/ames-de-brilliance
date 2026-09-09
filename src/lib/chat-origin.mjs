export function chatOriginAllowed(req, env = process.env) {
  const origin = req.headers.get('origin');
  // Only next dev accepts these exact local origins; production fails closed.
  if (env.NODE_ENV === 'development' &&
      (origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000')) return true;
  return !!env.AMES_APP_ORIGIN && origin === env.AMES_APP_ORIGIN;
}
