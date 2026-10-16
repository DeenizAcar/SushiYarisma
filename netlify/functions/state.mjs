import { getStore } from "@netlify/blobs";

const KEY = "state";

function defaultState() {
  return {
    v: 0,
    people: [
      { id: "deniz", name: "Deniz" },
      { id: "guzin", name: "Güzin" },
      { id: "duru", name: "Duru" },
    ],
    items: [
      { id: "karides", name: "Karides", pts: 1 },
      { id: "karides-cipsi", name: "Karides cipsi", pts: 1 },
      { id: "kalamar", name: "Kalamar", pts: 1 },
      { id: "noodle", name: "Noodle (tabak)", pts: 3 },
      { id: "yengec-topu", name: "Yengeç topu", pts: 1 },
      { id: "cin-boregi", name: "Çin böreği", pts: 1 },
      { id: "sushi", name: "Sushi", pts: 1 },
    ],
    counts: {},
  };
}

function clean(str, max = 30) {
  return String(str ?? "").trim().slice(0, max);
}

function applyOp(s, op) {
  if (!op || typeof op !== "object") return;
  switch (op.t) {
    case "inc": {
      if (!s.people.some((p) => p.id === op.p)) return;
      if (!s.items.some((i) => i.id === op.i)) return;
      const d = Math.max(-50, Math.min(50, Number(op.d) || 0));
      const c = (s.counts[op.p] ||= {});
      c[op.i] = Math.max(0, (c[op.i] || 0) + d);
      return;
    }
    case "addPerson": {
      const id = clean(op.id, 40), name = clean(op.name);
      if (!id || !name || s.people.some((p) => p.id === id)) return;
      if (s.people.length >= 20) return;
      s.people.push({ id, name });
      return;
    }
    case "removePerson":
      s.people = s.people.filter((p) => p.id !== op.id);
      delete s.counts[op.id];
      return;
    case "addItem": {
      const id = clean(op.id, 40), name = clean(op.name);
      const pts = Math.max(1, Math.min(10, Math.round(Number(op.pts) || 1)));
      if (!id || !name || s.items.some((i) => i.id === id)) return;
      if (s.items.length >= 30) return;
      s.items.push({ id, name, pts });
      return;
    }
    case "removeItem":
      s.items = s.items.filter((i) => i.id !== op.id);
      for (const p of Object.keys(s.counts)) delete s.counts[p][op.id];
      return;
    case "reset":
      s.counts = {};
      return;
    case "factory": {
      const d = defaultState();
      s.people = d.people; s.items = d.items; s.counts = {};
      return;
    }
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req) => {
  const store = getStore({ name: "sushi-yarisma", consistency: "strong" });

  if (req.method === "GET") {
    const data = await store.get(KEY, { type: "json" });
    return json(data ?? defaultState());
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const ops = Array.isArray(body?.ops) ? body.ops.slice(0, 200) : [];

    // read-modify-write with ETag check so simultaneous taps don't overwrite each other
    for (let attempt = 0; attempt < 10; attempt++) {
      const cur = await store.getWithMetadata(KEY, { type: "json" });
      const state = cur?.data ?? defaultState();
      for (const op of ops) applyOp(state, op);
      state.v = (state.v || 0) + 1;
      const res = await store.setJSON(
        KEY, state, cur?.etag ? { onlyIfMatch: cur.etag } : { onlyIfNew: true }
      );
      if (!res || res.modified !== false) return json(state);
      await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
    }
    return json({ error: "busy" }, 503);
  }

  return json({ error: "method" }, 405);
};

export const config = { path: "/api/state" };
