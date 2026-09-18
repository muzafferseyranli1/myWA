import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Button, Alert, StyleSheet } from 'react-native';
import { apiClient } from '../api/client';
import { NotificationItem, deliveryLabels } from '../lib/types';
import { useSocket } from '../hooks/useSocket';
import { COLORS } from '../lib/constants';
import { Header } from '../components/Header';

export function NotificationsScreen() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const {data} = await apiClient.get('/api/notifications', {params: {page}}); setItems(data.items); setPages(Math.max(1,data.totalPages)); setError(''); }
    catch { setError('Bildirimler okunamadı'); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);
  useSocket({ onReconnect: () => void load(), onNotificationUpdated: () => void load() });
  const act = async (job: NotificationItem, action: string) => {
    setBusy(true);
    try { await apiClient.post(`/api/notifications/${job.id}/${action}`, {confirmUnknown: job.status === 'UNKNOWN'}); await load(); }
    catch (e: any) { setError(e.response?.data?.error || 'İşlem başarısız'); } finally { setBusy(false); }
  };
  const retry = (job: NotificationItem) => {
    if (job.status === 'UNKNOWN') Alert.alert('Tekrar gönderim', 'Mesaj daha önce gönderilmiş olabilir. Tekrar gönderilsin mi?', [{text:'Vazgeç',style:'cancel'}, {text:'Tekrar gönder',onPress: () => void act(job,'retry')}]);
    else void act(job,'retry');
  };
  return <View style={styles.container}>
    <Header title="Bildirimler" />
    <Text style={styles.note}>WAHA kabulü, alıcıya teslim edildiği anlamına gelmez. Başarısız veya belirsiz işler sonraki sohbet gönderimlerini bekletir.</Text>
    {!!error && <Text style={styles.error}>{error}</Text>}
    <FlatList data={items} keyExtractor={j => j.id} onRefresh={() => void load()} refreshing={busy} ListEmptyComponent={<Text style={styles.note}>Bildirim bulunmuyor.</Text>} renderItem={({item}) => <View style={styles.card}>
      <Text style={styles.text}>{deliveryLabels[item.status]}</Text><Text style={styles.note}>{item.kind} · {item.chatId}</Text>
      {!!item.lastError && <Text style={styles.error}>{item.lastError}</Text>}
      {['FAILED','UNKNOWN'].includes(item.status) && <View style={styles.buttons}><Button disabled={busy} title="Tekrar gönder" onPress={() => retry(item)} /><Button disabled={busy} title="İptal et" onPress={() => void act(item,'cancel')} /></View>}
    </View>} />
    <View style={styles.buttons}><Button title="Önceki" disabled={page === 1} onPress={() => setPage(p => p - 1)} /><Text style={styles.text}>{page} / {pages}</Text><Button title="Sonraki" disabled={page >= pages} onPress={() => setPage(p => p + 1)} /></View>
  </View>;
}
const styles = StyleSheet.create({ container: {flex:1,backgroundColor:COLORS.bgDark}, card:{padding:12,borderBottomWidth:1,borderColor:COLORS.border}, text:{color:COLORS.textPrimary},note:{color:COLORS.textSecondary,padding:8,fontSize:12},error:{color:COLORS.danger,padding:8},buttons:{flexDirection:'row',justifyContent:'space-around',padding:8} });
