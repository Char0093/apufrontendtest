import React, { createContext, useContext, useState, useMemo, useEffect, useRef } from 'react';
import {
  User,
  UserProfile,
  Employee,
  Meeting,
  Contradiction,
  Notification,
  DirectMessage,
  TabType,
  ActionItem,
  Decision
} from '../types';
import { INITIAL_USER_PROFILE } from '../mock/mockData';
import * as api from '../services/api';

/** AI-extracted participants reflect who was actually heard in the
 * recording, not necessarily whoever is logged in — without this, a fully
 * processed meeting silently disappears from every "my meetings" view
 * (Dashboard, Meeting Intelligence) whenever the demo user wasn't a real
 * attendee. Used both on initial load and right after live upload. */
function ensureCurrentUserIsParticipant(meeting: Meeting, currentUserName: string): Meeting {
  const alreadyListed = meeting.participants.some(
    (p) => p.toLowerCase() === currentUserName.toLowerCase()
  );
  return alreadyListed ? meeting : { ...meeting, participants: [...meeting.participants, currentUserName] };
}

// Mock Employees Directory
const initialEmployees: Employee[] = [
  {
    id: 'emp-0',
    name: 'Thim Yee Song',
    email: 'thim.yeesong@corpbrain.ai',
    phone: '+1 (555) 123-4567',
    department: 'Product & Executive',
    role: 'VP of Product',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    isOnline: true,
    location: 'San Francisco, CA',
    bio: 'Leading enterprise product vision and AI decision intelligence integration.'
  },
  {
    id: 'emp-1',
    name: 'Duncan',
    email: 'duncan@corpbrain.ai',
    phone: '+1 (555) 234-5678',
    department: 'Core Systems',
    role: 'VP of Engineering',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    isOnline: true,
    location: 'San Francisco, CA',
    bio: 'Overseeing core cloud infrastructure and AI intelligence pipelines.'
  },
  {
    id: 'emp-2',
    name: 'Kam Xin Le',
    email: 'kam.xinle@corpbrain.ai',
    phone: '+1 (555) 345-6789',
    department: 'Product Strategy',
    role: 'Head of Product',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    isOnline: true,
    location: 'New York, NY',
    bio: 'Driving product roadmap and enterprise knowledge extraction systems.'
  },
  {
    id: 'emp-3',
    name: 'Yap En Yu',
    email: 'yap.enyu@corpbrain.ai',
    phone: '+1 (555) 456-7890',
    department: 'Executive Ops',
    role: 'Chief Financial Officer',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    isOnline: false,
    location: 'Chicago, IL',
    bio: 'Budget allocation, enterprise compliance, and resource governance.'
  }
];

// Initial Contradictions
const initialContradictions: Contradiction[] = [
  {
    id: 'cnt-101',
    title: 'Q3 Cloud Infrastructure Allocation Mismatch',
    type: 'Budget Discrepancy',
    severity: 'Critical',
    meetingA: 'Q3 Executive Budget Review (July 15)',
    statementA: 'CFO Elena cap AWS cloud infrastructure expenditure at $180,000 max for Q3.',
    meetingB: 'Infrastructure & Scale Sync (August 02)',
    statementB: 'VP Engineering Sarah approved $240,000 for AWS GPU Cluster provisioning.',
    detectedAt: '2026-08-08 14:32',
    recommendation: 'Align Engineering compute purchasing with CFO budget cap or submit formal budget expansion request.',
    status: 'Unresolved'
  },
  {
    id: 'cnt-102',
    title: 'Remote Work Security Compliance Conflict',
    type: 'Policy Conflict',
    severity: 'Warning',
    meetingA: 'Security Governance Policy Update (June 10)',
    statementA: 'All external API tokens must rotate every 30 days with mandatory Hardware Key MFA.',
    meetingB: 'DevOps Tooling Standup (August 05)',
    statementB: 'DevOps team extended token lifetime to 90 days for continuous deployment test runners.',
    detectedAt: '2026-08-09 09:15',
    recommendation: 'Revert test runner token lifespan to 30 days or issue security waiver approved by General Counsel.',
    status: 'Investigating'
  },
  {
    id: 'cnt-103',
    title: 'Customer Data Retention Period Inconsistency',
    type: 'Statement Contradiction',
    severity: 'Info',
    meetingA: 'Product Governance Sync (May 22)',
    statementA: 'User session logs deleted automatically after 90 days for GDPR compliance.',
    meetingB: 'AI Training Pipeline Specs (July 28)',
    statementB: 'Data Science team retaining user session logs for 365 days for model tuning.',
    detectedAt: '2026-08-10 11:04',
    recommendation: 'Anonymize training logs before storage beyond 90-day threshold.',
    status: 'Unresolved'
  }
];

// Initial Action Items
const initialActionItems: ActionItem[] = [
  {
    id: 'act-1',
    task: 'Finalize GPU Cluster procurement proposal for Q3 review',
    assignee: 'Sarah Jenkins',
    assigneeAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    dueDate: '2026-08-14',
    status: 'In Progress',
    priority: 'High',
    meetingTitle: 'Infrastructure & Scale Sync'
  },
  {
    id: 'act-2',
    task: 'Review compliance waiver for test runner API key rotation',
    assignee: 'Amanda Brooks',
    assigneeAvatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    dueDate: '2026-08-12',
    status: 'To Do',
    priority: 'High',
    meetingTitle: 'Security Governance Policy Update'
  },
  {
    id: 'act-3',
    task: 'Deploy automated data anonymization pipeline before session log intake',
    assignee: 'David Chen',
    assigneeAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    dueDate: '2026-08-18',
    status: 'To Do',
    priority: 'Medium',
    meetingTitle: 'AI Training Pipeline Specs'
  },
  {
    id: 'act-4',
    task: 'Publish updated Enterprise Knowledge Graph API documentation',
    assignee: 'Marcus Vance',
    assigneeAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    dueDate: '2026-08-10',
    status: 'Completed',
    priority: 'Low',
    meetingTitle: 'Product Governance Sync'
  },
  {
    id: 'act-alex-1',
    task: 'Deploy automated graph vector indexing pipeline for Q3 meetings',
    assignee: 'Alex Mercer',
    assigneeAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    dueDate: '2026-08-14',
    status: 'In Progress',
    priority: 'High',
    meetingTitle: 'Q3 Executive Infrastructure & Budget Sync'
  }
];

// Initial Meetings
const initialMeetings: Meeting[] = [
  {
    id: 'mtg-101',
    title: 'Q3 Executive Infrastructure & Budget Sync',
    project: 'Enterprise Core Platform',
    dateTime: '2026-08-08 14:00',
    timeRange: '14:00 - 15:30 EST',
    department: 'Engineering & Finance',
    participants: ['Thim Yee Song', 'Duncan', 'Yap En Yu'],
    status: 'Completed',
    duration: '45 mins',
    summary: 'The executive committee discussed cloud GPU cluster scaling for the upcoming RAG 2.0 release. CFO Yap En Yu highlighted tight budget boundaries for Q3 ($180k max), while Duncan presented hardware cost estimates ($240k). AI anomaly detection flagged a critical budget contradiction across recorded policy limits.',
    decisions: [
      {
        id: 'dec-1',
        title: 'Approve Pilot GPU Node Deployment',
        rationale: 'Necessary to benchmark model latency under high concurrent load.',
        evidence: 'Benchmark tests demonstrated 4x throughput boost.',
        confidenceScore: 94,
        impactLevel: 'High',
        category: 'Infrastructure'
      },
      {
        id: 'dec-2',
        title: 'Defer Non-Essential Log Archival Storage',
        rationale: 'Reduces immediate storage costs by 18%.',
        evidence: 'Cold storage analysis shows negligible retrieval rates.',
        confidenceScore: 89,
        impactLevel: 'Medium',
        category: 'Cost Optimization'
      }
    ],
    actionItems: [initialActionItems[4], initialActionItems[0], initialActionItems[1]],
    contradictions: [initialContradictions[0]],
    transcript: [
      { id: 't1', speaker: 'Thim Yee Song', time: '00:02', text: 'Welcome everyone. Today we are addressing infrastructure capacity for the upcoming Corporate Brain LLM rollout.', sentiment: 'positive' },
      { id: 't2', speaker: 'Duncan', time: '02:15', text: 'Our current 8-node GPU cluster is reaching 88% peak memory utilization during business hours. We need to provision $240,000 for additional capacity.', sentiment: 'action' },
      { id: 't3', speaker: 'Yap En Yu', time: '04:40', text: 'Hold on, Duncan. In our July 15 budget meeting, we set a strict Q3 cloud infrastructure ceiling of $180,000. We cannot exceed that limit without board signoff.', sentiment: 'conflict' }
    ]
  },
  {
    id: 'mtg-102',
    title: 'Product Roadmap & AI Contradiction Engine Demo',
    project: 'Coco AI Intelligence',
    dateTime: '2026-08-09 10:30',
    timeRange: '10:30 - 11:30 EST',
    department: 'Product Strategy',
    participants: ['Thim Yee Song', 'Kam Xin Le', 'Duncan', 'Yap En Yu'],
    status: 'Completed',
    duration: '60 mins',
    summary: 'Demonstrated the automatic cross-meeting contradiction detection algorithm. Kam Xin Le reviewed UI integration for real-time notification alerts, and Yap En Yu confirmed regulatory compliance standards.',
    decisions: [
      {
        id: 'dec-3',
        title: 'Integrate Real-time Alerting into Header Bell System',
        rationale: 'Ensures executives are alerted instantly when policy discrepancies occur.',
        evidence: 'User testing showed 65% faster resolution time.',
        confidenceScore: 98,
        impactLevel: 'High'
      }
    ],
    actionItems: [initialActionItems[2]],
    contradictions: [initialContradictions[1], initialContradictions[2]],
    transcript: [
      { id: 't6', speaker: 'Kam Xin Le', time: '01:00', text: 'The Contradiction Engine scans meeting transcripts in real-time and flags policy conflicts across departments.', sentiment: 'positive' },
      { id: 't7', speaker: 'Yap En Yu', time: '03:20', text: 'This is crucial for legal audits. If an engineering team changes retention rules without legal review, we get an instant alert.', sentiment: 'action' }
    ]
  },
  {
    id: 'mtg-103',
    title: 'Enterprise Cloud Security & SAML SSO Review',
    project: 'Security & Compliance',
    dateTime: '2026-08-06 11:00',
    timeRange: '11:00 - 12:00 EST',
    department: 'Security & Compliance',
    participants: ['Duncan', 'Yap En Yu', 'Kam Xin Le'],
    status: 'Completed',
    duration: '50 mins',
    summary: 'Reviewed Okta SAML 2.0 single sign-on integration for enterprise client tier and automated SOC2 immutable log retention policies.',
    decisions: [
      {
        id: 'dec-101',
        title: 'Mandate WebAuthn Passkeys for Admin Accounts',
        rationale: 'Eliminates static credential leakage and satisfies SOC2 Type II compliance audit controls.',
        evidence: 'Auditors flagged legacy API keys as primary vulnerability risk.',
        confidenceScore: 96,
        impactLevel: 'High'
      }
    ],
    actionItems: [initialActionItems[1]],
    contradictions: [],
    transcript: [
      { id: 't8', speaker: 'Duncan', time: '01:15', text: 'We are enabling WebAuthn passkeys for all admin infrastructure accounts starting next release.', sentiment: 'positive' }
    ]
  },
  {
    id: 'mtg-104',
    title: 'Q4 Financial Governance & Cost Allocation',
    project: 'Finance & Operations',
    dateTime: '2026-08-05 15:00',
    timeRange: '15:00 - 16:00 EST',
    department: 'Finance & Operations',
    participants: ['Yap En Yu', 'Kam Xin Le'],
    status: 'Completed',
    duration: '40 mins',
    summary: 'Yap En Yu reviewed Q4 department cost allocations and revenue targets for enterprise licenses.',
    decisions: [
      {
        id: 'dec-102',
        title: 'Approve $50k Contingency Pool for AI Model Optimization',
        rationale: 'Allows engineering team flexibility during peak workload spikes.',
        evidence: 'Financial modeling shows 15% ROI from latency reduction.',
        confidenceScore: 92,
        impactLevel: 'Medium'
      }
    ],
    actionItems: [initialActionItems[3]],
    contradictions: [],
    transcript: [
      { id: 't9', speaker: 'Yap En Yu', time: '02:00', text: 'We will allocate $50,000 for model quantization and cost reduction initiatives.', sentiment: 'positive' }
    ]
  },
  {
    id: 'mtg-105',
    title: 'Upcoming: RAG 2.0 Vector Engine & Graph Ingestion Standup',
    project: 'Core Infrastructure',
    dateTime: '2026-08-14 14:00',
    timeRange: '14:00 - 15:00 EST',
    department: 'Engineering & AI',
    participants: ['Thim Yee Song', 'Duncan', 'Kam Xin Le'],
    status: 'Scheduled',
    duration: '60 mins',
    summary: 'Technical alignment on vector database indexing speed and Neo4j memory optimizations for RAG 2.0.',
    decisions: [],
    actionItems: [],
    contradictions: [],
    transcript: []
  },
  {
    id: 'mtg-106',
    title: 'Upcoming: Enterprise Client SAML SSO Sync',
    project: 'Product Strategy',
    dateTime: '2026-08-15 11:00',
    timeRange: '11:00 - 12:00 EST',
    department: 'Product Strategy',
    participants: ['Kam Xin Le', 'Yap En Yu'],
    status: 'Scheduled',
    duration: '45 mins',
    summary: 'Pre-sales technical review for Okta SAML 2.0 endpoints required by enterprise accounts.',
    decisions: [],
    actionItems: [],
    contradictions: [],
    transcript: []
  },
  {
    id: 'mtg-107',
    title: 'Upcoming: Legal Policy & Data Retention Sync',
    project: 'Security & Compliance',
    dateTime: '2026-08-16 10:00',
    timeRange: '10:00 - 11:00 EST',
    department: 'Security & Compliance',
    participants: ['Yap En Yu', 'Duncan'],
    status: 'Scheduled',
    duration: '30 mins',
    summary: 'Reviewing GDPR 90-day session log deletion policies vs AI model training retention rules.',
    decisions: [],
    actionItems: [],
    contradictions: [],
    transcript: []
  }
];

// Initial Notifications
const initialNotifications: Notification[] = [
  {
    id: 'notif-1',
    title: 'Critical Contradiction Detected',
    message: 'Q3 Cloud Infrastructure Allocation Mismatch between CFO budget cap and Engineering purchase approval.',
    timestamp: '10 mins ago',
    read: false,
    category: 'contradiction',
    type: 'CONTRADICTION',
    meetingId: 'mtg-101',
    recipientName: 'Alex Mercer',
    targetTab: 'meetings'
  },
  {
    id: 'notif-2',
    title: 'Meeting Invite: Security Compliance Review',
    message: 'Amanda Brooks invited you to Security Governance Review scheduled for Tomorrow at 2:00 PM.',
    timestamp: '25 mins ago',
    read: false,
    category: 'meeting',
    type: 'INVITATION',
    senderName: 'Amanda Brooks',
    recipientName: 'Sarah Jenkins',
    targetTab: 'meetings'
  },
  {
    id: 'notif-3',
    title: 'New Direct Message from Sarah',
    message: 'Can you review the 4-bit quantization benchmark results before our call?',
    timestamp: '1 hour ago',
    read: false,
    category: 'message',
    type: 'DIRECT_MESSAGE',
    senderName: 'Sarah Jenkins',
    recipientName: 'Alex Mercer',
    targetTab: 'meetings'
  },
  {
    id: 'notif-4',
    title: 'Action Item Completed',
    message: 'Marcus Vance marked "Publish updated Enterprise Knowledge Graph API documentation" as completed.',
    timestamp: '3 hours ago',
    read: true,
    category: 'action_item',
    type: 'ACTION_ITEM',
    recipientName: 'Marcus Vance',
    targetTab: 'dashboard'
  },
  {
    id: 'notif-5',
    title: 'Budget Variance Alert',
    message: 'Elena Rostova: Q3 cloud allocation cap of $180,000 flagged in executive review.',
    timestamp: '4 hours ago',
    read: false,
    category: 'contradiction',
    type: 'CONTRADICTION',
    recipientName: 'Elena Rostova',
    targetTab: 'meetings'
  },
  {
    id: 'notif-6',
    title: 'Model Quantization Spec Updated',
    message: 'David Chen published 4-bit precision benchmark for GPU cluster memory savings.',
    timestamp: '5 hours ago',
    read: false,
    category: 'action_item',
    type: 'ACTION_ITEM',
    recipientName: 'David Chen',
    targetTab: 'dashboard'
  },
  {
    id: 'notif-7',
    title: 'Legal Waiver Review Pending',
    message: 'Amanda Brooks requested audit verification on 90-day data retention limits.',
    timestamp: '6 hours ago',
    read: false,
    category: 'meeting',
    type: 'INVITATION',
    recipientName: 'Amanda Brooks',
    targetTab: 'meetings'
  }
];

// Initial Direct Messages
const initialDirectMessages: DirectMessage[] = [
  {
    id: 'msg-1',
    senderId: 'emp-1',
    receiverId: 'user-current',
    text: 'Hey Alex! Did you get a chance to look at the GPU cluster numbers from yesterday\'s meeting?',
    timestamp: '10:14 AM',
    isRead: true
  },
  {
    id: 'msg-2',
    senderId: 'user-current',
    receiverId: 'emp-1',
    text: 'Yes Sarah! The 4-bit quantization proposal looks promising. We can keep costs under CFO Elena\'s $180k budget cap.',
    timestamp: '10:18 AM',
    isRead: true
  },
  {
    id: 'msg-3',
    senderId: 'emp-1',
    receiverId: 'user-current',
    text: 'Awesome. I will update the action item status and share the benchmark script with David.',
    timestamp: '10:22 AM',
    isRead: false
  }
];

// ── Coco Chat Message type (shared between context and CocoChatView) ──────
export interface CocoChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  citations: Array<{ filename: string; timestamp: string; speaker: string; excerpt?: string }>;
  ts: string;
}

interface AppContextType {
  currentUser: UserProfile;
  updateCurrentUser: (updated: Partial<UserProfile>) => void;
  switchDemoUser: (employeeId: string) => void;
  isLoggedIn: boolean;
  login: (username: string, pass: string) => boolean;
  logout: () => void;

  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;

  employees: Employee[];
  meetings: Meeting[];
  contradictions: Contradiction[];
  actionItems: ActionItem[];
  personalDashboard: api.BackendDashboard | null;
  toggleActionItem: (id: string) => void;
  selectedMeetingId: string | null;
  setSelectedMeetingId: (id: string | null) => void;
  deleteMeeting: (meetingId: string) => Promise<void>;
  stopAllProcessing: () => void;
  enterMeetingRoom: (roomCode: string, title?: string) => void;
  cancelScheduledMeeting: (meetingId: string) => Promise<void>;
  rejectMeetingInvitation: (meetingId: string, userName?: string) => void;
  acceptMeetingInvitation: (meetingId: string) => void;
  addLiveMeetingIntelligence: (meeting: Meeting) => void;
  pendingJoinRoomCode: string | null;
  setPendingJoinRoomCode: (code: string | null) => void;
  processAudioForMeeting: (meetingId: string, file: File | { name: string; size?: number }, initialMeeting?: Meeting) => void;
  refreshMeetings: () => Promise<void>;
  addMeeting: (meetingData: {
    title: string;
    description: string;
    date: string;
    startTime: string;
    endTime: string;
    department: string;
    participantIds: string[];
    roomCode?: string;
  }) => Promise<boolean>;

  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;

  directMessages: DirectMessage[];
  selectedChatUserId: string;
  setSelectedChatUserId: (id: string) => void;
  sendDirectMessage: (receiverId: string, text: string) => void;
  openChatWithUser: (employeeId: string) => void;

  isDmDrawerOpen: boolean;
  setIsDmDrawerOpen: (open: boolean) => void;
  activeDmParticipant: Employee | null;
  setActiveDmParticipant: (emp: Employee | null) => void;
  openDmWithUser: (userOrIdOrName: string) => void;
  closeDmDrawer: () => void;

  isCreateMeetingOpen: boolean;
  setIsCreateMeetingOpen: (open: boolean) => void;

  // Persistent Coco chat history (survives tab navigation, keyed per user)
  cocoChatHistory: CocoChatMessage[];
  setCocoChatHistory: React.Dispatch<React.SetStateAction<CocoChatMessage[]>>;
  clearCocoChatHistory: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem('corporate_brain_current_user');
      return saved ? (JSON.parse(saved) as UserProfile) : INITIAL_USER_PROFILE;
    } catch {
      return INITIAL_USER_PROFILE;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('corporate_brain_current_user', JSON.stringify(currentUser));
    } catch {
      /* ignore */
    }
    // The memory-graph endpoints identify the caller via X-User-Name (see
    // backend/app/core/auth.py) rather than trusting a body/query param.
    api.setApiIdentity(currentUser.name);
  }, [currentUser]);

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('corporate_brain_is_logged_in');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('corporate_brain_is_logged_in', JSON.stringify(isLoggedIn));
    } catch {
      /* ignore */
    }
  }, [isLoggedIn]);

  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  
  const [employees] = useState<Employee[]>(initialEmployees);
  const [meetings, setMeetings] = useState<Meeting[]>(() => {
    try {
      const saved = localStorage.getItem('corporate_brain_meetings');
      if (!saved) return initialMeetings;
      const parsed: Meeting[] = JSON.parse(saved);
      // Strip any meeting that was mid-processing when the page last closed.
      // These are "ghost" meetings — the in-memory poll loop is gone and the
      // backend task ID may no longer exist. Show only stable meetings.
      const FINAL_STATUSES = new Set(['Completed', 'Scheduled', 'Failed']);
      return parsed.filter(m => FINAL_STATUSES.has(m.status as string));
    } catch {
      return initialMeetings;
    }
  });

  // Lets refreshMeetingsFromBackend read the latest meetings without taking
  // a `meetings` dependency (which would recreate that callback, and the
  // polling interval effect below it, on every single state update).
  const meetingsRef = useRef<Meeting[]>(meetings);
  useEffect(() => {
    meetingsRef.current = meetings;
  }, [meetings]);

  useEffect(() => {
    try {
      localStorage.setItem('corporate_brain_meetings', JSON.stringify(meetings));
    } catch {
      /* ignore */
    }
  }, [meetings]);

  const [contradictions] = useState<Contradiction[]>(initialContradictions);
  const [actionItems, setActionItems] = useState<ActionItem[]>(initialActionItems);
  const [personalDashboard, setPersonalDashboard] = useState<api.BackendDashboard | null>(null);

  const [notifications, setNotifications] = useState<Notification[]>(() => {
    try {
      const saved = localStorage.getItem('corporate_brain_notifications');
      return saved ? JSON.parse(saved) : initialNotifications;
    } catch {
      return initialNotifications;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('corporate_brain_notifications', JSON.stringify(notifications));
    } catch {
      /* ignore */
    }
  }, [notifications]);

  // Load this employee's real notifications from the backend — currently
  // only ever written server-side when someone invites them to a meeting
  // (see backend/app/api/meetings.py), so this is what makes an invite
  // visible on a device other than the one it was sent from. Tagging each
  // with recipientName lets the existing userNotifications filter below
  // scope them per demo user without any extra plumbing. A standalone
  // function (not just an effect body) so both the mount/user-switch
  // effect below and the cross-device polling effect further down can
  // call it.
  const refreshNotificationsFromBackend = React.useCallback(async () => {
    const backendNotifs = await api.getNotifications();
    if (backendNotifs.length === 0) return;
    const tagged = backendNotifs.map((n) => ({ ...n, recipientName: currentUser.name }));
    setNotifications((prev) => [...tagged, ...prev.filter((n) => !tagged.some((t) => t.id === n.id))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.name]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await refreshNotificationsFromBackend();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.name]);

  // Real-time cross-tab & session sync for meetings and notifications
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'corporate_brain_meetings' && e.newValue) {
        try { setMeetings(JSON.parse(e.newValue)); } catch {}
      }
      if (e.key === 'corporate_brain_notifications' && e.newValue) {
        try { setNotifications(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const [directMessages, setDirectMessages] = useState<DirectMessage[]>(initialDirectMessages);

  // Load this employee's real direct messages from the backend — every
  // message either side of a conversation sent, across every contact —
  // so a conversation shows up on any device either party logs into,
  // not just the one it was sent from. Standalone function so both the
  // mount/user-switch effect and the cross-device polling effect further
  // down can call it.
  const refreshDirectMessagesFromBackend = React.useCallback(async () => {
    const backendMessages = await api.getDirectMessages();
    if (backendMessages.length === 0) return;
    const idFor = (name: string) => employees.find(e => e.name.toLowerCase() === name.toLowerCase())?.id || name;
    const converted: DirectMessage[] = backendMessages.map((m) => ({
      id: m.id,
      senderId: idFor(m.sender_name),
      receiverId: idFor(m.receiver_name),
      text: m.text,
      timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: m.is_read,
    }));
    setDirectMessages((prev) => [...prev.filter((m) => !converted.some((c) => c.id === m.id)), ...converted]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await refreshDirectMessagesFromBackend();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.name]);
  const [selectedChatUserId, setSelectedChatUserId] = useState<string>('emp-1');
  const [isCreateMeetingOpen, setIsCreateMeetingOpen] = useState<boolean>(false);

  // ── Coco chat history: persisted per user in localStorage ──────────────
  const [cocoChatHistory, setRawCocoChatHistory] = useState<CocoChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(`coco_chat_${currentUser.email || 'guest'}`);
      return saved ? (JSON.parse(saved) as CocoChatMessage[]) : [];
    } catch {
      return [];
    }
  });

  // Load history whenever user logs in, switches profile, or isLoggedIn changes.
  // localStorage first for an instant paint, then the backend's copy (if any)
  // replaces it — the backend is the durable, cross-device source now that
  // CocoChatView.tsx writes every new message through api.appendCocoMessage;
  // an empty backend result just means this employee has no synced history
  // yet, so the local copy (if any) is left as-is rather than being wiped.
  useEffect(() => {
    if (!isLoggedIn) return;
    const email = currentUser.email || 'guest';
    try {
      const saved = localStorage.getItem(`coco_chat_${email}`);
      setRawCocoChatHistory(saved ? (JSON.parse(saved) as CocoChatMessage[]) : []);
    } catch {
      setRawCocoChatHistory([]);
    }

    let cancelled = false;
    (async () => {
      const backendHistory = await api.getCocoHistory();
      if (cancelled || backendHistory.length === 0) return;
      const converted: CocoChatMessage[] = backendHistory.map((m) => ({
        id: m.id,
        role: m.role === 'ai' ? 'ai' : 'user',
        text: m.text,
        citations: m.citations,
        ts: m.created_at,
      }));
      setRawCocoChatHistory(converted);
      try {
        localStorage.setItem(`coco_chat_${email}`, JSON.stringify(converted));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser.email, isLoggedIn]);

  // Handler passed to components — updates state AND persists to localStorage
  const setCocoChatHistory: React.Dispatch<React.SetStateAction<CocoChatMessage[]>> = (action) => {
    setRawCocoChatHistory(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      const email = currentUser.email || 'guest';
      try {
        localStorage.setItem(`coco_chat_${email}`, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const clearCocoChatHistory = () => {
    setRawCocoChatHistory([]);
    const email = currentUser.email || 'guest';
    try { localStorage.removeItem(`coco_chat_${email}`); } catch { /* ignore */ }
    api.clearCocoHistoryApi().catch(() => {});
  };

  // Load real meetings from the backend (docs/IMPLEMENTATION_PLAN.md Phase 5)
  // and merge them ahead of the bundled mock data. If the backend isn't
  // running (e.g. frontend-only dev work, or Task 9.2's live-processing
  // fallback), this silently no-ops and the app keeps working on mock data.
  // Pulled out into a standalone function (not just an effect body) so a
  // Person rename (see KnowledgeGraphView's handleSaveLabel, which patches
  // every affected meeting's stored speaker/assignee text server-side) can
  // re-run this and have Decisions/Action Items/Transcript — and Dashboard's
  // "My Action Tasks", which matches assignee text against currentUser.name
  // — reflect the corrected name immediately, not just after a hard reload.
  const refreshMeetingsFromBackend = React.useCallback(async () => {
    try {
      const items = await api.listMeetings();
      if (items.length === 0) return;

      // Promise.all rejects (and discards every already-fetched meeting)
      // the moment a single item throws — one meeting with an unexpected
      // real-mode extraction shape used to silently blank out the entire
      // list, including previously-working ones. allSettled means one bad
      // meeting is skipped (and logged) instead of taking the rest down.
      const results = await Promise.allSettled(
        items.map(async (item) => {
          const [summary, transcript, graphData] = await Promise.all([
            api.getMeetingSummary(item.id),
            api.getMeetingTranscript(item.id),
            api.getGraphData(item.id),
          ]);
          // Base the merge on whatever this meeting already looked like
          // locally, not a bare {id, title, project} stub — mergeBackendIntoMeeting
          // falls back to base.decisions/actionItems/transcript/etc. whenever
          // the backend isn't done processing yet (summary/transcript still
          // null), so a bare stub here wiped those fields to empty on every
          // 45s poll that ran ahead of the backend's own pipeline, erasing
          // intelligence that was already showing (e.g. a live meeting's
          // client-synthesized decisions right after a participant left the
          // call, before the backend's own summary had finished).
          const existing = meetingsRef.current.find((m) => m.id === item.id);
          return api.mergeBackendIntoMeeting(
            existing || { id: item.id, title: item.title, project: item.project || 'Unassigned' },
            item,
            summary,
            transcript,
            graphData
          );
        })
      );

      const loaded: Meeting[] = [];
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          // AI-extracted participants are whoever the model actually heard
          // in the recording — for a real upload that's real names, not
          // necessarily the demo's currentUser. Without this, any meeting
          // where currentUser wasn't personally on the call is invisible
          // in every "my meetings" personalized view (Dashboard, Meeting
          // Intelligence both filter on participant name) from the very
          // first page load, even though it's genuinely fully processed.
          loaded.push(ensureCurrentUserIsParticipant(result.value, currentUser.name));
        } else {
          console.error(`[Corporate Brain] Failed to load meeting ${items[i].id} ("${items[i].title}"):`, result.reason);
        }
      });

      if (loaded.length > 0) {
        setMeetings((prev) => [...loaded, ...prev.filter((m) => !loaded.some((l) => l.id === m.id))]);
      }
    } catch (e) {
      console.warn('[Corporate Brain] Backend not reachable, staying on demo data:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.name]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await refreshMeetingsFromBackend();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshPersonalDashboardFromBackend = React.useCallback(async () => {
    try {
      const dashboard = await api.getUserDashboard(currentUser.name);
      setPersonalDashboard(dashboard);
    } catch {
      setPersonalDashboard(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.name]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await refreshPersonalDashboardFromBackend();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.name]);

  // Cross-device polling: none of the refresh functions above ever re-run
  // on their own after the initial mount/user-switch fetch, so a change
  // made on a different device (or even a different tab of this one) only
  // ever shows up here after a manual page reload. 45s was too coarse in
  // practice — an invitee could sit staring at an empty dashboard for the
  // better part of a minute after being invited. 10s is still cheap for a
  // demo-scale backend and cuts that wait to something that doesn't feel
  // broken.
  useEffect(() => {
    const POLL_INTERVAL_MS = 10_000;

    const runPoll = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshMeetingsFromBackend();
      void refreshNotificationsFromBackend();
      void refreshDirectMessagesFromBackend();
      void refreshPersonalDashboardFromBackend();
    };

    const interval = setInterval(runPoll, POLL_INTERVAL_MS);

    // Backgrounded tabs skip every tick above (no point polling what isn't
    // shown), which used to mean coming back to the tab still waited a full
    // interval for the next scheduled tick — e.g. switch away right after
    // being invited, switch back a minute later, and still see nothing for
    // up to another 45s. Refresh immediately the moment the tab becomes
    // visible again instead of waiting for the timer to catch up.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') runPoll();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshMeetingsFromBackend, refreshNotificationsFromBackend, refreshDirectMessagesFromBackend, refreshPersonalDashboardFromBackend]);

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read).length;
  }, [notifications]);

  const login = (username: string, pass: string) => {
    if (!username.trim()) return false;
    const cleanName = username.trim();
    const matchedEmp = initialEmployees.find(
      (e) => e.name.toLowerCase() === cleanName.toLowerCase() || e.name.toLowerCase().includes(cleanName.toLowerCase())
    );

    if (matchedEmp) {
      setCurrentUser(prev => ({
        ...prev,
        id: matchedEmp.id,
        name: matchedEmp.name,
        email: matchedEmp.email,
        role: matchedEmp.role,
        title: matchedEmp.role,
        department: matchedEmp.department,
        avatarUrl: matchedEmp.avatarUrl || prev.avatarUrl
      }));
    } else {
      setCurrentUser(prev => ({
        ...prev,
        name: cleanName,
        email: `${cleanName.toLowerCase().replace(/\s+/g, '.')}@corpbrain.ai`
      }));
    }

    setIsLoggedIn(true);
    return true;
  };

  const logout = () => {
    // Clear display state for signed-out view while preserving localStorage history intact
    setRawCocoChatHistory([]);
    setIsLoggedIn(false);
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    // Silently no-ops (404) for local-only notifications that were never
    // written server-side — only ones from api.getNotifications() exist to
    // mark read on the backend.
    api.markNotificationRead(id).catch(() => {});
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    api.markAllNotificationsRead().catch(() => {});
  };

  // Selected meeting state with persistent storage
  const [selectedMeetingId, setSelectedMeetingIdState] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('cb_selected_meeting_id') || null;
    } catch {
      return null;
    }
  });

  const setSelectedMeetingId = (id: string | null) => {
    setSelectedMeetingIdState(id);
    try {
      if (id) sessionStorage.setItem('cb_selected_meeting_id', id);
      else sessionStorage.removeItem('cb_selected_meeting_id');
    } catch {}
  };

  const [pendingJoinRoomCode, setPendingJoinRoomCode] = useState<string | null>(null);

  const deleteMeeting = async (meetingId: string) => {
    setMeetings(prev => prev.filter(m => m.id !== meetingId));
    setActionItems(prev => prev.filter(a => a.meetingId !== meetingId));
    setNotifications(prev => prev.filter(n => n.meetingId !== meetingId));
    if (selectedMeetingId === meetingId) setSelectedMeetingId(null);

    try {
      await api.deleteMeeting(meetingId);
    } catch (err) {
      console.warn('[Corporate Brain] Backend delete notice:', err);
    }
  };

  const stopAllProcessing = async () => {
    const processingIds = meetings
      .filter(m => m.status !== 'Completed' && m.status !== 'Scheduled')
      .map(m => m.id);

    setMeetings(prev => prev.filter(m => m.status === 'Completed' || m.status === 'Scheduled'));

    for (const id of processingIds) {
      try {
        await api.deleteMeeting(id);
      } catch {}
    }
  };

  const enterMeetingRoom = (roomCode: string, title?: string) => {
    setPendingJoinRoomCode(roomCode);
    setActiveTab('live-meeting');
  };

  const cancelScheduledMeeting = async (meetingId: string) => {
    // Wait for backend confirmation before removing locally — an optimistic
    // removal followed by a fire-and-forget delete meant any delete failure
    // (backend cold-start, a transient error) was invisible: the card
    // vanished immediately but the meeting was still there server-side, so
    // the next poll (see the 45s cross-device refresh above) brought it
    // right back with no indication anything had gone wrong.
    const ok = await api.deleteMeeting(meetingId);
    if (ok) {
      setMeetings(prev => prev.filter(m => m.id !== meetingId));
    } else {
      console.warn('[Corporate Brain] Could not cancel meeting on the backend:', meetingId);
      window.alert('Could not cancel the meeting — please check your connection and try again.');
    }
  };

  const rejectMeetingInvitation = (meetingId: string, userName?: string) => {
    setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, participants: (m.participants || []).filter(p => typeof p === 'string' ? p !== currentUser.name : (p as any).name !== currentUser.name) } : m));
    api.setMeetingRsvp(meetingId, 'declined').catch(err => console.warn('[Corporate Brain] Could not decline invitation on the backend:', err));
  };

  // Joining a scheduled meeting you were invited to (rather than hosting)
  // implicitly accepts it — the same "accepted" RSVP the host is auto-given
  // at creation. Fire-and-forget: joining the room is the real user-facing
  // action, this just keeps the backend's record of who's coming in sync.
  const acceptMeetingInvitation = (meetingId: string) => {
    api.setMeetingRsvp(meetingId, 'accepted').catch(err => console.warn('[Corporate Brain] Could not accept invitation on the backend:', err));
  };

  const addLiveMeetingIntelligence = (meeting: Meeting) => {
    setMeetings(prev => [meeting, ...prev.filter(m => m.id !== meeting.id)]);
  };

    const toggleActionItem = (id: string) => {
    let completedItem: ActionItem | null = null;
    let parentMeetingTitle = '';

    setActionItems(prev => prev.map(item => {
      if (item.id === id) {
        const isDone = item.status === 'Completed';
        const newStatus = isDone ? 'Pending' : 'Completed';
        const updated = { ...item, status: newStatus as any };
        if (!isDone) {
          completedItem = updated;
        }
        return updated;
      }
      return item;
    }));

    setMeetings(prev => prev.map(mtg => {
      if (mtg.actionItems) {
        const updatedItems = mtg.actionItems.map(item => {
          if (item.id === id) {
            const isDone = item.status === 'Completed';
            const newStatus = isDone ? 'Pending' : 'Completed';
            const updated = { ...item, status: newStatus as any };
            if (!isDone) {
              completedItem = updated;
              parentMeetingTitle = mtg.title;
            }
            return updated;
          }
          return item;
        });
        return { ...mtg, actionItems: updatedItems };
      }
      return mtg;
    }));

    if (completedItem) {
      const item: ActionItem = completedItem;
      const assigneeName = item.assignee || currentUser.name;
      const mtgTitle = parentMeetingTitle || item.meetingTitle || 'Team Sync';

      const targetMeeting = meetings.find(m => m.id === item.meetingId || m.title === mtgTitle);
      const participants = targetMeeting ? targetMeeting.participants : employees.map(e => e.name);

      const completionNotifications: Notification[] = participants
        .filter(pName => pName.toLowerCase() !== assigneeName.toLowerCase())
        .map((pName, idx) => ({
          id: `notif-done-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
          title: 'Action Item Completed ✅',
          message: `${assigneeName} completed the task: '${item.task}' for meeting '${mtgTitle}'`,
          timestamp: 'Just now',
          read: false,
          category: 'action_item',
          type: 'ACTION_ITEM_COMPLETED',
          meetingId: item.meetingId,
          senderName: assigneeName,
          recipientName: pName,
          targetTab: 'meetings'
        }));

      setNotifications(prev => [...completionNotifications, ...prev]);
    }
  };

  const processAudioForMeeting = (meetingId: string, file: File | { name: string; size?: number }, initialMeeting?: Meeting) => {
    const fileName = 'name' in file ? file.name : 'meeting_recording.mp4';
    const fileSizeStr = 'size' in file && file.size ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : '18.4 MB';

    const cleanTitle = fileName
      .replace(/\.[^/.]+$/, '')
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());

    const fallbackMeeting: Meeting = {
      id: meetingId,
      title: initialMeeting?.title || cleanTitle || 'Uploaded Meeting Sync',
      project: initialMeeting?.project || 'General',
      dateTime: initialMeeting?.dateTime || `${new Date().toISOString().split('T')[0]} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      participants: initialMeeting?.participants || [currentUser.name],
      status: 'Preprocessing',
      progressPercentage: 15,
      currentStepMessage: 'Extracting audio (ffmpeg: video → 16kHz WAV)...',
      audioFileName: fileName,
      fileSize: fileSizeStr,
      duration: initialMeeting?.duration || '45m',
      decisions: [],
      actionItems: [],
      transcript: []
    };

    setMeetings(prev => {
      const exists = prev.some(m => m.id === meetingId);
      if (exists) {
        return prev.map(m => m.id === meetingId ? {
          ...m,
          status: 'Preprocessing' as any,
          progressPercentage: 15,
          currentStepMessage: 'Extracting audio (ffmpeg: video → 16kHz WAV)...',
          audioFileName: fileName,
          fileSize: fileSizeStr
        } : m);
      } else {
        return [fallbackMeeting, ...prev];
      }
    });

    const mtgTitle = initialMeeting?.title || fallbackMeeting.title;

    // Guard: don't poll if this meeting is already completed in state
    const alreadyDone = meetings.some(m => m.id === meetingId && m.status === 'Completed');
    if (alreadyDone) {
      console.info('[CorporateBrain] processAudioForMeeting: meeting', meetingId, 'already completed, skipping poll.');
      return;
    }

    // Track active poll tokens per meetingId to avoid duplicate polling
    // (e.g. if called twice with same ID)
    const pollToken = Symbol('poll-' + meetingId);

    let pollCount = 0;
    const maxPolls = 180;  // 3 minutes max

    const poll = async (): Promise<void> => {
      pollCount++;
      try {
        const taskStatus = await api.getTaskStatus(meetingId);
        const pct = taskStatus.progress_percentage || Math.min(95, 15 + pollCount * 5);

        if (taskStatus.status === 'completed') {
          const [summary, transcript, graphData] = await Promise.all([
            api.getMeetingSummary(meetingId),
            api.getMeetingTranscript(meetingId),
            api.getGraphData(meetingId),
          ]);

          const listItem: api.BackendMeetingListItem = {
            id: meetingId,
            title: mtgTitle,
            project: initialMeeting?.project || null,
            date: null,
            status: 'completed',
            progress: 100,
            decisions_count: summary?.decisions?.length || 0,
            action_items_count: summary?.action_items?.length || 0,
            flags_count: 0,
          };

          setMeetings(prev => {
            return prev.map(m => {
              if (m.id !== meetingId) return m;
              const merged = api.mergeBackendIntoMeeting(m, listItem, summary, transcript, graphData);
              return {
                ...ensureCurrentUserIsParticipant(merged, currentUser.name),
                id: meetingId,
                status: 'Completed',
                progressPercentage: 100,
                currentStepMessage: 'Complete (Meeting intelligence indexed to memory graph)'
              };
            });
          });

          if (summary?.action_items?.length) {
            const newActions = summary.action_items.map((a, i) => api.toActionItem(a, meetingId, i));
            setActionItems(prev => [...newActions, ...prev.filter(item => item.meetingId !== meetingId)]);
          }

          setNotifications(prev => [
            {
              id: `notif-ai-${Date.now()}`,
              title: 'Meeting Intelligence Ready ✨',
              message: `Transcript (${transcript?.transcript?.length || 0} segments) and Decisions for "${mtgTitle}" are now indexed.`,
              timestamp: 'Just now',
              read: false,
              category: 'ai_pipeline',
              type: 'AI_READY',
              meetingId: meetingId,
              targetTab: 'meetings'
            },
            ...prev
          ]);
        } else if (taskStatus.status === 'failed') {
          setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, status: 'Failed' } : m));
        } else {
          setMeetings(prev => prev.map(m => {
            if (m.id !== meetingId) return m;
            return {
              ...m,
              progressPercentage: pct,
              currentStepMessage: pct < 30 ? 'Extracting audio (ffmpeg: video → 16kHz WAV)...'
                : pct < 50 ? 'Deepgram detecting speakers & transcribing...'
                : pct < 70 ? 'Gemini Vision reading participant nameplates...'
                : pct < 90 ? 'Gemini AI extracting decisions & action items...'
                : 'Saving meeting intelligence to storage & memory graph...'
            };
          }));

          if (pollCount < maxPolls) {
            setTimeout(poll, 1000);
          }
        }
      } catch (err: any) {
        const is404 = err?.message?.includes('404') || err?.status === 404;
        if (is404 && pollCount > 15) {
          console.warn('[Corporate Brain] Task not found on server (container restarted). Stopping poll for:', meetingId);
          setMeetings(prev => prev.map(m => m.id === meetingId ? {
            ...m,
            status: 'Failed' as any,
            currentStepMessage: 'Processing interrupted by server restart. Please upload again.'
          } : m));
          return;
        }

        if (pollCount < maxPolls) {
          const simulatedPct = Math.min(92, 15 + pollCount * 6);
          setMeetings(prev => prev.map(m => {
            if (m.id !== meetingId) return m;
            return {
              ...m,
              progressPercentage: simulatedPct,
              currentStepMessage: simulatedPct < 30 ? 'Extracting audio (ffmpeg: video → 16kHz WAV)...'
                : simulatedPct < 50 ? 'Deepgram detecting speakers & transcribing...'
                : simulatedPct < 70 ? 'Gemini Vision reading participant nameplates...'
                : 'Gemini AI extracting decisions & action items...'
            };
          }));
          setTimeout(poll, 1200);
        }
      }
    };

    setTimeout(poll, 1000);
  };

  const addMeeting = async (data: {
    title: string;
    description: string;
    date: string;
    startTime: string;
    endTime: string;
    department: string;
    participantIds: string[];
    roomCode?: string;
  }) => {
    const participantNames = data.participantIds.map(id => {
      const emp = employees.find(e => e.id === id);
      return emp ? emp.name : id;
    });
    const timeRange = `${data.startTime} - ${data.endTime}`;

    // Schedule on the backend first so the meeting and every invitee's RSVP
    // exist server-side from the start — otherwise this only ever lived in
    // this browser's localStorage, invisible to any other device the same
    // (or an invited) user logs into. Falls back to the old local-only
    // record if the backend can't be reached, same graceful-degradation
    // pattern as the rest of this app.
    let newMeetingId = `mtg-${Date.now()}`;
    let assignedRoomCode = (data.roomCode || `CORP-${Math.random().toString(36).substring(2, 6).toUpperCase()}`).trim();
    let scheduledOnBackend = false;
    try {
      const created = await api.scheduleMeeting({
        title: data.title,
        project: `${data.department} Sync`,
        date: data.date,
        time_range: timeRange,
        department: data.department,
        participant_names: participantNames,
      });
      newMeetingId = created.id;
      assignedRoomCode = created.room_id || assignedRoomCode;
      scheduledOnBackend = true;
    } catch (err) {
      console.warn('[Corporate Brain] Could not schedule meeting on the backend, staying local-only:', err);
    }

    const newMeeting: Meeting = {
      id: newMeetingId,
      title: data.title,
      project: `${data.department} Sync`,
      dateTime: `${data.date} ${data.startTime}`,
      timeRange,
      department: data.department,
      participants: Array.from(new Set([...participantNames, currentUser.name])),
      status: 'Scheduled',
      duration: '60 mins',
      summary: data.description || 'Newly scheduled team meeting.',
      decisions: [],
      actionItems: [],
      transcript: [],
      roomCode: assignedRoomCode,
      hostName: currentUser.name,
      hostEmail: currentUser.email
    };

    setMeetings(prev => [newMeeting, ...prev]);

    // The backend already wrote a real notification for each invitee (see
    // POST /meetings) when scheduling succeeded there — that's the only path
    // that ever reaches another person's account. When scheduling failed,
    // this meeting only exists in this browser, so participantIds never
    // actually got invited — surface that honestly instead of a
    // self-congratulatory "Invitation Sent" notification only the host will
    // ever see, which used to claim success while nothing was sent.
    if (!scheduledOnBackend) {
      const newNotifications: Notification[] = data.participantIds.map((empId, index) => {
        const emp = employees.find(e => e.id === empId);
        const recipientName = emp ? emp.name : 'Participant';
        return {
          id: `notif-invite-${Date.now()}-${index}`,
          title: `⚠️ Invitation Not Sent`,
          message: `Could not reach the server to invite ${recipientName} to "${data.title}" — they will NOT see this meeting until it's rescheduled successfully.`,
          timestamp: 'Just now',
          read: false,
          category: 'meeting',
          type: 'INVITATION',
          meetingId: newMeetingId,
          senderName: currentUser.name,
          recipientName: recipientName,
          targetTab: 'meetings'
        };
      });

      setNotifications(prev => [...newNotifications, ...prev]);
    }
    setIsCreateMeetingOpen(false);
    return scheduledOnBackend;
  };

  const [isDmDrawerOpen, setIsDmDrawerOpen] = useState<boolean>(false);
  const [activeDmParticipant, setActiveDmParticipant] = useState<Employee | null>(null);

  const openDmWithUser = (userOrIdOrName: string) => {
    const query = userOrIdOrName.toLowerCase().trim();
    const emp = employees.find(e => 
      e.id === userOrIdOrName || 
      e.name.toLowerCase() === query || 
      e.name.toLowerCase().includes(query)
    );
    if (emp) {
      setActiveDmParticipant(emp);
      setIsDmDrawerOpen(true);
      api.markThreadRead(emp.name).catch(() => {});
    }
  };

  const closeDmDrawer = () => {
    setIsDmDrawerOpen(false);
  };

  const sendDirectMessage = async (receiverId: string, text: string) => {
    if (!text.trim()) return;
    const recipient = employees.find(e =>
      e.id === receiverId ||
      e.name.toLowerCase() === receiverId.toLowerCase() ||
      e.name.toLowerCase().includes(receiverId.toLowerCase())
    );

    const recipientId = recipient ? recipient.id : receiverId;
    const recipientName = recipient ? recipient.name : receiverId;

    const newMsg: DirectMessage = {
      id: `msg-${Date.now()}`,
      senderId: currentUser.id,
      receiverId: recipientId,
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRead: true
    };
    setDirectMessages(prev => [...prev, newMsg]);

    // Sends to the backend so the recipient sees this message (and its
    // notification) on whatever device they're actually on, not just this
    // one — mirrors the meeting-invite sync above. The backend writes its
    // own NotificationRecord for the recipient (see POST /messages), so the
    // local notification below only fires as a fallback when that couldn't
    // happen — otherwise the same device would show it twice if it later
    // switches to viewing as the recipient.
    let deliveredViaBackend = false;
    try {
      await api.sendDirectMessageApi(recipientName, text.trim());
      deliveredViaBackend = true;
    } catch (err) {
      console.warn('[Corporate Brain] Could not deliver message via backend, staying local-only:', err);
    }

    if (!deliveredViaBackend) {
      const dmNotification: Notification = {
        id: `notif-dm-${Date.now()}`,
        title: `New Direct Message`,
        message: `${currentUser.name}: ${text.trim()}`,
        timestamp: 'Just now',
        read: false,
        category: 'message',
        type: 'DIRECT_MESSAGE',
        senderName: currentUser.name,
        recipientName: recipientName,
        targetTab: 'meetings'
      };
      setNotifications(prevNotifs => [dmNotification, ...prevNotifs]);
    }
  };

  const openChatWithUser = (employeeId: string) => {
    openDmWithUser(employeeId);
  };

  const updateCurrentUser = (updated: Partial<UserProfile>) => {
    setCurrentUser(prev => ({
      ...prev,
      ...updated
    }));
  };

  const switchDemoUser = (employeeId: string) => {
    const emp = employees.find(e => e.id === employeeId || e.name.toLowerCase().includes(employeeId.toLowerCase()));
    if (emp) {
      setCurrentUser({
        id: emp.id,
        name: emp.name,
        email: emp.email,
        department: emp.department,
        role: emp.role,
        title: emp.role,
        avatarUrl: emp.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        phone: emp.phone || '+1 (555) 000-0000',
        isOnline: true,
        preferences: {
          emailActionItems: true,
          meetingAiAnalysis: true,
          systemUpdates: true,
          contradictionAlerts: true,
          directMessages: true
        }
      });

      // Update active direct messaging contact to another employee
      const otherEmp = employees.find(e => e.id !== emp.id);
      if (otherEmp) {
        setSelectedChatUserId(otherEmp.id);
      }
    }
  };

  // Personalized notification filtering per logged-in user
  const userNotifications = useMemo(() => {
    return notifications.filter(n => {
      if (n.recipientName) {
        return n.recipientName.toLowerCase() === currentUser.name.toLowerCase();
      }
      return true;
    });
  }, [notifications, currentUser]);

  const userUnreadCount = useMemo(() => {
    return userNotifications.filter(n => !n.read).length;
  }, [userNotifications]);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        updateCurrentUser,
        switchDemoUser,
        isLoggedIn,
        login,
        logout,
        activeTab,
        setActiveTab,
        employees,
        meetings,
        contradictions,
        actionItems,
        personalDashboard,
        toggleActionItem,
        selectedMeetingId,
        setSelectedMeetingId,
        deleteMeeting,
        stopAllProcessing,
        enterMeetingRoom,
        cancelScheduledMeeting,
        rejectMeetingInvitation,
        acceptMeetingInvitation,
        addLiveMeetingIntelligence,
        pendingJoinRoomCode,
        setPendingJoinRoomCode,
        processAudioForMeeting,
        refreshMeetings: refreshMeetingsFromBackend,
        addMeeting,
        notifications: userNotifications,
        unreadCount: userUnreadCount,
        markAsRead,
        markAllAsRead,
        directMessages,
        selectedChatUserId,
        setSelectedChatUserId,
        sendDirectMessage,
        openChatWithUser,
        isDmDrawerOpen,
        setIsDmDrawerOpen,
        activeDmParticipant,
        setActiveDmParticipant,
        openDmWithUser,
        closeDmDrawer,
        isCreateMeetingOpen,
        setIsCreateMeetingOpen,
        cocoChatHistory,
        setCocoChatHistory,
        clearCocoChatHistory,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
