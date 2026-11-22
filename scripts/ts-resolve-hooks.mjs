export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); } catch (error) {
    if ((specifier.startsWith('.') || specifier.startsWith('/')) && !/\.[cm]?[jt]sx?$/.test(specifier))
      for (const ext of ['.ts', '.tsx']) { try { return await next(specifier + ext, context); } catch { /* next */ } }
    throw error;
  }
}
