import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_API_URL } from '../lib/constants';

let customBaseUrl: string | null = null;

export const setServerUrl = async (url: string) => {
  customBaseUrl = url.replace(/\/$/, '');
  await SecureStore.setItemAsync('server_url', customBaseUrl);
  apiClient.defaults.baseURL = customBaseUrl;
};

export const getServerUrl = async (): Promise<string> => {
  if (customBaseUrl) return customBaseUrl;
  try {
    const saved = await SecureStore.getItemAsync('server_url');
    if (saved) {
      customBaseUrl = saved;
      return saved;
    }
  } catch (e) {}
  return DEFAULT_API_URL;
};

export const apiClient = axios.create({
  baseURL: DEFAULT_API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to requests
apiClient.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.baseURL = await getServerUrl();
  } catch (err) {
    console.warn('Error reading token from SecureStore:', err);
  }
  return config;
});
