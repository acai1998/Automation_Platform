import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { runCollection, validateCollection } from "./newman";
import { TRPCError } from "@trpc/server";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Collection management routes
  collections: router({
    // Get all collections for current user
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        const collections = await db.getCollectionsByUserId(ctx.user.id);
        return collections;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message,
        });
      }
    }),

    // Get single collection
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        try {
          const collection = await db.getCollectionById(input.id);
          if (!collection) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Collection not found',
            });
          }
          if (collection.userId !== ctx.user.id) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not have permission to access this collection',
            });
          }
          return collection;
        } catch (error: any) {
          if (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND') throw error;
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message,
          });
        }
      }),

    // Create collection
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        rawJson: z.any(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const validation = validateCollection(input.rawJson);
          if (!validation.valid) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Invalid Postman Collection: ${validation.errors.join(', ')}`,
            });
          }

          const result = await db.createCollection(
            ctx.user.id,
            input.name,
            input.description || null,
            input.rawJson
          );
          return result;
        } catch (error: any) {
          if (error.code === 'BAD_REQUEST') throw error;
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message,
          });
        }
      }),

    // Update collection
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        rawJson: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const collection = await db.getCollectionById(input.id);
          if (!collection) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Collection not found',
            });
          }
          if (collection.userId !== ctx.user.id) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not have permission to update this collection',
            });
          }

          if (input.rawJson) {
            const validation = validateCollection(input.rawJson);
            if (!validation.valid) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Invalid Postman Collection: ${validation.errors.join(', ')}`,
              });
            }
          }

          const result = await db.updateCollection(
            input.id,
            input.name || collection.name,
            input.description !== undefined ? input.description : collection.description,
            input.rawJson || collection.rawJson
          );
          return result;
        } catch (error: any) {
          if (error.code === 'BAD_REQUEST' || error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND') throw error;
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message,
          });
        }
      }),

    // Delete collection
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const collection = await db.getCollectionById(input.id);
          if (!collection) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Collection not found',
            });
          }
          if (collection.userId !== ctx.user.id) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not have permission to delete this collection',
            });
          }

          const result = await db.deleteCollection(input.id);
          return result;
        } catch (error: any) {
          if (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND') throw error;
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message,
          });
        }
      }),
  }),

  // Collection execution routes
  execution: router({
    // Run collection manually
    run: protectedProcedure
      .input(z.object({
        collectionId: z.number(),
        environmentJson: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const collection = await db.getCollectionById(input.collectionId);
          if (!collection) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Collection not found',
            });
          }
          if (collection.userId !== ctx.user.id) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not have permission to execute this collection',
            });
          }

          const historyResult = await db.createExecutionHistory(input.collectionId, ctx.user.id);
          const historyId = (historyResult as any)[0]?.insertId || (historyResult as any).insertId;

          await db.updateExecutionHistory(historyId, { status: 'running' });

          try {
            const result = await runCollection(collection.rawJson, input.environmentJson);

            await db.updateExecutionHistory(historyId, {
              status: result.status === 'success' ? 'success' : 'failed',
              totalRequests: result.stats.totalRequests,
              passedRequests: result.stats.passedRequests,
              failedRequests: result.stats.failedRequests,
              totalTime: result.stats.totalTime,
              averageResponseTime: result.stats.averageResponseTime,
              resultJson: result,
              executedAt: new Date(),
            });

            return {
              historyId,
              ...result,
            };
          } catch (error: any) {
            await db.updateExecutionHistory(historyId, {
              status: 'failed',
              errorMessage: error.message,
              executedAt: new Date(),
            });

            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Failed to execute collection: ${error.message}`,
            });
          }
        } catch (error: any) {
          if (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND' || error.code === 'INTERNAL_SERVER_ERROR') throw error;
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message,
          });
        }
      }),

    // Get execution history
    history: protectedProcedure
      .input(z.object({
        collectionId: z.number(),
        limit: z.number().default(50),
      }))
      .query(async ({ ctx, input }) => {
        try {
          const collection = await db.getCollectionById(input.collectionId);
          if (!collection) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Collection not found',
            });
          }
          if (collection.userId !== ctx.user.id) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not have permission to access this collection',
            });
          }

          const history = await db.getExecutionHistoryByCollectionId(input.collectionId, input.limit);
          return history;
        } catch (error: any) {
          if (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND') throw error;
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message,
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
