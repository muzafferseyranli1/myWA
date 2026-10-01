-- AlterTable
ALTER TABLE "task_assignees" ADD COLUMN "completed_at" TIMESTAMP(3),
ADD COLUMN "completed_by" TEXT,
ADD COLUMN "completion_note" TEXT;

-- Assignees of tasks that were already closed count as done.
UPDATE "task_assignees" ta SET "completed_at" = COALESCE(t."completed_at", NOW()), "completed_by" = t."completed_by", "completion_note" = t."completion_note"
FROM "tasks" t WHERE ta."task_id" = t."id" AND t."status" = 'DONE';
