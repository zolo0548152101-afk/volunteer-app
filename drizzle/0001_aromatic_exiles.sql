CREATE TABLE "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"recipient_id" uuid,
	"channel" "channel" NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"first_after_days" integer DEFAULT 7 NOT NULL,
	"max_sends" integer DEFAULT 1 NOT NULL,
	"repeat_every_days" integer DEFAULT 7 NOT NULL,
	"channels" "channel"[] DEFAULT ARRAY['email']::channel[] NOT NULL,
	"copy_manager" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_rules_values_chk" CHECK ("notification_rules"."first_after_days" >= 0 AND "notification_rules"."max_sends" >= 1 AND "notification_rules"."repeat_every_days" >= 1)
);
--> statement-breakpoint
DROP INDEX "hour_reports_escalation_idx";--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "capacity_tolerance_hours" numeric(7, 2) DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_log_entity_idx" ON "notification_log" USING btree ("organization_id","kind","entity_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_rules_org_kind_uq" ON "notification_rules" USING btree ("organization_id","kind");--> statement-breakpoint
CREATE INDEX "hour_reports_pending_idx" ON "hour_reports" USING btree ("submitted_at") WHERE "hour_reports"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "hour_reports" DROP COLUMN "escalation_sent_at";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "escalation_days";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "coordinator_reminder_enabled";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "reminder_channels";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "inactivity_weeks";--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_tolerance_chk" CHECK ("settings"."capacity_tolerance_hours" >= 0);