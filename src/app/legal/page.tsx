import AppAccountShell from "@/components/AppAccountShell";

export default function LegalPage() {
  return (
    <AppAccountShell title="Legal &amp; Compliance">
      <div className="ames-editorial-copy">
        <p className="ames-editorial-intro">
          AMES DE BRILLIANTE (Pty) Ltd — Licensed Diamond Dealer, Republic of Botswana
        </p>

        <div className="space-y-8">
          <section>
            <h2 >Kimberley Process</h2>
            <p >
              All rough diamond exports are conducted under the Kimberley Process Certification Scheme (KPCS).
              AMES DE BRILLIANTE operates in full compliance with Botswana&apos;s diamond trading regulations
              and international best practices for responsible sourcing.
            </p>
          </section>

          <section>
            <h2 >Terms of Use</h2>
            <p >
              Prices displayed are indicative and subject to confirmation by the desk.
              Reservations are confirmed only after written acknowledgement.
              All transactions are governed by the laws of the Republic of Botswana.
            </p>
          </section>

          <section>
            <h2 >Privacy</h2>
            <p >
              We collect only the information necessary to fulfil your enquiry.
              We do not sell or share personal data with third parties.
              Contact details are used solely for communication regarding your transaction.
            </p>
          </section>

          <section>
            <h2 >Contact</h2>
            <div >
              <p><strong >AMES DE BRILLIANTE</strong> (Pty) Ltd</p>
              <p>Licensed Diamond Dealer, Republic of Botswana</p>
              <p>WhatsApp: +267 72 839 152</p>
            </div>
          </section>
        </div>
      </div>
    </AppAccountShell>
  );
}
