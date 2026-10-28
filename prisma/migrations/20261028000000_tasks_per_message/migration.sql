-- A message can be the source of several tasks (e.g. a numbered to-do list).
DROP INDEX "tasks_source_message_id_key";
CREATE INDEX "tasks_source_message_id_idx" ON "tasks"("source_message_id");
