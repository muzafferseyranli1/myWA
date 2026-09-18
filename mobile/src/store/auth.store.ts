import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { AuthUser } from '../lib/types';
import { authApi } from '../api/auth.api';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isLoading: true,
  error: null,

  checkAuth: async () => {
    set({ isLoading: true, error: null });
    try {
      const storedToken = await SecureStore.getItemAsync('auth_token');
      if (!storedToken) {
        set({ token: null, user: null, isLoading: false });
        return;
      }
      // Validate token with getMe
      const user = await authApi.getMe();
      set({ token: storedToken, user, isLoading: false });
    } catch (err: any) {
      if (err.response?.status === 401 || err.response?.status === 404) {
        await SecureStore.deleteItemAsync('auth_token');
        set({ token: null, user: null, isLoading: false });
      } else {
        const token = await SecureStore.getItemAsync('auth_token');
        set({ token, user: null, isLoading: false, error: 'Sunucuya erişilemiyor; oturum korunuyor.' });
      }
    }
  },

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const { token, user } = await authApi.login(username, password);
      await SecureStore.setItemAsync('auth_token', token);
      set({ token, user, isLoading: false });
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Giriş başarısız';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('auth_token');
    set({ token: null, user: null });
  },
}));
