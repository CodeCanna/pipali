CREATE TYPE "public"."web_scraper_type" AS ENUM('exa', 'direct');--> statement-breakpoint
CREATE TABLE "web_scraper" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "web_scraper_type" NOT NULL,
	"api_key" text,
	"api_base_url" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation" DROP CONSTRAINT "conversation_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "conversation" DROP COLUMN "slug";--> statement-breakpoint
ALTER TABLE "conversation" DROP COLUMN "agent_id";--> statement-breakpoint
ALTER TABLE "conversation" DROP COLUMN "file_filters";