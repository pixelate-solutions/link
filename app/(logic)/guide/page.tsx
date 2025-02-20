"use client";

import React, { useEffect, useState } from "react";
import { Montserrat } from "next/font/google";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { ColorRing } from "react-loader-spinner";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Typewriter } from "react-simple-typewriter";
import { useUser } from "@clerk/nextjs";
import { UpgradePopup } from "@/components/upgrade-popup";

const montserratP = Montserrat({
  weight: "500",
  subsets: ["latin"],
});

const montserratM = Montserrat({
  weight: "600",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "800",
  subsets: ["latin"],
});

const presetOptions = [
  "How can I adjust my budget distribution to better accommodate my spending?",
  "What can I do to lower my overall spending?",
  "How much should I save for an emergency fund based on my transaction history?",
  "How can I adjust my finances to increase investing and retire sooner?",
  "What’s my biggest area of financial waste right now?",
  "What’s the best way for me to pay off my debt faster?",
  "What percent of my regular income is going toward non-essential purchases?",
  "Are there any subscriptions or recurring expenses I should reconsider keeping?",
  "Have I been hit with any unexpected or hidden fees recently?",
  "How should I split up paying for all my debts based on my current standard incomes?",
];

const GuidePage = () => {
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [showOptions, setShowOptions] = useState(true);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>("Loading...");
  const [openUpgradeDialog, setOpenUpgradeDialog] = useState<boolean>(false);

  const { isLoaded, user } = useUser();
  const userId = user?.id;

  // When a preset option is clicked.
  const handleOptionClick = (question: string) => {
    setSelectedQuestion(question);
    setShowOptions(false);
    sendLogicQuery(question);
  };

  // Send the query to the backend.
  const sendLogicQuery = async (question: string) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/logic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        accumulatedText += chunk;
        setAiResponse(accumulatedText);
      }
    } catch (error) {
      console.error("Error sending logic query:", error);
      setAiResponse("Sorry, there was an error processing your request.");
    } finally {
      setIsLoading(false);
    }
  };

  // Reset to allow choosing another query.
  const handleReset = () => {
    setSelectedQuestion(null);
    setAiResponse("");
    setShowOptions(true);
  };

  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      if (userId) {
        try {
          await fetch(`/api/subscription-status?userId=${userId}`)
            .then(response => response.json())
            .then(async (data) => {
              setSubscriptionStatus(data.plan);
              setOpenUpgradeDialog(data.plan === "Free");
            });
        } catch (error) {
          console.error("Error fetching subscription status:", error);
          setSubscriptionStatus("Error");
        }
      }
    };
    fetchSubscriptionStatus();
  }, [userId]);

  return (
    <>
      <div className={cn("min-h-screen bg-white", montserratP.className)}>
        {/* Header */}
        <div className="sticky top-[137px] -mt-[130px] border-2 border-b-0 shadow-md bg-gradient-to-br from-white to-gray-100 lg:w-[74%] lg:ml-[13%] h-[100px] rounded-t-2xl z-40 flex items-center justify-center">
          <p className={cn("text-4xl text-center", montserratH.className)}>
            Finance Guide
          </p>
        </div>
        {/* User Data Section */}
        <div className="lg:w-[74%] lg:ml-[13%] mt-32 lg:mt-12 lg:border-2 border-t-0 rounded-2xl rounded-t-none p-2">
          <div className="px-8 pb-8 flex flex-col items-center">
            <p className={cn("lg:text-xl text-lg mt-[15px] text-gray-700 text-center mb-[10px]", montserratM.className)}>
              Here to help you learn more about managing your finances.
            </p>
            <p className={cn("lg:text-lg text-md", showOptions ? "mb-[30px]" : "", "text-gray-500", montserratP.className)}>
              New responses formed weekly
            </p>
            {showOptions && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {presetOptions.map((option, idx) => (
                  <button
                    key={idx}
                    className="bg-white rounded-xl border-2 shadow-md p-4 hover:scale-[102%] hover:bg-gray-50 transition-all"
                    onClick={() => {
                      if (subscriptionStatus === "Free") {
                        setOpenUpgradeDialog(true);
                      } else {
                        handleOptionClick(option);
                      }
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
            {aiResponse && (
              <div className="my-4 w-full flex justify-center">
                <button
                  className="px-4 py-2 bg-gray-100 shadow-md border rounded-lg hover:bg-gray-200 transition"
                  onClick={handleReset}
                >
                  <div className={cn("flex items-center", montserratP.className)}>
                    <ArrowLeft className="mr-2" />
                    Go back to questions...
                  </div>
                </button>
              </div>
            )}
            {selectedQuestion && (
              <div
                className="w-full mt-4 p-6 rounded-xl bg-gradient-to-br from-blue-100 to-purple-100 transition-all duration-500"
                style={{ animation: "fadeIn 1s ease-in" }}
              >
                <div className="mb-4">
                  <p className={cn("font-bold text-black", montserratH.className)}>Question:</p>
                  <div className={cn("lg:text-xl", montserratP.className)}>
                    <Typewriter
                      words={[selectedQuestion]}
                      loop={1}
                      typeSpeed={40}
                      deleteSpeed={10}
                      delaySpeed={1000}
                    />
                  </div>
                </div>
                {isLoading && (
                  <div className="flex justify-center">
                    <ColorRing
                      visible={true}
                      height="80"
                      width="80"
                      ariaLabel="color-ring-loading"
                      wrapperStyle={{}}
                      wrapperClass="color-ring-wrapper"
                      colors={["#3B82F6", "#6366F1", "#7C3AED", "#9333EA", "#A855F7"]}
                    />
                  </div>
                )}
                {aiResponse && (
                  <div
                    className="mt-4 p-4 bg-white rounded shadow transition-all duration-500"
                    style={{ animation: "fadeIn 1s ease-in" }}
                  >
                    <MarkdownRenderer content={aiResponse} />
                  </div>
                )}
              </div>
            )}
            {aiResponse && (
              <div className="mt-4 w-full flex justify-center">
                <button
                  className="px-4 py-2 bg-gray-100 shadow-md border rounded-lg hover:bg-gray-200 transition"
                  onClick={handleReset}
                >
                  <div className={cn("flex items-center", montserratP.className)}>
                    <ArrowLeft className="mr-2" />
                    Go back to questions...
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {(subscriptionStatus === "Free" && isLoaded) && (
        <div className={`${openUpgradeDialog && "fixed inset-0 z-50 flex items-center justify-center"}`}>
          <UpgradePopup open={openUpgradeDialog} onOpenChange={setOpenUpgradeDialog} />
        </div>
      )}
    </>
  );
};

export default GuidePage;
