export default function Footer() {
  return (
    <footer className="border-t border-border px-4 md:px-6 py-4 text-[10px] text-muted leading-relaxed shrink-0 bg-white">
      <div className="max-w-5xl mx-auto space-y-2">
        <div>
          <strong className="text-black font-semibold">AMES DE BRILLIANCE</strong> (Pty) Ltd — Licensed Diamond Dealer, Republic of Botswana, Licence No. []
        </div>
        <div>[Street address, Gaborone]</div>
        <div>WhatsApp: +267 [] · Email: [___]</div>
        <div className="flex gap-3">
          <a href="/terms" className="underline hover:text-black">Terms of Use</a>
          <a href="/privacy" className="underline hover:text-black">Privacy Policy</a>
          <a href="/compliance" className="underline hover:text-black">Compliance &amp; Kimberley Process</a>
        </div>
        <div>All rough diamond exports are conducted under the Kimberley Process Certification Scheme.</div>
        <div>© 2026 AMES DE BRILLIANCE (Pty) Ltd</div>
      </div>
    </footer>
  );
}
