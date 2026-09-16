-- Migration: SLA tracking, Alert Correlation, Notification Center
-- NexAgent v2.1 — Feature additions for major project upgrade

-- ── SLA Policies ─────────────────────────────────────────────────────────────
CREATE TABLE "sla_policies" (
    "id"          TEXT NOT NULL,
    "priority"    TEXT NOT NULL,
    "slaHours"    DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sla_policies_priority_key" ON "sla_policies"("priority");

-- Seed default SLA policies
INSERT INTO "sla_policies" ("id", "priority", "slaHours", "description") VALUES
  (gen_random_uuid()::text, 'P1',       1.0,  'Critical — 1 hour SLA'),
  (gen_random_uuid()::text, 'P2',       4.0,  'High — 4 hour SLA'),
  (gen_random_uuid()::text, 'P3',       8.0,  'Medium — 8 hour SLA'),
  (gen_random_uuid()::text, 'P4',      24.0,  'Low — 24 hour SLA'),
  (gen_random_uuid()::text, 'CRITICAL',  1.0, 'Critical priority — 1 hour SLA'),
  (gen_random_uuid()::text, 'HIGH',      4.0, 'High priority — 4 hour SLA'),
  (gen_random_uuid()::text, 'MEDIUM',    8.0, 'Medium priority — 8 hour SLA'),
  (gen_random_uuid()::text, 'LOW',      24.0, 'Low priority — 24 hour SLA')
ON CONFLICT ("priority") DO NOTHING;

-- ── Ticket SLA ────────────────────────────────────────────────────────────────
CREATE TABLE "ticket_slas" (
    "id"          TEXT NOT NULL,
    "ticketId"    TEXT NOT NULL,
    "priority"    TEXT NOT NULL,
    "slaHours"    DOUBLE PRECISION NOT NULL,
    "slaBreachAt" TIMESTAMP(3) NOT NULL,
    "breached"    BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt"  TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_slas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ticket_slas_ticketId_key" ON "ticket_slas"("ticketId");
ALTER TABLE "ticket_slas" ADD CONSTRAINT "ticket_slas_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Alert Groups ──────────────────────────────────────────────────────────────
CREATE TABLE "alert_groups" (
    "id"          TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "rootCause"   TEXT,
    "severity"    TEXT NOT NULL DEFAULT 'P2',
    "status"      TEXT NOT NULL DEFAULT 'OPEN',
    "alertIds"    TEXT[] NOT NULL DEFAULT '{}',
    "keywords"    TEXT[] NOT NULL DEFAULT '{}',
    "memberCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "alert_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alert_group_members" (
    "id"         TEXT NOT NULL,
    "groupId"    TEXT NOT NULL,
    "alertId"    TEXT NOT NULL,
    "alertTitle" TEXT NOT NULL,
    "source"     TEXT NOT NULL DEFAULT 'SENTRY',
    "joinedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "alert_group_members_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "alert_group_members" ADD CONSTRAINT "alert_group_members_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "alert_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Notifications ─────────────────────────────────────────────────────────────
CREATE TABLE "notifications" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT,
    "type"       TEXT NOT NULL,
    "title"      TEXT NOT NULL,
    "body"       TEXT NOT NULL,
    "severity"   TEXT NOT NULL DEFAULT 'INFO',
    "entityType" TEXT,
    "entityId"   TEXT,
    "isRead"     BOOLEAN NOT NULL DEFAULT false,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt"     TIMESTAMP(3),
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "notifications_userId_idx"  ON "notifications"("userId");
CREATE INDEX "notifications_isRead_idx"  ON "notifications"("isRead");
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt" DESC);
