import { Label } from "@/components/ui/label";

export function Field(props: { label: string; htmlFor: string; error?: string[]; hint?: string; children: React.ReactNode }) {
  const { label, htmlFor, error, hint, children } = props;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </Label>
      {children}
      {hint && !error?.length && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error?.length ? (
        <p className="text-sm text-danger" role="alert">
          {error[0]}
        </p>
      ) : null}
    </div>
  );
}
