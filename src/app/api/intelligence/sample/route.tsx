import { NextResponse } from "next/server";

const SAMPLE_MD = `# AMES Intelligence — Sample\n**Ground Report · ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}**\n\n> This is a free sample. Subscribe for the full report.\n\n## Market Overview\nBotswana remains the world's premier source of high-quality diamonds. This quarter saw steady demand in the 1–3 carat D–F VS range, with collectors showing particular interest in stones with documented Botswana origin.\n\n## On the Ground\nCutting activity in Gaborone continues at capacity. Qualified cutters report strong demand for calibrated melee and medium-sized solitaire rough. Polished inventory at licensed dealers remains below pre-pandemic levels.\n\n## Demand Signals\nEnquiries through the AMES desk this quarter: 42% engagement, 28% self-purchase, 18% gifting, 12% collection. Average budget: $3,200–$18,000. Colour preference: D–F. Clarity: VS1–VVS2.\n\n## Compliance Notes\nKimberley Process certification remains current for all Botswana-origin stones. AMES maintains full chain-of-custody documentation from mine to market.\n\n---\n*Compiled from licensed dealer data. Not investment advice.*`;

export async function GET() {
  const { default: pdf } = await import("@react-pdf/renderer");
  const { Document, Page, Text, View, StyleSheet } = pdf;

  const styles = StyleSheet.create({
    page: { padding: 50, fontSize: 10, fontFamily: "Helvetica", color: "#1A1A1A" },
    cover: { display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%" },
    title: { fontSize: 14, fontFamily: "Helvetica-Bold", letterSpacing: 2, marginBottom: 8 },
    subtitle: { fontSize: 9, color: "#9A938A", marginBottom: 20 },
    issue: { fontSize: 10, color: "#1A1A1A", marginBottom: 16 },
    heading: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6, color: "#1A1A1A" },
    para: { fontSize: 10, lineHeight: 1.6, marginBottom: 6, color: "#333333" },
    footer: { position: "absolute", bottom: 30, left: 50, right: 50, fontSize: 8, color: "#9A938A", textAlign: "center", borderTopWidth: 0.5, borderTopColor: "#EAE4DA", paddingTop: 8 },
  });

  const sections = SAMPLE_MD.split(/^## /m).filter(Boolean).slice(1);
  const body = sections.map((s) => {
    const [title, ...lines] = s.trim().split("\n");
    const text = lines.join("\n").replace(/^> /gm, "").trim();
    return { title: title.trim(), text };
  });

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.cover} fixed={false}>
          <Text style={styles.title}>AMES INTELLIGENCE</Text>
          <Text style={styles.subtitle}>Licensed Diamond Dealer · Botswana</Text>
          <Text style={styles.issue}>Sample — {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</Text>
        </View>
        {body.map((s, i) => (
          <View key={i}>
            <Text style={styles.heading}>{s.title}</Text>
            {s.text.split("\n\n").map((p, j) => (
              <Text key={j} style={styles.para}>{p}</Text>
            ))}
          </View>
        ))}
        <Text style={styles.footer} fixed>Compiled from licensed dealer data. Not investment advice.</Text>
      </Page>
    </Document>
  );

  const pdfBuffer = await pdf.renderToBuffer(doc);
  return new NextResponse(Buffer.from(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="ames-intelligence-sample.pdf"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
