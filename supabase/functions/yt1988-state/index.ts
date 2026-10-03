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
      // LIVE is demand-only on Cloudflare. Source edits are read directly by
      // the next active LIVE scan and must not wake the legacy Supabase refresh.
      .filter((s) => s !== "live")
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

    const directoryRes = await fetch(
      rest + "/yt1988_channel_directory?profile_key=eq." + encodeURIComponent(PROFILE) +
      "&select=channel_id,name,thumbnail_url,subscribers,handle,description,verified,verified_known,subscriber_count,view_count,video_count,profile_url,profile_checked_at,source,last_seen_at,updated_at" +
      "&order=channel_id.asc",
      { headers: authHeaders }
    );
    if (!directoryRes.ok) {
      return json({ ok: false, error: "channel_directory_read_failed", detail: await directoryRes.text() }, 502);
    }
    const directoryRowsRaw = await directoryRes.json();
    const directoryRows = Array.isArray(directoryRowsRaw) ? directoryRowsRaw : [];

    // One normalized channel library for the whole web. Canonical data stays
    // in the existing platform tables; this response only normalizes it.
    const tiktokRes = await fetch(
      rest + "/yt1988_tiktok_channels?" +
      "select=handle,selected,user_id,display_name,bio,verified,avatar_source_url,avatar_stored_url," +
      "follower_count,following_count,heart_count,video_count,profile_source,profile_checked_at,updated_at" +
      "&order=handle.asc",
      { headers: authHeaders }
    ).catch(() => null);
    const tiktokRowsRaw = tiktokRes?.ok ? await tiktokRes.json().catch(() => []) : [];
    const tiktokRows = Array.isArray(tiktokRowsRaw) ? tiktokRowsRaw : [];

    const youtubeRelation = new Map<string, {
      selected: Set<string>;
      blocked: Set<string>;
      suggested: Set<string>;
    }>();
    for (const row of allRows) {
      const id = cleanId(row?.channel_id);
      const scope = cleanText(row?.scope, 32) || "general";
      const status = cleanText(row?.status, 16);
      if (!id || !["selected","blocked","normal"].includes(status)) continue;
      if (!youtubeRelation.has(id)) {
        youtubeRelation.set(id, {
          selected: new Set<string>(),
          blocked: new Set<string>(),
          suggested: new Set<string>()
        });
      }
      const relation = youtubeRelation.get(id)!;
      if (status === "selected") relation.selected.add(scope);
      else if (status === "blocked") relation.blocked.add(scope);
      else relation.suggested.add(scope);
    }

    const stat = (value: any) => {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    };
    const channelLibrary: any[] = directoryRows.map((row: any) => {
      const id = cleanId(row?.channel_id);
      const relation = youtubeRelation.get(id) || {
        selected: new Set<string>(),
        blocked: new Set<string>(),
        suggested: new Set<string>()
      };
      const selectedScopes = [...relation.selected].sort();
      const blockedScopes = [...relation.blocked].sort();
      const suggestedScopes = [...relation.suggested].sort();
      const avatar = cleanText(row?.thumbnail_url, 1000);
      const subscriberCount = stat(row?.subscriber_count);
      const verificationKnown = row?.verified_known === true;
      const verified = verificationKnown ? row?.verified === true : null;
      return {
        key: "youtube:" + id,
        platform: "youtube",
        id,
        userId: id,
        handle: cleanText(row?.handle, 120),
        name: cleanText(row?.name, 180),
        description: cleanText(row?.description, 2000),
        profileUrl: cleanText(row?.profile_url, 1000) || ("https://www.youtube.com/channel/" + id),
        avatar: {
          url: avatar,
          sourceUrl: avatar,
          storedUrl: ""
        },
        verified,
        verification: {
          known: verificationKnown,
          verified,
          badge: verified === true ? "verified" : ""
        },
        badges: verified === true ? ["verified"] : [],
        stats: {
          followers: subscriberCount,
          subscribers: subscriberCount,
          subscriberText: cleanText(row?.subscribers, 120),
          following: null,
          likes: null,
          views: stat(row?.view_count),
          videos: stat(row?.video_count)
        },
        status: {
          selected: selectedScopes.length > 0,
          blocked: blockedScopes.length > 0,
          suggested: suggestedScopes.length > 0,
          selectedScopes,
          blockedScopes,
          suggestedScopes
        },
        source: cleanText(row?.source, 80),
        checkedAt: row?.profile_checked_at || null,
        updatedAt: row?.updated_at || null
      };
    }).filter((row: any) => row.id);

    for (const row of tiktokRows) {
      const handle = cleanText(row?.handle, 120).replace(/^@/,"");
      if (!handle) continue;
      const avatarSource = cleanText(row?.avatar_source_url, 1000);
      const avatarStored = cleanText(row?.avatar_stored_url, 1000);
      const verificationKnown = !!row?.profile_checked_at;
      const verified = verificationKnown ? row?.verified === true : null;
      const selected = row?.selected === true;
      channelLibrary.push({
        key: "tiktok:" + handle.toLowerCase(),
        platform: "tiktok",
        id: cleanText(row?.user_id, 120) || handle,
        userId: cleanText(row?.user_id, 120),
        handle,
        name: cleanText(row?.display_name, 180) || ("@" + handle),
        description: cleanText(row?.bio, 2000),
        profileUrl: "https://www.tiktok.com/@" + handle,
        avatar: {
          url: avatarStored || avatarSource,
          sourceUrl: avatarSource,
          storedUrl: avatarStored
        },
        verified,
        verification: {
          known: verificationKnown,
          verified,
          badge: verified === true ? "verified" : ""
        },
        badges: verified === true ? ["verified"] : [],
        stats: {
          followers: stat(row?.follower_count),
          subscribers: null,
          subscriberText: "",
          following: stat(row?.following_count),
          likes: stat(row?.heart_count),
          views: null,
          videos: stat(row?.video_count)
        },
        status: {
          selected,
          blocked: false,
          suggested: false,
          selectedScopes: selected ? ["tiktok"] : [],
          blockedScopes: [],
          suggestedScopes: []
        },
        source: cleanText(row?.profile_source, 80),
        checkedAt: row?.profile_checked_at || null,
        updatedAt: row?.updated_at || null
      });
    }

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
      const baseState: any =
        legacy?.state && typeof legacy.state === "object"
          ? { ...legacy.state, hashtags }
          : { hashtags };

      const customSources = new Map<string, any>();
      const avatars: Record<string,string> = {};
      for (const row of directoryRows) {
        const id = cleanId(row?.channel_id);
        if (!id) continue;
        const name = cleanText(row?.name, 180);
        const thumbnailUrl = cleanText(row?.thumbnail_url, 1000);
        const subscribers = cleanText(row?.subscribers, 120);
        customSources.set(id, { id, name, thumbnailUrl, subscribers });
        if (thumbnailUrl) avatars[id] = thumbnailUrl;
      }
      baseState.customSources = [...customSources.values()];
      baseState.avatars = avatars;
      baseState.channelLibraryVersion = 1;
      baseState.channelLibrary = channelLibrary;

      return json({
        ok: true,
        exists: !!legacy || directoryRows.length > 0,
        state: baseState,
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
      sourceScopeVersion: 5,
      hashtags,
      selected: [],
      blocked: [],
      scopedSelected: {},
      scopedBlocked: {},
      scopedSuggested: {},
      customSources: [],
      sourceGroups: {},
      sourceLabels: savedLabels,
      avatars: {}
    };
    const customById = new Map<string, any>();
    let version = Number(legacy?.version || 0);
    let updated_at: string | null = legacy?.updated_at || null;

    // Canonical YouTube channel library. LIVE/search/video/package all read the
    // same name/avatar from here, regardless of which scope first discovered it.
    for (const row of directoryRows) {
      const id = cleanId(row?.channel_id);
      if (!id) continue;
      const name = cleanText(row?.name, 180);
      const thumbnailUrl = cleanText(row?.thumbnail_url, 1000);
      const subscribers = cleanText(row?.subscribers, 120);
      customById.set(id, { id, name, thumbnailUrl, subscribers });
      if (thumbnailUrl) state.avatars[id] = thumbnailUrl;
      const rowUpdated = String(row?.updated_at || "");
      if (rowUpdated && (!updated_at || rowUpdated > updated_at)) updated_at = rowUpdated;
    }

    for (const row of allRows) {
      version = Math.max(version, Number(row?.version || 0));
      if (!updated_at || String(row?.updated_at || "") > updated_at) updated_at = String(row?.updated_at || "");
      const status = String(row?.status || "");
      if (!["selected", "blocked", "normal"].includes(status)) continue;

      const scope = cleanText(row?.scope, 32) || "general";
      const id = cleanId(row?.channel_id);
      if (!id) continue;

      if (status === "normal") {
        if (scope !== "general") {
          if (!Array.isArray(state.scopedSuggested[scope])) state.scopedSuggested[scope] = [];
          state.scopedSuggested[scope].push(id);
        }
      } else if (scope === "general") {
        if (status === "selected") state.selected.push(id);
      } else if (status === "selected") {
        if (!Array.isArray(state.scopedSelected[scope])) state.scopedSelected[scope] = [];
        state.scopedSelected[scope].push(id);
      } else if (status === "blocked") {
        if (!Array.isArray(state.scopedBlocked[scope])) state.scopedBlocked[scope] = [];
        state.scopedBlocked[scope].push(id);
      }

      const name = cleanText(row?.name, 180);
      const thumbnailUrl = cleanText(row?.thumbnail_url, 1000);
      const subscribers = cleanText(row?.subscribers, 120);
      if (name || thumbnailUrl || subscribers) {
        const current = customById.get(id) || { id, name: "", thumbnailUrl: "", subscribers: "" };
        // Directory is authoritative. Old per-scope rows only fill a gap while
        // legacy data is being migrated.
        if (name && !current.name) current.name = name;
        if (thumbnailUrl && !current.thumbnailUrl) current.thumbnailUrl = thumbnailUrl;
        if (subscribers && !current.subscribers) current.subscribers = subscribers;
        customById.set(id, current);
        if (current.thumbnailUrl) state.avatars[id] = current.thumbnailUrl;
      }
    }

    state.customSources = [...customById.values()];
    state.channelLibraryVersion = 1;
    state.channelLibrary = channelLibrary;
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

    if (body?.op === "backfill_channel_directory") {
      const limit = Math.max(1, Math.min(80, Number(body?.limit || 80)));
      const missingRes = await fetch(
        rest + "/yt1988_channel_directory?profile_key=eq." + encodeURIComponent(PROFILE) +
        "&select=channel_id,name&order=profile_checked_at.asc.nullsfirst,channel_id.asc&limit=" + limit,
        { headers: authHeaders }
      );
      if (!missingRes.ok) {
        return json({ ok: false, error: "channel_directory_missing_read_failed", detail: await missingRes.text() }, 502);
      }

      const missingRowsRaw = await missingRes.json().catch(() => []);
      const missingRows = Array.isArray(missingRowsRaw) ? missingRowsRaw : [];
      if (!missingRows.length) {
        return json({ ok: true, requested: 0, resolved: 0, remaining: 0, channels: [] });
      }

      const queue = [...missingRows];
      const resolved: any[] = [];
      const unresolved: string[] = [];

      const firstThumb = (value: any) => {
        if (typeof value === "string") return cleanText(value, 1000);
        const rows = Array.isArray(value) ? value : [];
        for (const row of rows) {
          const url = cleanText(row?.url || row?.src || "", 1000);
          if (url) return url;
        }
        return "";
      };

      const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
        while (queue.length) {
          const row = queue.shift();
          const id = cleanId(row?.channel_id);
          if (!id) continue;

          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 7000);
            const response = await fetch(
              supabaseUrl + "/functions/v1/yt1988?action=channel&id=" + encodeURIComponent(id),
              {
                signal: controller.signal,
                headers: {
                  "apikey": serviceKey,
                  "authorization": "Bearer " + serviceKey,
                  "accept": "application/json"
                }
              }
            );
            clearTimeout(timer);
            if (!response.ok) throw new Error("channel_http_" + response.status);

            const payload = await response.json().catch(() => null);
            const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
            const name = cleanText(
              data?.name ||
              data?.title ||
              data?.channelName ||
              row?.name ||
              "",
              180
            );
            const thumbnailUrl = cleanText(
              data?.avatarUrl ||
              data?.thumbnailUrl ||
              data?.avatar ||
              firstThumb(data?.avatars) ||
              firstThumb(data?.thumbnails) ||
              firstThumb(data?.author?.thumbnails) ||
              "",
              1000
            );
            const subscriberCount = Math.max(
              0,
              Math.round(Number(data?.subscriberCount || data?.subscribers || 0) || 0)
            );
            const subscribers = cleanText(
              data?.subscriberText ||
              (subscriberCount > 0 ? String(subscriberCount) : "") ||
              data?.subscribers ||
              "",
              120
            );
            const description = cleanText(data?.description || data?.bio || "", 2000);
            const handle = cleanText(
              data?.handle || data?.vanityUrl || data?.customUrl || "",
              120
            ).replace(/^https?:\/\/www\.youtube\.com\//i,"").replace(/^@/,"");
            const viewCount = Math.max(
              0,
              Math.round(Number(data?.viewCount || data?.views || 0) || 0)
            );
            const videoCount = Math.max(
              0,
              Math.round(Number(data?.videoCount || data?.videosCount || 0) || 0)
            );
            const checkedAt = new Date().toISOString();

            if (!name && !thumbnailUrl && !subscriberCount && !description) {
              unresolved.push(id);
              continue;
            }

            resolved.push({
              channel_id: id,
              name,
              thumbnail_url: thumbnailUrl,
              subscribers,
              handle,
              description,
              verified: data?.verified === true,
              verified_known: typeof data?.verified === "boolean",
              subscriber_count: subscriberCount,
              view_count: viewCount,
              video_count: videoCount,
              profile_url: "https://www.youtube.com/channel/" + id,
              profile_checked_at: checkedAt,
              source: "channel-backfill"
            });
          } catch {
            unresolved.push(id);
          }
        }
      });

      await Promise.allSettled(workers);

      let saved = 0;
      if (resolved.length) {
        const rpc = await fetch(rest + "/rpc/yt1988_upsert_channel_directory", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            p_profile_key: PROFILE,
            p_channels: resolved
          })
        });
        if (!rpc.ok) {
          return json({
            ok: false,
            error: "channel_directory_backfill_write_failed",
            detail: await rpc.text()
          }, 502);
        }
        saved = Math.max(0, Number(await rpc.json().catch(() => 0)) || 0);
      }

      const remainRes = await fetch(
        rest + "/yt1988_channel_directory?profile_key=eq." + encodeURIComponent(PROFILE) +
        "&thumbnail_url=eq.&select=channel_id",
        { headers: authHeaders }
      );
      const remainRows = remainRes.ok ? await remainRes.json().catch(() => []) : [];

      return json({
        ok: true,
        requested: missingRows.length,
        resolved: resolved.length,
        saved,
        remaining: Array.isArray(remainRows) ? remainRows.length : unresolved.length,
        unresolved,
        channels: resolved.map((row: any) => ({
          id: row.channel_id,
          name: row.name,
          thumbnailUrl: row.thumbnail_url
        }))
      });
    }

    if (body?.op === "upsert_channels") {
      const raw = Array.isArray(body?.channels) ? body.channels.slice(0, 80) : [];
      const byId = new Map<string, any>();

      for (const item of raw) {
        const id = cleanId(item?.id || item?.channel_id);
        if (!id) continue;
        const current = byId.get(id) || {
          channel_id: id,
          name: "",
          thumbnail_url: "",
          subscribers: "",
          handle: "",
          description: "",
          verified: null,
          verified_known: false,
          subscriber_count: 0,
          view_count: 0,
          video_count: 0,
          profile_url: "",
          profile_checked_at: null,
          source: ""
        };
        const name = cleanText(item?.name, 180);
        const thumbnailUrl = cleanText(item?.thumbnailUrl || item?.thumbnail_url, 1000);
        const subscribers = cleanText(item?.subscribers, 120);
        const handle = cleanText(item?.handle, 120).replace(/^@/,"");
        const description = cleanText(item?.description, 2000);
        const subscriberCount = Math.max(0, Math.round(Number(item?.subscriberCount || item?.subscriber_count || 0) || 0));
        const viewCount = Math.max(0, Math.round(Number(item?.viewCount || item?.view_count || 0) || 0));
        const videoCount = Math.max(0, Math.round(Number(item?.videoCount || item?.video_count || 0) || 0));
        const profileUrl = cleanText(item?.profileUrl || item?.profile_url, 1000);
        const profileCheckedAt = item?.profileCheckedAt || item?.profile_checked_at || null;
        const source = cleanText(item?.source, 80);
        if (name) current.name = name;
        if (thumbnailUrl) current.thumbnail_url = thumbnailUrl;
        if (subscribers) current.subscribers = subscribers;
        if (handle) current.handle = handle;
        if (description) current.description = description;
        if (typeof item?.verified === "boolean") current.verified = item.verified;
        if (item?.verifiedKnown === true || item?.verified_known === true) current.verified_known = true;
        if (subscriberCount > 0) current.subscriber_count = subscriberCount;
        if (viewCount > 0) current.view_count = viewCount;
        if (videoCount > 0) current.video_count = videoCount;
        if (profileUrl) current.profile_url = profileUrl;
        if (profileCheckedAt) current.profile_checked_at = profileCheckedAt;
        if (source) current.source = source;
        byId.set(id, current);
      }

      const channels = [...byId.values()]
        .filter((item: any) =>
          item.name || item.thumbnail_url || item.subscribers ||
          item.handle || item.description || item.profile_url ||
          item.profile_checked_at
        );

      if (!channels.length) return json({ ok: true, saved: 0 });

      const rpc = await fetch(rest + "/rpc/yt1988_upsert_channel_directory", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          p_profile_key: PROFILE,
          p_channels: channels
        })
      });
      if (!rpc.ok) {
        return json({
          ok: false,
          error: "channel_directory_write_failed",
          detail: await rpc.text()
        }, 502);
      }

      const savedRaw = await rpc.json().catch(() => 0);
      const saved = Math.max(0, Number(savedRaw) || 0);
      return json({ ok: true, saved });
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
