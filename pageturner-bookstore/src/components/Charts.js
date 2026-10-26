import { money } from '@/lib/client.js';

/** Revenue per day as bars, with the running total drawn as a line (both computed in SQL by fn_sales_report). */
export function SalesChart({ rows }) {
  if (!rows?.length) return null;
  const W = 720, H = 220, P = { l: 52, r: 12, t: 12, b: 28 };
  const maxDay = Math.max(1, ...rows.map((r) => r.revenue_cents));
  const maxRun = Math.max(1, ...rows.map((r) => r.running_revenue_cents));
  const bw = (W - P.l - P.r) / rows.length;
  const y = (v, m) => P.t + (H - P.t - P.b) * (1 - v / m);
  const line = rows.map((r, i) => `${i ? 'L' : 'M'}${P.l + bw * i + bw / 2},${y(r.running_revenue_cents, maxRun)}`).join(' ');
  const step = Math.ceil(rows.length / 8);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily revenue bars with running total line">
      {[0, .5, 1].map((t) => <g key={t}><line x1={P.l} x2={W - P.r} y1={y(maxDay * t, maxDay)} y2={y(maxDay * t, maxDay)} stroke="#e3d9c4" /><text x={P.l - 6} y={y(maxDay * t, maxDay) + 4} fontSize="10" textAnchor="end" fill="#55636a">{money(maxDay * t).replace('.00', '')}</text></g>)}
      {rows.map((r, i) => (
        <g key={r.day}>
          <rect x={P.l + bw * i + 3} width={Math.max(2, bw - 6)} y={y(r.revenue_cents, maxDay)} height={H - P.b - y(r.revenue_cents, maxDay)} rx="3" fill="#2f5d50"><title>{`${r.day}: ${money(r.revenue_cents)} (${r.orders_count} orders)`}</title></rect>
          {i % step === 0 && <text x={P.l + bw * i + bw / 2} y={H - 10} fontSize="10" textAnchor="middle" fill="#55636a">{String(r.day).slice(5)}</text>}
        </g>
      ))}
      <path d={line} fill="none" stroke="#c8862a" strokeWidth="2.5" />
    </svg>
  );
}

export function BarList({ items, label, value, format = (v) => v }) {
  const max = Math.max(1, ...items.map(value));
  return (
    <div className="bars">{items.map((it, i) => (
      <div className="bar-row" key={i}><span title={label(it)} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label(it)}</span><div className="bar"><i style={{ width: `${(value(it) / max) * 100}%` }} /></div><span className="right">{format(value(it))}</span></div>
    ))}</div>
  );
}

export const Kpi = ({ label, value, tone = 'green' }) => <div className={`kpi ${tone}`}><div className="v">{value}</div><div className="l">{label}</div></div>;
