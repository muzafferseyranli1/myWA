import { Router } from 'express';
import { authService } from '../services/auth.service';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../../src/lib/prisma';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await authService.login(username, password);
    res.json(result);
  } catch (error: any) {
    res.status(401).json({ error: error.message || 'Login failed' });
  }
});

router.get('/me', requireAuth, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, username: true, role: true, displayName: true }
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;
