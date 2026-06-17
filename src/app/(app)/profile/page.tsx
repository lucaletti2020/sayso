import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="border-b py-4 last:border-b-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value?.trim() ? value : <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      jobTitle: true,
      company: true,
      companySize: true,
      englishLevel: true,
      responsibilities: true,
      linkedinUrl: true,
    },
  });

  if (!user) redirect("/login");

  const initial = user.name?.[0]?.toUpperCase() ?? "?";
  const responsibilities = user.responsibilities
    ?.split("\n")
    .map((r) => r.trim())
    .filter(Boolean);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent font-display text-2xl text-accent-foreground">
          {initial}
        </div>
        <div>
          <h1 className="font-display text-4xl leading-tight">{user.name ?? "Your profile"}</h1>
          {user.email && <p className="text-sm text-muted-foreground">{user.email}</p>}
        </div>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        This is the information we used to build your course.
      </p>

      <div className="rounded-2xl border bg-card px-5">
        <Field label="Job title" value={user.jobTitle} />
        <Field label="Company" value={user.company} />
        <Field label="Company size" value={user.companySize} />
        <div className="border-b py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">English level</p>
          <p className="mt-1">
            {user.englishLevel ? (
              <Badge variant="secondary">{user.englishLevel}</Badge>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </p>
        </div>
        <div className="border-b py-4 last:border-b-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Key responsibilities
          </p>
          {responsibilities?.length ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {responsibilities.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-muted-foreground">•</span> {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">—</p>
          )}
        </div>
        <Field label="LinkedIn" value={user.linkedinUrl} />
      </div>
    </div>
  );
}
