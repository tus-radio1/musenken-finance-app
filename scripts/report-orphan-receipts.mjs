// Read-only inventory: deliberately no delete mode or storage mutation API.
import { createClient } from "@supabase/supabase-js";
import { auditReceiptNames, receiptObjectName } from "../lib/receipt-object-name.mjs";

const PAGE_SIZE = 500;
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function rows(table, columns) {
  const result = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client.from(table).select(columns).order("id").range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    result.push(...data);
    if (data.length < PAGE_SIZE) return result;
  }
}

async function objects(prefix = "") {
  const result = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client.storage.from("receipts").list(prefix, {
      limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    for (const object of data) {
      const name = prefix ? `${prefix}/${object.name}` : object.name;
      if (!object.id) result.push(...await objects(name));
      else result.push({ name, size: Number(object.metadata?.size ?? 0), created_at: object.created_at });
    }
    if (data.length < PAGE_SIZE) return result;
  }
}

const files = await objects();
const references = new Set();
for (const table of ["transactions", "subsidy_items"]) {
  const columns = table === "transactions" ? "id, receipt_url" : "id, receipt_url, evidence_url";
  for (const row of await rows(table, columns)) {
    for (const value of [row.receipt_url, row.evidence_url]) {
      const name = receiptObjectName(value);
      if (name) references.add(name);
    }
  }
}
const auditReferences = new Set((await rows("audit_logs", "id, old_data, new_data")).flatMap(auditReceiptNames));
const orphans = files.filter((file) => !references.has(file.name));
const bytes = (items) => items.reduce((sum, file) => sum + file.size, 0);
console.log(`objects=${files.length} bytes=${bytes(files)} distinct_references=${references.size}`);
console.log(`orphans=${orphans.length} bytes=${bytes(orphans)}`);
for (const classification of ["in_audit_log", "never_referenced"]) {
  const matches = orphans.filter((file) => auditReferences.has(file.name) === (classification === "in_audit_log"));
  console.log(`${classification}: count=${matches.length} bytes=${bytes(matches)}`);
  for (const file of matches) console.log(`${classification}\t${file.name}\t${file.size}\t${file.created_at}`);
}
