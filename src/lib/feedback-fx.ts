// Shared client-side feedback effects: answer sounds and word-score colors.
// Used by the Grammar & Vocabulary quiz and the Pronunciation session.

// Lazy singletons so the Audio objects are only created in the browser.
let correctSound: HTMLAudioElement | null = null;
let wrongSound: HTMLAudioElement | null = null;

export function playCorrect() {
  if (typeof window === "undefined") return;
  correctSound ??= new Audio("/sounds/correct.mp3");
  correctSound.currentTime = 0;
  correctSound.play().catch(() => {});
}

export function playWrong() {
  if (typeof window === "undefined") return;
  wrongSound ??= new Audio("/sounds/wrong.mp3");
  wrongSound.currentTime = 0;
  wrongSound.play().catch(() => {});
}

// Traffic-light styling for per-word pronunciation scores.
export function wordColor(score: number) {
  if (score >= 90) return "bg-green-100 text-green-700 border-green-200";
  if (score >= 75) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-red-100 text-red-700 border-red-200";
}
