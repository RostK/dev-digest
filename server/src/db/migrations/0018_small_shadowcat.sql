ALTER TABLE "eval_runs" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "agent_version" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "system_prompt" text;--> statement-breakpoint
CREATE INDEX "eval_cases_owner_idx" ON "eval_cases" USING btree ("owner_kind","owner_id");--> statement-breakpoint
CREATE INDEX "eval_runs_group_idx" ON "eval_runs" USING btree ("group_id");