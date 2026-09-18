import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  AppState,
  Modal,
  ScrollView,
} from 'react-native';
import { useRoute, useNavigation, useIsFocused } from '@react-navigation/native';
import { ArrowLeft, Send, Plus, CheckSquare, X, CheckCircle2, RotateCcw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import { MessageBubble } from '../components/MessageBubble';
import { CreateTaskModal } from '../components/CreateTaskModal';
import { TaskCard } from '../components/TaskCard';
import { chatsApi } from '../api/chats.api';
import { apiClient } from '../api/client';
import { tasksApi } from '../api/tasks.api';
import { ChatItem, MessageItem, ContactItem, CreateTaskRequest, TaskItem, TaskStatus } from '../lib/types';
import { COLORS } from '../lib/constants';
import { useSocket } from '../hooks/useSocket';

export const ChatWindowScreen = () => {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused(), focusedRef = useRef(false); focusedRef.current = focused;
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const chat: ChatItem = route.params?.chat;

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [selectedMessageForTask, setSelectedMessageForTask] = useState<MessageItem | null>(null);

  // Chat tasks drawer & filter
  const [chatTasks, setChatTasks] = useState<TaskItem[]>([]);
  const [tasksDrawerVisible, setTasksDrawerVisible] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'ALL' | TaskStatus>('ALL');

  // Task status transition modals
  const [completeTask, setCompleteTask] = useState<TaskItem | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [reactivateTask, setReactivateTask] = useState<TaskItem | null>(null);
  const [reactivateReason, setReactivateReason] = useState('');
  const [reactivateDate, setReactivateDate] = useState('');

  const pendingMessage = useRef<{ id: string; text: string } | null>(null);
  const requestVersion = useRef(0);
  const flatListRef = useRef<FlatList>(null);
  const readIds = useRef(new Set<string>()), reading = useRef(false);
  const onVisible = useRef(({ viewableItems }: any) => {
    if (!focusedRef.current || AppState.currentState !== 'active' || reading.current) return;
    const incoming = viewableItems.map((v: any) => v.item as MessageItem).filter((m: MessageItem) => !m.isFromMe && !readIds.current.has(m.id)).slice(0, 100);
    if (!incoming.length) return; reading.current = true;
    void apiClient.post('/api/chats/' + encodeURIComponent(incoming[0].chatId) + '/read', { messageIds: incoming.map((m: MessageItem) => m.id) }).then(() => incoming.forEach((m: MessageItem) => readIds.current.add(m.id))).catch(() => {}).finally(() => { reading.current = false; });
  }).current;
  const isInitialScrollDone = useRef(false);

  const { joinChat, leaveChat, sendMessage } = useSocket({
    onMessageUpdated: () => { void loadData(); },
    onNewMessage: (msg) => {
      if (msg.chatId === chat.id) {
        setMessages((prev) => [...prev.filter(m => m.id !== msg.id), msg].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
      }
    },
    onReconnect: () => { void loadData(); },
    onTaskCreated: (task) => {
      if (task.chatId === chat.id) {
        setChatTasks((prev) => [task, ...prev.filter((t) => t.id !== task.id)]);
        if (task.sourceMessageId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === task.sourceMessageId ? { ...m, task } : m))
          );
        }
      }
    },
    onTaskUpdated: (task) => {
      if (task.chatId === chat.id) {
        setChatTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      }
    },
    onTaskDeleted: (id) => {
      setChatTasks((prev) => prev.filter((t) => t.id !== id));
    },
  });

  useEffect(() => {
    joinChat(chat.id);
    return () => {
      leaveChat(chat.id);
    };
  }, [chat.id]);

  const loadData = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const [msgData, contactData, taskData] = await Promise.all([
        chatsApi.getMessages(chat.id, 1, 80),
        chatsApi.getChatContacts(chat.id).catch(() => []),
        tasksApi.getTasksByChat(chat.id).catch(() => []),
      ]);
      if (version !== requestVersion.current) return;
      setMessages(prev => [...new Map([...prev, ...msgData.messages].map(m => [m.id, m])).values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)));
      setContacts(contactData);
      setChatTasks(taskData);
    } catch (err) {
      console.error('Failed to load chat data:', err);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [chat.id]);

  useEffect(() => {
    setMessages([]); setContacts([]); setChatTasks([]); pendingMessage.current = null; isInitialScrollDone.current = false;
    void loadData();
    return () => { requestVersion.current++; };
  }, [loadData]);

  // Only scroll to bottom once when messages initially load
  useEffect(() => {
    if (!loading && messages.length > 0 && !isInitialScrollDone.current) {
      isInitialScrollDone.current = true;
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 200);
    }
  }, [loading, messages.length]);

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    if (!pendingMessage.current || pendingMessage.current.text !== text) pendingMessage.current = { id: Date.now() + '_' + Math.random().toString(36).slice(2), text };
    try {
      await sendMessage(chat.id, text, pendingMessage.current.id);
      pendingMessage.current = null;
      setInputText('');
    } catch (error: any) { Alert.alert('Mesaj kaydedilemedi', error.message); return; }
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200);
  };

  const handleCreateTaskFromMsg = (msg: MessageItem) => {
    setSelectedMessageForTask(msg);
    setTaskModalVisible(true);
  };

  const handleCreateTaskSubmit = async (data: CreateTaskRequest) => {
    try {
      await tasksApi.createTask(data);
      Alert.alert('Kaydedildi', 'Görev başarıyla oluşturuldu.');
      void loadData();
    } catch (err: any) {
      Alert.alert('Hata', err.response?.data?.error || err.message || 'Görev oluşturulamadı');
      throw err;
    }
  };

  const handleTaskStatusToggle = (task: TaskItem) => {
    if (task.status === 'DONE') {
      setReactivateTask(task);
      setReactivateReason('');
      setReactivateDate(task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '');
      return;
    }
    if (task.status === 'IN_PROGRESS') {
      setCompleteTask(task);
      setCompletionNote('');
      return;
    }
    void (async () => {
      try {
        await tasksApi.updateTask(task.id, { status: 'IN_PROGRESS' });
        void loadData();
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
      void loadData();
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
        dueDate: reactivateDate.trim() ? new Date(reactivateDate.trim()).toISOString() : undefined,
      });
      setReactivateTask(null);
      void loadData();
    } catch (err: any) {
      Alert.alert('Hata', err.response?.data?.error || err.message || 'Görev aktifleştirilemedi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeTaskCount = chatTasks.filter((t) => t.status !== 'DONE').length;

  const filteredTasks = chatTasks.filter((t) => {
    if (taskFilter === 'ALL') return true;
    return t.status === taskFilter;
  });

  return (
    <View style={styles.container}>
      <Header
        title={chat.name}
        subtitle={chat.isGroup ? 'Grup Sohbeti' : 'Doğrudan Mesaj'}
        leftIcon={<ArrowLeft size={22} color={COLORS.textPrimary} />}
        onLeftPress={() => navigation.goBack()}
        rightAction={
          <View style={styles.headerActionsRow}>
            <TouchableOpacity
              style={styles.tasksToggleBtn}
              onPress={() => setTasksDrawerVisible(true)}
              activeOpacity={0.7}
            >
              <CheckSquare size={16} color={COLORS.whatsappGreen} />
              <Text style={styles.tasksToggleText}>
                Görevler{activeTaskCount > 0 ? ` (${activeTaskCount})` : ''}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => {
                setSelectedMessageForTask(null);
                setTaskModalVisible(true);
              }}
              activeOpacity={0.7}
            >
              <Plus size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={COLORS.whatsappGreen} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            onViewableItemsChanged={onVisible}
            viewabilityConfig={{ itemVisiblePercentThreshold: 25 }}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                contacts={contacts}
                onCreateTask={handleCreateTaskFromMsg}
              />
            )}
            contentContainerStyle={styles.listContent}
          />
        )}

        {/* Input Bar with bottom safe-area inset */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={styles.textInput}
            placeholder="Mesaj yazın..."
            placeholderTextColor={COLORS.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline={true}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim()}
          >
            <Send size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Chat Tasks Drawer Modal */}
      <Modal
        visible={tasksDrawerVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setTasksDrawerVisible(false)}
      >
        <View style={[styles.drawerContainer, { paddingTop: Math.max(insets.top, 10), paddingBottom: Math.max(insets.bottom, 10) }]}>
          {/* Drawer Header */}
          <View style={styles.drawerHeader}>
            <View style={styles.drawerHeaderLeft}>
              <TouchableOpacity
                onPress={() => setTasksDrawerVisible(false)}
                style={styles.drawerCloseBtn}
              >
                <X size={22} color={COLORS.textPrimary} />
              </TouchableOpacity>
              <View>
                <Text style={styles.drawerTitle}>Sohbet Görevleri</Text>
                <Text style={styles.drawerSubtitle}>{chat.name} ({chatTasks.length} görev)</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.drawerNewBtn}
              onPress={() => {
                setSelectedMessageForTask(null);
                setTaskModalVisible(true);
              }}
            >
              <Plus size={16} color="#fff" />
              <Text style={styles.drawerNewText}>Yeni</Text>
            </TouchableOpacity>
          </View>

          {/* Filter Tabs */}
          <View style={styles.tabsWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContainer}>
              {(
                [
                  { key: 'ALL', label: 'Tümü' },
                  { key: 'TODO', label: 'Yapılacak' },
                  { key: 'IN_PROGRESS', label: 'Devam Eden' },
                  { key: 'DONE', label: 'Tamamlandı' },
                ] as const
              ).map((tab) => {
                const isActive = taskFilter === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                    onPress={() => setTaskFilter(tab.key)}
                  >
                    <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Task List */}
          <FlatList
            data={filteredTasks}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TaskCard
                task={item}
                onStatusChange={handleTaskStatusToggle}
              />
            )}
            contentContainerStyle={styles.taskListContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <CheckSquare size={48} color={COLORS.border} />
                <Text style={styles.emptyText}>Bu sohbette henüz görev bulunmuyor.</Text>
              </View>
            }
          />
        </View>
      </Modal>

      {/* Create Task Modal */}
      <CreateTaskModal
        visible={taskModalVisible}
        onClose={() => {
          setTaskModalVisible(false);
          setSelectedMessageForTask(null);
        }}
        onSubmit={handleCreateTaskSubmit}
        chatId={chat.id}
        sourceMessage={selectedMessageForTask}
        contacts={contacts}
      />

      {/* Completion Modal */}
      <Modal
        visible={!!completeTask}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCompleteTask(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <CheckCircle2 size={20} color={COLORS.whatsappGreen} />
                <Text style={styles.modalTitle}>Görevi Tamamla</Text>
              </View>
              <TouchableOpacity onPress={() => setCompleteTask(null)}>
                <X size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle} numberOfLines={2}>
              "{completeTask?.title}"
            </Text>

            <Text style={styles.inputLabel}>Tamamlama Notu</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Tamamlama detayları, notlar..."
              placeholderTextColor={COLORS.textMuted}
              value={completionNote}
              onChangeText={setCompletionNote}
              multiline={true}
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCompleteTask(null)}
                disabled={isSubmitting}
              >
                <Text style={styles.modalCancelText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={confirmCompletion}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>Tamamla</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Reactivation Modal */}
      <Modal
        visible={!!reactivateTask}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setReactivateTask(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <RotateCcw size={20} color={COLORS.whatsappGreen} />
                <Text style={styles.modalTitle}>Görevi Tekrar Aktifleştir</Text>
              </View>
              <TouchableOpacity onPress={() => setReactivateTask(null)}>
                <X size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle} numberOfLines={2}>
              "{reactivateTask?.title}"
            </Text>

            <Text style={styles.inputLabel}>Aktifleştirme Nedeni *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Neden tekrar aktifleştiriliyor? (Gerekli)"
              placeholderTextColor={COLORS.textMuted}
              value={reactivateReason}
              onChangeText={setReactivateReason}
              multiline={true}
              numberOfLines={3}
            />

            <Text style={styles.inputLabel}>Yeni Bitiş Tarihi (Opsiyonel, YYYY-AA-GG)</Text>
            <TextInput
              style={[styles.modalInput, { height: 44 }]}
              placeholder="Örn: 2026-09-25"
              placeholderTextColor={COLORS.textMuted}
              value={reactivateDate}
              onChangeText={setReactivateDate}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setReactivateTask(null)}
                disabled={isSubmitting}
              >
                <Text style={styles.modalCancelText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={confirmReactivation}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>Aktifleştir</Text>
                )}
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
  keyboardContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingVertical: 10,
    flexGrow: 1,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tasksToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e7f7ef',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c6edd7',
  },
  tasksToggleText: {
    color: COLORS.whatsappGreenDark,
    fontSize: 12,
    fontWeight: '700',
  },
  headerActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.whatsappGreen,
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: COLORS.bgCard,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: COLORS.bgSurface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.whatsappGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },

  // Drawer styles
  drawerContainer: {
    flex: 1,
    backgroundColor: COLORS.bgSurface,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  drawerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  drawerCloseBtn: {
    padding: 4,
  },
  drawerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  drawerSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  drawerNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.whatsappGreen,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  drawerNewText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  tabsWrapper: {
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 8,
  },
  tabsContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.bgSurface,
  },
  tabBtnActive: {
    backgroundColor: '#d9fdd3',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.whatsappGreenDark,
  },
  taskListContent: {
    padding: 16,
    paddingBottom: 32,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },

  // Modal styles (Completion / Reactivation)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalHeaderLeft: {
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
    fontStyle: 'italic',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.bgSurface,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modalSubmitBtn: {
    backgroundColor: COLORS.whatsappGreen,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  modalSubmitText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
