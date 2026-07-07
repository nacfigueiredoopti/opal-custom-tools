/**
 * Optimizely Data Platform (ODP) Integration Tools for Optimizely Opal
 *
 * This module lets Opal connect to an Optimizely Data Platform (ODP, formerly
 * Zaius / OCP) account using an ODP private API key, verify the connection, and
 * discover the account's data model (objects + fields).
 *
 * Tools:
 * - odp_configure_connection: Validate an ODP API key + region and report status
 * - odp_fetch_schema: Retrieve the ODP data model (objects, and optionally fields)
 *
 * Authentication: ODP REST API v3 uses a private API key sent in the `x-api-key`
 * header. Find it in the ODP/OCP UI under Settings > APIs > Private.
 *
 * Configuration precedence for every tool: explicit parameter > environment
 * variable > default. Set ODP_API_KEY and ODP_REGION to avoid passing the key
 * on every call.
 *
 * @module tools/odp
 * @see https://docs.developers.optimizely.com/optimizely-data-platform/reference/introduction
 */

import { tool, ParameterType } from "@optimizely-opal/opal-tools-sdk";

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Default ODP configuration from environment variables.
 * Override any of these by passing parameters to the tools.
 */
const ODP_CONFIG = {
  apiKey: process.env.ODP_API_KEY || "",
  region: (process.env.ODP_REGION || "us").toLowerCase(),
};

/**
 * ODP REST API v3 base URLs by region.
 * ODP is deployed in three data-residency regions; the API host differs per region.
 */
const ODP_REGION_BASE_URLS: Record<string, string> = {
  us: "https://api.zaius.com/v3",
  eu: "https://api.eu1.odp.optimizely.com/v3",
  au: "https://api.au1.odp.optimizely.com/v3",
};

const DEFAULT_REGION = "us";

// ============================================================================
// TYPES
// ============================================================================

interface OdpBaseParams {
  apiKey?: string;
  region?: string;
}

interface FetchSchemaParams extends OdpBaseParams {
  objects?: string;
}

interface OdpConnectionResult {
  success: boolean;
  connected: boolean;
  region?: string;
  baseUrl?: string;
  objectCount?: number;
  objects?: string[];
  message: string;
  nextSteps?: string[];
  error?: string;
}

interface OdpObjectSummary {
  name: string;
  displayName?: string;
  alias?: string;
  fields?: Array<{ name: string; displayName?: string; type?: string }>;
}

interface OdpSchemaResult {
  success: boolean;
  region?: string;
  baseUrl?: string;
  objectCount?: number;
  objects?: OdpObjectSummary[];
  message?: string;
  error?: string;
}

interface ListAudiencesParams extends OdpBaseParams {
  enrich?: boolean;
}

interface OdpAudienceSummary {
  id: string;
  displayName?: string;
  description?: string;
  audienceType?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface OdpAudiencesResult {
  success: boolean;
  region?: string;
  baseUrl?: string;
  audienceCount?: number;
  audiences?: OdpAudienceSummary[];
  message?: string;
  error?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Resolve the effective ODP config value (param > env > default).
 */
function getConfig<T extends keyof typeof ODP_CONFIG>(
  param: string | undefined,
  key: T
): string {
  return (param || ODP_CONFIG[key] || "").trim();
}

/**
 * Resolve a region code to its REST API base URL.
 * Returns null for an unknown region so callers can surface a helpful error.
 */
function resolveBaseUrl(region: string): string | null {
  const normalized = (region || DEFAULT_REGION).toLowerCase();
  return ODP_REGION_BASE_URLS[normalized] || null;
}

/**
 * fetch() with an abort-based timeout so a hung ODP request can't stall Opal.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Make an authenticated GET request to the ODP REST API v3.
 * Resolves credentials/region from params or env, and normalizes common
 * failure modes (missing key, bad region, auth errors) into thrown Errors
 * with actionable messages.
 */
async function odpGet(
  path: string,
  params: OdpBaseParams
): Promise<{ status: number; data: any }> {
  const apiKey = getConfig(params.apiKey, "apiKey");
  const region = getConfig(params.region, "region") || DEFAULT_REGION;

  if (!apiKey) {
    throw new Error(
      "ODP API key is required. Provide it as the apiKey parameter or set the ODP_API_KEY environment variable. Find your private key in ODP under Settings > APIs > Private."
    );
  }

  const baseUrl = resolveBaseUrl(region);
  if (!baseUrl) {
    throw new Error(
      `Unknown ODP region "${region}". Supported regions: ${Object.keys(ODP_REGION_BASE_URLS).join(", ")}.`
    );
  }

  const url = `${baseUrl}${path}`;

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  // Read the body once, tolerating non-JSON error payloads.
  const rawText = await response.text();
  let data: any = rawText;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    // leave `data` as the raw text
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `ODP authentication failed (${response.status}). Check that the API key is a valid ODP *private* key and matches the "${region}" region.`
    );
  }

  if (!response.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`ODP API error ${response.status} at ${path}: ${detail}`);
  }

  return { status: response.status, data };
}

/**
 * Normalize the ODP list-objects response into a simple array of summaries.
 * ODP has returned objects under a couple of shapes over time, so we accept
 * an array, `{ objects: [...] }`, or `{ data: [...] }` defensively.
 */
function normalizeObjects(data: any): OdpObjectSummary[] {
  const list: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.objects)
      ? data.objects
      : Array.isArray(data?.data)
        ? data.data
        : [];

  return list.map((obj) => ({
    name: obj?.name ?? obj?.object_name ?? String(obj),
    displayName: obj?.display_name ?? obj?.displayName,
    alias: obj?.alias,
  }));
}

/**
 * Normalize an object's fields response into a simple array.
 */
function normalizeFields(
  data: any
): Array<{ name: string; displayName?: string; type?: string }> {
  const list: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.fields)
      ? data.fields
      : Array.isArray(data?.data)
        ? data.data
        : [];

  return list.map((f) => ({
    name: f?.name ?? f?.field_name ?? String(f),
    displayName: f?.display_name ?? f?.displayName,
    type: f?.type,
  }));
}

/**
 * Normalize the ODP list-segments response into an array of segment IDs.
 * ODP returns audiences (segments) as `{ segment_ids: [...] }`; we also accept
 * a bare array or `{ segments: [...] }` defensively.
 */
function normalizeSegmentIds(data: any): string[] {
  const list: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.segment_ids)
      ? data.segment_ids
      : Array.isArray(data?.segments)
        ? data.segments
        : [];
  return list.map((s) => (typeof s === "string" ? s : (s?.id ?? String(s))));
}

/**
 * Map a single ODP segment-detail payload to a friendly audience summary.
 * ODP stores the human-readable name and type under namespaced metadata keys.
 */
function toAudienceSummary(id: string, detail: any): OdpAudienceSummary {
  const md = detail?.metadata ?? {};
  return {
    id,
    displayName: md["com.optimizely/displayName"],
    description: detail?.description,
    audienceType: md["com.optimizely/audienceType"], // e.g. "rts" = real-time segment
    createdBy: md["com.optimizely/createdBy"],
    createdAt: md["com.optimizely.flag/createdAt"],
    updatedAt: md["com.optimizely.flag/updatedAt"],
  };
}

// ============================================================================
// TOOL: Configure / Test ODP Connection
// ============================================================================

async function odpConfigureConnection(
  params: OdpBaseParams
): Promise<OdpConnectionResult> {
  const region = getConfig(params.region, "region") || DEFAULT_REGION;
  const baseUrl = resolveBaseUrl(region);
  const usingEnvKey = !params.apiKey && !!ODP_CONFIG.apiKey;

  try {
    // A lightweight authenticated read that both validates the key and returns
    // useful account data. Listing objects is cheap and always available.
    const { data } = await odpGet("/schema/objects", params);
    const objects = normalizeObjects(data);

    return {
      success: true,
      connected: true,
      region,
      baseUrl: baseUrl || undefined,
      objectCount: objects.length,
      objects: objects.map((o) => o.name).sort(),
      message: `✅ Connected to ODP (${region}). Found ${objects.length} object(s) in the account data model.${
        usingEnvKey ? " (Using API key from ODP_API_KEY env var.)" : ""
      }`,
      nextSteps: [
        "Use odp_fetch_schema to inspect fields for specific objects.",
        "Set ODP_API_KEY and ODP_REGION in your deployment env to avoid passing the key each call.",
      ],
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      connected: false,
      region,
      baseUrl: baseUrl || undefined,
      message: `❌ Could not connect to ODP (${region}).`,
      error: errorMessage,
      nextSteps: [
        "Verify the API key is an ODP *private* key from Settings > APIs > Private.",
        `Confirm the region is correct. Supported: ${Object.keys(ODP_REGION_BASE_URLS).join(", ")}.`,
        "Ensure the key has not been revoked and has schema read access.",
      ],
    };
  }
}

tool({
  name: "odp_configure_connection",
  description: `Configures and verifies a connection to an Optimizely Data Platform (ODP) account.
Validates an ODP private API key against the selected region by calling the ODP REST API v3, and reports whether the connection succeeds along with a summary of the account's data model (objects).

Authentication: uses an ODP *private* API key sent in the x-api-key header. Find it in ODP/OCP under Settings > APIs > Private. The key and region can be provided as parameters or set once via the ODP_API_KEY and ODP_REGION environment variables.

Use this to:
- Test whether ODP credentials are valid before using other ODP tools
- Confirm which region an account lives in
- Get a quick count and list of the objects in the account's data model

Example prompts:
- "Test my ODP connection"
- "Configure the ODP connection for the EU region"
- "Check if this ODP API key works"

Returns: connection status, region, resolved API base URL, and the list of objects found in the account.`,
  parameters: [
    {
      name: "apiKey",
      type: ParameterType.String,
      description:
        "ODP private API key (from Settings > APIs > Private). Optional if the ODP_API_KEY environment variable is set.",
      required: false,
    },
    {
      name: "region",
      type: ParameterType.String,
      description:
        'ODP data region: "us" (api.zaius.com), "eu" (api.eu1.odp.optimizely.com), or "au" (api.au1.odp.optimizely.com). Defaults to "us" or the ODP_REGION environment variable.',
      required: false,
    },
  ],
})(odpConfigureConnection);

// ============================================================================
// TOOL: Fetch ODP Schema (objects + fields)
// ============================================================================

async function odpFetchSchema(
  params: FetchSchemaParams
): Promise<OdpSchemaResult> {
  const region = getConfig(params.region, "region") || DEFAULT_REGION;
  const baseUrl = resolveBaseUrl(region);

  try {
    const { data } = await odpGet("/schema/objects", params);
    let objects = normalizeObjects(data);

    // If specific objects were requested, filter to them and fetch their fields.
    const requested = (params.objects || "")
      .split(",")
      .map((o) => o.trim().toLowerCase())
      .filter((o) => o.length > 0);

    if (requested.length > 0) {
      objects = objects.filter((o) => requested.includes(o.name.toLowerCase()));

      // Fetch fields for each requested object in parallel.
      await Promise.all(
        objects.map(async (obj) => {
          try {
            const { data: fieldData } = await odpGet(
              `/schema/objects/${encodeURIComponent(obj.name)}/fields`,
              params
            );
            obj.fields = normalizeFields(fieldData);
          } catch {
            // Leave fields undefined if this object's fields can't be read;
            // the object list itself is still useful.
            obj.fields = undefined;
          }
        })
      );
    }

    const scope =
      requested.length > 0
        ? `objects: ${requested.join(", ")}`
        : "all objects";

    return {
      success: true,
      region,
      baseUrl: baseUrl || undefined,
      objectCount: objects.length,
      objects,
      message: `Retrieved ODP schema (${region}) for ${scope}: ${objects.length} object(s).`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      region,
      baseUrl: baseUrl || undefined,
      error: `Failed to fetch ODP schema: ${errorMessage}`,
    };
  }
}

tool({
  name: "odp_fetch_schema",
  description: `Retrieves the Optimizely Data Platform (ODP) data model for the connected account.
Returns the list of objects (dimensions) such as customers, events, and products. When specific object names are provided, also returns the fields defined on each of those objects.

Use this tool when users ask about their ODP data structure, available objects, customer attributes/fields, event types, or product catalog fields.

Authentication is the same as odp_configure_connection (ODP private API key via the apiKey parameter or the ODP_API_KEY environment variable, plus region).

Example prompts:
- "What objects exist in my ODP account?"
- "Show me the fields on the customers object in ODP"
- "List the fields for customers and events"

Returns: the list of objects, and for any requested objects, their fields (name, display name, type).`,
  parameters: [
    {
      name: "objects",
      type: ParameterType.String,
      description:
        'Optional comma-separated list of object names to fetch fields for (e.g. "customers,events,products"). Object names are lowercase, snake_case, plural. When omitted, only the list of objects is returned (no fields).',
      required: false,
    },
    {
      name: "apiKey",
      type: ParameterType.String,
      description:
        "ODP private API key. Optional if the ODP_API_KEY environment variable is set.",
      required: false,
    },
    {
      name: "region",
      type: ParameterType.String,
      description:
        'ODP data region: "us", "eu", or "au". Defaults to "us" or the ODP_REGION environment variable.',
      required: false,
    },
  ],
})(odpFetchSchema);

// ============================================================================
// TOOL: List ODP Audiences (segments)
// ============================================================================

async function odpListAudiences(
  params: ListAudiencesParams
): Promise<OdpAudiencesResult> {
  const region = getConfig(params.region, "region") || DEFAULT_REGION;
  const baseUrl = resolveBaseUrl(region);
  // Enrich by default; callers can pass enrich=false to skip the per-audience
  // detail lookups and get just the IDs (cheaper for accounts with many segments).
  const enrich = params.enrich !== false;

  try {
    const { data } = await odpGet("/segments", params);
    const ids = normalizeSegmentIds(data);

    let audiences: OdpAudienceSummary[];
    if (enrich) {
      audiences = await Promise.all(
        ids.map(async (id) => {
          try {
            const { data: detail } = await odpGet(
              `/segments/${encodeURIComponent(id)}`,
              params
            );
            return toAudienceSummary(id, detail);
          } catch {
            // Fall back to the bare ID if the detail lookup fails.
            return { id };
          }
        })
      );
    } else {
      audiences = ids.map((id) => ({ id }));
    }

    return {
      success: true,
      region,
      baseUrl: baseUrl || undefined,
      audienceCount: audiences.length,
      audiences,
      message: `Found ${audiences.length} ODP audience(s)/segment(s) in the ${region} account.`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      region,
      baseUrl: baseUrl || undefined,
      error: `Failed to list ODP audiences: ${errorMessage}`,
    };
  }
}

tool({
  name: "odp_list_audiences",
  description: `Lists the audiences (also called segments) defined in an Optimizely Data Platform (ODP) account.
Calls the ODP REST API v3 to retrieve all segment IDs and, by default, enriches each with its display name, description, audience type (e.g. "rts" for a real-time segment), creator, and created/updated timestamps.

Note: this returns the audience definitions/metadata, not the members of an audience.

Authentication is the same as the other ODP tools (ODP private API key via the apiKey parameter or the ODP_API_KEY environment variable, plus region).

Use this to:
- See what customer segments/audiences exist in ODP
- Look up an audience's display name from its ID
- Get an overview of real-time vs standard segments

Example prompts:
- "List my ODP audiences"
- "What segments are defined in ODP?"
- "Show all customer audiences"

Returns: a list of audiences with id, display name, description, type, creator, and timestamps.`,
  parameters: [
    {
      name: "enrich",
      type: ParameterType.Boolean,
      description:
        "When true (default), fetch each audience's detail to include display name, type, and timestamps. Set to false to return only the audience IDs (faster for accounts with many segments).",
      required: false,
    },
    {
      name: "apiKey",
      type: ParameterType.String,
      description:
        "ODP private API key. Optional if the ODP_API_KEY environment variable is set.",
      required: false,
    },
    {
      name: "region",
      type: ParameterType.String,
      description:
        'ODP data region: "us", "eu", or "au". Defaults to "us" or the ODP_REGION environment variable.',
      required: false,
    },
  ],
})(odpListAudiences);
