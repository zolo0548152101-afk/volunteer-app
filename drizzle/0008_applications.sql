CREATE TYPE "public"."application_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "student_profiles" ADD COLUMN "application_status" "application_status";--> statement-breakpoint
ALTER TABLE "student_profiles" ADD COLUMN "application_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD COLUMN "application_decided_by" uuid;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_application_decided_by_users_id_fk" FOREIGN KEY ("application_decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_profiles_application_idx" ON "student_profiles" USING btree ("organization_id","application_status");