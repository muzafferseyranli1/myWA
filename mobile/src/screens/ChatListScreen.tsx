import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Users, User, Search, CheckSquare } from 'lucide-react-native';
import { Header } from '../components/Header';
import { chatsApi } from '../api/chats.api';
import { ChatItem } from '../lib/types';
import { COLORS } from '../lib/constants';
import { useSocket } from '../hooks/useSocket';

export const ChatListScreen = () => {
  const navigation = useNavigation<any>();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchChats = useCallback(async () => {
    try {
      const data = await chatsApi.getChats();
      setChats(data);
    } catch (err) {
      console.error('Fetch chats error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  // Realtime updates
  useSocket({
    onChatUpdated: () => {
      fetchChats();
    },
    onNewMessage: () => {
      fetchChats();
    },
  });

  const onRefresh = () => {
    setRefreshing(true);
    fetchChats();
  };

  const filteredChats = chats.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const renderChatItem = ({ item }: { item: ChatItem }) => {
    const time = item.lastMessage?.timestamp
      ? new Date(item.lastMessage.timestamp).toLocaleDateString('tr-TR', {
          day: 'numeric',
          month: 'short',
        })
      : '';

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => navigation.navigate('ChatWindow', { chat: item })}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, item.isGroup ? styles.avatarGroup : styles.avatarDirect]}>
          {item.isGroup ? (
            <Users size={22} color="#fff" />
          ) : (
            <User size={22} color="#fff" />
          )}
        </View>

        <View style={styles.chatContent}>
          <View style={styles.chatTopRow}>
            <Text style={styles.chatName} numberOfLines={1}>
              {item.name}
            </Text>
            {time ? <Text style={styles.timeText}>{time}</Text> : null}
          </View>

          <View style={styles.chatBottomRow}>
            <Text style={styles.lastMessage} numberOfLines={1}>
              {item.lastMessage?.body || 'Henüz mesaj yok'}
            </Text>

            {item.taskCount !== undefined && item.taskCount > 0 ? (
              <View style={styles.taskCountBadge}>
                <CheckSquare size={11} color={COLORS.whatsappGreen} />
                <Text style={styles.taskCountText}>{item.taskCount}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Sohbetler" />

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Search size={18} color={COLORS.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Sohbet veya kişi ara..."
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.whatsappGreen} />
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          keyExtractor={(item) => item.id}
          renderItem={renderChatItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.whatsappGreen}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Sohbet bulunamadı</Text>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSurface,
    marginHorizontal: 12,
    marginVertical: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarGroup: {
    backgroundColor: '#00a884',
  },
  avatarDirect: {
    backgroundColor: '#53bdeb',
  },
  chatContent: {
    flex: 1,
  },
  chatTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  timeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  chatBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  taskCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,168,132,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  taskCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.whatsappGreen,
  },
  emptyContainer: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 15,
  },
});
