import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { X, Calendar, Flag, User, Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContactItem, CreateTaskRequest, MessageItem, TaskPriority } from '../lib/types';
import { COLORS } from '../lib/constants';

interface CreateTaskModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: CreateTaskRequest) => Promise<void>;
  chatId: string;
  sourceMessage?: MessageItem | null;
  contacts?: ContactItem[];
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  visible,
  onClose,
  onSubmit,
  chatId,
  sourceMessage,
  contacts = [],
}) => {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(sourceMessage?.body ? sourceMessage.body.slice(0, 80) : '');
  const [description, setDescription] = useState(sourceMessage?.body || '');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [daysDue, setDaysDue] = useState<number | null>(3);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [notifyOnCreate, setNotifyOnCreate] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const priorityOptions: { key: TaskPriority; label: string; color: string }[] = [
    { key: 'LOW', label: 'Düşük', color: COLORS.priorityLow },
    { key: 'MEDIUM', label: 'Orta', color: COLORS.priorityMedium },
    { key: 'HIGH', label: 'Yüksek', color: COLORS.priorityHigh },
    { key: 'URGENT', label: 'Acil', color: COLORS.priorityUrgent },
  ];

  const dueOptions = [
    { label: 'Bugün', days: 0 },
    { label: 'Yarın', days: 1 },
    { label: '3 Gün', days: 3 },
    { label: '1 Hafta', days: 7 },
    { label: 'Tarihsiz', days: null },
  ];

  const toggleAssignee = (id: string) => {
    setSelectedAssignees((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!title.trim()) return;

    let dueDateStr: string | undefined = undefined;
    if (daysDue !== null) {
      const d = new Date();
      d.setDate(d.getDate() + daysDue);
      dueDateStr = d.toISOString();
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        chatId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDateStr,
        sourceMessageId: sourceMessage?.id,
        sourceMessageBody: sourceMessage?.body || undefined,
        assigneeIds: selectedAssignees,
        notifyOnCreate,
      });
      // reset
      setTitle('');
      setDescription('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Yeni Görev Oluştur</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Title */}
            <Text style={styles.label}>Başlık *</Text>
            <TextInput
              style={styles.input}
              placeholder="Görev başlığı girin..."
              placeholderTextColor={COLORS.textMuted}
              value={title}
              onChangeText={setTitle}
            />

            {/* Description */}
            <Text style={styles.label}>Açıklama</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Detaylar, notlar veya kaynak mesaj..."
              placeholderTextColor={COLORS.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline={true}
              numberOfLines={3}
            />

            {/* Priority */}
            <Text style={styles.label}>Öncelik</Text>
            <View style={styles.chipsRow}>
              {priorityOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.priorityChip,
                    priority === opt.key && {
                      backgroundColor: opt.color + '25',
                      borderColor: opt.color,
                    },
                  ]}
                  onPress={() => setPriority(opt.key)}
                >
                  <Flag size={13} color={opt.color} />
                  <Text
                    style={[
                      styles.chipText,
                      priority === opt.key && { color: opt.color, fontWeight: '700' },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Due Date */}
            <Text style={styles.label}>Bitiş Tarihi</Text>
            <View style={styles.chipsRow}>
              {dueOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.label}
                  style={[
                    styles.dueChip,
                    daysDue === opt.days && styles.dueChipSelected,
                  ]}
                  onPress={() => setDaysDue(opt.days)}
                >
                  <Calendar
                    size={13}
                    color={daysDue === opt.days ? COLORS.whatsappGreen : COLORS.textSecondary}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      daysDue === opt.days && styles.chipTextSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Assignees */}
            {contacts.length > 0 && (
              <>
                <Text style={styles.label}>Atananlar</Text>
                <View style={styles.assigneeList}>
                  {contacts.map((c) => {
                    const isSelected = selectedAssignees.includes(c.id);
                    const name = c.displayName || c.pushName || c.phoneNumber || 'Kullanıcı';
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.assigneeItem, isSelected && styles.assigneeItemSelected]}
                        onPress={() => toggleAssignee(c.id)}
                      >
                        <View style={styles.assigneeAvatar}>
                          <User size={14} color={isSelected ? '#fff' : COLORS.textSecondary} />
                        </View>
                        <Text style={[styles.assigneeName, isSelected && styles.assigneeNameSelected]}>
                          {name}
                        </Text>
                        {isSelected && <Check size={16} color={COLORS.whatsappGreen} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* WhatsApp notification toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextContainer}>
                <Text style={styles.toggleTitle}>WhatsApp Bildirimi Gönder</Text>
                <Text style={styles.toggleDesc}>Gruba görev linki ve @etiketler paylaşılır</Text>
              </View>
              <Switch
                value={notifyOnCreate}
                onValueChange={setNotifyOnCreate}
                trackColor={{ false: COLORS.bgInput, true: COLORS.whatsappGreen }}
                thumbColor="#ffffff"
              />
            </View>
          </ScrollView>

          {/* Footer actions */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={isSubmitting}>
              <Text style={styles.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, !title.trim() && styles.submitBtnDisabled]}
              onPress={handleSave}
              disabled={isSubmitting || !title.trim()}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitText}>Görevi Oluştur</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.bgSurface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textArea: {
    height: 70,
    textAlignVertical: 'top',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  priorityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgSurface,
  },
  dueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgSurface,
  },
  dueChipSelected: {
    borderColor: COLORS.whatsappGreen,
    backgroundColor: 'rgba(0,168,132,0.12)',
  },
  chipText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  chipTextSelected: {
    color: COLORS.whatsappGreen,
    fontWeight: '600',
  },
  assigneeList: {
    gap: 6,
  },
  assigneeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    backgroundColor: COLORS.bgSurface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  assigneeItemSelected: {
    borderColor: COLORS.whatsappGreen,
    backgroundColor: 'rgba(0,168,132,0.08)',
  },
  assigneeAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  assigneeName: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  assigneeNameSelected: {
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 10,
    backgroundColor: COLORS.bgSurface,
    padding: 12,
    borderRadius: 10,
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: 10,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  toggleDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  submitBtn: {
    backgroundColor: COLORS.whatsappGreen,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
