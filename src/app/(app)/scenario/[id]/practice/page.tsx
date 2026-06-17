"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Play, Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Sentence = { id: string; text: string; audioUrl: string | null };
type WordScore = { word: string; score: number };
type Feedback = { overallScore: number; words: WordScore[]; tip: string };

// Azure's short-audio REST endpoint needs 16 kHz mono PCM WAV, so we capture
// raw audio with the Web Audio API and encode the WAV ourselves.
function downsample(buffer: Float32Array, inRate: number, outRate: number) {
  if (outRate >= inRate) return buffer;
  const ratio = inRate / outRate;
  const newLen = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLen);
  let offset = 0;
  for (let i = 0; i < newLen; i++) {
    const next = Math.round((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = Math.round(i * ratio); j < next && j < buffer.length; j++) {
      sum += buffer[j];
      count++;
    }
    result[i] = count ? sum / count : 0;
    offset = next;
  }
  return result;
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

function wordColor(score: number) {
  if (score >= 90) return "bg-green-100 text-green-700 border-green-200";
  if (score >= 75) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-red-100 text-red-700 border-red-200";
}

function emojiFor(score: number) {
  if (score >= 90) return "😊";
  if (score >= 70) return "🙂";
  return "💪";
}

function PracticeInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  useEffect(() => {
    const ids = (searchParams.get("sentences") ?? "").split(",").filter(Boolean);
    fetch("/api/scenario/sentences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: id }),
    })
      .then((r) => r.json())
      .then(({ sentences: all }: { sentences: Sentence[] }) => {
        const byId = new Map((all ?? []).map((s) => [s.id, s]));
        const ordered = ids.map((sid) => byId.get(sid)).filter(Boolean) as Sentence[];
        setSentences(ordered.length ? ordered : all ?? []);
        setLoading(false);
      });
  }, [id, searchParams]);

  const current = sentences[index];
  const isLast = index === sentences.length - 1;

  async function playAudio() {
    if (!current?.audioUrl) return;
    setPlaying(true);
    const audio = new Audio(current.audioUrl);
    audio.onended = () => setPlaying(false);
    audio.onerror = () => setPlaying(false);
    await audio.play().catch(() => setPlaying(false));
  }

  async function toggleRecording() {
    if (recording) {
      await stopAndAssess();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      chunksRef.current = [];
      processor.onaudioprocess = (e) => {
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(ctx.destination);
      setRecording(true);
    } catch {
      toast.error("Couldn't access your microphone.");
    }
  }

  async function stopAndAssess() {
    setRecording(false);
    const ctx = audioCtxRef.current;
    const sampleRate = ctx?.sampleRate ?? 48000;

    // Tear down the audio graph and mic.
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    await ctx?.close().catch(() => {});

    // Merge captured chunks → downsample to 16 kHz → encode WAV.
    const chunks = chunksRef.current;
    const total = chunks.reduce((n, c) => n + c.length, 0);
    if (total === 0) {
      toast.error("No audio captured. Please try again.");
      return;
    }
    const merged = new Float32Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    const wav = encodeWav(downsample(merged, sampleRate, 16000), 16000);

    setAssessing(true);
    const form = new FormData();
    form.append("audio", wav, "recording.wav");
    form.append("referenceText", current.text);
    form.append("scenarioId", id);
    try {
      const res = await fetch("/api/scenario/pronunciation", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok) {
        setFeedback(data.feedback);
      } else {
        toast.error(data.error ?? "Assessment failed. Please try again.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setAssessing(false);
    }
  }

  function handleContinue() {
    setFeedback(null);
    if (isLast) {
      router.push(`/scenario/${id}/simulation`);
    } else {
      setIndex((i) => i + 1);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your sentences…
      </div>
    );
  }

  if (!current) {
    return (
      <div className="max-w-2xl mx-auto text-sm text-muted-foreground">
        No sentences selected.{" "}
        <Link href={`/scenario/${id}/prepare`} className="underline">Go back to prepare</Link>.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href={`/scenario/${id}/prepare`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to sentences
      </Link>

      <h1 className="font-display text-4xl leading-tight mb-1">Your sentences</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Listen to each sentence and practise your pronunciation.
      </p>

      <p className="text-sm font-semibold mb-2">
        Sentence {index + 1} of {sentences.length}
      </p>
      <p className="text-xl font-medium mb-6">{current.text}</p>

      <div className="rounded-2xl border bg-card">
        <div className="flex flex-col items-center gap-3 p-8">
          <span className="text-sm text-muted-foreground">Listen to the sentence</span>
          <button
            onClick={playAudio}
            disabled={!current.audioUrl}
            className="flex h-16 w-16 items-center justify-center rounded-full border bg-background transition-colors hover:bg-muted disabled:opacity-40"
          >
            {playing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Play className="h-6 w-6" />}
          </button>
        </div>

        <div className="border-t" />

        <div className="flex flex-col items-center gap-3 p-8">
          <span className="text-sm text-muted-foreground">Practice your pronunciation</span>
          <button
            onClick={toggleRecording}
            disabled={assessing}
            className={`flex h-16 w-16 items-center justify-center rounded-full border transition-colors disabled:opacity-60 ${
              recording ? "bg-destructive text-white border-destructive" : "bg-background hover:bg-muted"
            }`}
          >
            {assessing ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : recording ? (
              <Square className="h-5 w-5" />
            ) : (
              <Mic className="h-6 w-6" />
            )}
          </button>
          {recording && <span className="text-xs text-muted-foreground">Listening… tap to stop</span>}
        </div>
      </div>

      {/* Feedback modal */}
      {feedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-green-200 bg-green-50 p-6 shadow-soft">
            <div className="text-center">
              <div className="text-4xl">{emojiFor(feedback.overallScore)}</div>
              <h2 className="mt-2 text-lg font-bold">
                {feedback.overallScore >= 75 ? "Great job!" : "Keep practising!"}
              </h2>
              <div className="mt-3">
                <span className="text-5xl font-extrabold text-green-700">{feedback.overallScore}</span>
                <span className="text-2xl font-bold text-green-600/60">/100</span>
              </div>
              <p className="text-xs text-muted-foreground">Overall Score</p>
            </div>

            {feedback.words?.length > 0 && (
              <div className="mt-5 flex flex-wrap justify-center gap-2 rounded-2xl bg-white/70 p-4">
                {feedback.words.map((w, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm ${wordColor(w.score)}`}
                  >
                    {w.word}
                    <sup className="text-[10px] font-semibold">{w.score}</sup>
                  </span>
                ))}
              </div>
            )}

            {feedback.tip && (
              <p className="mt-4 text-center text-sm text-muted-foreground italic">💡 {feedback.tip}</p>
            )}

            <div className="mt-6 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setFeedback(null)}>
                Try again
              </Button>
              <Button className="flex-1" onClick={handleContinue}>
                {isLast ? "Complete practice" : "Next sentence"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PracticePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      }
    >
      <PracticeInner />
    </Suspense>
  );
}
