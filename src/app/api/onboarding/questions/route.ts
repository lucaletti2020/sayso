import { NextRequest, NextResponse } from "next/server";
import { getAzureOpenAI, DEPLOYMENT } from "@/lib/azure-openai";
import { diagnosticQuestionsPrompt } from "@/lib/prompts";

// Generates 5 personalised multiple-choice questions from the profile.
// All of the agent's reasoning happens inside the model and is discarded —
// only the 5 questions are returned to the client.
export async function POST(req: NextRequest) {
  const { profile } = await req.json();

  const openai = getAzureOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEPLOYMENT,
    messages: [
      {
        role: "user",
        content: diagnosticQuestionsPrompt({
          firstName: profile.firstName ?? "there",
          jobTitle: profile.jobTitle ?? "a professional",
          company: profile.company ?? "their company",
          companySize: profile.companySize ?? null,
          responsibilities: profile.responsibilities ?? [],
        }),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_completion_tokens: 1500,
  });

  const raw = completion.choices[0].message.content ?? "{}";
  let questions: { question: string; options: string[] }[] = [];
  try {
    const parsed = JSON.parse(raw);
    questions = parsed.questions ?? [];
  } catch {
    return NextResponse.json({ error: "Failed to generate questions" }, { status: 500 });
  }

  // Always finish with a fixed question about the user's English level.
  const LEVEL_QUESTION = {
    question: "How would you describe your current English level?",
    options: ["Beginner", "Intermediate", "Upper intermediate", "Advanced"],
    single: true,
  };

  const finalQuestions = [...questions.slice(0, 4), LEVEL_QUESTION];

  return NextResponse.json({ questions: finalQuestions });
}
