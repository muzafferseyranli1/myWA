ALTER TABLE "messages" ADD COLUMN "ack" INTEGER,
 ADD COLUMN "revoked" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "edited_at" TIMESTAMP(3);
CREATE TABLE "message_reads" (
 "user_id" TEXT NOT NULL, "message_id" TEXT NOT NULL,
 "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("user_id", "message_id"),
 FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "message_reactions" (
 "message_id" TEXT NOT NULL, "sender_id" TEXT NOT NULL, "text" TEXT NOT NULL,
 "timestamp" TIMESTAMP(3) NOT NULL, PRIMARY KEY ("message_id", "sender_id")
);
CREATE TABLE "sync_states" (
 "session" TEXT NOT NULL PRIMARY KEY, "completed_until" INTEGER NOT NULL DEFAULT 0,
 "round_until" INTEGER, "offset" INTEGER NOT NULL DEFAULT 0,
 "last_success_at" TIMESTAMP(3), "last_error" TEXT, "updated_at" TIMESTAMP(3) NOT NULL
);
