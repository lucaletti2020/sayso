-- Course entity: one per (profile, level) course a user creates.
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "firstName" TEXT,
    "linkedinUrl" TEXT,
    "jobTitle" TEXT,
    "company" TEXT,
    "companySize" TEXT,
    "industry" TEXT,
    "responsibilities" TEXT,
    "englishLevel" TEXT,
    "cefrLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Course_userId_idx" ON "Course"("userId");
ALTER TABLE "Course" ADD CONSTRAINT "Course_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScenarioGroup" ADD COLUMN "courseId" TEXT;
CREATE INDEX "ScenarioGroup_courseId_idx" ON "ScenarioGroup"("courseId");
ALTER TABLE "ScenarioGroup" ADD CONSTRAINT "ScenarioGroup_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every user with scenario groups becomes a one-course user, using
-- their current profile snapshot from the User row.
INSERT INTO "Course" ("id", "userId", "title", "firstName", "linkedinUrl", "jobTitle", "company", "companySize", "industry", "responsibilities", "englishLevel", "cefrLevel", "createdAt")
SELECT
  gen_random_uuid()::text,
  u."id",
  COALESCE(u."jobTitle", 'My Course') || COALESCE(' — ' || u."englishLevel", ''),
  NULLIF(split_part(COALESCE(u."name", ''), ' ', 1), ''),
  u."linkedinUrl", u."jobTitle", u."company", u."companySize", u."industry", u."responsibilities", u."englishLevel", u."cefrLevel",
  CURRENT_TIMESTAMP
FROM "User" u
WHERE EXISTS (SELECT 1 FROM "ScenarioGroup" g WHERE g."userId" = u."id");

UPDATE "ScenarioGroup" g SET "courseId" = c."id" FROM "Course" c WHERE c."userId" = g."userId";
