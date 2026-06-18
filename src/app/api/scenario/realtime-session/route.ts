import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAzureOpenAI, DEPLOYMENT } from "@/lib/azure-openai";
import { simulationPromptBuilderPrompt } from "@/lib/prompts";
import { prisma } from "@/lib/prisma";

const REALTIME_DEPLOYMENT = process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT ?? "";
const REALTIME_REGION = process.env.AZURE_OPENAI_REALTIME_REGION ?? "";
const REALTIME_API_VERSION =
  process.env.AZURE_OPENAI_REALTIME_API_VERSION ?? "2025-04-01-preview";

// Creates an ephemeral Azure OpenAI Realtime session for one call. The system
// prompt (this scenario's conversation design) is injected as the session
// instructions. The browser uses the returned ephemeral key to connect over
// WebRTC — the real API key never leaves the server.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!REALTIME_DEPLOYMENT || !REALTIME_REGION) {
    return NextResponse.json(
      { error: "Realtime not configured. Set AZURE_OPENAI_REALTIME_DEPLOYMENT and AZURE_OPENAI_REALTIME_REGION." },
      { status: 500 }
    );
  }

  const { scenarioId } = await req.json();

  const scenario = await prisma.scenario.findFirst({ where: { id: scenarioId, userId } });
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Ensure the scenario's conversation prompt exists (generate + cache if not).
  let instructions = scenario.simulationPrompt;
  if (!instructions) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, jobTitle: true, company: true, englishLevel: true },
    });
    const openai = getAzureOpenAI();
    const completion = await openai.chat.completions.create({
      model: DEPLOYMENT,
      messages: [
        {
          role: "user",
          content: simulationPromptBuilderPrompt(
            {
              firstName: user?.name?.split(" ")[0] ?? "the user",
              jobTitle: user?.jobTitle ?? "a professional",
              company: user?.company ?? "their company",
              englishLevel: user?.englishLevel,
            },
            { title: scenario.title, description: scenario.description }
          ),
        },
      ],
      temperature: 0.7,
      max_completion_tokens: 700,
    });
    instructions = completion.choices[0].message.content?.trim() ?? "";
    if (instructions) {
      await prisma.scenario.update({
        where: { id: scenario.id },
        data: { simulationPrompt: instructions },
      });
    }
  }

  // Mint the ephemeral session against the Azure OpenAI resource.
  const base = (process.env.AZURE_OPENAI_ENDPOINT ?? "").replace(/\/$/, "");
  const sessionsUrl = `${base}/openai/realtimeapi/sessions?api-version=${REALTIME_API_VERSION}`;

  const res = await fetch(sessionsUrl, {
    method: "POST",
    headers: {
      "api-key": process.env.AZURE_OPENAI_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: REALTIME_DEPLOYMENT,
      voice: "alloy",
      instructions,
      modalities: ["audio", "text"],
      input_audio_transcription: { model: "whisper-1" },
      turn_detection: { type: "server_vad" },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: "Failed to create realtime session", detail: detail.slice(0, 300) },
      { status: 502 }
    );
  }

  const data = await res.json();
  const ephemeralKey = data?.client_secret?.value;
  if (!ephemeralKey) {
    return NextResponse.json({ error: "No ephemeral key returned" }, { status: 502 });
  }

  return NextResponse.json({
    ephemeralKey,
    region: REALTIME_REGION,
    deployment: REALTIME_DEPLOYMENT,
  });
}
