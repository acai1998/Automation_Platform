#!/usr/bin/env python3
"""
解析测试脚本并直接写入 MariaDB
支持 pytest 格式的 Python 测试文件
支持通过注释标记元数据：@owner, @priority, @description
"""
import os
import re
import pymysql  # type: ignore
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

def extract_metadata(content: str, func_start: int) -> dict:
    """
    提取函数上方的元数据
    支持两种格式：
        1. 注释格式：# @owner: zhangsan
        2. 装饰器格式：@pytest.mark.owner('zhangsan')
    """
    metadata = {
        'owner': None,
        'priority': 'P1',
        'description': None
    }
    
    # 向上查找（最多 500 个字符）
    search_start = max(0, func_start - 500)
    before_func = content[search_start:func_start]
    
    # ========== 装饰器格式 ==========
    # @pytest.mark.owner('caijinwei') 或 @pytest.mark.owner("caijinwei")
    owner_match = re.search(r'@pytest\.mark\.owner\([\'"](.+?)[\'"]\)', before_func)
    if owner_match:
        metadata['owner'] = owner_match.group(1)
    
    # @pytest.mark.priority('P0')
    priority_match = re.search(r'@pytest\.mark\.priority\([\'"](.+?)[\'"]\)', before_func)
    if priority_match:
        metadata['priority'] = priority_match.group(1).upper()
    
    # @pytest.mark.description('登录用例')
    desc_match = re.search(r'@pytest\.mark\.description\([\'"](.+?)[\'"]\)', before_func)
    if desc_match:
        metadata['description'] = desc_match.group(1)
    
    # ========== 注释格式（兼容） ==========
    if not metadata['owner']:
        owner_match = re.search(r'#\s*@owner:\s*(\S+)', before_func)
        if owner_match:
            metadata['owner'] = owner_match.group(1)
    
    if metadata['priority'] == 'P1':  # 没被装饰器覆盖才用注释
        priority_match = re.search(r'#\s*@priority:\s*(P[0-3])', before_func, re.IGNORECASE)
        if priority_match:
            metadata['priority'] = priority_match.group(1).upper()
    
    if not metadata['description']:
        desc_match = re.search(r'#\s*@description:\s*(.+?)(?:\n|$)', before_func)
        if desc_match:
            metadata['description'] = desc_match.group(1).strip()
    
    return metadata


def parse_test_files(test_dir='examples'):
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
                
                # 计算方法在原始内容中的位置
                method_pos = class_start + method_match.start()
                
                # 提取元数据
                metadata = extract_metadata(content, method_pos)

                # 构建 pytest 格式的脚本路径
                script_path = f'{rel_path}::{class_name}::{method_name}'
                case_key = f'{class_name}::{method_name}'

                cases.append({
                    'case_key': case_key,
                    'name': case_key,
                    'description': metadata['description'],
                    'module': class_name,
                    'type': case_type,
                    'priority': metadata['priority'],
                    'script_path': script_path,
                    'tags': 'auto-synced,github-actions',
                    'owner': metadata['owner'],
                })

        # 解析独立的 test_ 函数（不在类内）
        content_no_class = re.sub(
            r'class\s+Test\w+\s*(?:\([^)]*\))?\s*:.*?(?=\nclass\s|\Z)',
            '',
            content,
            flags=re.DOTALL
        )

        for func_match in re.finditer(method_pattern, content_no_class):
            func_name = func_match.group(1)
            
            # 在原始内容中找到函数位置以提取元数据
            original_match = re.search(rf'def\s+{func_name}\s*\([^)]*\)', content)
            func_pos = original_match.start() if original_match else 0
            
            # 提取元数据
            metadata = extract_metadata(content, func_pos)
            
            script_path = f'{rel_path}::{func_name}'

            cases.append({
                'case_key': func_name,
                'name': func_name,
                'description': metadata['description'],
                'module': None,
                'type': case_type,
                'priority': metadata['priority'],
                'script_path': script_path,
                'tags': 'auto-synced,github-actions',
                'owner': metadata['owner'],
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
                sql = """
                    INSERT INTO Auto_TestCase
                        (case_key, name, description, module, type, priority, script_path, tags, owner, repo_id, source, enabled)
                    VALUES
                        (%(case_key)s, %(name)s, %(description)s, %(module)s, %(type)s, %(priority)s, %(script_path)s, %(tags)s, %(owner)s, 1, 'git', 1)
                    ON DUPLICATE KEY UPDATE
                        name = VALUES(name),
                        description = VALUES(description),
                        module = VALUES(module),
                        type = VALUES(type),
                        priority = VALUES(priority),
                        tags = VALUES(tags),
                        owner = VALUES(owner),
                        enabled = 1,
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
