import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'autotest.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const SEED_PATH = path.join(__dirname, 'seed.sql');

export function initDatabase(reset = false) {
  // 如果需要重置，删除现有数据库
  if (reset && fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('已删除旧数据库');
  }

  // 创建数据库连接
  const db = new Database(DB_PATH);

  // 启用外键约束
  db.pragma('foreign_keys = ON');

  // 检查是否需要初始化
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='users'
  `).get();

  if (!tableExists) {
    console.log('初始化数据库表结构...');

    // 读取并执行 schema.sql
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schema);
    console.log('表结构创建完成');

    // 读取并执行 seed.sql
    console.log('插入测试数据...');
    const seed = fs.readFileSync(SEED_PATH, 'utf-8');
    db.exec(seed);
    console.log('测试数据插入完成');
  } else {
    console.log('数据库已存在，跳过初始化');
  }

  return db;
}

export function getDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    return initDatabase();
  }

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  return db;
}

// 如果直接运行此文件，则执行初始化
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const reset = process.argv.includes('--reset');
  initDatabase(reset);
  console.log('数据库初始化完成！');
}
