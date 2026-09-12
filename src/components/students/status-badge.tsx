import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type StudentStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  if (status === "active") return null;
  return (
    <Badge variant="outline" className={cn(status === "paused" ? "border-warning text-warning" : "border-muted-status text-muted-status")}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
