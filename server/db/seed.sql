-- 自动化测试平台 Mock 测试数据
-- 创建日期: 2025-12-21

-- ============================================
-- 1. 插入用户数据
-- ============================================
INSERT INTO users (username, password_hash, email, display_name, role, status) VALUES
('admin', '$2b$10$dummy_hash_admin', 'admin@autotest.com', '系统管理员', 'admin', 'active'),
('zhangsan', '$2b$10$dummy_hash_1', 'zhangsan@autotest.com', '张三', 'tester', 'active'),
('lisi', '$2b$10$dummy_hash_2', 'lisi@autotest.com', '李四', 'tester', 'active'),
('wangwu', '$2b$10$dummy_hash_3', 'wangwu@autotest.com', '王五', 'developer', 'active'),
('zhaoliu', '$2b$10$dummy_hash_4', 'zhaoliu@autotest.com', '赵六', 'tester', 'active'),
('qianqi', '$2b$10$dummy_hash_5', 'qianqi@autotest.com', '钱七', 'viewer', 'active');

-- ============================================
-- 2. 插入项目数据
-- ============================================
INSERT INTO projects (name, description, status, owner_id) VALUES
('电商平台', '电商平台核心功能自动化测试', 'active', 2),
('用户中心', '用户中心模块自动化测试', 'active', 3),
('支付系统', '支付系统接口自动化测试', 'active', 2),
('后台管理', '后台管理系统自动化测试', 'active', 4);

-- ============================================
-- 3. 插入环境配置
-- ============================================
INSERT INTO environments (name, description, base_url, config_json, status) VALUES
('开发环境', '开发测试环境', 'https://dev-api.example.com', '{"timeout": 30000}', 'active'),
('测试环境', '集成测试环境', 'https://test-api.example.com', '{"timeout": 30000}', 'active'),
('预发布环境', '预发布验证环境', 'https://staging-api.example.com', '{"timeout": 30000}', 'active');

-- ============================================
-- 4. 插入测试用例数据
-- ============================================
INSERT INTO test_cases (name, description, project_id, module, priority, type, status, tags, created_by) VALUES
-- 电商平台用例
('用户登录-正常流程', '验证用户正常登录功能', 1, '用户认证', 'P0', 'api', 'active', '登录,核心功能', 2),
('用户登录-密码错误', '验证密码错误时的提示', 1, '用户认证', 'P1', 'api', 'active', '登录,异常处理', 2),
('用户注册-新用户', '验证新用户注册流程', 1, '用户认证', 'P0', 'api', 'active', '注册,核心功能', 2),
('商品列表-分页查询', '验证商品列表分页功能', 1, '商品管理', 'P1', 'api', 'active', '商品,列表', 3),
('商品详情-正常查看', '验证商品详情页面展示', 1, '商品管理', 'P1', 'api', 'active', '商品,详情', 3),
('购物车-添加商品', '验证添加商品到购物车', 1, '购物车', 'P0', 'api', 'active', '购物车,核心功能', 2),
('购物车-修改数量', '验证修改购物车商品数量', 1, '购物车', 'P1', 'api', 'active', '购物车', 2),
('购物车-删除商品', '验证删除购物车商品', 1, '购物车', 'P1', 'api', 'active', '购物车', 3),
('订单-创建订单', '验证创建订单流程', 1, '订单管理', 'P0', 'api', 'active', '订单,核心功能', 2),
('订单-取消订单', '验证取消订单功能', 1, '订单管理', 'P1', 'api', 'active', '订单', 3),
('订单-查询订单', '验证订单查询功能', 1, '订单管理', 'P1', 'api', 'active', '订单,查询', 2),
-- 用户中心用例
('个人信息-查看', '验证查看个人信息', 2, '个人中心', 'P1', 'api', 'active', '个人信息', 3),
('个人信息-修改', '验证修改个人信息', 2, '个人中心', 'P1', 'api', 'active', '个人信息', 3),
('收货地址-添加', '验证添加收货地址', 2, '地址管理', 'P1', 'api', 'active', '地址', 3),
('收货地址-修改', '验证修改收货地址', 2, '地址管理', 'P2', 'api', 'active', '地址', 3),
('收货地址-删除', '验证删除收货地址', 2, '地址管理', 'P2', 'api', 'active', '地址', 3),
('消息通知-列表', '验证消息通知列表', 2, '消息中心', 'P2', 'api', 'active', '消息', 5),
-- 支付系统用例
('支付-微信支付', '验证微信支付流程', 3, '支付渠道', 'P0', 'api', 'active', '支付,微信', 2),
('支付-支付宝支付', '验证支付宝支付流程', 3, '支付渠道', 'P0', 'api', 'active', '支付,支付宝', 2),
('支付-银行卡支付', '验证银行卡支付流程', 3, '支付渠道', 'P1', 'api', 'active', '支付,银行卡', 2),
('退款-申请退款', '验证申请退款流程', 3, '退款管理', 'P0', 'api', 'active', '退款', 3),
('退款-退款查询', '验证退款查询功能', 3, '退款管理', 'P1', 'api', 'active', '退款,查询', 3),
-- 后台管理用例
('后台登录-管理员', '验证管理员后台登录', 4, '权限管理', 'P0', 'api', 'active', '后台,登录', 4),
('用户管理-列表', '验证用户管理列表', 4, '用户管理', 'P1', 'api', 'active', '后台,用户', 4),
('用户管理-禁用', '验证禁用用户功能', 4, '用户管理', 'P1', 'api', 'active', '后台,用户', 4),
('订单管理-列表', '验证后台订单列表', 4, '订单管理', 'P1', 'api', 'active', '后台,订单', 4),
('数据统计-概览', '验证数据统计概览', 4, '数据统计', 'P2', 'api', 'active', '后台,统计', 4);

-- ============================================
-- 5. 插入测试任务数据
-- ============================================
INSERT INTO tasks (name, description, project_id, case_ids, trigger_type, cron_expression, environment_id, status, created_by) VALUES
('电商核心流程测试', '电商平台核心业务流程自动化测试', 1, '[1,3,6,9]', 'scheduled', '0 0 2 * * *', 2, 'active', 2),
('用户登录模块测试', '用户登录相关功能测试', 1, '[1,2]', 'manual', NULL, 2, 'active', 2),
('购物车功能测试', '购物车完整功能测试', 1, '[6,7,8]', 'manual', NULL, 2, 'active', 3),
('支付全流程测试', '支付系统全流程测试', 3, '[18,19,20,21,22]', 'scheduled', '0 30 1 * * *', 2, 'active', 2),
('每日冒烟测试', '每日冒烟测试套件', 1, '[1,3,6,9,18]', 'scheduled', '0 0 8 * * *', 2, 'active', 2),
('用户中心测试', '用户中心模块测试', 2, '[12,13,14,15,16,17]', 'manual', NULL, 2, 'active', 3);

-- ============================================
-- 6. 插入任务执行记录（模拟过去30天数据）
-- ============================================
-- 为了简化，这里插入一些代表性的执行记录

-- 今天的执行记录
INSERT INTO task_executions (task_id, task_name, trigger_type, status, total_cases, passed_cases, failed_cases, skipped_cases, start_time, end_time, duration, executed_by, environment_id) VALUES
(5, '每日冒烟测试', 'scheduled', 'success', 5, 5, 0, 0, datetime('now', '-2 hours'), datetime('now', '-2 hours', '+3 minutes'), 180, 2, 2),
(1, '电商核心流程测试', 'scheduled', 'success', 4, 3, 1, 0, datetime('now', '-5 hours'), datetime('now', '-5 hours', '+5 minutes'), 300, 2, 2),
(2, '用户登录模块测试', 'manual', 'success', 2, 2, 0, 0, datetime('now', '-1 hours'), datetime('now', '-1 hours', '+45 seconds'), 45, 3, 2),
(4, '支付全流程测试', 'scheduled', 'failed', 5, 3, 2, 0, datetime('now', '-3 hours'), datetime('now', '-3 hours', '+4 minutes'), 240, 2, 2),
(3, '购物车功能测试', 'manual', 'running', 3, 1, 0, 0, datetime('now', '-5 minutes'), NULL, NULL, 5, 2);

-- 昨天的执行记录
INSERT INTO task_executions (task_id, task_name, trigger_type, status, total_cases, passed_cases, failed_cases, skipped_cases, start_time, end_time, duration, executed_by, environment_id) VALUES
(5, '每日冒烟测试', 'scheduled', 'success', 5, 5, 0, 0, datetime('now', '-1 day', '-2 hours'), datetime('now', '-1 day', '-2 hours', '+3 minutes'), 180, 2, 2),
(1, '电商核心流程测试', 'scheduled', 'success', 4, 4, 0, 0, datetime('now', '-1 day', '-5 hours'), datetime('now', '-1 day', '-5 hours', '+5 minutes'), 300, 2, 2),
(4, '支付全流程测试', 'scheduled', 'success', 5, 4, 1, 0, datetime('now', '-1 day', '-3 hours'), datetime('now', '-1 day', '-3 hours', '+4 minutes'), 240, 2, 2);

-- 前天的执行记录
INSERT INTO task_executions (task_id, task_name, trigger_type, status, total_cases, passed_cases, failed_cases, skipped_cases, start_time, end_time, duration, executed_by, environment_id) VALUES
(5, '每日冒烟测试', 'scheduled', 'success', 5, 4, 1, 0, datetime('now', '-2 day', '-2 hours'), datetime('now', '-2 day', '-2 hours', '+3 minutes'), 180, 2, 2),
(1, '电商核心流程测试', 'scheduled', 'failed', 4, 2, 2, 0, datetime('now', '-2 day', '-5 hours'), datetime('now', '-2 day', '-5 hours', '+5 minutes'), 300, 2, 2);

-- 更多历史数据（简化）
INSERT INTO task_executions (task_id, task_name, trigger_type, status, total_cases, passed_cases, failed_cases, skipped_cases, start_time, end_time, duration, executed_by, environment_id) VALUES
(5, '每日冒烟测试', 'scheduled', 'success', 5, 5, 0, 0, datetime('now', '-3 day'), datetime('now', '-3 day', '+3 minutes'), 180, 2, 2),
(5, '每日冒烟测试', 'scheduled', 'success', 5, 5, 0, 0, datetime('now', '-4 day'), datetime('now', '-4 day', '+3 minutes'), 180, 2, 2),
(5, '每日冒烟测试', 'scheduled', 'success', 5, 4, 1, 0, datetime('now', '-5 day'), datetime('now', '-5 day', '+3 minutes'), 180, 2, 2),
(5, '每日冒烟测试', 'scheduled', 'success', 5, 5, 0, 0, datetime('now', '-6 day'), datetime('now', '-6 day', '+3 minutes'), 180, 2, 2),
(5, '每日冒烟测试', 'scheduled', 'failed', 5, 3, 2, 0, datetime('now', '-7 day'), datetime('now', '-7 day', '+3 minutes'), 180, 2, 2),
(1, '电商核心流程测试', 'scheduled', 'success', 4, 4, 0, 0, datetime('now', '-3 day'), datetime('now', '-3 day', '+5 minutes'), 300, 2, 2),
(1, '电商核心流程测试', 'scheduled', 'success', 4, 3, 1, 0, datetime('now', '-4 day'), datetime('now', '-4 day', '+5 minutes'), 300, 2, 2),
(1, '电商核心流程测试', 'scheduled', 'success', 4, 4, 0, 0, datetime('now', '-5 day'), datetime('now', '-5 day', '+5 minutes'), 300, 2, 2),
(4, '支付全流程测试', 'scheduled', 'success', 5, 5, 0, 0, datetime('now', '-3 day'), datetime('now', '-3 day', '+4 minutes'), 240, 2, 2),
(4, '支付全流程测试', 'scheduled', 'success', 5, 4, 1, 0, datetime('now', '-4 day'), datetime('now', '-4 day', '+4 minutes'), 240, 2, 2),
(4, '支付全流程测试', 'scheduled', 'success', 5, 5, 0, 0, datetime('now', '-5 day'), datetime('now', '-5 day', '+4 minutes'), 240, 2, 2);

-- ============================================
-- 7. 插入用例执行结果（关联最近的执行记录）
-- ============================================
-- 今天第一次执行的用例结果 (execution_id = 1)
INSERT INTO case_results (execution_id, case_id, case_name, status, start_time, end_time, duration, error_message) VALUES
(1, 1, '用户登录-正常流程', 'passed', datetime('now', '-2 hours'), datetime('now', '-2 hours', '+30 seconds'), 30000, NULL),
(1, 3, '用户注册-新用户', 'passed', datetime('now', '-2 hours', '+30 seconds'), datetime('now', '-2 hours', '+1 minute'), 30000, NULL),
(1, 6, '购物车-添加商品', 'passed', datetime('now', '-2 hours', '+1 minute'), datetime('now', '-2 hours', '+2 minutes'), 60000, NULL),
(1, 9, '订单-创建订单', 'passed', datetime('now', '-2 hours', '+2 minutes'), datetime('now', '-2 hours', '+3 minutes'), 60000, NULL),
(1, 18, '支付-微信支付', 'passed', datetime('now', '-2 hours', '+3 minutes'), datetime('now', '-2 hours', '+4 minutes'), 60000, NULL);

-- 今天第二次执行的用例结果 (execution_id = 2)
INSERT INTO case_results (execution_id, case_id, case_name, status, start_time, end_time, duration, error_message) VALUES
(2, 1, '用户登录-正常流程', 'passed', datetime('now', '-5 hours'), datetime('now', '-5 hours', '+30 seconds'), 30000, NULL),
(2, 3, '用户注册-新用户', 'passed', datetime('now', '-5 hours', '+30 seconds'), datetime('now', '-5 hours', '+1 minute'), 30000, NULL),
(2, 6, '购物车-添加商品', 'passed', datetime('now', '-5 hours', '+1 minute'), datetime('now', '-5 hours', '+2 minutes'), 60000, NULL),
(2, 9, '订单-创建订单', 'failed', datetime('now', '-5 hours', '+2 minutes'), datetime('now', '-5 hours', '+3 minutes'), 60000, '订单创建超时：数据库响应慢');

-- ============================================
-- 8. 插入每日汇总数据（过去30天）
-- ============================================
INSERT INTO daily_summaries (summary_date, total_executions, total_cases_run, passed_cases, failed_cases, skipped_cases, success_rate, avg_duration, active_cases_count) VALUES
(date('now'), 5, 19, 14, 3, 2, 73.68, 193, 27),
(date('now', '-1 day'), 3, 14, 13, 1, 0, 92.86, 240, 27),
(date('now', '-2 day'), 2, 9, 6, 3, 0, 66.67, 240, 27),
(date('now', '-3 day'), 3, 14, 14, 0, 0, 100.00, 240, 27),
(date('now', '-4 day'), 3, 14, 12, 2, 0, 85.71, 240, 27),
(date('now', '-5 day'), 3, 14, 14, 0, 0, 100.00, 240, 27),
(date('now', '-6 day'), 2, 10, 10, 0, 0, 100.00, 180, 27),
(date('now', '-7 day'), 2, 10, 7, 3, 0, 70.00, 180, 27),
(date('now', '-8 day'), 3, 14, 13, 1, 0, 92.86, 220, 27),
(date('now', '-9 day'), 3, 14, 12, 2, 0, 85.71, 230, 27),
(date('now', '-10 day'), 2, 9, 9, 0, 0, 100.00, 200, 27),
(date('now', '-11 day'), 3, 14, 14, 0, 0, 100.00, 210, 27),
(date('now', '-12 day'), 3, 14, 11, 3, 0, 78.57, 250, 27),
(date('now', '-13 day'), 2, 9, 8, 1, 0, 88.89, 190, 27),
(date('now', '-14 day'), 3, 14, 13, 1, 0, 92.86, 220, 27),
(date('now', '-15 day'), 3, 14, 14, 0, 0, 100.00, 200, 26),
(date('now', '-16 day'), 2, 9, 7, 2, 0, 77.78, 210, 26),
(date('now', '-17 day'), 3, 14, 12, 2, 0, 85.71, 230, 26),
(date('now', '-18 day'), 3, 14, 14, 0, 0, 100.00, 200, 26),
(date('now', '-19 day'), 2, 9, 9, 0, 0, 100.00, 180, 26),
(date('now', '-20 day'), 3, 14, 13, 1, 0, 92.86, 220, 26),
(date('now', '-21 day'), 3, 14, 10, 4, 0, 71.43, 260, 26),
(date('now', '-22 day'), 2, 9, 8, 1, 0, 88.89, 190, 26),
(date('now', '-23 day'), 3, 14, 14, 0, 0, 100.00, 200, 26),
(date('now', '-24 day'), 3, 14, 12, 2, 0, 85.71, 230, 26),
(date('now', '-25 day'), 2, 9, 9, 0, 0, 100.00, 180, 25),
(date('now', '-26 day'), 3, 14, 11, 3, 0, 78.57, 250, 25),
(date('now', '-27 day'), 3, 14, 13, 1, 0, 92.86, 220, 25),
(date('now', '-28 day'), 2, 9, 7, 2, 0, 77.78, 210, 25),
(date('now', '-29 day'), 3, 14, 14, 0, 0, 100.00, 200, 25),
(date('now', '-30 day'), 3, 14, 12, 2, 0, 85.71, 230, 25);
