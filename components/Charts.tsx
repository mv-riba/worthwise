import { formatMoney, monthLabel } from '@/lib/core/constants';

type Series = { name: string; color: string; values: (number | null)[]; dashed?: boolean; fill?: boolean };

function niceRange(min: number, max: number) {
  if (min === max) { min -= Math.abs(min) * 0.1 || 1; max += Math.abs(max) * 0.1 || 1; }
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

/** Round tick values (1, 2, 2.5 or 5 × a power of ten) inside [lo, hi]. */
function niceTicks(lo: number, hi: number, target = 4) {
  const raw = (hi - lo) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t * 100) / 100);
  return out;
}

export function LineChart({ months, series, currency, height = 240 }: { months: string[]; series: Series[]; currency: string; height?: number }) {
  const W = 720, H = height, L = 70, R = 30, T = 14, B = 30;
  const all = series.flatMap((s) => s.values).filter((v): v is number => typeof v === 'number');
  if (months.length < 1 || !all.length) {
    return <p className="muted small">Your trend appears here after your first check-in.</p>;
  }
  const [lo, hi] = niceRange(Math.min(...all), Math.max(...all));
  const x = (i: number) => (months.length === 1 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (months.length - 1));
  const y = (v: number) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const ticks = niceTicks(lo, hi);
  const labelEvery = Math.max(1, Math.ceil(months.length / 8));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Net worth trend">
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`fill-${i}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#ece2cf" strokeDasharray="3 5" />
            <text x={L - 10} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#77718f">{formatMoney(t, currency, { compact: true })}</text>
          </g>
        ))}
        {lo < 0 && hi > 0 && <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#c9bfa9" />}
        {months.map((m, i) => (i % labelEvery === 0 || i === months.length - 1) && (
          <text key={m} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#77718f">{monthLabel(m)}</text>
        ))}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => (v === null ? null : [x(i), y(v)] as const));
          const segs: string[] = [];
          let cur = '';
          pts.forEach((p) => {
            if (!p) { if (cur) segs.push(cur); cur = ''; return; }
            cur += (cur ? ' L' : 'M') + `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
          });
          if (cur) segs.push(cur);
          const valid = pts.filter(Boolean) as (readonly [number, number])[];
          return (
            <g key={si}>
              {s.fill && valid.length > 1 && (
                <path d={`M${valid[0][0]} ${H - B} L${valid.map((p) => `${p[0]} ${p[1]}`).join(' L')} L${valid[valid.length - 1][0]} ${H - B} Z`} fill={`url(#fill-${si})`} />
              )}
              {segs.map((d, i) => (
                <path key={i} d={d} fill="none" stroke={s.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? '6 6' : undefined} />
              ))}
              {s.values.map((v, i) => v !== null && (
                <circle key={i} cx={x(i)} cy={y(v)} r={months.length > 24 ? 2.5 : 4} fill="white" stroke={s.color} strokeWidth={2.5}>
                  <title>{`${s.name} · ${monthLabel(months[i], 'long')}: ${formatMoney(v, currency)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <div className="row small" style={{ gap: 16, marginTop: 4 }}>
          {series.map((s) => (
            <span key={s.name} className="row" style={{ gap: 6 }}><span className="dot" style={{ background: s.color }} />{s.name}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function BarPairs({ months, a, b, currency }: {
  months: string[];
  a: { name: string; color: string; values: (number | null)[] };
  b: { name: string; color: string; values: (number | null)[] };
  currency: string;
}) {
  const W = 720, H = 220, L = 70, R = 10, T = 12, B = 30;
  const all = [...a.values, ...b.values].filter((v): v is number => typeof v === 'number');
  if (!all.length) return <p className="muted small">Spending estimates appear from your second check-in onwards.</p>;
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  const [ylo, yhi] = niceRange(lo, hi);
  const y = (v: number) => T + ((yhi - v) * (H - T - B)) / (yhi - ylo);
  const slot = (W - L - R) / months.length;
  const bw = Math.min(22, slot / 3);
  const ticks = niceTicks(ylo, yhi, 3);
  const labelEvery = Math.max(1, Math.ceil(months.length / 8));

  const bar = (v: number | null, cx: number, color: string, label: string, month: string) => {
    if (v === null) return null;
    const y0 = y(0), y1 = y(v);
    return (
      <rect x={cx} y={Math.min(y0, y1)} width={bw} height={Math.max(1, Math.abs(y1 - y0))} rx={5} fill={color}>
        <title>{`${label} · ${monthLabel(month, 'long')}: ${formatMoney(v, currency)}`}</title>
      </rect>
    );
  };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Spending and growth by month">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#ece2cf" strokeDasharray="3 5" />
            <text x={L - 10} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#77718f">{formatMoney(t, currency, { compact: true })}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#c9bfa9" />
        {months.map((m, i) => {
          const cx = L + slot * i + slot / 2;
          return (
            <g key={m}>
              {bar(a.values[i], cx - bw - 2, a.color, a.name, m)}
              {bar(b.values[i], cx + 2, b.color, b.name, m)}
              {(i % labelEvery === 0 || i === months.length - 1) && (
                <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="#77718f">{monthLabel(m)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="row small" style={{ gap: 16 }}>
        <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: a.color }} />{a.name}</span>
        <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: b.color }} />{b.name}</span>
      </div>
    </div>
  );
}

export function Change({ value, currency, label }: { value: number | null; currency: string; label?: string }) {
  if (value === null || value === undefined) return <span className="pill flat">No previous month</span>;
  const cls = value > 0.5 ? 'up' : value < -0.5 ? 'down' : 'flat';
  return (
    <span className={`pill ${cls}`}>
      {cls === 'up' ? '▲' : cls === 'down' ? '▼' : '•'} {formatMoney(Math.abs(value), currency)}{label ? ` ${label}` : ''}
    </span>
  );
}
