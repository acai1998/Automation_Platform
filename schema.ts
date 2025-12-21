import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean, float, index } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Postman Collection 表
export const collections = mysqlTable("collections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  rawJson: json("rawJson").notNull(), // 存储完整的 Postman Collection JSON
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("userId_idx").on(table.userId),
}));

export type Collection = typeof collections.$inferSelect;
export type InsertCollection = typeof collections.$inferInsert;

// Collection 执行历史表
export const executionHistory = mysqlTable("executionHistory", {
  id: int("id").autoincrement().primaryKey(),
  collectionId: int("collectionId").notNull(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["pending", "running", "success", "failed", "stopped"]).default("pending").notNull(),
  totalRequests: int("totalRequests").default(0),
  passedRequests: int("passedRequests").default(0),
  failedRequests: int("failedRequests").default(0),
  totalTime: float("totalTime").default(0), // 毫秒
  averageResponseTime: float("averageResponseTime").default(0), // 毫秒
  resultJson: json("resultJson"), // 存储 Newman 执行结果
  errorMessage: text("errorMessage"), // 错误信息
  executedAt: timestamp("executedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  collectionIdIdx: index("collectionId_idx").on(table.collectionId),
  userIdIdx: index("userId_idx").on(table.userId),
}));

export type ExecutionHistory = typeof executionHistory.$inferSelect;
export type InsertExecutionHistory = typeof executionHistory.$inferInsert;

// 定时任务配置表
export const scheduledTasks = mysqlTable("scheduledTasks", {
  id: int("id").autoincrement().primaryKey(),
  collectionId: int("collectionId").notNull(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  cronExpression: varchar("cronExpression", { length: 100 }).notNull(), // Cron 表达式
  isActive: boolean("isActive").default(true),
  lastExecutedAt: timestamp("lastExecutedAt"),
  nextExecuteAt: timestamp("nextExecuteAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  collectionIdIdx: index("collectionId_idx").on(table.collectionId),
  userIdIdx: index("userId_idx").on(table.userId),
}));

export type ScheduledTask = typeof scheduledTasks.$inferSelect;
export type InsertScheduledTask = typeof scheduledTasks.$inferInsert;

// 业务场景表
export const scenarios = mysqlTable("scenarios", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  config: json("config").notNull(), // 存储场景配置
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("userId_idx").on(table.userId),
}));

export type Scenario = typeof scenarios.$inferSelect;
export type InsertScenario = typeof scenarios.$inferInsert;

// 场景执行历史表
export const scenarioExecutionHistory = mysqlTable("scenarioExecutionHistory", {
  id: int("id").autoincrement().primaryKey(),
  scenarioId: int("scenarioId").notNull(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["pending", "running", "success", "failed", "stopped"]).default("pending").notNull(),
  resultJson: json("resultJson"), // 存储执行结果
  errorMessage: text("errorMessage"),
  executedAt: timestamp("executedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  scenarioIdIdx: index("scenarioId_idx").on(table.scenarioId),
  userIdIdx: index("userId_idx").on(table.userId),
}));

export type ScenarioExecutionHistory = typeof scenarioExecutionHistory.$inferSelect;
export type InsertScenarioExecutionHistory = typeof scenarioExecutionHistory.$inferInsert;

// 通知日志表
export const notificationLogs = mysqlTable("notificationLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["execution_failed", "assertion_failed", "timeout", "status_error"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  relatedId: int("relatedId"), // 关联的 executionHistory 或 scenarioExecutionHistory ID
  isRead: boolean("isRead").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("userId_idx").on(table.userId),
}));

export type NotificationLog = typeof notificationLogs.$inferSelect;
export type InsertNotificationLog = typeof notificationLogs.$inferInsert;