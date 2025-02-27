"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { Montserrat } from "next/font/google";
import { DataCharts } from "@/components/data-charts";
import { DataGrid } from "@/components/data-grid";

// Import shadcn/ui Dialog components
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const montserratP = Montserrat({
  weight: "500",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "800",
  subsets: ["latin"],
});

const DashboardPage = () => {
  const { user } = useUser();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (user?.id) {
      // Fetch walkthrough status for the current user
      fetch(`/api/walkthrough-status`)
        .then((res) => res.json())
        .then((data) => {
          // If hidden is false (or not set), show the dialog
          if (!data.hidden) {
            setOpen(true);
          }
        })
        .catch((err) =>
          console.error("Error fetching walkthrough status:", err)
        );
    }
  }, [user?.id]);

  // Closes the dialog without updating the database.
  const handleHideOnce = () => {
    setOpen(false);
  };

  // Calls the API to update the walkthrough status for the user to hidden: true.
  const handleHideForever = () => {
    fetch("/api/walkthrough-status/hide-walkthrough", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user?.id }),
    })
      .then((res) => res.json())
      .then(() => setOpen(false))
      .catch((err) =>
        console.error("Error updating walkthrough status:", err)
      );
  };

  return (
    <>
      <div
        className={cn(
          "mx-auto w-full max-w-screen-2xl pb-10",
          montserratP.className
        )}
      >
        {/* Background styling */}
        <div className="absolute inset-0 overflow-x-clip">
          <div className="absolute -bottom-[950px] left-[3%] w-[300px] h-[500px] md:w-[600px] md:h-[700px] bg-purple-400 opacity-30 rounded-full filter blur-3xl -z-10" />
        </div>
        <DataGrid />
        <DataCharts />
      </div>

      {/* Walkthrough Popup Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="lg:max-w-[70%] md:max-w-[80%] sm:max-w-[90%] w-full rounded-lg p-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              Quick Walkthrough Video
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <video
              src="/LinkWalkthrough.mp4"
              autoPlay={true}
              controls={true}
              className="w-full h-auto rounded-md outline-none"
            />
          </div>
          <DialogFooter className="mt-4 flex flex-col sm:justify-center sm:space-x-10 w-full space-y-2 sm:space-y-0">
            <button
              onClick={handleHideOnce}
              className="w-full sm:w-auto px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Hide Once
            </button>
            <button
              onClick={handleHideForever}
              className="w-full sm:w-auto px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
            >
              Hide Forever
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DashboardPage;
