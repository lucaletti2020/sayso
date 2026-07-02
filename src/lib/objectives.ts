// Shape of the learning objectives stored on each Scenario (as JSON).
export type ScenarioObjectives = {
  cefrLevel?: string | null;
  canDo?: string | null;
  functions?: string[];
  grammarFocus?: string | null;
  vocabulary?: string | null;
  targetPhrases?: string[];
  unitNumber?: number | null; // set for curriculum-based courses
};

// Safely read the objectives JSON off a scenario row.
export function readObjectives(value: unknown): ScenarioObjectives {
  if (!value || typeof value !== "object") return {};
  const o = value as Record<string, unknown>;
  return {
    cefrLevel: typeof o.cefrLevel === "string" ? o.cefrLevel : null,
    canDo: typeof o.canDo === "string" ? o.canDo : null,
    functions: Array.isArray(o.functions) ? (o.functions.filter((x) => typeof x === "string") as string[]) : [],
    grammarFocus: typeof o.grammarFocus === "string" ? o.grammarFocus : null,
    vocabulary: typeof o.vocabulary === "string" ? o.vocabulary : null,
    targetPhrases: Array.isArray(o.targetPhrases)
      ? (o.targetPhrases.filter((x) => typeof x === "string") as string[])
      : [],
    unitNumber: typeof o.unitNumber === "number" ? o.unitNumber : null,
  };
}
