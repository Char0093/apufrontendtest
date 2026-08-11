import React, { createContext, useContext, useState } from 'react';
import { Notification } from '../types';
import { INITIAL_NOTIFICATIONS_DATA } from '../mock/mockData';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'> & { id?: string; timestamp?: string; read?: boolean }) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  createInvitationNotifications: (
    meetingId: string,
    meetingTitle: string,
    scheduledDate: string,
    scheduledTime: string,
    participants: string[]
  ) => void;
  triggerAiPipelineComplete: (
    meetingId: string,
    meetingTitle?: string,
    participants?: string[],
    currentUser?: string
  ) => void;
  notifyActionItemCompleted: (
    assignee: string,
    taskTitle: string,
    meetingId: string
  ) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS_DATA);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const addNotification = (item: Omit<Notification, 'id' | 'timestamp' | 'read'> & { id?: string; timestamp?: string; read?: boolean }) => {
    const newNotif: Notification = {
      id: item.id || `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: item.title,
      message: item.message,
      timestamp: item.timestamp || 'Just now',
      type: item.type || (item.category === 'ai_pipeline' ? 'AI_READY' : 'INVITATION'),
      meetingId: item.meetingId,
      read: item.read ?? false,
      category: item.category || (item.type === 'AI_READY' ? 'ai_pipeline' : 'meeting'),
      targetTab: item.targetTab || 'detail'
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const createInvitationNotifications = (
    meetingId: string,
    meetingTitle: string,
    scheduledDate: string,
    scheduledTime: string,
    participants: string[]
  ) => {
    const dateTimeStr = (scheduledDate && scheduledTime) 
      ? `${scheduledDate} at ${scheduledTime}`
      : (scheduledDate || 'upcoming time');

    const newNotif: Notification = {
      id: `notif-inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: 'INVITATION',
      category: 'meeting',
      title: 'New Meeting Invitation',
      message: `You have been added to ${meetingTitle} scheduled for ${dateTimeStr}.`,
      timestamp: 'Just now',
      read: false,
      meetingId: meetingId,
      targetTab: 'detail'
    };

    setNotifications(prev => [newNotif, ...prev]);
  };

  const triggerAiPipelineComplete = (
    meetingId: string, 
    meetingTitle?: string,
    participants?: string[],
    currentUser?: string
  ) => {
    // Precise Participant Check: Only generate notification if currentUser is in participants array
    if (participants && participants.length > 0 && currentUser) {
      const isParticipant = participants.some(
        p => p.toLowerCase().trim() === currentUser.toLowerCase().trim()
      );
      if (!isParticipant) {
        console.log(`[Notification Skipped] Current user "${currentUser}" is not a participant in meeting "${meetingId}".`);
        return;
      }
    }

    const titleText = meetingTitle || 'Meeting';
    const newNotif: Notification = {
      id: `notif-ai-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: 'AI_READY',
      category: 'ai_pipeline',
      title: 'AI Analysis Ready ✨',
      message: `Transcript, Decisions, Knowledge Graph, and Action Items for ${titleText} are now available.`,
      timestamp: 'Just now',
      read: false,
      meetingId: meetingId,
      targetTab: 'detail'
    };

    setNotifications(prev => [newNotif, ...prev]);
  };

  const notifyActionItemCompleted = (assignee: string, taskTitle: string, meetingId: string) => {
    const newNotif: Notification = {
      id: `notif-act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: 'ACTION_ITEM_COMPLETED',
      category: 'action_item',
      title: 'Action Item Completed ✅',
      message: `${assignee} completed task: '${taskTitle}'`,
      timestamp: 'Just now',
      read: false,
      meetingId: meetingId,
      targetTab: 'detail'
    };

    setNotifications(prev => [newNotif, ...prev]);
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        createInvitationNotifications,
        triggerAiPipelineComplete,
        notifyActionItemCompleted
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
