import { useState, ReactNode } from 'react';
import { Search, Play, ChevronLeft, ChevronRight, Loader2, RefreshCw, FileText, User, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCases, usePagination, type CaseType, type TestCase } from '@/hooks/useCases';
import { useTestExecution } from '@/hooks/useExecuteCase';
import { ExecutionProgress } from './ExecutionProgress';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

/**
 * 列配置
 */
export interface CaseColumn {
  key: string;
  label: string;
  width?: string;
  minWidth?: string;
  flex?: number;
  render?: (value: unknown, record: TestCase, index: number) => ReactNode;
}

/**
 * BaseCaseList 组件属性
 */
interface BaseCaseListProps {
  type: CaseType;
  title: string;
  icon: ReactNode;
  columns: CaseColumn[];
  description?: string;
}

/**
 * 通用用例列表组件
 * 三个页面（API/UI/性能）通过配置复用此组件
 * 采用现代化 SaaS Dashboard 风格设计
 */
export function BaseCaseList({ type, title, icon, columns, description }: BaseCaseListProps) {
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isProgressOpen, setIsProgressOpen] = useState(false);

  const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

  // 获取用例列表
  const { data, isLoading, error, refetch } = useCases({
    type,
    search,
    page,
    pageSize,
  });

  // 执行管理
  const {
    executeCase,
    isExecuting,
    batchInfo,
    isFetchingBatch,
    batchError,
    reset: resetExecution,
  } = useTestExecution();

  // 分页信息
  const pagination = usePagination(data?.total || 0, page, pageSize);

  // 刷新页面数据
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['cases'] });
      toast.success('页面数据已刷新');
    } catch (error) {
      toast.error('刷新失败，请重试');
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // 处理搜索
  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  // 处理运行用例
  const handleRunCase = async (caseId: number, caseName: string, projectId: number | null) => {
    // 如果没有项目ID，使用默认项目ID 1
    const finalProjectId = projectId || 1;
    
    try {
      await executeCase(caseId, finalProjectId);
      setIsProgressOpen(true);
      toast.success(`用例 "${caseName}" 已开始执行`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '执行失败';
      toast.error(message);
    }
  };

  // 渲染单元格内容
  const renderCell = (column: CaseColumn, record: TestCase, index: number) => {
    if (column.render) {
      return column.render(record[column.key as keyof TestCase], record, index);
    }

    const value = record[column.key as keyof TestCase];

    if (column.key === 'index') {
      return (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400">
          {(page - 1) * pageSize + index + 1}
        </span>
      );
    }

    if (column.key === 'actions') {
      return (
        <Button
          size="sm"
          variant="default"
          disabled={isExecuting || isFetchingBatch}
          onClick={() => handleRunCase(record.id, record.name, record.project_id)}
          className="gap-1.5 h-8 px-3 transition-all duration-200 hover:scale-105 active:scale-95"
        >
          {isExecuting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          运行
        </Button>
      );
    }

    if (column.key === 'script_path') {
      return (
        <span className="text-slate-500 dark:text-slate-400 font-mono text-xs truncate block max-w-[200px] lg:max-w-[300px]" title={value as string}>
          {(value as string) || '-'}
        </span>
      );
    }

    return value ?? '-';
  };

  // 获取类型对应的颜色主题
  const getTypeTheme = () => {
    switch (type) {
      case 'api':
        return {
          gradient: 'from-blue-500/20 via-blue-500/5 to-transparent',
          iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
          accent: 'blue',
        };
      case 'ui':
        return {
          gradient: 'from-purple-500/20 via-purple-500/5 to-transparent',
          iconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
          accent: 'purple',
        };
      default:
        return {
          gradient: 'from-orange-500/20 via-orange-500/5 to-transparent',
          iconBg: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
          accent: 'orange',
        };
    }
  };

  const theme = getTypeTheme();

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* 顶部标题区 - 带渐变背景 */}
      <div className={`relative px-4 sm:px-6 py-6 bg-gradient-to-r ${theme.gradient} dark:from-slate-800/50 dark:via-transparent rounded-t-xl`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${theme.iconBg} shadow-sm`}>
              {icon}
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {title}
              </h1>
              {description && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {description}
                </p>
              )}
            </div>
          </div>

          {/* 操作按钮和提示 */}
          <div className="flex flex-col items-end gap-2">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="gap-2 h-9 px-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 hover:shadow-md"
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              刷新页面
            </Button>

            {/* 数据同步提示 */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 bg-blue-50/80 dark:bg-blue-900/20 px-2 py-1 rounded-md border border-blue-200/50 dark:border-blue-800/50">
              <Info className="h-3 w-3 text-blue-500" />
              <span>脚本更新后约1分钟自动同步，如数据未更新可刷新页面</span>
            </div>
          </div>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="px-4 sm:px-6 py-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-b border-slate-200/80 dark:border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="搜索用例名称或描述..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-10 h-9 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <Button
            onClick={handleSearch}
            size="sm"
            className="h-9 px-4 gap-2"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">搜索</span>
          </Button>
        </div>
      </div>

      {/* 列表内容区 - 自适应剩余高度 */}
      <div className="flex-1 min-h-0 overflow-hidden bg-white dark:bg-slate-900 rounded-b-xl shadow-sm border border-t-0 border-slate-200/80 dark:border-slate-700/50">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="relative">
              <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
              <div className="absolute inset-0 h-10 w-10 animate-ping opacity-20 rounded-full bg-blue-500" />
            </div>
            <span className="text-sm text-slate-500 dark:text-slate-400">加载中...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="p-4 rounded-full bg-red-50 dark:bg-red-900/20">
              <FileText className="h-8 w-8 text-red-500" />
            </div>
            <p className="text-red-600 dark:text-red-400 text-sm">
              加载失败: {error instanceof Error ? error.message : '未知错误'}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              重试
            </Button>
          </div>
        ) : data?.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-500 dark:text-slate-400">
            <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800">
              <FileText className="h-8 w-8" />
            </div>
            <p className="font-medium">暂无用例数据</p>
            <p className="text-sm">请在仓库管理页面同步用例</p>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* 桌面端表格 */}
            <div className="hidden lg:block flex-1 overflow-auto">
              <table className="w-full min-w-[800px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
                    {columns.map((column) => (
                      <th
                        key={column.key}
                        className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap"
                        style={{
                          width: column.width,
                          minWidth: column.minWidth,
                        }}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data?.data.map((record, index) => (
                    <tr
                      key={record.id}
                      className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors duration-150 cursor-pointer"
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className="px-4 py-3.5 text-sm text-slate-700 dark:text-slate-200"
                        >
                          {renderCell(column, record, index)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 平板端表格（简化列） */}
            <div className="hidden md:block lg:hidden flex-1 overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">用例</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">优先级</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">负责人</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">状态</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data?.data.map((record, index) => (
                    <tr
                      key={record.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors duration-150"
                    >
                      <td className="px-4 py-3 text-sm">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-500">
                          {(page - 1) * pageSize + index + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[200px]">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{record.name}</p>
                          {record.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{record.description}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {columns.find(c => c.key === 'priority')?.render?.(record.priority, record, index) ?? record.priority}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {record.owner || '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="default"
                          disabled={isExecuting || isFetchingBatch}
                          onClick={() => handleRunCase(record.id, record.name, record.project_id)}
                          className="h-8 px-3"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 移动端卡片列表 */}
            <div className="md:hidden flex-1 overflow-auto">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data?.data.map((record, index) => (
                  <div
                    key={record.id}
                    className="p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors duration-150"
                  >
                    {/* 卡片头部 */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-500">
                            {(page - 1) * pageSize + index + 1}
                          </span>
                          {columns.find(c => c.key === 'priority')?.render?.(record.priority, record, index)}
                        </div>
                        <h3 className="font-medium text-slate-900 dark:text-white text-sm leading-snug line-clamp-2">
                          {record.name}
                        </h3>
                      </div>
                      <Button
                        size="sm"
                        variant="default"
                        disabled={isExecuting || isFetchingBatch}
                        onClick={() => handleRunCase(record.id, record.name, record.project_id)}
                        className="shrink-0 h-8 w-8 p-0"
                      >
                        {isExecuting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                    </div>

                    {/* 卡片详情 */}
                    <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                      {record.owner && (
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3" />
                          <span>{record.owner}</span>
                        </div>
                      )}
                      {record.description && (
                        <p className="line-clamp-2 leading-relaxed">{record.description}</p>
                      )}
                      {record.script_path && (
                        <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500 truncate">
                          {record.script_path}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 分页 */}
            {data && data.total > 0 && (
              <div className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                {/* 左侧：每页数量选择 + 统计信息 */}
                <div className="flex items-center gap-4 order-2 sm:order-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">每页</span>
                    <select
                      aria-label="每页显示条数"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                      className="h-8 w-16 pl-2 pr-6 text-sm text-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer appearance-none bg-[length:10px] bg-[right_4px_center] bg-no-repeat bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]"
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">条</span>
                  </div>
                  <div className="hidden sm:block h-4 w-px bg-slate-200 dark:bg-slate-700" />
                  <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    第 <span className="font-medium text-slate-700 dark:text-slate-300">{pagination.startIndex}</span>-
                    <span className="font-medium text-slate-700 dark:text-slate-300">{pagination.endIndex}</span> 条，
                    共 <span className="font-medium text-slate-700 dark:text-slate-300">{data.total}</span> 条
                  </div>
                </div>

                {/* 右侧：分页按钮 */}
                <div className="flex items-center gap-1.5 order-1 sm:order-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!pagination.hasPrevPage}
                    onClick={() => setPage(page - 1)}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-1 px-2">
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (pagination.totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (page <= 3) {
                        pageNum = i + 1;
                      } else if (page >= pagination.totalPages - 2) {
                        pageNum = pagination.totalPages - 4 + i;
                      } else {
                        pageNum = page - 2 + i;
                      }
                      return (
                        <button
                          type="button"
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`h-8 min-w-[32px] px-2 text-sm font-medium rounded-md transition-colors duration-150 ${
                            page === pageNum
                              ? 'bg-blue-500 text-white shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!pagination.hasNextPage}
                    onClick={() => setPage(page + 1)}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 执行进度弹窗 */}
      <ExecutionProgress
        isOpen={isProgressOpen}
        onClose={() => {
          setIsProgressOpen(false);
          if (batchInfo?.status !== 'running' && batchInfo?.status !== 'pending') {
            resetExecution();
          }
        }}
        batchInfo={batchInfo || undefined}
        isLoading={isFetchingBatch}
        error={batchError as Error}
        buildUrl={batchInfo?.jenkins_build_url}
      />
    </div>
  );
}