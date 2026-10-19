import test from 'node:test';
import assert from 'node:assert/strict';
import { istanbulWorkingDay, openCommitments } from '../src/lib/due-date';

test('promised dates count from today in Istanbul and skip weekends', () => {
  // Friday 23:30 in Istanbul is still Friday 20:30 UTC.
  assert.equal(istanbulWorkingDay(1, new Date('2026-10-23T20:30:00Z')), '2026-10-26');
  // Thursday 23:30 UTC is already Friday in Istanbul: +3 lands on Monday.
  assert.equal(istanbulWorkingDay(3, new Date('2026-10-22T23:30:00Z')), '2026-10-26');
  assert.equal(istanbulWorkingDay(7, new Date('2026-10-19T09:00:00Z')), '2026-10-26');
  assert.equal(istanbulWorkingDay(15, new Date('2026-10-19T09:00:00Z')), '2026-11-03');
});

test('cards list only open promises', () => {
  const task = { assignees: [
    { contact: { displayName: 'Ahmet' }, committedDueDate: '2026-10-25T00:00:00.000Z' },
    { contact: { displayName: 'Gamze' }, committedDueDate: '2026-10-27T00:00:00.000Z', completedAt: '2026-10-20T10:00:00.000Z' },
    { contact: { displayName: 'Ece' } },
  ] };
  assert.deepEqual(openCommitments(task), ['Ahmet · 25 Eki']);
});
