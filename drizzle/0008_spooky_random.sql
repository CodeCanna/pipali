CREATE TABLE "platform_auth" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp,
	"platform_user_id" text,
	"platform_email" text,
	"platform_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_auth" ADD CONSTRAINT "platform_auth_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Add 'platform' to web_search_provider_type enum
ALTER TYPE "web_search_provider_type" ADD VALUE IF NOT EXISTS 'platform';
--> statement-breakpoint
-- Add 'platform' to web_scraper_type enum
ALTER TYPE "web_scraper_type" ADD VALUE IF NOT EXISTS 'platform';