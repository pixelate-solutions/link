import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { db } from "@/db/drizzle";
import { categories, categorizationRules } from "@/db/schema";

const app = new Hono()
  .get("/", clerkMiddleware(), async (ctx) => {
    const auth = getAuth(ctx);

    if (!auth?.userId) {
      return ctx.json({ error: "Unauthorized." }, 401);
    }

    const data = await db
      .select({
        id: categories.id,
        name: categories.name,
        budgetAmount: categories.budgetAmount,
        type: categories.type,
      })
      .from(categories)
      .where(eq(categories.userId, auth.userId));

    return ctx.json({ data });
  })
  .get(
    "/:id",
    zValidator(
      "param",
      z.object({
        id: z.string().optional(),
      })
    ),
    clerkMiddleware(),
    async (ctx) => {
      const auth = getAuth(ctx);
      const { id } = ctx.req.valid("param");

      if (!id) {
        return ctx.json({ error: "Missing id." }, 400);
      }

      if (!auth?.userId) {
        return ctx.json({ error: "Unauthorized." }, 401);
      }

      const [data] = await db
        .select({
          id: categories.id,
          name: categories.name,
          budgetAmount: categories.budgetAmount,
          type: categories.type,
        })
        .from(categories)
        .where(and(eq(categories.userId, auth.userId), eq(categories.id, id)));

      if (!data) {
        return ctx.json({ error: "Not found." }, 404);
      }

      return ctx.json({ data });
    }
  )
  .post(
    "/set-default",
    clerkMiddleware(),
    async (ctx) => {
      const auth = getAuth(ctx);
      const userId = auth?.userId;

      if (!userId) {
        return ctx.json({ error: "Unauthorized" }, 401);
      }

      const defaultCategories = [
        { name: "Income", type: "income" },
        { name: "Transfer In", type: "transfer" },
        { name: "Transfer Out", type: "transfer" },
        { name: "Loan Payments", type: "expense" },
        { name: "Bank Fees", type: "expense" },
        { name: "Entertainment", type: "expense" },
        { name: "Food/Drink", type: "expense" },
        { name: "General Merchandise", type: "expense" },
        { name: "Home Improvement", type: "expense" },
        { name: "Medical", type: "expense" },
        { name: "Personal Care", type: "expense" },
        { name: "General Services", type: "expense" },
        { name: "Government/Non-Profit", type: "expense" },
        { name: "Transportation", type: "expense" },
        { name: "Travel", type: "expense" },
        { name: "Rent/Utilities", type: "expense" },
      ];

      const existingCategories = await db
        .select({ name: categories.name })
        .from(categories)
        .where(and(eq(categories.userId, userId), eq(categories.isDefault, true)));

      const missingCategories = defaultCategories.filter(
        (defaultCategory) =>
          !existingCategories.some((cat) => cat.name === defaultCategory.name)
      );

      if (missingCategories.length > 0) {
        await db.insert(categories).values(
          missingCategories.map((cat) => ({
            id: createId(),
            userId,
            name: cat.name,
            type: cat.type,
            isDefault: true,
          }))
        );
      }

      return ctx.json({ message: "Default categories checked and updated." }, 200);
    }
  )
  .post(
    "/",
    clerkMiddleware(),
    zValidator(
      "json",
      z.object({
        name: z.string(),
        plaidCategoryId: z.string().optional(),
        budgetAmount: z.string().optional(),
      })
    ),
    async (ctx) => {
      const auth = getAuth(ctx);
      const { name, plaidCategoryId, budgetAmount } = ctx.req.valid("json");
      const userId = auth?.userId;

      if (!userId) {
        return ctx.json({ error: "Unauthorized." }, 401);
      }

      const newCategory = await db
        .insert(categories)
        .values({
          id: createId(),
          userId,
          name,
          plaidCategoryId: plaidCategoryId || null,
          isFromPlaid: !!plaidCategoryId,
          budgetAmount: budgetAmount || null,
        })
        .returning();

      return ctx.json({ category: newCategory }, 201);
    }
  )
  .post(
    "/bulk-delete",
    clerkMiddleware(),
    zValidator(
      "json",
      z.object({
        ids: z.array(z.string()),
      })
    ),
    async (ctx) => {
      const auth = getAuth(ctx);
      const values = ctx.req.valid("json");

      if (!auth?.userId) {
        return ctx.json({ error: "Unauthorized." }, 401);
      }

      const categoriesToDelete = await db
        .select({ id: categories.id, isDefault: categories.isDefault })
        .from(categories)
        .where(
          and(eq(categories.userId, auth.userId), inArray(categories.id, values.ids))
        );

      // Extract all category IDs to delete
      const idsToDelete = categoriesToDelete.map((category) => category.id);

      let data;
      if (idsToDelete.length > 0) {
        // Delete all categorizationRules for these categories
        await db
          .delete(categorizationRules)
          .where(
            and(eq(categorizationRules.userId, auth.userId), inArray(categorizationRules.categoryId, idsToDelete))
          )
          .execute();

        // Delete all categories in the given list
        data = await db
          .delete(categories)
          .where(and(eq(categories.userId, auth.userId), inArray(categories.id, idsToDelete)))
          .returning({ id: categories.id });
      }

      return ctx.json({ data });
    }
  )
  .patch(
    "/:id",
    clerkMiddleware(),
    zValidator(
      "param",
      z.object({
        id: z.string().optional(),
      })
    ),
    zValidator(
      "json",
      z.object({
        name: z.string(),
        budgetAmount: z.string().optional(),
        type: z.enum(["income", "expense", "transfer"]),
      })
    ),
    async (ctx) => {
      const auth = getAuth(ctx);
      const { id } = ctx.req.valid("param");
      const { name, budgetAmount, type = "expense" } = ctx.req.valid("json");

      if (!id) {
        return ctx.json({ error: "Missing id." }, 400);
      }

      if (!auth?.userId) {
        return ctx.json({ error: "Unauthorized." }, 401);
      }

      // Verify that the category belongs to the authenticated user
      const category = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.userId, auth.userId), eq(categories.id, id)));

      if (!category.length) {
        return ctx.json({ error: "Not found." }, 404);
      }

      const [data] = await db
        .update(categories)
        .set({ name, budgetAmount, type })
        .where(and(eq(categories.userId, auth.userId), eq(categories.id, id)))
        .returning();

      return ctx.json({ data });
    }
  )
  .delete(
    "/:id",
    clerkMiddleware(),
    zValidator(
      "param",
      z.object({
        id: z.string().optional(),
      })
    ),
    async (ctx) => {
      const auth = getAuth(ctx);
      const { id } = ctx.req.valid("param");

      if (!id) {
        return ctx.json({ error: "Missing id." }, 400);
      }

      if (!auth?.userId) {
        return ctx.json({ error: "Unauthorized." }, 401);
      }

      // Fetch the category (Optional: only if you need it for logging or other operations)
      const category = await db
        .select({ id: categories.id, isDefault: categories.isDefault })
        .from(categories)
        .where(and(eq(categories.userId, auth.userId), eq(categories.id, id)))
        .limit(1);

      if (!category.length) {
        return ctx.json({ error: "Not found." }, 404);
      }

      // First, delete any categorizationRules that have this category id for the user
      await db
        .delete(categorizationRules)
        .where(and(eq(categorizationRules.userId, auth.userId), eq(categorizationRules.categoryId, id)))
        .execute();

      // Then, delete the category regardless of whether it's default or not
      const [data] = await db
        .delete(categories)
        .where(and(eq(categories.userId, auth.userId), eq(categories.id, id)))
        .returning({
          id: categories.id,
          isDefault: categories.isDefault,
        });

      return ctx.json({ data });
    }
  );

export default app;
