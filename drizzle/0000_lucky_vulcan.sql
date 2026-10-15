CREATE TYPE "public"."absence_reason" AS ENUM('reserve_duty', 'illness', 'security_situation', 'other');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('email', 'sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."custom_entity" AS ENUM('student', 'place', 'placement', 'report');--> statement-breakpoint
CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'number', 'date', 'select', 'multi_select', 'file', 'boolean');--> statement-breakpoint
CREATE TYPE "public"."day" AS ENUM('sun', 'mon', 'tue', 'wed', 'thu', 'fri');--> statement-breakpoint
CREATE TYPE "public"."degree_type" AS ENUM('bachelor', 'master', 'practical_engineer', 'other');--> statement-breakpoint
CREATE TYPE "public"."degree_year" AS ENUM('a', 'b', 'c', 'd_plus');--> statement-breakpoint
CREATE TYPE "public"."general_impression" AS ENUM('very_suitable', 'suitable', 'conditionally_suitable', 'not_suitable');--> statement-breakpoint
CREATE TYPE "public"."interview_kind" AS ENUM('interview', 'reassignment');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('draft', 'finalized', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('he', 'en');--> statement-breakpoint
CREATE TYPE "public"."place_status" AS ENUM('active', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'approved', 'rejected', 'needs_correction');--> statement-breakpoint
CREATE TYPE "public"."report_type" AS ENUM('volunteering', 'absence');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('student', 'coordinator', 'interviewer', 'manager');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'invited', 'inactive');--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"report_deadline" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_years_dates_chk" CHECK ("academic_years"."end_date" > "academic_years"."start_date")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" uuid,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"value" jsonb
);
--> statement-breakpoint
CREATE TABLE "custom_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity" "custom_entity" NOT NULL,
	"key" text NOT NULL,
	"label_he" text NOT NULL,
	"label_en" text,
	"type" "custom_field_type" NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"visible_to_roles" "role"[] DEFAULT ARRAY['manager']::role[] NOT NULL,
	"editable_by_roles" "role"[] DEFAULT ARRAY['manager']::role[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hour_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"placement_id" uuid,
	"place_id" uuid,
	"coordinator_id" uuid,
	"academic_year_id" uuid NOT NULL,
	"report_type" "report_type" DEFAULT 'volunteering' NOT NULL,
	"volunteer_date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"reported_hours" numeric(7, 2) NOT NULL,
	"approved_hours" numeric(7, 2) NOT NULL,
	"student_notes" text,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"coordinator_notes" text,
	"absence_reason" "absence_reason",
	"attachment" text,
	"counts_toward_target" boolean DEFAULT true NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"escalation_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hour_reports_reported_chk" CHECK ("hour_reports"."reported_hours" > 0),
	CONSTRAINT "hour_reports_approved_chk" CHECK ("hour_reports"."approved_hours" >= 0),
	CONSTRAINT "hour_reports_volunteering_placement_chk" CHECK ("hour_reports"."report_type" = 'absence' OR "hour_reports"."placement_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"interviewer_id" uuid NOT NULL,
	"kind" "interview_kind" DEFAULT 'interview' NOT NULL,
	"interview_date" date,
	"status" "interview_status" DEFAULT 'draft' NOT NULL,
	"general_impression" "general_impression",
	"notes" text,
	"preferences_discussed" text,
	"constraints_discussed" text,
	"placement_decision_notes" text,
	"summary" text,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lookups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"label_he" text NOT NULL,
	"label_en" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_time_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"label" text NOT NULL,
	"days" "day"[] DEFAULT ARRAY[]::day[] NOT NULL,
	"start_time" time,
	"end_time" time,
	"hours_per_slot" numeric(7, 2) NOT NULL,
	"slots" numeric(7, 2) NOT NULL,
	"task_description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_time_windows_slots_chk" CHECK ("place_time_windows"."slots" >= 0 AND "place_time_windows"."hours_per_slot" > 0)
);
--> statement-breakpoint
CREATE TABLE "placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"interview_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"time_window_id" uuid NOT NULL,
	"slots" numeric(7, 2) NOT NULL,
	"weekly_hours" numeric(7, 2) NOT NULL,
	"assigned_days" "day"[] DEFAULT ARRAY[]::day[] NOT NULL,
	"assigned_hours" text,
	"default_report_hours" numeric(7, 2),
	"description" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"started_at" date,
	"ended_at" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placements_slots_chk" CHECK ("placements"."slots" > 0),
	CONSTRAINT "placements_weekly_hours_chk" CHECK ("placements"."weekly_hours" > 0)
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"required_hours" numeric(7, 2) NOT NULL,
	"milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_hours_per_day" numeric(7, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programs_hours_chk" CHECK ("programs"."required_hours" >= 0)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"escalation_days" integer DEFAULT 7 NOT NULL,
	"coordinator_reminder_enabled" boolean DEFAULT true NOT NULL,
	"reminder_channels" "channel"[] DEFAULT ARRAY['email']::channel[] NOT NULL,
	"languages" "locale"[] DEFAULT ARRAY['he','en']::locale[] NOT NULL,
	"inactivity_weeks" integer DEFAULT 3 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"national_id" text,
	"date_of_birth" date,
	"city" text,
	"institution" text,
	"degree_type" "degree_type",
	"degree_year" "degree_year",
	"field_of_study" text,
	"track_id" uuid,
	"target_hours_override" numeric(7, 2),
	"academic_year_id" uuid,
	"preferred_types" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"preferred_activities" text,
	"available_days" "day"[] DEFAULT ARRAY[]::day[] NOT NULL,
	"available_hours" text,
	"general_preferences" text,
	"student_notes" text,
	"bank_name" text,
	"bank_branch" text,
	"bank_account" text,
	"account_owner" text,
	"bank_document" text,
	"profile_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"phone" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"roles" "role"[] DEFAULT ARRAY[]::role[] NOT NULL,
	"status" "user_status" DEFAULT 'invited' NOT NULL,
	"locale" "locale" DEFAULT 'he' NOT NULL,
	"coordinator_id" uuid,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volunteer_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"address" text,
	"city" text,
	"geo_lat" numeric(9, 6),
	"geo_lng" numeric(9, 6),
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"category" text,
	"status" "place_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_field_id_custom_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."custom_fields"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hour_reports" ADD CONSTRAINT "hour_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hour_reports" ADD CONSTRAINT "hour_reports_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hour_reports" ADD CONSTRAINT "hour_reports_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hour_reports" ADD CONSTRAINT "hour_reports_place_id_volunteer_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."volunteer_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hour_reports" ADD CONSTRAINT "hour_reports_coordinator_id_users_id_fk" FOREIGN KEY ("coordinator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hour_reports" ADD CONSTRAINT "hour_reports_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hour_reports" ADD CONSTRAINT "hour_reports_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_interviewer_id_users_id_fk" FOREIGN KEY ("interviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookups" ADD CONSTRAINT "lookups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_time_windows" ADD CONSTRAINT "place_time_windows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_time_windows" ADD CONSTRAINT "place_time_windows_place_id_volunteer_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."volunteer_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_place_id_volunteer_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."volunteer_places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_time_window_id_place_time_windows_id_fk" FOREIGN KEY ("time_window_id") REFERENCES "public"."place_time_windows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_track_id_programs_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_coordinator_id_users_id_fk" FOREIGN KEY ("coordinator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_places" ADD CONSTRAINT "volunteer_places_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academic_years_org_idx" ON "academic_years" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_years_current_uq" ON "academic_years" USING btree ("organization_id") WHERE "academic_years"."is_current";--> statement-breakpoint
CREATE INDEX "audit_log_org_created_idx" ON "audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_values_field_entity_uq" ON "custom_field_values" USING btree ("field_id","entity_id");--> statement-breakpoint
CREATE INDEX "custom_field_values_entity_idx" ON "custom_field_values" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_fields_org_entity_key_uq" ON "custom_fields" USING btree ("organization_id","entity","key");--> statement-breakpoint
CREATE INDEX "hour_reports_org_idx" ON "hour_reports" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "hour_reports_student_idx" ON "hour_reports" USING btree ("student_id","volunteer_date");--> statement-breakpoint
CREATE INDEX "hour_reports_coordinator_status_idx" ON "hour_reports" USING btree ("coordinator_id","status");--> statement-breakpoint
CREATE INDEX "hour_reports_escalation_idx" ON "hour_reports" USING btree ("submitted_at") WHERE "hour_reports"."status" = 'pending' AND "hour_reports"."escalation_sent_at" IS NULL;--> statement-breakpoint
CREATE INDEX "interviews_org_idx" ON "interviews" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "interviews_student_idx" ON "interviews" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interviews_one_draft_uq" ON "interviews" USING btree ("student_id") WHERE "interviews"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "lookups_org_kind_key_uq" ON "lookups" USING btree ("organization_id","kind","key");--> statement-breakpoint
CREATE INDEX "place_time_windows_org_idx" ON "place_time_windows" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "place_time_windows_place_idx" ON "place_time_windows" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "placements_org_idx" ON "placements" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "placements_student_idx" ON "placements" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "placements_interview_idx" ON "placements" USING btree ("interview_id");--> statement-breakpoint
CREATE INDEX "placements_window_active_idx" ON "placements" USING btree ("time_window_id") WHERE "placements"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "placements_student_window_active_uq" ON "placements" USING btree ("student_id","time_window_id") WHERE "placements"."is_active";--> statement-breakpoint
CREATE INDEX "programs_org_idx" ON "programs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "student_profiles_org_idx" ON "student_profiles" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_org_email_uq" ON "users" USING btree ("organization_id",lower("email"));--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "users_coordinator_idx" ON "users" USING btree ("coordinator_id");--> statement-breakpoint
CREATE INDEX "volunteer_places_org_idx" ON "volunteer_places" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "volunteer_places_status_idx" ON "volunteer_places" USING btree ("status");