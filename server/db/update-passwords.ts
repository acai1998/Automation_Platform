/**
 * 更新用户密码脚本
 * 为所有用户设置真实可用的 bcrypt 密码哈希
 */
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const DB_NAME = process.env.DB_NAME || 'autotest';

const dbConfig = {
  host: process.env.DB_HOST || '117.72.182.23',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Caijinwei2025',
  database: DB_NAME,
};

async function main() {
  console.log('========================================');
  console.log('更新用户密码');
  console.log('========================================');

  const pool = mysql.createPool(dbConfig);

  try {
    // 生成密码哈希
    console.log('生成密码哈希...');
    const adminHash = await bcrypt.hash('admin123', 10);
    const othersHash = await bcrypt.hash('test123', 10);

    console.log('');
    console.log('密码设置:');
    console.log('  - admin 用户: admin123');
    console.log('  - 其他用户: test123');
    console.log('');

    // 更新 admin 用户密码
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE username = ?',
      [adminHash, 'admin']
    );
    console.log('✓ admin 密码已更新');

    // 更新其他用户密码
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE username != ?',
      [othersHash, 'admin']
    );
    console.log('✓ 其他用户密码已更新');

    // 验证更新
    const [users] = await pool.execute(
      'SELECT username, email, display_name, role FROM users'
    );

    console.log('');
    console.log('当前用户列表:');
    console.log('----------------------------------------');
    (users as Array<{username: string; email: string; display_name: string; role: string}>).forEach(user => {
      console.log(`  ${user.username} | ${user.email} | ${user.display_name} | ${user.role}`);
    });

    console.log('');
    console.log('========================================');
    console.log('✅ 密码更新完成！');
    console.log('========================================');
    console.log('');
    console.log('登录信息:');
    console.log('  管理员: admin / admin123');
    console.log('  测试员: zhangsan / test123');
    console.log('         lisi / test123');
    console.log('         zhaoliu / test123');
    console.log('  开发员: wangwu / test123');
    console.log('  只读:   qianqi / test123');

  } catch (error) {
    console.error('❌ 更新失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
