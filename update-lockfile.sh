#!/bin/bash

# 更新 package-lock.json 以使用 vite 5.0.12
echo "正在更新 package-lock.json..."

# 清理旧的 node_modules 和 package-lock.json
rm -rf node_modules package-lock.json

# 重新安装依赖（会使用 overrides 中的 vite 版本）
npm install

# 验证版本
echo "验证 vite 版本..."
npm list vite

echo "✅ package-lock.json 已更新！"
echo "现在可以提交 package.json 和 package-lock.json 的修改。"
