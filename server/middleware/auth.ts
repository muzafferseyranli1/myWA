import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { runWithTenant, tenantForUser } from '../lib/tenant';

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if ((req as any).user?.role !== 'ADMIN') return res.status(403).json({ error: 'Yönetici yetkisi gerekli' });
  next();
};

function bearer(req: Request) {
  const header = req.headers.authorization;
  return header && header.startsWith('Bearer ') ? header.split(' ')[1] : null;
}

/** Verifies the token only. Does not enter a tenant; for account-level routes. */
export const requireUser = (req: Request, res: Response, next: NextFunction) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { (req as any).user = authService.verifyToken(token); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
  next();
};

/**
 * Verifies the token and runs the rest of the request inside the user's own
 * tenant. Deactivated or unprovisioned users are rejected, so a still-valid
 * token of a disabled account cannot read anything.
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  let user: any;
  try { user = authService.verifyToken(token); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
  const tenant = tenantForUser(user.id);
  if (!tenant) return res.status(401).json({ error: 'Hesap etkin değil veya henüz hazırlanmadı' });
  (req as any).user = user;
  runWithTenant(tenant, next);
};
