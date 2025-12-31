## Postgres Table Design（数据库设计能力）

### 3.1 能力定义

Postgres Table Design 并非单纯建表能力，而是 **面向测试执行链路与时间序列分析的数据建模能力**，其核心目标是：

> 在保证数据可追溯的前提下，
> 支撑高频统计、趋势分析与下钻查询。

---

### 3.2 设计原则（Design Principles）

* **执行事实与统计结果分离**
* **时间维度优先建模**
* **读性能优先于极致范式化**

---

### 3.3 关键设计规则（Rules & Practices）

* 执行表记录“事实”，不做聚合
* 聚合数据通过视图或统计表生成
* 趋势数据使用 DATE 而非 TIMESTAMP
* 预留冗余字段以降低跨表 Join 成本

---

### 3.4 项目落地示例

* `test_task_run`：任务级执行记录
* `test_case_run`：用例级执行记录
* `daily_stability_metrics`：每日稳定性聚合数据