/**
 * 用户提示消息常量
 */

// 任务相关消息
export const TASK_MESSAGES = {
  // 成功消息
  RUN_SUCCESS: (name: string) => `任务 "${name}" 已开始执行`,
  RUN_SUCCESS_DESC: '执行任务已创建，请稍后在报告中心查看结果',
  CREATE_SUCCESS: '任务创建成功',
  UPDATE_SUCCESS: '任务更新成功',
  DELETE_SUCCESS: (name: string) => `任务 "${name}" 已删除`,
  STATUS_TOGGLE_SUCCESS: (isActive: boolean) => `任务已${isActive ? '启用' : '暂停'}`,

  // 错误消息
  RUN_ERROR: '任务执行失败',
  CREATE_ERROR: '任务创建失败',
  UPDATE_ERROR: '任务更新失败',
  DELETE_ERROR: '删除任务失败',
  STATUS_TOGGLE_ERROR: '状态切换失败',
  LOAD_ERROR: '加载失败',
  GENERIC_ERROR: '请联系管理员查看详情',
  RETRY_ERROR: '请稍后重试或联系管理员',
  INPUT_ERROR: '请检查输入或联系管理员',

  // 验证消息
  NAME_REQUIRED: '任务名称不能为空',
  NAME_TOO_LONG: '名称不能超过200个字符',
  NAME_INVALID_CHARS: '名称只能包含中英文、数字、下划线、连字符和空格',
  DESCRIPTION_TOO_LONG: '描述不能超过1000个字符',
  CRON_REQUIRED: '定时任务必须填写 Cron 表达式',
  CRON_INVALID_FORMAT: 'Cron 格式无效（需为标准5段，如 0 2 * * *）',
  CRON_INVALID_CHARS: 'Cron 表达式包含非法字符',

  // 确认消息
  DELETE_CONFIRM_TITLE: '确认删除任务',
  DELETE_CONFIRM_DESC: '此操作不可撤销。删除后，该任务的执行记录仍会保留。',
  DELETE_CONFIRM_TARGET: (name: string) => `即将删除：${name}`,

  // 空状态消息
  NO_TASKS_WITH_FILTER: '没有符合条件的任务',
  NO_TASKS_CREATE_NEW: '暂无任务，点击「新建任务」开始吧',
  NO_RECENT_EXECUTIONS: '暂无运行记录',

  // 加载状态
  LOADING_TASKS: '正在加载任务列表...',

  // 按钮文本
  BTN_CREATE: '新建任务',
  BTN_SAVE: '保存修改',
  BTN_CREATE_TASK: '创建任务',
  BTN_SAVING: '保存中...',
  BTN_CANCEL: '取消',
  BTN_DELETE: '确认删除',
  BTN_RETRY: '重试',
  BTN_CLEAR_FILTER: '清除筛选',
  BTN_RUN_NOW: '立即运行',
  BTN_RUNNING: '执行中...',
  BTN_REFRESH: '刷新',

  // 表单标签
  FORM_CREATE_TITLE: '新建任务',
  FORM_EDIT_TITLE: '编辑任务',
  FORM_CREATE_DESC: '填写任务信息，完成后点击保存。',
  FORM_EDIT_DESC: '修改任务配置，保存后立即生效。',
  FORM_NAME_LABEL: '任务名称',
  FORM_NAME_PLACEHOLDER: '请输入任务名称',
  FORM_DESCRIPTION_LABEL: '任务描述',
  FORM_DESCRIPTION_PLACEHOLDER: '简要描述此任务的用途（可选）',
  FORM_TRIGGER_LABEL: '触发方式',
  FORM_CRON_LABEL: 'Cron 表达式',
  FORM_CRON_PLACEHOLDER: '例：0 2 * * *（每天凌晨2点）',
  FORM_CRON_HINT: '格式：分 时 日 月 周（标准5段）',
} as const;

// 页面标题和描述
export const TASK_PAGE = {
  TITLE: '任务管理',
  SUBTITLE: '调度、执行和监控自动化测试任务',
  STATS_TOTAL: '总任务数',
  STATS_ACTIVE: '活跃任务',
  STATS_TODAY_RUNS: '今日运行',
  RECENT_RUNS_LABEL: '最近运行',
  RECENT_RUNS_COUNT: (count: number) => `${count} 次记录`,
} as const;
