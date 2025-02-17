"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Montserrat } from "next/font/google";
import { Button } from "@/components/ui/button";
import { HeaderLanding } from "@/components/header-landing";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import "@/styles.css"

// Fonts
const montserratP = Montserrat({
  weight: "500",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "700",
  subsets: ["latin"],
});

export default function LandingPage() {
  const { user } = useUser();
  const router = useRouter();

  return (
    <div className={cn("relative min-h-screen", montserratP.className)}>
      {/* 
        Background shapes / blur effect 
        (Use absolute-positioned divs or your own CSS classes to create 
         blurred shapes reminiscent of Symph.ai’s style.)
      */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {/* Example blurred shape */}
        <div className="absolute -top-32 left-32 w-[200px] h-[400px] md:w-[400px] md:h-[700px] -rotate-[40deg] bg-blue-400 opacity-30 rounded-full filter blur-3xl" />
        <div className="absolute top-[300px] right-0 w-[200px] h-[400px] md:w-[400px] md:h-[800px] rotate-[45deg] bg-blue-400 opacity-30 rounded-full filter blur-3xl overflow-hidden" />
        <div className="absolute top-[40%] left-10 w-[200px] h-[400px] md:w-[400px] md:h-[400px] bg-purple-400 opacity-30 rounded-full filter blur-3xl" />
        <div className="absolute bottom-[10px] left-[100px] w-[200px] h-[400px] md:w-[400px] md:h-[400px] bg-purple-400 opacity-30 rounded-full filter blur-3xl" />
        <div className="absolute top-0 right-[45%] w-[200px] h-[400px] md:w-[300px] md:h-[500px] bg-purple-400 opacity-30 rounded-full filter blur-3xl" />
      </div>

      <HeaderLanding />

      {/* Main content container */}
      <main className="relative z-10">
        {/* Hero Section */}
        <section className="w-full pt-5 pb-12 px-6 text-center flex flex-col items-center">
          <img src="/Link_Logo_Simple_Outline.png" height={150} width={150} />
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className={cn(
              "mt-6 text-4xl sm:text-5xl font-bold text-gray-800",
              montserratH.className
            )}
          >
            Manage Your Finances With Ease
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-4 text-lg sm:text-xl text-gray-600 max-w-2xl"
          >
            Link gives you the power to track spending, create budgets, and stay
            on top of your financial goals—all in one intuitive dashboard.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-8"
          >
            <Button
              onClick={() =>
                user ? router.push("/overview") : router.push("/sign-up")
              }
              className="px-8 py-4 text-md rounded-full bg-blue-600 text-white hover:bg-blue-700"
            >
              {user ? "Go to Dashboard" : "Get Started Free"}
            </Button>
          </motion.div>
        </section>

        {/* Looping Video Section */}
        <section className="w-full px-6 mb-12 flex justify-center">
          <div className="w-full max-w-[90%] md:max-w-[80%] lg:max-w-[70%]">
            <video
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-auto rounded-[25px] lg:rounded-[50px] border-4 border-gray-300"
            >
              <source src="/Link_Demo.mp4" type="video/mp4" />
              {/* Fallback text for older browsers */}
              Your browser does not support the video tag.
            </video>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="w-full pt-36 py-12 px-6">
          <div className="mx-auto max-w-5xl text-center mb-10">
            <h2
              className={cn(
                "text-3xl sm:text-4xl font-bold text-gray-800 mb-4",
                montserratH.className
              )}
            >
              Key Features
            </h2>
            <p className="text-gray-600 max-w-3xl mx-auto">
              From manual tracking to automated syncing, Link supports your
              budgeting style—whether you want total control or streamlined
              convenience.
            </p>
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Feature 1: Full Analytic Dashboard */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-white rounded-xl shadow-md p-6 text-left"
            >
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                Full Analytic Dashboard
              </h3>
              <p className="text-gray-600">
                Start for free and see your finances come to life.
                Perfect for those who want to be hands-on and track every detail.
              </p>
            </motion.div>

            {/* Feature 2: Transaction Tracking */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-white rounded-xl shadow-md p-6 text-left"
            >
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                Transaction Tracking
              </h3>
              <p className="text-gray-600">
                Keep tabs on your spending by logging transactions, assigning
                categories, and monitoring cash flow across all your accounts.
              </p>
            </motion.div>

            {/* Feature 3: Budget Creation */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-white rounded-xl shadow-md p-6 text-left"
            >
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                Budget Creation
              </h3>
              <p className="text-gray-600">
                Create and customize budgets to match your goals—track your
                progress and stay on target every month.
              </p>
            </motion.div>

            {/* Feature 4: Automatic Account Linking (Premium) */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-white rounded-xl shadow-md p-6 text-left"
            >
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                Automatic Account Linking
              </h3>
              <p className="text-gray-600">
                Upgrade to Premium to securely connect your bank accounts and
                have transactions automatically imported and categorized for you.
              </p>
            </motion.div>

            {/* Feature 5: Automatic Categorization (Premium) */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-white rounded-xl shadow-md p-6 text-left"
            >
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                Automatic Categorization
              </h3>
              <p className="text-gray-600">
                Save time with auto-categorized transactions—always know exactly
                where your money goes, without the manual work.
              </p>
            </motion.div>

            {/* Feature 6: Alerts & Notifications (Premium) */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-white rounded-xl shadow-md p-6 text-left"
            >
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                Email Notifications
              </h3>
              <p className="text-gray-600">
                Get notified when you’re nearing budget limits or when new
                transactions post—so you never miss a beat.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="w-full pt-36 py-12 px-6 bg-gray-50">
          <div className="mx-auto max-w-4xl text-center mb-10">
            <h2
              className={cn(
                "text-3xl sm:text-4xl font-bold text-gray-800 mb-4",
                montserratH.className
              )}
            >
              Simple, Transparent Pricing
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Whether you’re just starting or want a fully automated budgeting system, we have a plan for you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {/* Free Plan */}
            <div className="bg-white rounded-xl shadow-md p-6 flex flex-col">
              <h3 className="text-xl font-semibold text-gray-800">Free</h3>
              <p className="text-3xl font-bold text-gray-800 mt-4">$0</p>
              <p className="text-gray-500 mb-6">forever</p>
              <ul className="text-left text-gray-600 flex-grow">
                <li className="mb-2 flex items-center">
                  <span className="text-green-500 mr-2">✔</span>
                  Manual account creation
                </li>
                <li className="mb-2 flex items-center">
                  <span className="text-green-500 mr-2">✔</span>
                  Manual transaction tracking
                </li>
                <li className="mb-2 flex items-center">
                  <span className="text-green-500 mr-2">✔</span>
                  Manual category creation
                </li>
                <li className="mb-2 flex items-center">
                  <span className="text-green-500 mr-2">✔</span>
                  Budget creation
                </li>
                <li className="mb-2 flex items-center">
                  <span className="text-green-500 mr-2">✔</span>
                  Full dashboard
                </li>
              </ul>
              <Button
                onClick={() =>
                  user ? router.push("/overview") : router.push("/sign-up")
                }
                className={`mt-4 w-full ${
                  user
                    ? "text-white bg-blue-600 hover:bg-blue-700"
                    : "bg-white hover:bg-gray-100 text-black border"
                }`}
              >
                {user ? "Go to Dashboard" : "Get Started"}
              </Button>
            </div>

            {/* Premium Monthly */}
            <div className="bg-white rounded-xl shadow-md p-6 flex flex-col">
              <h3 className="text-xl font-semibold text-gray-800">
                Premium (Monthly)
              </h3>
              <p className="text-3xl font-bold text-gray-800 mt-4">$7.90</p>
              <p className="text-gray-500 mb-6">per month</p>
              <ul className="text-left text-gray-600 flex-grow">
                <li className="mb-2 flex items-center">
                  <span className="text-green-500 mr-2">✔</span>
                  Automatic account linking
                </li>
                <li className="mb-2 flex items-center">
                  <span className="text-green-500 mr-2">✔</span>
                  Automatic transaction syncing
                </li>
                <li className="mb-2 flex items-center">
                  <span className="text-green-500 mr-2">✔</span>
                  Automatic categorization
                </li>
                <li className="mb-2 flex items-center">
                  <span className="text-green-500 mr-2">✔</span>
                  Full dashboard &amp; budgets
                </li>
                <li className="mb-2 flex items-center">
                  <span className="text-green-500 mr-2">✔</span>
                  Email alerts &amp; notifications
                </li>
              </ul>
              <Button
                onClick={() =>
                  user ? router.push("/overview") : router.push("/sign-up")
                }
                className={`mt-4 w-full ${
                  user
                    ? "text-white bg-blue-600 hover:bg-blue-700"
                    : "bg-white hover:bg-gray-100 text-black border"
                }`}
              >
                {user ? "Go to Dashboard" : "Upgrade"}
              </Button>
            </div>

            {/* Premium Yearly */}
            <div className="bg-white rounded-xl shadow-md p-6 flex flex-col">
              <h3 className="text-xl font-semibold text-gray-800">
                Premium (Yearly)
              </h3>
              <p className="text-3xl font-bold text-gray-800 mt-4">$79</p>
              <p className="text-gray-500 mb-6">per year</p>
              <ul className="text-left text-gray-600 flex-grow">
                <li className="mb-2 flex items-center">
                  <span className="text-green-500 mr-2">✔</span>
                  Automatic account linking
                </li>
                <li className="mb-2 flex items-center">
                  <span className="text-green-500 mr-2">✔</span>
                  Automatic transaction syncing
                </li>
                <li className="mb-2 flex items-center">
                  <span className="text-green-500 mr-2">✔</span>
                  Automatic categorization
                </li>
                <li className="mb-2 flex items-center">
                  <span className="text-green-500 mr-2">✔</span>
                  Full dashboard &amp; budgets
                </li>
                <li className="mb-2 flex items-center">
                  <span className="text-green-500 mr-2">✔</span>
                  Email alerts &amp; notifications
                </li>
              </ul>
              <Button
                onClick={() =>
                  user ? router.push("/overview") : router.push("/sign-up")
                }
                className={`mt-4 w-full ${
                  user
                    ? "text-white bg-blue-600 hover:bg-blue-700"
                    : "bg-gradient-to-br from-blue-500 to-purple-500 text-white hover:opacity-80 transition-all"
                }`}
              >
                {user ? "Go to Dashboard" : "Upgrade"}
              </Button>
            </div>

            {/* Premium Lifetime */}
            <div className="bg-white rounded-xl shadow-md p-6 flex flex-col">
              <h3 className="text-xl font-semibold text-gray-800">
                Premium (Lifetime)
              </h3>
              <p className="text-3xl font-bold text-gray-800 mt-4">$395</p>
              <p className="text-gray-500 mb-6">one-time</p>
              <ul className="text-left text-gray-600 flex-grow">
                <li className="mb-2 flex items-center">
                  <span className="text-green-500 mr-2">✔</span>
                  All Premium features forever
                </li>
                <li className="mb-2 flex items-center">
                  <span className="text-green-500 mr-2">✔</span>
                  No monthly or yearly fees
                </li>
              </ul>
              <Button
                onClick={() =>
                  user ? router.push("/overview") : router.push("/sign-up")
                }
                className={`mt-4 w-full ${
                  user
                    ? "text-white bg-blue-600 hover:bg-blue-700"
                    : "bg-white hover:bg-gray-100 text-black border"
                }`}
              >
                {user ? "Go to Dashboard" : "Upgrade"}
              </Button>
            </div>
          </div>
        </section>

        {/* FAQ Section (optional) */}
        <section id="faq" className="w-full pt-36 py-12 px-6">
          <div className="mx-auto max-w-3xl text-center mb-8">
            <h2
              className={cn(
                "text-3xl font-bold text-gray-800 mb-4",
                montserratH.className
              )}
            >
              Frequently Asked Questions
            </h2>
            <p className="text-gray-600">
              Still have questions? Here are answers to some of the most common
              ones.
            </p>
          </div>

          <div className="max-w-3xl mx-auto text-left">
            <Accordion type="single" collapsible>
              <AccordionItem value="item-1">
                <AccordionTrigger className="text-lg text-left p-4 rounded-2xl my-2 bg-white shadow-sm border hover:no-underline hover:bg-gray-100">
                  How do I manually track my transactions?
                </AccordionTrigger>
                <AccordionContent className="px-4 pt-4 mb-2 rounded-lg text-md bg-white shadow-inner">
                  You can add transactions from the dashboard by selecting the
                  relevant account, date, amount, and category. It’s quick and
                  straightforward to keep everything up to date.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger className="text-lg text-left p-4 rounded-2xl my-2 bg-white shadow-sm border hover:no-underline hover:bg-gray-100">
                  What happens when I upgrade to Premium?
                </AccordionTrigger>
                <AccordionContent className="px-4 pt-4 mb-2 rounded-lg text-md bg-white shadow-inner">
                  You unlock automatic account linking, transaction syncing,
                  automatic categorization, and email notifications—so you can
                  spend less time updating and more time analyzing your finances.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger className="text-lg text-left p-4 rounded-2xl my-2 bg-white shadow-sm border hover:no-underline hover:bg-gray-100">
                  Can I switch between Premium plans?
                </AccordionTrigger>
                <AccordionContent className="px-4 pt-4 mb-2 rounded-lg text-md bg-white shadow-inner">
                  Yes. If you start monthly, you can switch to yearly or
                  lifetime anytime to save money in the long run.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-4">
                <AccordionTrigger className="text-lg text-left p-4 rounded-2xl my-2 bg-white shadow-sm border hover:no-underline hover:bg-gray-100">
                  Is my financial data secure?
                </AccordionTrigger>
                <AccordionContent className="px-4 pt-4 mb-2 rounded-lg text-md bg-white shadow-inner">
                  Absolutely. We use modern encryption standards and never store
                  your bank credentials on our servers. Your security is our
                  top priority.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full py-6 px-6 text-center text-sm text-gray-500 bg-white border-t border-gray-200">
        <p>© {new Date().getFullYear()} Link Budgeting Tool. All rights reserved.</p>
      </footer>
    </div>
  );
}
