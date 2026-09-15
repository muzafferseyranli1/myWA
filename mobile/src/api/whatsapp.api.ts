import { apiClient } from './client';
import { WAStatus } from '../lib/types';

export const whatsappApi = {
  getStatus: async (): Promise<WAStatus> => {
    const res = await apiClient.get('/api/whatsapp/status');
    return res.data;
  },
  connect: async (force = false): Promise<{ success: boolean; status: string }> => {
    const res = await apiClient.post('/api/whatsapp/connect', { force });
    return res.data;
  },
  disconnect: async (): Promise<{ success: boolean; status: string }> => {
    const res = await apiClient.post('/api/whatsapp/disconnect');
    return res.data;
  },
};
