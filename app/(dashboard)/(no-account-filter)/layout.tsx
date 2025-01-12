import type { PropsWithChildren } from "react";

import { HeaderNoAccountFilter } from "@/components/header-no-account-filter";

const DashboardLayout = ({ children }: PropsWithChildren) => {
  return (
    <>
      <HeaderNoAccountFilter />
      <main className="px-3 lg:px-14">{children}</main>
    </>
  );
};

export default DashboardLayout;
