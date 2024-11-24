import type { PropsWithChildren } from "react";

const DashboardLayout = ({ children }: PropsWithChildren) => {
  return (
    <>
      <div className="fixed top-0 left-0 w-full h-full bg-gradient-to-br from-blue-500 to-purple-500 z-0" />
      <main className="relative z-10 px-3 lg:px-14">{children}</main>
    </>
  );
};

export default DashboardLayout;
