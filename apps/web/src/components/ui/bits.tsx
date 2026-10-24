import { CircleAlert, Loader2, RefreshCw } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { SUBJECT_COLORS } from '@edumind/contracts';

export function Spinner({ size = 18 }: { size?: number }) {
  return <Loader2 size={size} className="spin" aria-hidden />;
}

export function Skeleton({ h = 72, w, style }: { h?: number; w?: number | string; style?: CSSProperties }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} aria-hidden />;
}

export function SkeletonList({ n = 3, h = 76 }: { n?: number; h?: number }) {
  return (
    <div className="stack-sm" role="status" aria-label="Carregando">
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} h={h} />
      ))}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {children && <p style={{ maxWidth: 360 }}>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Algo deu errado.';
  return (
    <div className="empty" role="alert">
      <div className="empty-icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
        <CircleAlert size={28} />
      </div>
      <h3>Não deu certo</h3>
      <p style={{ maxWidth: 360 }}>{message}</p>
      {onRetry && (
        <button className="btn btn-outline btn-sm" onClick={onRetry}>
          <RefreshCw size={16} /> Tentar de novo
        </button>
      )}
    </div>
  );
}

export function ProgressBar({ value, color, onColor, label }: { value: number; color?: string; onColor?: boolean; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div
      className={`progress ${onColor ? 'progress-on-color' : ''}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Progresso'}
    >
      <span style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Cor temática">
      {SUBJECT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value.toLowerCase() === c.toLowerCase()}
          aria-label={`Cor ${c}`}
          className="swatch"
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? (
        <span className="field-error" id={`${htmlFor}-error`} role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="field-hint">{hint}</span>
      )}
    </div>
  );
}
