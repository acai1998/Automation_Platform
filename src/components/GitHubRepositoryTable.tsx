import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Edit, Trash2, Copy, Check, ExternalLink, Star } from 'lucide-react';
import { GitHubRepository } from '@/types/repository';

const LANGUAGE_COLORS: { [key: string]: string } = {
  'Python': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'JavaScript': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'TypeScript': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'Java': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'Go': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  'Rust': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

const DEFAULT_LANGUAGE_COLOR = 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';

function TableTooltip({ content, children }: { content: string; children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent>
          <p>{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface GitHubRepositoryTableProps {
  repositories: GitHubRepository[];
  selectedIds: Set<string>;
  onSelectChange: (ids: Set<string>) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onCopyUrl: (id: string, url: string) => void;
  copiedId: string | null;
}

export default function GitHubRepositoryTable({
  repositories,
  selectedIds,
  onSelectChange,
  onEdit,
  onDelete,
  onCopyUrl,
  copiedId,
}: GitHubRepositoryTableProps) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleSelectAll = () => {
    if (selectedIds.size === repositories.length) {
      onSelectChange(new Set());
    } else {
      onSelectChange(new Set(repositories.map(r => r.id)));
    }
  };

  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    onSelectChange(newSet);
  };

  const handleDeleteClick = (id: string) => {
    if (!confirm('确定要删除这个仓库吗？此操作无法撤销。')) return;
    onDelete(id);
    setDeleteConfirmId(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'inactive':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'archived':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return '活跃';
      case 'inactive':
        return '不活跃';
      case 'archived':
        return '已归档';
      default:
        return status;
    }
  };

  const getLanguageColor = (language?: string) => {
    return LANGUAGE_COLORS[language || ''] || DEFAULT_LANGUAGE_COLOR;
  };

  return (
    <div className="space-y-4">
      {/* 桌面版表格 */}
      <div className="hidden md:block overflow-x-auto">
        <Card className="shadow-md">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-800">
                <th className="px-6 py-4 text-left">
                  <Checkbox
                    checked={selectedIds.size === repositories.length && repositories.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  仓库名称
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  描述
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  语言
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  状态
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  Star
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                  最后同步
                </th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900 dark:text-white">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {repositories.map(repo => (
                <tr
                  key={repo.id}
                  className="border-b border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <Checkbox
                      checked={selectedIds.has(repo.id)}
                      onCheckedChange={() => handleSelectOne(repo.id)}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <a
                      href={repo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {repo.name}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                    {repo.description || '-'}
                  </td>
                  <td className="px-6 py-4">
                    {repo.language && (
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getLanguageColor(repo.language)}`}>
                        {repo.language}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(repo.status)}`}>
                      {getStatusLabel(repo.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {repo.stars ? (
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        {repo.stars}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {repo.lastSync || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-2">
                      <TableTooltip content="复制 URL">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onCopyUrl(repo.id, repo.url)}
                          className="hover:bg-blue-100 dark:hover:bg-blue-900"
                        >
                          {copiedId === repo.id ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </TableTooltip>
                      <TableTooltip content="打开仓库">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(repo.url, '_blank')}
                          className="hover:bg-blue-100 dark:hover:bg-blue-900"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </TableTooltip>
                      <TableTooltip content="编辑">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(repo.id)}
                          className="hover:bg-amber-100 dark:hover:bg-amber-900"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </TableTooltip>
                      <TableTooltip content="删除">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(repo.id)}
                          className="hover:bg-red-100 dark:hover:bg-red-900"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </TableTooltip>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* 移动版卡片 */}
      <div className="md:hidden space-y-4">
        {repositories.map(repo => (
          <Card key={repo.id} className="p-4 space-y-3 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <Checkbox
                  checked={selectedIds.has(repo.id)}
                  onCheckedChange={() => handleSelectOne(repo.id)}
                />
                <div className="flex-1 min-w-0">
                  <a
                    href={repo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 dark:text-blue-400 hover:underline block truncate"
                  >
                    {repo.name}
                  </a>
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {repo.description || '-'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {repo.language && (
                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getLanguageColor(repo.language)}`}>
                  {repo.language}
                </span>
              )}
              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getStatusColor(repo.status)}`}>
                {getStatusLabel(repo.status)}
              </span>
              {repo.stars && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                  <Star className="w-3 h-3 fill-current" />
                  {repo.stars}
                </span>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCopyUrl(repo.id, repo.url)}
                className="flex-1"
              >
                {copiedId === repo.id ? (
                  <><Check className="w-4 h-4 mr-1 text-green-600" /> 已复制</>
                ) : (
                  <><Copy className="w-4 h-4 mr-1" /> 复制</>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(repo.url, '_blank')}
                className="flex-1"
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                打开
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(repo.id)}
                className="flex-1"
              >
                <Edit className="w-4 h-4 mr-1" />
                编辑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteClick(repo.id)}
                className="flex-1 text-red-600"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                删除
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* 分页或加载更多 */}
      {repositories.length > 0 && (
        <div className="flex justify-center pt-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            共 {repositories.length} 个仓库
          </p>
        </div>
      )}
    </div>
  );
}
