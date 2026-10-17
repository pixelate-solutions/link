import { clerkMiddleware } from "@clerk/nextjs/server";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";

/**
 * Clerk attaches session state when configured. Authorization itself happens
 * in every page, action and route handler (`requireUser`), never here.
 */
const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
const clerk = clerkEnabled ? clerkMiddleware() : null;

export default function proxy(req: NextRequest, ev: NextFetchEvent) {
  return clerk ? clerk(req, ev) : NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)", "/(api|trpc)(.*)"],
};
