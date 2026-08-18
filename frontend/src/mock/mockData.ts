import { Meeting, Employee, Notification, UserProfile } from '../types';

export const INITIAL_EMPLOYEES_DATA: Employee[] = [
  {
    id: 'emp-0',
    name: 'Thim Yee Song',
    email: 'thim.yeesong@corpbrain.ai',
    phone: '+1 (555) 123-4567',
    department: 'Product & Executive',
    role: 'VP of Product',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    isOnline: true
  },
  {
    id: 'emp-1',
    name: 'Duncan',
    email: 'duncan@corpbrain.ai',
    phone: '+1 (555) 234-5678',
    department: 'Core Systems',
    role: 'VP of Engineering',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    isOnline: true
  },
  {
    id: 'emp-2',
    name: 'Kam Xin Le',
    email: 'kam.xinle@corpbrain.ai',
    phone: '+1 (555) 345-6789',
    department: 'Product Strategy',
    role: 'Head of Product',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    isOnline: true
  },
  {
    id: 'emp-3',
    name: 'Yap En Yu',
    email: 'yap.enyu@corpbrain.ai',
    phone: '+1 (555) 456-7890',
    department: 'Executive Ops',
    role: 'Chief Financial Officer',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    isOnline: false
  }
];

export const INITIAL_MEETINGS_DATA: Meeting[] = [
  {
    id: 'mtg-001',
    title: 'Q3 Cloud Architecture & GCP Migration Sync',
    project: 'Core Infrastructure',
    dateTime: 'Aug 07, 2026 • 2:30 PM',
    completedAt: 'Aug 07, 2026',
    participants: ['Alice Chen', 'Bob Martinez', 'Elena Rostova', 'Chen Wei'],
    status: 'Completed',
    duration: '45m',
    audioFileName: 'gcp_migration_sync_2026.mp3',
    fileSize: '42.8 MB',
    summary: 'Strategic architectural review aligning team on migrating core graph microservices to GCP Anthos and implementing Redis graph relation caching layer.',
    decisions: [
      {
        id: 'dec-1',
        title: 'Migrate Primary Cloud Provider from AWS to GCP Anthos',
        rationale: 'GCP provides superior Kubernetes node autoscaling speed (40% faster pod startup) and direct BigQuery integration for graph analytics.',
        evidence: '"Our benchmarks show GCP node startup completes in 18 seconds versus 45 seconds on AWS. This directly solves our peak query latency spikes during batch LLM extraction."',
        confidenceScore: 96,
        category: 'Infrastructure',
        impactLevel: 'High'
      },
      {
        id: 'dec-2',
        title: 'Adopt Redis Enterprise Cluster for Graph Relation Cache',
        rationale: 'Caching frequent node traversals in Redis memory reduces graph query latency by 68% and prevents Neo4j RAM overflow during concurrent AI summaries.',
        evidence: '"By placing a Redis cache in front of Neo4j, 70% of read traversals bypass graph disk I/O completely, cutting average response time to under 12ms."',
        confidenceScore: 92,
        category: 'Database Architecture',
        impactLevel: 'High'
      },
      {
        id: 'dec-3',
        title: 'Enforce Mandatory WebAuthn / Passkey 2FA for Admin Service Accounts',
        rationale: 'Enhance enterprise compliance and meet SOC2 Type II audit requirement for automated data extraction pipelines.',
        evidence: '"Auditors flagged legacy API keys as potential vulnerability. WebAuthn hardware tokens will eliminate static API credential leakage."',
        confidenceScore: 98,
        category: 'Security & Compliance',
        impactLevel: 'Medium'
      }
    ],
    actionItems: [
      {
        id: 'act-1',
        task: 'Benchmark GCP BigQuery vs Neo4j graph lookup latency for 1M nodes',
        assignee: 'Chen Wei',
        dueDate: 'Aug 12, 2026',
        status: 'In Progress',
        priority: 'High'
      },
      {
        id: 'act-2',
        task: 'Draft TerraForm IaC deployment scripts for GCP Anthos cluster',
        assignee: 'Alice Chen',
        dueDate: 'Aug 15, 2026',
        status: 'To Do',
        priority: 'High'
      },
      {
        id: 'act-3',
        task: 'Configure WebAuthn 2FA policy in keycloak identity manager',
        assignee: 'Bob Martinez',
        dueDate: 'Aug 10, 2026',
        status: 'Completed',
        priority: 'Medium'
      },
      {
        id: 'act-4',
        task: 'Prepare data migration fallback plan and backup snapshot scripts',
        assignee: 'Elena Rostova',
        dueDate: 'Aug 18, 2026',
        status: 'To Do',
        priority: 'Medium'
      }
    ],
    transcript: [
      {
        id: 't-1',
        speaker: 'Alice Chen',
        time: '00:02',
        text: 'Welcome everyone. Today we are aligning on our monorepo graph backend scaling strategy and GCP migration evaluation.',
        sentiment: 'neutral'
      },
      {
        id: 't-2',
        speaker: 'Elena Rostova',
        time: '01:15',
        text: 'Our current Neo4j deployment is hitting RAM memory limits during real-time speech diarization and entity link extraction.',
        sentiment: 'neutral'
      },
      {
        id: 't-3',
        speaker: 'Chen Wei',
        time: '04:30',
        text: 'I ran a benchmark on the Redis caching layer. By caching frequent node traversals, we can reduce graph lookup latency by 68%.',
        sentiment: 'positive'
      },
      {
        id: 't-4',
        speaker: 'Bob Martinez',
        time: '09:20',
        text: 'Auditors flagged legacy API keys as potential security risks. WebAuthn hardware tokens will eliminate static API credential leakage.',
        sentiment: 'action'
      },
      {
        id: 't-5',
        speaker: 'Alice Chen',
        time: '14:45',
        text: 'Agreed. Let us finalize the decision to migrate cloud infrastructure to GCP Anthos and adopt Redis Enterprise for graph caching.',
        sentiment: 'positive'
      }
    ],
    graphData: {
      nodes: [
        { id: 'Alice Chen', name: 'Alice Chen (VP Eng)', type: 'participant', val: 18, color: '#4f46e5', role: 'VP of Engineering & Cloud Infra', email: 'alice.chen@corporatebrain.ai', phone: '+60 12-345 6789', meetingId: 'mtg-001' },
        { id: 'Bob Martinez', name: 'Bob Martinez (Security Lead)', type: 'participant', val: 18, color: '#4f46e5', role: 'Security & Compliance Lead', email: 'bob.martinez@corporatebrain.ai', phone: '+60 12-987 6543', meetingId: 'mtg-001' },
        { id: 'Elena Rostova', name: 'Elena Rostova (Lead Arch)', type: 'participant', val: 18, color: '#4f46e5', role: 'Principal Software Architect', email: 'elena.rostova@corporatebrain.ai', phone: '+60 12-456 7890', meetingId: 'mtg-001' },
        { id: 'Chen Wei', name: 'Chen Wei (Backend Tech)', type: 'participant', val: 18, color: '#4f46e5', role: 'Senior Backend Tech Lead', email: 'chen.wei@corporatebrain.ai', phone: '+60 12-234 5678', meetingId: 'mtg-001' },
        { id: 'GCP Migration', name: 'Migrate to GCP Anthos', type: 'decision', val: 22, color: '#16a34a', meetingId: 'mtg-001' },
        { id: 'Redis Cache', name: 'Implement Redis Graph Cache', type: 'decision', val: 20, color: '#16a34a', meetingId: 'mtg-001' },
        { id: 'WebAuthn 2FA', name: 'Mandatory WebAuthn 2FA', type: 'decision', val: 18, color: '#16a34a', meetingId: 'mtg-001' },
        { id: 'Benchmark Task', name: 'BigQuery Latency Benchmark', type: 'action', val: 14, color: '#d97706', meetingId: 'mtg-001' },
        { id: 'Terraform Script', name: 'Draft IaC Terraform', type: 'action', val: 14, color: '#d97706', meetingId: 'mtg-001' },
        { id: 'RAM Overflow Risk', name: 'Neo4j RAM Limit Risk', type: 'risk', val: 16, color: '#dc2626', meetingId: 'mtg-001' }
      ],
      links: [
        { source: 'Alice Chen', target: 'GCP Migration', label: 'Approved', meetingId: 'mtg-001' },
        { source: 'Elena Rostova', target: 'RAM Overflow Risk', label: 'Identified', meetingId: 'mtg-001' },
        { source: 'Chen Wei', target: 'Redis Cache', label: 'Proposed', meetingId: 'mtg-001' },
        { source: 'Chen Wei', target: 'Benchmark Task', label: 'Assigned', meetingId: 'mtg-001' },
        { source: 'Alice Chen', target: 'Terraform Script', label: 'Assigned', meetingId: 'mtg-001' },
        { source: 'Bob Martinez', target: 'WebAuthn 2FA', label: 'Proposed', meetingId: 'mtg-001' },
        { source: 'GCP Migration', target: 'RAM Overflow Risk', label: 'Mitigates', meetingId: 'mtg-001' }
      ]
    }
  },
  {
    id: 'mtg-002',
    title: 'Enterprise Client SAML SSO & Security Audit',
    project: 'Security & Compliance',
    dateTime: 'Aug 06, 2026 • 11:00 AM',
    completedAt: 'Aug 06, 2026',
    participants: ['Marcus Vance', 'David Kim', 'Elena Rostova'],
    status: 'Completed',
    duration: '35m',
    audioFileName: 'enterprise_sec_audit.wav',
    fileSize: '31.2 MB',
    summary: 'Executive compliance review covering SOC2 Type II audit requirements, SAML 2.0 Identity Provider setup for enterprise accounts, and automated log retention policy.',
    decisions: [
      {
        id: 'dec-101',
        title: 'Implement SAML 2.0 & Okta Integration for Enterprise Tier',
        rationale: 'Required to unblock $250k ARR pipeline with financial enterprise clients demanding single sign-on.',
        evidence: '"Enterprise buyers specifically require Okta SAML 2.0 metadata endpoints before signing compliance waivers."',
        confidenceScore: 94,
        category: 'Authentication',
        impactLevel: 'High'
      },
      {
        id: 'dec-102',
        title: 'Automate SOC2 Type II Immutable Audit Log Export to AWS S3',
        rationale: 'Fulfills SOC2 security compliance controls by storing encrypted audit trails with 7-year object lock retention.',
        evidence: '"SOC2 auditors explicitly require automated, tamper-proof log shipping to dedicated S3 buckets with object locking enabled."',
        confidenceScore: 98,
        category: 'Compliance',
        impactLevel: 'High'
      },
      {
        id: 'dec-103',
        title: 'Deploy Fine-Grained Role-Based Access Control (RBAC) Policies',
        rationale: 'Restricts production database administrative operations to authenticated security engineers using short-lived tokens.',
        evidence: '"Granular role assignment will prevent unauthorized workspace configuration changes and ensure strict auditability."',
        confidenceScore: 91,
        category: 'Access Control',
        impactLevel: 'Medium'
      }
    ],
    actionItems: [
      {
        id: 'act-101',
        task: 'Publish SAML metadata endpoint and developer integration guides',
        assignee: 'David Kim',
        dueDate: 'Aug 11, 2026',
        status: 'In Progress',
        priority: 'High'
      },
      {
        id: 'act-102',
        task: 'Conduct third-party penetration testing on SSO auth endpoints',
        assignee: 'Marcus Vance',
        dueDate: 'Aug 14, 2026',
        status: 'To Do',
        priority: 'High'
      },
      {
        id: 'act-103',
        task: 'Configure S3 bucket lifecycle rule for 7-year audit log retention',
        assignee: 'Elena Rostova',
        dueDate: 'Aug 10, 2026',
        status: 'Completed',
        priority: 'Medium'
      }
    ],
    transcript: [
      {
        id: 't-101',
        speaker: 'Marcus Vance',
        time: '00:15',
        text: 'Our enterprise deals require SAML 2.0 SSO integration within the next sprint to unblock our Q3 sales target.',
        sentiment: 'neutral'
      },
      {
        id: 't-102',
        speaker: 'David Kim',
        time: '02:30',
        text: 'We can leverage Okta and Auth0 SAML protocol handlers. Metadata XML generation is already drafted in staging.',
        sentiment: 'positive'
      },
      {
        id: 't-103',
        speaker: 'Elena Rostova',
        time: '07:45',
        text: 'SOC2 auditors explicitly require automated, tamper-proof log shipping to dedicated S3 buckets with object locking enabled.',
        sentiment: 'action'
      },
      {
        id: 't-104',
        speaker: 'Marcus Vance',
        time: '12:10',
        text: 'Excellent. Let us publish SAML developer docs by Aug 11 and finalize SOC2 log archiving immediately.',
        sentiment: 'positive'
      }
    ],
    graphData: {
      nodes: [
        { id: 'Marcus Vance', name: 'Marcus Vance (VP Sales)', type: 'participant', val: 18, color: '#4f46e5', role: 'VP of Enterprise Sales', email: 'marcus.vance@corporatebrain.ai', phone: '+60 12-876 5432', meetingId: 'mtg-002' },
        { id: 'David Kim', name: 'David Kim (DevOps)', type: 'participant', val: 18, color: '#4f46e5', role: 'DevOps & SecOps Specialist', email: 'david.kim@corporatebrain.ai', phone: '+60 12-333 4444', meetingId: 'mtg-002' },
        { id: 'Elena Rostova', name: 'Elena Rostova (Lead Arch)', type: 'participant', val: 18, color: '#4f46e5', role: 'Principal Software Architect', email: 'elena.rostova@corporatebrain.ai', phone: '+60 12-456 7890', meetingId: 'mtg-002' },
        { id: 'SAML SSO', name: 'SAML 2.0 Integration', type: 'decision', val: 20, color: '#16a34a', meetingId: 'mtg-002' },
        { id: 'S3 Audit Logging', name: 'SOC2 Audit Log Archiving', type: 'decision', val: 18, color: '#16a34a', meetingId: 'mtg-002' },
        { id: 'Fine-Grained RBAC', name: 'RBAC Policy Enforcer', type: 'decision', val: 16, color: '#16a34a', meetingId: 'mtg-002' },
        { id: 'Publish SAML Endpoint', name: 'Publish SAML Endpoint', type: 'action', val: 14, color: '#d97706', meetingId: 'mtg-002' },
        { id: 'Pen Test Task', name: 'SSO Penetration Test', type: 'action', val: 14, color: '#d97706', meetingId: 'mtg-002' },
        { id: 'Compliance Risk', name: 'SOC2 Compliance Audit Risk', type: 'risk', val: 16, color: '#dc2626', meetingId: 'mtg-002' }
      ],
      links: [
        { source: 'Marcus Vance', target: 'SAML SSO', label: 'Requested', meetingId: 'mtg-002' },
        { source: 'David Kim', target: 'SAML SSO', label: 'Assigned', meetingId: 'mtg-002' },
        { source: 'David Kim', target: 'Publish SAML Endpoint', label: 'Assigned', meetingId: 'mtg-002' },
        { source: 'Elena Rostova', target: 'S3 Audit Logging', label: 'Proposed', meetingId: 'mtg-002' },
        { source: 'Marcus Vance', target: 'Pen Test Task', label: 'Assigned', meetingId: 'mtg-002' },
        { source: 'S3 Audit Logging', target: 'Compliance Risk', label: 'Mitigates', meetingId: 'mtg-002' }
      ]
    }
  },
  {
    id: 'mtg-003',
    title: 'AI Summarization & Real-time Graph Pipeline',
    project: 'Core Engine v2',
    dateTime: 'Aug 08, 2026 • 9:15 AM',
    completedAt: 'Aug 08, 2026',
    participants: ['Sophia Lin', 'Alex Rivers', 'Chen Wei'],
    status: 'Completed',
    duration: '40m',
    audioFileName: 'ai_graph_pipeline.m4a',
    fileSize: '38.5 MB',
    summary: 'Technical deep dive on real-time ASR streaming with Whisper ONNX, chunked LLM decision extraction, and graph ingestion transaction batching.',
    decisions: [
      {
        id: 'dec-201',
        title: 'Adopt Whisper-large-v3 ONNX Model for Low-Latency ASR Diarization',
        rationale: 'Reduces diarization word error rate by 34% while maintaining sub-200ms streaming chunk processing latency.',
        evidence: '"ONNX runtime optimization allows batching audio frames with under 180ms latency while keeping speaker attribution accuracy above 96%."',
        confidenceScore: 97,
        category: 'Speech Recognition',
        impactLevel: 'High'
      },
      {
        id: 'dec-202',
        title: 'Implement LangChain Chunked Graph Extractor for LLM Summarization',
        rationale: 'Structured JSON schema extraction prevents LLM hallucinations during decision parsing and guarantees predictable node schemas.',
        evidence: '"Strict JSON output schemas guarantee 99.2% parsing accuracy for decisions and action items extracted from live transcripts."',
        confidenceScore: 95,
        category: 'LLM Extraction',
        impactLevel: 'High'
      },
      {
        id: 'dec-203',
        title: 'Use Neo4j APOC Batch Procedures for Async Graph Edge Ingestion',
        rationale: 'Batching APOC periodic iterate transactions increases graph write throughput to 12,000 nodes/sec without locking main thread.',
        evidence: '"APOC periodic iterate completely eliminated write locks on person and decision relationship edges during concurrent transcript streaming."',
        confidenceScore: 93,
        category: 'Graph Database',
        impactLevel: 'Medium'
      }
    ],
    actionItems: [
      {
        id: 'act-201',
        task: 'Deploy Whisper ONNX inference container to GPU worker pool',
        assignee: 'Sophia Lin',
        dueDate: 'Aug 13, 2026',
        status: 'In Progress',
        priority: 'High'
      },
      {
        id: 'act-202',
        task: 'Write JSON Schema validators for LLM decision extraction output',
        assignee: 'Alex Rivers',
        dueDate: 'Aug 16, 2026',
        status: 'To Do',
        priority: 'High'
      },
      {
        id: 'act-203',
        task: 'Optimize Neo4j APOC batch transaction size for real-time streams',
        assignee: 'Chen Wei',
        dueDate: 'Aug 11, 2026',
        status: 'Completed',
        priority: 'Medium'
      }
    ],
    transcript: [
      {
        id: 't-201',
        speaker: 'Sophia Lin',
        time: '00:30',
        text: 'Welcome team. Today we are reviewing ASR diarization latency and graph pipeline ingestion throughput.',
        sentiment: 'neutral'
      },
      {
        id: 't-202',
        speaker: 'Alex Rivers',
        time: '03:12',
        text: 'Whisper-large-v3 ONNX runtime reduces our diarization error rate significantly with sub-200ms latency on GPU workers.',
        sentiment: 'positive'
      },
      {
        id: 't-203',
        speaker: 'Chen Wei',
        time: '08:40',
        text: 'Using Neo4j APOC procedures allows us to insert 12,000 nodes per second without write lock contention on relationship edges.',
        sentiment: 'action'
      },
      {
        id: 't-204',
        speaker: 'Sophia Lin',
        time: '15:20',
        text: 'Awesome. Let us move forward with Whisper ONNX for ASR, LangChain JSON extraction, and APOC batching for the graph engine.',
        sentiment: 'positive'
      }
    ],
    graphData: {
      nodes: [
        { id: 'Sophia Lin', name: 'Sophia Lin (AI Principal)', type: 'participant', val: 18, color: '#4f46e5', role: 'Principal AI & ASR Researcher', email: 'sophia.lin@corporatebrain.ai', phone: '+60 12-555 6666', meetingId: 'mtg-003' },
        { id: 'Alex Rivers', name: 'Alex Rivers (VP Product)', type: 'participant', val: 18, color: '#4f46e5', role: 'VP of Product & AI Architecture', email: 'alex.rivers@corporatebrain.ai', phone: '+60 12-777 8888', meetingId: 'mtg-003' },
        { id: 'Chen Wei', name: 'Chen Wei (Backend Tech)', type: 'participant', val: 18, color: '#4f46e5', role: 'Senior Backend Tech Lead', email: 'chen.wei@corporatebrain.ai', phone: '+60 12-234 5678', meetingId: 'mtg-003' },
        { id: 'Whisper ONNX', name: 'Whisper-large-v3 ONNX', type: 'decision', val: 22, color: '#16a34a', meetingId: 'mtg-003' },
        { id: 'LangChain Graph Extractor', name: 'LangChain Extractor', type: 'decision', val: 20, color: '#16a34a', meetingId: 'mtg-003' },
        { id: 'Neo4j APOC Batching', name: 'Neo4j APOC Ingestion', type: 'decision', val: 18, color: '#16a34a', meetingId: 'mtg-003' },
        { id: 'GPU Deploy Task', name: 'Deploy GPU Inference', type: 'action', val: 14, color: '#d97706', meetingId: 'mtg-003' },
        { id: 'Schema Validator', name: 'JSON Schema Validation', type: 'action', val: 14, color: '#d97706', meetingId: 'mtg-003' },
        { id: 'Latency Spike Risk', name: 'Real-time Latency Spike Risk', type: 'risk', val: 16, color: '#dc2626', meetingId: 'mtg-003' }
      ],
      links: [
        { source: 'Alex Rivers', target: 'Whisper ONNX', label: 'Proposed', meetingId: 'mtg-003' },
        { source: 'Sophia Lin', target: 'Whisper ONNX', label: 'Approved', meetingId: 'mtg-003' },
        { source: 'Sophia Lin', target: 'GPU Deploy Task', label: 'Assigned', meetingId: 'mtg-003' },
        { source: 'Alex Rivers', target: 'LangChain Graph Extractor', label: 'Proposed', meetingId: 'mtg-003' },
        { source: 'Alex Rivers', target: 'Schema Validator', label: 'Assigned', meetingId: 'mtg-003' },
        { source: 'Chen Wei', target: 'Neo4j APOC Batching', label: 'Proposed', meetingId: 'mtg-003' },
        { source: 'Neo4j APOC Batching', target: 'Latency Spike Risk', label: 'Mitigates', meetingId: 'mtg-003' }
      ]
    }
  },
  {
    id: 'mtg-004',
    title: 'Design System & Component Library Standard Kickoff',
    project: 'Design Systems',
    dateTime: 'Tomorrow, 10:00 AM',
    participants: ['Clara Oswald', 'Leo Sterling', 'Chen Wei'],
    status: 'Pending',
    duration: '60m',
    audioFileName: 'design_kickoff.mp3',
    fileSize: '22.4 MB',
    decisions: [],
    actionItems: [],
    transcript: []
  }
];

export const INITIAL_USER_PROFILE: UserProfile = {
  id: 'emp-0',
  name: 'Thim Yee Song',
  title: 'VP of Product',
  role: 'VP of Product',
  department: 'Product Strategy',
  email: 'thim.yeesong@corpbrain.ai',
  phone: '+1 (555) 123-4567',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  preferences: {
    emailActionItems: true,
    meetingAiAnalysis: true,
    systemUpdates: false
  }
};

export const INITIAL_NOTIFICATIONS_DATA: Notification[] = [
  {
    id: 'notif-1',
    type: 'INVITATION',
    category: 'meeting',
    title: 'New Meeting Invitation',
    message: 'You have been added to Q3 Cloud Architecture & GCP Migration Sync scheduled for Aug 07, 2026 at 2:30 PM.',
    timestamp: '15 mins ago',
    read: false,
    meetingId: 'mtg-001',
    targetTab: 'detail'
  },
  {
    id: 'notif-2',
    type: 'AI_READY',
    category: 'ai_pipeline',
    title: 'AI Analysis Ready ✨',
    message: "Transcript, Decisions, Knowledge Graph, and Action Items for Enterprise Client SAML SSO & Security Review are now available.",
    timestamp: '1 hour ago',
    read: false,
    meetingId: 'mtg-002',
    targetTab: 'detail'
  },
  {
    id: 'notif-3',
    type: 'INVITATION',
    category: 'meeting',
    title: 'New Meeting Invitation',
    message: 'You have been added to Executive Strategy Kickoff scheduled for Aug 12, 2026 at 10:00 AM.',
    timestamp: '2 hours ago',
    read: false,
    meetingId: 'mtg-003',
    targetTab: 'detail'
  }
];
