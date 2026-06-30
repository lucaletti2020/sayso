import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAzureOpenAI, DEPLOYMENT } from "@/lib/azure-openai";
import { sentenceGenerationPrompt } from "@/lib/prompts";
import { cefrBandForLevel, cefrGuidance, type CefrBand } from "@/lib/cefr";
import { readObjectives } from "@/lib/objectives";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { scenarioId, regenerate } = await req.json();

  const scenario = await prisma.scenario.findUnique({ where: { id: scenarioId } });
  if (!scenario || scenario.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (regenerate) {
    // Clear the cached set so a fresh batch is generated below.
    await prisma.practiceSentence.deleteMany({ where: { scenarioId } });
  } else {
    // Return cached sentences if they exist
    const existing = await prisma.practiceSentence.findMany({
      where: { scenarioId },
      orderBy: { orderIndex: "asc" },
    });
    if (existing.length > 0) return NextResponse.json({ sentences: existing });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jobTitle: true, englishLevel: true, cefrLevel: true, nativeLanguage: true },
  });

  const band = (user?.cefrLevel as CefrBand) ?? cefrBandForLevel(user?.englishLevel);
  const obj = readObjectives(scenario.objectives);

  const openai = getAzureOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEPLOYMENT,
    messages: [
      {
        role: "user",
        content: sentenceGenerationPrompt(
          {
            title: scenario.title,
            description: scenario.description,
            canDo: obj.canDo,
            functions: obj.functions,
            grammarFocus: obj.grammarFocus,
            targetPhrases: obj.targetPhrases,
          },
          {
            jobTitle: user?.jobTitle ?? "professional",
            nativeLanguage: user?.nativeLanguage,
            cefrBand: band,
            cefrGuidance: cefrGuidance(band),
          }
        ),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const raw = completion.choices[0].message.content ?? "[]";
  let items: { text: string; translation?: string }[] = [];
  try {
    const parsed = JSON.parse(raw);
    // Be robust to the model wrapping the array under various keys.
    const candidate = Array.isArray(parsed)
      ? parsed
      : parsed.sentences ??
        parsed.content ??
        Object.values(parsed).find((v) => Array.isArray(v)) ??
        [];
    items = (candidate as unknown[])
      .map((c) =>
        typeof c === "string"
          ? { text: c, translation: "" }
          : { text: (c as { text?: string }).text ?? "", translation: (c as { translation?: string }).translation ?? "" }
      )
      .filter((c) => c.text.trim());
  } catch {
    return NextResponse.json({ error: "Failed to parse sentences" }, { status: 500 });
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "No sentences generated" }, { status: 500 });
  }

  const sentences = await Promise.all(
    items.slice(0, 10).map((item, i) =>
      prisma.practiceSentence.create({
        data: {
          scenarioId,
          text: item.text,
          translation: item.translation?.trim() || null,
          orderIndex: i,
        },
      })
    )
  );

  return NextResponse.json({ sentences });
}
