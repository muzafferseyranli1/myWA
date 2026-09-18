import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageSquare, CheckSquare, Smartphone } from 'lucide-react-native';
import { ChatListScreen } from '../screens/ChatListScreen';
import { KanbanScreen } from '../screens/KanbanScreen';
import { WhatsAppStatusScreen } from '../screens/WhatsAppStatusScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { COLORS } from '../lib/constants';

const Tab = createBottomTabNavigator();

export const TabNavigator = () => {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.bgCard,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 58 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 6),
          paddingTop: 6,
        },
        tabBarActiveTintColor: COLORS.whatsappGreen,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="ChatsTab"
        component={ChatListScreen}
        options={{
          tabBarLabel: 'Sohbetler',
          tabBarIcon: ({ color, size }) => <MessageSquare size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="KanbanTab"
        component={KanbanScreen}
        options={{
          tabBarLabel: 'Görevler',
          tabBarIcon: ({ color, size }) => <CheckSquare size={size} color={color} />,
        }}
      />
      <Tab.Screen name="NotificationsTab" component={NotificationsScreen} options={{ tabBarLabel: 'Bildirimler', tabBarIcon: ({color,size}) => <CheckSquare size={size} color={color} /> }} />
      <Tab.Screen
        name="StatusTab"
        component={WhatsAppStatusScreen}
        options={{
          tabBarLabel: 'WhatsApp & Ayar',
          tabBarIcon: ({ color, size }) => <Smartphone size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
};
