import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CheckSquare, CornerDownRight } from 'lucide-react-native';
import { MessageItem } from '../lib/types';
import { COLORS } from '../lib/constants';

interface MessageBubbleProps {
  message: MessageItem;
  onCreateTask?: (message: MessageItem) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onCreateTask }) => {
  const isFromMe = message.isFromMe;
  const time = new Date(message.timestamp).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={[styles.wrapper, isFromMe ? styles.wrapperRight : styles.wrapperLeft]}>
      <View style={[styles.bubble, isFromMe ? styles.bubbleMe : styles.bubbleOther]}>
        {!isFromMe && (
          <Text style={styles.senderName}>
            {message.sender?.displayName || message.sender?.pushName || message.senderId?.split('@')[0] || 'Kullanıcı'}
          </Text>
        )}

        {/* Quoted Message Preview */}
        {message.quotedText && (
          <View style={styles.quotedContainer}>
            <View style={styles.quotedBar} />
            <View style={styles.quotedContent}>
              {message.quotedSender && (
                <Text style={styles.quotedSender} numberOfLines={1}>
                  {message.quotedSender}
                </Text>
              )}
              <Text style={styles.quotedText} numberOfLines={2}>
                {message.quotedText}
              </Text>
            </View>
          </View>
        )}

        {/* Body */}
        {message.body ? (
          <Text style={styles.messageText}>{message.body}</Text>
        ) : null}

        {/* Media indicator if url exists */}
        {message.mediaUrl && (
          <View style={styles.mediaContainer}>
            <Text style={styles.mediaText}>📎 {message.mediaName || 'Medya Eki'}</Text>
          </View>
        )}

        {/* Footer: Time & Task info */}
        <View style={styles.footer}>
          {message.task ? (
            <View style={styles.taskBadge}>
              <CheckSquare size={12} color={COLORS.whatsappGreen} />
              <Text style={styles.taskBadgeText}>Görevli</Text>
            </View>
          ) : (
            onCreateTask && (
              <TouchableOpacity
                onPress={() => onCreateTask(message)}
                style={styles.actionBtn}
                activeOpacity={0.7}
              >
                <CornerDownRight size={12} color={COLORS.textSecondary} />
                <Text style={styles.actionText}>Görev Yap</Text>
              </TouchableOpacity>
            )
          )}
          <Text style={styles.timeText}>{time}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 4,
    paddingHorizontal: 10,
    width: '100%',
  },
  wrapperRight: {
    alignItems: 'flex-end',
  },
  wrapperLeft: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleMe: {
    backgroundColor: '#005c4b', // WA dark green sent
    borderTopRightRadius: 2,
  },
  bubbleOther: {
    backgroundColor: COLORS.bgSurface,
    borderTopLeftRadius: 2,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accentBlue,
    marginBottom: 4,
  },
  quotedContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 6,
    padding: 6,
    marginBottom: 6,
  },
  quotedBar: {
    width: 3,
    backgroundColor: COLORS.whatsappGreen,
    borderRadius: 2,
    marginRight: 6,
  },
  quotedContent: {
    flex: 1,
  },
  quotedSender: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.whatsappGreen,
    marginBottom: 2,
  },
  quotedText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  messageText: {
    fontSize: 15,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  mediaContainer: {
    marginTop: 4,
    padding: 6,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 6,
  },
  mediaText: {
    fontSize: 13,
    color: COLORS.accentBlue,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  actionText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  taskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  taskBadgeText: {
    fontSize: 11,
    color: COLORS.whatsappGreen,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginLeft: 4,
  },
});
