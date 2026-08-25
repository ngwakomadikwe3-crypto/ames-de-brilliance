import { NextRequest, NextResponse } from "next/server";
import { draftOffer, draftSourcingAck, withRetry } from "@/lib/ai";
import { getRequestById, getAvailableStones } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const { requestId } = await request.json();
    if (!requestId) {
      return NextResponse.json({ error: "requestId required" }, { status: 400 });
    }

    const req = await getRequestById(requestId);
    if (!req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    // Build request specs text for the AI
    const cr = req.carat_min === req.carat_max
      ? req.carat_min + "ct"
      : req.carat_min + "\u2013" + req.carat_max + "ct";
    const cert = req.certification === "None" ? "" : " " + req.certification;

    const requestSpecs = [
      "Buyer: " + req.company + (req.country ? " (" + req.country + ")" : ""),
      "Contact: " + req.contact,
      "Type: " + req.type,
      "Requirement: " + (req.shape || "Any") + " " + cr + " " + req.color + " " + (req.clarity || "Any") + cert,
      req.notes ? "Notes: " + req.notes : "",
    ].filter(Boolean).join("\n");

    // Get available stones
    const stones = await getAvailableStones();

    if (stones.length === 0) {
      // No stones in inventory at all — draft sourcing acknowledgement
      const ack = await withRetry(() => draftSourcingAck(req.company));
      return NextResponse.json({ offer: ack, matched: false });
    }

    // Format stone inventory for the AI
    const stoneList = stones.map((s: any) => {
      if (s.stone_type === "rough") {
        return [
          s.ref + " | Rough | " + s.category + " | " + s.crystal_form + " | " + s.carat + "ct | " + s.color,
          s.clarity_notes ? "  Clarity: " + s.clarity_notes : "",
          s.kp_status ? "  KP cert on file" : "",
          "  Price: " + (s.price ? "$" + s.price.toLocaleString() : "price on request"),
          "  Source: " + s.source,
        ].filter(Boolean).join("\n");
      }
      return [
        s.ref + " | Polished | " + s.shape + " | " + s.carat + "ct | " + s.color + " | " + s.clarity + " | " + s.cut + " | " + s.certification,
        "  Price: " + (s.price ? "$" + s.price.toLocaleString() : "price on request"),
        "  Source: " + s.source,
      ].filter(Boolean).join("\n");
    }).join("\n---\n");

    const offer = await withRetry(() => draftOffer(requestSpecs, stoneList));

    return NextResponse.json({ offer, matched: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Draft offer failed" }, { status: 500 });
  }
}
