import React from 'react';

const Terms = () => {
  return (
    <div className="container mx-auto p-4 bg-white rounded-2xl z-50 mt-[40px] mb-[40px]">
      <h1 className="text-3xl font-bold mb-4 bg-white rounded-2xl">Terms and Conditions</h1>
      <p className="text-sm text-gray-600">Effective Date: November 23, 2024</p>
      
      <h2 className="text-2xl font-semibold mt-8">1. Service Overview</h2>
      <p>
        Link is a budgeting tool that allows users to manually track financial transactions, including income and expenses, 
        and provides a comprehensive dashboard to help understand personal finances. Users may also subscribe to a paid plan 
        via Stripe, which integrates with third-party service Plaid to allow automatic transaction imports into the application.
      </p>

      <h2 className="text-2xl font-semibold mt-8">2. Account Registration</h2>
      <p>
        To use the Service, you may be required to create an account through our third-party partner, Clerk. You agree to provide accurate, 
        current, and complete information during registration and to update such information as necessary to keep it accurate. 
        You are responsible for maintaining the confidentiality of your account credentials.
      </p>

      <h2 className="text-2xl font-semibold mt-8">3. Subscription and Payment Terms</h2>
      <h3 className="text-xl font-semibold mt-4">a. Free Version</h3>
      <p>The free version of Link allows users to manually input and track financial transactions.</p>

      <h3 className="text-xl font-semibold mt-4">b. Paid Subscription</h3>
      <p>
        Users can subscribe to a paid plan via Stripe, which enables automatic transaction syncing through Plaid. Payments for the subscription 
        will be processed via Stripe, and by subscribing, you agree to Stripe’s terms and conditions. You will be charged according to the subscription 
        plan you select (monthly, annual, etc.).
      </p>
      <p>All fees are non-refundable unless otherwise required by law.</p>

      <h2 className="text-2xl font-semibold mt-8">4. Third-Party Services</h2>
      <p>
        The Service uses several third-party services to operate effectively. By using the Service, you agree to the terms and privacy policies of the following third-party services:
      </p>
      <ul className="list-disc ml-8">
        <li>Neon: Database hosting for user data.</li>
        <li>Clerk: User authentication and management.</li>
        <li>MongoDB: Data storage and retrieval.</li>
        <li>Pinecone: Vector search for advanced data analytics.</li>
        <li>Vercel: Web hosting for the Service.</li>
        <li>Render: Web hosting for the Service’s server infrastructure.</li>
        <li>Drizzle: ORM for database interaction.</li>
        <li>Stripe: Payment processing.</li>
        <li>Squarespace: Domain hosting.</li>
        <li>Google Workspace: Email services.</li>
        <li>OpenAI: AI-powered services (e.g., chat functionality).</li>
      </ul>
      <p>You acknowledge and agree that your use of these third-party services is governed by their respective terms and privacy policies.</p>

      <h2 className="text-2xl font-semibold mt-8">5. User Data and Privacy</h2>
      <h3 className="text-xl font-semibold mt-4">a. Data Collection</h3>
      <p>
        We collect and store your financial transaction data, which may include income, expenses, and other financial information, depending on the features you use. 
        If you choose to link your bank account via Plaid, we only access recent transactions from that account and do not monitor your bank account balance or any other personal data.
      </p>

      <h3 className="text-xl font-semibold mt-4">b. Data Usage</h3>
      <p>
        Your data is used to provide and improve the Service. It may be stored in third-party servers as outlined above, and by using the Service, you consent to the collection, storage, and processing of your data according to our Privacy Policy.
      </p>

      <h3 className="text-xl font-semibold mt-4">c. Data Security</h3>
      <p>
        We use industry-standard encryption protocols to protect your data. However, we cannot guarantee absolute security. You are responsible for maintaining the security of your login credentials and account.
      </p>

      <h2 className="text-2xl font-semibold mt-8">6. Limitation of Liability</h2>
      <p>
        To the fullest extent permitted by law, LinkLogic LLC, its affiliates, officers, employees, agents, or partners shall not be liable for any indirect, incidental, 
        special, consequential, or punitive damages, including but not limited to loss of data, loss of profit, or business interruption, arising out of or related to your use of the Service.
      </p>
      <p>
        We make no representations or warranties regarding the accuracy, reliability, or completeness of any information provided by the Service. You use the Service at your own risk.
      </p>

      <h2 className="text-2xl font-semibold mt-8">7. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless LinkLogic LLC, its affiliates, officers, employees, agents, and partners from any claims, damages, liabilities, or expenses arising out of your use of the Service, including any violation of these Terms.
      </p>

      <h2 className="text-2xl font-semibold mt-8">8. Termination</h2>
      <p>
        We reserve the right to suspend or terminate your access to the Service at our sole discretion, with or without notice, if we believe you have violated these Terms.
      </p>

      <h2 className="text-2xl font-semibold mt-8">9. Changes to Terms</h2>
      <p>
        We may update these Terms from time to time. We will notify you of any significant changes by posting the new Terms on the Service and updating the “Effective Date.” 
        Your continued use of the Service after such changes will constitute your acceptance of the updated Terms.
      </p>

      <h2 className="text-2xl font-semibold mt-8">10. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the state of Michigan, United States. Any disputes arising from or related to these Terms shall be resolved in the competent courts located in Michigan, United States.
      </p>

      <h2 className="text-2xl font-semibold mt-8">11. Contact Information</h2>
      <p>
        If you have any questions or concerns about these Terms, please contact us at:
      </p>
      <p className='mt-5'><b>LinkLogic LLC</b></p>
          
        <p className='mt-2'>221 WEST LAKE LANSING ROAD SUITE 200</p>
        <p>EAST LANSING, MI 48823 USA</p>
        
        <p className='mt-2 mb-5'>support@budgetwithlink.com</p>

      <p>
        By using the Service, you acknowledge that you have read, understood, and agree to these Terms and Conditions.
      </p>
    </div>
  );
};

export default Terms;
