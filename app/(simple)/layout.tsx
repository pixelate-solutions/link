import type { PropsWithChildren } from "react";
import { HeaderSimple } from "@/components/header-simple";

const LandingLayout = ({ children }: PropsWithChildren) => {
  return (
    <>
      <HeaderSimple />
      <main className="px-3 lg:px-14">{children}</main>
    </>
  );
};

export default LandingLayout;
