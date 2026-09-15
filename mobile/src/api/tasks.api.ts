import { apiClient } from './client';
import { TaskItem, CreateTaskRequest, UpdateTaskRequest, KanbanData } from '../lib/types';

export const tasksApi = {
  getKanban: async (filters?: { chatId?: string; assigneeId?: string; priority?: string }): Promise<KanbanData> => {
    const res = await apiClient.get('/api/tasks/kanban', { params: filters });
    return res.data;
  },
  getOverdue: async (): Promise<TaskItem[]> => {
    const res = await apiClient.get('/api/tasks/overdue');
    return res.data;
  },
  createTask: async (data: CreateTaskRequest): Promise<TaskItem> => {
    const res = await apiClient.post('/api/tasks', data);
    return res.data;
  },
  updateTask: async (id: string, data: UpdateTaskRequest): Promise<TaskItem> => {
    const res = await apiClient.patch(`/api/tasks/${id}`, data);
    return res.data;
  },
  deleteTask: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/tasks/${id}`);
  },
  closeTask: async (id: string, completionNote: string, completedBy?: string): Promise<TaskItem> => {
    const res = await apiClient.post(`/api/tasks/${id}/close`, { completionNote, completedBy });
    return res.data.task;
  },
  sendReminder: async (id: string): Promise<void> => {
    await apiClient.post(`/api/tasks/${id}/remind`);
  },
  sendBulkReminders: async (scope: 'overdue' | 'due_soon' | 'all_pending', chatId?: string): Promise<any> => {
    const res = await apiClient.post('/api/tasks/remind', { scope, chatId });
    return res.data;
  },
};
