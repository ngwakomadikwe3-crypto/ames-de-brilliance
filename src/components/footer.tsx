export default function Footer() {
  return (
    <footer className="border-t border-[rgba(23,23,23,0.08)] px-4 md:px-6 py-4 text-[10px] text-[#6E6C69] leading-relaxed shrink-0 bg-[#EAE8E4]">
      <div className="max-w-5xl mx-auto space-y-2">
        <div>
          <strong className="text-[#171717] font-medium">AMES DE BRILLIANTE</strong> (Pty) Ltd — Licensed Diamond Dealer, Republic of Botswana, Licence No. []
        </div>
        <div>[Street address, Gaborone]</div>
        <div>WhatsApp: +267 [] · Email: [___]</div>
        <div className="flex gap-3">
          <a href="/terms" className="underline hover:text-[#171717]">Terms of Use</a>
          <a href="/privacy" className="underline hover:text-[#171717]">Privacy Policy</a>
          <a href="/compliance" className="underline hover:text-[#171717]">Compliance &amp; Kimberley Process</a>
        </div>
        <div>All rough diamond exports are conducted under the Kimberley Process Certification Scheme.</div>
        <div>© 2026 AMES DE BRILLIANTE (Pty) Ltd</div>
      </div>
    </footer>
  );
}
