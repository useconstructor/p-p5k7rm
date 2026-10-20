import { getDb } from '@/lib/db';
import { ApiError, failure, readMutation } from '@/lib/api';
import { validateProduct, MAX_STOCK } from '@/lib/products';
import { randomUUID } from 'node:crypto';
export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  let tx: Awaited<ReturnType<Awaited<ReturnType<typeof getDb>>['transaction']>> | undefined;
  try {
    const { action } = await params;
    if (!['create', 'update', 'adjust-stock', 'delete'].includes(action)) throw new ApiError(404, 'Operación inexistente.');
    const body = await readMutation(req);
    const db = await getDb();
    const now = new Date().toISOString();
    if (action === 'create') {
      const { fields, errors } = validateProduct(body);
      if (Object.keys(errors).length) throw new ApiError(400, 'Revisa los campos indicados.', errors);
      const result = await db.execute({ sql: 'INSERT INTO products (id,name,sku,category,stock,created_at,updated_at) VALUES (?,?,?,?,?,?,?) RETURNING *', args: [randomUUID(), fields.name, fields.sku, fields.category, fields.stock, now, now] });
      return Response.json({ product: result.rows[0] }, { status: 201 });
    }
    if (typeof body.id !== 'string' || !body.id || typeof body.version !== 'number' || !Number.isSafeInteger(body.version) || body.version < 1) throw new ApiError(400, 'Identificador o versión no válidos.');
    tx = await db.transaction('write');
    const args: (string | number)[] = [];
    let sql = '';
    if (action === 'update') {
      const { fields, errors } = validateProduct(body);
      if (Object.keys(errors).length) throw new ApiError(400, 'Revisa los campos indicados.', errors);
      sql = 'UPDATE products SET name=?, sku=?, category=?, stock=?, version=version+1, updated_at=? WHERE id=? AND version=? RETURNING *';
      args.push(fields.name, fields.sku, fields.category, fields.stock, now, body.id, body.version);
    } else if (action === 'delete') {
      sql = 'DELETE FROM products WHERE id=? AND version=? RETURNING *'; args.push(body.id, body.version);
    } else {
      const qty = body.quantity;
      if (typeof qty !== 'number' || !Number.isSafeInteger(qty) || qty <= 0 || !['add','remove'].includes(String(body.operation))) throw new ApiError(400, 'Introduce una cantidad entera positiva y una operación válida.', { quantity: 'La cantidad debe ser un entero positivo.' });
      const add = body.operation === 'add';
      sql = `UPDATE products SET stock=stock ${add ? '+' : '-'} ?, version=version+1, updated_at=? WHERE id=? AND version=? AND stock ${add ? '<=' : '>='} ? RETURNING *`;
      args.push(qty, now, body.id, body.version, add ? MAX_STOCK - qty : qty);
    }
    const result = await tx.execute({ sql, args });
    if (!result.rows.length) {
      const current = await tx.execute({ sql: 'SELECT version FROM products WHERE id=?', args: [body.id] });
      if (!current.rows.length) throw new ApiError(404, 'Este producto ya no existe.', undefined, 'not_found');
      throw new ApiError(409, 'El producto cambió o el stock ya no permite esta operación. Recarga el registro antes de continuar.', undefined, 'version_conflict');
    }
    await tx.commit();
    return Response.json({ product: result.rows[0] });
  } catch(e) { if (tx && !tx.closed) await tx.rollback(); return failure(e); }
  finally { tx?.close(); }
}
export async function GET(_req: Request, { params }: { params: Promise<{ action: string }> }) {
  try {
    const { action: id } = await params;
    const db = await getDb();
    const result = await db.execute({ sql: 'SELECT * FROM products WHERE id=?', args: [id] });
    if (!result.rows.length) throw new ApiError(404, 'Este producto ya no existe.', undefined, 'not_found');
    return Response.json({ product: result.rows[0] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch(e) { return failure(e); }
}
