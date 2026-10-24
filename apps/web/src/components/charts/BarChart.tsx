export interface BarDatum {
  label: string;
  value: number;
  /** Texto do valor sobre a barra (ex.: "2,5 h"). */
  valueLabel: string;
  highlight?: boolean;
}

/** Gráfico de barras simples em HTML/CSS, com texto alternativo para leitores de tela. */
export function BarChart({ data, ariaLabel }: { data: BarDatum[]; ariaLabel: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const summary = data.map((d) => `${d.label}: ${d.valueLabel}`).join('; ');
  return (
    <div role="img" aria-label={`${ariaLabel}. ${summary}`}>
      <div className="bars" aria-hidden>
        {data.map((d) => (
          <div className="bar-col" key={d.label}>
            <div className="bar-track">
              <div
                className={`bar ${d.highlight ? 'is-today' : ''} ${d.value === 0 ? 'is-empty' : ''}`}
                style={{ height: `${(d.value / max) * 100}%` }}
              >
                {d.value > 0 && <span className="bar-value">{d.valueLabel}</span>}
              </div>
            </div>
            <span className={`bar-label ${d.highlight ? 'is-today' : ''}`}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
