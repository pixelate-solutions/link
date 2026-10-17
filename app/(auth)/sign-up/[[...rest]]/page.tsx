import { AuthPage } from "@/components/auth/auth-page";

export const metadata = { title: "Create your account" };
export default function Page() {
  return <AuthPage mode="sign-up" />;
}
