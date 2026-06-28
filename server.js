const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const PROJECTS_TABLE = process.env.AIRTABLE_PROJECTS_TABLE || "tblEkbHGGpTnRyFgL";
const CRUISE_TABLE = process.env.AIRTABLE_CRUISE_TABLE || "tbl8tQShnBjmO4uUf";
const SHOWS_TABLE = process.env.AIRTABLE_SHOWS_TABLE || "tblZAv8IFt1rxBszk";
const CRUISE_TRIP_LINK_FIELD_ID = process.env.AIRTABLE_CRUISE_TRIP_LINK_FIELD_ID || "fldq4NaVbTEsGvpNu";
const DEFAULT_TRIP_ID = process.env.DEFAULT_TRIP_ID || "";
const SUBMIT_WEBHOOK_URL = process.env.SUBMIT_WEBHOOK_URL || "";
const WAITLIST_WEBHOOK_URL = process.env.WAITLIST_WEBHOOK_URL || "";

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname)));

function assertAirtableEnv() {
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    throw new Error("Missing AIRTABLE_TOKEN or AIRTABLE_BASE_ID");
  }
}

async function airtableGetTableRecord(tableId, recordId) {
  assertAirtableEnv();
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}/${recordId}?returnFieldsByFieldId=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable GET failed (${res.status}): ${body}`);
  }
  return res.json();
}

async function airtableGetTableRecordByName(tableId, recordId) {
  assertAirtableEnv();
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}/${recordId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable GET by name failed (${res.status}): ${body}`);
  }
  return res.json();
}

async function airtableListRecords(tableId, options = {}) {
  assertAirtableEnv();
  const params = new URLSearchParams({ returnFieldsByFieldId: "true" });
  if (options.filterByFormula) {
    params.set("filterByFormula", options.filterByFormula);
  }
  if (options.maxRecords) {
    params.set("maxRecords", String(options.maxRecords));
  }

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable LIST failed (${res.status}): ${body}`);
  }
  return res.json();
}

async function airtableListRecordsByName(tableId, options = {}) {
  assertAirtableEnv();
  const params = new URLSearchParams();
  if (options.filterByFormula) {
    params.set("filterByFormula", options.filterByFormula);
  }
  if (options.maxRecords) {
    params.set("maxRecords", String(options.maxRecords));
  }

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable LIST by name failed (${res.status}): ${body}`);
  }
  return res.json();
}

function mergeNamedFields(recordsById, recordsByName) {
  const byNameMap = new Map((recordsByName || []).map((record) => [record.id, record.fields || {}]));
  return (recordsById || []).map((record) => ({
    ...record,
    namedFields: byNameMap.get(record.id) || {}
  }));
}

app.get("/api/config", (req, res) => {
  res.json({
    defaultTripId: DEFAULT_TRIP_ID,
    webhookConfigured: Boolean(SUBMIT_WEBHOOK_URL),
    projectsTable: PROJECTS_TABLE,
    cruiseTable: CRUISE_TABLE,
    showsTable: SHOWS_TABLE
  });
});

app.get("/api/trips/:id", async (req, res) => {
  try {
    const [recordById, recordByName] = await Promise.all([
      airtableGetTableRecord(PROJECTS_TABLE, req.params.id),
      airtableGetTableRecordByName(PROJECTS_TABLE, req.params.id).catch(() => null)
    ]);

    console.log("[trip] all fields:", JSON.stringify(recordById.fields || {}, null, 2));
    console.log("[trip] named fields:", JSON.stringify(recordByName?.fields || {}, null, 2));
    
    res.json({
      ...recordById,
      namedFields: recordByName?.fields || {}
    });
  } catch (err) {
    res.status(502).json({ error: "trip_fetch_failed", message: err.message });
  }
});

app.get("/api/cruise-options", async (req, res) => {
  try {
    const ids = String(req.query.ids || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!ids.length) {
      return res.json({ records: [] });
    }

    const recordsById = await Promise.all(
      ids.map((id) => airtableGetTableRecord(CRUISE_TABLE, id).catch(() => null))
    );

    const recordsByName = await Promise.all(
      ids.map((id) => airtableGetTableRecordByName(CRUISE_TABLE, id).catch(() => null))
    );

    res.json({ records: mergeNamedFields(recordsById.filter(Boolean), recordsByName.filter(Boolean)) });
  } catch (err) {
    res.status(502).json({ error: "cruise_fetch_failed", message: err.message });
  }
});

app.get("/api/shows-options", async (req, res) => {
  try {
    const ids = String(req.query.ids || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!ids.length) {
      return res.json({ records: [] });
    }

    const recordsById = await Promise.all(
      ids.map((id) => airtableGetTableRecord(SHOWS_TABLE, id).catch(() => null))
    );

    const recordsByName = await Promise.all(
      ids.map((id) => airtableGetTableRecordByName(SHOWS_TABLE, id).catch(() => null))
    );

    res.json({ records: mergeNamedFields(recordsById.filter(Boolean), recordsByName.filter(Boolean)) });
  } catch (err) {
    res.status(502).json({ error: "shows_fetch_failed", message: err.message });
  }
});

app.get("/api/cruise-options/by-trip/:tripId", async (req, res) => {
  try {
    const tripId = req.params.tripId;
    const formula = `FIND(\"${tripId}\", ARRAYJOIN({${CRUISE_TRIP_LINK_FIELD_ID}}))`;
    const dataById = await airtableListRecords(CRUISE_TABLE, {
      filterByFormula: formula,
      maxRecords: 100
    });
    const dataByName = await airtableListRecordsByName(CRUISE_TABLE, {
      filterByFormula: formula,
      maxRecords: 100
    });
    res.json({ records: mergeNamedFields(dataById.records || [], dataByName.records || []) });
  } catch (err) {
    res.status(502).json({ error: "cruise_by_trip_fetch_failed", message: err.message });
  }
});

app.post("/api/submissions", async (req, res) => {
  const payload = req.body || {};

  if (!SUBMIT_WEBHOOK_URL) {
    console.log("[submission:draft]", JSON.stringify(payload, null, 2));
    return res.json({ ok: true, mode: "dry-run" });
  }

  try {
    const webhookRes = await fetch(SUBMIT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!webhookRes.ok) {
      const body = await webhookRes.text();
      return res.status(502).json({
        ok: false,
        error: "webhook_failed",
        status: webhookRes.status,
        message: body
      });
    }

    res.json({ ok: true, mode: "webhook" });
  } catch (err) {
    res.status(502).json({ ok: false, error: "webhook_failed", message: err.message });
  }
});

app.post("/api/waitlist", async (req, res) => {
  const payload = req.body || {};

  if (!WAITLIST_WEBHOOK_URL) {
    console.log("[waitlist:draft]", JSON.stringify(payload, null, 2));
    return res.json({ ok: true, mode: "dry-run" });
  }

  try {
    const webhookRes = await fetch(WAITLIST_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!webhookRes.ok) {
      const body = await webhookRes.text();
      return res.status(502).json({
        ok: false,
        error: "webhook_failed",
        status: webhookRes.status,
        message: body
      });
    }

    res.json({ ok: true, mode: "webhook" });
  } catch (err) {
    res.status(502).json({ ok: false, error: "webhook_failed", message: err.message });
  }
});

app.get("/health", (req, res) => {
  const hasAirtable = Boolean(AIRTABLE_TOKEN && AIRTABLE_BASE_ID);
  res.json({ ok: true, hasAirtable });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "trip-registration.html"));
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Tevel scaffold running at http://localhost:${PORT}`);
  });
}
