import { useEffect, useState, useMemo, useCallback } from "react";
import { Loader2, TrendingUp, BarChart3, HelpCircle, RefreshCw } from "lucide-react";
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

// ============================================
// 配置常量
// ============================================
const CHART_CONFIG = {
  colors: {
    primary: '#39E079',
    grid: '#e2e8f0',
    axis: '#94a3b8',
  },
  dimensions: {
    height: 250,
    margin: { top: 10, right: 10, left: 0, bottom: 2 },
    yAxisWidth: 45,
  },
  line: {
    strokeWidth: 2.5,
    dotRadius: 3,
    activeDotRadius: 5,
  },
  bar: {
    radius: [4, 4, 0, 0] as [number, number, number, number],
    maxBarSize: {
      '7d': 30,
      '30d': 15,
      '90d': 8,
    },
  },
  xAxis: {
    fontSize: 11,
    height: {
      '7d': 30,
      '30d': 50,
      '90d': 50,
    },
  },
} as const;

const TIME_RANGE_LABELS = {
  '7d': '近7天稳定性趋势',
  '30d': '近30天稳定性趋势',
  '90d': '近90天稳定性趋势',
} as const;

// ============================================
// 类型定义
// ============================================
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

interface ChartHeaderProps {
  timeRange: '7d' | '30d' | '90d';
  chartType: ChartType;
  onChartTypeChange: (type: ChartType) => void;
}

interface ChartStatsProps {
  avgStability: number;
  totalExecutions: number;
  totalFailed: number;
}

// ============================================
// 子组件
// ============================================

/** 自定义 Tooltip 组件 */
function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const totalCases = Number(data.passedCases || 0) + Number(data.failedCases || 0) + Number(data.skippedCases || 0);
  const successRate = Number(data.successRate) || 0;

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
          <span className="font-bold text-primary">{successRate.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

/** 图表头部组件 */
function ChartHeader({ timeRange, chartType, onChartTypeChange }: ChartHeaderProps) {
  return (
    <div className="flex justify-between items-start mb-6">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-slate-900 dark:text-white text-lg font-bold">
            {TIME_RANGE_LABELS[timeRange]}
          </h3>
          <UiTooltip>
            <UiTooltipTrigger asChild>
              <button
                type="button"
                className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                title="查看说明"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </UiTooltipTrigger>
            <UiTooltipContent side="top" className="max-w-xs">
              <div className="text-slate-600 dark:text-gray-400 text-sm">
                展示过去 {timeRange === '7d' ? '7 天' : timeRange === '30d' ? '30 天' : '90 天'} 的成功率趋势，用于评估稳定性变化。
              </div>
            </UiTooltipContent>
          </UiTooltip>
        </div>
        <p className="text-slate-500 dark:text-gray-400 text-sm">通过率一致性变化（T-1 数据）</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChartTypeChange('line')}
          className={`p-2 rounded-lg transition-colors focus:outline-none ${
            chartType === 'line'
              ? 'bg-primary/10 text-primary'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-gray-300'
          }`}
          title="折线图"
        >
          <TrendingUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onChartTypeChange('bar')}
          className={`p-2 rounded-lg transition-colors focus:outline-none ${
            chartType === 'bar'
              ? 'bg-primary/10 text-primary'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-gray-300'
          }`}
          title="柱状图"
        >
          <BarChart3 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** 统计信息组件 */
function ChartStats({ avgStability, totalExecutions, totalFailed, hasData }: ChartStatsProps & { hasData: boolean }) {
  return (
    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-[#234833] grid grid-cols-3 gap-4">
      <div className="text-center">
        <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">平均成功率</p>
        <p className={`text-lg font-bold ${hasData ? 'text-primary' : 'text-slate-400 dark:text-gray-500'}`}>
          {hasData ? `${avgStability}%` : 'N/A'}
        </p>
      </div>
      <div className="text-center">
        <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">总执行次数</p>
        <p className={`text-lg font-bold ${hasData ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-gray-500'}`}>
          {hasData ? totalExecutions : 'N/A'}
        </p>
      </div>
      <div className="text-center">
        <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">总失败次数</p>
        <p className={`text-lg font-bold ${hasData ? 'text-danger' : 'text-slate-400 dark:text-gray-500'}`}>
          {hasData ? totalFailed : 'N/A'}
        </p>
      </div>
    </div>
  );
}

// ============================================
// 主组件
// ============================================
export function TrendChart({ timeRange }: TrendChartProps) {
  const [trendData, setTrendData] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<ChartType>('line');

  const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;

  // 数据获取函数
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const trendRes = await dashboardApi.getTrend(days);

      if (trendRes.success && trendRes.data) {
        setTrendData(trendRes.data);
      } else {
        setError('获取数据失败');
      }
    } catch (err) {
      console.error('Failed to fetch trend data:', err);
      setError('获取趋势数据失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 使用 useMemo 缓存计算结果
  const avgStability = useMemo(() => {
    if (trendData.length === 0) return 0;
    const total = trendData.reduce((acc, d) => acc + (d.successRate || 0), 0);
    return Math.round((total / trendData.length) * 10) / 10;
  }, [trendData]);

  const totalExecutions = useMemo(() => {
    return trendData.reduce((acc, d) => acc + (d.totalExecutions || 0), 0);
  }, [trendData]);

  const totalFailed = useMemo(() => {
    return trendData.reduce((acc, d) => acc + (d.failedCases || 0), 0);
  }, [trendData]);

  // X轴配置
  const xAxisConfig = useMemo(() => {
    switch (timeRange) {
      case '7d':
        return { angle: 0, textAnchor: 'middle' as const, interval: 0 };
      case '30d':
        return { angle: -45, textAnchor: 'end' as const, interval: 0 };
      case '90d':
        return { angle: -45, textAnchor: 'end' as const, interval: 6 };
      default:
        return { angle: -45, textAnchor: 'end' as const, interval: 0 };
    }
  }, [timeRange]);

  // 格式化日期显示
  const formatDate = useCallback((dateStr: string) => {
    if (!dateStr) return '';

    // 处理 ISO 格式日期 (如 2024-12-16T16:00:00.000Z)
    if (dateStr.includes('T')) {
      const date = new Date(dateStr);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${month}-${day}`;
    }

    // 处理普通格式 (如 2024-12-16)
    const parts = dateStr.split('-');
    if (parts.length >= 3) {
      return `${parts[1]}-${parts[2]}`;
    }
    return dateStr;
  }, []);

  // 渲染图表内容
  const renderChart = () => {
    if (loading) {
      return (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-gray-500">
          <p className="mb-2">{error}</p>
          <button
            type="button"
            onClick={fetchData}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            重试
          </button>
        </div>
      );
    }

    if (trendData.length === 0) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-gray-500">
          暂无数据
        </div>
      );
    }

    const commonAxisProps = {
      tick: { fontSize: CHART_CONFIG.xAxis.fontSize, fill: CHART_CONFIG.colors.axis },
      tickLine: false,
    };

    const xAxisProps = {
      ...commonAxisProps,
      dataKey: "date",
      tickFormatter: formatDate,
      axisLine: { stroke: CHART_CONFIG.colors.grid },
      angle: xAxisConfig.angle,
      textAnchor: xAxisConfig.textAnchor,
      interval: xAxisConfig.interval,
      height: CHART_CONFIG.xAxis.height[timeRange],
    };

    const yAxisProps = {
      ...commonAxisProps,
      domain: [0, 100] as [number, number],
      axisLine: false,
      tickFormatter: (value: number) => `${value}%`,
      width: CHART_CONFIG.dimensions.yAxisWidth,
    };

    return (
      <ResponsiveContainer width="100%" height={CHART_CONFIG.dimensions.height} minHeight={CHART_CONFIG.dimensions.height}>
        {chartType === 'line' ? (
          <LineChart data={trendData} margin={CHART_CONFIG.dimensions.margin}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={CHART_CONFIG.colors.grid}
              className="dark:stroke-[#234833]"
              vertical={false}
            />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Line
              type="monotone"
              dataKey="successRate"
              stroke={CHART_CONFIG.colors.primary}
              strokeWidth={CHART_CONFIG.line.strokeWidth}
              dot={{ fill: CHART_CONFIG.colors.primary, strokeWidth: 0, r: CHART_CONFIG.line.dotRadius }}
              activeDot={{ fill: CHART_CONFIG.colors.primary, strokeWidth: 2, stroke: '#fff', r: CHART_CONFIG.line.activeDotRadius }}
            />
          </LineChart>
        ) : (
          <BarChart data={trendData} margin={CHART_CONFIG.dimensions.margin}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={CHART_CONFIG.colors.grid}
              className="dark:stroke-[#234833]"
              vertical={false}
            />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Bar
              dataKey="successRate"
              fill={CHART_CONFIG.colors.primary}
              radius={CHART_CONFIG.bar.radius}
              maxBarSize={CHART_CONFIG.bar.maxBarSize[timeRange]}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    );
  };

  return (
    <div className="xl:col-span-2 rounded-xl border border-slate-200 dark:border-[#234833] bg-white dark:bg-surface-dark p-6 flex flex-col">
      <ChartHeader
        timeRange={timeRange}
        chartType={chartType}
        onChartTypeChange={setChartType}
      />

      <div className="flex-1 w-full min-h-[250px] relative">
        {renderChart()}
      </div>

      <ChartStats
        avgStability={avgStability}
        totalExecutions={totalExecutions}
        totalFailed={totalFailed}
        hasData={trendData.length > 0}
      />
    </div>
  );
}
