export default function CompliancePage() {
  return (
    <div className="px-4 md:px-6 py-8 max-w-2xl mx-auto w-full">
      <h2 className="text-[13px] font-bold mb-6">Compliance and Regulatory Information</h2>

      <div className="text-[11px] leading-relaxed space-y-4">
        <div>
          <h3 className="font-bold mb-1">1. Licensing</h3>
          <p>AMES DE BRILLIANCE (Pty) Ltd is a licensed diamond dealer in the Republic of Botswana, operating under the provisions of the Diamond Trading Act and applicable regulations of the Ministry of Minerals and Energy. Our dealer licence number is displayed in the footer of this website.</p>
        </div>

        <div>
          <h3 className="font-bold mb-1">2. Kimberley Process Compliance</h3>
          <p>All rough diamond exports by AMES DE BRILLIANCE (Pty) Ltd fully comply with the Kimberley Process Certification Scheme (KPCS). The KPCS is an international initiative to prevent conflict diamonds from entering the mainstream rough diamond market.</p>
          <p className="mt-1">We ensure that:</p>
          <ul className="list-disc ml-4 mt-1 space-y-0.5">
            <li>All rough diamonds are sourced from legitimate, KPCS-compliant channels</li>
            <li>Each rough diamond shipment is accompanied by a Kimberley Process Certificate as required by law</li>
            <li>We maintain full traceability of rough diamond provenance</li>
          </ul>
        </div>

        <div>
          <h3 className="font-bold mb-1">3. Buyer Eligibility for Rough Diamonds</h3>
          <p>In accordance with the Kimberley Process and Botswana law, rough diamonds are sold only to buyers who hold a valid Kimberley Process import licence issued by their country of import. Buyers must provide their KP licence number and issuing country prior to any rough diamond transaction.</p>
        </div>

        <div>
          <h3 className="font-bold mb-1">4. Know Your Customer (KYC)</h3>
          <p>All transactions are subject to identity verification and know-your-customer (KYC) checks in compliance with Botswana anti-money laundering regulations and international best practices. Buyers may be required to provide:</p>
          <ul className="list-disc ml-4 mt-1 space-y-0.5">
            <li>Proof of identity (passport or national ID)</li>
            <li>Proof of company registration</li>
            <li>KP import licence (for rough diamond purchases)</li>
            <li>Proof of address</li>
            <li>Source of funds documentation, where applicable</li>
          </ul>
        </div>

        <div>
          <h3 className="font-bold mb-1">5. Transaction Refusal</h3>
          <p>AMES DE BRILLIANCE (Pty) Ltd reserves the right to decline any transaction that cannot be satisfactorily verified through our KYC and compliance procedures. We will not proceed with any transaction where there is suspicion of money laundering, terrorism financing, sanctions evasion, or any other illicit activity.</p>
        </div>

        <div>
          <h3 className="font-bold mb-1">6. Sanctions Compliance</h3>
          <p>We do not engage in transactions with individuals, entities, or jurisdictions subject to international sanctions, including those imposed by the United Nations, the European Union, the United States Office of Foreign Assets Control (OFAC), or the Government of Botswana.</p>
        </div>

        <div>
          <h3 className="font-bold mb-1">7. Record Keeping</h3>
          <p>We maintain comprehensive records of all transactions, compliance checks, and due diligence activities in accordance with Botswana law. These records are available for inspection by relevant regulatory authorities upon request.</p>
        </div>
      </div>
    </div>
  );
}
