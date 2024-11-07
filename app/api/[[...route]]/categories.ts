import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { db } from "@/db/drizzle";
import { categories, insertCategorySchema } from "@/db/schema";

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
        { name: "Salary/Wages (Default)", type: "income" },
        { name: "Other Income (Default)", type: "income" },
        { name: "Housing/Utilities (Default)", type: "expense" },
        { name: "Transportation (Default)", type: "expense" },
        { name: "Groceries/Food (Default)", type: "expense" },
        { name: "Health/Insurance (Default)", type: "expense" },
        { name: "Entertainment/Leisure (Default)", type: "expense" },
        { name: "Savings/Investments (Default)", type: "expense" },
        { name: "Other Expense (Default)", type: "expense" },
      ];

      const existingCategories = await db
        .select({ name: categories.name })
        .from(categories)
        .where(and(eq(categories.userId, userId), eq(categories.isDefault, true)));

      const missingCategories = defaultCategories.filter(
        (defaultCategory) => !existingCategories.some((cat) => cat.name === defaultCategory.name)
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

      // Fetch categories to check for any default categories in the list
      const categoriesToDelete = await db
        .select({ id: categories.id, isDefault: categories.isDefault })
        .from(categories)
        .where(
          and(
            eq(categories.userId, auth.userId),
            inArray(categories.id, values.ids)
          )
        );

      // Filter out default categories
      const nonDefaultCategoryIds = categoriesToDelete
        .filter((category) => !category.isDefault)
        .map((category) => category.id);

      if (nonDefaultCategoryIds.length === 0) {
        return ctx.json({ error: "No categories can be deleted." }, 400);
      }

      // Proceed with deletion of non-default categories
      const data = await db
        .delete(categories)
        .where(
          and(
            eq(categories.userId, auth.userId),
            inArray(categories.id, nonDefaultCategoryIds)
          )
        )
        .returning({ id: categories.id });

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
      budgetAmount: z.string(), // Only allow `budgetAmount` in the request body
    })
  ),
  async (ctx) => {
    const auth = getAuth(ctx);
    const { id } = ctx.req.valid("param");
    const { budgetAmount } = ctx.req.valid("json");

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

    // Proceed with update for `budgetAmount` regardless of default status
    const [data] = await db
      .update(categories)
      .set({ budgetAmount }) // Only update `budgetAmount`
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

      // Check if the category is a default category
      const category = await db
        .select({ id: categories.id, isDefault: categories.isDefault })
        .from(categories)
        .where(and(eq(categories.userId, auth.userId), eq(categories.id, id)))
        .limit(1);

      if (!category) {
        return ctx.json({ error: "Not found." }, 404);
      }

      if (category[0].isDefault) {
        return ctx.json({ error: "Cannot delete a default category." }, 403);
      }

      // Proceed with deletion if the category is not default
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
