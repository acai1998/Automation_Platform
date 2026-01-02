/**
 * 解锁用户账户脚本
 * 用于重置被锁定的用户账户状态
 *
 * 用法: npx tsx server/db/unlock-user.ts [email]
 * 示例: npx tsx server/db/unlock-user.ts admin@autotest.com
 */
import mysql from 'mysql2/promise';

const DB_NAME = process.env.DB_NAME || 'autotest';

const dbConfig = {
  host: process.env.DB_HOST || '117.72.182.23',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Caijinwei2025',
  database: DB_NAME,
};

async function main() {
  // 获取命令行参数中的邮箱
  const email = process.argv[2] || 'admin@autotest.com';

  console.log('========================================');
  console.log('解锁用户账户');
  console.log('========================================');
  console.log(`目标邮箱: ${email}`);
  console.log('');

  const pool = mysql.createPool(dbConfig);

  try {
    // 1. 查询当前用户状态
    const [users] = await pool.execute(
      'SELECT id, username, email, status, login_attempts, locked_until FROM users WHERE email = ?',
      [email]
    );

    const userList = users as Array<{
      id: number;
      username: string;
      email: string;
      status: string;
      login_attempts: number;
      locked_until: Date | null;
    }>;

    if (userList.length === 0) {
      console.log('❌ 未找到该用户');
      process.exit(1);
    }

    const user = userList[0];
    console.log('当前状态:');
    console.log(`  用户名: ${user.username}`);
    console.log(`  邮箱: ${user.email}`);
    console.log(`  状态: ${user.status}`);
    console.log(`  登录失败次数: ${user.login_attempts}`);
    console.log(`  锁定截止时间: ${user.locked_until || '无'}`);
    console.log('');

    // 2. 执行解锁
    await pool.execute(
      `UPDATE users
       SET status = 'active',
           login_attempts = 0,
           locked_until = NULL
       WHERE email = ?`,
      [email]
    );

    console.log('✓ 账户已解锁');
    console.log('');

    // 3. 验证解锁结果
    const [updatedUsers] = await pool.execute(
      'SELECT id, username, email, status, login_attempts, locked_until FROM users WHERE email = ?',
      [email]
    );

    const updatedUser = (updatedUsers as typeof userList)[0];
    console.log('解锁后状态:');
    console.log(`  状态: ${updatedUser.status}`);
    console.log(`  登录失败次数: ${updatedUser.login_attempts}`);
    console.log(`  锁定截止时间: ${updatedUser.locked_until || '无'}`);
    console.log('');
    console.log('========================================');
    console.log('✅ 操作完成！');
    console.log('========================================');
    console.log('');
    console.log('现在可以使用以下凭据登录:');
    console.log(`  邮箱: ${email}`);
    console.log('  密码: admin123 (管理员) 或 test123 (其他用户)');

  } catch (error) {
    console.error('❌ 操作失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
