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
const PAYMENT_URL_1 = process.env.PAYMENT_URL_1 || "";
const PAYMENT_URL_2 = process.env.PAYMENT_URL_2 || "";

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
    showsTable: SHOWS_TABLE,
    paymentUrl1: PAYMENT_URL_1,
    paymentUrl2: PAYMENT_URL_2,
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

function flattenPayload(p) {
  const f = {};
  f.trip_id        = p.trip_id      || "";
  f.trip_name      = p.trip_name    || "";
  f.trip_type      = p.trip_type    || "";
  f.submitted_at   = p.submitted_at || "";
  f.travelers_count = String(p.travelersCount || "1");
  f.independent_flight = p.independentFlight ? "כן" : "לא";
  f.insurance_opt_in   = p.insuranceOptIn    ? "כן" : "לא";
  f.insurance_follow_up           = p.insuranceOfferFollowUp           ? "כן" : "לא";
  f.insurance_parallel_confirmed  = p.insuranceOfferParallelConfirmed  ? "כן" : "לא";
  f.heard_about_us = p.heardAboutUs || "";

  (p.travelers || []).forEach((t, i) => {
    const n = i + 1;
    f[`traveler${n}_fullNameHe`]      = t.fullNameHe      || "";
    f[`traveler${n}_firstNameEn`]     = t.firstNameEn     || "";
    f[`traveler${n}_lastNameEn`]      = t.lastNameEn      || "";
    f[`traveler${n}_passportNum`]     = t.passportNum     || "";
    f[`traveler${n}_passportExpiry`]  = t.passportExpiry  || "";
    f[`traveler${n}_dob`]             = t.dob             || "";
    f[`traveler${n}_profession`]      = t.profession      || "";
    f[`traveler${n}_meal`]            = t.meal            || "";
    f[`traveler${n}_frequentFlyer`]   = t.frequentFlyer   || "";
    f[`traveler${n}_seat`]            = t.seat            || "";
    f[`traveler${n}_flightRequests`]  = t.flightRequests  || "";
  });

  const addr = p.address || {};
  f.address_street = addr.street || "";
  f.address_city   = addr.city   || "";
  f.address_zip    = addr.zip    || "";
  f.address_mobile = addr.mobile || "";
  f.address_home   = addr.home   || "";
  f.address_email  = addr.email  || "";

  const addr2 = p.address2 || {};
  f.address2_street = addr2.street || "";
  f.address2_city   = addr2.city   || "";
  f.address2_zip    = addr2.zip    || "";
  f.address2_mobile = addr2.mobile || "";
  f.address2_home   = addr2.home   || "";
  f.address2_email  = addr2.email  || "";

  const em = p.emergency || {};
  f.emergency_name   = em.name   || "";
  f.emergency_phone1 = em.phone1 || "";
  f.emergency_phone2 = em.phone2 || "";

  const c = p.cruise || {};
  f.cruise_roomOptionId  = c.roomOptionId  || "";
  f.cruise_wantsRoommate = c.wantsRoommate ? "כן" : "לא";
  f.cruise_roommateName  = c.roommateName  || "";
  f.cruise_diningTable   = c.diningTable   || "";

  const sh = p.shows || {};
  f.shows_notes    = sh.notes || "";
  f.shows_selected = Object.entries(sh.selected || {})
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ");

  const pay = p.payment || {};
  f.payment_frequentTraveler      = pay.frequentTraveler ? "כן" : "לא";
  f.payment_frequentTravelerTrips = pay.frequentTravelerTrips || "";
  f.payment_method                = pay.method || "";
  f.payment_date                  = pay.date   || "";
  // signatureData excluded (base64 image)

  const consents = p.consents || {};
  f.consents = Object.entries(consents)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ");

  return f;
}

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
      body: JSON.stringify(flattenPayload(payload))
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

app.get("/thank-you", (req, res) => {
  res.sendFile(path.join(__dirname, "thank-you.html"));
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
