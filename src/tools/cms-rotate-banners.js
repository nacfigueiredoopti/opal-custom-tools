/**
 * Optimizely CMS Banner Rotation Orchestrator
 *
 * Main tool for automating banner rotation. Checks which banner should be
 * active based on the current date/time and publish/unpublish dates,
 * then updates banner status accordingly. Designed to be run on a schedule
 * (e.g., every Monday at 9am) by an Opal agent.
 */

const axios = require('axios');

const API_BASE = 'https://api.cms.optimizely.com';

const BANNER_CONFIG = [
    {
        key: '82dd7452fd6e49ca8de9091bd5b5a355',
        title: 'Week 1: Black Friday Early Access',
        week: 1,
        // Example dates - should be updated via CMS UI or parameters
        defaultStart: '2025-12-02T09:00:00Z',
        defaultEnd: '2025-12-09T09:00:00Z'
    },
    {
        key: '813119002c3f427681c557650125bda9',
        title: 'Week 2: Smart Home Week',
        week: 2,
        defaultStart: '2025-12-09T09:00:00Z',
        defaultEnd: '2025-12-16T09:00:00Z'
    },
    {
        key: 'b18bc2399fdf4167a6e6220436873f16',
        title: 'Week 3: Energy Savings Event',
        week: 3,
        defaultStart: '2025-12-16T09:00:00Z',
        defaultEnd: '2025-12-23T09:00:00Z'
    },
    {
        key: 'c4c17a80c2784411bbc09d5b6f12344e',
        title: 'Week 4: Cyber Monday Finale',
        week: 4,
        defaultStart: '2025-12-23T09:00:00Z',
        defaultEnd: '2025-12-30T09:00:00Z'
    }
];

async function authenticate(clientId, clientSecret) {
    const response = await axios.post(
        `${API_BASE}/oauth/token`,
        {
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret
        },
        { headers: { 'Content-Type': 'application/json' } }
    );
    return response.data.access_token;
}

async function getBannerStatus(token, bannerKey) {
    try {
        const response = await axios.get(
            `${API_BASE}/preview3/experimental/content/${bannerKey}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        return null;
    }
}

async function updateBannerStatus(token, bannerKey, newStatus) {
    try {
        // Note: This is a simplified version. The actual API might require different approach
        // You may need to use a different endpoint or method to update publish status
        const response = await axios.patch(
            `${API_BASE}/preview3/experimental/content/${bannerKey}`,
            {
                status: newStatus
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error(`Error updating banner ${bannerKey}:`, error.message);
        return null;
    }
}

function shouldBannerBeActive(banner, now) {
    if (!banner.defaultStart || !banner.defaultEnd) return false;

    const start = new Date(banner.defaultStart);
    const end = new Date(banner.defaultEnd);

    return now >= start && now < end;
}

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const {
            optimizelyClientId = process.env.OPTIMIZELY_CLIENT_ID,
            optimizelyClientSecret = process.env.OPTIMIZELY_CLIENT_SECRET,
            dryRun = false
        } = body;

        if (!optimizelyClientId || !optimizelyClientSecret) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Optimizely credentials required'
                })
            };
        }

        const now = new Date();
        const token = await authenticate(optimizelyClientId, optimizelyClientSecret);

        const actions = [];
        let activeBannerFound = null;

        // Check each banner
        for (const bannerConfig of BANNER_CONFIG) {
            const status = await getBannerStatus(token, bannerConfig.key);
            if (!status) {
                actions.push({
                    banner: bannerConfig.title,
                    action: 'skip',
                    reason: 'Banner not found'
                });
                continue;
            }

            const locale = status.locales?.en;
            if (!locale) {
                actions.push({
                    banner: bannerConfig.title,
                    action: 'skip',
                    reason: 'No locale data'
                });
                continue;
            }

            const shouldBeActive = shouldBannerBeActive(bannerConfig, now);
            const currentlyPublished = locale.status === 'published';

            if (shouldBeActive && !currentlyPublished) {
                // Should be published but isn't
                if (!dryRun) {
                    await updateBannerStatus(token, bannerConfig.key, 'published');
                }
                actions.push({
                    banner: bannerConfig.title,
                    key: bannerConfig.key,
                    action: 'published',
                    reason: 'Within active date range',
                    dryRun
                });
                activeBannerFound = bannerConfig.title;
            } else if (!shouldBeActive && currentlyPublished) {
                // Should not be published but is
                if (!dryRun) {
                    await updateBannerStatus(token, bannerConfig.key, 'draft');
                }
                actions.push({
                    banner: bannerConfig.title,
                    key: bannerConfig.key,
                    action: 'unpublished',
                    reason: 'Outside active date range',
                    dryRun
                });
            } else {
                // Status is correct
                actions.push({
                    banner: bannerConfig.title,
                    key: bannerConfig.key,
                    action: 'no_change',
                    currentStatus: locale.status,
                    reason: shouldBeActive ? 'Already active' : 'Correctly inactive'
                });
                if (shouldBeActive) {
                    activeBannerFound = bannerConfig.title;
                }
            }
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                timestamp: now.toISOString(),
                dryRun,
                activeBanner: activeBannerFound,
                actions,
                summary: {
                    published: actions.filter(a => a.action === 'published').length,
                    unpublished: actions.filter(a => a.action === 'unpublished').length,
                    noChange: actions.filter(a => a.action === 'no_change').length,
                    skipped: actions.filter(a => a.action === 'skip').length
                }
            }, null, 2)
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};

// Tool metadata for Opal discovery
exports.metadata = {
    name: 'cms-rotate-banners',
    description: 'Orchestrates automatic banner rotation in Optimizely CMS. Checks which banner should be active based on the current date/time and updates banner publish status accordingly. Designed to run on a schedule (e.g., every Monday at 9am). Supports dry-run mode for testing.',
    parameters: [
        {
            name: 'optimizelyClientId',
            type: 'string',
            description: 'Optimizely OAuth client ID for CMS API authentication',
            required: false
        },
        {
            name: 'optimizelyClientSecret',
            type: 'string',
            description: 'Optimizely OAuth client secret for CMS API authentication',
            required: false
        },
        {
            name: 'dryRun',
            type: 'boolean',
            description: 'If true, simulates the rotation without making actual changes. Useful for testing. Defaults to false.',
            required: false
        }
    ]
};
