"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteStudentAction } from "@/server/actions/students";

export function DeleteStudentButton({ studentId, name }: { studentId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      className="h-11 text-danger hover:bg-danger/10 hover:text-danger"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Permanently delete ${name}? Their attendance and unpaid fee records are removed too. This can't be undone.`)) return;
        start(async () => {
          const res = await deleteStudentAction(studentId);
          if (res.ok) {
            toast.success(`${name} deleted`);
            router.push("/students");
            router.refresh();
          } else toast.error(res.error.message);
        });
      }}
    >
      Delete student
    </Button>
  );
}
