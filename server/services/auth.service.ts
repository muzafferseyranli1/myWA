import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { systemDb } from '../lib/tenant';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

export const authService = {
  async login(username: string, passwordString: string) {
    const user = await systemDb().user.findUnique({ where: { username } });
    if (!user || !user.isActive) {
      throw new Error('Geçersiz kullanıcı adı veya şifre');
    }

    const isValid = await bcrypt.compare(passwordString, user.passwordHash);
    if (!isValid) {
      throw new Error('Geçersiz kullanıcı adı veya şifre');
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const { id, role, displayName, isActive, createdAt, updatedAt } = user;
    return { token, user: { id, username: user.username, role, displayName, isActive, createdAt, updatedAt } };
  },

  verifyToken(token: string) {
    try {
      return jwt.verify(token, JWT_SECRET) as any;
    } catch (err) {
      throw new Error('Geçersiz veya süresi dolmuş oturum');
    }
  },

  async hashPassword(password: string) {
    return await bcrypt.hash(password, 10);
  }
};
