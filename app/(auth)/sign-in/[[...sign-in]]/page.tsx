import { SignIn, ClerkLoaded, ClerkLoading } from "@clerk/nextjs";
import { ColorRing } from 'react-loader-spinner'
import Image from "next/image";

const SignInPage = () => {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="h-full flex-col items-center justify-center px-4 lg:flex">
        <div className="space-y-4 pt-16 text-center">
          <h1 className="text-3xl font-bold text-[#2E2A47]">Welcome back!</h1>
          <p className="text-base text-[#7E8CA0]">
            Log in to get back to your dashboard.
          </p>
        </div>

        <div className="mt-8 flex items-center justify-center">
          <ClerkLoaded>
            <SignIn path="/sign-in" />
          </ClerkLoaded>

          <ClerkLoading>
            <ColorRing
              visible={true}
              height="80"
              width="80"
              ariaLabel="color-ring-loading"
              wrapperStyle={{}}
              wrapperClass="color-ring-wrapper"
              colors={['#3B82F6', '#6366F1', '#7C3AED', '#9333EA', '#A855F7']}
            />
          </ClerkLoading>
        </div>
      </div>

      <div className="hidden h-full items-center justify-center bg-gradient-to-br from-blue-500 to-purple-500 lg:flex">
        <Image src="/Link_Logo_Current.png" alt="Link logo" height={150} width={150} />
      </div>
    </div>
  );
};

export default SignInPage;
