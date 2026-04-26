import { useEffect, useState, useMemo, useCallback } from "react";
import { Loader2, TrendingUp, BarChart3, HelpCircle, RefreshCw } from "lucide-react";
import { dashboardApi } from "@/api";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Tooltip as UiTooltip, TooltipTrigger as UiTooltipTrigger, TooltipContent as UiTooltipContent } from "@/components/ui/tooltip";
import type { DashboardResponse } from "@/types/dashboard";

// ============================================
// 暗色模式检测 Hook
// ============================================
function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

// ============================================
// 配置常量
// ============================================
const CHART_CONFIG = {
  colors: {
    primary: '#39E079',   // 成功率 - 绿色
    danger: '#f87171',    // 失败用例 - 红色
    // grid/axis 通过 useIsDarkMode 动态获取
    gridLight: '#e2e8f0',
    gridDark: '#252d3d',
    axisLight: '#94a3b8',
    axisDark: '#4a5568',
  },
  dimensions: {
    height: 250,
    margin: { top: 10, right: 50, left: 0, bottom: 2 },
    yAxisWidth: 45,
    yAxisRightWidth: 40,
  },
  line: {
    strokeWidth: 2.5,
    dotRadius: 3,
    activeDotRadius: 5,
  },
  bar: {
    radius: [4, 4, 0, 0] as [number, number, number, number],
    maxBarSize: {
      '7d': 28,
      '30d': 14,
      '90d': 7,
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
  data?: DashboardResponse;
  onRefresh?: () => Promise<void>;
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
  isLoading?: boolean;
  onRefresh?: () => Promise<void>;
}

interface ChartStatsProps {
  avgStability: number;
  totalExecutions: number;
  totalFailed: number;
  hasData: boolean;
}

// ============================================
// 子组件
// ============================================

/** 格式化 Tooltip 中的日期显示（完整日期，如 2026-01-04） */
function formatTooltipDate(dateStr: string): string {
  if (!dateStr) return '';

  try {
    if (dateStr.includes('T')) {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;

      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }

    return dateStr;
  } catch {
    return dateStr;
  }
}

/** 自定义 Tooltip 组件 */
function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const totalCases = (data.passedCases ?? 0) + (data.failedCases ?? 0) + (data.skippedCases ?? 0);
  const successRate = Number(data.successRate) || 0;
  const formattedDate = formatTooltipDate(label || '');

  return (
    <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark rounded-lg shadow-lg p-3 min-w-[180px]">
      <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
        {formattedDate}
      </p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-gray-400">执行用例总数</span>
          <span className="font-medium text-slate-900 dark:text-white">{totalCases}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-gray-400">成功用例数</span>
          <span className="font-medium text-success">{data.passedCases ?? 0}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-gray-400">失败用例数</span>
          <span className="font-medium text-danger">{data.failedCases ?? 0}</span>
        </div>
        <div className="flex justify-between border-t border-slate-100 dark:border-border-dark pt-1 mt-1">
          <span className="text-slate-500 dark:text-gray-400">成功率</span>
          <span className="font-bold text-primary">{successRate.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

/** 自定义图例渲染 */
function renderLegend() {
  return (
    <div className="flex items-center justify-center gap-5 mt-1 text-xs text-slate-500 dark:text-gray-400">
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-5 h-0.5 rounded bg-[#39E079]" />
        成功率（左轴）
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-sm bg-[#f87171] opacity-70" />
        失败用例数（右轴）
      </span>
    </div>
  );
}

/** 图表头部组件 */
function ChartHeader({ timeRange, chartType, onChartTypeChange, isLoading = false, onRefresh }: ChartHeaderProps) {
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
                aria-label="查看趋势图说明"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </UiTooltipTrigger>
            <UiTooltipContent side="top" sideOffset={12} className="max-w-xs">
              <div className="text-slate-600 dark:text-gray-400 text-sm">
                展示过去 {timeRange === '7d' ? '7 天' : timeRange === '30d' ? '30 天' : '90 天'} 的成功率趋势与失败用例数，用于评估稳定性变化。
              </div>
            </UiTooltipContent>
          </UiTooltip>
        </div>
        <p className="text-slate-500 dark:text-gray-400 text-sm">通过率 & 失败量双维度（T-1 数据）</p>
      </div>

      <div className="flex items-center gap-2">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="刷新数据"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => onChartTypeChange('line')}
          disabled={isLoading}
          aria-label="切换为折线图"
          aria-pressed={chartType === 'line'}
          className={`p-2 rounded-lg transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
            chartType === 'line'
              ? 'bg-primary/10 text-primary'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-gray-300'
          }`}
        >
          <TrendingUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onChartTypeChange('bar')}
          disabled={isLoading}
          aria-label="切换为柱状图"
          aria-pressed={chartType === 'bar'}
          className={`p-2 rounded-lg transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
            chartType === 'bar'
              ? 'bg-primary/10 text-primary'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-gray-300'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** 统计信息组件 */
function ChartStats({ avgStability, totalExecutions, totalFailed, hasData }: ChartStatsProps) {
  return (
    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-border-dark grid grid-cols-3 gap-4">
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
        <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">总失败用例数</p>
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
export function TrendChart({ timeRange, data, onRefresh }: TrendChartProps) {
  const [chartType, setChartType] = useState<ChartType>('line');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDark = useIsDarkMode();

  const chartColors = useMemo(() => ({
    grid: isDark ? CHART_CONFIG.colors.gridDark : CHART_CONFIG.colors.gridLight,
    axis: isDark ? CHART_CONFIG.colors.axisDark : CHART_CONFIG.colors.axisLight,
  }), [isDark]);

  const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;

  // 使用批量数据或回退到单独获取
  const trendData = data?.trendData || [];

  // 数据获取函数（仅在批量数据不可用时使用）
  const fetchData = useCallback(async () => {
    if (data?.trendData) return;

    try {
      setLoading(true);
      setError(null);
      const trendRes = await dashboardApi.getTrend(days);

      if (trendRes.success && trendRes.data) {
        // 使用批量数据路径，这里很少执行
      } else {
        setError('获取数据失败');
      }
    } catch (err) {
      console.error('Failed to fetch trend data:', err);
      const errorMessage = err instanceof Error
        ? `获取趋势数据失败: ${err.message}`
        : '获取趋势数据失败，请稍后重试';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [days, data?.trendData]);

  useEffect(() => {
    if (!data?.trendData) {
      fetchData();
    }
  }, [fetchData, data?.trendData]);

  // 统计信息
  const avgStability = useMemo(() => {
    if (trendData.length === 0) return 0;
    // 仅统计有执行数据的天的成功率，避免补零天拉低均值
    const daysWithData = trendData.filter(d =>
      (d.passedCases || 0) + (d.failedCases || 0) + (d.skippedCases || 0) > 0
    );
    if (daysWithData.length === 0) return 0;
    const total = daysWithData.reduce((acc, d) => acc + (d.successRate || 0), 0);
    return Math.round((total / daysWithData.length) * 10) / 10;
  }, [trendData]);

  const totalExecutions = useMemo(() => {
    return trendData.reduce((acc, d) => acc + (d.totalExecutions || 0), 0);
  }, [trendData]);

  const totalFailed = useMemo(() => {
    return trendData.reduce((acc, d) => acc + (d.failedCases || 0), 0);
  }, [trendData]);

  // 右轴最大值（失败用例数），动态计算
  const failedMax = useMemo(() => {
    const max = Math.max(...trendData.map(d => d.failedCases || 0), 1);
    return Math.ceil(max * 1.2); // 留 20% 余量
  }, [trendData]);

  // X轴配置
  const xAxisConfig = useMemo(() => {
    switch (timeRange) {
      case '7d':
        return { angle: 0, textAnchor: 'middle' as const, interval: 0 };
      case '30d':
        return { angle: -45, textAnchor: 'end' as const, interval: 0 };
      case '90d': {
        const dataLength = trendData.length || 90;
        const interval = Math.max(0, Math.ceil(dataLength / 12) - 1);
        return { angle: -45, textAnchor: 'end' as const, interval };
      }
      default:
        return { angle: -45, textAnchor: 'end' as const, interval: 0 };
    }
  }, [timeRange, trendData.length]);

  const formatDate = useCallback((dateStr: string) => {
    if (!dateStr) return '';

    try {
      if (dateStr.includes('T')) {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${month}-${day}`;
      }

      const parts = dateStr.split('-');
      if (parts.length >= 3) {
        return `${parts[1]}-${parts[2]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  }, []);

  const chartData = useMemo(() => {
    return trendData.map(item => ({
      ...item,
      formattedDate: formatDate(item.date)
    }));
  }, [trendData, formatDate]);

  const commonAxisTick = useMemo(() => ({
    fontSize: CHART_CONFIG.xAxis.fontSize,
    fill: chartColors.axis,
  }), [chartColors.axis]);

  const xAxisProps = useMemo(() => ({
    dataKey: "date",
    tickFormatter: formatDate,
    tick: { ...commonAxisTick, angle: xAxisConfig.angle, textAnchor: xAxisConfig.textAnchor },
    tickLine: false,
    axisLine: { stroke: chartColors.grid },
    interval: xAxisConfig.interval,
    height: CHART_CONFIG.xAxis.height[timeRange],
  }), [formatDate, xAxisConfig, timeRange, commonAxisTick, chartColors.grid]);

  // 左轴：成功率
  const yAxisLeftProps = useMemo(() => ({
    yAxisId: "left",
    domain: [0, 100] as [number, number],
    tick: commonAxisTick,
    tickLine: false,
    axisLine: false,
    tickFormatter: (v: number) => `${v}%`,
    width: CHART_CONFIG.dimensions.yAxisWidth,
  }), [commonAxisTick]);

  // 右轴：失败用例数
  const yAxisRightProps = useMemo(() => ({
    yAxisId: "right",
    orientation: "right" as const,
    domain: [0, failedMax] as [number, number],
    tick: commonAxisTick,
    tickLine: false,
    axisLine: false,
    tickFormatter: (v: number) => `${v}`,
    width: CHART_CONFIG.dimensions.yAxisRightWidth,
    allowDecimals: false,
  }), [commonAxisTick, failedMax]);

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

    return (
      <ResponsiveContainer width="100%" height={CHART_CONFIG.dimensions.height} minHeight={CHART_CONFIG.dimensions.height}>
        <ComposedChart data={chartData} margin={CHART_CONFIG.dimensions.margin}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={chartColors.grid}
            vertical={false}
          />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisLeftProps} />
          <YAxis {...yAxisRightProps} />
          <Tooltip content={<CustomTooltip />} cursor={false} />
          <Legend content={renderLegend} />

          {/* 失败用例数 - 柱状/面积，始终用柱子可见 */}
          <Bar
            yAxisId="right"
            dataKey="failedCases"
            name="失败用例数"
            fill={CHART_CONFIG.colors.danger}
            radius={CHART_CONFIG.bar.radius}
            maxBarSize={CHART_CONFIG.bar.maxBarSize[timeRange]}
            opacity={0.65}
          />

          {/* 成功率 - 折线或柱状 */}
          {chartType === 'line' ? (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="successRate"
              name="成功率"
              stroke={CHART_CONFIG.colors.primary}
              strokeWidth={CHART_CONFIG.line.strokeWidth}
              dot={{ fill: CHART_CONFIG.colors.primary, strokeWidth: 0, r: CHART_CONFIG.line.dotRadius }}
              activeDot={{ fill: CHART_CONFIG.colors.primary, strokeWidth: 2, stroke: '#fff', r: CHART_CONFIG.line.activeDotRadius }}
            />
          ) : (
            <Bar
              yAxisId="left"
              dataKey="successRate"
              name="成功率"
              fill={CHART_CONFIG.colors.primary}
              radius={CHART_CONFIG.bar.radius}
              maxBarSize={CHART_CONFIG.bar.maxBarSize[timeRange]}
              opacity={0.9}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div
      className="rounded-xl border border-slate-200 dark:border-border-dark bg-white dark:bg-surface-dark p-6 flex flex-col transition-all duration-200 hover:shadow-lg hover:border-primary/10"
      role="region"
      aria-label={TIME_RANGE_LABELS[timeRange]}
    >
      <ChartHeader
        timeRange={timeRange}
        chartType={chartType}
        onChartTypeChange={setChartType}
        isLoading={loading}
        onRefresh={onRefresh}
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
