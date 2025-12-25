import nodemailer from 'nodemailer';

// 邮件配置 - 使用环境变量或默认配置
const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.163.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true, // 465 端口使用 SSL
  auth: {
    user: process.env.SMTP_USER || 'wiac_1998@163.com',
    pass: process.env.SMTP_PASS || 'VD5aYRVSz6ZppFfq',
  },
};

// 前端重置密码页面 URL
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// 创建邮件发送器
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport(emailConfig);
  }
  return transporter;
}

// 发送密码重置邮件
export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  username: string
): Promise<boolean> {
  try {
    // 检查 SMTP 配置是否完整
    if (!emailConfig.auth.user || !emailConfig.auth.pass) {
      // 开发模式：打印到控制台
      console.log('========================================');
      console.log('开发模式 - 密码重置邮件');
      console.log('========================================');
      console.log(`收件人: ${email}`);
      console.log(`用户名: ${username}`);
      console.log(`重置链接: ${FRONTEND_URL}/reset-password?token=${resetToken}`);
      console.log('========================================');
      return true;
    }

    const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"AutoTest Platform" <${emailConfig.auth.user}>`,
      to: email,
      subject: '重置您的 AutoTest 账户密码',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f6f7f8;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); overflow: hidden;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #137fec 0%, #0d5bb5 100%); padding: 32px 40px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">AutoTest</h1>
        <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0; font-size: 14px;">自动化测试平台</p>
      </div>

      <!-- Content -->
      <div style="padding: 40px;">
        <h2 style="color: #0d141b; margin: 0 0 16px; font-size: 20px; font-weight: 600;">您好，${username}</h2>
        <p style="color: #64748b; line-height: 1.6; margin: 0 0 24px; font-size: 15px;">
          我们收到了您重置密码的请求。点击下面的按钮来设置新密码：
        </p>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}"
             style="display: inline-block; background-color: #137fec; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">
            重置密码
          </a>
        </div>

        <p style="color: #64748b; line-height: 1.6; margin: 0 0 16px; font-size: 14px;">
          如果按钮无法点击，请复制以下链接到浏览器地址栏：
        </p>
        <p style="color: #137fec; word-break: break-all; font-size: 13px; background-color: #f1f5f9; padding: 12px; border-radius: 6px;">
          ${resetUrl}
        </p>

        <div style="border-top: 1px solid #e2e8f0; margin-top: 32px; padding-top: 24px;">
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0;">
            <strong>安全提示：</strong><br>
            • 此链接将在 1 小时后失效<br>
            • 如果您没有请求重置密码，请忽略此邮件<br>
            • 请勿将此链接分享给他人
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div style="background-color: #f8fafc; padding: 24px 40px; text-align: center;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
          &copy; ${new Date().getFullYear()} AutoTest Platform. All rights reserved.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
      `,
      text: `
您好，${username}

我们收到了您重置密码的请求。请点击以下链接来设置新密码：

${resetUrl}

此链接将在 1 小时后失效。

如果您没有请求重置密码，请忽略此邮件。

AutoTest Platform
      `,
    };

    const transport = getTransporter();
    await transport.sendMail(mailOptions);
    console.log(`Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return false;
  }
}

// 测试邮件配置
export async function testEmailConfig(): Promise<boolean> {
  try {
    if (!emailConfig.auth.user || !emailConfig.auth.pass) {
      console.log('SMTP credentials not configured, running in development mode');
      return true;
    }
    const transport = getTransporter();
    await transport.verify();
    console.log('SMTP connection verified successfully');
    return true;
  } catch (error) {
    console.error('SMTP connection failed:', error);
    return false;
  }
}

export default {
  sendPasswordResetEmail,
  testEmailConfig,
};
