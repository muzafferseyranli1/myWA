import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { authService } from '../services/auth.service';
import bcrypt from 'bcryptjs';
import { wahaService, WAHAService } from '../services/waha.service';
import { prisma } from '../lib/prisma';
import { boardSlug } from '../services/board.service';
import { disconnectTenant } from '../sockets';
import { getNotificationSettings, saveNotificationSettings } from '../lib/notification-settings';
import { parseNotificationSettings } from '../lib/quiet-hours';
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

// Permanently removes a disabled account: its WhatsApp session, its schema with
// every chat, message and task, and the account itself. Cannot be undone.
router.delete('/users/:id', async (req: any, res) => {
  const id = String(req.params.id);
  try {
    const user = await systemDb().user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (id === req.user.id || user.role === 'ADMIN') return res.status(400).json({ error: 'Yönetici hesapları silinemez' });
    if (user.isActive) return res.status(409).json({ error: 'Önce hesabı devre dışı bırakın' });
    if (user.tenantSchema === 'public') return res.status(400).json({ error: 'Ana veri alanı silinemez' });
    if (await systemDb().sharedBoard.count({ where: { ownerId: id } })) return res.status(409).json({ error: 'Bu kullanıcıya ait ortak panolar var' });
    if (user.wahaSession) await new WAHAService(user.wahaSession).deleteSession();
    if (user.tenantSchema && /^t_[a-z0-9]{8,32}$/.test(user.tenantSchema)) await systemDb().$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${user.tenantSchema}" CASCADE`);
    await systemDb().user.delete({ where: { id } });
    await loadTenants();
    res.json({ success: true });
  } catch (error: any) {
    console.error('[admin] Delete user failed:', error.message);
    res.status(500).json({ error: 'Kullanıcı silinemedi' });
  }
});

// Shared group boards. The board shows one group's tasks from every account to
// anyone with its password; new tasks added there belong to the creating admin.
const boardView = async (b: any) => ({
  id: b.id, slug: b.slug, title: b.title, chatId: b.chatId, isActive: b.isActive, createdAt: b.createdAt,
  chatName: (await prisma.chat.findUnique({ where: { id: b.chatId }, select: { name: true } }))?.name || b.chatId,
});
router.get('/boards', async (req: any, res) => {
  try { res.json(await Promise.all((await systemDb().sharedBoard.findMany({ where: { ownerId: req.user.id }, orderBy: { createdAt: 'asc' } })).map(boardView))); }
  catch { res.status(503).json({ error: 'Panolar alınamadı' }); }
});
router.get('/board-chats', async (_req, res) => {
  try { res.json(await prisma.chat.findMany({ where: { isGroup: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })); }
  catch { res.status(503).json({ error: 'Gruplar alınamadı' }); }
});
router.post('/boards', async (req: any, res) => {
  const { chatId, title, password } = req.body || {};
  if (typeof password !== 'string' || password.length < 6 || password.length > 200) return res.status(400).json({ error: 'Pano şifresi en az 6 karakter olmalı' });
  try {
    const chat = typeof chatId === 'string' ? await prisma.chat.findUnique({ where: { id: chatId } }) : null;
    if (!chat || !chat.isGroup) return res.status(400).json({ error: 'Bir WhatsApp grubu seçin' });
    const name = typeof title === 'string' && title.trim() ? title.trim().slice(0, 100) : chat.name;
    const board = await systemDb().sharedBoard.create({ data: { slug: boardSlug(name), chatId, title: name, passwordHash: await bcrypt.hash(password, 10), ownerId: req.user.id } });
    res.status(201).json(await boardView(board));
  } catch { res.status(500).json({ error: 'Pano oluşturulamadı' }); }
});
router.patch('/boards/:id', async (req: any, res) => {
  const { password, isActive, title } = req.body || {};
  if (password !== undefined && (typeof password !== 'string' || password.length < 6 || password.length > 200)) return res.status(400).json({ error: 'Pano şifresi en az 6 karakter olmalı' });
  if (isActive !== undefined && typeof isActive !== 'boolean') return res.status(400).json({ error: 'Geçersiz durum' });
  if (title !== undefined && (typeof title !== 'string' || !title.trim())) return res.status(400).json({ error: 'Geçersiz başlık' });
  try {
    const existing = await systemDb().sharedBoard.findFirst({ where: { id: String(req.params.id), ownerId: req.user.id } });
    if (!existing) return res.status(404).json({ error: 'Pano bulunamadı' });
    const board = await systemDb().sharedBoard.update({ where: { id: existing.id }, data: {
      ...(password !== undefined ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(title !== undefined ? { title: title.trim().slice(0, 100) } : {}),
    } });
    res.json(await boardView(board));
  } catch { res.status(500).json({ error: 'Pano güncellenemedi' }); }
});

// Quiet hours and summary times, shared by every user's notifications.
router.get('/settings', async (_req, res) => {
  try { res.json(await getNotificationSettings()); } catch { res.status(503).json({ error: 'Ayarlar alınamadı' }); }
});
router.put('/settings', async (req, res) => {
  const settings = parseNotificationSettings(req.body);
  if (typeof settings === 'string') return res.status(400).json({ error: settings });
  try { await saveNotificationSettings(settings); res.json(settings); }
  catch { res.status(500).json({ error: 'Ayarlar kaydedilemedi' }); }
});

export default router;
