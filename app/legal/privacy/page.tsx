import React from 'react';

const PrivacyPolicy = () => {
  return (
    <div className="container mx-auto p-4 bg-white rounded-2xl z-50 mt-[40px] mb-[40px]">
      <h1 className="text-3xl font-bold mb-4 bg-white rounded-2xl">Privacy Policy</h1>
      <p className="text-sm text-gray-600">Effective Date: November 23, 2024</p>
      
      <h2 className="text-2xl font-semibold mt-8">1. Introduction</h2>
      <p>
        LinkLogic LLC (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy outlines how we collect, use, store, and protect your personal information when you use our service, Link.
      </p>

      <h2 className="text-2xl font-semibold mt-8">2. Information We Collect</h2>
      <h3 className="text-xl font-semibold mt-4">a. Personal Information</h3>
      <p>
        We may collect personal information such as your name, email address, and account-related details when you register for an account with Link. This information is used for authentication and communication purposes only.
      </p>

      <h3 className="text-xl font-semibold mt-4">b. Financial Information</h3>
      <p>
        If you choose to link your bank account through Plaid, we may collect financial transaction data, such as income, expenses, and other account-related information. We only access recent transaction data and do not monitor your account balance or other sensitive financial details.
      </p>

      <h3 className="text-xl font-semibold mt-4">c. Usage Data</h3>
      <p>
        We may collect information on how you use the Service, including interaction data, features used, and device information, to improve our service and provide a better user experience.
      </p>

      <h2 className="text-2xl font-semibold mt-8">3. How We Use Your Information</h2>
      <p>
        We use your personal and financial information to:
      </p>
      <ul className="list-disc ml-8">
        <li>Provide and improve our services.</li>
        <li>Process your payments and manage subscriptions.</li>
        <li>Communicate with you regarding your account or transactions.</li>
        <li>Enhance the overall user experience on the platform.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-8">4. Data Security</h2>
      <p>
        We take the security of your data seriously and use industry-standard encryption protocols to protect it. However, no method of transmission over the Internet is completely secure, and we cannot guarantee absolute security. You are responsible for maintaining the confidentiality of your account credentials.
      </p>

      <h2 className="text-2xl font-semibold mt-8">5. Data Retention</h2>
      <p>
        We will retain your personal and financial information for as long as your account is active or as necessary to provide you with services. You may request the deletion of your account and associated data by contacting us at any time.
      </p>

      <h2 className="text-2xl font-semibold mt-8">6. Sharing and Disclosure of Data</h2>
      <p>
        We do not sell, rent, or trade your personal information. We do not share your data with third parties for marketing purposes. We may share your information with third-party service providers only to the extent necessary to operate the Service, such as:
      </p>
      <ul className="list-disc ml-8">
        <li>Payment processing (via Stripe).</li>
        <li>User authentication and management (via Clerk).</li>
        <li>Financial data syncing (via Plaid).</li>
      </ul>
      <p>
        These third-party services are contractually obligated to protect your data and are not permitted to use it for any other purpose.
      </p>

      <h2 className="text-2xl font-semibold mt-8">7. Your Rights and Choices</h2>
      <p>
        You have the right to:
      </p>
      <ul className="list-disc ml-8">
        <li>Access, update, or delete your personal information at any time.</li>
        <li>Request that we restrict processing of your personal data under certain circumstances.</li>
      </ul>

      <h2 className="text-2xl font-semibold mt-8">8. Third-Party Links</h2>
      <p>
        The Service may contain links to third-party websites or services that are not owned or controlled by LinkLogic LLC. We are not responsible for the privacy practices of these third parties. We encourage you to review their privacy policies before submitting any personal information.
      </p>

      <h2 className="text-2xl font-semibold mt-8">9. Changes to this Privacy Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. When we do, we will post the updated policy on this page and update the “Effective Date” at the top. Your continued use of the Service after such changes constitutes your acceptance of the updated Privacy Policy.
      </p>

      <h2 className="text-2xl font-semibold mt-8">10. Governing Law</h2>
      <p>
        This Privacy Policy is governed by the laws of the state of Michigan, United States. Any disputes arising from or related to this Privacy Policy shall be resolved in the competent courts located in Michigan, United States.
      </p>

      <h2 className="text-2xl font-semibold mt-8">11. Contact Information</h2>
      <p>
        If you have any questions or concerns about this Privacy Policy, please contact us at:
      </p>
      <p className="mt-5"><b>LinkLogic LLC</b></p>
      <p className="mt-2">221 WEST LAKE LANSING ROAD SUITE 200</p>
      <p>EAST LANSING, MI 48823 USA</p>
      <p className="mt-2 mb-5">support@budgetwithlink.com</p>

      <p>
        By using the Service, you acknowledge that you have read, understood, and agree to this Privacy Policy.
      </p>
    </div>
  );
};

export default PrivacyPolicy;
