import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

interface ReportData {
  reportType: string;
  issueLabel: string;
  tierLabel?: string;
  period: { start: string; end: string };
  stones: {
    total: number;
    byCategory: Record<string, number>;
    priceMin: number | null;
    priceMax: number | null;
    priceMedian: number | null;
  };
  orders: { total: number; reserved: number; sold: number; totalValue: number; };
  topQuestions: string[];
  generatedAt: string;
}

const styles = StyleSheet.create({
  page: { padding: 50, fontSize: 10, fontFamily: "Helvetica", color: "#1A1A1A" },
  cover: { display: "flex", flexDirection: "column" as const, justifyContent: "center", alignItems: "center", height: "100%", marginBottom: 30 },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", letterSpacing: 2, marginBottom: 8, textAlign: "center" },
  subtitle: { fontSize: 9, color: "#9A938A", marginBottom: 20, textAlign: "center" },
  issue: { fontSize: 10, color: "#1A1A1A", textAlign: "center" },
  heading: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6, color: "#1A1A1A" },
  para: { fontSize: 10, lineHeight: 1.6, marginBottom: 6, color: "#333333" },
  tableRow: { fontSize: 9, marginBottom: 2 },
  footer: { position: "absolute", bottom: 30, left: 50, right: 50, fontSize: 8, color: "#9A938A", textAlign: "center", borderTopWidth: 0.5, borderTopColor: "#EAE4DA", paddingTop: 8 },
});

export function ReportPDF({ data, prose }: { data: ReportData; prose: string }) {
  const sections = prose.split(/\n(?=#+\s|\d+\.\s|\*\*)/).filter(Boolean);
  const categories = Object.entries(data.stones.byCategory);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.cover}>
          <Text style={styles.title}>AMES INTELLIGENCE</Text>
          <Text style={styles.subtitle}>Licensed Diamond Dealer � Botswana</Text>
          {data.tierLabel ? <Text style={{ fontSize: 9, color: "#C9A227", marginBottom: 10, textAlign: "center" }}>{data.tierLabel}</Text> : null}
          <Text style={styles.issue}>{data.issueLabel}</Text>
        </View>
        <View>
          <Text style={styles.heading}>Inventory Summary</Text>
          <Text style={styles.tableRow}>Total stones: {data.stones.total}</Text>
          {categories.map(([cat, count]) => (
            <Text key={cat} style={styles.tableRow}>{cat}: {count}</Text>
          ))}
          {data.stones.priceMin !== null && (
            <Text style={styles.tableRow}>
              {"Price range: $" + (data.stones.priceMin?.toLocaleString() || "0") + " � $" + (data.stones.priceMax?.toLocaleString() || "N/A")}
              {data.stones.priceMedian !== null ? " (median: $" + data.stones.priceMedian.toLocaleString() + ")" : ""}
            </Text>
          )}
        </View>
        <View style={{ marginTop: 16 }}>
          <Text style={styles.heading}>Activity This Period</Text>
          <Text style={styles.tableRow}>Total orders: {data.orders.total}</Text>
          <Text style={styles.tableRow}>Reserved: {data.orders.reserved}</Text>
          <Text style={styles.tableRow}>Sold: {data.orders.sold}</Text>
          <Text style={styles.tableRow}>{"Total value: $" + data.orders.totalValue.toLocaleString()}</Text>
        </View>
        {data.topQuestions.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.heading}>Top Buyer Questions</Text>
            {data.topQuestions.map((q: string, i: number) => (
              <Text key={i} style={styles.tableRow}>{i + 1}. {q}</Text>
            ))}
          </View>
        )}
        <View style={{ marginTop: 24 }}>
          {sections.map((section: string, i: number) => {
            const secLines = section.trim().split("\n");
            const title = secLines[0]?.replace(/^[# +s*]+/, "").replace(/\*\*$/, "").trim() || "";
            const body = secLines.slice(1).join("\n").trim();
            return (
              <View key={i} style={{ marginBottom: 12 }}>
                {title && <Text style={styles.heading}>{title}</Text>}
                {body.split("\n\n").map((p: string, j: number) => (
                  <Text key={j} style={styles.para}>{p}</Text>
                ))}
              </View>
            );
          })}
        </View>
        <Text style={styles.footer} fixed>
          Compiled from licensed dealer data. Not investment advice.
        </Text>
      </Page>
    </Document>
  );
}
