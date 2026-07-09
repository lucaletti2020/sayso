import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateSentenceAudio, voiceForGender } from "@/lib/tts";

// Lazy fallback: returns (generating if needed) the audio for one sentence.
// Audio is normally generated in bulk when the sentence set is created.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sentenceId } = await req.json();

  const sentence = await prisma.practiceSentence.findUnique({
    where: { id: sentenceId },
    include: { scenario: { include: { group: { include: { course: true } } } } },
  });
  if (!sentence) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (sentence.audioUrl) return NextResponse.json({ audioUrl: sentence.audioUrl });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { gender: true },
  });
  const gender = sentence.scenario.group.course?.gender ?? user?.gender;

  const audioUrl = await generateSentenceAudio(
    sentence.id,
    sentence.text,
    voiceForGender(gender)
  );
  if (!audioUrl) return NextResponse.json({ error: "TTS generation failed" }, { status: 500 });

  return NextResponse.json({ audioUrl });
}
