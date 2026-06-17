import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAzureOpenAI, DEPLOYMENT } from "@/lib/azure-openai";
import { scenarioGenerationPrompt } from "@/lib/prompts";
import { prisma } from "@/lib/prisma";

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
        }),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_completion_tokens: 4000,
  });

  const raw = completion.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    groups: { title: string; scenarios: { title: string; description: string }[] }[];
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

  // Pull the English level out of the questionnaire answers (the fixed final
  // question), so it can be stored and reused to tune later AI generations.
  const LEVELS = ["Beginner", "Intermediate", "Upper intermediate", "Advanced"];
  const englishLevel =
    (answers as { question: string; answer: string }[] | undefined)?.find((a) =>
      LEVELS.some((l) => a.answer?.toLowerCase().includes(l.toLowerCase()))
    )?.answer ?? null;

  // Persist to DB
  await prisma.user.update({
    where: { id: userId },
    data: {
      jobTitle: profile.jobTitle,
      company: profile.company,
      companySize: profile.companySize ?? null,
      englishLevel,
      responsibilities: profile.responsibilities?.join("\n"),
      linkedinUrl: profile.linkedinUrl ?? null,
      onboardingDone: true,
    },
  });

  // Delete any previous scenario groups for this user before creating new ones
  await prisma.scenarioGroup.deleteMany({ where: { userId: userId } });

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    await prisma.scenarioGroup.create({
      data: {
        userId: userId,
        title: group.title,
        orderIndex: i,
        scenarios: {
          create: group.scenarios.map((s, j) => ({
            userId: userId,
            title: s.title,
            description: s.description,
            status: "UNLOCKED",
          })),
        },
      },
    });
  }

  return NextResponse.json({ ok: true });
}
