# .gitignore 问题排查

## 问题：src/lib 目录被忽略

### 症状
```
ls: ./src/lib/: No such file or directory
```
Docker 构建时找不到 `src/lib/` 目录。

### 原因
`.gitignore` 中有 `lib/` 规则，忽略了所有名为 `lib` 的目录，包括 `src/lib/`。

### 解决方案

在 `.gitignore` 中添加例外规则：

```gitignore
# 忽略所有 lib/ 目录
lib/

# 但不忽略 src/lib/
!src/lib/
```

### 验证

```bash
# 检查文件是否被跟踪
git ls-files src/lib/utils.ts

# 如果没有输出，说明被忽略了
# 使用 -f 强制添加
git add -f src/lib/utils.ts
```

### Gitignore 规则

| 规则 | 含义 |
|------|------|
| `lib/` | 忽略所有 lib/ 目录 |
| `!src/lib/` | 不忽略 src/lib/（例外） |
| `*.log` | 忽略所有 .log 文件 |
| `/node_modules` | 只忽略根目录的 node_modules |
| `node_modules` | 忽略所有 node_modules 目录 |

### 常见问题

#### 1. 文件已经被跟踪，想忽略
```bash
# 先从 Git 中移除（保留本地文件）
git rm --cached <file>

# 然后添加到 .gitignore
echo "<file>" >> .gitignore

# 提交
git add .gitignore
git commit -m "ignore file"
```

#### 2. 想跟踪被忽略的文件
```bash
# 方法1：强制添加（不推荐修改 .gitignore）
git add -f <file>

# 方法2：修改 .gitignore 添加例外（推荐）
echo "!src/lib/" >> .gitignore
git add <file>
```

#### 3. .gitignore 不生效
```bash
# 清除 Git 缓存
git rm -r --cached .

# 重新添加所有文件
git add .

# 重新提交
git commit -m "fix gitignore"
```

### 最佳实践

1. **尽量使用具体路径** - 避免过于通用的规则
2. **使用例外规则** - 用 `!` 排除需要保留的文件
3. **注释规则** - 说明为什么忽略某些文件
4. **定期审查** - 检查是否有意外被忽略的文件

### 排查工具

```bash
# 检查文件是否被忽略
git check-ignore -v src/lib/utils.ts

# 列出所有被忽略的文件
git status --ignored

# 查看哪些规则匹配了文件
git check-ignore -v --stdin <<< "src/lib/utils.ts"
```

### 示例：完善的 .gitignore

```gitignore
# 通用规则
*.log
node_modules/
dist/

# 但保留特定路径
!src/lib/
!public/assets/

# 使用注释说明原因
# Python 编译文件
__pycache__/
*.py[cod]

# 项目构建产物
# 但保留源代码中的 lib 目录
lib/
!src/lib/
```

### 相关文档

- [Gitignore 文档](https://git-scm.com/docs/gitignore)
- [Gitignore 模式](https://git-scm.com/docs/gitignore#_pattern_format)
- [GitHub Gitignore 模板](https://github.com/github/gitignore)
