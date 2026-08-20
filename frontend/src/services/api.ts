import type {
  Meeting,
  Decision,
  ActionItem,
  Contradiction,
  TranscriptSegment,
  GraphData,
  ProcessingStatus,
} from '../types';

const rawBase = (import.meta as any).env?.VITE_API_BASE_URL || (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';
export const API_BASE = rawBase.replace(/\/+$/, '');

let currentIdentity: string | null = null;

/** Sets the identity sent as X-User-Name on graph requests — the backend's
 * memory-graph endpoints look this up against their own employee directory
 * (see backend/app/core/auth.py) rather than trusting it directly. Call this
 * whenever the logged-in user changes (see AppContext.tsx). */
export function setApiIdentity(name: string): void {
  currentIdentity = name;
}

function identityHeaders(): Record<string, string> {
  return currentIdentity ? { 'X-User-Name': currentIdentity } : {};
}

// ── Backend response shapes (docs/IMPLEMENTATION_PLAN.md Phase 5) ─────────

export interface BackendMeetingListItem {
  id: string;
  title: string;
  project: string | null;
  date: string | null;
  status: string;
  progress: number;
  decisions_count: number;
  action_items_count: number;
  flags_count: number;
  source?: string | null;
  room_id?: string | null;
  time_range?: string | null;
  department?: string | null;
  host_name?: string | null;
  rsvp_status?: string | null;
  participant_names?: string[];
}

interface BackendDecision {
  text: string;
  title?: string;
  reason?: string;
  evidence?: string;
  confidence: 'firm_commitment' | 'soft_agreement' | 'unresolved';
  timestamp: string;
  speaker: string;
}

interface BackendActionItem {
  task: string;
  assignee: string;
  deadline: string | null;
  priority: string;
}

interface BackendFlag {
  type: string;
  message: string;
  severity: string;
  source_decision_text?: string | null;
  contradicts_meeting_id?: string | null;
  contradicts_decision_text?: string | null;
}

export interface BackendSummary {
  duration: string;
  summary?: string;
  participants: string[];
  decisions: BackendDecision[];
  action_items: BackendActionItem[];
  flags: BackendFlag[];
  risks?: string[];
  knowledge_triples?: Array<{ subject: string; predicate: string; object: string }>;
}

interface BackendTranscriptLine {
  timestamp: string;
  speaker: string;
  speaker_raw: string;
  text: string;
}

export interface BackendTranscript {
  meeting_id: string;
  transcript: BackendTranscriptLine[];
}

interface BackendGraphNode {
  id: string;
  label: string;
  type: string;
}

interface BackendGraphLink {
  source: string;
  target: string;
  type: string;
  isContradiction?: boolean;
  message?: string;
}

export interface BackendGraphData {
  nodes: BackendGraphNode[];
  links: BackendGraphLink[];
}

export interface BackendTaskStatus {
  meeting_id: string;
  status: string;
  progress_percentage: number;
  error_message: string | null;
}

export interface BackendCitation {
  filename: string;
  timestamp: string;
  speaker: string;
  excerpt: string;
}

export interface BackendQueryResponse {
  answer: string;
  results: Array<Record<string, unknown>>;
  cypher: string;
  citations: BackendCitation[];
}

export interface BackendDashboard {
  user_id: string;
  action_items: Array<{ task: string; deadline: string | null; priority: string }>;
  flags: Array<{ message: string; meeting_id: string | null }>;
  upcoming_meetings: Array<{ id: string; title: string }>;
}

// ── Raw fetch calls ─────────────────────────────────────────────────────

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: identityHeaders() });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function listMeetings(): Promise<BackendMeetingListItem[]> {
  return apiGet('/meetings');
}

/** The backend signals "not processed yet" with a 202 (see meetings.py),
 * which fetch() treats as a successful response (res.ok is true for any
 * 2xx) — apiGet would happily return that 202 body ({detail: "..."}) as if
 * it were a real BackendSummary, and mergeBackendIntoMeeting would then
 * crash calling .map() on its nonexistent decisions/action_items/flags
 * arrays. Checked here instead so every "not ready" meeting (scheduled,
 * queued, still processing) resolves to null like a summary genuinely
 * unavailable, rather than a malformed one. */
async function apiGetOrNullIfNotReady<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`, { headers: identityHeaders() });
  if (res.status === 202) return null;
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function getMeetingSummary(meetingId: string): Promise<BackendSummary | null> {
  try {
    return await apiGetOrNullIfNotReady(`/meeting/${meetingId}/summary`);
  } catch {
    return null;
  }
}

export async function getMeetingTranscript(meetingId: string): Promise<BackendTranscript | null> {
  try {
    return await apiGetOrNullIfNotReady(`/meeting/${meetingId}/transcript`);
  } catch {
    return null;
  }
}

export async function getGraphData(meetingId: string): Promise<BackendGraphData | null> {
  try {
    return await apiGet(`/meeting/${meetingId}/graph-data`);
  } catch {
    return null;
  }
}

/** Whole-organization graph (Task 6.6's Memory Graph page) — every
 * meeting/person/decision/action item/contradiction at once. */
export async function getGlobalGraphData(): Promise<BackendGraphData | null> {
  try {
    return await apiGet('/graph');
  } catch {
    return null;
  }
}

/** Sets (or, with displayName=undefined, clears) a memory-graph node's
 * display-only label override — the node's real identity (used for merging,
 * messaging, etc.) never changes, only what's rendered. */
export async function setNodeDisplayName(
  nodeType: string,
  identifier: string,
  displayName?: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/graph/node-label`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...identityHeaders() },
    body: JSON.stringify({ node_type: nodeType, identifier, display_name: displayName ?? null }),
  });
  if (!res.ok) throw new Error(`Rename failed: ${res.status}`);
}

/** Schedules a meeting and invites its participants server-side, so the
 * schedule and every invitee's RSVP are visible from any device the
 * invited/inviting employee logs into — not just the browser that created
 * it. */
export async function scheduleMeeting(payload: {
  title: string;
  project?: string;
  date?: string;
  time_range?: string;
  department?: string;
  participant_names?: string[];
}): Promise<BackendMeetingListItem> {
  const res = await fetch(`${API_BASE}/meetings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...identityHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Schedule meeting failed: ${res.status}`);
  return res.json();
}

export async function setMeetingRsvp(meetingId: string, status: 'accepted' | 'declined'): Promise<void> {
  const res = await fetch(`${API_BASE}/meetings/${meetingId}/rsvp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...identityHeaders() },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`RSVP failed: ${res.status}`);
}

export async function getTaskStatus(meetingId: string): Promise<BackendTaskStatus> {
  return apiGet(`/task/${meetingId}/status`);
}

export async function uploadMeeting(
  file: File,
  title: string,
  project?: string
): Promise<{ meeting_id: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title);
  if (project) formData.append('project', project);

  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export async function askCoco(query: string): Promise<BackendQueryResponse> {
  const res = await fetch(`${API_BASE}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Ask Coco failed: ${res.status}`);
  return res.json();
}

export async function getUserDashboard(userId: string): Promise<BackendDashboard> {
  return apiGet(`/users/${encodeURIComponent(userId)}/dashboard`);
}

// ── Task 7.2 — Export Report ─────────────────────────────────────────────

export function getMeetingExportUrl(meetingId: string): string {
  return `${API_BASE}/meeting/${meetingId}/export`;
}

/** Fetches the report and triggers a browser download. Throws with a
 * user-readable message on failure (e.g. meeting not on the backend yet,
 * or still processing) — caller decides how to surface it. */
export async function downloadMeetingReport(meetingId: string, suggestedFilename: string): Promise<void> {
  const res = await fetch(getMeetingExportUrl(meetingId));
  if (!res.ok) {
    if (res.status === 202) throw new Error('Report not ready yet — this meeting is still processing.');
    if (res.status === 404) throw new Error('This meeting has no exportable report on the backend yet.');
    throw new Error(`Export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Adapters: backend shapes -> existing frontend types ─────────────────
// The frontend's Meeting/Decision/ActionItem/Contradiction types predate
// the backend integration and have a richer shape than what the backend
// currently produces (e.g. no per-item completion status, no rationale
// text) — these adapters fill in reasonable values rather than leaving
// fields undefined, so existing components render sensibly unmodified.

const STATUS_MAP: Record<string, ProcessingStatus> = {
  pending: 'Pending',
  queued: 'Pending',
  processing: 'Preprocessing',
  completed: 'Completed',
  failed: 'Failed',
  retrying: 'Retrying',
  scheduled: 'Scheduled',
};

export function mapBackendStatus(status: string, progress: number): ProcessingStatus {
  if (status === 'processing') {
    if (progress < 25) return 'Preprocessing';
    if (progress < 55) return 'ASR';
    if (progress < 80) return 'LLM';
    return 'Graph';
  }
  return STATUS_MAP[status] || 'Pending';
}

const CONFIDENCE_SCORE: Record<string, number> = {
  firm_commitment: 95,
  soft_agreement: 70,
  unresolved: 40,
};

export function toDecision(d: BackendDecision, meetingId: string, idx: number): Decision {
  return {
    id: `${meetingId}-decision-${idx}`,
    title: d.title || d.text,
    rationale: d.reason || `Decided by ${d.speaker} at ${d.timestamp}.`,
    evidence: d.evidence || `Confidence: ${d.confidence.replace('_', ' ')}.`,
    confidenceScore: CONFIDENCE_SCORE[d.confidence] ?? 60,
    impactLevel: d.confidence === 'firm_commitment' ? 'High' : d.confidence === 'soft_agreement' ? 'Medium' : 'Low',
  };
}

export function toActionItem(a: BackendActionItem, meetingId: string, idx: number): ActionItem {
  const priority = a.priority || 'medium';
  return {
    id: `${meetingId}-action-${idx}`,
    task: a.task,
    assignee: a.assignee,
    dueDate: a.deadline || 'No deadline',
    status: 'To Do',
    priority: (priority.charAt(0).toUpperCase() + priority.slice(1)) as 'High' | 'Medium' | 'Low',
    meetingId,
  };
}

const FLAG_TYPE_MAP: Record<string, Contradiction['type']> = {
  policy_conflict: 'Policy Conflict',
  contradiction: 'Statement Contradiction',
  duplicate_discussion: 'Statement Contradiction',
  missing_stakeholder: 'Statement Contradiction',
};

const FLAG_SEVERITY_MAP: Record<string, Contradiction['severity']> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
};

function toContradiction(f: BackendFlag, meeting: { id: string; title: string }, idx: number): Contradiction {
  return {
    id: `${meeting.id}-flag-${idx}`,
    title: f.message.length > 80 ? `${f.message.slice(0, 77)}...` : f.message,
    type: FLAG_TYPE_MAP[f.type] || 'Statement Contradiction',
    severity: FLAG_SEVERITY_MAP[f.severity] || 'Warning',
    meetingA: meeting.title,
    statementA: f.source_decision_text || '',
    meetingB: f.contradicts_meeting_id || 'Earlier meeting',
    statementB: f.contradicts_decision_text || '',
    detectedAt: new Date().toISOString(),
    recommendation: f.message,
    status: 'Unresolved',
  };
}

function toTranscript(lines: BackendTranscriptLine[], meetingId: string): TranscriptSegment[] {
  return lines.map((l, idx) => ({
    id: `${meetingId}-t-${idx}`,
    speaker: l.speaker,
    time: l.timestamp,
    text: l.text,
  }));
}

export function toGraphData(g: BackendGraphData): GraphData {
  return {
    nodes: g.nodes.map((n) => ({ id: n.id, name: n.label, type: n.type })),
    links: g.links.map((l) => ({
      source: l.source,
      target: l.target,
      label: l.type,
      isContradiction: l.isContradiction,
      message: l.message,
    })),
  };
}

/** Build a useful local graph while a backend graph is still being created or
 * when the frontend is running on its bundled demo meetings. This is only a
 * view fallback; Neo4j remains the source of truth for processed meetings. */
export function buildGlobalMemoryGraph(meetingsList: Meeting[]): GraphData {
  const nodes: GraphData['nodes'] = [];
  const links: GraphData['links'] = [];
  const nodeMap = new Set<string>();

  const addNode = (node: GraphData['nodes'][number]) => {
    if (!nodeMap.has(node.id)) {
      nodeMap.add(node.id);
      nodes.push(node);
    }
  };

  meetingsList.forEach((meeting) => {
    const meetingId = `meeting:${meeting.id}`;
    addNode({ id: meetingId, name: meeting.title, type: 'Meeting', meetingId: meeting.id });

    meeting.participants.forEach((name) => {
      if (!name) return;
      const personId = `person:${name}`;
      addNode({ id: personId, name, type: 'Person', meetingId: meeting.id });
      links.push({ source: personId, target: meetingId, label: 'PARTICIPATED_IN', meetingId: meeting.id });
    });

    meeting.decisions.forEach((decision) => {
      const decisionId = `decision:${decision.id}`;
      addNode({ id: decisionId, name: decision.title, type: 'Decision', meetingId: meeting.id });
      links.push({ source: decisionId, target: meetingId, label: 'MADE_IN', meetingId: meeting.id });
    });

    meeting.actionItems.forEach((item) => {
      const actionId = `action:${item.id}`;
      addNode({ id: actionId, name: item.task, type: 'ActionItem', meetingId: meeting.id });
      links.push({ source: actionId, target: meetingId, label: 'MADE_IN', meetingId: meeting.id });
      if (item.assignee) {
        const personId = `person:${item.assignee}`;
        addNode({ id: personId, name: item.assignee, type: 'Person', meetingId: meeting.id });
        links.push({ source: actionId, target: personId, label: 'ASSIGNED_TO', meetingId: meeting.id });
      }
    });

    meeting.contradictions?.forEach((contra: any) => {
      const src = contra.decisionAId || (contra.meetingA ? `meeting:${contra.meetingA}` : undefined);
      const tgt = contra.decisionBId || (contra.meetingB ? `meeting:${contra.meetingB}` : undefined);
      if (src && tgt) {
        links.push({
          source: src.startsWith('meeting:') ? src : `decision:${src}`,
          target: tgt.startsWith('meeting:') ? tgt : `decision:${tgt}`,
          label: 'CONTRADICTS',
          isContradiction: true,
          meetingId: meeting.id,
        });
      }
    });

    if (meeting.project) {
      const projectId = `project:${meeting.project}`;
      addNode({ id: projectId, name: meeting.project, type: 'Project', meetingId: meeting.id });
      links.push({ source: meetingId, target: projectId, label: 'RELATES_TO', meetingId: meeting.id });
    }
  });

  return { nodes, links };
}

export function buildLocalMeetingGraph(meeting: Meeting): GraphData {
  const nodes: GraphData['nodes'] = [];
  const links: GraphData['links'] = [];
  const addNode = (node: GraphData['nodes'][number]) => {
    if (!nodes.some((existing) => existing.id === node.id)) nodes.push(node);
  };
  const meetingId = `meeting:${meeting.id}`;

  addNode({ id: meetingId, name: meeting.title, type: 'Meeting', meetingId: meeting.id });

  meeting.participants.forEach((name) => {
    const personId = `person:${name}`;
    addNode({ id: personId, name, type: 'Person', meetingId: meeting.id });
    links.push({ source: personId, target: meetingId, label: 'PARTICIPATED_IN', meetingId: meeting.id });
  });

  meeting.decisions.forEach((decision) => {
    const decisionId = `decision:${decision.id}`;
    addNode({ id: decisionId, name: decision.title, type: 'Decision', meetingId: meeting.id });
    links.push({ source: decisionId, target: meetingId, label: 'MADE_IN', meetingId: meeting.id });
  });

  meeting.actionItems.forEach((item) => {
    const actionId = `action:${item.id}`;
    addNode({ id: actionId, name: item.task, type: 'ActionItem', meetingId: meeting.id });
    links.push({ source: actionId, target: meetingId, label: 'MADE_IN', meetingId: meeting.id });
    const personId = `person:${item.assignee}`;
    addNode({ id: personId, name: item.assignee, type: 'Person', meetingId: meeting.id });
    links.push({ source: actionId, target: personId, label: 'ASSIGNED_TO', meetingId: meeting.id });
  });

  if (meeting.project) {
    const projectId = `project:${meeting.project}`;
    addNode({ id: projectId, name: meeting.project, type: 'Project', meetingId: meeting.id });
    links.push({ source: meetingId, target: projectId, label: 'RELATES_TO', meetingId: meeting.id });
  }

  return { nodes, links };
}

/** Build/refresh a frontend Meeting from backend data. `base` supplies any
 * fields the backend doesn't have yet (e.g. scheduling metadata) and is
 * preserved where the backend has nothing newer to offer. */
export function mergeBackendIntoMeeting(
  base: Partial<Meeting> & { id: string; title: string; project: string },
  item: BackendMeetingListItem,
  summary: BackendSummary | null,
  transcript: BackendTranscript | null,
  graphData: BackendGraphData | null
): Meeting {
  return {
    // Adopt the backend's real id, not whatever local placeholder the
    // meeting was created with — e.g. AppContext.addMeeting() mints a
    // client-only `mtg-${Date.now()}` id before any backend Meeting row
    // exists (schedule-now-upload-later). Once a real upload happens the
    // backend id (item.id) is the only one anything can be re-fetched by;
    // keeping base.id here left the meeting permanently pointing at an id
    // the backend never issued, 404ing on every later graph/export fetch.
    // Every current caller already has base.id === item.id, so this is a
    // no-op for them and only changes behavior for that mismatched case.
    id: item.id,
    title: base.title,
    project: base.project,
    dateTime: base.dateTime || item.date || new Date().toISOString(),
    timeRange: base.timeRange || item.time_range || undefined,
    department: base.department || item.department || undefined,
    participants: (item.participant_names && item.participant_names.length > 0)
      ? item.participant_names
      : summary?.participants || base.participants || [],
    status: mapBackendStatus(item.status, item.progress),
    duration: summary?.duration || base.duration,
    summary: summary?.summary || base.summary,
    decisions: summary ? summary.decisions.map((d, i) => toDecision(d, base.id, i)) : base.decisions || [],
    actionItems: summary ? summary.action_items.map((a, i) => toActionItem(a, base.id, i)) : base.actionItems || [],
    transcript: transcript ? toTranscript(transcript.transcript, base.id) : base.transcript || [],
    contradictions: summary ? summary.flags.map((f, i) => toContradiction(f, base as any, i)) : base.contradictions || [],
    audioFileName: base.audioFileName,
    fileSize: base.fileSize,
    completedAt: base.completedAt,
    graphData: graphData ? toGraphData(graphData) : base.graphData,
    roomCode: base.roomCode || item.room_id || undefined,
    hostName: base.hostName || item.host_name || undefined,
  };
}

export function backendListItemToMeeting(item: BackendMeetingListItem): Meeting {
  return {
    id: item.id,
    title: item.title,
    project: item.project || 'Unassigned',
    dateTime: item.date || new Date().toISOString(),
    timeRange: item.time_range || undefined,
    department: item.department || undefined,
    participants: item.participant_names || [],
    status: mapBackendStatus(item.status, item.progress),
    decisions: [],
    actionItems: [],
    transcript: [],
    contradictions: [],
    roomCode: item.room_id || undefined,
    hostName: item.host_name || undefined,
  };
}

export async function analyzeTranscript(
  transcript: Array<{ speaker: string; text: string; timestamp: string }>,
  detectedNames: string[] = []
): Promise<{
  summary: string;
  participants: string[];
  decisions: Array<{
    title: string;
    reason?: string;
    evidence?: string;
    confidence?: string;
    timestamp?: string;
    speaker?: string;
  }>;
  action_items: Array<{
    task: string;
    assignee?: string;
    deadline?: string;
    priority?: string;
  }>;
  knowledge_triples?: Array<{ subject: string; predicate: string; object: string }>;
}> {
  try {
    const res = await fetch(`${API_BASE}/analyze-transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, detected_names: detectedNames }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Backend analyze-transcript error, using local analysis:', err);
  }

  // Fallback intelligent summary directly derived from transcript
  const allSpeakers = Array.from(new Set(transcript.map((t) => t.speaker).filter(Boolean)));
  const fullText = transcript.map((t) => `${t.speaker}: ${t.text}`).join(' ');

  return {
    summary: fullText.length > 20 ? `Live discussion covering: ${transcript.map(t => t.text).join(' ')}` : 'Live session completed.',
    participants: allSpeakers,
    decisions: [],
    action_items: [],
    knowledge_triples: allSpeakers.map(spk => ({ subject: spk, predicate: 'PARTICIPATED_IN', object: 'Live Meeting' }))
  };
}


export async function deleteMeeting(meetingId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/meeting/${meetingId}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}
