'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type ListResult } from '@/lib/client/api';

/* ---------- Toasts ---------- */
const ToastCtx = createContext<(msg: string, kind?: 'ok' | 'err') => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const push = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, msg, kind }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Piezas pequeñas ---------- */
export function Badge({ kind = 'gray', children }: { kind?: 'green' | 'red' | 'amber' | 'blue' | 'gray'; children: ReactNode }) {
  return <span className={`badge ${kind}`}>{children}</span>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h3>{title}</h3><button className="btn ghost" onClick={onClose} aria-label="Cerrar">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function Pager({ meta, onPage }: { meta?: ListResult['meta']; onPage: (p: number) => void }) {
  if (!meta || meta.total === 0) return null;
  return (
    <div className="pager">
      <span>{meta.total} registro{meta.total === 1 ? '' : 's'} · página {meta.page} de {meta.pages}</span>
      <span>
        <button className="btn" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>← Anterior</button>{' '}
        <button className="btn" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)}>Siguiente →</button>
      </span>
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="empty">{children}</p>;

/* ---------- Selector con búsqueda (FK y N:M) ---------- */
export interface LookupOpt { id: number; label: string }
export function Lookup({ resource, pk, labelOf, selected, onChange, multiple = false, placeholder = 'Buscar…' }: {
  resource: string; pk: string; labelOf: (row: any) => string;
  selected: LookupOpt[]; onChange: (v: LookupOpt[]) => void; multiple?: boolean; placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState<LookupOpt[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!open) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await api<ListResult>(`/api/${resource}?limit=8&q=${encodeURIComponent(q)}`);
        setOpts(r.data.map((x) => ({ id: x[pk], label: labelOf(x) })));
      } catch { setOpts([]); }
    }, 200);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open, resource]);

  const pick = (o: LookupOpt) => {
    if (multiple) { if (!selected.some((s) => s.id === o.id)) onChange([...selected, o]); }
    else { onChange([o]); setOpen(false); }
    setQ('');
  };

  return (
    <div className="lookup">
      <div className="chips">
        {selected.map((s) => (
          <span key={s.id} className="chip">{s.label}
            <button type="button" aria-label={`Quitar ${s.label}`} onClick={() => onChange(selected.filter((x) => x.id !== s.id))}>×</button>
          </span>
        ))}
      </div>
      {(multiple || selected.length === 0) && (
        <input value={q} placeholder={placeholder} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)} />
      )}
      {open && (
        <ul className="lookup-list">
          {opts.length === 0 && <li className="muted">Sin resultados</li>}
          {opts.map((o) => <li key={o.id}><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>{o.label}</button></li>)}
        </ul>
      )}
    </div>
  );
}
