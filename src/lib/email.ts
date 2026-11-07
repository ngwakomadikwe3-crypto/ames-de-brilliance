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

  return `New sourcing request received.\n\n  Request: ${req.id}\n  Buyer:   ${req.buyer_name} (${req.company})\n  Country: ${req.country}\n  Contact: ${req.contact}\n  Type:    ${req.type}\n\nREQUIREMENT:\n  ${req.shape} ${req.carat_min}\u2013${req.carat_max}ct ${req.color} ${req.clarity}${cert}\n${kp}${decl}\n${req.notes ? `\nNOTES:\n  ${req.notes}\n` : ""}\nLog in to the dashboard to view, update status, or generate an offer.\nhttps://houseofames.com/dashboard`;
}

function transport() {
  if (!SMTP_HOST || !SMTP_USER) return null;
  return nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
}

/** Studio invite for a verified jeweller. Returns false when mail is not configured (staff then share the link). */
export async function sendJewellerInvite(to: string, businessName: string, url: string, expires: string): Promise<boolean> {
  const mail = transport(); if (!mail) return false;
  try {
    await mail.sendMail({ from: `"HOUSEofAMES" <${NOTIFY_FROM}>`, to, subject: 'Your HOUSEofAMES jeweller studio is ready',
      text: `Hello ${businessName},\n\nHOUSEofAMES has verified your business. Open this link to set up your jeweller studio, where you can upload CAD designs and have them converted to 3D. Each piece is reviewed and approved by HOUSEofAMES before it appears in the Boutique:\n\n${url}\n\nSign in (or create your HOUSEofAMES account) with this email address, ${to}, then accept the invite. The link works once and expires on ${expires.slice(0, 10)}.\n\nHOUSEofAMES` });
    return true;
  } catch (err: any) { console.error('[email] Invite failed:', err.message); return false; }
}

/** Tell staff a jeweller piece went live automatically, so it can be checked or withdrawn. */
/** Tell the Owner a converted piece is waiting for approval (posted by staff or a jeweller). */
export async function sendApprovalRequest(listingId: string, name: string, category: string): Promise<boolean> {
  const mail = transport(); if (!mail) return false;
  try {
    await mail.sendMail({ from: `"HOUSEofAMES" <${NOTIFY_FROM}>`, to: NOTIFY_TO, subject: `[HOUSEofAMES] Waiting for your approval: ${name}`,
      text: `"${name}" (${category}) has been converted to 3D and is waiting for your approval before it appears in the Boutique.\n\nReview and approve: https://houseofames.com/dashboard/listings` });
    return true;
  } catch (err: any) { console.error('[email] Approval request failed:', err.message); return false; }
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
      from: `"HOUSEofAMES" <${NOTIFY_FROM}>`,
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
