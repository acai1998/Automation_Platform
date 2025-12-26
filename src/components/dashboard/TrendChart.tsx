import { useEffect, useState } from "react";
import { Loader2, TrendingUp, BarChart3, HelpCircle } from "lucide-react";
import { dashboardApi } from "@/lib/api";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Tooltip as UiTooltip, TooltipTrigger as UiTooltipTrigger, TooltipContent as UiTooltipContent } from "@/components/ui/tooltip";

interface DailySummary {
  date: string;
  totalExecutions: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  successRate: number;
}

interface TrendChartProps {
  timeRange: '7d' | '30d' | '90d';
}

type ChartType = 'line' | 'bar';

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DailySummary }>;
  label?: string;
}

/** 自定义 Tooltip 组件 */
function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const totalCases = data.passedCases + data.failedCases + data.skippedCases;

  return (
    <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-[#234833] rounded-lg shadow-lg p-3 min-w-[180px]">
      <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
        {label}
      </p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-gray-400">执行用例总数</span>
          <span className="font-medium text-slate-900 dark:text-white">{totalCases}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-gray-400">成功用例数</span>
          <span className="font-medium text-success">{data.passedCases}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-gray-400">失败用例数</span>
          <span className="font-medium text-danger">{data.failedCases}</span>
        </div>
        <div className="flex justify-between border-t border-slate-100 dark:border-[#234833] pt-1 mt-1">
          <span className="text-slate-500 dark:text-gray-400">成功率</span>
          <span className="font-bold text-primary">{data.successRate?.toFixed(1) ?? 0}%</span>
        </div>
      </div>
    </div>
  );
}

export function TrendChart({ timeRange }: TrendChartProps) {
  const [trendData, setTrendData] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<ChartType>('line');

  const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const trendRes = await dashboardApi.getTrend(days);

        if (trendRes.success && trendRes.data) {
          setTrendData(trendRes.data);
        }
      } catch (err) {
        console.error('Failed to fetch trend data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [days]);

  // 计算汇总数据
  const avgStability = trendData.length > 0
    ? Math.round(trendData.reduce((acc, d) => acc + (d.successRate || 0), 0) / trendData.length * 10) / 10
    : 0;

  const totalExecutions = trendData.reduce((acc, d) => acc + (d.totalExecutions || 0), 0);
  const totalFailed = trendData.reduce((acc, d) => acc + (d.failedCases || 0), 0);

  const timeRangeLabels = {
    '7d': '近7天稳定性趋势',
    '30d': '近30天稳定性趋势',
    '90d': '近90天稳定性趋势',
  };

  // X轴配置：根据时间周期调整倾斜角度和间隔
  const getXAxisConfig = () => {
    switch (timeRange) {
      case '7d':
        return { angle: 0, textAnchor: 'end' as const, interval: 0 };
      case '30d':
        return { angle: -45, textAnchor: 'end' as const, interval: 0 };
      case '90d':
        return { angle: -45, textAnchor: 'end' as const, interval: 6 }; // 每7天显示一个刻度
      default:
        return { angle: -45, textAnchor: 'end' as const, interval: 0 };
    }
  };

  const xAxisConfig = getXAxisConfig();

  // 格式化日期显示
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    // 将 YYYY-MM-DD 格式化为 MM-DD
    const parts = dateStr.split('-');
    if (parts.length >= 3) {
      return `${parts[1]}-${parts[2]}`;
    }
    return dateStr;
  };

  // 共用的图表配置
  const chartMargin = {
    top: 10,
    right: 10,
    left: 0,
    bottom: 2, // 👈 问题核心
  };

  // const chartMargin = { top: 10, right: 10, left: 0, bottom: timeRange === '7d' ? 20 : 40 };

  return (
    <div className="xl:col-span-2 rounded-xl border border-slate-200 dark:border-[#234833] bg-white dark:bg-surface-dark p-6 flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-slate-900 dark:text-white text-lg font-bold">
              {timeRangeLabels[timeRange]}
            </h3>
            <UiTooltip>
              <UiTooltipTrigger asChild>
                <button className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors" title="查看说明">
                  <HelpCircle className="h-4 w-4" />
                </button>
              </UiTooltipTrigger>
              <UiTooltipContent side="top" className="max-w-xs">
                <div className="text-slate-600 dark:text-gray-400 text-sm">展示过去 {timeRange === '7d' ? '7 天' : timeRange === '30d' ? '30 天' : '90 天'} 的成功率趋势，用于评估稳定性变化。</div>
              </UiTooltipContent>
            </UiTooltip>
          </div>
          <p className="text-slate-500 dark:text-gray-400 text-sm">通过率一致性变化（T-1 数据）</p>
        </div>

        {/* 图表类型切换 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setChartType('line')}
            className={`p-2 rounded-lg transition-colors ${chartType === 'line'
              ? 'bg-primary/10 text-primary'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-gray-300'
              }`}
            title="折线图"
          >
            <TrendingUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setChartType('bar')}
            className={`p-2 rounded-lg transition-colors ${chartType === 'bar'
              ? 'bg-primary/10 text-primary'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-gray-300'
              }`}
            title="柱状图"
          >
            <BarChart3 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 w-full min-h-[250px] relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : trendData.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-gray-500">
            暂无数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250} minHeight={250}>
            {chartType === 'line' ? (
              <LineChart data={trendData} margin={chartMargin}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  className="dark:stroke-[#234833]"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  angle={xAxisConfig.angle}
                  textAnchor={xAxisConfig.textAnchor}
                  interval={xAxisConfig.interval}
                  height={timeRange === '7d' ? 30 : 50}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}%`}
                  width={45}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="successRate"
                  stroke="#39E079"
                  strokeWidth={2.5}
                  dot={{ fill: '#39E079', strokeWidth: 0, r: 3 }}
                  activeDot={{ fill: '#39E079', strokeWidth: 2, stroke: '#fff', r: 5 }}
                />
              </LineChart>
            ) : (
              <BarChart data={trendData} margin={chartMargin}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  className="dark:stroke-[#234833]"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  angle={xAxisConfig.angle}
                  textAnchor={xAxisConfig.textAnchor}
                  interval={xAxisConfig.interval}
                  height={timeRange === '7d' ? 30 : 50}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}%`}
                  width={45}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="successRate"
                  fill="#39E079"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={timeRange === '90d' ? 8 : timeRange === '30d' ? 15 : 30}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Summary Stats */}
      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-[#234833] grid grid-cols-3 gap-4">
        <div className="text-center">
          <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">平均成功率</p>
          <p className="text-lg font-bold text-primary">{avgStability}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">总执行次数</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{totalExecutions}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">总失败次数</p>
          <p className="text-lg font-bold text-danger">{totalFailed}</p>
        </div>
      </div>
    </div>
  );
}
