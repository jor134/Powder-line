/* POWDERLINE lobby signaling — Upstash Redis REST.
   Needs UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel env vars.
   Tokens stay server-side; the browser only ever talks to /api/signal. */

const REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const TTL_ROOM = 1800; // 30 min
const TTL_SDP = 600;   // 10 min
const MAX_SDP = 24000;

async function redis(cmd) {
  const r = await fetch(REST_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + REST_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd)
  });
  if (!r.ok) throw new Error("upstash " + r.status);
  const j = await r.json();
  return j.result;
}

function readBody(req) {
  if (req.body) {
    if (typeof req.body === "string") { try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve({}); } }
    return Promise.resolve(req.body);
  }
  return new Promise(resolve => {
    let d = "";
    req.on("data", c => { d += c; if (d.length > 64000) { d = ""; req.destroy(); } });
    req.on("end", () => { try { resolve(JSON.parse(d || "{}")); } catch (e) { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ e: "POST only" });
  if (!REST_URL || !REST_TOKEN) return res.status(500).json({ e: "signaling not configured" });

  const b = await readBody(req);
  const action = String(b.a || "");
  const room = String(b.room || "").toUpperCase();
  const id = String(b.id || "");

  if (!/^[A-Z0-9]{4,6}$/.test(room)) return res.status(400).json({ e: "bad room code" });
  if (action !== "host" && action !== "joins" && !/^[a-z0-9]{4,16}$/.test(id)) {
    return res.status(400).json({ e: "bad rider id" });
  }

  const K = "pl:" + room;

  try {
    switch (action) {
      case "host": {
        const seed = Math.abs(parseInt(b.seed, 10) || 1) % 1000000;
        // NX so two hosts can never land on the same code
        const set = await redis(["SET", K + ":h", String(seed), "EX", TTL_ROOM, "NX"]);
        if (set === null) return res.json({ taken: 1 });
        await redis(["DEL", K + ":j"]);
        return res.json({ ok: 1, seed });
      }
      case "join": {
        const seed = await redis(["GET", K + ":h"]);
        if (seed === null) return res.status(404).json({ e: "no such room" });
        await redis(["RPUSH", K + ":j", id]);
        await redis(["EXPIRE", K + ":j", TTL_ROOM]);
        return res.json({ ok: 1, seed: parseInt(seed, 10) });
      }
      case "joins": {
        const joins = await redis(["LRANGE", K + ":j", 0, 15]);
        return res.json({ joins: joins || [] });
      }
      case "offer":
      case "answer": {
        const sdp = String(b.sdp || "");
        if (!sdp || sdp.length > MAX_SDP) return res.status(413).json({ e: "bad sdp" });
        await redis(["SET", K + (action === "offer" ? ":o:" : ":a:") + id, sdp, "EX", TTL_SDP]);
        return res.json({ ok: 1 });
      }
      case "get": {
        const key = K + (b.which === "a" ? ":a:" : ":o:") + id;
        const sdp = await redis(["GET", key]);
        if (sdp && b.consume) await redis(["DEL", key]);
        return res.json({ sdp: sdp || null });
      }
      case "close": {
        await redis(["DEL", K + ":h"]);
        await redis(["DEL", K + ":j"]);
        return res.json({ ok: 1 });
      }
      default:
        return res.status(400).json({ e: "unknown action" });
    }
  } catch (e) {
    return res.status(502).json({ e: String((e && e.message) || e) });
  }
};
