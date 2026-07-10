// Characterization tests for the pure critical-path libs (no DB / network).
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { cefrBandForLevel, cefrGuidance, type CefrBand } from "../src/lib/cefr";
import { sanitizeQuiz, quizMixForBand, QUIZ_SIZE } from "../src/lib/quiz";
import { readObjectives } from "../src/lib/objectives";

test("cefrBandForLevel maps every onboarding level (case-insensitive)", () => {
  assert.equal(cefrBandForLevel("Beginner"), "A2");
  assert.equal(cefrBandForLevel("intermediate"), "B1");
  assert.equal(cefrBandForLevel("Upper intermediate"), "B2");
  assert.equal(cefrBandForLevel("ADVANCED"), "C1");
  // Unknown / missing input falls back to B1
  assert.equal(cefrBandForLevel("fluent-ish"), "B1");
  assert.equal(cefrBandForLevel(null), "B1");
  assert.equal(cefrBandForLevel(undefined), "B1");
});

test("cefrGuidance returns text for every band and survives invalid bands", () => {
  for (const band of ["A2", "B1", "B2", "C1"] as CefrBand[]) {
    const g = cefrGuidance(band);
    assert.match(g, /Spoken interaction/);
    assert.match(g, new RegExp(`CEFR level: ${band}`));
  }
  // Invalid band (can arrive via stored JSON) must not throw
  assert.doesNotThrow(() => cefrGuidance("Z9" as CefrBand));
});

test("quizMixForBand: 5+5 for A2/B1, 7+3 for B2/C1", () => {
  assert.deepEqual(quizMixForBand("A2"), { gap: 5, match: 5 });
  assert.deepEqual(quizMixForBand("B1"), { gap: 5, match: 5 });
  assert.deepEqual(quizMixForBand("B2"), { gap: 7, match: 3 });
  assert.deepEqual(quizMixForBand("C1"), { gap: 7, match: 3 });
  assert.equal(QUIZ_SIZE, 10);
});

const validGap = {
  type: "gap",
  prompt: "She ___ a nurse.",
  options: ["is", "are", "am"],
  correctIndex: 0,
  explanation: "Use is with she.",
  grammarPoint: "verb be",
};
const pairs4 = [
  { left: "vendor", right: "fornecedor" },
  { left: "nurse", right: "enfermeira" },
  { left: "doctor", right: "médico" },
  { left: "call", right: "ligação" },
];
const validMatch = { type: "match", kind: "translation", pairs: pairs4 };

test("sanitizeQuiz accepts valid questions (direct and wrapped shapes)", () => {
  assert.equal(sanitizeQuiz({ questions: [validGap, validMatch] }).length, 2);
  assert.equal(sanitizeQuiz([validGap]).length, 1);
  // Model sometimes wraps the array under an unexpected key
  assert.equal(sanitizeQuiz({ content: [validGap] }).length, 1);
});

test("sanitizeQuiz trims 5-pair matches to 4 (legacy cached sets)", () => {
  const fivePairs = [...pairs4, { left: "meeting", right: "reunião" }];
  const out = sanitizeQuiz({ questions: [{ ...validMatch, pairs: fivePairs }] });
  assert.equal(out.length, 1);
  const match = out[0];
  assert.ok(match.type === "match");
  assert.equal(match.pairs.length, 4);
});

test("sanitizeQuiz rejects malformed questions", () => {
  assert.equal(sanitizeQuiz(null).length, 0);
  assert.equal(sanitizeQuiz("nope").length, 0);
  // gap without a blank, wrong option count, bad correctIndex
  assert.equal(sanitizeQuiz({ questions: [{ ...validGap, prompt: "no blank here" }] }).length, 0);
  assert.equal(sanitizeQuiz({ questions: [{ ...validGap, options: ["a", "b"] }] }).length, 0);
  assert.equal(sanitizeQuiz({ questions: [{ ...validGap, correctIndex: 5 }] }).length, 0);
  // match with too few pairs
  assert.equal(sanitizeQuiz({ questions: [{ ...validMatch, pairs: pairs4.slice(0, 2) }] }).length, 0);
});

test("readObjectives parses stored objectives and tolerates garbage", () => {
  const full = readObjectives({
    cefrLevel: "B2",
    canDo: "Can set protocol rules",
    functions: ["explaining", "agreeing"],
    grammarFocus: "Zero and first conditionals",
    vocabulary: "protocols; alerts",
    targetPhrases: ["If the server fails, we switch"],
    unitNumber: 5,
  });
  assert.equal(full.cefrLevel, "B2");
  assert.equal(full.unitNumber, 5);
  assert.deepEqual(full.functions, ["explaining", "agreeing"]);
  assert.equal(full.grammarFocus, "Zero and first conditionals");

  // Garbage inputs return an empty-but-safe shape
  for (const bad of [null, undefined, 42, "str", [], { functions: "not-array" }]) {
    const o = readObjectives(bad);
    assert.equal(typeof o, "object");
    assert.doesNotThrow(() => o.functions?.length);
  }
});
