import { NextRequest, NextResponse } from "next/server";
import { getAzureOpenAI, DEPLOYMENT } from "@/lib/azure-openai";
import { moduleGenerationPrompt } from "@/lib/prompts";

// Proposes 10 course modules (scenario-group themes) based on the profile and
// questionnaire answers. The user then picks up to 8 before scenarios are built.
export async function POST(req: NextRequest) {
  const { profile, answers } = await req.json();

  const openai = getAzureOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEPLOYMENT,
    messages: [
      {
        role: "user",
        content: moduleGenerationPrompt({
          firstName: profile.firstName ?? "there",
          jobTitle: profile.jobTitle ?? "a professional",
          company: profile.company ?? "their company",
          companySize: profile.companySize ?? null,
          responsibilities: profile.responsibilities ?? [],
          answers: answers ?? [],
        }),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_completion_tokens: 1500,
  });

  const raw = completion.choices[0].message.content ?? "{}";
  let modules: { title: string; description: string }[] = [];
  try {
    modules = JSON.parse(raw).modules ?? [];
  } catch {
    return NextResponse.json({ error: "Failed to generate modules" }, { status: 500 });
  }

  // Remove duplicate module titles (case-insensitive) before offering them.
  const seen = new Set<string>();
  modules = modules.filter((m) => {
    const key = m.title?.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({ modules: modules.slice(0, 10) });
}
