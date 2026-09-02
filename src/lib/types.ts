// ─── Shared TypeScript Types ─────────────────────────

// Task status & priority enums (mirrors Prisma)
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'STICKER' | 'SYSTEM';

// ─── API Response Types ──────────────────────────────

export interface ChatItem {
  id: string;
  name: string;
  isGroup: boolean;
  avatarUrl: string | null;
  updatedAt: string;
  lastMessage?: {
    body: string | null;
    timestamp: string;
    senderName?: string;
  };
  unreadCount?: number;
  taskCount?: number;
}

export interface ContactItem {
  id: string;
  phoneNumber: string;
  pushName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface MessageItem {
  id: string;
  chatId: string;
  senderId: string | null;
  body: string | null;
  messageType: MessageType;
  mediaUrl: string | null;
  mediaName: string | null;
  mediaMime: string | null;
  isFromMe: boolean;
  timestamp: string;
  sender?: ContactItem | null;
  task?: TaskItem | null;
}

export interface TaskItem {
  id: string;
  chatId: string;
  sourceMessageId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  chat?: ChatItem;
  creator?: ContactItem | null;
  assignees: TaskAssigneeItem[];
}

export interface TaskAssigneeItem {
  id: string;
  taskId: string;
  contactId: string;
  contact: ContactItem;
}

export interface TaskReminderItem {
  id: string;
  taskId: string;
  sentAt: string;
  messageContent: string;
}

// ─── API Request Types ───────────────────────────────

export interface CreateTaskRequest {
  chatId: string;
  sourceMessageId?: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string;
  assigneeIds?: string[];
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  assigneeIds?: string[];
}

export interface SendReminderRequest {
  taskIds?: string[];
  scope?: 'overdue' | 'due_soon' | 'all_pending' | 'selected';
  chatId?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };
}

// ─── Kanban Types ────────────────────────────────────

export interface KanbanColumn {
  id: TaskStatus;
  title: string;
  tasks: TaskItem[];
}

export interface KanbanData {
  columns: KanbanColumn[];
  stats: {
    total: number;
    todo: number;
    inProgress: number;
    done: number;
    overdue: number;
  };
}

// ─── WhatsApp Connection Types ───────────────────────

export type WAConnectionStatus = 'disconnected' | 'connecting' | 'qr' | 'authenticated' | 'ready';

export interface WAStatusEvent {
  status: WAConnectionStatus;
  qrCode?: string;
  message?: string;
}

// ─── Socket.io Event Types ───────────────────────────

export interface ServerToClientEvents {
  new_message: (message: MessageItem) => void;
  task_created: (task: TaskItem) => void;
  task_updated: (task: TaskItem) => void;
  task_deleted: (taskId: string) => void;
  message_task_linked: (data: { messageId: string; task: TaskItem }) => void;
  whatsapp_status: (status: WAStatusEvent) => void;
  whatsapp_qr: (qrDataUrl: string) => void;
  reminder_sent: (data: { count: number; tasks: string[] }) => void;
}

export interface ClientToServerEvents {
  join_chat: (chatId: string) => void;
  leave_chat: (chatId: string) => void;
  send_message: (data: { chatId: string; body: string }) => void;
}
