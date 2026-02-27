import { Router, Request, Response } from 'express';
import { authService } from '../services/AuthService';
import { authenticate } from '../middleware/auth';
import {
  loginRateLimiter,
  registerRateLimiter,
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
  refreshRateLimiter,
  generalAuthRateLimiter,
} from '../middleware/authRateLimiter';

const router = Router();

// 用户注册
router.post('/register', registerRateLimiter, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = typeof body['email'] === 'string' ? body['email'] : '';
    const password = typeof body['password'] === 'string' ? body['password'] : '';
    const username = typeof body['username'] === 'string' ? body['username'] : '';

    // 参数验证
    if (!email || !password || !username) {
      res.status(400).json({ success: false, message: '请提供邮箱、密码和用户名' });
      return;
    }

    // 邮箱格式验证
    // 先限制长度（防止超长输入对正则引擎造成 ReDoS 攻击）
    if (email.length > 254) {
      res.status(400).json({ success: false, message: '邮箱格式不正确' });
      return;
    }
    // 使用明确上界的正则，避免多项式级回溯（Polynomial ReDoS）：
    // - 本地部分限制在 1~64 个字符（RFC 5321 规范上限）
    // - 域名部分限制在 1~255 个字符
    // - 使用具体字符集而非开放的否定字符类 [^\s@]
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?){0,10}\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ success: false, message: '邮箱格式不正确' });
      return;
    }

    // 密码强度验证
    if (password.length < 6) {
      res.status(400).json({ success: false, message: '密码长度至少为 6 位' });
      return;
    }

    // 用户名验证
    if (username.length < 2 || username.length > 50) {
      res.status(400).json({ success: false, message: '用户名长度应在 2-50 个字符之间' });
      return;
    }

    const result = await authService.register(email, password, username);
    res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    console.error('Register route error:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 用户登录
router.post('/login', loginRateLimiter, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = typeof body['email'] === 'string' ? body['email'] : '';
    const password = typeof body['password'] === 'string' ? body['password'] : '';
    const remember = typeof body['remember'] === 'boolean' ? body['remember'] : false;

    if (!email || !password) {
      res.status(400).json({ success: false, message: '请提供邮箱和密码' });
      return;
    }

    const result = await authService.login(email, password, remember);
    res.status(result.success ? 200 : 401).json(result);
  } catch (error) {
    console.error('Login route error:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 用户登出
router.post('/logout', authenticate, generalAuthRateLimiter, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const result = await authService.logout(req.user.id);
    res.json(result);
  } catch (error) {
    console.error('Logout route error:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 忘记密码
router.post('/forgot-password', forgotPasswordRateLimiter, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = typeof body['email'] === 'string' ? body['email'] : '';

    if (!email) {
      res.status(400).json({ success: false, message: '请提供邮箱地址' });
      return;
    }

    const result = await authService.forgotPassword(email);
    res.json(result);
  } catch (error) {
    console.error('Forgot password route error:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 重置密码
router.post('/reset-password', resetPasswordRateLimiter, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const token = typeof body['token'] === 'string' ? body['token'] : '';
    const password = typeof body['password'] === 'string' ? body['password'] : '';

    if (!token || !password) {
      res.status(400).json({ success: false, message: '请提供重置令牌和新密码' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ success: false, message: '密码长度至少为 6 位' });
      return;
    }

    const result = await authService.resetPassword(token, password);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('Reset password route error:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取当前用户信息
router.get('/me', authenticate, generalAuthRateLimiter, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const user = await authService.getCurrentUser(req.user.id);
    if (!user) {
      res.status(404).json({ success: false, message: '用户不存在' });
      return;
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Get current user route error:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 刷新 Token
router.post('/refresh', refreshRateLimiter, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const refreshToken = typeof body['refreshToken'] === 'string' ? body['refreshToken'] : '';

    if (!refreshToken) {
      res.status(400).json({ success: false, message: '请提供刷新令牌' });
      return;
    }

    const result = await authService.refreshToken(refreshToken);
    if (result.token) {
      res.json({ success: true, token: result.token });
    } else {
      res.status(401).json({ success: false, message: result.message });
    }
  } catch (error) {
    console.error('Refresh token route error:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;
