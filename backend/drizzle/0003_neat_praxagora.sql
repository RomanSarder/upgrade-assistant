ALTER TABLE "changelog_chunks" ALTER COLUMN "changelog_embedding" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "changelog_chunks" ADD COLUMN "chunkIndex" integer NOT NULL;