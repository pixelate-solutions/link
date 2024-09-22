import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher(["/overview", "/transactions", "/accounts", "/categories", "/chat", "/settings"]);

export default clerkMiddleware((auth, req) => {
  if (isProtectedRoute(req)) auth().protect();

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!.+.[w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
