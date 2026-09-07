/**
 * INDUSTRY-AGNOSTIC CORE DOMAIN
 *
 * Do not introduce vertical entities here.
 */

export type Id = string;

export interface RecordEntity {
  id: Id;
  tenantId: Id;
  campaignId?: Id;
  territoryId?: Id;
  assignedTo?: Id;
  status: string;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: Id;
  tenantId: Id;
  name: string;
  type: string;
  status: "draft" | "active" | "paused" | "completed";
}

export interface Assignment {
  id: Id;
  tenantId: Id;
  recordId: Id;
  assigneeId: Id;
  queueId?: Id;
  priority: number;
  assignedAt: string;
}

export interface Queue {
  id: Id;
  tenantId: Id;
  name: string;
  campaignId?: Id;
}

export interface OutreachAttempt {
  id: Id;
  tenantId: Id;
  recordId: Id;
  agentId: Id;
  channel: "phone" | "sms" | "whatsapp" | "email" | "in_person" | "other";
  attemptedAt: string;
  notes?: string;
}

export interface Outcome {
  id: Id;
  tenantId: Id;
  recordId: Id;
  attemptId: Id;
  type: string;
  notes?: string;
  occurredAt: string;
}

export interface FollowUp {
  id: Id;
  tenantId: Id;
  recordId: Id;
  ownerId: Id;
  dueAt: string;
  status: "open" | "completed" | "cancelled";
}

export interface User {
  id: Id;
  tenantId: Id;
  name: string;
  roleId: Id;
}

export interface Role {
  id: Id;
  tenantId: Id;
  name: string;
}

export interface Team {
  id: Id;
  tenantId: Id;
  name: string;
}

export interface Territory {
  id: Id;
  tenantId: Id;
  name: string;
}

export interface AuditEvent {
  id: Id;
  tenantId: Id;
  actorId: Id;
  action: string;
  entityType: string;
  entityId: Id;
  occurredAt: string;
}

export interface Notification {
  id: Id;
  tenantId: Id;
  recipientId: Id;
  type: string;
  payload: Record<string, unknown>;
}

export interface AnalyticsEvent {
  id: Id;
  tenantId: Id;
  name: string;
  properties: Record<string, unknown>;
  occurredAt: string;
}
