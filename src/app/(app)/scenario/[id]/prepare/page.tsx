"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Sentence = { id: string; text: string };

export default function PreparePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [preparingAudio, setPreparingAudio] = useState(false);

  async function loadSentences(regenerate = false) {
    if (regenerate) setRegenerating(true);
    else setLoading(true);
    const res = await fetch("/api/scenario/sentences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: id, regenerate }),
    });
    const { sentences: s } = await res.json();
    setSentences(s ?? []);
    setSelected(new Set());
    setLoading(false);
    setRegenerating(false);
  }

  useEffect(() => {
    loadSentences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function toggle(sentenceId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sentenceId)) next.delete(sentenceId);
      else next.add(sentenceId);
      return next;
    });
  }

  async function handleContinue() {
    const ids = Array.from(selected);
    setPreparingAudio(true);
    // Generate (and store) the audio for each chosen sentence before moving on.
    await Promise.all(
      ids.map((sentenceId) =>
        fetch("/api/scenario/audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sentenceId }),
        })
      )
    );
    router.push(`/scenario/${id}/practice?sentences=${ids.join(",")}`);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href={`/scenario/${id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to scenario
      </Link>

      <h1 className="font-display text-4xl leading-tight mb-1">Prepare</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Here are useful sentences for this situation. Pick the ones you want to practise.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Preparing your sentences…
        </div>
      ) : (
        <>
          <div className="mb-3 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadSentences(true)}
              disabled={regenerating}
              className="text-muted-foreground"
            >
              {regenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span className="ml-1.5">Regenerate</span>
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            {sentences.map((s) => {
              const isSelected = selected.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] leading-snug transition-all ${
                    isSelected
                      ? "border-foreground bg-accent text-accent-foreground shadow-pop"
                      : "border-border bg-card hover:border-foreground hover:shadow-pop"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border ${
                      isSelected
                        ? "border-foreground bg-foreground text-background"
                        : "border-muted-foreground/40"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3" strokeWidth={3.5} />}
                  </span>
                  {s.text}
                </button>
              );
            })}
          </div>

          <div className="mt-8">
            <Button
              className="w-full"
              size="lg"
              disabled={selected.size === 0 || preparingAudio}
              onClick={handleContinue}
            >
              {preparingAudio ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Preparing audio…
                </>
              ) : (
                <>Continue with {selected.size} sentence{selected.size === 1 ? "" : "s"}</>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
