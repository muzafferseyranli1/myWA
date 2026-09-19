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

test('taskPayload with sourceMessageId sets replyTo and guarantees source message text', async () => {
  const { taskPayload } = await import('../server/services/delivery.service');
  const mockTask = {
    id: 'task-789',
    title: 'Kaynak Mesajlı Görev',
    description: 'Açıklama',
    priority: 'MEDIUM',
    dueDate: new Date('2026-10-01T00:00:00Z'),
    assignees: [],
    sourceMessageId: 'wamid.HBgLM...',
    sourceMessage: { body: 'Bu orijinal mesaj metnidir' }
  };
  const payload = taskPayload(mockTask, 'TASK_CREATED');
  assert.equal(payload.replyTo, 'wamid.HBgLM...');
  // Source message text is always included so that if WAHA drops reply_to (e.g. older message not in cache),
  // the source message is never lost.
  assert.ok(payload.text.includes('Kaynak mesaj: Bu orijinal mesaj metnidir'));
  assert.ok(payload.text.includes('📌 *Yeni Görev*'));
  assert.ok(payload.text.includes('Kaynak Mesajlı Görev'));
});

test('taskPayload without sourceMessageId appends plain text source message as fallback', async () => {
  const { taskPayload } = await import('../server/services/delivery.service');
  const mockTask = {
    id: 'task-999',
    title: 'Fallback Görev',
    priority: 'LOW',
    assignees: [],
    sourceMessageId: null,
    sourceMessage: { body: 'Orijinal mesaj içeriği' }
  };
  const payload = taskPayload(mockTask, 'TASK_CREATED');
  assert.equal(payload.replyTo, undefined);
  assert.ok(payload.text.includes('Kaynak mesaj: Orijinal mesaj içeriği'));
});

test('contactResolver generates LID mention tag and JID for contacts without phone number', async () => {
  const { contactResolver } = await import('../server/services/contact-resolver.service');
  const lidContact = {
    id: '107017851170822@lid',
    displayName: 'Gamze Vardar',
    pushName: 'Gamze Vardar',
    phoneNumber: null
  };
  const resolved = contactResolver.resolveAssigneeMention(lidContact);
  assert.equal(resolved.tag, '@107017851170822');
  assert.equal(resolved.jid, '107017851170822@lid');
});

test('contactResolver replaces raw mention numbers with display names in text', async () => {
  const { contactResolver } = await import('../server/services/contact-resolver.service');
  contactResolver.cacheContactName('152875250503933@lid', 'Ahmet Hocaoglu');
  contactResolver.cacheContactName('279044109123751@lid', 'Ömer Albayrak');
  const text = '@152875250503933 ve @279044109123751 görevlendirildi';
  const cleaned = contactResolver.formatMentionsToNamesSync(text);
  assert.equal(cleaned, '@Ahmet Hocaoglu ve @Ömer Albayrak görevlendirildi');
});

test('isStatusOrBroadcast correctly detects status updates and broadcast chats', async () => {
  const { isStatusOrBroadcast } = await import('../server/lib/reliability');
  assert.equal(isStatusOrBroadcast('status@broadcast'), true);
  assert.equal(isStatusOrBroadcast('12345@broadcast'), true);
  assert.equal(isStatusOrBroadcast('905332760534@c.us'), false);
  assert.equal(isStatusOrBroadcast('120363025@g.us'), false);
  assert.equal(isStatusOrBroadcast('107017851170822@lid'), false);
  assert.equal(isStatusOrBroadcast(undefined), false);
  assert.equal(isStatusOrBroadcast(null), false);
});

test('saveMessage rejects status and broadcast messages', async () => {
  const { messageService } = await import('../server/services/message.service');
  const result = await messageService.saveMessage({
    id: 'broadcast-msg-1',
    chatId: 'status@broadcast',
    body: 'Status update text',
    timestamp: new Date()
  });
  assert.equal(result, null);
});

test('contactResolver.resolveDirectChatId returns c.us for valid phone and resolves mapped LID', async () => {
  const { contactResolver } = await import('../server/services/contact-resolver.service');
  
  // 1. Valid phone number
  const c1 = { id: '905332760534@s.whatsapp.net', phoneNumber: '905332760534' };
  assert.equal(contactResolver.resolveDirectChatId(c1), '905332760534@c.us');

  // 2. Mapped LID
  contactResolver.addMapping('999999999999@lid', '905551234567@s.whatsapp.net');
  const c2 = { id: '999999999999@lid', phoneNumber: null };
  assert.equal(contactResolver.resolveDirectChatId(c2), '905551234567@c.us');

  // 3. Bare LID without phone or mapping returns null
  const c3 = { id: '888888888888@lid', phoneNumber: null };
  assert.equal(contactResolver.resolveDirectChatId(c3), null);
});

test('taskPayload formats TASK_CREATED_DM with group name and personal heading', async () => {
  const { taskPayload } = await import('../server/services/delivery.service');
  const mockTask = {
    id: 'task-dm-1',
    title: 'Özel Görev Testi',
    description: 'Açıklama',
    priority: 'HIGH',
    dueDate: new Date('2026-10-01T00:00:00Z'),
    chat: { name: 'Pazarlama Ekibi' },
    assignees: [{ contact: { id: '905332760534@s.whatsapp.net', displayName: 'Muzaffer', phoneNumber: '905332760534' } }],
    sourceMessage: { body: 'Orijinal mesaj' }
  };
  const payload = taskPayload(mockTask, 'TASK_CREATED_DM', { groupName: 'Pazarlama Ekibi' });
  assert.ok(payload.text.includes('📌 *Adınıza Yeni Görev Tanımlandı*'));
  assert.ok(payload.text.includes('Pazarlama Ekibi'));
  assert.ok(payload.text.includes('Özel Görev Testi'));
  assert.ok(payload.text.includes('Kaynak mesaj: Orijinal mesaj'));
  assert.deepEqual(payload.mentions, []);
  assert.equal(payload.linkPreview, false);
});

