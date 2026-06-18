import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Mic, BookOpen } from "lucide-react";

export default async function ScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const scenario = await prisma.scenario.findUnique({
    where: { id },
    include: { group: true },
  });

  if (!scenario || scenario.userId !== session.user.id) notFound();

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/home"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to my course
      </Link>

      <div className="mb-2">
        <Badge variant="secondary" className="text-xs">{scenario.group.title}</Badge>
      </div>
      <h1 className="font-display text-4xl leading-tight mb-3">{scenario.title}</h1>
      <p className="text-muted-foreground mb-8">{scenario.description}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href={`/scenario/${id}/prepare`} className="block">
          <div className="rounded-2xl border-2 border-muted bg-muted/30 p-6 h-full hover:border-muted-foreground/30 transition-colors cursor-pointer">
            <BookOpen className="h-8 w-8 mb-4 text-muted-foreground" />
            <h2 className="font-semibold mb-1">Prepare first</h2>
            <p className="text-sm text-muted-foreground">
              Learn useful sentences, listen to pronunciation, and practise before the conversation.
            </p>
          </div>
        </Link>

        <Link href={`/scenario/${id}/simulation`} className="block">
          <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-6 h-full hover:border-primary/50 transition-colors cursor-pointer">
            <Mic className="h-8 w-8 mb-4 text-primary" />
            <h2 className="font-semibold mb-1">Start conversation</h2>
            <p className="text-sm text-muted-foreground">
              Jump right in — have a live voice conversation with your AI practice partner.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
