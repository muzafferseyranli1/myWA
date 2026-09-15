import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { MessageSquare, Server, Lock, User, Eye, EyeOff } from 'lucide-react-native';
import { useAuthStore } from '../store/auth.store';
import { getServerUrl, setServerUrl } from '../api/client';
import { COLORS } from '../lib/constants';

export const LoginScreen = () => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [serverAddress, setServerAddress] = useState('');
  const [showServerConfig, setShowServerConfig] = useState(false);

  const { login, isLoading, error } = useAuthStore();

  useEffect(() => {
    getServerUrl().then(setServerAddress);
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) return;
    if (serverAddress.trim()) {
      await setServerUrl(serverAddress.trim());
    }
    await login(username.trim(), password.trim());
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Logo and branding */}
        <View style={styles.brandContainer}>
          <View style={styles.iconCircle}>
            <MessageSquare size={42} color="#fff" />
          </View>
          <Text style={styles.brandTitle}>myWA</Text>
          <Text style={styles.brandSubtitle}>WhatsApp Görev & İletişim Platformu</Text>
        </View>

        {/* Form Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Giriş Yap</Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Username Input */}
          <Text style={styles.inputLabel}>Kullanıcı Adı</Text>
          <View style={styles.inputRow}>
            <User size={18} color={COLORS.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="Kullanıcı adınızı girin"
              placeholderTextColor={COLORS.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password Input */}
          <Text style={styles.inputLabel}>Şifre</Text>
          <View style={styles.inputRow}>
            <Lock size={18} color={COLORS.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="Şifrenizi girin"
              placeholderTextColor={COLORS.textMuted}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeIcon}
            >
              {showPassword ? (
                <EyeOff size={18} color={COLORS.textSecondary} />
              ) : (
                <Eye size={18} color={COLORS.textSecondary} />
              )}
            </TouchableOpacity>
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginBtn, (!username || !password || isLoading) && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={isLoading || !username || !password}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginBtnText}>Giriş Yap</Text>
            )}
          </TouchableOpacity>

          {/* Server Config Toggle */}
          <TouchableOpacity
            style={styles.configToggle}
            onPress={() => setShowServerConfig(!showServerConfig)}
          >
            <Server size={14} color={COLORS.textSecondary} />
            <Text style={styles.configToggleText}>
              {showServerConfig ? 'Sunucu ayarını gizle' : 'Sunucu URL ayarı'}
            </Text>
          </TouchableOpacity>

          {showServerConfig && (
            <View style={styles.configBox}>
              <Text style={styles.configLabel}>API Sunucu Adresi</Text>
              <TextInput
                style={styles.configInput}
                value={serverAddress}
                onChangeText={setServerAddress}
                placeholder="http://188.132.198.144:3060"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
              />
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDark,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.whatsappGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    elevation: 8,
    shadowColor: COLORS.whatsappGreen,
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  brandSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    height: 48,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  eyeIcon: {
    padding: 8,
  },
  loginBtn: {
    backgroundColor: COLORS.whatsappGreen,
    borderRadius: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  configToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
  },
  configToggleText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  configBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: COLORS.bgSurface,
    borderRadius: 8,
  },
  configLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  configInput: {
    height: 38,
    backgroundColor: COLORS.bgInput,
    borderRadius: 6,
    paddingHorizontal: 8,
    color: COLORS.textPrimary,
    fontSize: 12,
  },
});
