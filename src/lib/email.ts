import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

// Test-mode sender (Resend's shared domain). Swap for your own verified
// domain (e.g. "TalktheTalk <hello@yourdomain.com>") once it's set up.
const FROM = process.env.EMAIL_FROM ?? "TalktheTalk <onboarding@resend.dev>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://talkthetalk.app";

// Wraps body content in a simple, clean branded layout.
function layout(heading: string, bodyHtml: string, cta?: { label: string; url: string }) {
  const button = cta
    ? `<a href="${cta.url}" style="display:inline-block;margin-top:20px;background:#0b1628;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:9999px;font-weight:600;font-size:15px;">${cta.label}</a>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#0b1628;">
    <div style="font-size:22px;font-weight:700;margin-bottom:24px;">🔊 TalktheTalk</div>
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 12px;">${heading}</h1>
    <div style="font-size:15px;line-height:1.6;color:#3a4a5a;">${bodyHtml}</div>
    ${button}
    <p style="font-size:12px;color:#9aa7b4;margin-top:32px;">TalktheTalk — English conversation practice for work.</p>
  </div>`;
}

// All sends are best-effort: a failure must never break the app flow.
async function send(to: string, subject: string, html: string) {
  if (!resend) {
    console.warn("RESEND_API_KEY not set — skipping email:", subject);
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    console.error("Email send failed:", subject, err);
  }
}

// Escapes user- or model-provided text before interpolating it into email HTML.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendWelcomeEmail(to: string, name?: string | null) {
  const first = esc(name?.split(" ")[0] ?? "there");
  await send(
    to,
    "Welcome to TalktheTalk 👋",
    layout(
      `Welcome, ${first}!`,
      `<p>Great to have you. TalktheTalk builds an English speaking course around your real job — then lets you practise the conversations you actually have at work.</p>
       <p>5 minutes a day goes a long way!</p>`,
      { label: "Start my course", url: `${APP_URL}/home` }
    )
  );
}

export async function sendFeedbackReadyEmail(
  to: string,
  name: string | null | undefined,
  scenarioTitle: string,
  feedbackUrl: string,
  score: number
) {
  const first = esc(name?.split(" ")[0] ?? "there");
  await send(
    to,
    `Your feedback is ready — ${scenarioTitle}`,
    layout(
      `Nice work, ${first}!`,
      `<p>You just finished <strong>${esc(scenarioTitle)}</strong> and scored <strong>${Math.round(score)}/100</strong>.</p>
       <p>See what went well and a few simple tips to improve.</p>`,
      { label: "View my feedback", url: feedbackUrl }
    )
  );
}

export async function sendReengagementEmail(to: string, name?: string | null) {
  const first = esc(name?.split(" ")[0] ?? "there");
  await send(
    to,
    "Ready for your first conversation?",
    layout(
      `Your course is waiting, ${first}`,
      `<p>You signed up for TalktheTalk but haven't tried a conversation yet. It only takes a few minutes — speak with your AI practice partner about a real work situation and get instant feedback.</p>
       <p>Beginner or advanced, the agent adapts to your level.</p>`,
      { label: "Try a conversation", url: `${APP_URL}/home` }
    )
  );
}

export { APP_URL };
