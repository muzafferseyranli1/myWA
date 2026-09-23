import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { authService } from '../services/auth.service';
import { wahaService } from '../services/waha.service';
import { disconnectTenant } from '../sockets';
import { loadTenants, provisionTenant, runWithTenant, systemDb, tenantForUser } from '../lib/tenant';

/**
 * Account management. Administrators can create, disable and re-enable users,
 * but there is deliberately no route that exposes another user's chats,
 * messages, tasks or QR code.
 */
const router = Router();
router.use(requireAuth, requireAdmin);

const USERNAME = /^[a-zA-Z0-9._-]{3,32}$/;
const view = (user: any) => {
  const tenant = tenantForUser(user.id);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    provisioned: !!user.tenantSchema && !!user.wahaSession,
    // Connection state only; never the QR code or any WhatsApp content.
    whatsapp: tenant ? runWithTenant(tenant, () => wahaService.getStatus().status) : null,
    createdAt: user.createdAt,
  };
};

router.get('/users', async (_req, res) => {
  try {
    const users = await systemDb().user.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(users.map(view));
  } catch { res.status(503).json({ error: 'Kullanıcılar alınamadı' }); }
});

router.post('/users', async (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (typeof username !== 'string' || !USERNAME.test(username)) return res.status(400).json({ error: 'Kullanıcı adı 3-32 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi kullanılabilir' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Şifre en az 8 karakter olmalı' });
  if (displayName !== undefined && (typeof displayName !== 'string' || displayName.length > 100)) return res.status(400).json({ error: 'Geçersiz görünen ad' });
  try {
    if (await systemDb().user.findUnique({ where: { username } })) return res.status(409).json({ error: 'Bu kullanıcı adı kullanılıyor' });
    const user = await systemDb().user.create({ data: { username, passwordHash: await authService.hashPassword(password), displayName: displayName?.trim() || username, role: 'USER' } });
    await provisionTenant(user.id);
    res.status(201).json(view(await systemDb().user.findUniqueOrThrow({ where: { id: user.id } })));
  } catch (error: any) {
    console.error('[admin] Create user failed:', error.message);
    res.status(500).json({ error: 'Kullanıcı oluşturulamadı; tekrar denerseniz kaldığı yerden devam eder' });
  }
});

router.patch('/users/:id', async (req: any, res) => {
  const id = String(req.params.id);
  const { displayName, password, isActive } = req.body || {};
  if (displayName !== undefined && (typeof displayName !== 'string' || !displayName.trim() || displayName.length > 100)) return res.status(400).json({ error: 'Geçersiz görünen ad' });
  if (password !== undefined && (typeof password !== 'string' || password.length < 8 || password.length > 200)) return res.status(400).json({ error: 'Şifre en az 8 karakter olmalı' });
  if (isActive !== undefined && typeof isActive !== 'boolean') return res.status(400).json({ error: 'Geçersiz durum' });
  if (id === req.user.id && isActive === false) return res.status(400).json({ error: 'Kendi hesabınızı devre dışı bırakamazsınız' });
  try {
    const existing = await systemDb().user.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (isActive === false) {
      // Stop the WhatsApp session and cut live connections before access is revoked.
      const tenant = tenantForUser(id);
      if (tenant) await runWithTenant(tenant, () => wahaService.stopSession()).catch(() => {});
    }
    const user = await systemDb().user.update({ where: { id }, data: {
      ...(displayName !== undefined ? { displayName: displayName.trim() } : {}),
      ...(password !== undefined ? { passwordHash: await authService.hashPassword(password) } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    } });
    if (isActive === false) disconnectTenant(id);
    if (user.isActive && (!user.tenantSchema || !user.wahaSession)) await provisionTenant(id);
    else await loadTenants();
    res.json(view(await systemDb().user.findUniqueOrThrow({ where: { id } })));
  } catch (error: any) {
    console.error('[admin] Update user failed:', error.message);
    res.status(500).json({ error: 'Kullanıcı güncellenemedi' });
  }
});

export default router;
