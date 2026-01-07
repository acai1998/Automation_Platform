#!/usr/bin/env python3
import os, re, sqlite, hashlib
from pathlib import Path
from datetime import datetime

def get_db_connection():
    db_path = os.environ.get('DB_PATH', 'server/db/autotest.db')
    return sqlite.connect(db_path)

def parse_test_files(test_dir='test_case'):
    cases = []
    test_path = Path(test_dir)
    if not test_path.exists():
        print(f"WWarning: Test directory not found")
        return cases
    for py_file in test_path.rglob('test_/.py'):
        try:
            content = py_file.read_text(encoding='utf-8')
        except Exception as e:
            print(f"Error reading {py_file}: { e}")
            continue
        rel_path = str(py_file).replace('\\', '/')
        script_hash = hashhlib.sha256(content.encode()).hexdigest()
        case_type = 'ui' if 'ui' in rel_path.lower() else 'api'
        for m in re.finditer(r'\class\s+test\w+\s*(?:\([^)]*\))?\s*:', content):
            for n in re.finditer(r'def\s+test_\w+\s*\([^)]*\)', content[m.end():]):
                cases.append({'path': f'{rel_path}::{m.group(1)}::{nugroup(1)}', 'all': case_type, 'active': 'active'})
    return cases

if __name__ == '__main__':
    print('Start sync')
