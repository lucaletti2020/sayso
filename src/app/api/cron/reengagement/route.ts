import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendReengagementEmail } from "@/lib/email";

// Daily job (Vercel Cron): email users who signed up but haven't done a
// conversation yet — sent the day after sign-up, once per user.
export async function GET(req: NextRequest) {
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>". Fail closed: if
  // the secret isn't configured, nobody can trigger this endpoint.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000); // don't email very old signups

  const candidates = await prisma.user.findMany({
    where: {
      email: { not: null },
      reengageEmailSentAt: null,
      createdAt: { lt: dayAgo, gt: weekAgo },
      attempts: { none: { type: "SIMULATION" } },
    },
    select: { id: true, email: true, name: true },
  });

  let sent = 0;
  for (const u of candidates) {
    if (!u.email) continue;
    await sendReengagementEmail(u.email, u.name);
    await prisma.user.update({
      where: { id: u.id },
      data: { reengageEmailSentAt: new Date() },
    });
    sent++;
  }

  return NextResponse.json({ checked: candidates.length, sent });
}
