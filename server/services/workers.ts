import { prisma } from '../lib/prisma';
import { processInbox, processOutbox, runScheduler } from './delivery.service';
import { wahaService } from './waha.service';
import { contactResolver } from './contact-resolver.service';
import { syncHistory } from './sync.service';
let stopped = true;
let started = false;
const running = new Set<Promise<void>>();
const timers = new Set<NodeJS.Timeout>();
const beats = new Map<string, number>();
function loop(name: string, interval: number, action: () => Promise<unknown>, maxInterval = interval) {
  let currentDelay = interval;
  const run = () => {
    if (stopped) return;
    const promise = (async () => {
      try {
        await action();
        beats.set(name, Date.now());
        currentDelay = interval;
      } catch (error: any) {
        currentDelay = Math.min(maxInterval, Math.max(interval, currentDelay * 2));
        console.error(`[worker:${name}]`, error.code || error.name || error.message || 'error', `(next in ${currentDelay}ms)`);
      } finally {
        if (!stopped) {
          const timer = setTimeout(() => { timers.delete(timer); run(); }, currentDelay);
          timers.add(timer);
        }
      }
    })();
    running.add(promise);
    void promise.finally(() => running.delete(promise));
  };
  run();
}
export async function startWorkers() {
  await prisma.$queryRaw`SELECT id FROM incoming_events LIMIT 1`;
  await prisma.$queryRaw`SELECT id FROM outgoing_jobs LIMIT 1`;
  await prisma.$queryRaw`SELECT day FROM scheduler_runs LIMIT 1`;
  await prisma.$queryRaw`SELECT session FROM connection_preferences LIMIT 1`;
  await prisma.$queryRaw`SELECT ack,preview FROM messages LIMIT 1`;
  await prisma.$queryRaw`SELECT session FROM sync_states LIMIT 1`;
  await prisma.$queryRaw`SELECT user_id FROM message_reads LIMIT 1`;
  await contactResolver.loadFromDatabase();
  stopped = false; started = true;
  loop('inbox', 250, processInbox);
  loop('outbox', 1000, processOutbox);
  loop('scheduler', 30000, () => runScheduler());
  loop('waha', 15000, () => wahaService.reconcile());
  loop('history', 3000, syncHistory, 60000);
}
export function workersReady() {
  return started && !stopped && ['inbox', 'outbox', 'scheduler'].every(name => Date.now() - (beats.get(name) || 0) < 120000);
}
export async function stopWorkers() {
  stopped = true;
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  await Promise.allSettled([...running]);
}
