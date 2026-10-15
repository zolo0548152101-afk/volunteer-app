/** גרף עמודות פשוט ב-SVG, בלי ספרייה. הטבלה שמתחתיו היא החלופה הנגישה, לכן הגרף עצמו aria-hidden */
export function BarChart({ data, unit }: { data: { label: string; value: number }[]; unit: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const barH = 22, gap = 8, labelW = 120, w = 360, h = data.length * (barH + gap);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-hidden="true" className="mt-2 w-full max-w-md">
      {data.map((d, i) => {
        const bw = Math.max(2, ((w - labelW - 50) * d.value) / max), y = i * (barH + gap);
        return (
          <g key={d.label} transform={`translate(0 ${y})`}>
            <text x={labelW - 6} y={barH / 2 + 4} textAnchor="end" fontSize="11" fill="currentColor">{d.label.length > 18 ? `${d.label.slice(0, 17)}…` : d.label}</text>
            <rect x={labelW} y={0} width={bw} height={barH} rx={4} className="fill-primary" />
            <text x={labelW + bw + 4} y={barH / 2 + 4} fontSize="11" fill="currentColor">{d.value}{unit}</text>
          </g>
        );
      })}
    </svg>
  );
}
