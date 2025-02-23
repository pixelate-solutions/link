import type { PropsWithChildren } from "react";

const DashboardLayout = ({ children }: PropsWithChildren) => {
  return (
    <>
      <div className="absolute inset-0 -z-10 overflow-x-clip">
        {/* Shape 1 */}
        <div className="absolute -top-44 left-[40%] w-[200px] h-[400px] md:w-[400px] md:h-[700px] rotate-[40deg] bg-blue-400 opacity-30 rounded-full blur-3xl" />
        {/* Shape 2 */}
        <div className="absolute top-[400px] right-0 w-[200px] h-[400px] md:w-[400px] md:h-[800px] rotate-[45deg] bg-blue-400 opacity-30 rounded-full blur-3xl" />
        {/* Shape 3 */}
        <div className="absolute top-[10%] left-10 w-[200px] h-[400px] md:w-[400px] md:h-[400px] bg-purple-400 opacity-30 rounded-full blur-3xl" />
        {/* Shape 4 */}
        <div className="absolute -bottom-96 right-[65%] w-[200px] h-[400px] md:w-[300px] md:h-[500px] bg-purple-400 opacity-30 rounded-full blur-3xl" />
      </div>
      <main className="relative z-10 px-3 lg:px-14">{children}</main>
    </>
  );
};

export default DashboardLayout;
