import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, collections, executionHistory } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Collection queries
export async function createCollection(userId: number, name: string, description: string | null, rawJson: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(collections).values({
    userId,
    name,
    description,
    rawJson,
  });

  return result;
}

export async function getCollectionsByUserId(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(collections).where(eq(collections.userId, userId));
}

export async function getCollectionById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(collections).where(eq(collections.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateCollection(id: number, name: string, description: string | null, rawJson: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.update(collections).set({
    name,
    description,
    rawJson,
    updatedAt: new Date(),
  }).where(eq(collections.id, id));
}

export async function deleteCollection(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.delete(collections).where(eq(collections.id, id));
}

// ExecutionHistory queries
export async function createExecutionHistory(collectionId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(executionHistory).values({
    collectionId,
    userId,
    status: "pending",
  });

  return result;
}

export async function getExecutionHistoryById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(executionHistory).where(eq(executionHistory.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getExecutionHistoryByCollectionId(collectionId: number, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(executionHistory)
    .where(eq(executionHistory.collectionId, collectionId))
    .orderBy((t) => t.createdAt)
    .limit(limit);
}

export async function updateExecutionHistory(id: number, updates: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.update(executionHistory).set({
    ...updates,
  }).where(eq(executionHistory.id, id));
}

// TODO: add more feature queries here as your schema grows.
