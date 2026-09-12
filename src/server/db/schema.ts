import { boolean, char, date, datetime, index, int, mysqlEnum, mysqlTable, primaryKey, text, time, tinyint, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { ulid } from "ulid";
// Relative import (not "@/"): drizzle-kit loads this file without tsconfig path aliases.
import { ageCategories, discountTypes, staffRoles, studentStatuses } from "../../lib/constants";

export { ageCategories, discountTypes, staffRoles, studentStatuses };
export type { AgeCategory, StaffRole, StudentStatus } from "../../lib/constants";

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
    parentName: varchar("parent_name", { length: 120 }).notNull(),
    parentPhone: varchar("parent_phone", { length: 20 }).notNull(),
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
