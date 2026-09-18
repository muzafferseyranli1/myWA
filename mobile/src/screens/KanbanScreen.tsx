import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { CheckCircle2, AlertCircle, X, RotateCcw } from 'lucide-react-native';
import { Header } from '../components/Header';
import { TaskCard } from '../components/TaskCard';
import { tasksApi } from '../api/tasks.api';
import { TaskItem, TaskStatus } from '../lib/types';
import { COLORS } from '../lib/constants';
import { useSocket } from '../hooks/useSocket';

export const KanbanScreen = () => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [activeTab, setActiveTab] = useState<'ALL' | TaskStatus>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Completion modal state
  const [completeTask, setCompleteTask] = useState<TaskItem | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reactivation modal state
  const [reactivateTask, setReactivateTask] = useState<TaskItem | null>(null);
  const [reactivateReason, setReactivateReason] = useState('');
  const [reactivateDate, setReactivateDate] = useState('');

  const fetchTasks = useCallback(async () => {
    try {
      const data = await tasksApi.getKanban();
      setTasks(data.tasks);
    } catch (err) {
      console.error('Fetch kanban error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useSocket({
    onReconnect: () => { void fetchTasks(); },
    onNotificationUpdated: () => { void fetchTasks(); },
    onTaskCreated: () => fetchTasks(),
    onTaskUpdated: () => fetchTasks(),
    onTaskDeleted: () => fetchTasks(),
  });

  const onRefresh = () => {
    setRefreshing(true);
    fetchTasks();
  };

  const handleStatusToggle = (task: TaskItem) => {
    // If completed, prompt for reactivation
    if (task.status === 'DONE') {
      setReactivateTask(task);
      setReactivateReason('');
      setReactivateDate(task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '');
      return;
    }

    // If in progress, moving to DONE -> prompt for completion note
    if (task.status === 'IN_PROGRESS') {
      setCompleteTask(task);
      setCompletionNote('');
      return;
    }

    // If TODO -> move to IN_PROGRESS
    void (async () => {
      try {
        await tasksApi.updateTask(task.id, { status: 'IN_PROGRESS' });
        fetchTasks();
      } catch (err: any) {
        Alert.alert('Hata', err.response?.data?.error || err.message || 'Durum güncellenemedi');
      }
    })();
  };

  const confirmCompletion = async () => {
    if (!completeTask) return;
    setIsSubmitting(true);
    try {
      await tasksApi.updateTask(completeTask.id, {
        status: 'DONE',
        completionNote: completionNote.trim() || 'Admin tarafından tamamlandı',
      });
      setCompleteTask(null);
      fetchTasks();
    } catch (err: any) {
      Alert.alert('Hata', err.response?.data?.error || err.message || 'Görev tamamlanamadı');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmReactivation = async () => {
    if (!reactivateTask) return;
    if (!reactivateReason.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen yeniden aktifleştirme nedenini belirtiniz.');
      return;
    }
    setIsSubmitting(true);
    try {
      await tasksApi.updateTask(reactivateTask.id, {
        status: 'TODO',
        reactivateReason: reactivateReason.trim(),
        dueDate: reactivateDate ? new Date(reactivateDate).toISOString() : null,
      });
      setReactivateTask(null);
      fetchTasks();
    } catch (err: any) {
      Alert.alert('Hata', err.response?.data?.error || err.message || 'Görev aktifleştirilemedi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemind = async (task: TaskItem) => {
    try {
      await tasksApi.sendReminder(task.id);
      Alert.alert('Kaydedildi', `"${task.title}" için hatırlatma kuyruğa eklendi.`);
    } catch (err: any) {
      Alert.alert('Hata', err.response?.data?.error || err.message || 'Hatırlatma gönderilemedi');
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (activeTab === 'ALL') return true;
    return t.status === activeTab;
  });

  const stats = {
    total: tasks.length,
    todo: tasks.filter((t) => t.status === 'TODO').length,
    inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    done: tasks.filter((t) => t.status === 'DONE').length,
  };

  return (
    <View style={styles.container}>
      <Header title="Görevler & Kanban" />

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{stats.total}</Text>
          <Text style={styles.statLabel}>Toplam</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, { color: COLORS.accentBlue }]}>{stats.todo}</Text>
          <Text style={styles.statLabel}>Yapılacak</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, { color: COLORS.warning }]}>{stats.inProgress}</Text>
          <Text style={styles.statLabel}>Devam Eden</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, { color: COLORS.whatsappGreen }]}>{stats.done}</Text>
          <Text style={styles.statLabel}>Tamamlandı</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {(['ALL', 'TODO', 'IN_PROGRESS', 'DONE'] as const).map((tab) => {
          const label =
            tab === 'ALL'
              ? 'Tümü'
              : tab === 'TODO'
              ? 'Yapılacak'
              : tab === 'IN_PROGRESS'
              ? 'Devam'
              : 'Tamam';
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.whatsappGreen} />
        </View>
      ) : (
        <FlatList
          data={filteredTasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TaskCard
              task={item}
              onStatusChange={handleStatusToggle}
              onRemind={handleRemind}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.whatsappGreen}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Bu kategoride görev bulunamadı</Text>
            </View>
          }
        />
      )}

      {/* Görevi Tamamla Modalı */}
      <Modal visible={!!completeTask} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <CheckCircle2 size={20} color={COLORS.whatsappGreen} />
                <Text style={styles.modalTitle}>Görevi Tamamla</Text>
              </View>
              <TouchableOpacity onPress={() => setCompleteTask(null)}>
                <X size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle} numberOfLines={2}>
              &quot;{completeTask?.title}&quot;
            </Text>

            <Text style={styles.inputLabel}>Görev Bitirme Notu</Text>
            <TextInput
              style={styles.modalInput}
              multiline
              numberOfLines={3}
              placeholder="Neler yapıldı? (Örn: Entegrasyon tamamlandı...)"
              placeholderTextColor={COLORS.textMuted}
              value={completionNote}
              onChangeText={setCompletionNote}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCompleteTask(null)}>
                <Text style={styles.cancelBtnText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={confirmCompletion} disabled={isSubmitting}>
                <Text style={styles.confirmBtnText}>{isSubmitting ? 'Kaydediliyor...' : 'Tamamla'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Görevi Yeniden Aktifleştir Modalı */}
      <Modal visible={!!reactivateTask} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <RotateCcw size={20} color={COLORS.warning} />
                <Text style={[styles.modalTitle, { color: COLORS.warning }]}>Tekrar Aktifleştir</Text>
              </View>
              <TouchableOpacity onPress={() => setReactivateTask(null)}>
                <X size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle} numberOfLines={2}>
              &quot;{reactivateTask?.title}&quot;
            </Text>

            <Text style={styles.inputLabel}>Aktifleştirme Nedeni * (Zorunlu)</Text>
            <TextInput
              style={styles.modalInput}
              multiline
              numberOfLines={3}
              placeholder="Neden tekrar aktifleştiriliyor? (WhatsApp'a iletilecektir)"
              placeholderTextColor={COLORS.textMuted}
              value={reactivateReason}
              onChangeText={setReactivateReason}
            />

            <Text style={[styles.inputLabel, { marginTop: 10 }]}>Yeni Bitiş Tarihi (YYYY-AA-GG)</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 40 }]}
              placeholder="2026-10-05"
              placeholderTextColor={COLORS.textMuted}
              value={reactivateDate}
              onChangeText={setReactivateDate}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setReactivateTask(null)}>
                <Text style={styles.cancelBtnText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: COLORS.warning }]}
                onPress={confirmReactivation}
                disabled={isSubmitting}
              >
                <Text style={styles.confirmBtnText}>{isSubmitting ? 'Aktifleştiriliyor...' : 'Aktifleştir'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDark,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.bgCard,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statNum: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: COLORS.bgSurface,
  },
  tabBtnActive: {
    backgroundColor: COLORS.whatsappGreen,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: '#fff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 20,
  },
  emptyContainer: {
    paddingTop: 50,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: COLORS.bgSurface,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
    textAlignVertical: 'top',
    minHeight: 65,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: COLORS.bgSurface,
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: COLORS.whatsappGreen,
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
