-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "owner_kind" AS ENUM ('workspace', 'human');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slack_team_id" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "humans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "slack_user_id" TEXT NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "humans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_ref" JSONB,
    "embedding" vector(1536) NOT NULL,
    "dedupe_key" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_owners" (
    "memory_id" UUID NOT NULL,
    "owner_kind" "owner_kind" NOT NULL,
    "owner_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" UUID,

    CONSTRAINT "memory_owners_pkey" PRIMARY KEY ("memory_id","owner_kind","owner_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slack_team_id_key" ON "workspaces"("slack_team_id");

-- CreateIndex
CREATE INDEX "humans_workspace_id_slack_user_id_idx" ON "humans"("workspace_id", "slack_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "humans_workspace_id_slack_user_id_key" ON "humans"("workspace_id", "slack_user_id");

-- CreateIndex
CREATE INDEX "memories_workspace_id_idx" ON "memories"("workspace_id");

-- CreateIndex
CREATE INDEX "memory_owners_owner_kind_owner_id_memory_id_idx" ON "memory_owners"("owner_kind", "owner_id", "memory_id");

-- AddForeignKey
ALTER TABLE "humans" ADD CONSTRAINT "humans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_owners" ADD CONSTRAINT "memory_owners_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "memories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- HNSW index for cosine ANN over the embedding column
CREATE INDEX "memories_embedding_idx"
  ON "memories" USING hnsw ("embedding" vector_cosine_ops);

-- GIN index for tag-array filtering (cardinality(tags) = 0 OR tags && $tags)
CREATE INDEX "memories_tags_gin"
  ON "memories" USING gin ("tags");

-- Partial unique on (workspace_id, dedupe_key) so retried activity calls
-- become no-ops while still allowing many memories without a dedupe_key
CREATE UNIQUE INDEX "memories_workspace_dedupe_key"
  ON "memories" ("workspace_id", "dedupe_key")
  WHERE "dedupe_key" IS NOT NULL;
