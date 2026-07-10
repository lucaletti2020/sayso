// CEFR reference data (publicly available Council of Europe self-assessment
// grid descriptors for spoken skills) + level mapping and prompt guidance.
// Used to ground course generation, practice, conversation, and feedback in
// the learner's CEFR band.

export type CefrBand = "A2" | "B1" | "B2" | "C1";

// Map the onboarding self-reported level to a CEFR band.
export function cefrBandForLevel(level?: string | null): CefrBand {
  switch ((level ?? "").trim().toLowerCase()) {
    case "beginner":
      return "A2";
    case "intermediate":
      return "B1";
    case "upper intermediate":
      return "B2";
    case "advanced":
      return "C1";
    default:
      return "B1";
  }
}

type BandInfo = {
  spokenInteraction: string;
  spokenProduction: string;
  complexity: string;
};

export const CEFR: Record<CefrBand, BandInfo> = {
  A2: {
    spokenInteraction:
      "Can communicate in simple, routine tasks requiring a simple, direct exchange of information on familiar topics; can handle very short social exchanges.",
    spokenProduction:
      "Can use a series of phrases and simple sentences to describe people, conditions, and their job in simple terms.",
    complexity:
      "Use short, simple sentences. High-frequency everyday and basic work vocabulary, fixed useful phrases, present and past simple. Avoid idioms, phrasal verbs, and complex clauses.",
  },
  B1: {
    spokenInteraction:
      "Can deal with most situations likely to arise at work and in everyday life; can enter unprepared into conversation on familiar or work-related topics.",
    spokenProduction:
      "Can connect phrases simply to describe experiences, give brief reasons and explanations for opinions and plans.",
    complexity:
      "Use clear, connected sentences with common tenses, modals for politeness (could/would), and everyday workplace vocabulary with common linking words. Keep idioms minimal.",
  },
  B2: {
    spokenInteraction:
      "Can interact with a degree of fluency and spontaneity; can take an active part in discussion in familiar contexts, accounting for and sustaining views.",
    spokenProduction:
      "Can give clear, detailed descriptions on subjects related to their field; can explain a viewpoint giving advantages and disadvantages.",
    complexity:
      "Use a range of structures (conditionals, passives), hedging and diplomatic language, and broader professional vocabulary and collocations.",
  },
  C1: {
    spokenInteraction:
      "Can express themselves fluently and spontaneously; can use language flexibly and effectively for social and professional purposes, formulating ideas with precision.",
    spokenProduction:
      "Can give clear, detailed descriptions of complex subjects, integrating sub-themes and rounding off with an appropriate conclusion.",
    complexity:
      "Use varied, complex structures, nuanced and precise professional vocabulary, idiomatic expressions, discourse markers, and strong register control.",
  },
};

// A compact text block to inject into generation/feedback prompts.
export function cefrGuidance(band: CefrBand): string {
  // Bands flow through stored JSON, so guard against invalid values.
  const b = CEFR[band] ?? CEFR.B1;
  return `CEFR level: ${band}.
- Spoken interaction (can-do): ${b.spokenInteraction}
- Spoken production (can-do): ${b.spokenProduction}
- Language complexity to target: ${b.complexity}`;
}
