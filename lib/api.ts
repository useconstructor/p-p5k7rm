import 'server-only';
export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>, public code?: string) { super(message); }
}
export function failure(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: { message: error.message, fields: error.fields, code: error.code } }, { status: error.status });
  if (error instanceof Error && /UNIQUE constraint failed: products.sku/.test(error.message)) return Response.json({ error: { message: 'Este SKU ya existe. Utiliza un SKU único.', fields: { sku: 'Este SKU ya existe.' }, code: 'sku_conflict' } }, { status: 409 });
  return Response.json({ error: { message: 'No se pudo acceder al inventario. Inténtalo de nuevo.' } }, { status: 500 });
}
export async function readMutation(req: Request) {
  const origin = req.headers.get('origin');
  const configured = process.env.APP_ORIGIN || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
  const allowed = new Set([configured, process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined].filter(Boolean));
  // Next can use its bind hostname in request.url. For self-hosted HTTP,
  // use the actual Host authority; production proxies configure APP_ORIGIN.
  if (!configured) {
    const host = req.headers.get('host');
    if (host && /^[a-zA-Z0-9.[\]:-]+$/.test(host)) {
      allowed.add(`${new URL(req.url).protocol}//${host}`);
    }
  }
  if (!origin || !allowed.has(origin)) throw new ApiError(403, 'Origen de solicitud no permitido.');
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiError(400, 'Envía una solicitud JSON válida.');
  let body: unknown;
  try { body = await req.json(); } catch { throw new ApiError(400, 'El JSON no es válido.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Los datos no son válidos.');
  return body as Record<string, unknown>;
}
