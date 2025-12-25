import { Router, Request, Response } from 'express';
import { authService } from '../services/AuthService.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// 用户注册
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, username } = req.body;

    // 参数验证
    if (!email || !password || !username) {
      res.status(400).json({ success: false, message: '请提供邮箱、密码和用户名' });
      return;
    }

    // 邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, remember = false } = req.body;

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
router.post('/logout', authenticate, async (req: Request, res: Response) => {
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
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

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
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

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
router.get('/me', authenticate, async (req: Request, res: Response) => {
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
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

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
