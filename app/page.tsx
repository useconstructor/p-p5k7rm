'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowDownUp, Check, ChevronDown, ChevronLeft, ChevronRight, Database, FilterX, Loader2, Package, Pencil, Plus, Search, Trash2, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_STOCK, validateProduct, type Product, type FieldErrors } from '@/lib/products';

type Listing = { products: Product[]; total: number; categories: string[] };
type Editor = { kind: 'create' | 'update'; product?: Product };
type Modal = { kind: 'adjust' | 'delete'; product: Product };
type FormValues = { name: string; sku: string; category: string; stock: string };
class RequestError extends Error {
  constructor(message: string, public status = 0, public fields: FieldErrors = {}, public code = '') { super(message); }
}
async function request(url: string, options?: RequestInit) {
  let res: Response;
  try { res = await fetch(url, { cache: 'no-store', ...options }); }
  catch { throw new RequestError('No se pudo confirmar la respuesta. Recarga el registro para comprobar el resultado antes de repetir la operación.'); }
  let data;
  try { data = await res.json(); } catch { throw new RequestError('Respuesta incompleta. Recarga para comprobar el resultado antes de repetir la operación.'); }
  if (!res.ok) throw new RequestError(data.error?.message ?? 'No se pudo completar la operación.', res.status, data.error?.fields, data.error?.code);
  return data;
}
const initialValues = (p?: Product): FormValues => ({ name: p?.name ?? '', sku: p?.sku ?? '', category: p?.category ?? '', stock: p ? String(p.stock) : '0' });
const number = (n: number) => n.toLocaleString('es-ES');

function TagOutline({ reverse = false }: { reverse?: boolean }) {
  return <span className={`tag-outline ${reverse ? '-scale-x-100' : ''}`} aria-hidden="true"><span className="tag-fill" /></span>;
}

function ParcelIcon({ size }: { size: number }) {
  return <Package size={size} strokeWidth={1.2} className="text-parcel" aria-hidden="true"><path d="m3.3 11 4.2 2.4v-4" /></Package>;
}

function ModalShell({ title, description, children, onClose, destructive = false }: { title: string; description: string; children: ReactNode; onClose: () => void; destructive?: boolean }) {
  const Icon = destructive ? TriangleAlert : title === 'Ajustar stock' ? ArrowDownUp : Pencil;
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/35" /><Dialog.Content onOpenAutoFocus={event => { if (destructive) { event.preventDefault(); setTimeout(() => document.querySelector<HTMLButtonElement>('[data-cancel]')?.focus(), 0); } }} className="appear fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[680px] -translate-x-1/2 -translate-y-1/2 flex-col rounded border bg-white shadow-xl" onCloseAutoFocus={event => { event.preventDefault(); document.querySelector<HTMLButtonElement>('[data-focus-origin="true"]')?.focus(); }}><div className="flex items-center justify-between border-b px-5 py-3"><div className="flex items-center gap-3"><span className={`flex h-9 w-9 items-center justify-center rounded-full ${destructive ? 'bg-destructive/5 text-destructive' : 'bg-background'}`}><Icon size={20} /></span><Dialog.Title className="text-xl font-semibold leading-6">{title}</Dialog.Title></div><Button variant="ghost" size="icon" aria-label="Cerrar diálogo" onClick={onClose}><X size={20} /></Button></div><Dialog.Description className="sr-only">{description}</Dialog.Description><div className="overflow-y-auto p-5 sm:p-6">{children}</div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function ProductFields({ values, fields = {}, categories, onChange, prefix = 'product', disabled = false }: { values: FormValues; fields?: FieldErrors; categories: string[]; onChange?: (key: keyof FormValues, value: string) => void; prefix?: string; disabled?: boolean }) {
  return <>
    <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">{(['name','category','sku','stock'] as const).map(key => <div key={key} className="min-w-0"><label htmlFor={`${prefix}-${key}`} className="mb-2 block">{{name:'Nombre',sku:'SKU',category:'Categoría',stock:'Stock'}[key]} <span className="text-destructive" aria-hidden="true">*</span></label>{disabled ? <output id={`${prefix}-${key}`} className={`block min-h-11 rounded border bg-background/30 px-3 py-2.5 text-base [overflow-wrap:anywhere] ${key === 'stock' || key === 'sku' ? 'font-mono' : ''}`}>{values[key] || '—'}</output> : <input id={`${prefix}-${key}`} name={key} autoFocus={!disabled && key === 'name'} value={values[key]} onChange={e => onChange?.(key, e.target.value)} type={key === 'stock' ? 'number' : 'text'} min={key === 'stock' ? 0 : undefined} max={key === 'stock' ? MAX_STOCK : undefined} step={key === 'stock' ? 1 : undefined} maxLength={key === 'name' ? 120 : key === 'sku' ? 64 : key === 'category' ? 80 : undefined} list={key === 'category' ? `${prefix}-categories` : undefined} aria-invalid={!!fields[key]} aria-describedby={`${prefix}-${key}-hint${fields[key] ? ` ${prefix}-${key}-error` : ''}`} className={key === 'stock' || key === 'sku' ? 'font-mono' : ''} disabled={disabled} required />}<p id={`${prefix}-${key}-hint`} className="mt-1.5 break-words text-xs leading-5 text-muted-foreground">{{ name:'1–120 caracteres.', sku:'Único. Se guardará en mayúsculas.', category:'Elige una categoría o escribe una nueva.', stock:'Entero entre 0 y 9007199254740991.' }[key]}</p>{fields[key] && <p id={`${prefix}-${key}-error`} className="mt-1 text-sm text-destructive">{fields[key]}</p>}</div>)}</div>
    <datalist id={`${prefix}-categories`}>{categories.map(c => <option key={c} value={c} />)}</datalist>
  </>;
}

function ProductForm({ editor, categories, onSave, onClose, onReload, onBusy }: { editor: Editor; categories: string[]; onSave: (p: Product) => Promise<void>; onClose: () => void; onReload: (p: Product) => void; onBusy: (busy: boolean) => void }) {
  const [values, setValues] = useState(initialValues(editor.product));
  const [fields, setFields] = useState<FieldErrors>({});
  const [error, setError] = useState<RequestError | null>(null);
  const [pending, setPending] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [checked, setChecked] = useState(false);
  useEffect(() => { onBusy(pending); return () => onBusy(false); }, [pending, onBusy]);
  const blocked = error && (error.code === 'version_conflict' || error.code === 'not_found' || error.status === 0);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || blocked) return;
    const stock = values.stock.trim() === '' ? NaN : Number(values.stock);
    const payload = { ...values, stock };
    const validation = validateProduct(payload);
    setFields(validation.errors); setError(null);
    if (Object.keys(validation.errors).length) return;
    setPending(true);
    try {
      const { product } = await request(`/api/products/${editor.kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, id: editor.product?.id, version: editor.product?.version }) });
      await onSave(product);
    } catch(e) { const err = e as RequestError; setError(err); setFields(err.fields ?? {}); }
    finally { setPending(false); }
  }
  async function reload() {
    setReloading(true);
    try {
      if (editor.product) { const { product } = await request(`/api/products/${editor.product.id}`); onReload(product); }
      else { await request(`/api/products?q=${encodeURIComponent(values.sku.trim())}`); setChecked(true); }
    } catch(e) { setError(e as RequestError); }
    finally { setReloading(false); }
  }
  return <form onSubmit={submit} noValidate className="space-y-5">
    <p className="text-base leading-6 text-muted-foreground">{editor.kind === 'create' ? 'Registra un producto y sus existencias iniciales.' : 'Actualiza los datos del producto seleccionado.'}</p>
    <ProductFields values={values} fields={fields} categories={categories} onChange={(key, value) => setValues(v => ({ ...v, [key]: value }))} />
    {error && <div role="alert" className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm leading-6 text-destructive">{error.message}{blocked && <Button type="button" variant="outline" className="mt-2 w-full" disabled={reloading} onClick={reload}>{reloading ? 'Recargando…' : editor.product ? 'Recargar registro' : 'Comprobar inventario'}</Button>}{checked && <p className="mt-2">Cierra el formulario y comprueba el SKU en el inventario antes de volver a guardarlo.</p>}</div>}
    <div className="flex justify-end gap-2 border-t pt-5"><Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button><Button type="submit" disabled={pending || !!blocked}>{pending ? <><Loader2 size={16} className="animate-spin" /> Guardando…</> : editor.kind === 'create' ? 'Añadir producto' : 'Guardar cambios'}</Button></div>
  </form>;
}

function StockFields({ product, operation, quantity, result, validation = '', onOperation, onQuantity, prefix = 'stock', disabled = false }: { product?: Product; operation: string; quantity: string; result: number | null; validation?: string; onOperation?: (value: string) => void; onQuantity?: (value: string) => void; prefix?: string; disabled?: boolean }) {
  return <div className="stock-fields grid gap-5 sm:grid-cols-2"><div className="min-w-0 space-y-5 sm:border-r sm:pr-5">
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm"><dt className="font-medium">Producto</dt><dd className="break-words text-base">{product?.name ?? '—'}<span className="mt-1 block break-all font-mono text-sm text-muted-foreground">{product?.sku ?? '—'}</span></dd><dt className="font-medium">Stock actual</dt><dd className="break-all font-mono text-base">{product ? number(product.stock) : '—'}</dd></dl>
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-4 sm:grid-cols-[112px_minmax(0,1fr)]">
      <span id={`${prefix}-operation-label`} className="text-sm font-medium pt-3">Operación</span>
      {disabled ? <div className="min-h-11 w-fit max-w-full rounded border bg-background/30 px-3 py-2.5 text-sm text-muted-foreground">Añadir stock</div> : <fieldset aria-labelledby={`${prefix}-operation-label`}><div className="space-y-1">{[['add','Añadir stock'],['remove','Retirar stock']].map(([value,label]) => <label key={value} className={`flex min-h-11 items-center gap-2 rounded px-2 ${operation === value ? 'bg-secondary text-primary' : ''}`}><input type="radio" name={`${prefix}-operation`} value={value} checked={operation === value} onChange={() => onOperation?.(value)} className="h-4 min-h-0 w-4 accent-primary" />{label}</label>)}</div></fieldset>}
      <label htmlFor={`${prefix}-quantity`} className="pt-3">Cantidad</label><div className="min-w-0 max-w-[200px]">{disabled ? <output id={`${prefix}-quantity`} className="block min-h-11 rounded border bg-background/30 px-3 py-2.5 font-mono text-base">{product ? quantity : '—'}</output> : <input id={`${prefix}-quantity`} type="number" min="1" step="1" value={quantity} onChange={e => onQuantity?.(e.target.value)} aria-invalid={!!validation} aria-describedby={`${prefix}-quantity-help`} className="font-mono" />}<p id={`${prefix}-quantity-help`} className={`mt-2 text-sm leading-5 ${validation ? 'text-destructive' : 'text-muted-foreground'}`}>{validation || (disabled ? 'La cantidad se introduce en el diálogo.' : 'Introduce un número entero positivo.')}</p></div>
    </div></div><div className="self-start rounded border bg-secondary/40 p-4 sm:min-h-64"><p className="text-base font-semibold text-primary">Resultado previsto</p><p className="mt-3 text-sm text-muted-foreground">Nuevo stock</p><p className="mt-3 break-all font-mono text-xl font-medium text-primary" aria-live="polite">{result === null ? '—' : number(result)}</p><p className="mt-6 text-sm leading-6 text-muted-foreground">El servidor verificará nuevamente el stock al confirmar.</p></div></div>;
}

function DeleteDetails({ product }: { product?: Product }) {
  return <><p className="text-base leading-6">¿Estás seguro de que quieres eliminar este producto? Esta acción es permanente y no se puede deshacer.</p><dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-y-3 rounded border border-destructive/20 bg-destructive/5 p-4 text-sm"><dt className="font-semibold">Nombre del producto</dt><dd className="break-words">{product?.name ?? '—'}</dd><dt className="font-semibold">SKU</dt><dd className="[overflow-wrap:anywhere] font-mono">{product?.sku ?? '—'}</dd></dl><p className="flex items-start gap-2 text-sm leading-6 text-destructive"><TriangleAlert size={19} className="mt-0.5 shrink-0" />La eliminación es permanente. Esta acción no se puede deshacer.</p></>;
}

function StockOrDelete({ modal, onClose, onSave, onReload }: { modal: Modal; onClose: () => void; onSave: (p: Product, deleted?: boolean) => Promise<void>; onReload: (p: Product) => void }) {
  const { product: p, kind } = modal;
  const [operation, setOperation] = useState('add');
  const [quantity, setQuantity] = useState('1');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  let result: number | null = null;
  let validation = '';
  const qty = quantity.trim() ? Number(quantity) : NaN;
  if (!Number.isSafeInteger(qty) || qty <= 0) validation = 'Introduce una cantidad entera positiva.';
  else { const value = BigInt(p.stock) + (operation === 'add' ? BigInt(qty) : -BigInt(qty)); if (value < BigInt(0)) validation = 'No hay stock suficiente para retirar esa cantidad.'; else if (value > BigInt(MAX_STOCK)) validation = 'El resultado supera el máximo permitido.'; else result = Number(value); }
  const blocked = error && (error.status === 0 || error.code === 'version_conflict' || error.code === 'not_found');
  async function submit(e: FormEvent) {
    e.preventDefault(); if (pending || blocked || (kind === 'adjust' && validation)) return;
    setPending(true); setError(null);
    try { const { product } = await request(`/api/products/${kind === 'delete' ? 'delete' : 'adjust-stock'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, version: p.version, operation, quantity: qty }) }); await onSave(product, kind === 'delete'); }
    catch(e) { setError(e as RequestError); } finally { setPending(false); }
  }
  async function reload() { try { const { product } = await request(`/api/products/${p.id}`); onReload(product); } catch(e) { setError(e as RequestError); } }
  return <ModalShell title={kind === 'delete' ? 'Eliminar producto' : 'Ajustar stock'} description={kind === 'delete' ? 'Confirma la eliminación permanente del producto.' : 'Añade o retira una cantidad de stock.'} onClose={() => { if (!pending) onClose(); }} destructive={kind === 'delete'}><form onSubmit={submit} className="space-y-6" noValidate>
    {kind === 'delete' ? <DeleteDetails product={p} /> : <StockFields product={p} operation={operation} quantity={quantity} result={result} validation={validation} onOperation={setOperation} onQuantity={setQuantity} />}
    {error && <div role="alert" className="text-sm leading-6 text-destructive">{error.message}{blocked && <Button type="button" variant="outline" className="mt-3 w-full" onClick={reload}>Recargar registro</Button>}</div>}
    <div className="flex justify-end gap-3 border-t pt-5"><Button type="button" variant="outline" data-cancel onClick={onClose} disabled={pending}>Cancelar</Button><Button type="submit" variant={kind === 'delete' ? 'destructive' : 'default'} disabled={pending || !!blocked || (kind === 'adjust' && !!validation)}>{pending ? 'Guardando…' : kind === 'delete' ? 'Eliminar producto' : 'Confirmar ajuste'}</Button></div>
  </form></ModalShell>;
}

function OperationSurface({ title, icon, active, destructive = false, children, action }: { title: string; icon: ReactNode; active?: boolean; destructive?: boolean; children: ReactNode; action: ReactNode }) {
  const [phone, setPhone] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const update = () => setPhone(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => { if (active) setExpanded(true); }, [active]);
  return <details className="operation-surface rounded border bg-white shadow-[0_2px_12px_#252b2504]" open={!phone || expanded} onToggle={event => { if (phone) setExpanded(event.currentTarget.open); }}>
    <summary tabIndex={phone ? 0 : -1} onClick={event => { if (!phone) event.preventDefault(); }} className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-5 py-4 sm:pointer-events-none sm:px-6"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${destructive ? 'bg-destructive/5 text-destructive' : 'bg-background'}`}>{icon}</span><h3 className="text-xl font-semibold leading-6">{title}</h3><ChevronDown size={20} className={`ml-auto shrink-0 text-muted-foreground sm:hidden ${expanded ? 'rotate-180' : ''}`} /></summary>
    <div className="operation-body border-t p-5 sm:p-6">
      <p className="mb-4 text-sm leading-5 text-muted-foreground">Vista previa · {destructive ? 'La eliminación requiere confirmación en un diálogo.' : 'Abre la operación para modificar los datos.'}</p>
      {active ? <p className="py-4 text-sm leading-6 text-muted-foreground">El formulario está abierto. Completa la operación o cancela para volver al inventario.</p> : children}
      <div className="operation-actions mt-4 flex justify-end border-t pt-4">{action}</div>
    </div>
  </details>;
}

export default function Home() {
  const [listing, setListing] = useState<Listing>({ products: [], total: 0, categories: [] });
  const [q, setQ] = useState(''); const [debouncedQ, setDebouncedQ] = useState('');
  const [category, setCategory] = useState(''); const [stock, setStock] = useState('all');
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [notice, setNotice] = useState(''); const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null); const [modal, setModal] = useState<Modal | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [selected, setSelected] = useState<Product | null>(null);
  const [desktop, setDesktop] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [connectionY, setConnectionY] = useState<number | null>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!selected || !desktop || !panel.current) { setConnectionY(null); return; }
    const row = document.querySelector<HTMLElement>(`[data-product-id="${selected.id}"]`);
    const aside = panel.current;
    if (!row) { setConnectionY(null); return; }
    const align = () => {
      const bounds = row.getBoundingClientRect();
      setConnectionY(bounds.top + bounds.height / 2 - aside.getBoundingClientRect().top);
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(row); observer.observe(aside);
    window.addEventListener('resize', align);
    return () => { observer.disconnect(); window.removeEventListener('resize', align); };
  }, [selected, editor, desktop, listing]);
  const requestId = useRef(0); const heading = useRef<HTMLHeadingElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  useEffect(() => { const m = window.matchMedia('(min-width: 1100px)'); const update = () => setDesktop(m.matches); update(); m.addEventListener('change', update); return () => m.removeEventListener('change', update); }, []);
  useEffect(() => { const timer = setTimeout(() => { setDebouncedQ(q); setPage(1); }, 300); return () => clearTimeout(timer); }, [q]);
  const load = useCallback(async (signal?: AbortSignal) => {
    const id = ++requestId.current; setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ q: debouncedQ, category, stock, page: String(page), pageSize: String(pageSize) });
      const data = await request(`/api/products?${params}`, { signal });
      if (id !== requestId.current || signal?.aborted) return;
      const last = Math.max(1, Math.ceil(data.total / pageSize));
      if (page > last) { setPage(last); return; }
      setListing(data);
    } catch(e) { if (id === requestId.current && !signal?.aborted) setError((e as Error).message); }
    finally { if (id === requestId.current && !signal?.aborted) setLoading(false); }
  }, [debouncedQ, category, stock, page, pageSize]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, refresh]);
  function markOrigin() { document.querySelector('[data-focus-origin]')?.removeAttribute('data-focus-origin'); origin.current = document.activeElement as HTMLElement; origin.current?.setAttribute('data-focus-origin', 'true'); }
  function openEditor(value: Editor) { if (editorBusy) return; if (value.kind === 'create') (window as Window & { constructorTrack?: (event: string) => void }).constructorTrack?.('Añadir producto iniciado'); markOrigin(); if (value.product) setSelected(value.product); setEditorKey(k => k + 1); setEditor(value); }
  function closeEditor() { if (editorBusy) return; setEditor(null); setTimeout(() => origin.current?.isConnected ? origin.current.focus() : heading.current?.focus(), 0); }
  function clearFilters() { setQ(''); setDebouncedQ(''); setCategory(''); setStock('all'); setPage(1); }
  async function saved(p: Product, deleted = false) {
    setNotice(deleted ? 'Producto eliminado.' : modal?.kind === 'adjust' ? 'Stock ajustado correctamente.' : editor?.kind === 'create' ? 'Producto añadido correctamente.' : 'Cambios guardados.');
    setSelected(deleted ? null : p);
    setEditor(null); setModal(null);
    await load();
    if (!deleted && origin.current?.isConnected) origin.current.focus(); else heading.current?.focus();

  }
  const filtered = !!debouncedQ || !!category || stock !== 'all';
  const pages = Math.max(1, Math.ceil(listing.total / pageSize));
  const queryPending = q !== debouncedQ;
  return <main onKeyDown={e => { if (e.key === 'Escape' && editor && desktop && !modal) closeEditor(); }} className="inventory-app mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
    <header className="relative mb-5 sm:mb-7"><div className="tag-rails" aria-hidden="true" /><div className="tag-header mx-1 flex flex-wrap items-center gap-3 py-3 pl-12 pr-5 sm:mx-4 sm:flex-nowrap sm:gap-6 sm:py-5 sm:pl-16 sm:pr-6"><TagOutline /><span className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-[5px] border-primary sm:left-6" aria-hidden="true" /><div className="w-full min-w-0 flex-none sm:w-auto sm:flex-1"><h1 className="text-[28px] font-semibold leading-8 tracking-[-0.02em]">Inventario AWS Frontend</h1><p className="mt-1 text-sm text-muted-foreground sm:text-base">Gestión de productos y existencias</p></div><Button onClick={() => openEditor({ kind: 'create' })} className="shrink-0"><Plus size={18} /> Añadir producto</Button></div></header>
    <section aria-label="Buscar y filtrar inventario" className="rounded-t border bg-white p-4 sm:p-6"><div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-[1fr_1fr_auto] lg:grid-cols-[minmax(250px,1.6fr)_1fr_1fr_auto]"><div className="col-span-2 sm:col-span-3 lg:col-span-1"><label htmlFor="search" className="mb-2 block">Buscar por nombre o SKU</label><div className="relative"><Search size={18} className="absolute left-3 top-3.5 text-muted-foreground" /><input id="search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en el inventario…" className="pl-10" /></div></div><div><label htmlFor="category-filter" className="mb-2 block">Categoría</label><select id="category-filter" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}><option value="">Todas</option>{listing.categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div><div><label htmlFor="stock-filter" className="mb-2 block">Stock</label><select id="stock-filter" value={stock} onChange={e => { setStock(e.target.value); setPage(1); }}><option value="all">Todos</option><option value="in">Con stock</option><option value="out">Sin stock</option></select></div><div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:self-end"><p className="text-xs text-muted-foreground sm:hidden">{loading || queryPending ? 'Consultando…' : `Resultados: ${number(listing.total)} ${listing.total === 1 ? 'producto' : 'productos'}`}</p><Button variant="outline" onClick={clearFilters} className="shrink-0"><FilterX size={17} /> Limpiar filtros</Button></div></div><p className="mt-5 hidden text-sm text-muted-foreground sm:block" role="status">{loading || queryPending ? 'Consultando…' : `Resultados: ${number(listing.total)} ${listing.total === 1 ? 'producto' : 'productos'}`}</p></section>
    {notice && <div role="status" aria-live="polite" className="appear flex items-center gap-2 border-x border-t bg-secondary px-5 py-3 text-sm text-primary"><Check size={17} />{notice}<button onClick={() => setNotice('')} aria-label="Cerrar confirmación" className="ml-auto flex h-11 w-11 items-center justify-center"><X size={17} /></button></div>}
    <div className={`grid items-stretch gap-6 ${desktop ? 'grid-cols-[minmax(0,1.85fr)_minmax(420px,1fr)]' : 'grid-cols-1'}`}>
      <section id="inventory" aria-labelledby="inventory-title" className="flex min-w-0 flex-col rounded-b border bg-white min-[1100px]:min-h-[min(74vw,1040px)]"><div className="flex items-center justify-between border-b px-5 py-4 sm:px-6"><h2 id="inventory-title" ref={heading} tabIndex={-1} className="text-base font-semibold">Inventario</h2></div>
        <table className="w-full table-fixed max-[767px]:block"><colgroup className="max-[767px]:hidden"><col style={{width:desktop?'24%':'28%'}} /><col style={{width:desktop?'18%':'16%'}} /><col style={{width:'17%'}} /><col style={{width:'12%'}} /><col style={{width:desktop?'29%':'27%'}} /></colgroup><thead className="border-b bg-background/80 max-[767px]:hidden"><tr>{['Nombre','SKU','Categoría','Stock','Acciones'].map(text => <th key={text} scope="col" className={`${text === 'SKU' ? 'px-3' : 'px-5'} py-3 text-left text-sm font-semibold text-muted-foreground ${text === 'Stock' ? 'text-right' : ''}`}>{text}</th>)}</tr></thead><tbody className="max-[767px]:block">{!error && listing.products.map(p => <tr key={p.id} data-product-id={p.id} onClick={e => { if (!(e.target as HTMLElement).closest('button')) openEditor({kind:'update',product:p}); }} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openEditor({kind:'update',product:p}); } }} tabIndex={0} aria-label={`Seleccionar ${p.name}`} aria-selected={selected?.id === p.id} className={`border-b hover:bg-background max-[767px]:grid max-[767px]:grid-cols-2 max-[767px]:gap-x-4 max-[767px]:p-4 ${selected?.id === p.id ? 'bg-secondary shadow-[inset_3px_0_0_var(--color-primary)]' : ''}`}><td className="px-5 py-4 break-words font-medium max-[767px]:col-span-2 max-[767px]:px-0 max-[767px]:pb-2 max-[767px]:pt-0"><span className="sr-only md:hidden">Nombre: </span>{p.name}</td><td data-field="sku" className="min-w-0 px-3 py-4 break-all font-mono text-base max-[767px]:col-span-2 max-[767px]:px-0 max-[767px]:py-2"><span className="mb-1 block font-sans text-xs text-muted-foreground md:hidden">SKU</span>{p.sku}</td><td data-field="category" className="min-w-0 px-5 py-4 break-words text-base max-[767px]:col-span-2 max-[767px]:px-0 max-[767px]:py-2"><span className="mb-1 block text-xs text-muted-foreground md:hidden">Categoría</span>{p.category}</td><td className="px-5 py-4 text-right font-mono text-base max-[767px]:col-span-2 max-[767px]:flex max-[767px]:justify-between max-[767px]:px-0 max-[767px]:py-2"><span className="font-sans text-xs text-muted-foreground md:hidden">Stock</span><div><strong className="break-all font-medium">{number(p.stock)}</strong>{p.stock === 0 && <span className="block font-sans text-xs text-destructive">Sin stock</span>}</div></td><td className="px-5 py-4 max-[767px]:col-span-2 max-[767px]:px-0 max-[767px]:pb-0 max-[767px]:pt-3"><div className="flex flex-wrap gap-x-2"><Button variant="ghost" disabled={editorBusy} className="px-1.5 text-sm text-primary" onClick={() => openEditor({kind:'update',product:p})}><Pencil size={14} />Editar</Button><Button variant="ghost" className="px-1.5 text-sm" onClick={() => { markOrigin(); setSelected(p); setModal({kind:'adjust',product:p}); }}><ArrowDownUp size={14} />Ajustar stock</Button><Button variant="ghost" className="px-1.5 text-sm text-destructive" onClick={() => { markOrigin(); setSelected(p); setModal({kind:'delete',product:p}); }}><Trash2 size={14} />Eliminar</Button></div></td></tr>)}</tbody></table>
        {error ? <div role="alert" className="flex min-h-[360px] flex-1 flex-col items-center justify-center gap-4 px-6 text-center"><TriangleAlert size={32} className="text-destructive" /><h3 className="text-lg font-semibold">No pudimos cargar el inventario</h3><p className="max-w-md text-sm leading-6 text-muted-foreground">{notice ? 'El cambio se guardó. La lista necesita reintentarse.' : error}</p><Button variant="outline" onClick={() => setRefresh(n => n + 1)}>Reintentar</Button></div> : !listing.products.length ? <div className="flex min-h-[360px] flex-1 flex-col items-center justify-center px-5 py-10 text-center sm:min-h-[400px]">{loading ? <><Loader2 size={30} className="mb-5 animate-spin text-primary" /><h3 className="text-lg font-semibold">Cargando productos</h3><p className="mt-2 text-sm text-muted-foreground">Consultando las existencias guardadas.</p></> : <><div className="mb-6 flex h-30 w-30 items-center justify-center rounded-full border-2 border-parcel-ring bg-white"><ParcelIcon size={68} /></div><h3 className="text-[24px] font-medium leading-8 tracking-[-0.015em]">{filtered ? 'No hay productos que coincidan' : 'Tu inventario está vacío'}</h3><p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">{filtered ? 'Prueba con otro nombre, SKU o categoría, o limpia los filtros para ver todo el inventario.' : <>Aún no hay productos registrados.<br />Añade tu primer producto para comenzar.</>}</p><Button className="mt-6" variant={filtered ? 'outline' : 'default'} onClick={() => filtered ? clearFilters() : openEditor({kind:'create'})}>{filtered ? <><FilterX size={17} />Limpiar filtros</> : <><Plus size={18} />Añadir producto</>}</Button></>}</div> : null}
        <div data-pagination className="mt-auto grid grid-cols-2 items-center gap-3 border-t px-4 py-4 sm:flex sm:justify-between sm:px-6">
          <Button variant="outline" className="order-1 justify-self-start" disabled={page <= 1 || loading || queryPending} onClick={() => setPage(n => n - 1)}><ChevronLeft size={16} /><span>Anterior</span></Button>
          <span className="order-3 text-xs text-muted-foreground sm:order-2">Página <span className="font-mono text-foreground">{page}</span> de <span className="font-mono text-foreground">{pages}</span></span>
          <div className="order-4 justify-self-end sm:order-3"><label htmlFor="page-size" className="sr-only">Productos por página</label><select id="page-size" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="w-auto text-sm">{[10,25,50,100].map(n => <option value={n} key={n}>{n} por página</option>)}</select></div>
          <Button variant="outline" className="order-2 justify-self-end sm:order-4" disabled={page >= pages || loading || queryPending} onClick={() => setPage(n => n + 1)}><span>Siguiente</span><ChevronRight size={16} /></Button>
        </div>
      </section>
      {desktop && <aside ref={panel} className="relative flex min-h-[560px] flex-col rounded border bg-white" aria-labelledby="editor-title">
        {selected && connectionY !== null && <svg key={`${selected.id}-${editorKey}`} className="connection" data-row-offset={connectionY} style={{ top: Math.min(30, connectionY) - 1, height: Math.max(1, Math.abs(connectionY - 30)) }} aria-hidden="true" overflow="visible"><path d={`M 0 ${connectionY - Math.min(30, connectionY)} H 12 V ${30 - Math.min(30, connectionY)} H 25`} fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="25" cy={30 - Math.min(30, connectionY)} r="5" fill="white" stroke="currentColor" strokeWidth="2" /></svg>}
        <div className={`flex px-5 ${editor || selected ? "min-h-[61px] items-center justify-between border-b py-3" : "flex-col items-center pt-14 text-center"}`}><h2 id="editor-title" className="text-xl font-semibold leading-6">{editor ? editor.kind === 'create' ? 'Añadir producto' : 'Editar producto' : 'Detalles del producto'}</h2>{!editor && !selected && <p className="mt-2 text-sm leading-6 text-muted-foreground">Selecciona un producto para ver o editar.</p>}{editor && <Button variant="ghost" size="icon" aria-label="Cerrar editor" onClick={closeEditor}><X size={18} /></Button>}</div>
        {editor ? <div className="p-5"><ProductForm key={editorKey} editor={editor} categories={listing.categories} onBusy={setEditorBusy} onClose={closeEditor} onSave={saved} onReload={p => { setSelected(p); setEditor({kind:'update',product:p}); setEditorKey(k => k + 1); setNotice('Se cargaron los datos actuales del servidor. Revisa los campos antes de guardar.'); }} /></div> : selected ? <div className="p-6"><p className="mb-6 text-base leading-6 text-muted-foreground">Datos del producto seleccionado.</p><dl className="space-y-5">{[['Nombre',selected.name],['SKU',selected.sku],['Categoría',selected.category],['Stock',number(selected.stock)]].map(([label,value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className={`mt-1 text-base [overflow-wrap:anywhere] ${label === 'SKU' || label === 'Stock' ? 'font-mono' : 'font-medium'}`}>{value}{label === 'Stock' && selected.stock === 0 && <span className="ml-2 font-sans text-sm text-destructive">Sin stock</span>}</dd></div>)}</dl><Button className="mt-6" onClick={() => openEditor({kind:'update',product:selected})}><Pencil size={16} />Editar producto</Button></div> : <div className="flex min-h-[490px] flex-1 flex-col items-center justify-center px-6 py-8 text-center"><div className="mb-5 flex h-24 w-24 items-center justify-center rounded-full border-2 border-parcel-ring"><ParcelIcon size={56} /></div><h3 className="text-xl font-semibold leading-6">Sin selección</h3><p className="mt-3 max-w-xs text-base leading-6 text-muted-foreground">El panel mostrará aquí los datos del producto seleccionado.</p><p className="mt-10 max-w-xs text-sm leading-6 text-muted-foreground">Selecciona una fila en la tabla para editar o añade un producto nuevo.</p></div>}
      </aside>}

    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded border px-5 py-4"><div className="flex items-center gap-3"><Database size={32} strokeWidth={1.5} className="shrink-0 text-primary/80" /><div><p className="text-sm font-semibold text-primary">Datos persistentes</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Cada cambio confirmado se guarda en Turso y permanece al recargar.</p></div></div><span className={`flex items-center gap-2 text-xs ${error ? 'text-destructive' : 'text-primary'}`}><span className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-destructive' : 'bg-primary'}`} />{error ? 'Sin conexión' : loading ? 'Conectando…' : 'Conectado a Turso'}</span></div>
    <section aria-labelledby="operations-title" className="mt-8 px-1 sm:px-4">
      <h2 id="operations-title" className="text-2xl font-semibold leading-8">Diálogos y confirmaciones</h2>
      <p className="mt-2 text-base leading-6 text-muted-foreground [overflow-wrap:anywhere]">{selected ? <>Producto seleccionado: <span className="font-medium text-foreground">{selected.name}</span>. Elige la operación que necesitas.</> : 'Selecciona un producto en el inventario para ajustar, editar o eliminar sus datos.'}</p>
      <div className="operation-stack mx-auto mt-6 max-w-[1040px] space-y-6">
        <OperationSurface title="Ajustar stock" icon={<ArrowDownUp size={20} />} active={modal?.kind === 'adjust'} action={<Button disabled={!selected || editorBusy || !!modal} onClick={() => { if (selected) { markOrigin(); setModal({kind:'adjust',product:selected}); } }}>Ajustar stock</Button>}>
          <StockFields product={selected ?? undefined} operation="add" quantity="1" result={selected && selected.stock < MAX_STOCK ? selected.stock + 1 : null} prefix="preview-stock" disabled />
        </OperationSurface>
        <OperationSurface title="Editar producto" icon={<Pencil size={20} />} active={!!editor} action={<Button disabled={!selected || editorBusy || !!editor} onClick={() => { if (selected) { openEditor({kind:'update',product:selected}); if (desktop) window.scrollTo({top:0,behavior:'instant'}); } }}>Editar producto</Button>}>
          <ProductFields values={selected ? initialValues(selected) : {name:'',sku:'',category:'',stock:''}} categories={listing.categories} prefix="preview-product" disabled />
        </OperationSurface>
        <OperationSurface title="Eliminar producto" icon={<TriangleAlert size={20} />} destructive active={modal?.kind === 'delete'} action={<Button variant="destructive" disabled={!selected || editorBusy || !!modal} onClick={() => { if (selected) { markOrigin(); setModal({kind:'delete',product:selected}); } }}>Eliminar producto</Button>}>
          <div className="space-y-4"><DeleteDetails product={selected ?? undefined} /></div>
        </OperationSurface>
      </div>
    </section>
    <footer className="mt-8 rounded border border-primary/40 px-5 py-6 sm:px-8"><div className="grid grid-cols-2 gap-6 lg:grid-cols-[1.5fr_1fr_1fr] sm:gap-8"><div className="col-span-2 lg:col-span-1"><div className="tag-header max-w-sm py-4 pl-5 pr-12"><TagOutline reverse /><span className="absolute right-4 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-[3px] border-primary/40" aria-hidden="true" /><p className="text-xl font-semibold leading-6">Inventario AWS Frontend</p><p className="mt-2 text-base leading-6 text-muted-foreground">Aplicación interna para gestionar productos y existencias con precisión.</p></div><p className="mt-3 inline-flex items-center gap-2 rounded-full border bg-secondary/40 px-3 py-2 text-xs text-primary"><Database size={14} />Persistencia en Turso</p></div><nav aria-label="Navegación de la aplicación"><h2 className="mb-2 text-sm font-medium leading-6">Navegación</h2><a href="#inventory-title" className="flex min-h-11 w-fit items-center text-sm text-muted-foreground hover:text-primary" onClick={() => heading.current?.focus()}>Inventario</a><button type="button" onClick={() => openEditor({kind:'create'})} className="flex min-h-11 items-center text-left text-sm text-muted-foreground hover:text-primary">Añadir producto</button></nav><div><h2 className="mb-3 text-sm font-medium leading-6">Tecnología</h2><ul className="space-y-2 text-base leading-6 text-muted-foreground"><li>Next.js 16</li><li>Tailwind CSS 4</li><li>shadcn/ui</li><li>Turso (libSQL)</li></ul></div></div><div className="mt-5 flex flex-wrap justify-between gap-2 border-t pt-4 text-xs text-muted-foreground"><p>Inventario AWS Frontend · Productos y existencias</p><p>Aplicación interna</p></div></footer>
    {editor && !desktop && <ModalShell title={editor.kind === 'create' ? 'Añadir producto' : 'Editar producto'} description="Formulario de nombre, SKU, categoría y stock." onClose={closeEditor}><ProductForm key={editorKey} editor={editor} categories={listing.categories} onBusy={setEditorBusy} onClose={closeEditor} onSave={saved} onReload={p => { setSelected(p); setEditor({kind:'update',product:p}); setEditorKey(k => k + 1); }} /></ModalShell>}
    {modal && <StockOrDelete key={`${modal.product.id}-${modal.product.version}`} modal={modal} onClose={() => setModal(null)} onSave={saved} onReload={p => { setSelected(p); setModal(m => m ? {...m,product:p} : null); setNotice('Registro recargado. Revisa el ajuste antes de confirmar.'); }} />}
  </main>;
}
