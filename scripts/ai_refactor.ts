#!/usr/bin/env node
/**
 * AI Refactor CLI
 * 自动化项目结构重构、依赖更新、路径重写、构建验证与报告生成
 *
 * Usage:
 *   npx tsx scripts/ai_refactor.ts --analyze    # 分析项目结构
 *   npx tsx scripts/ai_refactor.ts --validate   # 验证构建
 *   npx tsx scripts/ai_refactor.ts --report     # 生成报告
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT_DIR = path.resolve(__dirname, '..');

interface ValidationResult {
  step: string;
  success: boolean;
  output?: string;
  error?: string;
}

function runCommand(command: string, description: string): ValidationResult {
  console.log(`\n🔄 ${description}...`);
  try {
    const output = execSync(command, {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    console.log(`✅ ${description} - 成功`);
    return { step: description, success: true, output };
  } catch (err: any) {
    console.log(`❌ ${description} - 失败`);
    return { step: description, success: false, error: err.message };
  }
}

function analyze(): void {
  console.log('\n📊 分析项目结构...\n');

  const dirs = ['src', 'server', 'configs', 'tests', 'scripts', 'docs', 'shared', 'public'];
  const structure: Record<string, string[]> = {};

  for (const dir of dirs) {
    const dirPath = path.join(ROOT_DIR, dir);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath, { recursive: true }) as string[];
      structure[dir] = files.filter(f => !f.includes('node_modules'));
      console.log(`📁 ${dir}/: ${structure[dir].length} 个文件`);
    } else {
      console.log(`📁 ${dir}/: 目录不存在`);
    }
  }

  // Check for config files
  const configFiles = ['package.json', 'tsconfig.json', 'tsconfig.server.json', 'vite.config.ts'];
  console.log('\n📋 配置文件:');
  for (const file of configFiles) {
    const exists = fs.existsSync(path.join(ROOT_DIR, file));
    console.log(`  ${exists ? '✅' : '❌'} ${file}`);
  }
}

function validate(): ValidationResult[] {
  console.log('\n🔍 验证项目...\n');

  const results: ValidationResult[] = [];

  // Type check frontend
  results.push(runCommand(
    'npx tsc --noEmit -p tsconfig.json',
    '前端类型检查'
  ));

  // Type check backend
  results.push(runCommand(
    'npx tsc --noEmit -p tsconfig.server.json',
    '后端类型检查'
  ));

  // Build frontend
  results.push(runCommand(
    'npm run build',
    '前端构建'
  ));

  // Summary
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('\n📊 验证结果:');
  console.log(`  ✅ 通过: ${passed}`);
  console.log(`  ❌ 失败: ${failed}`);

  return results;
}

function showReport(): void {
  console.log('\n📄 重构报告:\n');

  const reportPath = path.join(ROOT_DIR, 'refactor_report.md');
  if (fs.existsSync(reportPath)) {
    const content = fs.readFileSync(reportPath, 'utf-8');
    console.log(content);
  } else {
    console.log('报告文件不存在');
  }
}

function showHelp(): void {
  console.log(`
AI Refactor CLI - 项目结构自动化重构工具

用法:
  npx tsx scripts/ai_refactor.ts [选项]

选项:
  --analyze    分析项目结构
  --validate   验证构建和类型检查
  --report     显示重构报告
  --help       显示帮助信息

示例:
  npx tsx scripts/ai_refactor.ts --analyze
  npx tsx scripts/ai_refactor.ts --validate
  npx tsx scripts/ai_refactor.ts --analyze --validate
`);
}

// Main
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  showHelp();
  process.exit(0);
}

console.log('🤖 AI Refactor CLI v1.0.0\n');
console.log('='.repeat(50));

if (args.includes('--analyze')) {
  analyze();
}

if (args.includes('--validate')) {
  const results = validate();
  const allPassed = results.every(r => r.success);
  process.exit(allPassed ? 0 : 1);
}

if (args.includes('--report')) {
  showReport();
}

console.log('\n' + '='.repeat(50));
console.log('✨ 完成');
