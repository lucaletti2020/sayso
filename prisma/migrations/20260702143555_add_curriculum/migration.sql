-- CreateTable
CREATE TABLE "CurriculumUnit" (
    "unitNumber" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "grammar" TEXT NOT NULL,
    "vocabulary" TEXT NOT NULL,
    "functions" TEXT NOT NULL,

    CONSTRAINT "CurriculumUnit_pkey" PRIMARY KEY ("unitNumber")
);

-- CreateTable
CREATE TABLE "CurriculumScenario" (
    "id" TEXT NOT NULL,
    "unitNumber" INTEGER NOT NULL,
    "industry" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "scenarioTitle" TEXT NOT NULL,

    CONSTRAINT "CurriculumScenario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CurriculumScenario_industry_jobTitle_idx" ON "CurriculumScenario"("industry", "jobTitle");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumScenario_unitNumber_industry_jobTitle_key" ON "CurriculumScenario"("unitNumber", "industry", "jobTitle");

-- AddForeignKey
ALTER TABLE "CurriculumScenario" ADD CONSTRAINT "CurriculumScenario_unitNumber_fkey" FOREIGN KEY ("unitNumber") REFERENCES "CurriculumUnit"("unitNumber") ON DELETE CASCADE ON UPDATE CASCADE;
