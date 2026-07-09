import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAzureOpenAI, DEPLOYMENT } from "@/lib/azure-openai";
import {
  sentenceGenerationPrompt,
  sentenceCoverageReviewPrompt,
  sentenceRepairPrompt,
} from "@/lib/prompts";
import { cefrBandForLevel, cefrGuidance, type CefrBand } from "@/lib/cefr";
import { readObjectives } from "@/lib/objectives";
import { generateSentenceAudio } from "@/lib/tts";
import { prisma } from "@/lib/prisma";

type GeneratedSentence = { text: string; translation?: string; grammarPoint?: string };

const MAX_SENTENCES = 15;

// Pulls a sentence array out of a (possibly wrapped) model JSON response.
function parseSentences(raw: string): GeneratedSentence[] {
  try {
    const parsed = JSON.parse(raw);
    const candidate = Array.isArray(parsed)
      ? parsed
      : parsed.sentences ??
        parsed.content ??
        Object.values(parsed).find((v) => Array.isArray(v)) ??
        [];
    return (candidate as unknown[])
      .map((c) =>
        typeof c === "string"
          ? { text: c, translation: "", grammarPoint: "" }
          : {
              text: (c as { text?: string }).text ?? "",
              translation: (c as { translation?: string }).translation ?? "",
              grammarPoint: (c as { grammarPoint?: string }).grammarPoint ?? "",
            }
      )
      .filter((c) => c.text.trim());
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { scenarioId, regenerate } = await req.json();

  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    include: { group: { include: { course: true } } },
  });
  if (!scenario || scenario.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const course = scenario.group.course;

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

  const obj = readObjectives(scenario.objectives);
  // Level/role come from this scenario's own course (falling back to the
  // scenario objectives, then the user's latest profile).
  const band =
    (obj.cefrLevel as CefrBand | null) ??
    (course?.cefrLevel as CefrBand | null) ??
    cefrBandForLevel(course?.englishLevel ?? user?.englishLevel);
  const profile = {
    jobTitle: course?.jobTitle ?? user?.jobTitle ?? "professional",
    nativeLanguage: user?.nativeLanguage,
    cefrBand: band,
    cefrGuidance: cefrGuidance(band),
  };
  const scenarioInfo = {
    title: scenario.title,
    description: scenario.description,
    canDo: obj.canDo,
    functions: obj.functions,
    grammarFocus: obj.grammarFocus,
    vocabulary: obj.vocabulary,
    targetPhrases: obj.targetPhrases,
  };

  const openai = getAzureOpenAI();

  // 1. Generate the set (8–15 sentences covering all grammar elements).
  const completion = await openai.chat.completions.create({
    model: DEPLOYMENT,
    messages: [{ role: "user", content: sentenceGenerationPrompt(scenarioInfo, profile) }],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_completion_tokens: 3000,
  });
  let items = parseSentences(completion.choices[0].message.content ?? "{}");

  if (items.length === 0) {
    return NextResponse.json({ error: "No sentences generated" }, { status: 500 });
  }

  // 2. Review pass: verify every grammar element is covered; repair any gaps.
  if (obj.grammarFocus) {
    try {
      const review = await openai.chat.completions.create({
        model: DEPLOYMENT,
        messages: [
          {
            role: "user",
            content: sentenceCoverageReviewPrompt(
              obj.grammarFocus,
              items.map((s) => s.text)
            ),
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_completion_tokens: 400,
      });
      const reviewParsed = JSON.parse(review.choices[0].message.content ?? "{}");
      const missing: string[] = Array.isArray(reviewParsed.missing)
        ? reviewParsed.missing.filter((m: unknown) => typeof m === "string")
        : [];

      if (missing.length > 0) {
        const repair = await openai.chat.completions.create({
          model: DEPLOYMENT,
          messages: [
            {
              role: "user",
              content: sentenceRepairPrompt(
                { title: scenario.title, description: scenario.description },
                missing,
                profile
              ),
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_completion_tokens: 1200,
        });
        const extra = parseSentences(repair.choices[0].message.content ?? "{}");
        items = [...items, ...extra];
      }
    } catch {
      // Review is best-effort; the base set still ships.
    }
  }

  items = items.slice(0, MAX_SENTENCES);

  // 3. Persist the set.
  const sentences = await Promise.all(
    items.map((item, i) =>
      prisma.practiceSentence.create({
        data: {
          scenarioId,
          text: item.text,
          translation: item.translation?.trim() || null,
          grammarPoint: item.grammarPoint?.trim() || null,
          orderIndex: i,
        },
      })
    )
  );

  // 4. Generate all audios in parallel (best-effort) so the set is stored
  //    complete and ready for practice.
  const audioResults = await Promise.allSettled(
    sentences.map((s) => generateSentenceAudio(s.id, s.text))
  );
  const withAudio = sentences.map((s, i) => {
    const r = audioResults[i];
    return { ...s, audioUrl: r.status === "fulfilled" ? r.value : null };
  });

  return NextResponse.json({ sentences: withAudio });
}
