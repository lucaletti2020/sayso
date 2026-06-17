import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAzureOpenAI, DEPLOYMENT } from "@/lib/azure-openai";
import { sentenceGenerationPrompt } from "@/lib/prompts";
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
    select: { jobTitle: true, englishLevel: true },
  });

  const openai = getAzureOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEPLOYMENT,
    messages: [
      {
        role: "user",
        content: sentenceGenerationPrompt(scenario, {
          jobTitle: user?.jobTitle ?? "professional",
          englishLevel: user?.englishLevel,
        }),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const raw = completion.choices[0].message.content ?? "[]";
  let texts: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    // Be robust to the model wrapping the array under various keys
    // (e.g. "sentences", "content") — take the first string array we find.
    const candidate = Array.isArray(parsed)
      ? parsed
      : parsed.sentences ??
        parsed.content ??
        Object.values(parsed).find((v) => Array.isArray(v)) ??
        [];
    texts = (candidate as unknown[]).filter((t): t is string => typeof t === "string");
  } catch {
    return NextResponse.json({ error: "Failed to parse sentences" }, { status: 500 });
  }

  if (texts.length === 0) {
    return NextResponse.json({ error: "No sentences generated" }, { status: 500 });
  }

  const sentences = await Promise.all(
    texts.slice(0, 10).map((text, i) =>
      prisma.practiceSentence.create({
        data: { scenarioId, text, orderIndex: i },
      })
    )
  );

  return NextResponse.json({ sentences });
}
