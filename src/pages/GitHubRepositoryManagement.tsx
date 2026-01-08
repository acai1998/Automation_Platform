import { useState, useMemo } from 'react';
import { Plus, Search, RefreshCw, Github, Trash2, Package, CheckCircle, PauseCircle, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import GitHubRepositoryForm from '@/components/GitHubRepositoryForm';
import GitHubRepositoryTable from '@/components/GitHubRepositoryTable';

interface GitHubRepository {
  id: string;
  name: string;
  description?: string;
  url: string;
  language?: string;
  status: 'active' | 'inactive' | 'archived';
  stars?: number;
  lastSync?: string;
  createdAt: string;
}

export default function GitHubRepositoryManagement() {
  const [repositories, setRepositories] = useState<GitHubRepository[]>([
    {
      id: '1',
      name: 'SeleniumBase-CI',
      description: 'SeleniumBase 自动化测试框架集成',
      url: 'https://github.com/example/SeleniumBase-CI',
      language: 'Python',
      status: 'active',
      stars: 156,
      lastSync: '2025-12-31',
      createdAt: '2025-01-01',
    },
    {
      id: '2',
      name: 'Playwright-Tests',
      description: 'Playwright 自动化测试用例库',
      url: 'https://github.com/example/Playwright-Tests',
      language: 'JavaScript',
      status: 'active',
      stars: 89,
      lastSync: '2025-12-30',
      createdAt: '2025-02-15',
    },
    {
      id: '3',
      name: 'Java-TestNG-Suite',
      description: 'Java TestNG 测试框架集合',
      url: 'https://github.com/example/Java-TestNG-Suite',
      language: 'Java',
      status: 'inactive',
      stars: 45,
      lastSync: '2025-12-20',
      createdAt: '2025-03-10',
    },
  ]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [languageFilter, setLanguageFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 获取所有语言
  const languages = useMemo(() => {
    const langs = new Set(repositories.map(r => r.language).filter(Boolean));
    return Array.from(langs).sort();
  }, [repositories]);

  // 过滤和搜索
  const filteredRepositories = useMemo(() => {
    return repositories.filter(repo => {
      const matchesSearch =
        repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (repo.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
      const matchesLanguage = !languageFilter || repo.language === languageFilter;
      const matchesStatus = !statusFilter || repo.status === statusFilter;
      return matchesSearch && matchesLanguage && matchesStatus;
    });
  }, [repositories, searchTerm, languageFilter, statusFilter]);

  // 处理添加仓库
  const handleAddRepository = (data: Omit<GitHubRepository, 'id' | 'createdAt'>) => {
    const newRepo: GitHubRepository = {
      ...data,
      id: Date.now().toString(),
      createdAt: new Date().toISOString().split('T')[0],
    };
    setRepositories([...repositories, newRepo]);
    setShowForm(false);
    toast.success('仓库已添加');
  };

  // 处理编辑仓库
  const handleEditRepository = (data: Omit<GitHubRepository, 'id' | 'createdAt'>) => {
    if (!editingId) return;
    setRepositories(
      repositories.map(repo =>
        repo.id === editingId ? { ...repo, ...data } : repo
      )
    );
    setEditingId(null);
    setShowForm(false);
    toast.success('仓库已更新');
  };

  // 处理删除仓库
  const handleDeleteRepository = (id: string) => {
    setRepositories(repositories.filter(repo => repo.id !== id));
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
    toast.success('仓库已删除');
  };

  // 批量删除
  const handleBatchDelete = () => {
    if (selectedIds.size === 0) {
      toast.error('请先选择要删除的仓库');
      return;
    }
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 个仓库吗？`)) return;
    setRepositories(repositories.filter(repo => !selectedIds.has(repo.id)));
    setSelectedIds(new Set());
    toast.success(`已删除 ${selectedIds.size} 个仓库`);
  };

  // 复制 URL
  const handleCopyUrl = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success('已复制到剪贴板');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 编辑仓库
  const handleEdit = (id: string) => {
    setEditingId(id);
    setShowForm(true);
  };

  const editingRepo = editingId ? repositories.find(r => r.id === editingId) : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4 md:p-8">
      {/* 页面头部 */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
                <Github className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
                GitHub 仓库管理
              </h1>
            </div>
            <p className="text-gray-600 dark:text-gray-400 ml-11">
              集中管理和监控自动化测试仓库
            </p>
          </div>
          <Button
            onClick={() => {
              setEditingId(null);
              setShowForm(true);
            }}
            className="gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
          >
            <Plus className="w-4 h-4" />
            新增仓库
          </Button>
        </div>

        {/* 统计信息 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="总仓库数"
            value={repositories.length}
            icon={<Package className="w-6 h-6 text-blue-600" />}
          />
          <StatCard
            label="活跃仓库"
            value={repositories.filter(r => r.status === 'active').length}
            icon={<CheckCircle className="w-6 h-6 text-green-600" />}
          />
          <StatCard
            label="不活跃"
            value={repositories.filter(r => r.status === 'inactive').length}
            icon={<PauseCircle className="w-6 h-6 text-yellow-600" />}
          />
          <StatCard
            label="已归档"
            value={repositories.filter(r => r.status === 'archived').length}
            icon={<Archive className="w-6 h-6 text-gray-600" />}
          />
        </div>
      </div>

      {/* 添加/编辑表单 */}
      {showForm && (
        <Card className="mb-8 p-6 border-l-4 border-l-blue-500 shadow-lg">
          <GitHubRepositoryForm
            repository={editingRepo}
            onSubmit={editingId ? handleEditRepository : handleAddRepository}
            onCancel={() => {
              setShowForm(false);
              setEditingId(null);
            }}
          />
        </Card>
      )}

      {/* 搜索和筛选 */}
      <Card className="mb-6 p-6 shadow-md">
        <div className="space-y-4">
          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <Input
              placeholder="搜索仓库名称或描述..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* 筛选条件 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                编程语言
              </label>
              <select
                value={languageFilter}
                onChange={e => setLanguageFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              >
                <option value="">全部语言</option>
                {languages.map(lang => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                状态
              </label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              >
                <option value="">全部状态</option>
                <option value="active">活跃</option>
                <option value="inactive">不活跃</option>
                <option value="archived">已归档</option>
              </select>
            </div>

            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm('');
                  setLanguageFilter('');
                  setStatusFilter('');
                }}
                className="flex-1"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                重置筛选
              </Button>
              {selectedIds.size > 0 && (
                <Button
                  variant="destructive"
                  onClick={handleBatchDelete}
                  className="flex-1"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  删除 ({selectedIds.size})
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* 仓库表格 */}
      <GitHubRepositoryTable
        repositories={filteredRepositories}
        selectedIds={selectedIds}
        onSelectChange={setSelectedIds}
        onEdit={handleEdit}
        onDelete={handleDeleteRepository}
        onCopyUrl={handleCopyUrl}
        copiedId={copiedId}
      />

      {/* 空状态 */}
      {filteredRepositories.length === 0 && (
        <Card className="text-center py-12">
          <Github className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {repositories.length === 0 ? '暂无仓库，点击新增仓库开始' : '没有找到匹配的仓库'}
          </p>
          {repositories.length === 0 && (
            <Button
              onClick={() => setShowForm(true)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              新增仓库
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}

// 统计卡片组件
function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="p-4 text-center hover:shadow-lg transition-shadow cursor-pointer">
      <div className="flex justify-center mb-2">{icon}</div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="text-sm text-gray-600 dark:text-gray-400">{label}</div>
    </Card>
  );
}