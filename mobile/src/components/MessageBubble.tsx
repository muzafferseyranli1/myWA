import React, {useEffect,useState} from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Linking } from 'react-native';
import { CheckSquare, CornerDownRight } from 'lucide-react-native';
import { ContactItem, MessageItem } from '../lib/types';
import { COLORS } from '../lib/constants';
import {getServerUrl} from '../api/client';

interface MessageBubbleProps {
  message: MessageItem;
  contacts?: ContactItem[];
  onCreateTask?: (message: MessageItem) => void;
}

function resolveNameFromContacts(identifier: string, contacts: ContactItem[] = []): string | null {
  if (!identifier) return null;
  const clean = identifier.trim().replace(/^@/, '');
  const rawId = clean.split('@')[0];

  const found = contacts.find((c) => {
    const cId = c.id ? c.id.split('@')[0] : '';
    const cPhone = c.phoneNumber ? c.phoneNumber.split('@')[0] : '';
    const cLid = c.lidId ? c.lidId.split('@')[0] : '';
    const cMapped = c.mappedJid ? c.mappedJid.split('@')[0] : '';
    return cId === rawId || cPhone === rawId || cLid === rawId || cMapped === rawId || c.id === clean || c.phoneNumber === clean;
  });

  if (found) {
    const name = found.displayName || found.pushName;
    if (name) return name;
    if (found.phoneNumber && found.phoneNumber !== rawId && found.phoneNumber.length <= 13) {
      return found.phoneNumber;
    }
  }
  return null;
}

function renderFormattedBody(text: string, contacts: ContactItem[] = []) {
  if (!text) return null;
  const mentionRegex = /@(\d{9,16})/g;
  if (!mentionRegex.test(text)) {
    return <Text style={styles.messageText}>{text}</Text>;
  }

  mentionRegex.lastIndex = 0;
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    const rawNumber = match[1];
    const resolvedName = resolveNameFromContacts(rawNumber, contacts);

    if (match.index > lastIndex) {
      elements.push(text.substring(lastIndex, match.index));
    }

    if (resolvedName) {
      elements.push(
        <Text key={match.index} style={styles.mentionText}>
          @{resolvedName}
        </Text>
      );
    } else {
      elements.push(
        <Text key={match.index} style={styles.mentionText}>
          @{rawNumber}
        </Text>
      );
    }

    lastIndex = mentionRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    elements.push(text.substring(lastIndex));
  }

  return <Text style={styles.messageText}>{elements}</Text>;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, contacts = [], onCreateTask }) => {
  const [base,setBase]=useState(''),[mediaError,setMediaError]=useState(false);
 useEffect(()=>{void getServerUrl().then(setBase);},[]);
 const media=message.mediaUrl?(message.mediaUrl.startsWith('/')?base+message.mediaUrl:message.mediaUrl):null;
 const isFromMe = message.isFromMe;
  const time = new Date(message.timestamp).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const senderDisplay =
    message.sender?.displayName ||
    message.sender?.pushName ||
    (message.senderId ? resolveNameFromContacts(message.senderId, contacts) : null) ||
    message.senderId?.split('@')[0] ||
    'Kullanıcı';

  return (
    <View style={[styles.wrapper, isFromMe ? styles.wrapperRight : styles.wrapperLeft]}>
      <View style={[styles.bubble, isFromMe ? styles.bubbleMe : styles.bubbleOther]}>
        {!isFromMe && (
          <Text style={styles.senderName}>{senderDisplay}</Text>
        )}

        {/* Quoted Message Preview */}
        {message.quotedText && (
          <View style={styles.quotedContainer}>
            <View style={styles.quotedBar} />
            <View style={styles.quotedContent}>
              {message.quotedSender && (
                <Text style={styles.quotedSender} numberOfLines={1}>
                  {resolveNameFromContacts(message.quotedSender, contacts) || message.quotedSender}
                </Text>
              )}
              <Text style={styles.quotedText} numberOfLines={2}>
                {message.quotedText}
              </Text>
            </View>
          </View>
        )}

        {/* Body */}
        {message.revoked ? <Text style={styles.messageText}>Bu mesaj silindi.</Text> : message.body ? renderFormattedBody(message.body, contacts) : null}

        {/* Media indicator if url exists */}
        {media && !message.revoked && (['IMAGE','STICKER'].includes(message.messageType) && !mediaError ?
         <TouchableOpacity onPress={()=>void Linking.openURL(media)}><Image source={{uri:media}} onError={()=>setMediaError(true)} resizeMode="contain" style={{width:240,height:240,borderRadius:6,marginTop:6}}/></TouchableOpacity> :
         <TouchableOpacity style={styles.mediaContainer} onPress={()=>{setMediaError(false);void Linking.openURL(media);}}><Text style={styles.mediaText}>{mediaError?'Medya açılamadı. Tekrar dene':message.mediaName || 'Medya ekini aç'}</Text></TouchableOpacity>
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
    backgroundColor: '#d9fdd3', // WA dark green sent
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
  mentionText: {
    color: COLORS.accentBlue,
    fontWeight: '700',
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
