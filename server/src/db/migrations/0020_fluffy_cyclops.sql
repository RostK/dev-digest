ALTER TABLE "eval_cases" ADD COLUMN "finding_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_finding_uq" ON "eval_cases" USING btree ("finding_id");