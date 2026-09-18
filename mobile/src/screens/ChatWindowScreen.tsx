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
} from 'react-native';
import { useRoute, useNavigation, useIsFocused } from '@react-navigation/native';
import { ArrowLeft, Send, Plus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import { MessageBubble } from '../components/MessageBubble';
import { CreateTaskModal } from '../components/CreateTaskModal';
import { chatsApi } from '../api/chats.api';
import {apiClient} from '../api/client';
import { tasksApi } from '../api/tasks.api';
import { ChatItem, MessageItem, ContactItem, CreateTaskRequest } from '../lib/types';
import { COLORS } from '../lib/constants';
import { useSocket } from '../hooks/useSocket';

export const ChatWindowScreen = () => {
  const insets = useSafeAreaInsets();
  const focused=useIsFocused(),focusedRef=useRef(false); focusedRef.current=focused;
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const chat: ChatItem = route.params?.chat;

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [selectedMessageForTask, setSelectedMessageForTask] = useState<MessageItem | null>(null);

  const pendingMessage = useRef<{ id: string; text: string } | null>(null);
  const requestVersion = useRef(0);
  const flatListRef = useRef<FlatList>(null);
 const readIds=useRef(new Set<string>()),reading=useRef(false);
 const onVisible=useRef(({viewableItems}:any)=>{
  if(!focusedRef.current||AppState.currentState!=='active'||reading.current)return;
  const incoming=viewableItems.map((v:any)=>v.item as MessageItem).filter((m:MessageItem)=>!m.isFromMe&&!readIds.current.has(m.id)).slice(0,100);
  if(!incoming.length)return;reading.current=true;
  void apiClient.post('/api/chats/'+encodeURIComponent(incoming[0].chatId)+'/read',{messageIds:incoming.map((m:MessageItem)=>m.id)}).then(()=>incoming.forEach((m:MessageItem)=>readIds.current.add(m.id))).catch(()=>{}).finally(()=>{reading.current=false;});
 }).current;
  const isInitialScrollDone = useRef(false);

  const { joinChat, leaveChat, sendMessage } = useSocket({
    onMessageUpdated: () => { void loadData(); },
    onNewMessage: (msg) => {
      if (msg.chatId === chat.id) {
        setMessages((prev) => [...prev.filter(m => m.id !== msg.id), msg].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
      }
    },
    onReconnect: () => { void loadData(); },
    onTaskCreated: (task) => {
      if (task.chatId === chat.id && task.sourceMessageId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === task.sourceMessageId ? { ...m, task } : m))
        );
      }
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
      const [msgData, contactData] = await Promise.all([
        chatsApi.getMessages(chat.id, 1, 80),
        chatsApi.getChatContacts(chat.id).catch(() => []),
      ]);
      if (version !== requestVersion.current) return;
      setMessages(prev => [...new Map([...prev, ...msgData.messages].map(m => [m.id, m])).values()].sort((a,b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)));
      setContacts(contactData);
    } catch (err) {
      console.error('Failed to load chat data:', err);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [chat.id]);

  useEffect(() => {
    setMessages([]); setContacts([]); pendingMessage.current = null; isInitialScrollDone.current = false;
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
      Alert.alert('Kaydedildi', 'Görev kaydedildi; bildirim durumu Bildirimler ekranında görülebilir.');
      void loadData();
    } catch (err: any) {
      Alert.alert('Hata', err.response?.data?.error || err.message || 'Görev oluşturulamadı');
      throw err;
    }
  };

  return (
    <View style={styles.container}>
      <Header
        title={chat.name}
        subtitle={chat.isGroup ? 'Grup Sohbeti' : 'Doğrudan Mesaj'}
        leftIcon={<ArrowLeft size={22} color={COLORS.textPrimary} />}
        onLeftPress={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => {
              setSelectedMessageForTask(null);
              setTaskModalVisible(true);
            }}
          >
            <Plus size={18} color="#fff" />
            <Text style={styles.headerActionText}>Görev</Text>
          </TouchableOpacity>
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
          viewabilityConfig={{itemVisiblePercentThreshold:25}}
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
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.whatsappGreen,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
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
});
