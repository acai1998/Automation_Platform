#!/bin/bash

# 清理 VSCode 和 TypeScript 缓存的脚本
# 用于解决 VSCode 显示已删除文件的错误问题

echo "🧹 开始清理 VSCode 和 TypeScript 缓存..."

# 1. 清理 TypeScript 缓存
echo "清理 TypeScript 缓存..."
rm -rf node_modules/.cache
rm -rf .tsbuildinfo
rm -rf tsconfig.tsbuildinfo

# 2. 清理 Vite 缓存
echo "清理 Vite 缓存..."
rm -rf node_modules/.vite

# 3. 清理 VSCode 工作区缓存（如果存在）
if [ -d ".vscode" ]; then
    echo "清理 VSCode 工作区缓存..."
    rm -rf .vscode/.cache
fi

# 4. 清理构建产物
echo "清理构建产物..."
rm -rf dist
rm -rf build

echo "✅ 缓存清理完成！"
echo ""
echo "📝 接下来请执行以下操作："
echo "1. 在 VSCode 中按 Cmd+Shift+P (Mac) 或 Ctrl+Shift+P (Windows/Linux)"
echo "2. 输入 'TypeScript: Restart TS Server' 并执行"
echo "3. 或者直接重启 VSCode 窗口 (Developer: Reload Window)"
echo ""
echo "如果问题仍然存在，请关闭 VSCode 后重新打开项目。"
