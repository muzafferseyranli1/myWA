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
} from 'react-native';
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

  const handleStatusToggle = async (task: TaskItem) => {
    let nextStatus: TaskStatus = 'TODO';
    if (task.status === 'TODO') nextStatus = 'IN_PROGRESS';
    else if (task.status === 'IN_PROGRESS') nextStatus = 'DONE';
    else nextStatus = 'TODO';

    try {
      if (nextStatus === 'DONE') {
        Alert.alert(
          'Görevi Kapat',
          `"${task.title}" görevini tamamlamak istediğinize emin misiniz? WhatsApp grubuna kapanış bildirimi gönderilecektir.`,
          [
            { text: 'İptal', style: 'cancel' },
            {
              text: 'Tamamla',
              onPress: async () => {
                try { await tasksApi.updateTask(task.id, { status: 'DONE' }); await fetchTasks(); }
                catch (err: any) { Alert.alert('Hata', err.response?.data?.error || err.message); }
              },
            },
          ]
        );
      } else {
        await tasksApi.updateTask(task.id, { status: nextStatus });
        fetchTasks();
      }
    } catch (err: any) {
      Alert.alert('Hata', err.response?.data?.error || err.message || 'Durum güncellenemedi');
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
          <Text style={styles.statLabel}>Devam</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, { color: COLORS.whatsappGreen }]}>{stats.done}</Text>
          <Text style={styles.statLabel}>Bitti</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {(
          [
            { key: 'ALL', label: 'Tümü' },
            { key: 'TODO', label: 'Yapılacak' },
            { key: 'IN_PROGRESS', label: 'Devam Eden' },
            { key: 'DONE', label: 'Tamamlanan' },
          ] as const
        ).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
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
              <Text style={styles.emptyText}>Bu kategoride görev bulunmuyor</Text>
            </View>
          }
        />
      )}
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
});
