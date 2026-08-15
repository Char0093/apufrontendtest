export type ProcessingStatus =
  | 'Scheduled'
  | 'Pending'
  | 'Preprocessing'
  | 'ASR'
  | 'LLM'
  | 'Graph'
  | 'Completed'
  | 'Retrying'
  | 'Failed';

export type TabType =
  | 'dashboard'
  | 'meetings'
  | 'memoryGraph'
  | 'directory'
  | 'messages'
  | 'coco'
  | 'settings';

export interface User {
  id: string;
  name: string;
  email: string;
  department: string;
  role?: string;
  avatarUrl: string;
  isOnline?: boolean;
  title?: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  role: string;
  avatarUrl?: string;
  isOnline?: boolean;
  location?: string;
  bio?: string;
}

export interface Decision {
  id: string;
  title: string;
  rationale: string;
  evidence: string;
  confidenceScore: number;
  category?: string;
  impactLevel?: 'High' | 'Medium' | 'Low';
}

export interface ActionItem {
  id: string;
  task: string;
  assignee: string;
  assigneeAvatar?: string;
  dueDate: string;
  status: 'To Do' | 'In Progress' | 'Completed' | 'Pending';
  priority?: 'High' | 'Medium' | 'Low';
  meetingTitle?: string;
  meetingId?: string;
}

export interface TranscriptSegment {
  id: string;
  speaker: string;
  time: string;
  text: string;
  sentiment?: 'positive' | 'neutral' | 'action' | 'conflict';
}

export interface Contradiction {
  id: string;
  title: string;
  type: 'Policy Conflict' | 'Budget Discrepancy' | 'Statement Contradiction';
  severity: 'Critical' | 'Warning' | 'Info';
  meetingA: string;
  statementA: string;
  meetingB: string;
  statementB: string;
  detectedAt: string;
  recommendation: string;
  status: 'Unresolved' | 'Investigating' | 'Resolved';
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  val?: number;
  color?: string;
  role?: string;
  email?: string;
  phone?: string;
  meetingId?: string;
}

export interface GraphLink {
  source: string;
  target: string;
  label?: string;
  meetingId?: string;
  isContradiction?: boolean;
  message?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface Meeting {
  id: string;
  title: string;
  project: string;
  dateTime: string;
  timeRange?: string;
  department?: string;
  participants: string[];
  status: ProcessingStatus;
  duration?: string;
  summary?: string;
  decisions: Decision[];
  actionItems: ActionItem[];
  transcript: TranscriptSegment[];
  contradictions?: Contradiction[];
  audioFileName?: string;
  fileSize?: string;
  completedAt?: string;
  graphData?: GraphData;
}

export type NotificationCategory = 'meeting' | 'action_item' | 'system' | 'message' | 'contradiction' | 'ai_pipeline';

export interface Notification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  category: NotificationCategory;
  type?: 'INVITATION' | 'AI_READY' | 'ACTION_ITEM' | 'SYSTEM_ALERT' | 'DIRECT_MESSAGE' | 'CONTRADICTION' | 'ACTION_ITEM_COMPLETED';
  meetingId?: string;
  senderName?: string;
  recipientName?: string;
  targetTab?: TabType | 'detail';
}

export interface DirectMessage {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  timestamp: string;
  isRead: boolean;
  attachment?: {
    title: string;
    type: 'meeting_summary' | 'action_item' | 'file';
  };
}

export interface Conversation {
  employeeId: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

export interface NotificationPreferences {
  emailActionItems: boolean;
  meetingAiAnalysis: boolean;
  systemUpdates: boolean;
  contradictionAlerts?: boolean;
  directMessages?: boolean;
}

export interface UserProfile extends User {
  phone: string;
  preferences: NotificationPreferences;
}



