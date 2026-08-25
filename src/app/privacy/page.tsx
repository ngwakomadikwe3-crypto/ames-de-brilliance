export default function PrivacyPage() {
  return (
    <div className="px-4 md:px-6 py-8 max-w-2xl mx-auto w-full">
      <h2 className="text-[13px] font-bold mb-6">Privacy Policy</h2>

      <div className="text-[11px] leading-relaxed space-y-4">
        <div>
          <h3 className="font-bold mb-1">1. Data Controller</h3>
          <p>AMES DE BRILLIANTE (Pty) Ltd is the data controller responsible for your personal data. We are a licensed diamond dealer registered in the Republic of Botswana.</p>
        </div>

        <div>
          <h3 className="font-bold mb-1">2. Data We Collect</h3>
          <p>When you submit a sourcing request through this website, we collect the following personal information:</p>
          <ul className="list-disc ml-4 mt-1 space-y-0.5">
            <li>Full name</li>
            <li>Company name</li>
            <li>Contact details (email address and/or WhatsApp number)</li>
            <li>Country of residence</li>
            <li>Diamond sourcing specifications (type, shape, carat, color, clarity, certification)</li>
            <li>Any additional notes or requirements you provide</li>
            <li>For rough diamond requests: KP import licence number and issuing country</li>
            <li>Consent record and timestamp of submission</li>
          </ul>
        </div>

        <div>
          <h3 className="font-bold mb-1">3. Purpose of Data Collection</h3>
          <p>We collect and process your personal data solely to:</p>
          <ul className="list-disc ml-4 mt-1 space-y-0.5">
            <li>Respond to your sourcing requests and source diamonds on your behalf</li>
            <li>Meet our regulatory and compliance obligations under Botswana law, including the Kimberley Process and anti-money laundering requirements</li>
            <li>Maintain records as required by our diamond dealer licence</li>
          </ul>
        </div>

        <div>
          <h3 className="font-bold mb-1">4. Data Sharing and Sale</h3>
          <p>We do not sell, rent, or trade your personal data to any third party. Your data may be shared only with:</p>
          <ul className="list-disc ml-4 mt-1 space-y-0.5">
            <li>Our authorised suppliers, solely to the extent necessary to source diamonds on your behalf</li>
            <li>Regulatory authorities, where required by law</li>
          </ul>
        </div>

        <div>
          <h3 className="font-bold mb-1">5. Data Retention</h3>
          <p>We retain your personal data for as long as necessary to fulfil the purposes for which it was collected, and as required by applicable law and our licence obligations. Transaction records are retained in accordance with Botswana regulatory requirements.</p>
        </div>

        <div>
          <h3 className="font-bold mb-1">6. Your Rights under the Botswana Data Protection Act 2018</h3>
          <p>Under the Botswana Data Protection Act 2018, you have the following rights:</p>
          <ul className="list-disc ml-4 mt-1 space-y-0.5">
            <li><strong>Right of access:</strong> You may request a copy of the personal data we hold about you.</li>
            <li><strong>Right of correction:</strong> You may request that we correct any inaccurate or incomplete personal data.</li>
            <li><strong>Right of deletion:</strong> You may request that we delete your personal data, subject to our legal and regulatory retention obligations.</li>
            <li><strong>Right to object:</strong> You may object to the processing of your personal data where we rely on a legitimate interest.</li>
          </ul>
        </div>

        <div>
          <h3 className="font-bold mb-1">7. Data Security</h3>
          <p>We implement appropriate technical and organisational measures to protect your personal data against unauthorised access, alteration, disclosure, or destruction.</p>
        </div>

        <div>
          <h3 className="font-bold mb-1">8. Contact for Data Requests</h3>
          <p>To exercise any of your rights under this policy, or to make a data-related enquiry, please contact us at:</p>
          <p className="mt-1 font-medium">Email: privacy@amesdebrilliance.co.bw</p>
        </div>

        <div>
          <h3 className="font-bold mb-1">9. Amendments</h3>
          <p>We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated effective date.</p>
        </div>
      </div>
    </div>
  );
}
