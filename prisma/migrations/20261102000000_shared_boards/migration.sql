-- Password-protected task board for a single WhatsApp group (main schema only).
CREATE TABLE "shared_boards" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shared_boards_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shared_boards_slug_key" ON "shared_boards"("slug");
