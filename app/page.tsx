import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/shell/logo";
import { currentUserId } from "@/server/auth";

export default async function Landing() {
  if (await currentUserId()) redirect("/home");
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-6">
      <header className="flex h-20 items-center justify-between">
        <Logo />
        <Link href="/sign-in" className="text-sm font-medium text-fg-2 hover:text-fg">
          Sign in
        </Link>
      </header>
      <section className="flex flex-1 flex-col justify-center pb-24">
        <h1 className="max-w-3xl text-[44px] font-semibold leading-[1.02] tracking-[-0.045em] md:text-[72px]">
          Tell Link what you want out of life.
          <span className="block text-muted">It figures out how your money gets you there.</span>
        </h1>
        <p className="mt-6 max-w-xl text-[17px] text-fg-2">
          Connect your accounts, say what matters in your own words, and get a plan that updates itself. One clear number, one next step, and honest answers to hard questions.
        </p>
        <div className="mt-10 flex items-center gap-4">
          <Link href="/sign-up" className="inline-flex h-12 items-center rounded-full bg-fg px-6 text-[15px] font-medium text-bg hover:opacity-90">
            Get started
          </Link>
          <span className="text-[13px] text-muted">Read-only bank access. Link never moves money.</span>
        </div>
      </section>
      <footer className="flex h-16 items-center justify-between text-[12px] text-muted">
        <span>© Link</span>
        <span>Estimates, not guarantees. Not investment advice.</span>
      </footer>
    </main>
  );
}
