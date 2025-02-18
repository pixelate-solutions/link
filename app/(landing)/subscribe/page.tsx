"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { ColorRing } from "react-loader-spinner";
import { Typewriter } from "react-simple-typewriter";

const SubscribePage = () => {
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const priceId = searchParams.get("priceId") ?? undefined;

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const publishableKey =
    process.env.NEXT_PUBLIC_TEST_OR_LIVE === "TEST"
      ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_TEST_KEY
      : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  // If the user cancels, return them home.
  const handleCancel = () => {
    router.push("/");
  };

  useEffect(() => {
    const createCheckoutSession = async () => {
      // Redirect to sign in if not authenticated.
      if (!user) {
        router.push(
          `/sign-in?redirect_url=/subscribe${priceId ? `?priceId=${priceId}` : ""}`
        );
        return;
      }
      // If priceId is missing, show error.
      if (!priceId) {
        setError("Missing subscription option. Please try again.");
        setLoading(false);
        return;
      }
      try {
        const response = await fetch("/api/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            customerEmail: user.primaryEmailAddress?.emailAddress,
            priceId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to create checkout session.");
        }

        const { sessionId } = await response.json();

        const stripePromise = loadStripe(publishableKey!);
        const stripe = await stripePromise;
        if (stripe && sessionId) {
          const { error } = await stripe.redirectToCheckout({ sessionId });
          if (error) {
            console.error("Stripe checkout error:", error);
            setError(error.message || "Stripe checkout error");
            setLoading(false);
          }
        } else {
          throw new Error("Stripe object or session ID is missing.");
        }
      } catch (err: any) {
        console.error("Error creating checkout session:", err);
        setError(err.message || "An unknown error occurred.");
        setLoading(false);
      }
    };

    createCheckoutSession();
  }, [user, priceId, router]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-white flex items-center justify-center p-8">
      <div className="absolute inset-0 z-0 overflow-hidden">
        {/* Example blurred shapes */}
        <div className="absolute -top-32 left-32 w-[200px] h-[400px] md:w-[400px] md:h-[700px] -rotate-[40deg] bg-blue-400 opacity-30 rounded-full filter blur-3xl" />
        <div className="absolute top-[300px] right-0 w-[200px] h-[400px] md:w-[400px] md:h-[800px] rotate-[45deg] bg-blue-400 opacity-30 rounded-full filter blur-3xl overflow-hidden" />
        <div className="absolute top-[40%] left-10 w-[200px] h-[400px] md:w-[400px] md:h-[400px] bg-purple-400 opacity-30 rounded-full filter blur-3xl" />
        <div className="absolute bottom-[10px] left-[100px] w-[200px] h-[400px] md:w-[400px] md:h-[400px] bg-purple-400 opacity-30 rounded-full filter blur-3xl" />
        <div className="absolute top-0 right-[45%] w-[200px] h-[400px] md:w-[300px] md:h-[500px] bg-purple-400 opacity-30 rounded-full filter blur-3xl" />
      </div>
      {/* Dynamic background shapes */}
      <div className="absolute inset-0">
        <div className="absolute -top-20 -left-20 w-80 h-80 bg-blue-500 opacity-20 rounded-full mix-blend-lighten filter blur-3xl animate-blob"></div>
        <div className="absolute top-1/3 -right-20 w-96 h-96 bg-purple-500 opacity-20 rounded-full mix-blend-lighten filter blur-3xl animate-blob animation-delay-2000"></div>
      </div>

      <Card className="relative z-10 w-full max-w-lg bg-white shadow-2xl rounded-xl overflow-hidden">
        <CardHeader className="flex justify-between items-center bg-white border p-6">
          <CardTitle className="text-2xl font-bold text-white">Link Premium</CardTitle>
        </CardHeader>
        <CardContent className="p-8 flex flex-col items-center space-y-6">
          {loading && (
            <div className="flex flex-col items-center animate-fadeIn">
              <div className="text-gray-800 text-lg font-medium">
                <Typewriter
                  words={[
                    "Loading checkout page...",
                    "Preparing secure payment...",
                    "Almost there..."
                  ]}
                  loop={true}
                  cursor
                  cursorStyle="|"
                  typeSpeed={70}
                  deleteSpeed={50}
                  delaySpeed={1500}
                />
              </div>
              <div className="mt-4">
                <ColorRing
                  visible={true}
                  height="80"
                  width="80"
                  ariaLabel="color-ring-loading"
                  wrapperStyle={{}}
                  wrapperClass="color-ring-wrapper"
                  colors={["#3B82F6", "#8B5CF6", "#A78BFA", "#C4B5FD", "#E0E7FF"]}
                />
              </div>
            </div>
          )}
          {error && (
            <div className="text-center animate-fadeIn">
              <p className="text-red-600 text-lg font-semibold">{error}</p>
              <Button
                onClick={handleCancel}
                className="mt-4 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg"
              >
                Cancel and Return Home
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Global styles for animations */}
      <style jsx global>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 8s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 1.5s ease-out;
        }
      `}</style>
    </div>
  );
};

export default SubscribePage;
