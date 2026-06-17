import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSpeechConfig } from "@/lib/azure-speech";
import { getAzureOpenAI, DEPLOYMENT } from "@/lib/azure-openai";
import { prisma } from "@/lib/prisma";

// Uses Azure Speech REST API for pronunciation assessment.
// The client sends a WAV/WebM audio blob + the reference text.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const audio = formData.get("audio") as File | null;
  const referenceText = formData.get("referenceText") as string | null;
  const scenarioId = formData.get("scenarioId") as string | null;

  if (!audio || !referenceText) {
    return NextResponse.json({ error: "Missing audio or referenceText" }, { status: 400 });
  }

  const { key, region } = getSpeechConfig();
  const audioBuffer = await audio.arrayBuffer();

  // Pronunciation Assessment via REST (simpler than SDK in serverless)
  const assessmentConfig = JSON.stringify({
    ReferenceText: referenceText,
    GradingSystem: "HundredMark",
    Dimension: "Comprehensive",
    Granularity: "Phoneme",
    EnableMiscue: true,
  });

  const assessRes = await fetch(
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        // Azure's short-audio REST endpoint requires 16 kHz mono PCM WAV.
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        "Pronunciation-Assessment": Buffer.from(assessmentConfig).toString("base64"),
      },
      body: audioBuffer,
    }
  );

  if (!assessRes.ok) {
    const err = await assessRes.text();
    console.error("Pronunciation assessment error:", err);
    return NextResponse.json({ error: "Assessment failed" }, { status: 500 });
  }

  const result = await assessRes.json();
  const nbest = result?.NBest?.[0];

  // The REST API returns the scores flat on the NBest item and on each word
  // (unlike the SDK, which nests them under PronunciationAssessment).
  if (result?.RecognitionStatus !== "Success" || !nbest) {
    return NextResponse.json(
      { error: "We couldn't hear that clearly. Please try recording again." },
      { status: 422 }
    );
  }

  // Per-word accuracy for the word-by-word feedback display.
  const words = (nbest.Words ?? []).map(
    (w: { Word: string; AccuracyScore?: number; ErrorType?: string }) => ({
      word: w.Word,
      score: Math.round(w.AccuracyScore ?? 0),
      errorType: w.ErrorType ?? "None",
    })
  );

  const overallScore = Math.round(
    nbest.PronScore ?? (nbest.AccuracyScore + nbest.FluencyScore + nbest.CompletenessScore) / 3
  );

  // Generate a short human tip via GPT
  const openai = getAzureOpenAI();
  const tipCompletion = await openai.chat.completions.create({
    model: DEPLOYMENT,
    messages: [
      {
        role: "user",
        content: `A learner said: "${referenceText}".
Pronunciation scores — Accuracy: ${nbest.AccuracyScore}, Fluency: ${nbest.FluencyScore}, Completeness: ${nbest.CompletenessScore}.
Give ONE specific, encouraging tip (max 20 words) to improve their pronunciation of this sentence.`,
      },
    ],
    max_completion_tokens: 60,
    temperature: 0.7,
  });

  const tip = tipCompletion.choices[0].message.content?.trim() ?? "";

  const feedback = {
    overallScore,
    accuracyScore: Math.round(nbest.AccuracyScore),
    fluencyScore: Math.round(nbest.FluencyScore),
    completenessScore: Math.round(nbest.CompletenessScore),
    prosodyScore: nbest.ProsodyScore != null ? Math.round(nbest.ProsodyScore) : null,
    words,
    tip,
  };

  // Save attempt
  if (scenarioId) {
    await prisma.userAttempt.create({
      data: {
        userId: session.user.id,
        scenarioId,
        type: "PRONUNCIATION",
        feedbackJson: feedback,
        score: overallScore,
      },
    });
  }

  return NextResponse.json({ feedback });
}
