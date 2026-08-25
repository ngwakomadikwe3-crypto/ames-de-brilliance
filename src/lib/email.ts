import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const NOTIFY_TO = process.env.NOTIFY_EMAIL || SMTP_USER;
const NOTIFY_FROM = process.env.SMTP_FROM || SMTP_USER;

export interface SourcingRequestEmail {
  id: string;
  buyer_name: string;
  company: string;
  country: string;
  contact: string;
  type: string;
  shape: string;
  carat_min: string;
  carat_max: string;
  color: string;
  clarity: string;
  certification: string;
  notes: string;
  kp_licence?: string;
  kp_country?: string;
}

function buildSubject(req: SourcingRequestEmail): string {
  return `[AMES] New sourcing request — ${req.company || req.buyer_name} — ${req.shape} ${req.carat_min}\u2013${req.carat_max}ct`;
}

function buildBody(req: SourcingRequestEmail): string {
  const cert = req.certification === "None" ? "" : ` ${req.certification}`;
  const kp = req.kp_licence
    ? `\n\nKP Import Licence: ${req.kp_licence} (${req.kp_country})`
    : "";
  const decl = req.type === "rough" ? "\nDeclaration on file: Yes" : "";

  return `New sourcing request received.\n\n  Request: ${req.id}\n  Buyer:   ${req.buyer_name} (${req.company})\n  Country: ${req.country}\n  Contact: ${req.contact}\n  Type:    ${req.type}\n\nREQUIREMENT:\n  ${req.shape} ${req.carat_min}\u2013${req.carat_max}ct ${req.color} ${req.clarity}${cert}\n${kp}${decl}\n${req.notes ? `\nNOTES:\n  ${req.notes}\n` : ""}\nLog in to the dashboard to view, update status, or generate an offer.\nhttp://localhost:3000/dashboard`;
}

export async function sendSourcingNotification(req: SourcingRequestEmail): Promise<boolean> {
  if (!SMTP_HOST || !SMTP_USER) {
    console.log("[email] SMTP not configured, skipping notification for", req.id);
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"AMES DE BRILLIANTE" <${NOTIFY_FROM}>`,
      to: NOTIFY_TO,
      subject: buildSubject(req),
      text: buildBody(req),
    });

    console.log("[email] Notification sent for", req.id);
    return true;
  } catch (err: any) {
    console.error("[email] Failed to send notification:", err.message);
    return false;
  }
}
