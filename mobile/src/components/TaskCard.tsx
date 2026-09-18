import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { CheckCircle2, Circle, Clock, Bell, User } from 'lucide-react-native';
import { TaskItem, TaskPriority, deliveryLabels } from '../lib/types';
import { COLORS } from '../lib/constants';

interface TaskCardProps {
  task: TaskItem;
  onStatusChange?: (task: TaskItem) => void;
  onRemind?: (task: TaskItem) => void;
  onPress?: (task: TaskItem) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onStatusChange,
  onRemind,
  onPress,
}) => {
  const isDone = task.status === 'DONE';
  const isOverdue =
    task.dueDate && new Date(task.dueDate) < new Date() && !isDone;

  const priorityColors: Record<TaskPriority, string> = {
    LOW: COLORS.priorityLow,
    MEDIUM: COLORS.priorityMedium,
    HIGH: COLORS.priorityHigh,
    URGENT: COLORS.priorityUrgent,
  };

  const priorityLabels: Record<TaskPriority, string> = {
    LOW: 'Düşük',
    MEDIUM: 'Orta',
    HIGH: 'Yüksek',
    URGENT: 'Acil',
  };

  const formattedDate = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
      })
    : null;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isDone && styles.cardDone,
        isOverdue && styles.cardOverdue,
      ]}
      onPress={() => onPress?.(task)}
      activeOpacity={0.8}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => onStatusChange?.(task)}
          style={styles.checkButton}
          activeOpacity={0.7}
        >
          {isDone ? (
            <CheckCircle2 size={22} color={COLORS.whatsappGreen} />
          ) : (
            <Circle
              size={22}
              color={
                task.status === 'IN_PROGRESS'
                  ? COLORS.warning
                  : COLORS.textSecondary
              }
            />
          )}
        </TouchableOpacity>

        <View style={styles.titleContainer}>
          <Text
            style={[styles.title, isDone && styles.titleDone]}
            numberOfLines={2}
          >
            {task.title}
          </Text>
          {task.notification && <Text style={styles.chatName}>{deliveryLabels[task.notification.status]}</Text>}
          {task.chat && (
            <Text style={styles.chatName} numberOfLines={1}>
              💬 {task.chat.name}
            </Text>
          )}
        </View>

        <View
          style={[
            styles.priorityBadge,
            { backgroundColor: priorityColors[task.priority] + '20' },
          ]}
        >
          <Text
            style={[
              styles.priorityText,
              { color: priorityColors[task.priority] },
            ]}
          >
            {priorityLabels[task.priority]}
          </Text>
        </View>
      </View>

      {task.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {task.description}
        </Text>
      ) : null}

      {task.completionNote ? (
        <View style={styles.completionBox}>
          <Text style={styles.completionText} numberOfLines={2}>
            📝 {task.completionNote}
          </Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.metaLeft}>
          {formattedDate && (
            <View
              style={[
                styles.dateBadge,
                isOverdue && styles.dateBadgeOverdue,
              ]}
            >
              <Clock
                size={12}
                color={isOverdue ? COLORS.danger : COLORS.textSecondary}
              />
              <Text
                style={[
                  styles.dateText,
                  isOverdue && styles.dateTextOverdue,
                ]}
              >
                {formattedDate}
              </Text>
            </View>
          )}

          {task.assignees && task.assignees.length > 0 && (
            <View style={styles.assigneesBadge}>
              <User size={12} color={COLORS.textSecondary} />
              <Text style={styles.assigneesText} numberOfLines={1}>
                {task.assignees
                  .map(
                    (a) =>
                      a.contact?.displayName ||
                      a.contact?.pushName ||
                      a.contact?.phoneNumber ||
                      'Üye'
                  )
                  .join(', ')}
              </Text>
            </View>
          )}
        </View>

        {!isDone && onRemind && (
          <TouchableOpacity
            style={styles.remindBtn}
            onPress={() => onRemind(task)}
            activeOpacity={0.7}
          >
            <Bell size={13} color={COLORS.accentBlue} />
            <Text style={styles.remindText}>Hatırlat</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  cardDone: {
    opacity: 0.85,
    backgroundColor: '#f8fafc',
    borderColor: '#bbf7d0',
  },
  cardOverdue: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  completionBox: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dcfce7',
    marginLeft: 32,
  },
  completionText: {
    fontSize: 12,
    color: '#15803d',
    fontStyle: 'italic',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkButton: {
    marginRight: 10,
    marginTop: 2,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  titleDone: {
    textDecorationLine: 'line-through',
    color: COLORS.textSecondary,
  },
  chatName: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 6,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '700',
  },
  description: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 6,
    lineHeight: 18,
    paddingLeft: 32,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingLeft: 32,
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.bgSurface,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dateBadgeOverdue: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  dateText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  dateTextOverdue: {
    color: COLORS.danger,
    fontWeight: '600',
  },
  assigneesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.bgSurface,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: '60%',
  },
  assigneesText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  remindBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(83, 189, 235, 0.12)',
    borderRadius: 6,
  },
  remindText: {
    fontSize: 11,
    color: COLORS.accentBlue,
    fontWeight: '600',
  },
});
