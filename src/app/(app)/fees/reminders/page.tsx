import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ReminderQueue } from "@/components/reminders/reminder-queue";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { currentMonthIST, formatMonthLabel } from "@/lib/time";
import { listCenters } from "@/server/centers/service";
import { listReminderQueue } from "@/server/reminders/service";
import { requireAdminPage } from "@/server/session";

export const metadata: Metadata = { title: "Fee reminders" };

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ month?: string; center?: string }> }) {
  const user = await requireAdminPage();
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : currentMonthIST();
  const [queue, centers] = await Promise.all([listReminderQueue(user, { month, centerId: sp.center || undefined }), listCenters(user)]);

  return (
    <>
      <PageHeader title="Fee reminders" description={`${formatMonthLabel(month)} · ${queue.items.length} parents to remind`} />
      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="month" value={month} />
        <NativeSelect name="center" defaultValue={sp.center ?? ""} aria-label="Centre" className="sm:w-64">
          <option value="">All centres</option>
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="secondary" className="h-11">
          Filter
        </Button>
      </form>
      {queue.skippedNoPhone > 0 && (
        <p className="mb-3 rounded-md bg-warning/10 p-3 text-sm text-warning">
          {queue.skippedNoPhone} student{queue.skippedNoPhone === 1 ? " owes" : "s owe"} fees but {queue.skippedNoPhone === 1 ? "has" : "have"} no parent WhatsApp number yet. Add it
          in the app or the Google Sheet.
        </p>
      )}
      <ReminderQueue
        month={month}
        items={queue.items.map((i) => ({ ...i, lastRemindedAt: i.lastRemindedAt ? i.lastRemindedAt.toISOString() : null }))}
      />
    </>
  );
}
