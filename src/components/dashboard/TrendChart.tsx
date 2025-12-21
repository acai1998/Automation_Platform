import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { dashboardApi } from "@/lib/api";

interface DailySummary {
  date: string;
  totalExecutions: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  successRate: number;
}

interface ComparisonData {
  runsComparison: number | null;
  successRateComparison: number | null;
  failureComparison: number | null;
}

interface TrendChartProps {
  timeRange: '7d' | '30d' | '90d';
}

export function TrendChart({ timeRange }: TrendChartProps) {
  const [trendData, setTrendData] = useState<DailySummary[]>([]);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);

  const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [trendRes, compRes] = await Promise.all([
          dashboardApi.getTrend(days),
          dashboardApi.getComparison(days),
        ]);

        if (trendRes.success && trendRes.data) {
          setTrendData(trendRes.data);
        }
        if (compRes.success && compRes.data) {
          setComparison(compRes.data);
        }
      } catch (err) {
        console.error('Failed to fetch trend data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [days]);

  // 计算平均稳定性
  const avgStability = trendData.length > 0
    ? Math.round(trendData.reduce((acc, d) => acc + (d.successRate || 0), 0) / trendData.length)
    : 0;

  // 生成 SVG 路径
  const generatePath = () => {
    if (trendData.length === 0) return '';

    const width = 800;
    const height = 200;
    const padding = 0;

    const maxValue = Math.max(...trendData.map(d => d.successRate || 0), 100);
    const minValue = Math.min(...trendData.map(d => d.successRate || 0), 0);
    const range = maxValue - minValue || 1;

    const points = trendData.map((d, i) => {
      const x = padding + (i / (trendData.length - 1 || 1)) * (width - 2 * padding);
      const y = height - padding - ((d.successRate - minValue) / range) * (height - 2 * padding);
      return { x, y };
    });

    // 生成平滑曲线
    let path = `M${points[0]?.x || 0},${points[0]?.y || height}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      path += ` C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
    }

    return path;
  };

  const linePath = generatePath();
  const areaPath = linePath ? `${linePath} V250 H0 Z` : '';

  const timeRangeLabels = {
    '7d': '7天稳定性趋势',
    '30d': '30天稳定性趋势',
    '90d': '90天稳定性趋势',
  };

  const formatComparison = (value: number | null) => {
    if (value === null) return 'N/A';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  return (
    <div className="xl:col-span-2 rounded-xl border border-slate-200 dark:border-[#234833] bg-white dark:bg-surface-dark p-6 flex flex-col">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-slate-900 dark:text-white text-lg font-bold">
            {timeRangeLabels[timeRange]}
          </h3>
          <p className="text-slate-500 dark:text-gray-400 text-sm">通过率一致性变化</p>
        </div>
        <div className="flex gap-2 items-baseline">
          <span className="text-slate-900 dark:text-white text-2xl font-bold">{avgStability}%</span>
          <span className="text-primary text-sm font-medium">稳定性</span>
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 w-full min-h-[200px] relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <svg className="w-full h-full" viewBox="0 0 800 250" preserveAspectRatio="none">
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#39E079" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#39E079" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            <line x1="0" y1="200" x2="800" y2="200" className="stroke-slate-200 dark:stroke-[#234833]" strokeWidth="1" />
            <line x1="0" y1="150" x2="800" y2="150" className="stroke-slate-100 dark:stroke-[#234833]" strokeWidth="1" strokeDasharray="4 4" />
            <line x1="0" y1="100" x2="800" y2="100" className="stroke-slate-100 dark:stroke-[#234833]" strokeWidth="1" strokeDasharray="4 4" />
            <line x1="0" y1="50" x2="800" y2="50" className="stroke-slate-100 dark:stroke-[#234833]" strokeWidth="1" strokeDasharray="4 4" />

            {/* Area fill */}
            {areaPath && (
              <path d={areaPath} fill="url(#trendGradient)" stroke="none" />
            )}

            {/* Line */}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="#39E079"
                strokeWidth="3"
                strokeLinecap="round"
              />
            )}
          </svg>
        )}
      </div>

      {/* X-Axis Labels */}
      <div className="flex justify-between mt-4 text-xs text-slate-500 dark:text-gray-500 font-medium px-2">
        {timeRange === '7d' && (
          <>
            <span>周一</span>
            <span>周二</span>
            <span>周三</span>
            <span>周四</span>
            <span>周五</span>
            <span>周六</span>
            <span>周日</span>
          </>
        )}
        {timeRange === '30d' && (
          <>
            <span>第1周</span>
            <span>第2周</span>
            <span>第3周</span>
            <span>第4周</span>
          </>
        )}
        {timeRange === '90d' && (
          <>
            <span>第1月</span>
            <span>第2月</span>
            <span>第3月</span>
          </>
        )}
      </div>

      {/* Comparison Stats */}
      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-[#234833] grid grid-cols-3 gap-4">
        <div className="text-center">
          <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">执行总次数环比</p>
          <p className={`text-sm font-bold ${comparison?.runsComparison && comparison.runsComparison >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatComparison(comparison?.runsComparison ?? null)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">成功率环比</p>
          <p className={`text-sm font-bold ${comparison?.successRateComparison && comparison.successRateComparison >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatComparison(comparison?.successRateComparison ?? null)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">失败次数环比</p>
          <p className={`text-sm font-bold ${comparison?.failureComparison && comparison.failureComparison <= 0 ? 'text-success' : 'text-danger'}`}>
            {formatComparison(comparison?.failureComparison ?? null)}
          </p>
        </div>
      </div>
    </div>
  );
}
