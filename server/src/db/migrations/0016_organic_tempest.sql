ALTER TABLE "skills" DROP CONSTRAINT "skills_repo_id_repos_id_fk";
--> statement-breakpoint
DROP INDEX "skills_repo_idx";--> statement-breakpoint
ALTER TABLE "skills" DROP COLUMN "repo_id";