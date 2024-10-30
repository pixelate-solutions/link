"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Montserrat } from "next/font/google";
import { chat as chatAPI, history as historyAPI, clearChatHistory as clearChatHistoryAPI } from "@/app/api/routes";
import { useUser } from "@clerk/nextjs";
import ReactMarkdown from 'react-markdown';
import gfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { BeatLoader } from "react-spinners";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { UpgradePopup } from "@/components/upgrade-popup";
import "@/styles.css";
import { cn } from "@/lib/utils";

const montserratP = Montserrat({
  weight: "600",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "800",
  subsets: ["latin"],
});

const Chatbot = () => {
  const [inputMessage, setInputMessage] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>("Loading...");
  const [openUpgradeDialog, setOpenUpgradeDialog] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState([
    {
      content: "Hi, how can I help you? I am a virtual assistant here to help you with any financial or budgeting questions you have.",
      role: "assistant",
    },
  ]);
  const { isLoaded, isSignedIn, user } = useUser();
  const userId = user?.id;
  const [isLoading, setIsLoading] = useState(false);
  const [isClearLoading, setIsClearLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false);
  const [allowAccess, setAllowAccess] = useState(false);
  const [streamingText, setStreamingText] = useState("");

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const changeAccessValue = async () => {
    await fetch('/api/chat-access/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, allowAccess: !allowAccess }),
    });
    setAllowAccess(!allowAccess);
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, streamingText]);

  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      if (userId) {
        try {
          const response = await fetch(`/api/subscription-status?userId=${userId}`)
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

    const fetchAllowAccessStatus = async () => {
      if (userId) {
        try {
          const response = await fetch(`/api/chat-access/status`)
            .then(response => response.json())
            .then(async (data) => {
              setAllowAccess(data.status);
            });
        } catch (error) {
          console.error("Error fetching chat access status:", error);
        }
      }
    };
    fetchAllowAccessStatus();
  }, [userId]);

  const fetchChatHistory = useCallback(async (userId: string) => {
    try {
      const history = await historyAPI(userId);
      setChatHistory((prevHistory) => [
        prevHistory[0], // Preserve initial greeting message
        ...history.map((message) => ({
          content: message.content,
          role: message.role,
        })),
      ]);
    } catch (error) {
      console.error("Error fetching chat history:", error);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn && userId) {
      fetchChatHistory(userId);
    }
  }, [isLoaded, isSignedIn, userId, fetchChatHistory]);

  const handleSendMessage = async () => {
    if (inputMessage.trim() !== "") {
      setInputMessage("");
      setIsLoading(true);
      setChatHistory((prevHistory) => [
        ...prevHistory,
        { content: inputMessage, role: "user" },
      ]);

      if (userId) {
        try {
          const response = await chatAPI(userId, inputMessage, allowAccess, true);
          if (response instanceof ReadableStream) {
            let accumulatedText = "";
            const reader = response.getReader();
            reader.read().then(function processText({ done, value }) {
              if (done) {
                // Full response processed, update chat history
                setChatHistory((prevHistory) => [
                  ...prevHistory,
                  { content: accumulatedText, role: "assistant" },
                ]);
                setStreamingText(""); // Reset streaming text
                setIsLoading(false);
                return;
              }

              const textChunk = new TextDecoder().decode(value, { stream: true });
              accumulatedText += textChunk;
              setStreamingText((prevText) => prevText + textChunk); // Live update
              reader.read().then(processText);
            });
          } else {
            setChatHistory((prevHistory) => [
              ...prevHistory,
              { content: "Unexpected response format.", role: "assistant" },
            ]);
            setIsLoading(false);
          }
        } catch (error) {
          console.error("Error sending message:", error);
          setChatHistory((prevHistory) => [
            ...prevHistory,
            { content: "Sorry, there was an error processing your request.", role: "assistant" },
          ]);
          setIsLoading(false);
        }
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearHistoryConfirmed = async () => {
    setIsAlertDialogOpen(false);
    setIsClearLoading(true);
    if (userId) {
      try {
        await clearChatHistoryAPI(userId);
        setChatHistory([
          {
            content: "Hi, how can I help you? I am a virtual assistant here to help you with any financial or budgeting questions you have.",
            role: "assistant",
          },
        ]);
        fetchChatHistory(userId);
      } catch (error) {
        console.error("Error clearing chat history:", error);
      } finally {
        setIsClearLoading(false);
        window.location.reload();
      }
    }
  };

  return (
    <div className={cn("relative flex flex-col h-full w-full lg:w-[80%] lg:ml-[10%] -mt-5 lg:-mt-20 pb-[100px]", montserratP.className)}>
      <div className="flex flex-col flex-grow rounded-2xl bg-gradient-to-b from-gray-50 to-white">
        <div className="sticky top-[92px] bg-gray-50 p-4 rounded-2xl z-50">
          <div className="sticky bg-white w-full h-[110px] p-4 border-b-2 border-x-2 rounded-xl lg:rounded-b-xl">
            <h1 className="md:w-auto w-full text-center text-xl font-semibold">Ask Me Anything</h1>
            <div className="w-full flex flex-col lg:flex-row justify-center items-center lg:space-x-4 -space-y-4 text-xs lg:text-inherit lg:space-y-0 lg:mt-2">
              <Button disabled={subscriptionStatus === "Free" || subscriptionStatus === "Loading..."} onClick={changeAccessValue} className="text-blue-600 hover:bg-transparent hover:text-blue-400" variant="ghost">
                {allowAccess ? "Remove Transaction Knowledge" : "Allow Transaction Knowledge"}
              </Button>
              <Button disabled={subscriptionStatus === "Free" || subscriptionStatus === "Loading..."} onClick={() => setIsAlertDialogOpen(true)} className="bg-transparent text-red-500 rounded-md hover:text-red-300 hover:bg-transparent">
                Clear History
              </Button>
            </div>
          </div>

          <AlertDialog open={isAlertDialogOpen} onOpenChange={setIsAlertDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently clear your chat history from our servers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <div className="w-full flex justify-between lg:mx-[20%]">
                  <AlertDialogCancel asChild>
                    <Button variant="outline">Cancel</Button>
                  </AlertDialogCancel>
                  <AlertDialogAction asChild onClick={handleClearHistoryConfirmed}>
                    <Button className="text-white bg-red-500 hover:bg-red-500 hover:opacity-90" variant="destructive">Clear History</Button>
                  </AlertDialogAction>
                </div>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div className="flex flex-col flex-grow overflow-y-auto p-4">
          <div className="chat-messages-container">
            {chatHistory.map((item, index) => {
              const isAssistant = item.role === "assistant";
              return (
                <div key={`message-${index}`} className={`mb-4 flex ${isAssistant ? "justify-start" : "justify-end"}`}>
                  <div className={`chat-message p-2 shadow-md rounded-lg ${isAssistant ? "bg-gray-200 text-gray-800" : "bg-gradient-to-br from-blue-500 to-purple-500 text-white"} max-w-[65%]`}>
                    <ReactMarkdown
                      remarkPlugins={[gfm]}
                      rehypePlugins={[rehypeRaw as unknown as any]}
                    >
                      {item.content.replace(/^"|"$/g, '').replace(/\\n/g, '\n')}
                    </ReactMarkdown>
                  </div>
                </div>
              );
            })}
            {streamingText && (
              <div className="message assistant">
                <ReactMarkdown remarkPlugins={[gfm]} rehypePlugins={[rehypeRaw]}>
                  {streamingText}
                </ReactMarkdown>
              </div>
            )}
          </div>
          {isLoading && (
            <div className="flex p-2 rounded-lg">
              <BeatLoader color="#8A2BE2" margin={3} size={25} speedMultiplier={0.75} />
            </div>
          )}
          {isClearLoading && (
            <div className="flex p-2 rounded-lg">
              <ReactMarkdown>Clearing chat history...</ReactMarkdown>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      <div className="p-4 pb-10 fixed bottom-0 rounded-t-2xl full-width-minus bg-white border-t border-gray-300">
        <div className="flex">
          <textarea
            disabled={(subscriptionStatus === "Free" || subscriptionStatus === "Loading..." || !isLoaded || isClearLoading)}
            className="flex-grow border border-gray-300 rounded-md p-2 mr-2 resize-none focus:border-blue-500 focus:outline-none text-sm lg:text-[16px]"
            placeholder="Type your message here..."
            rows={1}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyPress}
          />
          <Button
            disabled={(subscriptionStatus === "Free" || subscriptionStatus === "Loading..." || !isLoaded || isClearLoading)}
            onClick={handleSendMessage}
            className="bg-gradient-to-br from-blue-500 to-purple-500 text-white rounded-r-md p-2 lg:w-[100px] text-sm lg:text-[16px] hover:bg-blue-400">
            Send
          </Button>
        </div>
      </div>
      {(subscriptionStatus === "Free" || subscriptionStatus === "Loading..." || !isLoaded || isClearLoading) && (
        <div className="fixed inset-0 backdrop-blur-sm bg-white/70 z-20 flex min-h-[600px] lg:min-h-[700px] items-center justify-center">
          {(subscriptionStatus !== "Loading..." && !isClearLoading) && (
            <Button onClick={() => setOpenUpgradeDialog(true)} className="bg-gradient-to-br from-blue-500 to-purple-500 hover:scale-105 transition-all z-30 shadow-sm font-bold text-md hover:shadow-md shadow-gray-500">
              Upgrade to Link Premium
            </Button>
          )}
        </div>
      )}

      {(subscriptionStatus === "Free" && isLoaded) && (
        <UpgradePopup open={openUpgradeDialog} onOpenChange={setOpenUpgradeDialog} />
      )}
    </div>
  );
};

export default Chatbot;
