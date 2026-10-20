export type Product = { id: string; name: string; sku: string; category: string; stock: number; version: number; created_at: string; updated_at: string };
export const MAX_STOCK = Number.MAX_SAFE_INTEGER;
export type FieldErrors = Partial<Record<'name' | 'sku' | 'category' | 'stock' | 'quantity', string>>;
export function validateProduct(body: Record<string, unknown>) {
  const errors: FieldErrors = {};
  const fields = { name: '', sku: '', category: '', stock: 0 };
  for (const [key, max, label] of [['name',120,'nombre'],['sku',64,'SKU'],['category',80,'categoría']] as const) {
    const raw = body[key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    fields[key] = key === 'sku' ? value.toUpperCase() : value;
    if (!fields[key] || Array.from(fields[key]).length > max) errors[key] = `La ${label === 'SKU' ? 'longitud del SKU' : label} debe tener entre 1 y ${max} caracteres.`;
  }
  if (typeof body.stock !== 'number' || !Number.isSafeInteger(body.stock) || body.stock < 0) errors.stock = 'Introduce un entero entre 0 y 9007199254740991.';
  else fields.stock = body.stock;
  return { fields, errors };
}
