"use server";

import type { StudentStatus } from "@/lib/constants";
import { runAction } from "@/lib/result";
import type { StudentInput } from "@/lib/validators";
import { requireActor } from "../session";
import { commitStudentImport, previewStudentImport } from "../students/import";
import { createStudent, deleteStudent, setStudentStatus, updateStudent } from "../students/service";

export async function deleteStudentAction(id: string) {
  return runAction(async () => deleteStudent(await requireActor(), id));
}

export async function createStudentAction(input: StudentInput) {
  return runAction(async () => createStudent(await requireActor(), input));
}

export async function updateStudentAction(id: string, input: StudentInput) {
  return runAction(async () => updateStudent(await requireActor(), id, input));
}

export async function setStudentStatusAction(id: string, status: StudentStatus) {
  return runAction(async () => setStudentStatus(await requireActor(), id, status));
}

export async function previewStudentImportAction(csvText: string) {
  return runAction(async () => previewStudentImport(await requireActor(), csvText));
}

export async function commitStudentImportAction(csvText: string) {
  return runAction(async () => commitStudentImport(await requireActor(), csvText));
}
