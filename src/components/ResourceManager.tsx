'use client';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, qs, type ListResult } from '@/lib/client/api';
import { useAuth } from '@/lib/client/auth';
import { RESOURCES, type Field } from '@/lib/client/schema';
import { Empty, Lookup, Modal, Pager, useToast, type LookupOpt } from './ui';

type Row = Record<string, any>;
type Form = Record<string, any>;

/** CRUD genérico dirigido por `RESOURCES[slug]`. */
export default function ResourceManager({ slug }: { slug: string }) {
  const cfg = RESOURCES[slug];
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; order: 'asc' | 'desc' } | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [res, setRes] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ row: Row | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setRes(await api<ListResult>(`/api/${slug}?${qs({ page, limit: 10, q: query, sort: sort?.key, order: sort?.order, ...filters })}`));
    } catch (e) { setError(e instanceof ApiError ? e.full : 'No se pudo cargar'); } finally { setLoading(false); }
  }, [slug, page, query, sort, filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => { setPage(1); setQuery(q); }, 300); return () => clearTimeout(t); }, [q]);

  if (!cfg) return <Empty>Recurso desconocido.</Empty>;
  const hasSearch = slug !== 'prestamos';

  const remove = async (row: Row) => {
    if (!confirm(`¿Eliminar ${cfg.singular} #${row[cfg.pk]}? Esta acción no se puede deshacer.`)) return;
    try { await api(`/api/${slug}/${row[cfg.pk]}`, { method: 'DELETE' }); toast('Eliminado'); load(); }
    catch (e) { toast(e instanceof ApiError ? e.full : 'Error', 'err'); }
  };
  const action = async (row: Row, a: NonNullable<typeof cfg.rowActions>[number]) => {
    try { await api(`/api/${slug}/${row[cfg.pk]}`, a.run); toast('Actualizado'); load(); }
    catch (e) { toast(e instanceof ApiError ? e.full : 'Error', 'err'); }
  };

  return (
    <>
      <div className="page-head">
        <h1>{cfg.title}</h1>
        <button className="btn primary" onClick={() => setEditing({ row: null })}>+ Nuevo</button>
      </div>
      <div className="toolbar">
        {hasSearch && <input type="search" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />}
        {cfg.filters?.map((f) => (
          <select key={f.key} value={filters[f.key] ?? ''} aria-label={f.label} onChange={(e) => { setPage(1); setFilters({ ...filters, [f.key]: e.target.value }); }}>
            <option value="">{f.label}: todos</option>
            {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
      </div>
      {error && <div className="alert err">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {cfg.columns.map((c) => (
                <th key={c.key} className={c.sort ? 'sortable' : ''} onClick={() => c.sort && setSort({ key: c.sort, order: sort?.key === c.sort && sort.order === 'asc' ? 'desc' : 'asc' })}>
                  {c.label}{sort?.key === c.sort ? (sort?.order === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {res?.data.map((r) => (
              <tr key={r[cfg.pk]}>
                {cfg.columns.map((c) => <td key={c.key}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>)}
                <td className="actions">
                  {cfg.rowActions?.filter((a) => a.show(r)).map((a) => <button key={a.label} className="btn" onClick={() => action(r, a)}>{a.label}</button>)}
                  <button className="btn" onClick={() => setEditing({ row: r })}>Editar</button>
                  {isAdmin && <button className="btn danger" onClick={() => remove(r)}>Eliminar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && res?.data.length === 0 && <Empty>No hay registros.</Empty>}
        {loading && <Empty>Cargando…</Empty>}
      </div>
      <Pager meta={res?.meta} onPage={setPage} />
      {editing && <FormModal slug={slug} row={editing.row} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function initialValue(f: Field, row: Row | null) {
  if (f.type === 'lookup' || f.type === 'multilookup') return row ? (f.initial?.(row) ?? []) : [];
  if (f.type === 'checkbox') return row ? !!row[f.key] : (f.default ?? false);
  if (f.type === 'select') return row?.[f.key] ?? f.default ?? '';
  return row?.[f.key] ?? '';
}

function FormModal({ slug, row, onClose, onSaved }: { slug: string; row: Row | null; onClose: () => void; onSaved: () => void }) {
  const cfg = RESOURCES[slug];
  const toast = useToast();
  const [v, setV] = useState<Form>(() => Object.fromEntries(cfg.fields.map((f) => [f.key, initialValue(f, row)])));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const payload = () => {
    const out: Form = {};
    for (const f of cfg.fields) {
      const x = v[f.key];
      if (f.type === 'multilookup') out[f.key] = (x as LookupOpt[]).map((o) => o.id);
      else if (f.type === 'lookup') { const id = (x as LookupOpt[])[0]?.id; if (id !== undefined) out[f.key] = id; else if (f.nullable) out[f.key] = null; }
      else if (f.type === 'checkbox') out[f.key] = !!x;
      else if (x === '' || x === undefined) { if (f.nullable) out[f.key] = null; }
      else out[f.key] = f.type === 'number' ? Number(x) : x;
    }
    return out;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await api(row ? `/api/${slug}/${row[cfg.pk]}` : `/api/${slug}`, { method: row ? 'PATCH' : 'POST', body: payload() });
      toast(row ? 'Cambios guardados' : 'Creado correctamente'); onSaved();
    } catch (e) { setErr(e instanceof ApiError ? e.full : 'Error inesperado'); } finally { setBusy(false); }
  };

  return (
    <Modal title={row ? `Editar ${cfg.singular} #${row[cfg.pk]}` : `Nuevo ${cfg.singular}`} onClose={onClose}>
      <form onSubmit={submit} className="form">
        {cfg.fields.map((f) => (
          <label key={f.key} className={f.type === 'checkbox' ? 'check' : ''}>
            <span>{f.label}{f.required && ' *'}</span>
            {f.type === 'checkbox' ? (
              <input type="checkbox" checked={!!v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.checked })} />
            ) : f.type === 'select' ? (
              <select value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>
                {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === 'lookup' || f.type === 'multilookup' ? (
              <Lookup resource={f.lookup!.resource} pk={f.lookup!.pk} labelOf={f.lookup!.labelOf} multiple={f.type === 'multilookup'}
                selected={v[f.key]} onChange={(s) => setV({ ...v, [f.key]: s })} />
            ) : (
              <input type={f.type} required={f.required} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
            )}
            {f.help && <small>{f.help}</small>}
          </label>
        ))}
        {err && <div className="alert err">{err}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
