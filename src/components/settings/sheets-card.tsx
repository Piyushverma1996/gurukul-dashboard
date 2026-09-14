import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTimeIN } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { SheetsStatus } from "@/server/sheets/sync";
import { SyncNowButton } from "./sync-now-button";

export function SheetsCard({ status }: { status: SheetsStatus }) {
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Google Sheet</CardTitle>
        <p className="text-sm text-muted-foreground">
          One tab per centre for student details (edit parent names and WhatsApp numbers there; changes come into the app within about 10 minutes), plus read-only
          backup tabs for fees, payments and attendance.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!status.configured ? (
          <div className="rounded-md bg-warning/10 p-3 text-warning">
            Not connected yet. Add <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> and <code>GOOGLE_SHEET_ID</code> in Hostinger, then share the sheet with the service account as
            Editor (see the deployment guide).
          </div>
        ) : (
          <>
            {status.sheetUrl && (
              <p>
                <a href={status.sheetUrl} target="_blank" rel="noreferrer" className="font-semibold text-primary underline">
                  Open the Google Sheet
                </a>
              </p>
            )}
            {status.serviceAccountEmail && (
              <p className="text-muted-foreground">
                The sheet must be shared (Editor) with <span className="font-mono">{status.serviceAccountEmail}</span>
              </p>
            )}
          </>
        )}
        {status.last && (
          <p className={cn("rounded-md p-3", status.last.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
            Last sync {formatDateTimeIN(new Date(status.last.at))} ({status.last.reason}): {status.last.message}
          </p>
        )}
        <SyncNowButton disabled={!status.configured} />
      </CardContent>
    </Card>
  );
}
