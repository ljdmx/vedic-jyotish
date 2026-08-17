import type { VedicChart as VedicChartData } from "@shared/vedic-engine";

const abbreviated: Record<string, string> = {
  Sun: "Su", Moon: "Mo", Mars: "Ma", Mercury: "Me", Jupiter: "Ju", Venus: "Ve", Saturn: "Sa", Rahu: "Ra", Ketu: "Ke",
};

export default function VedicChart({ chart, compact = false }: { chart: VedicChartData; compact?: boolean }) {
  return (
    <div className={`vedic-chart ${compact ? "vedic-chart--compact" : ""}`} aria-label="北印度式吠陀星盘">
      <div className="chart-lagna">Lagna · {chart.lagna.signZh}</div>
      {chart.houses.map((house) => (
        <div key={house.house} className={`chart-house chart-house-${house.house}`}>
          <span className="house-number">{house.house}</span>
          <span className="house-sign">{house.signZh}</span>
          {house.occupants.length > 0 && <span className="house-planets">{house.occupants.map(item => abbreviated[item] || item).join(" · ")}</span>}
        </div>
      ))}
      <div className="chart-diamond" />
    </div>
  );
}
