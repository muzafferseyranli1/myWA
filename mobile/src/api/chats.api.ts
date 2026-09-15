import { apiClient } from './client';
import { ChatItem, MessageItem, TaskItem, ContactItem } from '../lib/types';

export const chatsApi = {
  getChats: async (): Promise<ChatItem[]> => {
    const res = await apiClient.get('/api/chats');
    return res.data;
  },
  getMessages: async (chatId: string, page = 1, limit = 50): Promise<{ messages: MessageItem[]; total: number; totalPages: number }> => {
    const res = await apiClient.get(`/api/chats/${encodeURIComponent(chatId)}/messages`, {
      params: { page, limit },
    });
    return res.data;
  },
  getChatTasks: async (chatId: string): Promise<TaskItem[]> => {
    const res = await apiClient.get(`/api/chats/${encodeURIComponent(chatId)}/tasks`);
    return res.data;
  },
  getChatContacts: async (chatId: string): Promise<ContactItem[]> => {
    const res = await apiClient.get(`/api/chats/${encodeURIComponent(chatId)}/contacts`);
    return res.data;
  },
};
