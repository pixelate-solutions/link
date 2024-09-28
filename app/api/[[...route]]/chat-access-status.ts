import { Hono } from 'hono';
import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { db } from '@/db/drizzle';
import { chatAccess } from '@/db/schema';
import { eq } from 'drizzle-orm';

const app = new Hono();

// GET request to retrieve the chat access status
app.get('/status', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = ctx.req.query('userId');

  if (!auth?.userId || auth.userId !== userId) {
    return ctx.json({ error: 'Unauthorized.' }, 401);
  }

  try {
    const [record] = await db.select().from(chatAccess).where(eq(chatAccess.customerId, userId));

    if (!record) {
      return ctx.json({ status: false }); // default to false if no record exists
    }

    return ctx.json({ status: record.allowAccess });
  } catch (error) {
    console.error('Error retrieving chat access status:', error);
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
});

app.post('/update', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const { userId, allowAccess } = await ctx.req.json();

  if (!auth?.userId || auth.userId !== userId) {
    return ctx.json({ error: 'Unauthorized.' }, 401);
  }

  try {
    // Check if the user already has a record in the chatAccess table
    const [existingRecord] = await db
      .select()
      .from(chatAccess)
      .where(eq(chatAccess.customerId, userId));

    if (existingRecord) {
      // If record exists, update the allowAccess field
      await db
        .update(chatAccess)
        .set({ allowAccess })
        .where(eq(chatAccess.customerId, userId));
    } else {
      // If no record exists, insert a new one
      await db
        .insert(chatAccess)
        .values({ customerId: userId, allowAccess });
    }

    return ctx.json({ success: true });
  } catch (error) {
    console.error('Error updating chat access status:', error);
    return ctx.json({ error: 'Internal Server Error' }, 500);
  }
});


export default app;
