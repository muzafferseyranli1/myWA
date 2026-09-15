import { apiClient } from './client';
import { AuthUser } from '../lib/types';

export const authApi = {
  login: async (username: string, password: string): Promise<{ token: string; user: AuthUser }> => {
    const res = await apiClient.post('/api/auth/login', { username, password });
    return res.data;
  },
  getMe: async (): Promise<AuthUser> => {
    const res = await apiClient.get('/api/auth/me');
    return res.data;
  },
};
