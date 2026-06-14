CREATE TABLE "changelog_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_name" text NOT NULL,
	"from_version" text NOT NULL,
	"to_version" text NOT NULL,
	"version" text NOT NULL,
	"content" text NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
