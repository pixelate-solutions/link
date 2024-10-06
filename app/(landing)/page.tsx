"use client";

import { HeaderLanding } from "@/components/header-landing";
import { Button } from "@/components/ui/button";
import { ArrowDown } from "lucide-react";
import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import "@/styles.css";
import { HeaderLogoLarge } from "@/components/header-logo-large";
import { HeaderLogo } from "@/components/header-logo";

const LandingPage = () => {
  const gradientRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [hasScrolledDown, setHasScrolledDown] = useState(false);
  const [showBoth, setShowBoth] = useState(false);

  // Scroll down to the start of the content section and enable scrolling
  const scrollToBottom = () => {
    if (contentRef.current) {
      window.scrollTo({
        top: contentRef.current.offsetTop, // Scroll to the top of the next section
        behavior: "smooth", // Ensure smooth scrolling
      });
      setHasScrolledDown(true);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "instant",
    })
  }

  return (
    <div>
      {/* Gradient Background Section */}
      {(!hasScrolledDown || showBoth) && (
        <div ref={gradientRef} className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-500 relative z-50">
        <div className="text-center flex flex-col items-center">
          <div className="hidden sm:block mb-2">
              <HeaderLogoLarge withLink={false} />
          </div>
          <div className="block sm:hidden">
              <HeaderLogo withLink={false} />
          </div>
          <h2 className="text-white text-lg sm:text-2xl mb-8">The smart way to budget</h2>
            <div className="flex justify-center space-x-4">
              <Button
                onClick={() => {
                  setShowBoth(true);
                  setTimeout( () => { scrollToBottom() }, 0);
                  setTimeout(() => { setShowBoth(false) }, 750);
                  setTimeout( () => { scrollToTop() }, 750);
                }}
                className="rounded-full h-[35px] w-[35px] sm:h-[50px] sm:w-[50px] bg-white p-2 hover:bg-gray-100 hover:scale-110 transition-all"
              >
                <ArrowDown size="30px" className="text-blue-700" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Content Section */}
      {(hasScrolledDown || showBoth) && (<div ref={contentRef} className="sticky top-0">
        {/* Header */}
        <HeaderLanding />
        {/* Content below the gradient section */}
        <div className="pb-16">
          {/* Overlapping Cards Section */}
          <div className="z-50 -mt-[40px] lg:-mt-[75px] grid grid-cols-1 lg:grid-cols-2 gap-8 mx-4 sm:mx-20 text-center">
            <div className="bg-white shadow-lg rounded-lg p-6 lg:ml-20">
              <h3 className="text-xl font-semibold text-gray-800">Track Expenses</h3>
              <p className="mt-4 text-gray-600">
                Stay on top of your spending with real-time tracking of all your transactions.
              </p>
            </div>
            <div className="bg-white shadow-lg rounded-lg p-6 lg:mr-20">
              <h3 className="text-xl font-semibold text-gray-800">Set Budgets</h3>
              <p className="mt-4 text-gray-600">
                Set budgets for different categories and make sure you never overspend.
              </p>
            </div>
          </div>

          {/* Features Section */}
          <div className="text-center mt-8 px-4">
            <h2 className="text-3xl font-bold text-gray-800 landing-gradient-text">Features</h2>
            <p className="text-gray-600 mt-4 mb-[50px] lg:text-lg">Everything you need to manage your finances in one place</p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8 lg:mx-12 md:mx-4 sm:mx-2 mx-0">
              <div className="bg-gradient-to-br to-gray-200 from-white p-6 rounded-lg shadow-lg shadow-gray-300 text-black h-[200px] hover:scale-105 transition-all">
                <h3 className="text-xl font-semibold">Automatic Categorization</h3>
                <p className="mt-2">
                  Transactions are automatically categorized for easy analysis.
                </p>
              </div>
              <div className="bg-gradient-to-br to-gray-200 from-white p-6 rounded-lg shadow-lg shadow-gray-300 text-black h-[200px] hover:scale-105 transition-all">
                <h3 className="text-xl font-semibold">Bank Integrations</h3>
                <p className="mt-2">Connect your bank accounts and track everything in one place.</p>
              </div>
              <div className="bg-gradient-to-br to-gray-200 from-white p-6 rounded-lg shadow-lg shadow-gray-300 text-black h-[200px] hover:scale-105 transition-all">
                <h3 className="text-xl font-semibold">Secure & Private</h3>
                <p className="mt-2">
                  Your data is safe with end-to-end encryption and security best practices.
                </p>
              </div>
            </div>
          </div>

          {/* Pricing Section */}
          <div className="text-center mt-16 px-4">
            <h2 className="text-3xl font-bold text-gray-800 landing-gradient-text">Pricing</h2>
            <p className="text-gray-600 mt-4 lg:text-lg">Simple and affordable pricing for everyone</p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
              <div className="bg-white shadow-lg rounded-lg p-6">
                <h3 className="text-xl font-semibold text-gray-800">Free Plan</h3>
                <p className="mt-4 text-gray-600">$0/month</p>
                <ul className="mt-4 text-gray-600">
                  <li>- Track expenses</li>
                  <li>- Set budgets</li>
                  <li>- Manual transaction input</li>
                </ul>
                <Button className="bg-gradient-to-br from-blue-500 to-purple-500 mt-6 w-full text-white">Get Started</Button>
              </div>
              <div className="bg-white shadow-lg rounded-lg p-6">
                <h3 className="text-xl font-semibold text-gray-800">Premium Plan</h3>
                <p className="mt-4 text-gray-600">$7.50/month</p>
                <ul className="mt-4 text-gray-600">
                  <li>- All Free features</li>
                  <li>- Bank integrations</li>
                  <li>- Detailed financial reports</li>
                </ul>
                <Button className="mt-6 w-full bg-gradient-to-br from-blue-500 to-purple-500 text-white">Get Started</Button>
              </div>
              <div className="bg-white shadow-lg rounded-lg pt-6 px-6 h-full">
                <h3 className="text-xl font-semibold text-gray-800">Lifetime Plan</h3>
                <p className="mt-4 text-gray-600">$90/one-time</p>
                <ul className="mt-4 text-gray-600">
                  <li>- All Premium features</li>
                  <li>- Lifetime access</li>
                </ul>
                <Button className="mt-6 w-full bg-gradient-to-br from-blue-500 to-purple-500 text-white">Get Started</Button>
              </div>
            </div>
          </div>

          {/* Screenshot Carousel Section */}
          <div className="text-center mt-16 px-4">
            <h2 className="text-3xl font-bold text-gray-800 landing-gradient-text">Take a Look Inside</h2>
            <p className="text-gray-600 mt-4 lg:text-lg">See how easy it is to manage your finances with Link</p>

            {/* Shadcn Carousel */}
            <div className="relative mt-8 flex items-center justify-center">
              <Carousel className="w-full max-w-[80%]">
                <CarouselContent>
                  {["/OverviewTop.png", "/Categories.png", "/Transactions.png", "ConnectedAccounts.png", "Chat3.png"].map((src, index) => (
                    <CarouselItem className="" key={index}>
                      <div>
                        <Card>
                          <CardContent className="flex aspect-square items-center justify-center">
                            <img src={src} alt={`Screenshot ${index + 1}`} className="rounded-lg shadow-lg w-full" />
                          </CardContent>
                        </Card>
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
              </Carousel>
            </div>
          </div>

          {/* Footer Section */}
          <footer className="bg-gray-800 text-white py-8 mt-16">
            <div className="text-center">
              <p>© 2024 Link Budgeting Tool. All Rights Reserved.</p>
              <p className="mt-2">Built with love by the Link Team.</p>
            </div>
          </footer>
        </div>
      </div>)}
    </div>
  );
};

export default LandingPage;
