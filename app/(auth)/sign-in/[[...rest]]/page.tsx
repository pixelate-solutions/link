import { AuthPage } from "@/components/auth/auth-page";

export const metadata = { title: "Sign in" };
export default function Page() {
  return <AuthPage mode="sign-in" />;
}
