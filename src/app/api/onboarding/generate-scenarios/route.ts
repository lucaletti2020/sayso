import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAzureOpenAI, DEPLOYMENT } from "@/lib/azure-openai";
import { scenarioGenerationPrompt } from "@/lib/prompts";
import { cefrBandForLevel, cefrGuidance } from "@/lib/cefr";
import { prisma } from "@/lib/prisma";

type GeneratedScenario = {
  title: string;
  description: string;
  canDo?: string;
  functions?: string[];
  grammarFocus?: string;
  targetPhrases?: string[];
};

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { profile, answers, modules } = await req.json();

  if (!Array.isArray(modules) || modules.length === 0) {
    return NextResponse.json({ error: "No modules selected" }, { status: 400 });
  }

  // Determine the CEFR band from the self-reported level (the fixed final
  // question), and use it to ground generation.
  const LEVELS = ["Beginner", "Intermediate", "Upper intermediate", "Advanced"];
  const englishLevel =
    (answers as { question: string; answer: string }[] | undefined)?.find((a) =>
      LEVELS.some((l) => a.answer?.toLowerCase().includes(l.toLowerCase()))
    )?.answer ?? null;
  const cefrBand = cefrBandForLevel(englishLevel);

  const openai = getAzureOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEPLOYMENT,
    messages: [
      {
        role: "user",
        content: scenarioGenerationPrompt({
          firstName: profile.firstName ?? "there",
          jobTitle: profile.jobTitle ?? "a professional",
          company: profile.company ?? "their company",
          companySize: profile.companySize ?? null,
          responsibilities: profile.responsibilities ?? [],
          answers: answers ?? [],
          modules,
          cefrBand,
          cefrGuidance: cefrGuidance(cefrBand),
        }),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_completion_tokens: 6000,
  });

  const raw = completion.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    groups: { title: string; scenarios: GeneratedScenario[] }[];
  };

  // Drop duplicate modules (case-insensitive on title) and cap at 8 — flexible
  // count up to the maximum, with no repeated modules.
  const seen = new Set<string>();
  const groups = (parsed.groups ?? [])
    .filter((g) => {
      const key = g.title.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);

  // Persist to DB
  await prisma.user.update({
    where: { id: userId },
    data: {
      jobTitle: profile.jobTitle,
      company: profile.company,
      companySize: profile.companySize ?? null,
      industry: profile.industry ?? null,
      englishLevel,
      cefrLevel: cefrBand,
      nativeLanguage: profile.nativeLanguage ?? null,
      responsibilities: profile.responsibilities?.join("\n"),
      linkedinUrl: profile.linkedinUrl ?? null,
      onboardingDone: true,
    },
  });

  // Each onboarding run creates a NEW course (profile × level snapshot);
  // existing courses are kept.
  const course = await prisma.course.create({
    data: {
      userId,
      title: `${profile.jobTitle ?? "My Course"} — ${englishLevel ?? "Intermediate"}`,
      firstName: profile.firstName ?? null,
      linkedinUrl: profile.linkedinUrl ?? null,
      jobTitle: profile.jobTitle ?? null,
      company: profile.company ?? null,
      companySize: profile.companySize ?? null,
      industry: profile.industry ?? null,
      responsibilities: profile.responsibilities?.join("\n") ?? null,
      englishLevel,
      cefrLevel: cefrBand,
    },
  });

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    await prisma.scenarioGroup.create({
      data: {
        userId: userId,
        courseId: course.id,
        title: group.title,
        orderIndex: i,
        scenarios: {
          create: group.scenarios.map((s) => ({
            userId: userId,
            title: s.title,
            description: s.description,
            status: "UNLOCKED",
            objectives: {
              cefrLevel: cefrBand,
              canDo: s.canDo ?? null,
              functions: s.functions ?? [],
              grammarFocus: s.grammarFocus ?? null,
              targetPhrases: s.targetPhrases ?? [],
            },
          })),
        },
      },
    });
  }

  return NextResponse.json({ ok: true });
}
