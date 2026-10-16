CREATE INDEX "hour_reports_org_status_idx" ON "hour_reports" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "hour_reports_year_idx" ON "hour_reports" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "hour_reports_place_idx" ON "hour_reports" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "placements_place_active_idx" ON "placements" USING btree ("place_id") WHERE "placements"."is_active";