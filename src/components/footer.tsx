export default function Footer() {
  return (
    <footer className="border-t border-[rgba(255,255,255,0.08)] px-4 md:px-6 py-4 text-[10px] text-[#9A938A] leading-relaxed shrink-0 bg-[#0B0C0D]">
      <div className="max-w-5xl mx-auto space-y-2">
        <div>
          <strong className="text-[#FAF8F4] font-medium">AMES DE BRILLIANTE</strong> (Pty) Ltd — Licensed Diamond Dealer, Republic of Botswana, Licence No. []
        </div>
        <div>[Street address, Gaborone]</div>
        <div>WhatsApp: +267 [] · Email: [___]</div>
        <div className="flex gap-3">
          <a href="/terms" className="underline hover:text-[#FAF8F4]">Terms of Use</a>
          <a href="/privacy" className="underline hover:text-[#FAF8F4]">Privacy Policy</a>
          <a href="/compliance" className="underline hover:text-[#FAF8F4]">Compliance &amp; Kimberley Process</a>
        </div>
        <div>All rough diamond exports are conducted under the Kimberley Process Certification Scheme.</div>
        <div>© 2026 AMES DE BRILLIANTE (Pty) Ltd</div>
      </div>
    </footer>
  );
}
