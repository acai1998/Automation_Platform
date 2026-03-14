# 文档索引

## 📚 核心文档

### 快速开始
- [快速开始指南](QUICK_START.md) - 项目快速上手指南
- [项目结构说明](PROJECT_STRUCTURE.md) - 项目目录结构和架构说明
- [API 文档](API_DOCUMENTATION.md) - API 接口文档

### 数据库
- [数据库设计文档](database-design.md) - 数据库表结构和关系设计
- [数据库表结构](Table/) - 详细的表结构定义

---

## 🔧 功能模块文档

### Jenkins 集成
- [Jenkins 集成指南](Jenkins/JENKINS_INTEGRATION.md) - Jenkins 集成完整指南
- [Jenkins 快速设置](Jenkins/JENKINS_QUICK_SETUP.md) - Jenkins 快速配置
- [Jenkins 配置指南](Jenkins/JENKINS_CONFIG_GUIDE.md) - 详细配置说明
- [Jenkins 故障排查](Jenkins/JENKINS_TROUBLESHOOTING.md) - 常见问题和解决方案

### Toast 提示优化（已完成）
- [Toast 实施完成总结](TOAST_IMPLEMENTATION_COMPLETE.md) - 实施完成总结和快速测试指南 ⭐
- [Toast 实施指南](toast-implementation-guide.md) - 详细的实施步骤（桌面端专用）
- [Toast 测试清单](toast-testing-checklist.md) - 完整的测试步骤和验收标准

### 任务管理
- [任务管理功能增强 PRD](PRD_Tasks_Enhancement.md) - 任务管理功能增强需求文档

---

## 🐛 问题记录

### 已解决问题
- [问题记录](问题记录.md) - 已解决的技术问题记录（如：运行记录ID与Jenkins构建号不一致）

### Code Review
- [ReportDetail 修复清单](code-review/ReportDetail-checklist.md) - ReportDetail 组件的修复记录

---

## 📖 文档说明

### 文档组织原则
1. **核心文档**：项目快速开始、架构说明、API 文档
2. **功能模块文档**：按功能模块分类，包含集成指南、配置说明、故障排查
3. **问题记录**：已解决的问题和 Code Review 记录
4. **PRD 文档**：产品需求文档

### 文档维护
- 实施完成的功能应更新对应的文档
- 新功能应创建对应的文档
- 过时的文档应及时删除或归档

---

## 🗂️ 目录结构

```
docs/
├── README.md                           # 本文档（文档索引）
├── QUICK_START.md                      # 快速开始
├── PROJECT_STRUCTURE.md                # 项目结构
├── API_DOCUMENTATION.md                # API 文档
├── database-design.md                  # 数据库设计
├── PRD_Tasks_Enhancement.md            # 任务管理增强 PRD
├── 问题记录.md                          # 问题记录
│
├── Jenkins/                            # Jenkins 集成文档
│   ├── README.md
│   ├── JENKINS_INTEGRATION.md
│   ├── JENKINS_QUICK_SETUP.md
│   ├── JENKINS_CONFIG_GUIDE.md
│   └── JENKINS_TROUBLESHOOTING.md
│
├── Table/                              # 数据库表结构
│   └── (各表结构文档)
│
├── code-review/                        # Code Review 记录
│   └── ReportDetail-checklist.md
│
└── Toast 提示优化（已完成）
    ├── TOAST_IMPLEMENTATION_COMPLETE.md    # 实施完成总结 ⭐
    ├── toast-implementation-guide.md       # 实施指南
    └── toast-testing-checklist.md          # 测试清单
```

---

## 🔍 快速查找

### 我想了解...

#### 项目整体
- **项目怎么运行？** → [QUICK_START.md](QUICK_START.md)
- **项目结构是什么样的？** → [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)
- **有哪些 API？** → [API_DOCUMENTATION.md](API_DOCUMENTATION.md)

#### Jenkins 集成
- **如何集成 Jenkins？** → [Jenkins/JENKINS_INTEGRATION.md](Jenkins/JENKINS_INTEGRATION.md)
- **Jenkins 怎么配置？** → [Jenkins/JENKINS_QUICK_SETUP.md](Jenkins/JENKINS_QUICK_SETUP.md)
- **Jenkins 出问题了怎么办？** → [Jenkins/JENKINS_TROUBLESHOOTING.md](Jenkins/JENKINS_TROUBLESHOOTING.md)

#### Toast 提示
- **Toast 优化实施完成了吗？** → [TOAST_IMPLEMENTATION_COMPLETE.md](TOAST_IMPLEMENTATION_COMPLETE.md)
- **如何测试 Toast？** → [toast-testing-checklist.md](toast-testing-checklist.md)

#### 数据库
- **数据库表结构是什么？** → [database-design.md](database-design.md)
- **某个表的详细结构？** → [Table/](Table/) 目录

#### 问题排查
- **遇到过什么问题？** → [问题记录.md](问题记录.md)
- **某个组件的修复记录？** → [code-review/](code-review/) 目录

---

## 📝 文档更新记录

| 日期 | 更新内容 | 更新人 |
|------|----------|--------|
| 2026-03-14 | 创建文档索引，清理冗余文档 | Claude |
| 2026-03-14 | 完成 Toast 提示优化实施 | Claude |
| 2026-03-12 | 完成 ReportDetail 组件修复 | Claude |

---

## 💡 贡献指南

### 添加新文档
1. 确定文档类型（核心文档/功能模块/问题记录）
2. 放在对应的目录
3. 更新本索引文档

### 更新现有文档
1. 修改对应的文档
2. 更新文档更新记录
3. 如果目录结构变化，更新本索引

### 删除过时文档
1. 确认文档已过时或被替代
2. 删除文件
3. 从本索引中移除引用

---

**最后更新**：2026-03-14
