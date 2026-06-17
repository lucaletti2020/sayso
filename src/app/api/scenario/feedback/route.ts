import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAzureOpenAI, DEPLOYMENT } from "@/lib/azure-openai";
import { simulationFeedbackPrompt } from "@/lib/prompts";

// Generates feedback from a finished conversation transcript and saves the
// attempt. Called by the simulation page when the realtime call ends.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { scenarioId, transcript } = await req.json();
  if (!scenarioId || !transcript) {
    return NextResponse.json({ error: "Missing scenarioId or transcript" }, { status: 400 });
  }

  const scenario = await prisma.scenario.findFirst({ where: { id: scenarioId, userId } });
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const openai = getAzureOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEPLOYMENT,
    messages: [{ role: "user", content: simulationFeedbackPrompt(transcript, { title: scenario.title }) }],
    response_format: { type: "json_object" },
    temperature: 0.5,
    max_completion_tokens: 800,
  });

  let feedback;
  try {
    feedback = JSON.parse(completion.choices[0].message.content ?? "{}");
  } catch {
    return NextResponse.json({ error: "Failed to parse feedback" }, { status: 500 });
  }

  const attempt = await prisma.userAttempt.create({
    data: {
      userId,
      scenarioId,
      type: "SIMULATION",
      transcript,
      feedbackJson: feedback,
      score: typeof feedback.overallScore === "number" ? feedback.overallScore : null,
    },
  });

  await prisma.scenario.update({
    where: { id: scenarioId },
    data: { status: "COMPLETED" },
  });

  // The timestamp uniquely identifies this attempt in the feedback URL, so
  // repeated attempts on the same day each have their own page.
  return NextResponse.json({ feedback, timestamp: attempt.createdAt.getTime() });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const scenarioId = searchParams.get("scenarioId");
  if (!scenarioId) return NextResponse.json({ error: "Missing scenarioId" }, { status: 400 });

  const attempt = await prisma.userAttempt.findFirst({
    where: { userId: session.user.id, scenarioId, type: "SIMULATION" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ attempt });
}
