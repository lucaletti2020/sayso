import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAzureOpenAI, DEPLOYMENT } from "@/lib/azure-openai";
import { curriculumCoursePrompt } from "@/lib/prompts";
import { getCurriculumFor } from "@/lib/curriculum";
import { cefrBandForLevel } from "@/lib/cefr";
import { prisma } from "@/lib/prisma";

const CURRICULUM_LEVELS = ["Beginner", "Intermediate", "Upper Intermediate", "Advanced"];

// Builds a fixed 12-unit course from the curriculum for a matched
// (industry, jobTitle, level), personalising each unit's situation while
// keeping its grammar/vocabulary/functions focus.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { profile, answers, industry, jobTitle } = await req.json();
  if (!industry || !jobTitle) {
    return NextResponse.json({ error: "Missing industry or jobTitle" }, { status: 400 });
  }

  // Self-reported level → curriculum level (case-insensitive) + CEFR band.
  const englishLevel =
    (answers as { question: string; answer: string }[] | undefined)?.find((a) =>
      CURRICULUM_LEVELS.some((l) => a.answer?.toLowerCase().includes(l.toLowerCase()))
    )?.answer ?? "Intermediate";
  // Exact (case-insensitive) match so "Upper intermediate" doesn't match
  // "Intermediate" by substring.
  const curriculumLevel =
    CURRICULUM_LEVELS.find((l) => l.toLowerCase() === englishLevel.trim().toLowerCase()) ??
    "Intermediate";
  const cefrBand = cefrBandForLevel(englishLevel);

  const units = await getCurriculumFor(industry, jobTitle, curriculumLevel);
  if (units.length === 0) {
    return NextResponse.json({ error: "No curriculum found for this match" }, { status: 404 });
  }

  // Personalise the situations (grammar/vocab/functions stay from the curriculum).
  const openai = getAzureOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEPLOYMENT,
    messages: [
      {
        role: "user",
        content: curriculumCoursePrompt(
          {
            jobTitle: profile.jobTitle ?? jobTitle,
            company: profile.company ?? "their company",
            industry,
            answers: answers ?? [],
          },
          units.map((u) => ({
            unitNumber: u.unitNumber,
            grammar: u.grammar,
            vocabulary: u.vocabulary,
            functions: u.functions,
            baseScenarioTitle: u.scenarioTitle,
          }))
        ),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.6,
    max_completion_tokens: 4000,
  });

  type Personalised = { unitNumber: number; title: string; description: string; canDo?: string; targetPhrases?: string[] };
  let personalised: Personalised[] = [];
  try {
    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
    personalised = parsed.units ?? parsed.content ?? [];
  } catch {
    personalised = [];
  }
  const byUnit = new Map(personalised.map((p) => [p.unitNumber, p]));

  // Persist profile + curriculum details.
  await prisma.user.update({
    where: { id: userId },
    data: {
      jobTitle: profile.jobTitle,
      company: profile.company,
      companySize: profile.companySize ?? null,
      industry: profile.industry ?? industry,
      englishLevel,
      cefrLevel: cefrBand,
      nativeLanguage: profile.nativeLanguage ?? null,
      responsibilities: profile.responsibilities?.join("\n"),
      linkedinUrl: profile.linkedinUrl ?? null,
      onboardingDone: true,
    },
  });

  await prisma.scenarioGroup.deleteMany({ where: { userId } });

  await prisma.scenarioGroup.create({
    data: {
      userId,
      title: `Your Course — ${curriculumLevel}`,
      orderIndex: 0,
      scenarios: {
        create: units.map((u) => {
          const p = byUnit.get(u.unitNumber);
          return {
            userId,
            title: p?.title ?? u.scenarioTitle,
            description: p?.description ?? "",
            status: "UNLOCKED" as const,
            objectives: {
              cefrLevel: cefrBand,
              unitNumber: u.unitNumber,
              canDo: p?.canDo ?? null,
              functions: u.functions.split(/[;,]/).map((s) => s.trim()).filter(Boolean),
              grammarFocus: u.grammar,
              vocabulary: u.vocabulary,
              targetPhrases: p?.targetPhrases ?? [],
            },
          };
        }),
      },
    },
  });

  return NextResponse.json({ ok: true });
}
