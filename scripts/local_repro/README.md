本地复现脚本：

用途：触发 `POST /api/jenkins/run-case` 并随后调用 `POST /api/jenkins/callback/test` 模拟 Jenkins 回调，便于本地验证调度器与回调流程。

用法：

默认：假设后端在 `http://localhost:3000`

```powershell
# 在项目根目录下运行
node scripts/local_repro/run_and_callback.js
```

可选环境变量：
- `HOST`：后端主机，默认 `localhost`
- `PORT`：后端端口，默认 `3000`
- `CASE_ID`：用于触发的用例 ID，默认 `3032`
- `PROJECT_ID`：项目 ID，默认 `1`

示例（如果后端在 3002 端口）：

```powershell
$env:PORT=3002; node scripts/local_repro/run_and_callback.js
```
