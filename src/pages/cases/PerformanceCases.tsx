import { Gauge } from 'lucide-react';
import { BaseCaseList, type CaseColumn } from '@/components/cases/BaseCaseList';

/**
 * 性能自动化用例页面的列配置（极简）
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
 * 性能自动化用例管理页面
 */
export default function PerformanceCases() {
  return (
    <BaseCaseList
      type="performance"
      title="性能自动化用例"
      icon={<Gauge className="w-6 h-6" />}
      description="管理性能 / 压测相关用例"
      columns={columns}
    />
  );
}
