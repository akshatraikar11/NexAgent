/**
 * api.ts — NexAgent frontend API client
 * All data comes from the live Phase 1 backend at NEXT_PUBLIC_API_URL.
 * No mock data. JWT is stored in localStorage under key "nexagent_token".
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("nexagent_token");
}

export function setToken(token: string) {
  localStorage.setItem("nexagent_token", token);
}

export function clearToken() {
  localStorage.removeItem("nexagent_token");
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ token: string; user: { id: string; email: string; name: string; role: string } }>(
        "/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }) }
      ),
    register: (email: string, password: string, name: string) =>
      request<{ token: string; user: { id: string; email: string; name: string; role: string } }>(
        "/auth/register",
        { method: "POST", body: JSON.stringify({ email, password, name }) }
      ),
    me: () =>
      request<{ id: string; email: string; name: string; role: string; createdAt: string }>(
        "/auth/me"
      ),
  },

  // ── Tickets ────────────────────────────────────────────────────────────────
  tickets: {
    list: () => request<Ticket[]>("/tickets"),
    get: (id: string) => request<Ticket>(`/tickets/${id}`),
  },

  // ── Decisions ──────────────────────────────────────────────────────────────
  decisions: {
    list: (page = 1, limit = 50) =>
      request<{ data: Decision[]; total: number; page: number; limit: number; pages: number }>(
        `/decisions?page=${page}&limit=${limit}`
      ).then((r) => r.data), // unwrap — callers get Decision[] as before
    override: (id: string, overriddenDecision: "AUTO_RESOLVE" | "ESCALATE", reason: string) =>
      request(`/decisions/${id}/override`, {
        method: "POST",
        body: JSON.stringify({ overriddenDecision, reason }),
      }),
  },

  // ── Pipelines ──────────────────────────────────────────────────────────────
  pipelines: {
    run: (payload: RunPipelinePayload) =>
      request<PipelineRunResult>("/pipelines/run", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    get: (runId: string) => request<PipelineRun & { decision?: string; ccepScore?: number }>(`/pipelines/${runId}`),
  },

  // ── Categories ─────────────────────────────────────────────────────────────
  categories: {
    list: () => request<Category[]>("/categories"),
    create: (name: string, description?: string) =>
      request<Category>("/categories", { method: "POST", body: JSON.stringify({ name, description }) }),
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  settings: {
    get: () => request<Settings>("/settings"),
    update: (payload: Partial<Settings>) =>
      request<Settings>("/settings", { method: "PUT", body: JSON.stringify(payload) }),
    weightHistory: () => request<WeightHistoryEntry[]>("/settings/weight-history"),
  },

  // ── Audit Logs ─────────────────────────────────────────────────────────────
  audit: {
    list: () => request<AuditLog[]>("/audit-logs"),
  },

  // ── Knowledge Base ─────────────────────────────────────────────────────────
  kb: {
    list: () => request<KBEntry[]>("/kb"),
    toggleOverride: (id: string) => request<KBEntry>(`/kb/${id}/override`, { method: "PATCH" }),
    createManual: (payload: { content: string; title: string; category?: string; confidenceAtIngestion?: number }) =>
      request<KBEntry>("/kb/manual", { method: "POST", body: JSON.stringify(payload) }),
    analytics: () => request<KBAnalytics>("/kb/analytics"),
  },

  // ── Health ─────────────────────────────────────────────────────────────────
  health: () =>
    request<HealthStatus>("/health"),
  healthDetail: () =>
    request<HealthStatus>("/health/detail"),

  // ── SSE token ──────────────────────────────────────────────────────────────
  sse: {
    token: () => request<{ sseToken: string; expiresAt: number }>("/sse/token"),
  },

  // ── SLA ────────────────────────────────────────────────────────────────────
  sla: {
    summary: () => request<SLASummary>("/sla/summary"),
    all: () => request<TicketSLAEntry[]>("/sla/all"),
    breached: () => request<TicketSLAEntry[]>("/sla/breached"),
    atRisk: () => request<TicketSLAEntry[]>("/sla/at-risk"),
    policy: () => request<SLAPolicy[]>("/sla/policy"),
  },

  // ── Alert Correlation ──────────────────────────────────────────────────────
  correlation: {
    groups: () => request<AlertGroup[]>("/correlation/groups"),
    group: (id: string) => request<AlertGroup>(`/correlation/groups/${id}`),
    correlate: (payload: CorrelatePayload) =>
      request<CorrelateResult>("/correlation/correlate", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    resolve: (id: string) =>
      request<AlertGroup>(`/correlation/groups/${id}/resolve`, { method: "PATCH" }),
  },

  // ── Notifications ──────────────────────────────────────────────────────────
  notifications: {
    list: (unreadOnly?: boolean) =>
      request<Notification[]>(`/notifications${unreadOnly ? "?unreadOnly=true" : ""}`),
    unreadCount: () => request<{ count: number }>("/notifications/unread-count"),
    markRead: (id: string) => request<Notification>(`/notifications/${id}/read`, { method: "PATCH" }),
    markAllRead: () => request("/notifications/read-all", { method: "PATCH" }),
  },

  // ── Analytics ──────────────────────────────────────────────────────────────
  analytics: {
    summary: () => request<AnalyticsSummary>("/analytics/summary"),
    trend: () => request<DecisionTrendPoint[]>("/analytics/decisions/trend"),
    stepLatency: () => request<StepLatencyEntry[]>("/analytics/steps/latency"),
    topCategories: () => request<CategoryTopEntry[]>("/analytics/categories/top"),
  },
};

// ── Types (matching Phase 1 Prisma schema exactly) ────────────────────────────
export interface Ticket {
  id: string;
  externalId: string;
  title: string;
  description: string;
  categoryId: string;
  status: string;
  priority: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  category?: Category;
  decisions?: Decision[];
}

export interface Decision {
  id: string;
  ticketId: string | null;
  pipelineRunId: string;
  ccepScore: number;
  threshold: number;
  decision: "AUTO_RESOLVE" | "ESCALATE" | "PENDING";
  modelConfidence: number;
  dualModelAgreed: boolean;
  historicalErrorRate: number;
  guardrailFlagsCount: number;
  normalizedGuardrailScore: number;
  actionReversibilityWeight: number;
  signalBreakdown: {
    modelConfidenceContribution: number;
    historicalErrorRateContribution: number;
    guardrailFlagsContribution: number;
    actionReversibilityContribution: number;
    normalizedGuardrailScore: number;
  };
  createdAt: string;
  ticket?: Ticket;
  humanOverrides?: HumanOverride[];
}

export interface HumanOverride {
  id: string;
  decisionId: string;
  operatorId: string | null;
  originalDecision: string;
  overriddenDecision: string;
  reason: string;
  overriddenAt: string;
  operator?: { id: string; email: string; name: string };
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  totalDecisions: number;
  overrideCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  ccepThreshold: number;
  weights: { w1: number; w2: number; w3: number; w4: number };
  reversibilityMap: Record<string, number>;
  updatedAt: string;
}

export interface WeightHistoryEntry {
  id: string;
  w1: number;
  w2: number;
  w3: number;
  w4: number;
  source: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  ticketId: string | null;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  timestamp: string;
  actor?: { id: string; email: string; name: string } | null;
  ticket?: Ticket | null;
}

export interface KBEntry {
  id: string;
  sourceTicketId: string | null;
  content: string;
  embeddingId: string;
  confidenceAtIngestion: number;
  timesReused: number;
  isOverridden: boolean;
  ingestedAt: string;
  updatedAt: string;
  sourceTicket?: { id: string; externalId: string; title: string } | null;
}

export interface PipelineRun {
  id: string;
  type: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  currentStep: string | null;
  context: Record<string, unknown>;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  stepLogs?: StepLog[];
  decisions?: Decision[];
}

export interface StepLog {
  id: string;
  pipelineRunId: string;
  stepName: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
  input?: unknown;
  output?: unknown;
  error?: string | null;
  retryCount: number;
  startedAt: string;
  completedAt: string | null;
}

export interface RunPipelinePayload {
  pipelineType: "TICKET_TRIAGE" | "INCIDENT_RESPONSE" | "KB_SELF_LEARNING" | "CI_TRIAGE" | "BUILD_DEPLOY" | "MERGEGATE";
  ticketId?: string;
  externalTicketId?: string;
  alertId?: string;
  ticketTitle?: string;
  ticketDescription?: string;
  categoryId?: string;
  actionType?: string;
  threshold?: number;
  metadata?: Record<string, unknown>;
}

export interface PipelineRunResult {
  runId: string;
  status: string;
  pipelineType: string;
  decision: string;
  ccepScore: number;
  message: string;
  context: Record<string, unknown>;
}

// SSE event shape from backend
export interface SSEEvent {
  runId: string;
  stepName: string;
  status: "STARTED" | "COMPLETED" | "RETRYING" | "FAILED";
  timestamp: string;
  data?: unknown;
}

// ── New types ─────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: string;
  system: string;
  version: string;
  mockMode: boolean;
  timestamp: string;
  services?: {
    database: string;
    chromadb: string;
    llm: string;
  };
}

export interface SLASummary {
  total: number;
  ON_TRACK: number;
  AT_RISK: number;
  BREACHED: number;
  asOf: string;
}

export interface SLAPolicy {
  id: string;
  priority: string;
  slaHours: number;
  description?: string;
}

export interface TicketSLAEntry {
  id: string;
  ticketId: string;
  priority: string;
  slaHours: number;
  slaBreachAt: string;
  breached: boolean;
  resolvedAt: string | null;
  createdAt: string;
  status: "ON_TRACK" | "AT_RISK" | "BREACHED";
  msUntilBreach?: number;
  overdueMs?: number;
  ticket?: Ticket;
}

export interface AlertGroup {
  id: string;
  title: string;
  rootCause: string | null;
  severity: string;
  status: string;
  alertIds: string[];
  keywords: string[];
  memberCount: number;
  createdAt: string;
  updatedAt: string;
  members?: AlertGroupMember[];
}

export interface AlertGroupMember {
  id: string;
  groupId: string;
  alertId: string;
  alertTitle: string;
  source: string;
  joinedAt: string;
}

export interface CorrelatePayload {
  alertId: string;
  alertTitle: string;
  alertDescription?: string;
  severity?: string;
  source?: string;
}

export interface CorrelateResult {
  action: "ADDED_TO_GROUP" | "NEW_GROUP_CREATED";
  groupId: string;
  similarityScore: number;
  group: AlertGroup;
}

export interface Notification {
  id: string;
  userId: string | null;
  type: string;
  title: string;
  body: string;
  severity: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface AnalyticsPipelineRow {
  type: string;
  totalRuns: number;
  completed: number;
  autoResolved: number;
  escalated: number;
  autoResolveRate: number;
  avgCCEPScore: number;
}

export interface AnalyticsSummary {
  pipelines: AnalyticsPipelineRow[];
  totals: {
    decisions: number;
    autoResolved: number;
    escalated: number;
    overallAutoResolveRate: number;
    humanOverrides: number;
    activeKBEntries: number;
  };
}

export interface DecisionTrendPoint {
  date: string;
  auto: number;
  escalate: number;
  total: number;
}

export interface StepLatencyEntry {
  stepName: string;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  samples: number;
}

export interface CategoryTopEntry {
  id: string;
  name: string;
  totalDecisions: number;
  overrideCount: number;
  overrideRate: number;
}

export interface KBAnalytics {
  totalEntries: number;
  activeEntries: number;
  manualEntries: number;
  autoEntries: number;
  totalReuses: number;
  overrideConversionRate: number;
  totalDecisions: number;
  totalOverrides: number;
  topEntries: { id: string; content: string; timesReused: number; isOverridden: boolean }[];
  categories: {
    id: string;
    name: string;
    totalDecisions: number;
    overrideCount: number;
    overrideRate: number;
    tacitSignalStrength: string;
  }[];
}
