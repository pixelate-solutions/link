"use client";

import { HeaderLanding } from "@/components/header-landing";
import { Button } from "@/components/ui/button";
import { ArrowDown } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { motion, useAnimation, useInView } from "framer-motion";
import "@/styles.css";
import { HeaderLogoLarge } from "@/components/header-logo-large";
import { useUser } from "@clerk/nextjs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useRouter } from "next/navigation";
import { Montserrat } from "next/font/google";
import { cn } from "@/lib/utils";

const montserratP = Montserrat({
  weight: "600",
  subsets: ["latin"],
});

const montserratH = Montserrat({
  weight: "800",
  subsets: ["latin"],
});

const LandingPage = () => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [hasScrolledDown, setHasScrolledDown] = useState(false);
  const [showBoth, setShowBoth] = useState(false);
  const router = useRouter();

  const { user, isLoaded } = useUser();

  const scrollToContent = () => {
    if (contentRef.current) {
      window.scrollTo({
        top: contentRef.current.offsetTop,
        behavior: "smooth",
      });
      setHasScrolledDown(true);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "instant",
    });
  };

  const PricingSection = () => {
    const freePlanRef = useRef(null);
    const isFreePlanInView = useInView(freePlanRef, { once: true });

    const monthlyPlanRef = useRef(null);
    const isMonthlyPlanInView = useInView(monthlyPlanRef, { once: true });

    const yearlyPlanRef = useRef(null);
    const isYearlyPlanInView = useInView(yearlyPlanRef, { once: true });

    const lifetimePlanRef = useRef(null);
    const isLifetimePlanInView = useInView(lifetimePlanRef, { once: true });

    return (
      <motion.section className="px-4 py-12 pt-32 text-center" id="pricing">
        <div className="bg-white w-[90%] ml-[5%] lg:w-[60%] lg:ml-[20%] py-6 px-6 lg:px-[150px] xl:px-[200px] rounded-2xl mb-12 z-50">
          <h2 className="text-3xl font-bold mb-6 text-gray-800">Transparent Pricing</h2>
          <p className="text-gray-600">
            Choose the plan that fits your needs and start managing your finances effortlessly.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12 mx-auto">
          {/* Mockup Images (only visible on lg or larger screens) */}
          <div className="hidden lg:flex justify-center items-center ml-[100px] xl:ml-[150px] -mt-[100px]">
            <img
              src="/OverviewMockUp.png"
              alt="Overview Mock Up"
              className="w-full h-auto max-w-[300px] lg:max-w-[300px]"
            />
          </div>

          {/* Free Plan */}
          <motion.div
            ref={freePlanRef}
            initial={{ scale: 0.25 }}
            animate={{ scale: isFreePlanInView ? 1 : 0.25 }}
            transition={{ duration: 0.5 }}
            className="bg-white shadow-lg rounded-lg p-6 hover:shadow-xl transition-shadow duration-300 border border-gray-200 w-full max-w-md mx-auto flex flex-col justify-between"
          >
            <h3 className="text-xl font-semibold text-gray-800">Free Plan</h3>
            <p className="text-gray-600 text-4xl font-bold my-4">$0</p>
            <p className="text-gray-600 mb-4">/month</p>
            <ul className="text-gray-600 text-left mb-6 flex-grow">
              <li className="mb-2">✔ Fully functional budgeting app</li>
              <li className="mb-2">✔ Track expenses and income</li>
              <li className="mb-2">✔ Set budgets</li>
              <li className="mb-2">✖ Link bank accounts</li>
              <li className="mb-2">✖ Chat with Virtual Assistant</li>
            </ul>
            <Button className="mt-auto w-full bg-gray-200 text-gray-700 hover:bg-gray-100 hover:scale-105 transition-all">
              Get Started
            </Button>
          </motion.div>

          {/* Mockup Images (only visible on lg or larger screens) */}
          <div className="hidden lg:flex justify-center items-center mr-[100px] xl:mr-[150px] -mt-[100px]">
            <img
              src="/ChatMockUp.png"
              alt="Chat Mock Up"
              className="w-full h-auto max-w-[300px] lg:max-w-[300px]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {/* Monthly Plan */}
          <motion.div
            ref={monthlyPlanRef}
            initial={{ scale: 0.25 }}
            animate={{ scale: isMonthlyPlanInView ? 1 : 0.25 }}
            transition={{ duration: 0.5 }}
            className="bg-white shadow-lg rounded-lg p-6 hover:shadow-xl transition-shadow duration-300 w-full max-w-md mx-auto flex flex-col justify-between"
          >
            <h3 className="text-xl font-semibold text-gray-800">Monthly Plan</h3>
            <p className="text-gray-600 text-4xl font-bold my-4">$9.90</p>
            <p className="text-gray-600 mb-4">/month</p>
            <ul className="text-gray-600 text-left mb-6 flex-grow">
              <li className="mb-2">✔ Everything in Free Plan</li>
              <li className="mb-2">✔ Link bank accounts</li>
              <li className="mb-2">✔ Chat with Virtual Assistant</li>
              <li className="mb-2">✔ Bulk-Upload Transactions</li>
            </ul>
            <Button onClick={() => {router.push(`${user ? "/overview" : "/settings"}`)}} className="mt-auto w-full bg-gray-200 text-gray-700 hover:bg-gray-100 hover:scale-105 transition-all">
              Upgrade
            </Button>
          </motion.div>

          {/* Yearly Plan */}
          <motion.div
            ref={yearlyPlanRef}
            initial={{ scale: 0.25 }}
            animate={{ scale: isYearlyPlanInView ? 1 : 0.25 }}
            transition={{ duration: 0.5 }}
            className="bg-gradient-to-br from-blue-500 to-purple-500 text-white shadow-lg rounded-lg p-6 hover:shadow-xl transition-shadow duration-300 border border-gray-200 w-full max-w-md mx-auto flex flex-col justify-between"
          >
            <h3 className="text-xl font-semibold">Yearly Plan</h3>
            <p className="text-4xl font-bold my-4">$99.00</p>
            <p className="mb-4">/year</p>
            <ul className="text-left mb-6 flex-grow">
              <li className="mb-2">✔ Everything in Free Plan</li>
              <li className="mb-2">✔ Link bank accounts</li>
              <li className="mb-2">✔ Chat with Virtual Assistant</li>
              <li className="mb-2">✔ Bulk-Upload Transactions</li>
            </ul>
            <Button onClick={() => {router.push(`${user ? "/overview" : "/settings"}`)}} className="mt-auto w-full bg-white text-blue-500 hover:bg-gray-100 hover:scale-105 transition-all">
              Upgrade
            </Button>
          </motion.div>

          {/* Lifetime Plan */}
          <motion.div
            ref={lifetimePlanRef}
            initial={{ scale: 0.25 }}
            animate={{ scale: isLifetimePlanInView ? 1 : 0.25 }}
            transition={{ duration: 0.5 }}
            className="bg-white shadow-lg rounded-lg p-6 hover:shadow-xl transition-shadow duration-300 w-full max-w-md mx-auto flex flex-col justify-between"
          >
            <h3 className="text-xl font-semibold text-gray-800">Lifetime Plan</h3>
            <p className="text-gray-600 text-4xl font-bold my-4">$295.00</p>
            <p className="text-gray-600 mb-4">One-time payment</p>
            <ul className="text-gray-600 text-left mb-6 flex-grow">
              <li className="mb-2">✔ Lifetime access to all features</li>
              <li className="mb-2">✔ No renewal fees</li>
            </ul>
            <Button onClick={() => {router.push(`${user ? "/overview" : "/settings"}`)}} className="mt-auto w-full bg-gray-200 text-gray-700 hover:bg-gray-100 hover:scale-105 transition-all">
              Upgrade
            </Button>
          </motion.div>
        </div>
      </motion.section>
    );
  };

  const InfiniteScrollComponent = () => {
    const images = [
      "/OverviewTop.png",
      "/Categories.png",
      "/Transactions.png",
      "/ConnectedAccounts.png",
      "/Chat.png",
    ];

    const controls = useAnimation();

    useEffect(() => {
      // Ensure animation is called after the component mounts
      controls.start({
        x: ["0%", "-50%", "-100%"], // Adjust for smooth scrolling and looping
        opacity: [0, 1], // Start from opacity 0 and transition to 1
        transition: {
          x: {
            duration: images.length * 4, // Control speed based on number of images
            ease: "linear",
            repeat: Infinity, // Loop forever
          },
          opacity: {
            duration: 0.6, // Opacity transition duration
            ease: "linear", // Smooth easing for opacity
            delay: 0.7, // Delay before opacity animation starts
          },
        },
      });
    }, [controls, images.length]);

    return (
      <div className="overflow-hidden w-[90%] md:w-[70%] sm:w-[80%] rounded-2xl relative -mt-[250px] sm:-mt-[370px] mb-[25px] fade-div px-2">
        <motion.div
          initial={{ opacity: 0 }} // Start with opacity 0
          animate={controls} // Attach controls for smooth scrolling
          className="flex bg-white"
          style={{ width: `${images.length * 50}%` }} // Display multiple images at once
        >
          {images.concat(images).map((src, index) => ( // Duplicate images for continuous scrolling
            <div key={index} className="flex-none mx-5 bg-white pb-2">
              <img
                className="rounded-2xl shadow-md h-[400px] shadow-gray-400"
                src={src}
                alt={`${src.slice(1, -4)}`} // Use the image src for alt text
              />
            </div>
          ))}
        </motion.div>
      </div>
    );
  };

  {/* Feature Section */}
  function FeaturesSection() {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true });

    return (
      <section id="features" className="py-16 pt-32 px-4 bg-white w-[90%] ml-[5%]" ref={ref}>
        {/* Main heading and subtitle */}
        <motion.div
          className="text-center max-w-2xl mx-auto mb-12"
          initial={{ scale: 0.250 }}
          animate={{ scale: isInView ? 1 : 0.250 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Take control of your finances with ease
          </h2>
          <p className="text-gray-600 text-lg">
            Link helps you budget smarter, track income, and stay on top of your financial goals—all in one place.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Section - Main feature with image */}
          <motion.div
            className="flex flex-col justify-center items-start bg-gray-50 p-8 rounded-lg shadow-md"
            initial={{ scale: 0.250 }}
            animate={{ scale: isInView ? 1 : 0.250 }}
            transition={{ duration: 0.5}}
          >
            <h3 className="text-2xl font-semibold text-gray-800 mb-4">
              Dashboard & Insights
            </h3>
            <p className="text-gray-600 mb-6">
              Visualize your spending, track your income, and get actionable insights with charts, graphs, and easy-to-read data.
            </p>

            {/* Image with Scale Animation */}
            <motion.div
              className="p-4 rounded-lg"
              initial={{ scale: 0.250, opacity: 1 }}
              animate={{ scale: isInView ? 1 : 0.250 }}
              transition={{ duration: 0.5}}
            >
              <img
                src="/OverviewTop.png" 
                alt="Mobile app preview"
                className="rounded-2xl shadow-md"
              />
            </motion.div>
          </motion.div>

          {/* Right Section - Features List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Feature 1 */}
            <motion.div
              className="flex flex-col items-start bg-white p-6 rounded-lg shadow-md"
              initial={{ scale: 0.250, opacity: 1 }}
              animate={{ scale: isInView ? 1 : 0.250 }}
              transition={{ duration: 0.5}}
            >
              <div className="text-gray-800 text-4xl mb-4">📊</div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                Set Budgets & Track Spending
              </h3>
              <p className="text-gray-600">
                Create budgets, categorize transactions, and stay on track with real-time spending updates.
              </p>
            </motion.div>

            {/* Feature 2 */}
            <motion.div
              className="flex flex-col items-start bg-white p-6 rounded-lg shadow-md"
              initial={{ scale: 0.250, opacity: 1 }}
              animate={{ scale: isInView ? 1 : 0.250 }}
              transition={{ duration: 0.5}}
            >
              <div className="text-gray-800 text-4xl mb-4">💼</div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                Track Income & Cash Flow
              </h3>
              <p className="text-gray-600">
                Monitor your income streams and see how much money is flowing in and out of your accounts.
              </p>
            </motion.div>

            {/* Feature 3 */}
            <motion.div
              className="flex flex-col items-start bg-white p-6 rounded-lg shadow-md"
              initial={{ scale: 0.250, opacity: 1 }}
              animate={{ scale: isInView ? 1 : 0.250 }}
              transition={{ duration: 0.5}}
            >
              <div className="text-gray-800 text-4xl mb-4">🤖</div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                Virtual Assistant
              </h3>
              <p className="text-gray-600">
                Get personalized advice and let the assistant analyze your transactions—optional and fully under your control.
              </p>
            </motion.div>

            {/* Feature 4 */}
            <motion.div
              className="flex flex-col items-start bg-white p-6 rounded-lg shadow-md"
              initial={{ scale: 0.250, opacity: 1 }}
              animate={{ scale: isInView ? 1 : 0.250 }}
              transition={{ duration: 0.5}}
            >
              <div className="text-gray-800 text-4xl mb-4">🔗</div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                Link Bank Accounts
              </h3>
              <p className="text-gray-600">
                Automatically sync your transactions by securely connecting your bank accounts—available in the premium plan.
              </p>
            </motion.div>
          </div>
        </div>
      </section>
    );
  }

  // Accordion Component for FAQ section
  const FAQ = () => {
    const faqRef = useRef(null);
    const isInView = useInView(faqRef, { once: true });

    return (
      <motion.div
        ref={faqRef}
        initial={{ scale: 0.250 }}
        animate={{ scale: isInView ? 1 : 0.250 }}
        transition={{ duration: 0.5 }}
      >
        <Accordion type="single" collapsible className={cn("w-[90%] ml-[5%] sm:w-[70%] sm:ml-[15%] lg:w-[50%] lg:ml-[25%] text-left", montserratP.className)}>
          <AccordionItem value="item-1">
            <AccordionTrigger className="text-lg hover:no-underline hover:bg-gray-100 p-4 rounded-2xl my-2">What can I do with Link&apos;s budgeting features?</AccordionTrigger>
            <AccordionContent className="font-normal px-4 text-md">
              With Link, you can set personalized budgets, track your spending, and categorize your transactions. It gives you a clear picture of your financial habits.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger className="text-lg hover:no-underline hover:bg-gray-100 p-4 rounded-2xl my-2">How does Link help with income tracking and financial insights?</AccordionTrigger>
            <AccordionContent className="font-normal px-4 text-md">
              Link lets you track income and spending trends over time, view detailed data through dashboard charts and graphs, and gain insights into your financial health.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger className="text-lg hover:no-underline hover:bg-gray-100 p-4 rounded-2xl my-2">Can I link my bank accounts to Link for automatic transaction syncing?</AccordionTrigger>
            <AccordionContent className="font-normal px-4 text-md">
              Yes, you can link your bank accounts to automatically sync transactions. This feature is available with the premium version of Link.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-4">
            <AccordionTrigger className="text-lg hover:no-underline hover:bg-gray-100 p-4 rounded-2xl my-2">How does the virtual assistant work in Link?</AccordionTrigger>
            <AccordionContent className="font-normal px-4 text-md">
              Link&apos;s virtual assistant can help you manage your budget and spending. You can choose to let it use information from your transactions or keep that data private. Chatting with the assistant is a premium feature.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-5">
            <AccordionTrigger className="text-lg hover:no-underline hover:bg-gray-100 p-4 rounded-2xl my-2">What features are included in Link&apos;s free version?</AccordionTrigger>
            <AccordionContent className="font-normal px-4 text-md">
              The free version of Link is fully functional, allowing you to budget, track income, categorize transactions, and view dashboard insights. The only features not included are linking your bank accounts and chatting with the virtual assistant.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </motion.div>
    );
  };

  return (
    <div className={montserratP.className}>
      {/* Hero Section */}
      {(!hasScrolledDown || showBoth) && (
        <motion.div
          initial={{ scale: 0.250 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5 }}
          className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br px-4 from-blue-500 to-purple-500 text-white"
        >
          <div className="sm:block mb-4 scale-75 sm:scale-100">
            <HeaderLogoLarge withLink={false} />
          </div>
          <motion.h1
            initial={{ scale: 0.250, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ duration: 0.5}}
            className="text-3xl sm:text-5xl font-bold text-center mb-4"
          >
            Smarter Budgeting with Link
          </motion.h1>
          <motion.p
            initial={{ scale: 0.250, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ duration: 0.5}}
            className="text-lg sm:text-2xl text-center mb-8"
          >
            Your finances in one place, easy to manage and track.
          </motion.p>
          <motion.div
            initial={{ scale: 0.250, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ duration: 0.5}}
          >
            <Button
              onClick={() => {
                setShowBoth(true);
                setTimeout(() => {
                  scrollToContent();
                }, 0);
                setTimeout(() => {
                  setShowBoth(false);
                }, 750);
                setTimeout(() => {
                  scrollToTop();
                }, 825);
              }}
              className="rounded-full h-[50px] w-[50px] bg-white p-2 hover:bg-gray-100"
            >
              <ArrowDown size="30px" className="text-blue-700" />
            </Button>
          </motion.div>
        </motion.div>
      )}

      {/* Content Section */}
      {(hasScrolledDown || showBoth) && (
        <div className="bg-white" ref={contentRef}>
          <HeaderLanding />
          <div className="-mt-[100px] lg:-mt-[120px] h-[170px] lg:h-[240px] w-full bg-gradient-to-br from-blue-500 to-purple-500">
          </div>

          {/* Feature Section */}
          <section
            className="px-4 py-12 text-center bg-white"
          >
            <div className="ml-[2.5%] w-[95%] md:ml-[10%] md:w-[80%] h-[700px] -mt-[100px] lg:-mt-[150px] p-10 z-50 shadow-md shadow-gray-300 mb-[50px] bg-white rounded-2xl">
              <h2 className="lg:text-4xl sm:text-3xl text-xl font-bold mb-6 text-gray-800">
                Manage Your Finances Effortlessly
              </h2>
              <p className="text-gray-500">
                Budget your finances with charts, graphs, and AI analysis.
              </p>
              <div className="grid grid-cols-1 gap-y-5 sm:gap-y-0 sm:flex gap-x-5 w-full justify-items-center justify-center mt-10 xs:mt-20 sm:mt-20">
                <Button onClick={() => {router.push("/#features")}} className="px-8 py-6 lg:text-md rounded-full" variant="outline">
                  Features
                </Button>
                <Button onClick={() => {router.push("/overview")}} className="py-8 px-12 -mt-1.5 rounded-full text-md lg:text-lg bg-gradient-to-br from-blue-500 to-purple-500 hover:opacity-85">
                  {user ? "Dashboard" : "Get Started"}
                </Button>
                <Button onClick={() => {router.push("/#pricing")}} className="px-8 py-6 lg:text-md rounded-full" variant="outline">
                  Pricing
                </Button>
              </div>
            </div>

            {/* Infinite Scroll Component */}
            <div className="relative mt-8 flex items-center justify-center">
              <InfiniteScrollComponent />
            </div>
          </section>

          {/* Feature Section */}
          <FeaturesSection />
          {/* Pricing Section */}
          <PricingSection />
          {/* FAQ Section */}
          <motion.section
            initial={{ scale: 0.250 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5 }}
            className="px-4 py-12 pt-32 text-center"
            id="faq"
          >
            <h2 className="text-3xl font-bold mb-6 text-gray-800">Frequently Asked Questions</h2>
            <FAQ />
          </motion.section>

          {/* Footer */}
          <motion.footer
            initial={{ scale: 0.250 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5 }}
            className="text-gray-500 py-6 text-center text-sm"
          >
            <p>© 2024 Link Budgeting Tool</p>
          </motion.footer>
        </div>
      )}
    </div>
  );
};

export default LandingPage;
