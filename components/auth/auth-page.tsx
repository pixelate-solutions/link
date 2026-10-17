import { SignIn, SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { Logo } from "@/components/shell/logo";
import { authMode } from "@/server/auth";
import { DevSignIn } from "./dev-sign-in";

export function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const m = authMode();
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="flex w-full max-w-sm flex-col items-center">
        <Link href="/" aria-label="Link">
          <Logo />
        </Link>
        <h1 className="mt-10 text-[28px] font-semibold tracking-[-0.03em]">{mode === "sign-in" ? "Welcome back" : "Start with what you want"}</h1>
        <div className="mt-8 w-full">
          {m === "clerk" ? (
            mode === "sign-in" ? (
              <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/home" appearance={{ elements: { rootBox: "w-full", cardBox: "w-full shadow-none" } }} />
            ) : (
              <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/welcome" appearance={{ elements: { rootBox: "w-full", cardBox: "w-full shadow-none" } }} />
            )
          ) : m === "dev" ? (
            <DevSignIn />
          ) : (
            <p className="text-center text-[14px] text-caution">Sign-in isn&apos;t configured. Set Clerk keys (or LINK_DEV_AUTH=1 for local development).</p>
          )}
        </div>
      </div>
    </main>
  );
}
