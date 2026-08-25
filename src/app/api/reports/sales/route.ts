import { NextResponse } from "next/server";
import { getAllStones } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // All sold consigned stones with trader info
    const allStones = await getAllStones();
    const rows = allStones.filter((s: any) => s.status === "Sold" && s.source === "Consigned");

    // Compute commission amounts
    const sales = rows.map((r: any) => ({
      ...r,
      commission_amount: (r.sale_price || 0) * ((r.commission || 0) / 100),
      trader_name: r.trader_name || "Unknown",
      trader_whatsapp: r.trader_whatsapp || "",
      trader_licence: r.trader_licence || "",
    }));

    // Summary
    const totalRevenue = sales.reduce((sum, s) => sum + (s.sale_price || 0), 0);
    const totalCommission = sales.reduce((sum, s) => sum + s.commission_amount, 0);
    const totalSold = sales.length;
    const totalCarat = sales.reduce((sum, s) => sum + (s.carat || 0), 0);

    // Breakdown by trader
    const traderMap = new Map<string, {
      trader_name: string;
      trader_whatsapp: string;
      trader_licence: string;
      stones_sold: number;
      total_revenue: number;
      total_commission: number;
      total_carat: number;
      avg_commission_pct: number;
    }>();

    for (const s of sales) {
      const key = s.trader_name || "Unknown";
      const existing = traderMap.get(key);
      if (existing) {
        existing.stones_sold += 1;
        existing.total_revenue += s.sale_price || 0;
        existing.total_commission += s.commission_amount;
        existing.total_carat += s.carat || 0;
      } else {
        traderMap.set(key, {
          trader_name: s.trader_name,
          trader_whatsapp: s.trader_whatsapp,
          trader_licence: s.trader_licence,
          stones_sold: 1,
          total_revenue: s.sale_price || 0,
          total_commission: s.commission_amount,
          total_carat: s.carat || 0,
          avg_commission_pct: s.commission,
        });
      }
    }

    const byTrader = Array.from(traderMap.values()).map((t) => ({
      ...t,
      avg_commission_pct: t.total_revenue > 0
        ? Math.round((t.total_commission / t.total_revenue) * 100 * 10) / 10
        : 0,
    }));

    // Breakdown by stone type
    const roughSales = sales.filter((s) => s.stone_type === "rough");
    const polishedSales = sales.filter((s) => s.stone_type === "polished");

    return NextResponse.json({
      summary: {
        total_sold: totalSold,
        total_revenue: totalRevenue,
        total_commission: totalCommission,
        total_carat: totalCarat,
        rough_count: roughSales.length,
        polished_count: polishedSales.length,
        rough_revenue: roughSales.reduce((sum, s) => sum + (s.sale_price || 0), 0),
        polished_revenue: polishedSales.reduce((sum, s) => sum + (s.sale_price || 0), 0),
      },
      byTrader,
      sales,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
