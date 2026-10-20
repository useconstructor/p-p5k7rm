import { getDb } from '@/lib/db';
import { ApiError, failure } from '@/lib/api';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams;
    const q = p.get('q') ?? '', category = p.get('category') ?? '', stock = p.get('stock') ?? 'all';
    const pageText = p.get('page') ?? '1', sizeText = p.get('pageSize') ?? '25';
    if (!/^[1-9]\d*$/.test(pageText) || !/^[1-9]\d*$/.test(sizeText)) throw new ApiError(400, 'Paginación no válida.');
    const page = Number(pageText), pageSize = Number(sizeText);
    if (!Number.isSafeInteger(page) || page > 1000000 || pageSize > 100 || q.length > 120 || category.length > 80 || !['all','in','out'].includes(stock)) throw new ApiError(400, 'Filtros no válidos.');
    const where: string[] = []; const args: (string | number)[] = [];
    if (q) { where.push("(name LIKE ? ESCAPE '\\' OR sku LIKE ? ESCAPE '\\')"); const term = `%${q.replace(/[\\%_]/g, '\\$&')}%`; args.push(term, term); }
    if (category) { where.push('category = ?'); args.push(category); }
    if (stock !== 'all') where.push(stock === 'in' ? 'stock > 0' : 'stock = 0');
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const db = await getDb();
    const results = await db.batch([
      { sql: `SELECT * FROM products${clause} ORDER BY created_at DESC, id ASC LIMIT ? OFFSET ?`, args: [...args, pageSize, (page - 1) * pageSize] },
      { sql: `SELECT count(*) AS total FROM products${clause}`, args },
      'SELECT DISTINCT category FROM products ORDER BY category COLLATE NOCASE'
    ], 'read');
    return Response.json({ products: results[0].rows, total: Number(results[1].rows[0].total), page, pageSize, categories: results[2].rows.map(r => r.category) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch(e) { return failure(e); }
}
