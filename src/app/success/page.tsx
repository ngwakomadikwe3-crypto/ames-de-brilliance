export default function SuccessPage() {
  return (
    <div className="px-4 md:px-6 py-16 max-w-lg mx-auto w-full text-center">
      <div className="border border-border p-8">
        <p className="text-[13px] font-bold mb-3">Your mandate has been received.</p>
        <p className="text-[12px] text-muted mb-6">Our desk responds within one business day.</p>
        <a
          href="/"
          className="inline-block px-4 py-2 bg-[#C9A227] text-[#0B0C0D] text-[12px] font-medium"
        >
          Back to stock
        </a>
      </div>
    </div>
  );
}
