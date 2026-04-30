import { PieChart, Pie, Cell } from "recharts";
import type { HoveredSegment, ChartSegment } from "./types";

interface DonutChartProps {
  animationKey: number;
  chartData: {
    total: number;
    segments: ChartSegment[];
    isEmpty: boolean;
  };
  hoveredSegment: HoveredSegment | null;
  onSegmentHover: (segment: unknown) => void;
  onSegmentLeave: () => void;
}

export function DonutChart({
  animationKey,
  chartData,
  hoveredSegment,
  onSegmentHover,
  onSegmentLeave,
}: DonutChartProps) {
  return (
    <div className="relative flex-shrink-0" style={{ width: 172, height: 172 }}>
      {chartData.isEmpty ? (
        <>
          <PieChart width={172} height={172}>
            <Pie
              data={[{ name: "empty", value: 1 }]}
              cx={86}
              cy={86}
              innerRadius={55}
              outerRadius={80}
              dataKey="value"
              isAnimationActive={false}
            >
              <Cell fill="#e2e8f0" stroke="transparent" />
            </Pie>
          </PieChart>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-3xl font-bold text-slate-600 dark:text-slate-300">{chartData.total}</div>
              <div className="text-sm text-slate-400 dark:text-slate-500 font-medium">总用例</div>
            </div>
          </div>
        </>
      ) : (
        <>
          <PieChart key={animationKey} width={172} height={172}>
            <Pie
              data={chartData.segments}
              cx={86}
              cy={86}
              startAngle={-90}
              endAngle={270}
              innerRadius={55}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              animationBegin={200}
              animationDuration={1000}
              animationEasing="ease-out"
              onMouseEnter={onSegmentHover}
              onMouseLeave={onSegmentLeave}
            >
              {chartData.segments.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  stroke={hoveredSegment?.name === entry.name ? entry.color : "transparent"}
                  strokeWidth={hoveredSegment?.name === entry.name ? 3 : 0}
                  opacity={hoveredSegment && hoveredSegment.name !== entry.name ? 0.45 : 1}
                  style={{ cursor: "pointer", transition: "opacity 0.2s" }}
                />
              ))}
            </Pie>
          </PieChart>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center transition-all duration-200">
              {hoveredSegment ? (
                <>
                  <div
                    className="text-2xl font-bold transition-colors duration-200"
                    style={{ color: hoveredSegment.color }}
                  >
                    {hoveredSegment.value}
                  </div>
                  <div className="text-xs font-medium text-slate-500 dark:text-gray-400">
                    {hoveredSegment.name}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-3xl font-bold text-slate-900 dark:text-white">{chartData.total}</div>
                  <div className="text-sm text-slate-600 dark:text-gray-300 font-medium">总用例</div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
