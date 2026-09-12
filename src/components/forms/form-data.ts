export const str = (fd: FormData, key: string): string => String(fd.get(key) ?? "");
export const bool = (fd: FormData, key: string): boolean => fd.get(key) === "on";
export const all = (fd: FormData, key: string): string[] => fd.getAll(key).map(String);
