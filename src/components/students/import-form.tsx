"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { commitStudentImportAction, previewStudentImportAction } from "@/server/actions/students";

type Preview = { total: number; valid: number; invalid: number; headerErrors: string[]; rows: { line: number; name: string; errors: string[] }[] };

export function ImportForm() {
  const router = useRouter();
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, start] = useTransition();

  async function onFile(file: File | undefined) {
    setPreview(null);
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    start(async () => {
      const res = await previewStudentImportAction(text);
      if (res.ok) setPreview(res.data);
      else toast.error(res.error.message);
    });
  }

  function onCommit() {
    if (!csv) return;
    start(async () => {
      const res = await commitStudentImportAction(csv);
      if (res.ok) {
        toast.success(`Imported ${res.data.imported} students`);
        router.push("/students");
        router.refresh();
      } else toast.error(res.error.message);
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label="CSV file"
        onChange={(e) => onFile(e.target.files?.[0])}
        className="block w-full text-sm file:mr-3 file:h-11 file:rounded-md file:border-0 file:bg-primary file:px-4 file:text-primary-foreground"
      />
      {pending && <p className="text-sm text-muted-foreground">Checking…</p>}
      {preview && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            {preview.headerErrors.map((e) => (
              <p key={e} className="text-danger">
                {e}
              </p>
            ))}
            <p>
              <strong>{preview.total}</strong> rows · <span className="text-success">{preview.valid} ready</span> ·{" "}
              <span className={preview.invalid ? "text-danger" : ""}>{preview.invalid} with problems</span>
            </p>
            {preview.rows.length > 0 && (
              <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
                {preview.rows.map((r) => (
                  <li key={r.line} className="rounded-md bg-danger/5 p-2">
                    <strong>
                      Line {r.line}
                      {r.name ? ` · ${r.name}` : ""}
                    </strong>
                    : {r.errors.join("; ")}
                  </li>
                ))}
              </ul>
            )}
            {preview.invalid === 0 && preview.headerErrors.length === 0 && preview.total > 0 ? (
              <Button className="h-11" onClick={onCommit} disabled={pending}>
                Import {preview.valid} students
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Fix the rows above in your spreadsheet, save as CSV and choose the file again. Nothing has been imported.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
