import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ onboardingDone: false });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardingDone: true },
  });
  return NextResponse.json({ onboardingDone: user?.onboardingDone ?? false });
}
