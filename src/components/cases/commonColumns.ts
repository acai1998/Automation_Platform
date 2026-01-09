import type { CaseColumn } from './BaseCaseList';
import { renderScriptPath, renderDescription, renderPriority, renderOwner } from './columnRenderers';

/**
 * 预定义的列配置
 * 用于各用例页面按需组合
 */
export const COLUMN_DEFINITIONS = {
  /** 序号列 */
  index: {
    key: 'index',
    label: '序号',
    width: '80px',
  },
  /** 用例名称列 */
  name: {
    key: 'name',
    label: '用例名称',
  },
  /** 优先级列 */
  priority: {
    key: 'priority',
    label: '优先级',
    width: '90px',
    render: renderPriority,
  },
  /** 负责人列 */
  owner: {
    key: 'owner',
    label: '负责人',
    width: '100px',
    render: renderOwner,
  },
  /** 脚本路径列 */
  scriptPath: {
    key: 'script_path',
    label: '脚本路径',
    render: renderScriptPath,
  },
  /** 用例说明列 */
  description: {
    key: 'description',
    label: '用例说明',
    render: renderDescription,
  },
  /** 操作列 - 包含运行按钮等操作 */
  actions: {
    key: 'actions',
    label: '操作',
    width: '100px',
    render: undefined, // 显式指定 render 为 undefined 以符合 CaseColumn 接口
  },
} as const satisfies Record<string, CaseColumn>;

/**
 * 完整列配置（含脚本路径和说明）
 * 适用于 API、UI 用例页面
 */
export const FULL_COLUMNS: CaseColumn[] = [
  COLUMN_DEFINITIONS.index,
  COLUMN_DEFINITIONS.name,
  COLUMN_DEFINITIONS.priority,
  COLUMN_DEFINITIONS.owner,
  COLUMN_DEFINITIONS.scriptPath,
  COLUMN_DEFINITIONS.description,
  COLUMN_DEFINITIONS.actions,
];

/**
 * 简洁列配置（不含脚本路径和说明）
 * 适用于性能用例页面
 */
export const SIMPLE_COLUMNS: CaseColumn[] = [
  COLUMN_DEFINITIONS.index,
  COLUMN_DEFINITIONS.name,
  COLUMN_DEFINITIONS.priority,
  COLUMN_DEFINITIONS.owner,
  COLUMN_DEFINITIONS.actions,
];