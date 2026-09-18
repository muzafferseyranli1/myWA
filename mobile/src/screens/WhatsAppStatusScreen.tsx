import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Wifi, WifiOff, QrCode, RefreshCw, LogOut, User } from 'lucide-react-native';
import { Header } from '../components/Header';
import { whatsappApi } from '../api/whatsapp.api';
import { useAuthStore } from '../store/auth.store';
import { WAStatus } from '../lib/types';
import { COLORS } from '../lib/constants';
import { useSocket } from '../hooks/useSocket';

export const WhatsAppStatusScreen = () => {
  const [status, setStatus] = useState<WAStatus>({ status: 'disconnected', qr: null });
  const [loading, setLoading] = useState(false);

  const { user, logout } = useAuthStore();

  const fetchStatus = async () => {
    try {
      const data = await whatsappApi.getStatus();
      setStatus(data);
    } catch (err) {
      console.error('Failed to get WA status:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useSocket({
    onReconnect: () => { void fetchStatus(); },
    onStatus: (newStatus) => {
      setStatus(newStatus);
    },
  });

  const handleConnect = async (force = false) => {
    setLoading(true);
    try {
      await whatsappApi.connect(force);
      fetchStatus();
    } catch (err: any) {
      Alert.alert('Hata', err.response?.data?.error || err.message || 'Bağlantı başlatılamadı');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await whatsappApi.disconnect();
      fetchStatus();
    } catch (err: any) {
      Alert.alert('Hata', err.response?.data?.error || err.message || 'Bağlantı kesilemedi');
    } finally {
      setLoading(false);
    }
  };

  const isConnected = status.status === 'connected';

  return (
    <View style={styles.container}>
      <Header title="WhatsApp & Ayarlar" />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status Card */}
        <View style={styles.card}>
          <View style={styles.statusHeader}>
            <View
              style={[
                styles.statusIconCircle,
                isConnected ? styles.statusCircleOnline : styles.statusCircleOffline,
              ]}
            >
              {isConnected ? (
                <Wifi size={24} color="#fff" />
              ) : status.status === 'qr' ? (
                <QrCode size={24} color="#fff" />
              ) : (
                <WifiOff size={24} color="#fff" />
              )}
            </View>

            <View style={styles.statusTextCol}>
              <Text style={styles.statusTitle}>
                {isConnected
                  ? 'WhatsApp Bağlı'
                  : status.status === 'qr'
                  ? 'QR Kod Bekleniyor'
                  : status.status === 'connecting'
                  ? 'Bağlanıyor...'
                  : 'Bağlantı Yok'}
              </Text>
              <Text style={styles.statusSub}>
                {isConnected
                  ? 'Mesajlar ve görev bildirimleri aktif senkronize ediliyor.'
                  : 'Mesajları senkronize etmek için WhatsApp Web ile bağlayın.'}
              </Text>
            </View>
          </View>

          {/* QR Code image if available */}
          {status.status === 'qr' && status.qr && (
            <View style={styles.qrContainer}>
              <Text style={styles.qrInstruction}>
                WhatsApp uygulamanızda "Bağlı Cihazlar" bölümünden bu QR kodu okutun:
              </Text>
              <Image source={{ uri: status.qr }} style={styles.qrImage} resizeMode="contain" />
            </View>
          )}

          {/* Action Buttons */}
          {user?.role === 'ADMIN' && <View style={styles.actionsRow}>
            {!isConnected ? (
              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                onPress={() => handleConnect(false)}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <RefreshCw size={16} color="#fff" />
                    <Text style={styles.btnText}>Bağlantıyı Başlat</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.dangerBtn, loading && styles.btnDisabled]}
                onPress={handleDisconnect}
                disabled={loading}
              >
                <WifiOff size={16} color="#fff" />
                <Text style={styles.btnText}>Bağlantıyı Kes</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => handleConnect(true)}
              disabled={loading}
            >
              <Text style={styles.secondaryBtnText}>Bağlantıyı kontrol et</Text>
            </TouchableOpacity>
          </View>}
        </View>

        {/* User Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Kullanıcı Bilgileri</Text>
          <View style={styles.userRow}>
            <View style={styles.userAvatar}>
              <User size={20} color="#fff" />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user?.displayName || user?.username || 'Admin'}</Text>
              <Text style={styles.userRole}>Yetki: {user?.role || 'Yönetici'}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.8}>
            <LogOut size={16} color={COLORS.danger} />
            <Text style={styles.logoutText}>Çıkış Yap</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDark,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statusIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCircleOnline: {
    backgroundColor: COLORS.whatsappGreen,
  },
  statusCircleOffline: {
    backgroundColor: COLORS.danger,
  },
  statusTextCol: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statusSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  qrContainer: {
    alignItems: 'center',
    marginVertical: 18,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  qrInstruction: {
    color: '#000',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: '600',
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.whatsappGreen,
    paddingVertical: 11,
    borderRadius: 8,
  },
  dangerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.danger,
    paddingVertical: 11,
    borderRadius: 8,
  },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: COLORS.bgSurface,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  btnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  userRole: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  logoutText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '700',
  },
});
