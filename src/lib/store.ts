import fs from "fs";
import path from "path";

export interface SourcingRequest {
  id: string; date: string; buyerName: string; company: string; country: string;
  contact: string; type: string; shape: string; caratMin: string; caratMax: string;
  color: string; clarity: string; certification: string; notes: string;
  mandate: string; status: "New" | "Sourcing" | "Quoted" | "Closed"; createdAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "requests.json");

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, "[]", "utf-8");
}

export function getAllRequests(): SourcingRequest[] { ensure(); return JSON.parse(fs.readFileSync(FILE, "utf-8")); }

export function addRequest(data: Omit<SourcingRequest, "id"|"date"|"mandate"|"status"|"createdAt">): SourcingRequest {
  const requests = getAllRequests();
  const now = new Date();
  const id = `SR-${now.getFullYear()}-${String(requests.length + 1).padStart(4, "0")}`;
  const date = now.toISOString().split("T")[0];
  const caratRange = data.caratMin === data.caratMax ? `${data.caratMin}ct` : `${data.caratMin}–${data.caratMax}ct`;
  const cert = data.certification === "None" ? "" : ` ${data.certification}`;
  const lines = [
    `SOURCING REQUEST`, ``,
    `Buyer: ${data.company}${data.country ? ` (${data.country})` : ""}`,
    `Contact: ${data.contact}`,
    `Type: ${data.type}`, ``,
    `Requirement: ${data.shape} ${caratRange} ${data.color} ${data.clarity}${cert}`,
  ];
  if (data.notes) lines.push(``, `Notes: ${data.notes}`);
  const req: SourcingRequest = { id, date, ...data, mandate: lines.join("\n"), status: "New", createdAt: now.toISOString() };
  requests.push(req);
  fs.writeFileSync(FILE, JSON.stringify(requests, null, 2), "utf-8");
  return req;
}

export function updateRequest(id: string, updates: Partial<Pick<SourcingRequest, "status">>): SourcingRequest | null {
  const requests = getAllRequests();
  const idx = requests.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  if (updates.status !== undefined) requests[idx].status = updates.status;
  fs.writeFileSync(FILE, JSON.stringify(requests, null, 2), "utf-8");
  return requests[idx];
}
