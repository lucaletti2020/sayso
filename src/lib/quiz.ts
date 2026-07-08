// Types and validation for the Grammar & Vocabulary quiz (10 Duolingo-style
// questions cached on Scenario.grammarQuiz).

export type GapQuestion = {
  type: "gap";
  prompt: string; // sentence containing exactly one ___ blank
  options: string[]; // exactly 3, exactly one correct
  correctIndex: number;
  explanation: string;
  grammarPoint?: string;
};

export type MatchPair = { left: string; right: string };

export type MatchQuestion = {
  type: "match";
  kind: "translation" | "synonym" | "opposite" | "other";
  pairs: MatchPair[]; // exactly 4; left[i] pairs with right[i]
  explanation?: string;
};

export type QuizQuestion = GapQuestion | MatchQuestion;

export const QUIZ_SIZE = 10;
export const GAP_PROMPT_MAX = 90; // characters
export const ITEM_MAX = 24; // characters per option / match item

// Expected mix per CEFR band.
export function quizMixForBand(band: string): { gap: number; match: number } {
  return band === "B2" || band === "C1" ? { gap: 7, match: 3 } : { gap: 5, match: 5 };
}

// Parses + validates a model-produced quiz. Returns only structurally valid
// questions (callers check the final count).
export function sanitizeQuiz(value: unknown): QuizQuestion[] {
  if (!value || typeof value !== "object") return [];
  const raw = Array.isArray(value)
    ? value
    : ((value as Record<string, unknown>).questions ??
        Object.values(value as Record<string, unknown>).find((v) => Array.isArray(v)) ??
        []);
  if (!Array.isArray(raw)) return [];

  const out: QuizQuestion[] = [];
  for (const q of raw) {
    if (!q || typeof q !== "object") continue;
    const o = q as Record<string, unknown>;

    if (o.type === "gap") {
      const prompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
      const options = Array.isArray(o.options)
        ? (o.options.filter((x) => typeof x === "string") as string[]).map((s) => s.trim())
        : [];
      const correctIndex = typeof o.correctIndex === "number" ? o.correctIndex : -1;
      const explanation = typeof o.explanation === "string" ? o.explanation.trim() : "";
      if (
        prompt.includes("___") &&
        prompt.length <= GAP_PROMPT_MAX + 10 &&
        options.length === 3 &&
        options.every((x) => x.length > 0 && x.length <= ITEM_MAX + 6) &&
        correctIndex >= 0 &&
        correctIndex <= 2
      ) {
        out.push({
          type: "gap",
          prompt,
          options,
          correctIndex,
          explanation,
          grammarPoint: typeof o.grammarPoint === "string" ? o.grammarPoint : undefined,
        });
      }
      continue;
    }

    if (o.type === "match") {
      const kindRaw = typeof o.kind === "string" ? o.kind : "other";
      const kind = (["translation", "synonym", "opposite", "other"] as const).includes(
        kindRaw as "translation"
      )
        ? (kindRaw as MatchQuestion["kind"])
        : "other";
      const pairsRaw = Array.isArray(o.pairs) ? o.pairs : [];
      const pairs: MatchPair[] = [];
      for (const p of pairsRaw) {
        if (!p || typeof p !== "object") continue;
        const left = typeof (p as MatchPair).left === "string" ? (p as MatchPair).left.trim() : "";
        const right = typeof (p as MatchPair).right === "string" ? (p as MatchPair).right.trim() : "";
        if (left && right && left.length <= ITEM_MAX + 8 && right.length <= ITEM_MAX + 8) {
          pairs.push({ left, right });
        }
      }
      // All match questions have exactly 4 pairs — older cached sets with 5
      // are trimmed on read, so every rendered match question shows 4.
      if (pairs.length >= 4) {
        out.push({
          type: "match",
          kind,
          pairs: pairs.slice(0, 4),
          explanation: typeof o.explanation === "string" ? o.explanation.trim() : undefined,
        });
      }
    }
  }
  return out;
}
