import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { FeePlanForm } from "@/components/settings/fee-plan-form";
import { SettingsForm } from "@/components/settings/settings-form";
import { SheetsCard } from "@/components/settings/sheets-card";
import { getSheetsStatus } from "@/server/sheets/sync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AGE_LABELS } from "@/lib/constants";
import { formatINR } from "@/lib/money";
import { formatDateIN, todayIST } from "@/lib/time";
import { listCenters } from "@/server/centers/service";
import { listFeePlans } from "@/server/fees/service";
import { requireAdminPage } from "@/server/session";
import { getAdminSettings } from "@/server/settings-admin";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireAdminPage();
  const [settings, plans, centers, sheets] = await Promise.all([getAdminSettings(user), listFeePlans(user), listCenters(user), getSheetsStatus()]);
  const today = todayIST();

  return (
    <>
      <PageHeader title="Settings" />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Monthly fee plans</CardTitle>
          <p className="text-sm text-muted-foreground">
            The most specific plan wins: centre + age group, then centre, then age group, then "all". A student's custom fee always overrides the plan. Changing a plan
            doesn't alter months already raised.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {plans.length === 0 && <p className="text-sm text-warning">No fee plans yet, so no fees are being raised.</p>}
          {plans.map((p) => (
            <details key={p.id} className="rounded-md border p-3">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {p.centerName ?? "All centres"} · {p.ageCategory ? AGE_LABELS[p.ageCategory] : "All ages"}
                </span>
                <span className="text-sm">
                  <strong>{formatINR(p.monthlyAmount)}</strong>/month from {formatDateIN(p.effectiveFrom)}
                  {!p.isActive && <span className="ml-2 text-muted-foreground">(inactive)</span>}
                </span>
              </summary>
              <div className="pt-3">
                <FeePlanForm centers={centers} plan={p} today={today} />
              </div>
            </details>
          ))}
          <details className="rounded-md border border-dashed p-3" open={plans.length === 0}>
            <summary className="cursor-pointer font-semibold text-primary">+ Add fee plan</summary>
            <div className="pt-3">
              <FeePlanForm centers={centers} today={today} />
            </div>
          </details>
        </CardContent>
      </Card>

      <SheetsCard status={sheets} />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Reminders & rules</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm initial={settings} />
        </CardContent>
      </Card>
    </>
  );
}
