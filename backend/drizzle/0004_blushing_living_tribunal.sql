-- chunks are a re-generatable cache; truncate lets NOT NULL succeed without a backfill default
TRUNCATE TABLE "changelog_chunks";
--> statement-breakpoint
ALTER TABLE "changelog_chunks" ADD COLUMN "start_offset" integer NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "changelog_chunks_unique_chunk" ON "changelog_chunks" ("package_name","from_version","to_version","version","start_offset");
