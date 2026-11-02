import { Request, Response, NextFunction, Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { SharedBoard } from '@prisma/client';
import { systemDb } from '../lib/tenant';
import { boardService } from '../services/board.service';

/**
 * Shared group boards (see board.service). Opened without a MyWA account: the
 * board password yields a token that grants this one board and nothing else.
 */
const router = Router();
const TOKEN_TTL = '30d';

const attempts = new Map<string, { start: number; count: number }>();
function tooManyAttempts(key: string) {
  const now = Date.now();
  for (const [k, v] of attempts) if (now - v.start > 15 * 60_000) attempts.delete(k);
  const entry = attempts.get(key) || { start: now, count: 0 };
  entry.count++;
  attempts.set(key, entry);
  return entry.count > 10;
}

async function findBoard(slug: string) {
  return typeof slug === 'string' && slug.length <= 80 ? systemDb().sharedBoard.findFirst({ where: { slug, isActive: true } }) : null;
}

/** Resolves the board from its token; the token must name this very board. */
async function requireBoard(req: Request, res: Response, next: NextFunction) {
  const board = await findBoard(String(req.params.slug)).catch(() => null);
  if (!board) return res.status(404).json({ error: 'Pano bulunamadı' });
  const header = req.headers.authorization;
  try {
    const claims = jwt.verify(header?.startsWith('Bearer ') ? header.slice(7) : '', process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    // Changing the board password invalidates every token issued before it.
    if (claims.purpose !== 'board' || claims.board !== board.id || claims.pw !== board.passwordHash.slice(-12) || typeof claims.name !== 'string') throw new Error();
    (req as any).board = board;
    (req as any).editor = claims.name;
    next();
  } catch {
    res.status(401).json({ error: 'Pano oturumu geçersiz; yeniden giriş yapın' });
  }
}

router.get('/:slug', async (req, res) => {
  const board = await findBoard(String(req.params.slug)).catch(() => null);
  if (!board) return res.status(404).json({ error: 'Pano bulunamadı' });
  res.json({ title: board.title });
});

router.post('/:slug/login', async (req, res) => {
  const board = await findBoard(String(req.params.slug)).catch(() => null);
  if (!board) return res.status(404).json({ error: 'Pano bulunamadı' });
  // Behind Traefik req.ip is the proxy; the last X-Forwarded-For entry is the address Traefik saw.
  const client = String(req.headers['x-forwarded-for'] || req.ip || '').split(',').pop()!.trim();
  if (tooManyAttempts(`${board.id}:${client}`)) return res.status(429).json({ error: 'Çok fazla deneme; 15 dakika sonra tekrar deneyin' });
  const { password, name } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 60) return res.status(400).json({ error: 'Adınızı yazın' });
  if (typeof password !== 'string' || !(await bcrypt.compare(password, board.passwordHash))) return res.status(401).json({ error: 'Şifre hatalı' });
  const token = jwt.sign({ purpose: 'board', board: board.id, pw: board.passwordHash.slice(-12), name: name.trim() }, process.env.JWT_SECRET!, { expiresIn: TOKEN_TTL });
  res.json({ token, title: board.title, name: name.trim() });
});

const board = (req: Request) => (req as any).board as SharedBoard;
const editor = (req: Request) => (req as any).editor as string;
const fail = (res: Response, error: any) => {
  const message = String(error?.message || 'İşlem başarısız');
  res.status(/bulunamadı|Geçersiz|seçilmelidir|zorunlu/.test(message) ? 400 : 500).json({ error: message });
};

router.get('/:slug/tasks', requireBoard, async (req, res) => {
  try { res.json(await boardService.listTasks(board(req))); } catch (e) { fail(res, e); }
});
router.get('/:slug/members', requireBoard, async (req, res) => {
  try { res.json(await boardService.members(board(req))); } catch (e) { fail(res, e); }
});
router.post('/:slug/tasks', requireBoard, async (req, res) => {
  const { title, description, assigneeIds, priority, dueDate } = req.body || {};
  if (typeof title !== 'string' || !title.trim() || title.length > 500) return res.status(400).json({ error: 'Görev başlığı zorunlu' });
  if (assigneeIds !== undefined && (!Array.isArray(assigneeIds) || assigneeIds.some((id: any) => typeof id !== 'string'))) return res.status(400).json({ error: 'Geçersiz görevliler' });
  try { res.status(201).json(await boardService.createTask(board(req), editor(req), { title: title.trim(), description, assigneeIds, priority, dueDate })); }
  catch (e) { fail(res, e); }
});
router.patch('/:slug/tasks/:ref', requireBoard, async (req, res) => {
  const { title, assigneeIds, priority, dueDate, status } = req.body || {};
  if (title !== undefined && (typeof title !== 'string' || !title.trim() || title.length > 500)) return res.status(400).json({ error: 'Görev başlığı zorunlu' });
  if (assigneeIds !== undefined && (!Array.isArray(assigneeIds) || assigneeIds.some((id: any) => typeof id !== 'string'))) return res.status(400).json({ error: 'Geçersiz görevliler' });
  if (dueDate !== undefined && dueDate !== null && !Number.isFinite(new Date(dueDate).getTime())) return res.status(400).json({ error: 'Geçersiz tarih' });
  try { res.json(await boardService.updateTask(board(req), editor(req), String(req.params.ref), { title: title?.trim(), assigneeIds, priority, dueDate, status })); }
  catch (e) { fail(res, e); }
});
router.get('/:slug/export', requireBoard, async (req, res) => {
  try {
    const file = await boardService.exportXlsx(board(req));
    const name = `${board(req).title.replace(/[^\w\- ]+/g, '').trim() || 'pano'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(file);
  } catch (e) { fail(res, e); }
});

export default router;
