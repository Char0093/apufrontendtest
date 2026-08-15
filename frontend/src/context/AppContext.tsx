import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
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

// Mock Employees Directory
const initialEmployees: Employee[] = [
  {
    id: 'emp-0',
    name: 'Alex Mercer',
    email: 'alex.mercer@corpbrain.ai',
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
    name: 'Sarah Jenkins',
    email: 'sarah.jenkins@corpbrain.ai',
    phone: '+1 (555) 234-5678',
    department: 'Engineering',
    role: 'VP of Engineering',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    isOnline: true,
    location: 'San Francisco, CA',
    bio: 'Overseeing core cloud infrastructure and AI intelligence pipelines.'
  },
  {
    id: 'emp-2',
    name: 'Marcus Vance',
    email: 'marcus.vance@corpbrain.ai',
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
    name: 'Elena Rostova',
    email: 'elena.rostova@corpbrain.ai',
    phone: '+1 (555) 456-7890',
    department: 'Finance & Operations',
    role: 'Chief Financial Officer',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    isOnline: false,
    location: 'Chicago, IL',
    bio: 'Budget allocation, enterprise compliance, and resource governance.'
  },
  {
    id: 'emp-4',
    name: 'David Chen',
    email: 'david.chen@corpbrain.ai',
    phone: '+1 (555) 567-8901',
    department: 'Engineering',
    role: 'Principal AI Architect',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    isOnline: true,
    location: 'Seattle, WA',
    bio: 'Specializing in LLM fine-tuning, RAG architecture, and anomaly detection.'
  },
  {
    id: 'emp-5',
    name: 'Amanda Brooks',
    email: 'amanda.brooks@corpbrain.ai',
    phone: '+1 (555) 678-9012',
    department: 'Legal & Compliance',
    role: 'General Counsel',
    avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    isOnline: true,
    location: 'Washington, D.C.',
    bio: 'Regulatory compliance, policy audit trails, and contradiction resolution.'
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
    participants: ['Alex Mercer', 'Sarah Jenkins', 'Elena Rostova'],
    status: 'Completed',
    duration: '45 mins',
    summary: 'The executive committee discussed cloud GPU cluster scaling for the upcoming RAG 2.0 release. CFO Elena highlighted tight budget boundaries for Q3 ($180k max), while Sarah presented hardware cost estimates ($240k). AI anomaly detection flagged a critical budget contradiction across recorded policy limits.',
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
      { id: 't1', speaker: 'Alex Mercer', time: '00:02', text: 'Welcome everyone. Today we are addressing infrastructure capacity for the upcoming Corporate Brain LLM rollout.', sentiment: 'positive' },
      { id: 't2', speaker: 'Sarah Jenkins', time: '02:15', text: 'Our current 8-node GPU cluster is reaching 88% peak memory utilization during business hours. We need to provision $240,000 for additional capacity.', sentiment: 'action' },
      { id: 't3', speaker: 'Elena Rostova', time: '04:40', text: 'Hold on, Sarah. In our July 15 budget meeting, we set a strict Q3 cloud infrastructure ceiling of $180,000. We cannot exceed that limit without board signoff.', sentiment: 'conflict' }
    ]
  },
  {
    id: 'mtg-102',
    title: 'Product Roadmap & AI Contradiction Engine Demo',
    project: 'Coco AI Intelligence',
    dateTime: '2026-08-09 10:30',
    timeRange: '10:30 - 11:30 EST',
    department: 'Product Strategy',
    participants: ['Alex Mercer', 'Marcus Vance', 'David Chen', 'Amanda Brooks'],
    status: 'Completed',
    duration: '60 mins',
    summary: 'Demonstrated the automatic cross-meeting contradiction detection algorithm. Marcus reviewed UI integration for real-time notification alerts, and Amanda confirmed regulatory compliance standards.',
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
      { id: 't6', speaker: 'Marcus Vance', time: '01:00', text: 'The Contradiction Engine scans meeting transcripts in real-time and flags policy conflicts across departments.', sentiment: 'positive' },
      { id: 't7', speaker: 'Amanda Brooks', time: '03:20', text: 'This is crucial for legal audits. If an engineering team changes retention rules without legal review, we get an instant alert.', sentiment: 'action' }
    ]
  },
  {
    id: 'mtg-103',
    title: 'Enterprise Cloud Security & SAML SSO Review',
    project: 'Security & Compliance',
    dateTime: '2026-08-06 11:00',
    timeRange: '11:00 - 12:00 EST',
    department: 'Security & Compliance',
    participants: ['Sarah Jenkins', 'Amanda Brooks', 'David Chen'],
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
      { id: 't8', speaker: 'Sarah Jenkins', time: '01:15', text: 'We are enabling WebAuthn passkeys for all admin infrastructure accounts starting next release.', sentiment: 'positive' }
    ]
  },
  {
    id: 'mtg-104',
    title: 'Q4 Financial Governance & Cost Allocation',
    project: 'Finance & Operations',
    dateTime: '2026-08-05 15:00',
    timeRange: '15:00 - 16:00 EST',
    department: 'Finance & Operations',
    participants: ['Elena Rostova', 'Marcus Vance'],
    status: 'Completed',
    duration: '40 mins',
    summary: 'Elena reviewed Q4 department cost allocations and revenue targets for enterprise licenses.',
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
      { id: 't9', speaker: 'Elena Rostova', time: '02:00', text: 'We will allocate $50,000 for model quantization and cost reduction initiatives.', sentiment: 'positive' }
    ]
  },
  {
    id: 'mtg-105',
    title: 'Upcoming: RAG 2.0 Vector Engine & Graph Ingestion Standup',
    project: 'Core Infrastructure',
    dateTime: '2026-08-14 14:00',
    timeRange: '14:00 - 15:00 EST',
    department: 'Engineering & AI',
    participants: ['Alex Mercer', 'Sarah Jenkins', 'David Chen'],
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
    participants: ['Marcus Vance', 'Elena Rostova'],
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
    participants: ['Amanda Brooks', 'Sarah Jenkins'],
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

interface AppContextType {
  currentUser: UserProfile;
  updateCurrentUser: (updated: Partial<UserProfile>) => void;
  switchDemoUser: (employeeId: string) => void;
  isLoggedIn: boolean;
  login: (email: string, pass: string, dept: string) => boolean;
  logout: () => void;

  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;

  employees: Employee[];
  meetings: Meeting[];
  contradictions: Contradiction[];
  actionItems: ActionItem[];
  personalDashboard: api.BackendDashboard | null;
  toggleActionItem: (id: string) => void;
  processAudioForMeeting: (meetingId: string, file: File | { name: string; size?: number }) => void;
  addMeeting: (meetingData: {
    title: string;
    description: string;
    date: string;
    startTime: string;
    endTime: string;
    department: string;
    participantIds: string[];
  }) => void;

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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile>(INITIAL_USER_PROFILE);
  
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  
  const [employees] = useState<Employee[]>(initialEmployees);
  const [meetings, setMeetings] = useState<Meeting[]>(initialMeetings);
  const [contradictions] = useState<Contradiction[]>(initialContradictions);
  const [actionItems, setActionItems] = useState<ActionItem[]>(initialActionItems);
  const [personalDashboard, setPersonalDashboard] = useState<api.BackendDashboard | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>(initialDirectMessages);
  const [selectedChatUserId, setSelectedChatUserId] = useState<string>('emp-1');
  const [isCreateMeetingOpen, setIsCreateMeetingOpen] = useState<boolean>(false);

  // Load real meetings from the backend (docs/IMPLEMENTATION_PLAN.md Phase 5)
  // and merge them ahead of the bundled mock data. If the backend isn't
  // running (e.g. frontend-only dev work, or Task 9.2's live-processing
  // fallback), this silently no-ops and the app keeps working on mock data.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const items = await api.listMeetings();
        if (cancelled || items.length === 0) return;

        const loaded = await Promise.all(
          items.map(async (item) => {
            const [summary, transcript, graphData] = await Promise.all([
              api.getMeetingSummary(item.id),
              api.getMeetingTranscript(item.id),
              api.getGraphData(item.id),
            ]);
            return api.mergeBackendIntoMeeting(
              { id: item.id, title: item.title, project: item.project || 'Unassigned' },
              item,
              summary,
              transcript,
              graphData
            );
          })
        );

        if (!cancelled) {
          setMeetings((prev) => [...loaded, ...prev.filter((m) => !loaded.some((l) => l.id === m.id))]);
        }
      } catch (e) {
        console.warn('[Corporate Brain] Backend not reachable, staying on demo data:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    api.getUserDashboard(currentUser.name)
      .then((dashboard) => {
        if (!cancelled) setPersonalDashboard(dashboard);
      })
      .catch(() => {
        if (!cancelled) setPersonalDashboard(null);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser.name]);

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read).length;
  }, [notifications]);

  const login = (email: string, pass: string, dept: string) => {
    if (!email) return false;
    setCurrentUser(prev => ({
      ...prev,
      email,
      department: dept || prev.department,
      name: email.split('@')[0].replace('.', ' ').toUpperCase() || 'Alex Mercer'
    }));
    setIsLoggedIn(true);
    return true;
  };

  const logout = () => {
    setIsLoggedIn(false);
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
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

  const processAudioForMeeting = (meetingId: string, file: File | { name: string; size?: number }) => {
    setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, status: 'Preprocessing' as any } : m));

    if (!(file instanceof File)) {
      simulateAudioProcessing(meetingId, file);
      return;
    }

    const targetMtg = meetings.find(m => m.id === meetingId);
    const mtgTitle = targetMtg?.title || 'Meeting Sync';

    (async () => {
      try {
        const { meeting_id: backendId } = await api.uploadMeeting(file, mtgTitle, targetMtg?.project);

        setMeetings(prev => prev.map(m => m.id === meetingId
          ? { ...m, audioFileName: file.name, fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB` }
          : m));

        let hasNotifiedRetry = false;

        const poll = async (): Promise<void> => {
          const taskStatus = await api.getTaskStatus(backendId);
          const listItem: api.BackendMeetingListItem = {
            id: backendId,
            title: mtgTitle,
            project: targetMtg?.project || null,
            date: null,
            status: taskStatus.status,
            progress: taskStatus.progress_percentage,
            decisions_count: 0,
            action_items_count: 0,
            flags_count: 0,
          };

          if (taskStatus.status === 'completed') {
            const [summary, transcript, graphData] = await Promise.all([
              api.getMeetingSummary(backendId),
              api.getMeetingTranscript(backendId),
              api.getGraphData(backendId),
            ]);

            setMeetings(prev => prev.map(m => {
              if (m.id !== meetingId) return m;
              const merged = api.mergeBackendIntoMeeting(m, listItem, summary, transcript, graphData);
              // The AI-extracted participant list won't necessarily include
              // whoever triggered this upload (e.g. DEMO_MODE always returns
              // the same canned names) — without this, a real upload could
              // silently vanish from the "my meetings" personalized views
              // (MeetingIntelligenceView/DashboardView filter on participant
              // name), which is confusing during a live demo.
              const alreadyListed = merged.participants.some(
                p => p.toLowerCase() === currentUser.name.toLowerCase()
              );
              return alreadyListed
                ? merged
                : { ...merged, participants: [...merged.participants, currentUser.name] };
            }));

            setNotifications(prev => [
              {
                id: `notif-asr-${Date.now()}`,
                title: 'AI Analysis Ready ✨',
                message: `Transcript, Decisions, and Action Items for "${mtgTitle}" are now live.`,
                timestamp: 'Just now',
                read: false,
                category: 'ai_pipeline',
                type: 'AI_READY',
                meetingId,
                targetTab: 'meetings'
              },
              ...prev
            ]);
          } else if (taskStatus.status === 'failed') {
            setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, status: 'Failed' as any } : m));
            setNotifications(prev => [
              {
                id: `notif-fail-${Date.now()}`,
                title: 'AI Analysis Failed',
                message: `Processing "${mtgTitle}" failed: ${taskStatus.error_message || 'unknown error'}.`,
                timestamp: 'Just now',
                read: false,
                category: 'ai_pipeline',
                type: 'SYSTEM_ALERT',
                meetingId,
                targetTab: 'meetings'
              },
              ...prev
            ]);
          } else {
            setMeetings(prev => prev.map(m => m.id === meetingId
              ? { ...m, status: api.mapBackendStatus(taskStatus.status, taskStatus.progress_percentage) as any }
              : m));

            if (taskStatus.status === 'retrying' && !hasNotifiedRetry) {
              hasNotifiedRetry = true;
              setNotifications(prev => [
                {
                  id: `notif-retry-${Date.now()}`,
                  title: 'Retrying After a Processing Error',
                  message: `"${mtgTitle}" hit an error and is being retried automatically: ${taskStatus.error_message || 'unknown error'}.`,
                  timestamp: 'Just now',
                  read: false,
                  category: 'ai_pipeline',
                  type: 'SYSTEM_ALERT',
                  meetingId,
                  targetTab: 'meetings'
                },
                ...prev
              ]);
            }

            setTimeout(poll, 2000);
          }
        };

        setTimeout(poll, 1500);
      } catch (e) {
        console.warn('[Corporate Brain] Real upload failed (is the backend running?), falling back to local demo simulation:', e);
        simulateAudioProcessing(meetingId, file);
      }
    })();
  };

  /** Client-side fake pipeline — used for non-File placeholders (no real
   * bytes to upload) or when the real upload above fails, so the demo still
   * works with the backend unreachable (Task 9.2's live-processing
   * fallback). */
  const simulateAudioProcessing = (meetingId: string, file: File | { name: string; size?: number }) => {
    setTimeout(() => {
      const targetMtg = meetings.find(m => m.id === meetingId);
      const mtgTitle = targetMtg?.title || 'Meeting Sync';

      const generatedTranscript = [
        { id: 't-1', time: '00:02', speaker: currentUser.name, text: `Reviewing audio recording "${file.name}" for decision graph extraction.` },
        { id: 't-2', time: '00:18', speaker: 'Sarah Jenkins', text: 'All speech-to-text segments have been indexed with 98.6% ASR confidence.' },
        { id: 't-3', time: '00:45', speaker: 'David Chen', text: 'Decisions and action items are now populated across Corporate Brain.' }
      ];

      const generatedDecisions: Decision[] = [
        { 
          id: `d-${Date.now()}-1`, 
          title: `Processed and indexed audio file ${file.name}`, 
          rationale: 'Extracted speech segments, speaker diarization, and key topics.', 
          evidence: 'Audio waveform ASR sync verified at 98.6% confidence.',
          confidenceScore: 98,
          category: 'Speech & Audio Indexing' 
        },
        { 
          id: `d-${Date.now()}-2`, 
          title: 'Approved technical architecture and action item task distribution', 
          rationale: 'Verified policy against corporate standards.', 
          evidence: 'LLM graph extraction matched enterprise policy node.',
          confidenceScore: 95,
          category: 'Project Roadmap & Execution'
        }
      ];

      const newActionItems: ActionItem[] = [
        {
          id: `act-${Date.now()}-1`,
          task: `Review ASR transcript & verified decisions for ${mtgTitle}`,
          assignee: currentUser.name,
          assigneeAvatar: currentUser.avatarUrl,
          dueDate: 'Tomorrow',
          status: 'Pending',
          priority: 'High',
          meetingId,
          meetingTitle: mtgTitle
        },
        {
          id: `act-${Date.now()}-2`,
          task: `Execute post-meeting action checklist & update task status`,
          assignee: 'Sarah Jenkins',
          assigneeAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
          dueDate: 'In 2 days',
          status: 'Pending',
          priority: 'Medium',
          meetingId,
          meetingTitle: mtgTitle
        }
      ];

      setMeetings(prev => prev.map(m => {
        if (m.id === meetingId) {
          return {
            ...m,
            status: 'Completed',
            audioFileName: file.name,
            fileSize: file.size ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : '18.4 MB',
            transcript: generatedTranscript,
            decisions: generatedDecisions,
            actionItems: newActionItems
          };
        }
        return m;
      }));

      setActionItems(prev => [...newActionItems, ...prev]);

      setNotifications(prev => [
        {
          id: `notif-asr-${Date.now()}`,
          title: 'AI Analysis Ready ✨',
          message: `Transcript, Decisions, and Action Items for "${mtgTitle}" are now live.`,
          timestamp: 'Just now',
          read: false,
          category: 'ai_pipeline',
          type: 'AI_READY',
          meetingId,
          targetTab: 'meetings'
        },
        ...prev
      ]);
    }, 1400);
  };

  const addMeeting = (data: {
    title: string;
    description: string;
    date: string;
    startTime: string;
    endTime: string;
    department: string;
    participantIds: string[];
  }) => {
    const participantNames = data.participantIds.map(id => {
      const emp = employees.find(e => e.id === id);
      return emp ? emp.name : id;
    });

    const newMeetingId = `mtg-${Date.now()}`;
    const newMeeting: Meeting = {
      id: newMeetingId,
      title: data.title,
      project: `${data.department} Sync`,
      dateTime: `${data.date} ${data.startTime}`,
      timeRange: `${data.startTime} - ${data.endTime}`,
      department: data.department,
      participants: [...participantNames, currentUser.name],
      status: 'Scheduled',
      duration: '60 mins',
      summary: data.description || 'Newly scheduled team meeting.',
      decisions: [],
      actionItems: [],
      transcript: []
    };

    setMeetings(prev => [newMeeting, ...prev]);

    const newNotifications: Notification[] = data.participantIds.map((empId, index) => {
      const emp = employees.find(e => e.id === empId);
      const recipientName = emp ? emp.name : 'Participant';
      return {
        id: `notif-invite-${Date.now()}-${index}`,
        title: `Meeting Invitation Sent 📅`,
        message: `${currentUser.name} invited you to "${data.title}" scheduled for ${data.date} at ${data.startTime}.`,
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
    setIsCreateMeetingOpen(false);
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
    }
  };

  const closeDmDrawer = () => {
    setIsDmDrawerOpen(false);
  };

  const sendDirectMessage = (receiverId: string, text: string) => {
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

    // Dispatch In-App Notification directly to recipient
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
        processAudioForMeeting,
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
        setIsCreateMeetingOpen
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
