import { Monitor } from 'lucide-react';
import { BaseCaseList, type CaseColumn } from '@/components/cases/BaseCaseList';

/**
 * UI 自动化用例页面的列配置
 */
const columns: CaseColumn[] = [
  {
    key: 'index',
    label: '序号',
    width: '80px',
  },
  {
    key: 'name',
    label: '用例名称',
  },
  {
    key: 'script_path',
    label: '脚本路径',
    render: (value) => (
      <span className="text-gray-600 dark:text-gray-400 font-mono text-xs">
        {(value as string) || '-'}
      </span>
    ),
  },
  {
    key: 'description',
    label: '用例说明',
    render: (value) => (
      <span className="text-gray-600 dark:text-gray-400 line-clamp-2 max-w-md">
        {(value as string) || '-'}
      </span>
    ),
  },
  {
    key: 'running_status',
    label: '状态',
    width: '100px',
  },
  {
    key: 'actions',
    label: '操作',
    width: '100px',
  },
];

/**
 * UI 自动化用例管理页面
 */
export default function UICases() {
  return (
    <BaseCaseList
      type="ui"
      title="UI 自动化用例"
      icon={<Monitor className="w-6 h-6" />}
      description="管理 UI 自动化测试用例"
      columns={columns}
    />
  );
}
