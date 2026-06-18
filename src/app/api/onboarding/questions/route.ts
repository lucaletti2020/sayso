import { NextRequest, NextResponse } from "next/server";
import { getAzureOpenAI, DEPLOYMENT } from "@/lib/azure-openai";
import { onboardingQuestionPrompt } from "@/lib/prompts";

// Generates ONE onboarding question. The first call (no priorAnswers) returns a
// question about the types of situations; the second adapts to that answer to
// learn more about the user's role. All reasoning stays inside the model.
export async function POST(req: NextRequest) {
  const { profile, priorAnswers } = await req.json();
  const prior: { question: string; answer: string }[] = priorAnswers ?? [];
  const stage: 1 | 2 = prior.length === 0 ? 1 : 2;

  const openai = getAzureOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEPLOYMENT,
    messages: [
      {
        role: "user",
        content: onboardingQuestionPrompt(
          {
            firstName: profile.firstName ?? "there",
            jobTitle: profile.jobTitle ?? "a professional",
            company: profile.company ?? "their company",
            companySize: profile.companySize ?? null,
            responsibilities: profile.responsibilities ?? [],
          },
          stage,
          prior
        ),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_completion_tokens: 600,
  });

  const raw = completion.choices[0].message.content ?? "{}";
  let question: { question: string; options: string[] } | null = null;
  try {
    const parsed = JSON.parse(raw);
    // Be robust to the model wrapping the object (e.g. under "content").
    const candidate =
      parsed?.question && parsed?.options
        ? parsed
        : parsed?.content && parsed.content.question
          ? parsed.content
          : Object.values(parsed).find(
              (v) => v && typeof v === "object" && "question" in v && "options" in v
            ) ?? null;
    if (candidate?.question && Array.isArray(candidate.options)) {
      question = { question: candidate.question, options: candidate.options };
    }
  } catch {
    return NextResponse.json({ error: "Failed to generate question" }, { status: 500 });
  }

  if (!question) {
    return NextResponse.json({ error: "No question generated" }, { status: 500 });
  }

  return NextResponse.json({ question });
}
