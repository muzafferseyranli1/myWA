import type { WAStatus, MessageItem, TaskItem, NotificationItem } from './types';
export type Handlers = {
  onMessageUpdated?: (message:Partial<MessageItem>)=>void;
  onStatus?: (status: WAStatus) => void;
  onNewMessage?: (msg: MessageItem) => void;
  onChatUpdated?: (chatId?: string) => void;
  onTaskCreated?: (task: TaskItem) => void;
  onTaskUpdated?: (task: TaskItem) => void;
  onTaskDeleted?: (id: string) => void;
  onNotificationUpdated?: (job: NotificationItem) => void;
  onReconnect?: () => void;
};
type Ref = { current: Handlers | undefined };
type Socket = { emit: (event: string, id: string) => unknown };
export class SocketRegistry {
  private subscribers = new Set<Ref>();
  private rooms = new Map<string, number>();
  subscribe(ref: Ref) { this.subscribers.add(ref); return () => { this.subscribers.delete(ref); }; }
  dispatch(key: keyof Handlers, payload?: unknown) {
    for (const ref of this.subscribers) (ref.current?.[key] as ((value: unknown) => void) | undefined)?.(payload);
  }
  join(id: string, socket?: Socket | null) { this.rooms.set(id, (this.rooms.get(id) || 0) + 1); socket?.emit('join_chat', id); }
  leave(id: string, socket?: Socket | null) {
    const count = (this.rooms.get(id) || 1) - 1;
    if (count <= 0) { this.rooms.delete(id); socket?.emit('leave_chat', id); } else this.rooms.set(id, count);
  }
  reconnect(socket: Socket) { for (const id of this.rooms.keys()) socket.emit('join_chat', id); this.dispatch('onReconnect'); }
  clearRooms() { this.rooms.clear(); }
}
