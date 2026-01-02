import { Code } from 'lucide-react';
import { BaseCaseList, type CaseColumn } from '@/components/cases/BaseCaseList';

/**
 * API 自动化用例页面的列配置
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
    key: 'description',
    label: '用例说明',
    render: (value) => (
      <span className="line-clamp-2 max-w-md">
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
 * API 自动化用例管理页面
 */
export default function APICases() {
  return (
    <BaseCaseList
      type="api"
      title="API 自动化用例"
      icon={<Code className="w-6 h-6 text-white" />}
      description="管理接口自动化测试用例"
      columns={columns}
    />
  );
}
