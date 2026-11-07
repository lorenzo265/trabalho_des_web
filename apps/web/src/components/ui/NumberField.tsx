import { useEffect, useId, useRef, useState } from 'react';
import { fmtNum, parseDecimal } from '../../lib/grades';

interface Props {
  label: string;
  value: number;
  /** Limites aceitos; `minExclusive` rejeita o próprio mínimo (ex.: peso > 0). */
  min: number;
  max: number;
  minExclusive?: boolean;
  onCommit: (value: number) => void;
  onInvalid: (message: string) => void;
  invalidMessage: string;
  /** Esconde o rótulo (fica só para leitores de tela). */
  hideLabel?: boolean;
  disabled?: boolean;
  width?: number;
}

/**
 * Campo numérico que aceita vírgula e só confirma ao sair do campo ou teclar Enter.
 * Valor inválido volta para o anterior (e avisa), em vez de gravar lixo.
 */
export function NumberField({ label, value, min, max, minExclusive, onCommit, onInvalid, invalidMessage, hideLabel, disabled, width = 76 }: Props) {
  const id = useId();
  const [draft, setDraft] = useState(fmtNum(value));
  useEffect(() => setDraft(fmtNum(value)), [value]);
  // Esc descarta: o blur que vem depois não pode confirmar o rascunho (o estado ainda é o antigo nesse instante).
  const discard = useRef(false);

  const commit = () => {
    if (discard.current) {
      discard.current = false;
      setDraft(fmtNum(value));
      return;
    }
    const n = parseDecimal(draft);
    const ok = Number.isFinite(n) && (minExclusive ? n > min : n >= min) && n <= max;
    if (!ok) {
      setDraft(fmtNum(value));
      onInvalid(invalidMessage);
      return;
    }
    setDraft(fmtNum(n));
    if (n !== value) onCommit(n);
  };

  return (
    <label className="number-field" htmlFor={id}>
      <span className={hideLabel ? 'sr-only' : 'small muted'}>{label}</span>
      <input
        id={id}
        className="input"
        style={{ width, minHeight: 40, textAlign: 'center' }}
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            discard.current = true;
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
