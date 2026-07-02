import { prisma } from "@/lib/prisma";

export type CurriculumUnitRow = {
  unitNumber: number;
  level: string;
  grammar: string;
  vocabulary: string;
  functions: string;
  scenarioTitle: string;
};

// Returns the curriculum units (grammar/vocab/functions + the role-specific
// scenario title) for a given industry + job title, ordered by level then unit.
// Pass `level` to get just that level's units (e.g. the learner's level).
export async function getCurriculumFor(
  industry: string,
  jobTitle: string,
  level?: string
): Promise<CurriculumUnitRow[]> {
  const rows = await prisma.curriculumScenario.findMany({
    where: { industry, jobTitle, ...(level ? { level } : {}) },
    include: { unit: true },
    orderBy: [{ level: "asc" }, { unitNumber: "asc" }],
  });
  return rows.map((r) => ({
    unitNumber: r.unitNumber,
    level: r.level,
    grammar: r.unit.grammar,
    vocabulary: r.unit.vocabulary,
    functions: r.unit.functions,
    scenarioTitle: r.scenarioTitle,
  }));
}

// Distinct industries available in the curriculum (for matching/classification).
export async function listIndustries(): Promise<string[]> {
  const rows = await prisma.curriculumScenario.findMany({
    distinct: ["industry"],
    select: { industry: true },
    orderBy: { industry: "asc" },
  });
  return rows.map((r) => r.industry);
}

// Distinct job titles within an industry (for matching/classification).
export async function listJobTitles(industry: string): Promise<string[]> {
  const rows = await prisma.curriculumScenario.findMany({
    where: { industry },
    distinct: ["jobTitle"],
    select: { jobTitle: true },
    orderBy: { jobTitle: "asc" },
  });
  return rows.map((r) => r.jobTitle);
}
