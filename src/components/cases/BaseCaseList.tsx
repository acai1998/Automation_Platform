import { useState, ReactNode } from 'react';
import { Search, Play, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CaseStatusBadge } from './CaseStatusBadge';
import { useCases, useRunCase, usePagination, type CaseType, type TestCase } from '@/hooks/useCases';
import { repositoriesApi } from '@/api/repositories';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * 列配置
 */
export interface CaseColumn {
  key: string;
  label: string;
  width?: string;
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
 */
export function BaseCaseList({ type, title, icon, columns, description }: BaseCaseListProps) {
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // 获取用例列表
  const { data, isLoading, error, refetch } = useCases({
    type,
    search,
    page,
    pageSize,
  });

  // 运行用例
  const runCaseMutation = useRunCase();

  // 分页信息
  const pagination = usePagination(data?.total || 0, page, pageSize);

  // 同步用例
  const queryClient = useQueryClient();
  const syncCaseMutation = useMutation({
    mutationFn: async () => {
      // 根据用例类型查找对应的仓库配置
      const repos = await repositoriesApi.getRepositories('active');
      if (!repos.success || !repos.data) {
        throw new Error('无法获取仓库配置');
      }

      // 查找匹配的仓库（根据仓库名称中包含的类型关键词匹配）
      const typeKeywords: Record<CaseType, string[]> = {
        api: ['api', '接口', '接口测试'],
        ui: ['ui', '界面', 'UI测试', 'ui测试'],
        performance: ['performance', '性能', '压测', '性能测试'],
      };

      const keywords = typeKeywords[type] || [];
      const matchedRepo = repos.data.find((repo) => {
        const repoName = repo.name.toLowerCase();
        return keywords.some((keyword) => repoName.includes(keyword.toLowerCase()));
      }) || repos.data[0]; // 如果没找到匹配的，使用第一个仓库

      if (!matchedRepo) {
        throw new Error(`未找到可用的仓库配置，请先在仓库管理页面创建 ${type} 类型的仓库`);
      }

      const result = await repositoriesApi.syncRepository(matchedRepo.id);
      if (!result.success) {
        throw new Error(result.message || '同步失败');
      }
      return result;
    },
    onSuccess: () => {
      toast.success('同步用例已启动，请稍候刷新查看结果');
      // 延迟刷新列表，给同步一些时间
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['cases'] });
      }, 2000);
    },
    onError: (error: Error) => {
      toast.error(error.message || '同步失败');
    },
  });

  // 处理搜索
  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  // 处理运行用例
  const handleRunCase = async (caseId: number, caseName: string) => {
    try {
      await runCaseMutation.mutateAsync(caseId);
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

    // 特殊字段处理
    if (column.key === 'index') {
      return (page - 1) * pageSize + index + 1;
    }

    if (column.key === 'running_status') {
      return <CaseStatusBadge status={record.running_status} />;
    }

    if (column.key === 'actions') {
      const isRunning = record.running_status === 'running';
      return (
        <Button
          size="sm"
          variant={isRunning ? 'outline' : 'default'}
          disabled={isRunning || runCaseMutation.isPending}
          onClick={() => handleRunCase(record.id, record.name)}
          className="gap-1.5 h-8 px-3"
        >
          {runCaseMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {isRunning ? '运行中' : '运行'}
        </Button>
      );
    }

    if (column.key === 'script_path') {
      return (
        <span className="text-gray-600 dark:text-gray-400 font-mono text-xs">
          {(value as string) || '-'}
        </span>
      );
    }

    return value ?? '-';
  };

  return (
    <div className="space-y-6">
      {/* 顶部导航和标题区 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <div className={`p-2 rounded-lg ${
              type === 'api' ? 'bg-blue-500/10 text-blue-500' :
              type === 'ui' ? 'bg-purple-500/10 text-purple-500' :
              'bg-orange-500/10 text-orange-500'
            }`}>
              {icon}
            </div>
            {title}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 ml-11">
            {description}
          </p>
        </div>
        
        {/* 顶部操作按钮 */}
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => syncCaseMutation.mutate()}
            disabled={syncCaseMutation.isPending}
            className="flex items-center gap-2"
          >
            {syncCaseMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            同步用例
          </Button>
        </div>
      </div>

      {/* 筛选和列表区 */}
      <Card className="border-slate-200 dark:border-[#234833] bg-white dark:bg-surface-dark">
        <div className="p-4 border-b border-slate-200 dark:border-[#234833] flex items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="搜索用例名称或描述..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-10"
            />
          </div>
          <Button onClick={handleSearch} className="gap-2">
            <Search className="w-4 h-4" />
            搜索
          </Button>
        </div>
      </Card>

      {/* 用例列表 */}
      <Card className="shadow-md overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-3 text-gray-500">加载中...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-red-500 mb-4">
              加载失败: {error instanceof Error ? error.message : '未知错误'}
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              重试
            </Button>
          </div>
        ) : data?.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <p className="mb-2">暂无用例数据</p>
            <p className="text-sm">请在仓库管理页面同步用例</p>
          </div>
        ) : (
          <>
            {/* 桌面表格 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-800">
                    {columns.map((column) => (
                      <th
                        key={column.key}
                        className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                        style={{ width: column.width }}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {data?.data.map((record, index) => (
                    <tr
                      key={record.id}
                      className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100"
                        >
                          {renderCell(column, record, index)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 移动端卡片 */}
            <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
              {data?.data.map((record, index) => (
                <div key={record.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-500">
                          #{(page - 1) * pageSize + index + 1}
                        </span>
                        <CaseStatusBadge status={record.running_status} />
                      </div>
                      <h3 className="font-medium text-gray-900 dark:text-white truncate">
                        {record.name}
                      </h3>
                      {record.description && (
                        <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                          {record.description}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={record.running_status === 'running' ? 'outline' : 'default'}
                      disabled={record.running_status === 'running' || runCaseMutation.isPending}
                      onClick={() => handleRunCase(record.id, record.name)}
                      className="ml-3"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* 分页 */}
            {data && data.total > 0 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-800/50">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  第 {pagination.startIndex}-{pagination.endIndex} 条，共 {data.total} 条
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!pagination.hasPrevPage}
                    onClick={() => setPage(page - 1)}
                    className="h-8 px-3"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 px-3">
                    {page} / {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!pagination.hasNextPage}
                    onClick={() => setPage(page + 1)}
                    className="h-8 px-3"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
