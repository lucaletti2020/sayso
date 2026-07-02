-- Recreate curriculum tables with composite (level, unitNumber) identity.
DROP TABLE IF EXISTS "CurriculumScenario";
DROP TABLE IF EXISTS "CurriculumUnit";

CREATE TABLE "CurriculumUnit" (
    "level" TEXT NOT NULL,
    "unitNumber" INTEGER NOT NULL,
    "grammar" TEXT NOT NULL,
    "vocabulary" TEXT NOT NULL,
    "functions" TEXT NOT NULL,
    CONSTRAINT "CurriculumUnit_pkey" PRIMARY KEY ("level","unitNumber")
);

CREATE TABLE "CurriculumScenario" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "unitNumber" INTEGER NOT NULL,
    "industry" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "scenarioTitle" TEXT NOT NULL,
    CONSTRAINT "CurriculumScenario_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CurriculumScenario_level_unitNumber_industry_jobTitle_key" ON "CurriculumScenario"("level","unitNumber","industry","jobTitle");
CREATE INDEX "CurriculumScenario_industry_jobTitle_idx" ON "CurriculumScenario"("industry","jobTitle");

ALTER TABLE "CurriculumScenario" ADD CONSTRAINT "CurriculumScenario_level_unitNumber_fkey" FOREIGN KEY ("level","unitNumber") REFERENCES "CurriculumUnit"("level","unitNumber") ON DELETE CASCADE ON UPDATE CASCADE;
