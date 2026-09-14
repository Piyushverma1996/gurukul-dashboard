import { boolean, char, date, datetime, index, int, mysqlEnum, mysqlTable, primaryKey, text, time, tinyint, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { ulid } from "ulid";
// Relative import (not "@/"): drizzle-kit loads this file without tsconfig path aliases.
import { ageCategories, attendanceStatuses, discountTypes, paymentMethods, paymentStatuses, staffRoles, studentStatuses } from "../../lib/constants";

export { ageCategories, attendanceStatuses, discountTypes, paymentMethods, paymentStatuses, staffRoles, studentStatuses };
export type { AgeCategory, AttendanceStatus, PaymentMethod, PaymentStatus, StaffRole, StudentStatus } from "../../lib/constants";

// App-level defaults (no DB expression defaults) keep migrations portable between MySQL 8 and MariaDB.
const timestamps = {
  createdAt: datetime("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at", { mode: "date" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
};
const ulidId = () => char("id", { length: 26 }).primaryKey().$defaultFn(() => ulid());

/* ---------------- Better Auth tables (property names must match Better Auth fields) ---------------- */

export const user = mysqlTable("user", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: mysqlEnum("role", staffRoles).notNull().default("assistant_coach"),
  isActive: boolean("is_active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  phoneNumber: varchar("phone_number", { length: 20 }).unique(),
  phoneNumberVerified: boolean("phone_number_verified"),
  ...timestamps,
});

export const session = mysqlTable(
  "session",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    expiresAt: datetime("expires_at", { mode: "date" }).notNull(),
    token: varchar("token", { length: 255 }).notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: varchar("user_id", { length: 36 }).notNull().references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = mysqlTable(
  "account",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    accountId: varchar("account_id", { length: 255 }).notNull(),
    providerId: varchar("provider_id", { length: 64 }).notNull(),
    userId: varchar("user_id", { length: 36 }).notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: datetime("access_token_expires_at", { mode: "date" }),
    refreshTokenExpiresAt: datetime("refresh_token_expires_at", { mode: "date" }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = mysqlTable(
  "verification",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    identifier: varchar("identifier", { length: 255 }).notNull(),
    value: text("value").notNull(),
    expiresAt: datetime("expires_at", { mode: "date" }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ---------------- Domain tables ---------------- */

export const centers = mysqlTable(
  "centers",
  {
    id: ulidId(),
    name: varchar("name", { length: 120 }).notNull(),
    sector: varchar("sector", { length: 40 }).notNull(),
    address: varchar("address", { length: 255 }),
    mapUrl: varchar("map_url", { length: 500 }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("centers_name_uq").on(t.name)],
);

export const batches = mysqlTable(
  "batches",
  {
    id: ulidId(),
    centerId: char("center_id", { length: 26 }).notNull().references(() => centers.id),
    name: varchar("name", { length: 80 }).notNull(),
    ageCategory: mysqlEnum("age_category", ageCategories).notNull(),
    /** Comma-separated weekday codes, e.g. "MON,WED,FRI" */
    daysOfWeek: varchar("days_of_week", { length: 40 }).notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    headCoachId: varchar("head_coach_id", { length: 36 }).references(() => user.id),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("batches_center_idx").on(t.centerId),
    index("batches_head_coach_idx").on(t.headCoachId),
    uniqueIndex("batches_center_name_uq").on(t.centerId, t.name),
  ],
);

export const batchCoaches = mysqlTable(
  "batch_coaches",
  {
    batchId: char("batch_id", { length: 26 }).notNull().references(() => batches.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 }).notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: datetime("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.batchId, t.userId] }), index("batch_coaches_user_idx").on(t.userId)],
);

export const students = mysqlTable(
  "students",
  {
    id: ulidId(),
    name: varchar("name", { length: 120 }).notNull(),
    // Optional until Sharan fills them in (app or Google Sheet) — spec §16.2
    parentName: varchar("parent_name", { length: 120 }),
    parentPhone: varchar("parent_phone", { length: 20 }),
    dob: date("dob", { mode: "string" }),
    ageCategory: mysqlEnum("age_category", ageCategories).notNull(),
    batchId: char("batch_id", { length: 26 }).notNull().references(() => batches.id),
    joiningDate: date("joining_date", { mode: "string" }).notNull(),
    feeDueDay: tinyint("fee_due_day").notNull().default(1),
    customFee: int("custom_fee"),
    discountType: mysqlEnum("discount_type", discountTypes),
    discountValue: int("discount_value"),
    status: mysqlEnum("status", studentStatuses).notNull().default("active"),
    statusChangedAt: datetime("status_changed_at", { mode: "date" }),
    consentGiven: boolean("consent_given").notNull().default(false),
    consentDate: date("consent_date", { mode: "string" }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("students_batch_idx").on(t.batchId),
    index("students_status_idx").on(t.status),
    index("students_parent_phone_idx").on(t.parentPhone),
  ],
);

export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: datetime("updated_at", { mode: "date" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
});

export const auditLog = mysqlTable(
  "audit_log",
  {
    id: ulidId(),
    actorId: varchar("actor_id", { length: 36 }),
    action: varchar("action", { length: 64 }).notNull(),
    entity: varchar("entity", { length: 40 }).notNull(),
    entityId: varchar("entity_id", { length: 36 }).notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    at: datetime("at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_at_idx").on(t.at)],
);

/* ---------------- Fees & payments (spec §5, §6, §16.5) ---------------- */

/** center/age null = applies to all. Most specific match wins, then latest effective_from. */
export const feePlans = mysqlTable(
  "fee_plans",
  {
    id: ulidId(),
    centerId: char("center_id", { length: 26 }).references(() => centers.id),
    ageCategory: mysqlEnum("age_category", ageCategories),
    monthlyAmount: int("monthly_amount").notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("fee_plans_center_idx").on(t.centerId)],
);

/** One row per student per month. Amount is frozen when created. */
export const dues = mysqlTable(
  "dues",
  {
    id: ulidId(),
    studentId: char("student_id", { length: 26 }).notNull().references(() => students.id),
    month: char("month", { length: 7 }).notNull(),
    baseAmount: int("base_amount").notNull(),
    discountAmount: int("discount_amount").notNull().default(0),
    amountDue: int("amount_due").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    isProrated: boolean("is_prorated").notNull().default(false),
    waived: boolean("waived").notNull().default(false),
    waivedReason: varchar("waived_reason", { length: 255 }),
    ...timestamps,
  },
  (t) => [uniqueIndex("dues_student_month_uq").on(t.studentId, t.month), index("dues_month_idx").on(t.month)],
);

export const payments = mysqlTable(
  "payments",
  {
    id: ulidId(),
    studentId: char("student_id", { length: 26 }).notNull().references(() => students.id),
    amount: int("amount").notNull(),
    method: mysqlEnum("method", paymentMethods).notNull(),
    txnRef: varchar("txn_ref", { length: 80 }),
    /** null for system-recorded payments (register ticks) */
    collectedBy: varchar("collected_by", { length: 36 }).references(() => user.id),
    receivedAt: date("received_at", { mode: "string" }).notNull(),
    status: mysqlEnum("status", paymentStatuses).notNull(),
    verifiedBy: varchar("verified_by", { length: 36 }).references(() => user.id),
    verifiedAt: datetime("verified_at", { mode: "date" }),
    rejectionReason: varchar("rejection_reason", { length: 255 }),
    notes: text("notes"),
    idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull().unique(),
    ...timestamps,
  },
  (t) => [index("payments_student_idx").on(t.studentId), index("payments_status_idx").on(t.status)],
);

export const paymentAllocations = mysqlTable(
  "payment_allocations",
  {
    paymentId: char("payment_id", { length: 26 }).notNull().references(() => payments.id, { onDelete: "cascade" }),
    dueId: char("due_id", { length: 26 }).notNull().references(() => dues.id, { onDelete: "cascade" }),
    amount: int("amount").notNull(),
  },
  (t) => [primaryKey({ columns: [t.paymentId, t.dueId] }), index("payment_allocations_due_idx").on(t.dueId)],
);

/** "Fee paid" ticks from paper registers; turned into a `register` payment when the month's due exists. */
export const prepaidMarks = mysqlTable(
  "prepaid_marks",
  {
    id: ulidId(),
    studentId: char("student_id", { length: 26 }).notNull().references(() => students.id, { onDelete: "cascade" }),
    month: char("month", { length: 7 }).notNull(),
    source: varchar("source", { length: 20 }).notNull().default("register"),
    note: varchar("note", { length: 255 }),
    appliedPaymentId: char("applied_payment_id", { length: 26 }),
    createdAt: datetime("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("prepaid_marks_student_month_uq").on(t.studentId, t.month)],
);

/* ---------------- Attendance (spec §7) ---------------- */

export const attendance = mysqlTable(
  "attendance",
  {
    id: ulidId(),
    batchId: char("batch_id", { length: 26 }).notNull().references(() => batches.id),
    studentId: char("student_id", { length: 26 }).notNull().references(() => students.id, { onDelete: "cascade" }),
    sessionDate: date("session_date", { mode: "string" }).notNull(),
    status: mysqlEnum("status", attendanceStatuses).notNull(),
    markedBy: varchar("marked_by", { length: 36 }).references(() => user.id),
    markedAt: datetime("marked_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("attendance_student_batch_date_uq").on(t.studentId, t.batchId, t.sessionDate),
    index("attendance_batch_date_idx").on(t.batchId, t.sessionDate),
  ],
);

/* ---------------- Reminders (spec §8) ---------------- */

export const remindersLog = mysqlTable(
  "reminders_log",
  {
    id: ulidId(),
    studentId: char("student_id", { length: 26 }).notNull().references(() => students.id, { onDelete: "cascade" }),
    month: char("month", { length: 7 }),
    channel: mysqlEnum("channel", ["wa_link", "wa_api"]).notNull(),
    sentBy: varchar("sent_by", { length: 36 }).references(() => user.id),
    sentAt: datetime("sent_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
    message: text("message").notNull(),
  },
  (t) => [index("reminders_student_idx").on(t.studentId)],
);

/* ---------------- Google Sheet sync (spec §16.3) ---------------- */

/** What the app last wrote to the sheet for each student — the baseline for detecting sheet edits. */
export const sheetSyncState = mysqlTable("sheet_sync_state", {
  studentId: char("student_id", { length: 26 })
    .primaryKey()
    .references(() => students.id, { onDelete: "cascade" }),
  lastPushedJson: text("last_pushed_json").notNull(),
  updatedAt: datetime("updated_at", { mode: "date" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
});
