"use client";

import { cn } from "@/lib/utils";
import { Montserrat } from "next/font/google";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const montserratP = Montserrat({
  weight: "500",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "800",
  subsets: ["latin"],
});

const LogicPage = () => {
  return (
    <div className="min-h-screen">
      <div className="sticky top-[137px] -mt-[130px] bg-gradient-to-br from-blue-200 to-purple-200 border-white lg:w-[74%] lg:ml-[13%] h-[100px] rounded-t-2xl z-50">
        <p className={cn("text-4xl w-full text-center h-full pt-6", montserratH.className)}>Link Logic</p>
          </div>
          <Tabs defaultValue="main" className="lg:w-[74%] lg:ml-[13%]">
          <TabsList className="sticky top-[220px] flex lg:w-full border border-gray-300 rounded-md mt-[130px] mb-[30px] lg:mt-[60px] lg:mb-[30px] z-50 mx-2 lg:mx-0">
            <TabsTrigger value="goals" className="w-1/3 text-center">Goals</TabsTrigger>
            <TabsTrigger value="main" className="w-1/3 text-center">Main</TabsTrigger>
            <TabsTrigger value="chat" className="w-1/3 text-center">Chat</TabsTrigger>
          </TabsList>
            <div className="bg-gradient-to-br bg-white card lg:ml-[13%] lg:mr-[13%] h-[200px] rounded-b-2xl mx-2">

                <TabsContent value="goals" className="mt-4">Your goals content goes here.</TabsContent>
                <TabsContent value="main" className="mt-4">Main content for Link Logic goes here.</TabsContent>
                <TabsContent value="chat" className="mt-4">Chat content goes here.</TabsContent>
                
            </div>
          </Tabs>
    </div>
  );
};

export default LogicPage;
