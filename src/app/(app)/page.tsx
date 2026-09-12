import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDays, formatTime12 } from "@/lib/time";
import { getHomeSummary } from "@/server/home/service";
import { requirePageUser } from "@/server/session";

export default async function HomePage() {
  const user = await requirePageUser();
  const summary = await getHomeSummary(user);
  const firstName = user.name.split(" ")[0];

  if (summary.kind === "admin") {
    const tiles = [
      { label: "Active students", value: summary.activeStudents, href: "/students" },
      { label: "Batches", value: summary.activeBatches, href: "/admin/batches" },
      { label: "Coaches", value: summary.activeCoaches, href: "/admin/coaches" },
      { label: "Centers", value: summary.activeCenters, href: "/admin/centers" },
    ];
    return (
      <>
        <PageHeader title={`Hi ${firstName}`} description="Academy overview" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href}>
              <Card className="h-full transition hover:border-accent">
                <CardContent className="pt-5">
                  <p className="text-3xl font-bold text-primary">{t.value}</p>
                  <p className="text-sm text-muted-foreground">{t.label}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={`Hi ${firstName}`} description="Your batches" />
      {summary.batches.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-muted-foreground">You're not assigned to a batch yet. Ask Sharan to assign you.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {summary.batches.map((b) => (
            <Card key={b.id}>
              <CardHeader>
                <CardTitle className="text-lg">{b.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{b.centerName}</p>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  {formatDays(b.daysOfWeek)} · {formatTime12(b.startTime)}–{formatTime12(b.endTime)}
                </p>
                <p className="font-medium">{b.studentCount} active students</p>
                <Link href={`/students?batch=${b.id}`} className="inline-block pt-2 font-semibold text-primary underline-offset-4 hover:underline">
                  View students →
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
