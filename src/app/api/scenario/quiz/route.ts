import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAzureOpenAI, DEPLOYMENT } from "@/lib/azure-openai";
import { grammarQuizPrompt, grammarQuizReviewPrompt } from "@/lib/prompts";
import { cefrBandForLevel, cefrGuidance, type CefrBand } from "@/lib/cefr";
import { readObjectives } from "@/lib/objectives";
import { sanitizeQuiz, quizMixForBand, QUIZ_SIZE, type QuizQuestion } from "@/lib/quiz";
import { prisma } from "@/lib/prisma";

// Generates (and caches on the scenario) the 10-question Grammar & Vocabulary
// quiz. `regenerate: true` overwrites the cached set.
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

  // Cached set (unless regenerating).
  if (!regenerate && scenario.grammarQuiz) {
    const cached = sanitizeQuiz(scenario.grammarQuiz);
    if (cached.length > 0) return NextResponse.json({ questions: cached });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, jobTitle: true, company: true, englishLevel: true, nativeLanguage: true },
  });

  const obj = readObjectives(scenario.objectives);
  // Level/role come from this scenario's own course (falling back to the
  // scenario objectives, then the user's latest profile).
  const band =
    (obj.cefrLevel as CefrBand | null) ??
    (course?.cefrLevel as CefrBand | null) ??
    cefrBandForLevel(course?.englishLevel ?? user?.englishLevel);
  const mix = quizMixForBand(band);
  const profile = {
    jobTitle: course?.jobTitle ?? user?.jobTitle ?? "professional",
    firstName: course?.firstName ?? user?.name?.split(" ")[0] ?? null,
    company: course?.company ?? user?.company ?? null,
    nativeLanguage: user?.nativeLanguage,
    cefrBand: band,
    cefrGuidance: cefrGuidance(band),
  };

  const openai = getAzureOpenAI();

  // 1. Generate.
  const completion = await openai.chat.completions.create({
    model: DEPLOYMENT,
    messages: [
      {
        role: "user",
        content: grammarQuizPrompt(
          {
            title: scenario.title,
            description: scenario.description,
            grammarFocus: obj.grammarFocus,
            vocabulary: obj.vocabulary,
            functions: obj.functions,
          },
          profile
        ),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_completion_tokens: 4000,
  });

  let questions: QuizQuestion[] = [];
  try {
    questions = sanitizeQuiz(JSON.parse(completion.choices[0].message.content ?? "{}"));
  } catch {
    questions = [];
  }

  if (questions.length === 0) {
    return NextResponse.json({ error: "Quiz generation failed" }, { status: 500 });
  }

  // 2. Review/fix pass (coverage, single-correct gaps, counts, language rules).
  try {
    const review = await openai.chat.completions.create({
      model: DEPLOYMENT,
      messages: [
        {
          role: "user",
          content: grammarQuizReviewPrompt(
            JSON.stringify({ questions }),
            { grammarFocus: obj.grammarFocus, vocabulary: obj.vocabulary },
            {
              band,
              gapCount: mix.gap,
              matchCount: mix.match,
              nativeLanguage: user?.nativeLanguage,
            }
          ),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_completion_tokens: 4000,
    });
    const parsed = JSON.parse(review.choices[0].message.content ?? "{}");
    if (parsed?.ok === false && parsed?.questions) {
      const fixed = sanitizeQuiz(parsed);
      if (fixed.length >= Math.min(QUIZ_SIZE, questions.length)) {
        questions = fixed;
      }
    }
  } catch {
    // Review is best-effort; the generated set still ships.
  }

  questions = questions.slice(0, QUIZ_SIZE);

  // 3. Persist.
  await prisma.scenario.update({
    where: { id: scenario.id },
    data: { grammarQuiz: { questions } },
  });

  return NextResponse.json({ questions });
}
