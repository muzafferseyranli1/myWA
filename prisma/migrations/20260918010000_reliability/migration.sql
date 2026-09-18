-- CreateEnum
CREATE TYPE "InboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'ACCEPTED', 'FAILED', 'UNKNOWN', 'CANCELLED');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "request_key" TEXT;

-- CreateTable
CREATE TABLE "incoming_events" (
    "id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "InboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMP(3),
    "lock_token" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incoming_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outgoing_jobs" (
    "id" TEXT NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "operation_key" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "task_id" TEXT,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMP(3),
    "lock_token" TEXT,
    "provider_id" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outgoing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduler_runs" (
    "day" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduler_runs_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "connection_preferences" (
    "session" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_dispatch_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connection_preferences_pkey" PRIMARY KEY ("session")
);

-- CreateIndex
CREATE UNIQUE INDEX "incoming_events_event_key_key" ON "incoming_events"("event_key");

-- CreateIndex
CREATE INDEX "incoming_events_status_next_attempt_at_idx" ON "incoming_events"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "outgoing_jobs_sequence_key" ON "outgoing_jobs"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "outgoing_jobs_operation_key_key" ON "outgoing_jobs"("operation_key");

-- CreateIndex
CREATE INDEX "outgoing_jobs_status_next_attempt_at_idx" ON "outgoing_jobs"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "outgoing_jobs_chat_id_sequence_idx" ON "outgoing_jobs"("chat_id", "sequence");

-- CreateIndex
CREATE INDEX "outgoing_jobs_task_id_idx" ON "outgoing_jobs"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_request_key_key" ON "tasks"("request_key");
