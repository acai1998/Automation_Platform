# Docker 构建修复 - 快速参考

## 问题与解决

**问题**: Docker 构建时 npm ci 失败，TypeScript 无法安装

**解决**: 在 Dockerfile 三处位置添加 npm install 回退

修改位置: deployment/Dockerfile 第 7, 18, 28 行

## 快速测试

docker build -t automation-platform:latest -f deployment/Dockerfile .
docker run --rm automation-platform:latest npm list typescript
