/**
 * Tealium Integration Tools for Optimizely Opal
 *
 * This module provides tools to interact with Tealium's Customer Data Platform (CDP),
 * enabling real-time visitor profile retrieval, event tracking, and audience management.
 *
 * Tools:
 * - tealium_get_profile_definition: Get all audiences and badges defined in a profile
 * - tealium_get_visitor_profile: Get visitor data by anonymous ID (Moments API)
 * - tealium_get_visitor_by_attribute: Get visitor by email/customer ID (Moments API)
 * - tealium_get_enriched_visitor: Get visitor with human-readable audience/badge names
 * - tealium_check_audiences: Quick check if visitor is in specific audiences
 * - tealium_send_event: Send tracking events to Tealium Collect API
 * - tealium_get_visitor_dle: Get visitor via Data Layer Enrichment API
 *
 * @module tools/tealium
 * @see https://docs.tealium.com/server-side/moments-api/
 * @see https://docs.tealium.com/server-side/attributes/data-layer-enrichment/
 */

import { tool, ParameterType } from '@optimizely-opal/opal-tools-sdk';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Default Tealium configuration from environment variables.
 * Override these by passing parameters to the tools.
 */
const TEALIUM_CONFIG = {
  account: process.env.TEALIUM_ACCOUNT || '',
  profile: process.env.TEALIUM_PROFILE || 'main',
  engineId: process.env.TEALIUM_ENGINE_ID || '',
  region: process.env.TEALIUM_REGION || 'us-west-2',
  allowedDomain: process.env.TEALIUM_ALLOWED_DOMAIN || 'https://localhost',
};

// ============================================================================
// TYPES
// ============================================================================

interface TealiumBaseParams {
  account?: string;
  profile?: string;
}

interface TealiumMomentsParams extends TealiumBaseParams {
  engineId?: string;
  region?: string;
}

interface VisitorByIdParams extends TealiumMomentsParams {
  visitorId: string;
}

interface VisitorByAttributeParams extends TealiumMomentsParams {
  attributeId: string;
  attributeValue: string;
}

interface CheckAudiencesParams extends VisitorByIdParams {
  audienceNames: string;
}

interface SendEventParams extends TealiumBaseParams {
  eventName: string;
  visitorId?: string;
  eventData?: string;
  datasource?: string;
  region?: string;
}

interface DLEVisitorParams extends TealiumBaseParams {
  visitorId: string;
  region?: string;
}

// Response types
interface ProfileDefinitionResponse {
  success: boolean;
  audiences?: Array<{ id: string; name: string }>;
  badges?: Array<{ id: number; name: string }>;
  audienceCount?: number;
  badgeCount?: number;
  error?: string;
}

interface VisitorProfileResponse {
  success: boolean;
  visitorId?: string;
  audiences?: string[];
  badges?: Record<string, boolean>;
  attributes?: Record<string, any>;
  currentVisit?: Record<string, any>;
  error?: string;
}

interface EnrichedVisitorResponse {
  success: boolean;
  visitorId: string;
  audiences?: Array<{ id: string; name: string }>;
  badges?: Array<{ id: number; name: string; assigned: boolean }>;
  attributes?: Record<string, any>;
  summary?: string;
  error?: string;
}

interface CheckAudiencesResponse {
  success: boolean;
  visitorId: string;
  audiencesChecked: string[];
  memberOf: string[];
  notMemberOf: string[];
  error?: string;
}

interface SendEventResponse {
  success: boolean;
  message?: string;
  eventName?: string;
  error?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build Moments API URL
 */
function getMomentsApiUrl(region: string, account: string, profile: string, engineId: string): string {
  return `https://personalization-api.${region}.prod.tealiumapis.com/personalization/accounts/${account}/profiles/${profile}/engines/${engineId}`;
}

/**
 * Build Collect API URL
 */
function getCollectApiUrl(region: string): string {
  return `https://collect-${region}.tealiumiq.com/event`;
}

/**
 * Build Data Layer Enrichment API URL
 */
function getDLEApiUrl(region: string, account: string, profile: string, visitorId: string): string {
  return `https://visitor-service-${region}.tealiumiq.com/${account}/${profile}/${visitorId}`;
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeout = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get effective config value (param > env > default)
 */
function getConfig<T extends keyof typeof TEALIUM_CONFIG>(
  param: string | undefined,
  key: T
): string {
  return param || TEALIUM_CONFIG[key] || '';
}

// ============================================================================
// TOOL: Get Profile Definition
// ============================================================================

async function tealiumGetProfileDefinition(params: TealiumBaseParams): Promise<ProfileDefinitionResponse> {
  const account = getConfig(params.account, 'account');
  const profile = getConfig(params.profile, 'profile');

  if (!account) {
    return {
      success: false,
      error: 'Tealium account is required. Provide it as a parameter or set TEALIUM_ACCOUNT environment variable.',
    };
  }

  const url = `https://visitor-service.tealiumiq.com/datacloudprofiledefinitions/${encodeURIComponent(account)}/${encodeURIComponent(profile)}`;

  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Tealium Profile Definition API error: ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();

    return {
      success: true,
      audiences: data.audiences || [],
      badges: data.badges || [],
      audienceCount: (data.audiences || []).length,
      badgeCount: (data.badges || []).length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: `Failed to fetch profile definition: ${errorMessage}`,
    };
  }
}

tool({
  name: 'tealium_get_profile_definition',
  description: `Retrieves all audience and badge definitions from a Tealium profile.
Use this to discover what customer segments and behavioral indicators exist before querying visitor data.
This helps understand the taxonomy of audiences (customer segments) and badges (behavioral markers) available.
The API is public and doesn't require authentication.

Example prompts:
- "What audiences are defined in Tealium?"
- "Show me all badges in our Tealium profile"
- "List all customer segments available in Tealium"

Returns: List of audiences (id, name) and badges (id, name) configured in the profile.`,
  parameters: [
    {
      name: 'account',
      type: ParameterType.String,
      description: 'Tealium account name (uses TEALIUM_ACCOUNT env var if not provided)',
      required: false,
    },
    {
      name: 'profile',
      type: ParameterType.String,
      description: 'Tealium profile name, defaults to "main"',
      required: false,
    },
  ],
})(tealiumGetProfileDefinition);

// ============================================================================
// TOOL: Get Visitor Profile (Moments API)
// ============================================================================

async function tealiumGetVisitorProfile(params: VisitorByIdParams): Promise<VisitorProfileResponse> {
  const account = getConfig(params.account, 'account');
  const profile = getConfig(params.profile, 'profile');
  const engineId = getConfig(params.engineId, 'engineId');
  const region = getConfig(params.region, 'region');

  if (!account || !engineId) {
    return {
      success: false,
      error: 'Tealium account and engineId are required. Set TEALIUM_ACCOUNT and TEALIUM_ENGINE_ID environment variables or provide as parameters.',
    };
  }

  const baseUrl = getMomentsApiUrl(region, account, profile, engineId);
  const url = `${baseUrl}/visitors/${encodeURIComponent(params.visitorId)}`;

  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Origin': TEALIUM_CONFIG.allowedDomain,
        'Referer': TEALIUM_CONFIG.allowedDomain,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          visitorId: params.visitorId,
          error: `Visitor not found: ${params.visitorId}. The visitor may not have any tracked sessions yet, or the ID may be incorrect.`,
        };
      }
      if (response.status === 403) {
        return {
          success: false,
          visitorId: params.visitorId,
          error: `Access denied. Ensure TEALIUM_ALLOWED_DOMAIN is configured in the Moments API engine's domain allow list.`,
        };
      }
      return {
        success: false,
        visitorId: params.visitorId,
        error: `Tealium Moments API error: ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();

    return {
      success: true,
      visitorId: params.visitorId,
      audiences: data.audiences || [],
      badges: data.badges || {},
      attributes: data.properties || data.attributes || {},
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      visitorId: params.visitorId,
      error: `Failed to fetch visitor profile: ${errorMessage}`,
    };
  }
}

tool({
  name: 'tealium_get_visitor_profile',
  description: `Retrieves a visitor's real-time profile from Tealium Moments API using their anonymous visitor ID.
The visitor ID is typically the value from the utag_main_v_id cookie set by Tealium.
Returns audiences the visitor belongs to, badges they've earned, and configured attributes.

Use this when you need to:
- Personalize content based on visitor behavior
- Check what customer segments a visitor is in
- Retrieve visitor attributes for targeting decisions

Example prompts:
- "Get the Tealium profile for visitor abc123def456"
- "What audiences does visitor xyz789 belong to?"
- "Show me the attributes for Tealium visitor 123abc"

Note: Requires a Moments API engine to be configured, and your domain must be in the engine's allow list.`,
  parameters: [
    {
      name: 'visitorId',
      type: ParameterType.String,
      description: 'The Tealium anonymous visitor ID (from utag_main_v_id cookie)',
      required: true,
    },
    {
      name: 'account',
      type: ParameterType.String,
      description: 'Tealium account name',
      required: false,
    },
    {
      name: 'profile',
      type: ParameterType.String,
      description: 'Tealium profile name',
      required: false,
    },
    {
      name: 'engineId',
      type: ParameterType.String,
      description: 'Moments API engine ID',
      required: false,
    },
    {
      name: 'region',
      type: ParameterType.String,
      description: 'Tealium region (us-west-2, us-east-1, eu-west-1, ap-southeast-2)',
      required: false,
    },
  ],
})(tealiumGetVisitorProfile);

// ============================================================================
// TOOL: Get Visitor by Attribute (Moments API)
// ============================================================================

async function tealiumGetVisitorByAttribute(params: VisitorByAttributeParams): Promise<VisitorProfileResponse> {
  const account = getConfig(params.account, 'account');
  const profile = getConfig(params.profile, 'profile');
  const engineId = getConfig(params.engineId, 'engineId');
  const region = getConfig(params.region, 'region');

  if (!account || !engineId) {
    return {
      success: false,
      error: 'Tealium account and engineId are required.',
    };
  }

  const baseUrl = getMomentsApiUrl(region, account, profile, engineId);
  const url = `${baseUrl}?attributeId=${encodeURIComponent(params.attributeId)}&attributeValue=${encodeURIComponent(params.attributeValue)}`;

  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Origin': TEALIUM_CONFIG.allowedDomain,
        'Referer': TEALIUM_CONFIG.allowedDomain,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: `No visitor found with attributeId=${params.attributeId}, value="${params.attributeValue}"`,
        };
      }
      return {
        success: false,
        error: `Tealium Moments API error: ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();

    return {
      success: true,
      audiences: data.audiences || [],
      badges: data.badges || {},
      attributes: data.properties || data.attributes || {},
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: `Failed to fetch visitor by attribute: ${errorMessage}`,
    };
  }
}

tool({
  name: 'tealium_get_visitor_by_attribute',
  description: `Retrieves a visitor's profile using a known identifier like email address, customer ID, or login ID.
Use this when you have a user's identifier rather than their anonymous cookie ID.

The attributeId is the numeric ID of the visitor ID attribute in Tealium, found in:
AudienceStream > Attributes > [Your Visitor ID Attribute] > Attribute ID

Common attribute IDs vary by account - check your Tealium setup for the correct IDs.

Example prompts:
- "Find the Tealium profile for email john@example.com"
- "Get visitor data for customer ID 12345"
- "Look up the Tealium visitor with login ID user_abc"

Note: The attribute must be configured as a Visitor ID attribute in AudienceStream.`,
  parameters: [
    {
      name: 'attributeId',
      type: ParameterType.String,
      description: 'The numeric ID of the visitor ID attribute in Tealium (e.g., "5013")',
      required: true,
    },
    {
      name: 'attributeValue',
      type: ParameterType.String,
      description: 'The value to look up (email address, customer ID, etc.)',
      required: true,
    },
    {
      name: 'account',
      type: ParameterType.String,
      description: 'Tealium account name',
      required: false,
    },
    {
      name: 'profile',
      type: ParameterType.String,
      description: 'Tealium profile name',
      required: false,
    },
    {
      name: 'engineId',
      type: ParameterType.String,
      description: 'Moments API engine ID',
      required: false,
    },
    {
      name: 'region',
      type: ParameterType.String,
      description: 'Tealium region',
      required: false,
    },
  ],
})(tealiumGetVisitorByAttribute);

// ============================================================================
// TOOL: Get Enriched Visitor (with human-readable names)
// ============================================================================

async function tealiumGetEnrichedVisitor(params: VisitorByIdParams): Promise<EnrichedVisitorResponse> {
  // Fetch profile definition and visitor profile in parallel
  const [profileDefResult, visitorResult] = await Promise.all([
    tealiumGetProfileDefinition({ account: params.account, profile: params.profile }),
    tealiumGetVisitorProfile(params),
  ]);

  if (!visitorResult.success) {
    return {
      success: false,
      visitorId: params.visitorId,
      error: visitorResult.error,
    };
  }

  // Build lookup maps from profile definition
  const audienceMap = new Map<string, string>();
  const badgeMap = new Map<number, string>();

  if (profileDefResult.success) {
    for (const audience of profileDefResult.audiences || []) {
      audienceMap.set(audience.id, audience.name);
    }
    for (const badge of profileDefResult.badges || []) {
      badgeMap.set(badge.id, badge.name);
    }
  }

  // Enrich visitor audiences with names
  const enrichedAudiences: Array<{ id: string; name: string }> = [];
  for (const audienceId of visitorResult.audiences || []) {
    enrichedAudiences.push({
      id: audienceId,
      name: audienceMap.get(audienceId) || audienceId,
    });
  }

  // Enrich visitor badges with names
  const enrichedBadges: Array<{ id: number; name: string; assigned: boolean }> = [];
  for (const [badgeIdStr, assigned] of Object.entries(visitorResult.badges || {})) {
    const badgeId = parseInt(badgeIdStr, 10);
    enrichedBadges.push({
      id: badgeId,
      name: badgeMap.get(badgeId) || `Badge ${badgeId}`,
      assigned: assigned as boolean,
    });
  }

  // Generate human-readable summary
  const assignedBadges = enrichedBadges.filter(b => b.assigned);
  const audienceNames = enrichedAudiences.map(a => a.name).join(', ') || 'none';
  const badgeNames = assignedBadges.map(b => b.name).join(', ') || 'none';

  const summary = `Visitor ${params.visitorId} belongs to ${enrichedAudiences.length} audience(s): ${audienceNames}. Has ${assignedBadges.length} badge(s): ${badgeNames}.`;

  return {
    success: true,
    visitorId: params.visitorId,
    audiences: enrichedAudiences,
    badges: enrichedBadges,
    attributes: visitorResult.attributes,
    summary,
  };
}

tool({
  name: 'tealium_get_enriched_visitor',
  description: `Retrieves a visitor's profile with human-readable audience and badge names.
This combines data from both the Moments API and Profile Definition API to provide
a more understandable view of the visitor's segment memberships.

Use this when you want to:
- Get a complete picture of a visitor with readable names
- Present visitor data in a user-friendly format
- Understand visitor segments without needing to look up IDs

Example prompts:
- "Get a detailed view of visitor abc123 with readable names"
- "Show me visitor xyz's audiences with their actual names"
- "Give me the full enriched profile for this visitor"

Returns: Visitor data with audience names (not just IDs), badge names with assignment status, and a human-readable summary.`,
  parameters: [
    {
      name: 'visitorId',
      type: ParameterType.String,
      description: 'The Tealium anonymous visitor ID',
      required: true,
    },
    {
      name: 'account',
      type: ParameterType.String,
      description: 'Tealium account name',
      required: false,
    },
    {
      name: 'profile',
      type: ParameterType.String,
      description: 'Tealium profile name',
      required: false,
    },
    {
      name: 'engineId',
      type: ParameterType.String,
      description: 'Moments API engine ID',
      required: false,
    },
    {
      name: 'region',
      type: ParameterType.String,
      description: 'Tealium region',
      required: false,
    },
  ],
})(tealiumGetEnrichedVisitor);

// ============================================================================
// TOOL: Check Audiences
// ============================================================================

async function tealiumCheckAudiences(params: CheckAudiencesParams): Promise<CheckAudiencesResponse> {
  // Get visitor profile
  const profileResult = await tealiumGetVisitorProfile(params);

  if (!profileResult.success) {
    return {
      success: false,
      visitorId: params.visitorId,
      audiencesChecked: [],
      memberOf: [],
      notMemberOf: [],
      error: profileResult.error,
    };
  }

  // Parse audiences to check (case-insensitive)
  const audiencesToCheck = params.audienceNames
    .split(',')
    .map(a => a.trim().toLowerCase())
    .filter(a => a.length > 0);

  // Get visitor's audiences (case-insensitive)
  const visitorAudiences = (profileResult.audiences || []).map(a => a.toLowerCase());

  const memberOf: string[] = [];
  const notMemberOf: string[] = [];

  for (const audience of audiencesToCheck) {
    // Check for partial match (audience name contains the search term or vice versa)
    const isMember = visitorAudiences.some(
      va => va.includes(audience) || audience.includes(va)
    );

    if (isMember) {
      memberOf.push(audience);
    } else {
      notMemberOf.push(audience);
    }
  }

  return {
    success: true,
    visitorId: params.visitorId,
    audiencesChecked: audiencesToCheck,
    memberOf,
    notMemberOf,
  };
}

tool({
  name: 'tealium_check_audiences',
  description: `Checks if a visitor belongs to specific Tealium audiences.
Use this for quick audience membership verification for personalization decisions.

Provide a comma-separated list of audience names to check. The tool will return
which of those audiences the visitor is a member of.

Example prompts:
- "Is visitor abc123 in the VIP or High-Value-Customer audience?"
- "Check if visitor xyz belongs to Newsletter-Subscriber"
- "Verify audience membership for visitor 123 in Loyal-Customer, At-Risk"

Returns: Lists of audiences the visitor is and is not a member of.`,
  parameters: [
    {
      name: 'visitorId',
      type: ParameterType.String,
      description: 'The Tealium anonymous visitor ID',
      required: true,
    },
    {
      name: 'audienceNames',
      type: ParameterType.String,
      description: 'Comma-separated list of audience names to check (e.g., "VIP,High-Value,Newsletter")',
      required: true,
    },
    {
      name: 'account',
      type: ParameterType.String,
      description: 'Tealium account name',
      required: false,
    },
    {
      name: 'profile',
      type: ParameterType.String,
      description: 'Tealium profile name',
      required: false,
    },
    {
      name: 'engineId',
      type: ParameterType.String,
      description: 'Moments API engine ID',
      required: false,
    },
    {
      name: 'region',
      type: ParameterType.String,
      description: 'Tealium region',
      required: false,
    },
  ],
})(tealiumCheckAudiences);

// ============================================================================
// TOOL: Send Event (Collect API)
// ============================================================================

async function tealiumSendEvent(params: SendEventParams): Promise<SendEventResponse> {
  const account = getConfig(params.account, 'account');
  const profile = getConfig(params.profile, 'profile');
  const region = getConfig(params.region, 'region');

  if (!account) {
    return {
      success: false,
      error: 'Tealium account is required.',
    };
  }

  const url = getCollectApiUrl(region);

  // Build the event payload
  const payload: Record<string, any> = {
    tealium_account: account,
    tealium_profile: profile,
    tealium_event: params.eventName,
  };

  if (params.visitorId) {
    payload.tealium_visitor_id = params.visitorId;
  }

  if (params.datasource) {
    payload.tealium_datasource = params.datasource;
  }

  // Parse and merge additional event data
  if (params.eventData) {
    try {
      const additionalData = JSON.parse(params.eventData);
      Object.assign(payload, additionalData);
    } catch (e) {
      return {
        success: false,
        eventName: params.eventName,
        error: 'Invalid JSON in eventData parameter. Ensure it is valid JSON.',
      };
    }
  }

  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        success: false,
        eventName: params.eventName,
        error: `Tealium Collect API error: ${response.status} ${response.statusText}`,
      };
    }

    return {
      success: true,
      eventName: params.eventName,
      message: `Event "${params.eventName}" sent successfully to Tealium`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      eventName: params.eventName,
      error: `Failed to send event: ${errorMessage}`,
    };
  }
}

tool({
  name: 'tealium_send_event',
  description: `Sends a tracking event to Tealium's data collection endpoint.
Use this to track conversions, user actions, or custom events that should be recorded.
The event will be processed by EventStream and can trigger connectors or update visitor profiles.

Event data can include any custom attributes as a JSON string in eventData.

Example prompts:
- "Send a purchase event to Tealium for visitor xyz"
- "Track a signup conversion in Tealium with email john@example.com"
- "Record a page_view event with page_name 'checkout'"

Note: Include visitorId for proper visitor stitching. Without it, each event creates a new visitor.`,
  parameters: [
    {
      name: 'eventName',
      type: ParameterType.String,
      description: 'Name of the event (e.g., "purchase", "signup", "page_view", "add_to_cart")',
      required: true,
    },
    {
      name: 'visitorId',
      type: ParameterType.String,
      description: 'Visitor ID to associate with the event (recommended for visitor stitching)',
      required: false,
    },
    {
      name: 'eventData',
      type: ParameterType.String,
      description: 'Additional event data as JSON string (e.g., {"order_total": 99.99, "product_id": "ABC123"})',
      required: false,
    },
    {
      name: 'account',
      type: ParameterType.String,
      description: 'Tealium account name',
      required: false,
    },
    {
      name: 'profile',
      type: ParameterType.String,
      description: 'Tealium profile name',
      required: false,
    },
    {
      name: 'datasource',
      type: ParameterType.String,
      description: 'Tealium data source key (optional)',
      required: false,
    },
    {
      name: 'region',
      type: ParameterType.String,
      description: 'Tealium region for the collect endpoint',
      required: false,
    },
  ],
})(tealiumSendEvent);

// ============================================================================
// TOOL: Get Visitor via Data Layer Enrichment API
// ============================================================================

async function tealiumGetVisitorDLE(params: DLEVisitorParams): Promise<VisitorProfileResponse> {
  const account = getConfig(params.account, 'account');
  const profile = getConfig(params.profile, 'profile');
  const region = getConfig(params.region, 'region');

  if (!account) {
    return {
      success: false,
      error: 'Tealium account is required.',
    };
  }

  const url = getDLEApiUrl(region, account, profile, params.visitorId);

  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          visitorId: params.visitorId,
          error: `Visitor not found or has no active visit: ${params.visitorId}`,
        };
      }
      return {
        success: false,
        visitorId: params.visitorId,
        error: `Tealium DLE API error: ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();

    // Check for empty response (visitor exists but no active visit)
    if (Object.keys(data).length === 0) {
      return {
        success: false,
        visitorId: params.visitorId,
        error: 'Visitor has no active visit. DLE API only returns data for visitors with active sessions.',
      };
    }

    return {
      success: true,
      visitorId: params.visitorId,
      audiences: data.audiences ? Object.values(data.audiences) : [],
      badges: data.badges || {},
      attributes: {
        metrics: data.metrics || {},
        properties: data.properties || {},
        flags: data.flags || {},
        dates: data.dates || {},
      },
      currentVisit: data.current_visit || null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      visitorId: params.visitorId,
      error: `Failed to fetch visitor via DLE: ${errorMessage}`,
    };
  }
}

tool({
  name: 'tealium_get_visitor_dle',
  description: `Retrieves visitor profile data using Tealium's Data Layer Enrichment (DLE) API.
This is an alternative to the Moments API with a different response format.

The DLE API returns:
- metrics: Numeric attributes (attribute ID -> value)
- properties: String attributes (attribute ID -> value)
- flags: Boolean attributes (attribute ID -> true/false)
- dates: Date attributes (attribute ID -> timestamp)
- badges: Badge assignments (badge ID -> true/false)
- audiences: Audience memberships (audience ID -> name)
- current_visit: Current visit data with the same structure

Note: Attribute IDs are numeric. Use tealium_get_profile_definition to get human-readable names.

Example prompts:
- "Get DLE visitor data for abc123"
- "Fetch visitor profile via Data Layer Enrichment API"`,
  parameters: [
    {
      name: 'visitorId',
      type: ParameterType.String,
      description: 'The Tealium anonymous visitor ID',
      required: true,
    },
    {
      name: 'account',
      type: ParameterType.String,
      description: 'Tealium account name',
      required: false,
    },
    {
      name: 'profile',
      type: ParameterType.String,
      description: 'Tealium profile name',
      required: false,
    },
    {
      name: 'region',
      type: ParameterType.String,
      description: 'Tealium region (us-west-2, us-east-1, eu-west-1)',
      required: false,
    },
  ],
})(tealiumGetVisitorDLE);
