CREATE INDEX "skills_repo_idx" ON "skills" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX "conventions_repo_idx" ON "conventions" USING btree ("workspace_id","repo_id");