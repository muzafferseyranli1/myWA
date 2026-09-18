import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySignature, eventKey, parseMessage, istanbulDay, reminderDue, retryDelay, classifySendError } from '../server/lib/reliability';
import { moveTaskById } from '../src/lib/client-state';

test('filtered Kanban moves the dragged ID without mutating the rollback snapshot', () => {
  const columns = { TODO: { tasks: [{id:'hidden',status:'TODO'}, {id:'visible',status:'TODO'}] }, DONE: { tasks: [] } };
  const moved = moveTaskById(columns, 'visible', 'TODO', 'DONE', 0);
  assert.deepEqual(moved.TODO.tasks.map((t: any) => t.id), ['hidden']);
  assert.equal(moved.DONE.tasks[0].id, 'visible');
  assert.equal(columns.TODO.tasks[1].status, 'TODO');
});

test('HMAC verifies the original bytes and rejects altered bodies and missing keys', () => {
  const body = Buffer.from('{"event":"message.any"}');
  const signature = createHmac('sha512', 'test-key').update(body).digest('hex');
  assert.equal(verifySignature(body, signature, 'sha512', 'test-key'), true);
  assert.equal(verifySignature(Buffer.from('{}'), signature, 'sha512', 'test-key'), false);
  assert.equal(verifySignature(body, signature, 'sha256', 'test-key'), false);
  assert.equal(verifySignature(body, signature, 'sha512', ''), false);
});
test('legacy and current webhook deliveries share a message deduplication key', () => {
  const event = { session: 'default', payload: { id: 'message-1' } };
  assert.equal(eventKey({ ...event, event: 'message' }), eventKey({ ...event, event: 'message.any' }));
  assert.throws(() => eventKey({ ...event, payload: {} , event: 'message' }));
});
test('outgoing messages use their destination and quoted replies survive normalization', () => {
  const message = parseMessage({ id: 'm1', fromMe: true, from: 'me@c.us', to: 'group@g.us', timestamp: 1234567890, replyTo: { body: 'source', participant: '123@c.us' } });
  assert.equal(message.chatId, 'group@g.us');
  assert.equal(message.isGroup, true);
  assert.equal(message.quotedText, 'source');
});
test('Istanbul scheduler catches up only the current local day after 09:00', () => {
  assert.equal(istanbulDay(new Date('2026-09-17T22:00:00Z')), '2026-09-18');
  assert.equal(reminderDue(new Date('2026-09-18T05:59:59Z')), false);
  assert.equal(reminderDue(new Date('2026-09-18T06:00:00Z')), true);
});
test('ambiguous delivery never receives automatic retry classification', () => {
  assert.equal(classifySendError({ name: 'TimeoutError' }), 'UNKNOWN');
  assert.equal(classifySendError({ status: 500 }), 'UNKNOWN');
  assert.equal(classifySendError({ status: 429 }), 'RETRY');
  assert.equal(classifySendError({ status: 401 }), 'FAILED');
  assert.equal(classifySendError({ cause: { code: 'ECONNREFUSED' } }), 'RETRY');
  assert.ok(retryDelay(9) > retryDelay(1));
});

test('taskPayload formats TASK_COMPLETED without task link and includes note', async () => {
  const { taskPayload } = await import('../server/services/delivery.service');
  const mockTask = {
    id: 'task-123',
    title: 'Test Görevi',
    description: 'Test açıklaması',
    priority: 'HIGH',
    dueDate: new Date('2026-09-30T00:00:00Z'),
    assignees: [],
    completionNote: 'Tamamlandı notu',
    completedBy: 'Muzaffer'
  };
  const payload = taskPayload(mockTask, 'TASK_COMPLETED');
  assert.ok(payload.text.includes('✅ *Görev Tamamlandı!*'));
  assert.ok(payload.text.includes('Tamamlandı notu'));
  assert.ok(payload.text.includes('Muzaffer'));
  // KURAL: Görev tamamlandı bildirimine link konmaz
  assert.ok(!payload.text.includes('/t/task-123'));
  assert.ok(!payload.text.includes('Görevi incele'));
});

test('taskPayload formats TASK_REACTIVATED with reason, actor, and task link', async () => {
  const { taskPayload } = await import('../server/services/delivery.service');
  const mockTask = {
    id: 'task-456',
    title: 'Aktif Görev',
    priority: 'MEDIUM',
    dueDate: new Date('2026-10-05T00:00:00Z'),
    assignees: []
  };
  const payload = taskPayload(mockTask, 'TASK_REACTIVATED', {
    reason: 'Müşteri revize istedi',
    by: 'Admin'
  });
  assert.ok(payload.text.includes('🔄 *Görev Tekrar Aktifleştirildi!*'));
  assert.ok(payload.text.includes('Aktifleştirme Nedeni:'));
  assert.ok(payload.text.includes('Müşteri revize istedi'));
  assert.ok(payload.text.includes('Admin'));
  assert.ok(payload.text.includes('/t/task-456'));
});
