import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-1988-pin",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "cache-control": "no-store"
};

const PROFILE = "owner";
const PIN_SHA256 = "fbdf2bdc4b2a45f3508c8ced68098f58375edbf2fe81ec8fe4b113185670939a";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8" }
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function cleanId(value: unknown) {
  const id = String(value || "").trim();
  return /^UC[A-Za-z0-9_-]+$/.test(id) ? id : "";
}

function cleanText(value: unknown, max = 600) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

const SYSTEM_SCOPES = ["live","latest","week"];
const HASHTAG_ID_RE = /^hash_[a-z0-9]+$/;

function cleanHashtagId(value: unknown) {
  const id = cleanText(value, 32).toLowerCase();
  return HASHTAG_ID_RE.test(id) ? id : "";
}

async function readHashtags(rest: string, headers: Record<string,string>, includeDisabled = true) {
  const query =
    rest + "/yt1988_hashtags?profile_key=eq." + encodeURIComponent(PROFILE) +
    (includeDisabled ? "" : "&enabled=eq.true") +
    "&select=hashtag_id,label,position,enabled,created_at,updated_at" +
    "&order=position.asc,created_at.asc,hashtag_id.asc";
  const res = await fetch(query, { headers });
  if (!res.ok) throw new Error("hashtag_read_failed:" + await res.text());
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).map((row: any) => ({
    id: cleanHashtagId(row?.hashtag_id),
    label: cleanText(row?.label, 40),
    position: Number(row?.position) || 0,
    enabled: row?.enabled !== false,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  })).filter((row: any) => row.id && row.label);
}

async function validManagedScope(
  rest: string,
  headers: Record<string,string>,
  scope: string
) {
  if (SYSTEM_SCOPES.includes(scope)) return true;
  const id = cleanHashtagId(scope);
  if (!id) return false;
  const res = await fetch(
    rest + "/yt1988_hashtags?profile_key=eq." + encodeURIComponent(PROFILE) +
    "&hashtag_id=eq." + encodeURIComponent(id) +
    "&enabled=eq.true&select=hashtag_id&limit=1",
    { headers }
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

function sourceScopeSignature(rows: any[], scope: string) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => cleanText(row?.scope, 32) === scope)
    .map((row) => {
      const id = cleanId(row?.channel_id);
      const status = String(row?.status || "");
      if (!id || (status !== "selected" && status !== "blocked")) return "";
      return [
        id,
        status,
        cleanText(row?.name, 180),
        cleanText(row?.thumbnail_url, 1000)
      ].join("|");
    })
    .filter(Boolean)
    .sort()
    .join("\n");
}

function triggerPackageRefresh(supabaseUrl: string, serviceKey: string, scopes: string[] = []) {
  const wanted = [...new Set(
    scopes
      .map((s) => cleanText(s, 32))
      .filter((s) => SYSTEM_SCOPES.includes(s) || HASHTAG_ID_RE.test(s))
  )];
  if (!wanted.length) return;
  const task = fetch(supabaseUrl + "/functions/v1/yt1988-refresh", {
    method: "POST",
    headers: {
      "apikey": serviceKey,
      "authorization": "Bearer " + serviceKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({ scopes: wanted })
  }).catch((error) => {
    console.warn("package refresh trigger failed", String(error));
  });
  try {
    (globalThis as any).EdgeRuntime?.waitUntil?.(task);
  } catch {}
}
function stateRows(state: any) {
  const rows = new Map<string, any>();
  const meta = new Map<string, any>();

  for (const item of Array.isArray(state?.customSources) ? state.customSources : []) {
    const id = cleanId(item?.id);
    if (!id) continue;
    meta.set(id, {
      name: cleanText(item?.name, 180),
      thumbnail_url: cleanText(item?.thumbnailUrl, 1000),
      subscribers: cleanText(item?.subscribers, 120)
    });
  }

  const put = (scopeRaw: unknown, idRaw: unknown, status: "selected" | "blocked") => {
    const scope = cleanText(scopeRaw, 32);
    const channel_id = cleanId(idRaw);
    if (!scope || !channel_id) return;
    if (status === "blocked" && scope !== "live") return;
    const key = scope + "|" + channel_id;
    const existing = rows.get(key);
    if (existing?.status === "blocked" && status === "selected") return;
    const m = meta.get(channel_id) || {};
    rows.set(key, {
      scope,
      channel_id,
      status,
      name: m.name || "",
      thumbnail_url: m.thumbnail_url || "",
      subscribers: m.subscribers || ""
    });
  };

  for (const id of Array.isArray(state?.selected) ? state.selected : []) put("general", id, "selected");
  for (const id of Array.isArray(state?.blocked) ? state.blocked : []) put("general", id, "blocked");

  const scopedSelected = state?.scopedSelected && typeof state.scopedSelected === "object" ? state.scopedSelected : {};
  const scopedBlocked = state?.scopedBlocked && typeof state.scopedBlocked === "object" ? state.scopedBlocked : {};

  for (const [scope, ids] of Object.entries(scopedSelected)) {
    for (const id of Array.isArray(ids) ? ids : []) put(scope, id, "selected");
  }
  for (const [scope, ids] of Object.entries(scopedBlocked)) {
    for (const id of Array.isArray(ids) ? ids : []) put(scope, id, "blocked");
  }

  return [...rows.values()];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "server_config" }, 500);

  const rest = supabaseUrl + "/rest/v1";
  const authHeaders = {
    "apikey": serviceKey,
    "authorization": "Bearer " + serviceKey,
    "content-type": "application/json"
  };

  if (req.method === "GET") {
    const res = await fetch(
      rest + "/yt1988_source_state?profile_key=eq." + encodeURIComponent(PROFILE) +
      "&select=scope,channel_id,status,name,thumbnail_url,subscribers,version,updated_at" +
      "&order=scope.asc,channel_id.asc",
      { headers: authHeaders }
    );
    if (!res.ok) return json({ ok: false, error: "read_failed", detail: await res.text() }, 502);

    const rows = await res.json();
    const allRows = Array.isArray(rows) ? rows : [];

    const legacyRes = await fetch(
      rest + "/yt1988_user_state?profile_key=eq." + encodeURIComponent(PROFILE) +
      "&select=state,version,updated_at&limit=1",
      { headers: authHeaders }
    );
    if (!legacyRes.ok) return json({ ok: false, error: "legacy_read_failed", detail: await legacyRes.text() }, 502);
    const legacyRows = await legacyRes.json();
    const legacy = Array.isArray(legacyRows) ? legacyRows[0] : null;

    let hashtags: any[] = [];
    try {
      hashtags = await readHashtags(rest, authHeaders, true);
    } catch (error) {
      return json({ ok: false, error: "hashtag_read_failed", detail: String(error) }, 502);
    }

    if (!allRows.length) {
      return json({
        ok: true,
        exists: !!legacy,
        state: legacy?.state ? { ...legacy.state, hashtags } : { hashtags },
        hashtags,
        version: Number(legacy?.version || 0),
        updated_at: legacy?.updated_at || null
      });
    }

    const savedLabels =
      legacy?.state?.sourceLabels &&
      typeof legacy.state.sourceLabels === "object" &&
      !Array.isArray(legacy.state.sourceLabels)
        ? legacy.state.sourceLabels
        : {};

    const state: any = {
      sourceScopeVersion: 4,
      hashtags,
      selected: [],
      blocked: [],
      scopedSelected: {},
      scopedBlocked: {},
      customSources: [],
      sourceGroups: {},
      sourceLabels: savedLabels,
      avatars: {}
    };
    const customById = new Map<string, any>();
    let version = Number(legacy?.version || 0);
    let updated_at: string | null = legacy?.updated_at || null;

    for (const row of allRows) {
      version = Math.max(version, Number(row?.version || 0));
      if (!updated_at || String(row?.updated_at || "") > updated_at) updated_at = String(row?.updated_at || "");
      const status = String(row?.status || "");
      if (status !== "selected" && status !== "blocked") continue;

      const scope = cleanText(row?.scope, 32) || "general";
      const id = cleanId(row?.channel_id);
      if (!id) continue;

      if (scope === "general") {
        if (status === "selected") state.selected.push(id);
      } else if (status === "selected") {
        if (!Array.isArray(state.scopedSelected[scope])) state.scopedSelected[scope] = [];
        state.scopedSelected[scope].push(id);
      } else if (scope === "live") {
        if (!Array.isArray(state.scopedBlocked.live)) state.scopedBlocked.live = [];
        state.scopedBlocked.live.push(id);
      }

      const name = cleanText(row?.name, 180);
      const thumbnailUrl = cleanText(row?.thumbnail_url, 1000);
      const subscribers = cleanText(row?.subscribers, 120);
      if (name || thumbnailUrl || subscribers) {
        const current = customById.get(id) || { id, name: "", thumbnailUrl: "", subscribers: "" };
        if (name) current.name = name;
        if (thumbnailUrl) current.thumbnailUrl = thumbnailUrl;
        if (subscribers) current.subscribers = subscribers;
        customById.set(id, current);
        if (thumbnailUrl) state.avatars[id] = thumbnailUrl;
      }
    }

    state.customSources = [...customById.values()];
    return json({ ok: true, exists: true, state, hashtags, version, updated_at });
  }

  if (req.method === "POST") {
    const pin = req.headers.get("x-1988-pin") || "";
    if (!pin || await sha256(pin) !== PIN_SHA256) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "bad_json" }, 400);
    }

    if (body?.op === "create_hashtag") {
      const label = cleanText(body?.label, 40);
      if (!label) return json({ ok: false, error: "bad_hashtag_label" }, 400);

      const suffix =
        Date.now().toString(36) +
        Math.floor(Math.random() * 0xffffff).toString(36).padStart(4, "0");
      const hashtagId = "hash_" + suffix.slice(-14);

      const posRes = await fetch(
        rest + "/yt1988_hashtags?profile_key=eq." + encodeURIComponent(PROFILE) +
        "&select=position&order=position.desc&limit=1",
        { headers: authHeaders }
      );
      const posRows = posRes.ok ? await posRes.json() : [];
      const position = (Number(Array.isArray(posRows) ? posRows[0]?.position : 0) || 0) + 10;

      const createRes = await fetch(
        rest + "/yt1988_hashtags?on_conflict=profile_key,hashtag_id",
        {
          method: "POST",
          headers: { ...authHeaders, "prefer": "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({
            profile_key: PROFILE,
            hashtag_id: hashtagId,
            label,
            position,
            enabled: true,
            updated_at: new Date().toISOString()
          })
        }
      );
      if (!createRes.ok) return json({ ok: false, error: "hashtag_create_failed", detail: await createRes.text() }, 502);

      const configRes = await fetch(
        rest + "/yt1988_refresh_config?on_conflict=profile_key,scope",
        {
          method: "POST",
          headers: { ...authHeaders, "prefer": "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            profile_key: PROFILE,
            scope: hashtagId,
            interval_minutes: 10,
            enabled: true,
            last_enqueued_at: null,
            updated_at: new Date().toISOString()
          })
        }
      );
      if (!configRes.ok) return json({ ok: false, error: "hashtag_config_failed", detail: await configRes.text() }, 502);

      const rows = await readHashtags(rest, authHeaders, true);
      return json({ ok: true, hashtag: rows.find((row: any) => row.id === hashtagId), hashtags: rows });
    }

    if (body?.op === "rename_hashtag") {
      const hashtagId = cleanHashtagId(body?.hashtag_id);
      const label = cleanText(body?.label, 40);
      if (!hashtagId || !label) return json({ ok: false, error: "bad_hashtag" }, 400);

      const res = await fetch(
        rest + "/yt1988_hashtags?profile_key=eq." + encodeURIComponent(PROFILE) +
        "&hashtag_id=eq." + encodeURIComponent(hashtagId),
        {
          method: "PATCH",
          headers: { ...authHeaders, "prefer": "return=representation" },
          body: JSON.stringify({ label, updated_at: new Date().toISOString() })
        }
      );
      if (!res.ok) return json({ ok: false, error: "hashtag_rename_failed", detail: await res.text() }, 502);
      const rows = await readHashtags(rest, authHeaders, true);
      return json({ ok: true, hashtags: rows });
    }

    if (body?.op === "reorder_hashtags") {
      const ids = (Array.isArray(body?.hashtag_ids) ? body.hashtag_ids : [])
        .map(cleanHashtagId)
        .filter(Boolean);
      if (!ids.length) return json({ ok: false, error: "bad_hashtag_order" }, 400);

      for (let index = 0; index < ids.length; index++) {
        const res = await fetch(
          rest + "/yt1988_hashtags?profile_key=eq." + encodeURIComponent(PROFILE) +
          "&hashtag_id=eq." + encodeURIComponent(ids[index]),
          {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({ position: (index + 1) * 10, updated_at: new Date().toISOString() })
          }
        );
        if (!res.ok) return json({ ok: false, error: "hashtag_reorder_failed", detail: await res.text() }, 502);
      }
      return json({ ok: true, hashtags: await readHashtags(rest, authHeaders, true) });
    }

    if (body?.op === "set_hashtag_enabled") {
      const hashtagId = cleanHashtagId(body?.hashtag_id);
      if (!hashtagId) return json({ ok: false, error: "bad_hashtag" }, 400);
      const enabled = body?.enabled === true;
      const res = await fetch(
        rest + "/yt1988_hashtags?profile_key=eq." + encodeURIComponent(PROFILE) +
        "&hashtag_id=eq." + encodeURIComponent(hashtagId),
        {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify({ enabled, updated_at: new Date().toISOString() })
        }
      );
      if (!res.ok) return json({ ok: false, error: "hashtag_update_failed", detail: await res.text() }, 502);

      await fetch(
        rest + "/yt1988_refresh_config?profile_key=eq." + encodeURIComponent(PROFILE) +
        "&scope=eq." + encodeURIComponent(hashtagId),
        {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify({ enabled, updated_at: new Date().toISOString() })
        }
      ).catch(() => {});

      if (!enabled) {
        await fetch(
          rest + "/yt1988_packages?profile_key=eq." + encodeURIComponent(PROFILE) +
          "&scope=eq." + encodeURIComponent(hashtagId),
          { method: "DELETE", headers: authHeaders }
        ).catch(() => {});
      }
      return json({ ok: true, hashtags: await readHashtags(rest, authHeaders, true) });
    }

    if (body?.op === "set_source") {
      const scope = cleanText(body?.scope, 32);
      const channelId = cleanId(body?.channel_id);
      let status = String(body?.status || "");
      const version = Math.max(1, Number(body?.version || Date.now()));
      if (status === "blocked" && scope !== "live") status = "normal";

      if (
        !scope ||
        !channelId ||
        !["selected", "blocked", "normal"].includes(status) ||
        !await validManagedScope(rest, authHeaders, scope)
      ) {
        return json({ ok: false, error: "bad_source_state" }, 400);
      }

      const source = body?.source && typeof body.source === "object" ? body.source : {};
      const rpc = await fetch(rest + "/rpc/yt1988_set_source_state", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          p_profile_key: PROFILE,
          p_scope: scope,
          p_channel_id: channelId,
          p_status: status,
          p_name: cleanText(source?.name, 180),
          p_thumbnail_url: cleanText(source?.thumbnailUrl, 1000),
          p_subscribers: cleanText(source?.subscribers, 120),
          p_version: version
        })
      });
      if (!rpc.ok) return json({ ok: false, error: "write_failed", detail: await rpc.text() }, 502);
      const saved = await rpc.json();
      triggerPackageRefresh(supabaseUrl, serviceKey, [scope]);
      return json({ ok: true, source: saved, version });
    }

    const state = body?.state;
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      return json({ ok: false, error: "bad_state" }, 400);
    }

    const version = Math.max(1, Number(body?.version || Date.now()));
    const rows = stateRows(state);

    // Full profile saves are presentation-only. Source selection/blocking is
    // row-authoritative and changes only through set_source, so an older
    // browser/PWA cannot erase dynamic hashtag state by posting a partial map.
    const changedScopes: string[] = [];

    // Keep presentation-only settings (such as renamed source tabs) in the
    // profile JSON while source selection/blocking remains row-authoritative.
    const stateSavedAt = new Date().toISOString();
    const stateRes = await fetch(
      rest + "/yt1988_user_state?on_conflict=profile_key",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "prefer": "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify({
          profile_key: PROFILE,
          state,
          version,
          updated_at: stateSavedAt
        })
      }
    );
    if (!stateRes.ok) {
      return json({ ok: false, error: "profile_write_failed", detail: await stateRes.text() }, 502);
    }

    return json({ ok: true, state, version, updated_at: stateSavedAt, refreshed_scopes: [] });
  }

  return json({ ok: false, error: "method_not_allowed" }, 405);
});
