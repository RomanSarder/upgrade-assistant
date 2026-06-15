CREATE TABLE "analysis_runs" (
	"job_id" text PRIMARY KEY NOT NULL,
	"repo_id" text NOT NULL,
	"cost_usd" double precision,
	"tokens_used" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" text NOT NULL,
	"package_name" text NOT NULL,
	"from_version" text NOT NULL,
	"to_version" text NOT NULL,
	"has_upgrade_available" boolean DEFAULT false NOT NULL,
	"is_dev" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upgrade_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"repo_id" text,
	"package_name" text NOT NULL,
	"from_version" text NOT NULL,
	"to_version" text NOT NULL,
	"risk_level" text NOT NULL,
	"breaking_changes" text,
	"changelog_sections_used" text[],
	"reasoning" text,
	"recommendation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
