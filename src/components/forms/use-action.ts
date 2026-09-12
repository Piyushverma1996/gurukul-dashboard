"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult, FieldErrors } from "@/lib/result";

export function useAction<I, O>(action: (input: I) => Promise<ActionResult<O>>) {
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function run(input: I, opts: { successMessage?: string; onSuccess?: (data: O) => void } = {}) {
    startTransition(async () => {
      const res = await action(input);
      if (res.ok) {
        setFieldErrors({});
        if (opts.successMessage) toast.success(opts.successMessage);
        opts.onSuccess?.(res.data);
      } else {
        setFieldErrors(res.error.fieldErrors ?? {});
        toast.error(res.error.message);
      }
    });
  }

  return { run, pending, fieldErrors };
}
