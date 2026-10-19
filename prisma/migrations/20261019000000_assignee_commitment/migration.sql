-- Each assignee can promise a completion date once from the task link.
ALTER TABLE "task_assignees" ADD COLUMN "committed_due_date" TIMESTAMP(3);
ALTER TABLE "task_assignees" ADD COLUMN "committed_at" TIMESTAMP(3);
