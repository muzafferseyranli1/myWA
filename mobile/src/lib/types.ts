// ─── Shared Types for myWA Mobile ─────────────────────────

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'STICKER' | 'SYSTEM' | 'REACTION';

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
  lidId?: string | null;
  phoneNumber?: string;
  pushName?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  mappedJid?: string | null;
  role?: string;
}

export interface MessageItem {
  id: string;
  chatId: string;
  senderId: string | null;
  body: string | null;
  quotedText?: string | null;
  quotedSender?: string | null;
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
  completionNote?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
  createdAt: string;
  updatedAt: string;
  chat?: ChatItem;
  creator?: ContactItem | null;
  assignees: TaskAssigneeItem[];
  sourceMessage?: MessageItem | null;
}

export interface TaskAssigneeItem {
  id: string;
  taskId: string;
  contactId: string;
  contact: ContactItem;
}

export interface CreateTaskRequest {
  chatId: string;
  sourceMessageId?: string;
  sourceMessageBody?: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string;
  assigneeIds?: string[];
  notifyOnCreate?: boolean;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  assigneeIds?: string[];
}

export interface KanbanStats {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  overdue: number;
}

export interface KanbanData {
  tasks: TaskItem[];
  stats: KanbanStats;
}

export interface WAStatus {
  status: 'disconnected' | 'connecting' | 'qr' | 'connected';
  qr: string | null;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
}
