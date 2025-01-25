"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

const ComingSoon = (url: string) => {
    const router = useRouter();
    return (
        <div className="w-full text-center">
            <p className="mt-20 bg-orange-500 text-white rounded-full p-2">Under construction...</p>
            <div className="w-[50%] ml-[25%] mt-10">
                <Button
                    variant="ghost"
                    className="flex items-center gap-2 text-gray-800 border shadow-sm rounded-lg text-sm w-full"
                    onClick={() => router.push(url)}
                >
                    <ArrowLeft className="h-4 w-4" /> Back
                </Button>
            </div>
        </div>
    )
};

export default ComingSoon;