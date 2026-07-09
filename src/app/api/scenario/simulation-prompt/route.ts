import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAzureOpenAI, DEPLOYMENT } from "@/lib/azure-openai";
import { simulationPromptBuilderPrompt } from "@/lib/prompts";
import { readObjectives } from "@/lib/objectives";
import { prisma } from "@/lib/prisma";

// Returns the voice-agent system prompt for a scenario. The prompt is generated
// (via the AI) and cached on the Scenario the first time this is called, so
// every later visit reuses the same conversation design.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { scenarioId } = await req.json();

  const scenario = await prisma.scenario.findFirst({
    where: { id: scenarioId, userId },
    include: { group: { include: { course: true } } },
  });
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const course = scenario.group.course;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, jobTitle: true, company: true, englishLevel: true },
  });

  // Level/role come from this scenario's own course, falling back to the
  // user's latest profile.
  const englishLevel = course?.englishLevel ?? user?.englishLevel ?? null;
  const jobTitle = course?.jobTitle ?? user?.jobTitle ?? "a professional";
  const company = course?.company ?? user?.company ?? "their company";
  const firstName = course?.firstName ?? user?.name?.split(" ")[0] ?? "the user";

  // Already generated — reuse it.
  if (scenario.simulationPrompt) {
    return NextResponse.json({
      prompt: scenario.simulationPrompt,
      firstMessage: extractOpening(scenario.simulationPrompt),
      englishLevel,
    });
  }

  const openai = getAzureOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEPLOYMENT,
    messages: [
      {
        role: "user",
        content: simulationPromptBuilderPrompt(
          {
            firstName,
            jobTitle,
            company,
            englishLevel,
          },
          (() => {
            const o = readObjectives(scenario.objectives);
            return {
              title: scenario.title,
              description: scenario.description,
              canDo: o.canDo,
              functions: o.functions,
            };
          })()
        ),
      },
    ],
    temperature: 0.7,
    max_completion_tokens: 700,
  });

  const prompt = completion.choices[0].message.content?.trim() ?? "";
  if (!prompt) {
    return NextResponse.json({ error: "Failed to build prompt" }, { status: 500 });
  }

  await prisma.scenario.update({
    where: { id: scenario.id },
    data: { simulationPrompt: prompt },
  });

  return NextResponse.json({
    prompt,
    firstMessage: extractOpening(prompt),
    englishLevel,
  });
}

// Pulls the opening line the agent should speak first, from the template's
// `1. Start with: "..."` section. Returns null if it can't be found.
function extractOpening(prompt: string): string | null {
  const match = prompt.match(/Start with:\s*"([^"]+)"/);
  return match ? match[1].trim() : null;
}
