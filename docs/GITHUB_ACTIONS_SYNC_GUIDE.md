# GitHub Actions 用例同步配置指南

本文档包含需要在 **测试仓库** 中创建的 GitHub Actions 配置文件。

## 步骤 1：创建 Workflow 文件

在测试仓库中创建文件：`.github/workflows/sync-cases.yml`

```yaml
name: Sync Test Cases

on:
  schedule:
    - cron: '0 */6 * * *'  # 每 6 小时执行一次
  push:
    branches: [main, master]
    paths:
      - 'test_case/**'
  workflow_dispatch:  # 支持手动触发

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install pymysql

      - name: Parse and Sync Cases
        env:
          DB_HOST: ${{ secrets.DB_HOST }}
          DB_PORT: ${{ secrets.DB_PORT }}
          DB_USER: ${{ secrets.DB_USER }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
          DB_NAME: ${{ secrets.DB_NAME }}
        run: python .github/scripts/sync_cases.py
```

## 步骤 2：创建解析脚本

在测试仓库中创建文件：`.github/scripts/sync_cases.py`

```python
#!/usr/bin/env python3
"""
解析测试脚本并直接写入 MariaDB
支持 pytest 格式的 Python 测试文件
"""
import os
import re
import pymysql
from pathlib import Path

def get_db_connection():
    """获取数据库连接"""
    return pymysql.connect(
        host=os.environ.get('DB_HOST'),
        port=int(os.environ.get('DB_PORT', 3306)),
        user=os.environ.get('DB_USER'),
        password=os.environ.get('DB_PASSWORD'),
        database=os.environ.get('DB_NAME'),
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor
    )

def parse_test_files(test_dir='test_case'):
    """解析所有 Python 测试文件"""
    cases = []
    test_path = Path(test_dir)

    if not test_path.exists():
        print(f"Warning: Test directory '{test_dir}' not found")
        return cases

    for py_file in test_path.rglob('test_*.py'):
        try:
            content = py_file.read_text(encoding='utf-8')
        except Exception as e:
            print(f"Error reading {py_file}: {e}")
            continue

        rel_path = str(py_file).replace('\\', '/')

        # 推断用例类型
        case_type = 'ui' if 'ui' in rel_path.lower() else 'api'

        # 匹配 class TestXxx 和 def test_xxx
        class_pattern = r'class\s+(Test\w+)\s*(?:\([^)]*\))?\s*:'
        method_pattern = r'def\s+(test_\w+)\s*\([^)]*\)'

        # 解析类和方法
        for class_match in re.finditer(class_pattern, content):
            class_name = class_match.group(1)
            class_start = class_match.end()

            # 查找下一个类或文件末尾
            next_class = re.search(class_pattern, content[class_start:])
            class_end = class_start + next_class.start() if next_class else len(content)
            class_content = content[class_start:class_end]

            for method_match in re.finditer(method_pattern, class_content):
                method_name = method_match.group(1)

                # 构建 pytest 格式的脚本路径
                script_path = f'{rel_path}::{class_name}::{method_name}'

                cases.append({
                    'name': f'{class_name}::{method_name}',
                    'module': class_name,
                    'type': case_type,
                    'priority': 'P1',
                    'script_path': script_path,
                    'tags': 'auto-synced,github-actions',
                })

        # 解析独立的 test_ 函数（不在类内）
        # 首先移除所有类的内容
        content_no_class = re.sub(
            r'class\s+Test\w+\s*(?:\([^)]*\))?\s*:.*?(?=\nclass\s|\Z)',
            '',
            content,
            flags=re.DOTALL
        )

        for func_match in re.finditer(method_pattern, content_no_class):
            func_name = func_match.group(1)
            script_path = f'{rel_path}::{func_name}'

            cases.append({
                'name': func_name,
                'module': None,
                'type': case_type,
                'priority': 'P1',
                'script_path': script_path,
                'tags': 'auto-synced,github-actions',
            })

    return cases

def sync_to_db(cases):
    """同步用例到数据库"""
    if not cases:
        print('No cases to sync')
        return

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            synced = 0
            for case in cases:
                # 使用 script_path 作为唯一标识
                # 存在则更新，不存在则插入
                sql = """
                    INSERT INTO test_cases
                        (name, module, type, priority, script_path, tags, status)
                    VALUES
                        (%(name)s, %(module)s, %(type)s, %(priority)s, %(script_path)s, %(tags)s, 'active')
                    ON DUPLICATE KEY UPDATE
                        name = VALUES(name),
                        module = VALUES(module),
                        type = VALUES(type),
                        tags = VALUES(tags),
                        updated_at = NOW()
                """
                try:
                    cursor.execute(sql, case)
                    synced += 1
                except Exception as e:
                    print(f"Error syncing case {case['name']}: {e}")

            conn.commit()
            print(f'Successfully synced {synced}/{len(cases)} cases')

    finally:
        conn.close()

def main():
    """主函数"""
    print('Starting test case sync...')
    print(f'Repository: {os.environ.get("GITHUB_REPOSITORY", "unknown")}')
    print(f'Branch: {os.environ.get("GITHUB_REF_NAME", "unknown")}')

    cases = parse_test_files()
    print(f'Found {len(cases)} test cases')

    if cases:
        sync_to_db(cases)
    else:
        print('No test cases found to sync')

if __name__ == '__main__':
    main()
```

## 步骤 3：配置 GitHub Secrets

在测试仓库的 **Settings > Secrets and variables > Actions** 中添加以下 Secrets：

| Secret 名称 | 值 |
|------------|---|
| `DB_HOST` | 117.72.182.23 |
| `DB_PORT` | 3306 |
| `DB_USER` | root |
| `DB_PASSWORD` | (你的数据库密码) |
| `DB_NAME` | autotest |

## 步骤 4：添加唯一索引

在 MariaDB 中执行以下 SQL，为 `script_path` 添加唯一索引：

```sql
ALTER TABLE test_cases ADD UNIQUE INDEX idx_script_path (script_path(255));
```

## 触发同步

同步会在以下情况自动触发：
1. 每 6 小时定时执行
2. 当 `test_case/` 目录下的文件有变更时
3. 手动在 GitHub Actions 页面点击 "Run workflow"

## 验证

1. 在 GitHub 测试仓库的 **Actions** 页面查看执行日志
2. 在自动化平台的用例管理页面查看同步的用例
