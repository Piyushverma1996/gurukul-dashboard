// Gurukul's own age groups (centre list of 2026-10-05). U10/U14 are kept so existing rows stay valid.
export const ageCategories = ["U8", "U10", "U12", "U13", "U14", "U15", "U16", "U18", "U19", "SENIOR", "ELITE"] as const;
export const staffRoles = ["admin", "head_coach", "assistant_coach"] as const;
export const studentStatuses = ["active", "paused", "left"] as const;
export const discountTypes = ["flat", "percent"] as const;

export type AgeCategory = (typeof ageCategories)[number];
export type StaffRole = (typeof staffRoles)[number];
export type StudentStatus = (typeof studentStatuses)[number];
export type DiscountType = (typeof discountTypes)[number];

export const AGE_LABELS: Record<AgeCategory, string> = {
  U8: "Under 8",
  U10: "Under 10",
  U12: "Under 12",
  U13: "Under 13",
  U14: "Under 14",
  U15: "Under 15",
  U16: "Under 16",
  U18: "Under 18",
  U19: "Under 19",
  SENIOR: "Senior",
  ELITE: "Elite (advanced)",
};

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  head_coach: "Head coach",
  assistant_coach: "Assistant coach",
};

export const paymentMethods = ["paytm", "cash", "register"] as const;
export const paymentStatuses = ["pending_verification", "verified", "rejected"] as const;
export const attendanceStatuses = ["present", "absent", "excused"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
export type PaymentStatus = (typeof paymentStatuses)[number];
export type AttendanceStatus = (typeof attendanceStatuses)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  paytm: "Paytm",
  cash: "Cash",
  register: "From register",
};

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  excused: "Excused",
};

export const STATUS_LABELS: Record<StudentStatus, string> = {
  active: "Active",
  paused: "Paused",
  left: "Left",
};
