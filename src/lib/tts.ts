import { createClient } from "@supabase/supabase-js";
import { getSpeechConfig } from "@/lib/azure-speech";
import { prisma } from "@/lib/prisma";

// Voice matched to the learner's gender: female → female voice; male or
// unknown → male voice.
export function voiceForGender(gender?: string | null): string {
  return gender?.toLowerCase() === "female" ? "en-US-JennyNeural" : "en-US-GuyNeural";
}

// Generates TTS audio for a practice sentence via Azure, stores the MP3 in
// Supabase storage, saves the public URL on the sentence, and returns it.
// Returns null on failure (callers treat audio as best-effort).
export async function generateSentenceAudio(
  sentenceId: string,
  text: string,
  voice: string = "en-US-GuyNeural"
): Promise<string | null> {
  try {
    const { key, region } = getSpeechConfig();

    const ssml = `<speak version='1.0' xml:lang='en-US'>
      <voice name='${voice}'>${escapeXml(text)}</voice>
    </speak>`;

    const ttsRes = await fetch(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
        },
        body: ssml,
      }
    );
    if (!ttsRes.ok) return null;

    const audioBuffer = await ttsRes.arrayBuffer();
    const fileName = `audio/${sentenceId}.mp3`;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error: uploadError } = await supabase.storage
      .from("practice-audio")
      .upload(fileName, audioBuffer, { contentType: "audio/mpeg", upsert: true });
    if (uploadError) return null;

    const { data: urlData } = supabase.storage.from("practice-audio").getPublicUrl(fileName);
    const audioUrl = urlData.publicUrl;

    await prisma.practiceSentence.update({
      where: { id: sentenceId },
      data: { audioUrl },
    });

    return audioUrl;
  } catch {
    return null;
  }
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
