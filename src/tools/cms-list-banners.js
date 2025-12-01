/**
 * Optimizely CMS Banner Management - List Banners Tool
 *
 * Lists all promotional banners with their scheduling information
 * from Optimizely SaaS CMS. Returns banner details including
 * start/stop publish dates and current status.
 */

const axios = require('axios');

const BANNER_KEYS = [
    {
        key: '82dd7452fd6e49ca8de9091bd5b5a355',
        title: 'Week 1: Black Friday Early Access',
        week: 1
    },
    {
        key: '813119002c3f427681c557650125bda9',
        title: 'Week 2: Smart Home Week',
        week: 2
    },
    {
        key: 'b18bc2399fdf4167a6e6220436873f16',
        title: 'Week 3: Energy Savings Event',
        week: 3
    },
    {
        key: 'c4c17a80c2784411bbc09d5b6f12344e',
        title: 'Week 4: Cyber Monday Finale',
        week: 4
    },
    {
        key: '505c508988d343ea984e7a4e29a4b1c2',
        title: '🎉 LIVE TEST BANNER',
        week: 0
    }
];

async function authenticate(clientId, clientSecret) {
    const response = await axios.post(
        'https://api.cms.optimizely.com/oauth/token',
        {
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret
        },
        { headers: { 'Content-Type': 'application/json' } }
    );
    return response.data.access_token;
}

async function getBannerDetails(token, bannerKey) {
    try {
        const response = await axios.get(
            `https://api.cms.optimizely.com/preview3/experimental/content/${bannerKey}`,
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

function isCurrentlyActive(banner) {
    if (!banner || !banner.locales || !banner.locales.en) return false;

    const locale = banner.locales.en;
    if (locale.status !== 'published') return false;

    if (!locale.startPublish || !locale.stopPublish) return false;

    const now = new Date();
    const start = new Date(locale.startPublish);
    const stop = new Date(locale.stopPublish);

    return now >= start && now < stop;
}

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const {
            optimizelyClientId = process.env.OPTIMIZELY_CLIENT_ID,
            optimizelyClientSecret = process.env.OPTIMIZELY_CLIENT_SECRET,
            includeDraft = false
        } = body;

        if (!optimizelyClientId || !optimizelyClientSecret) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Optimizely credentials required',
                    message: 'Please provide optimizelyClientId and optimizelyClientSecret'
                })
            };
        }

        // Authenticate
        const token = await authenticate(optimizelyClientId, optimizelyClientSecret);

        // Fetch all banner details
        const bannerPromises = BANNER_KEYS.map(async (banner) => {
            const details = await getBannerDetails(token, banner.key);
            if (!details) return null;

            const locale = details.locales?.en;
            if (!locale) return null;

            const isActive = isCurrentlyActive(details);

            return {
                key: banner.key,
                title: banner.title,
                week: banner.week,
                status: locale.status,
                startPublish: locale.startPublish || null,
                stopPublish: locale.stopPublish || null,
                isCurrentlyActive: isActive,
                displayName: locale.displayName,
                created: locale.created,
                createdBy: locale.createdBy
            };
        });

        const banners = (await Promise.all(bannerPromises)).filter(b => b !== null);

        // Filter out draft if requested
        const filteredBanners = includeDraft
            ? banners
            : banners.filter(b => b.status === 'published');

        // Sort by week
        filteredBanners.sort((a, b) => a.week - b.week);

        // Find active banner
        const activeBanner = filteredBanners.find(b => b.isCurrentlyActive);

        const summary = {
            totalBanners: filteredBanners.length,
            activeBanner: activeBanner ? {
                title: activeBanner.title,
                key: activeBanner.key,
                week: activeBanner.week
            } : null,
            scheduledBanners: filteredBanners.filter(b => b.startPublish && b.stopPublish).length,
            unscheduledBanners: filteredBanners.filter(b => !b.startPublish || !b.stopPublish).length
        };

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                timestamp: new Date().toISOString(),
                summary,
                banners: filteredBanners
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
    name: 'cms-list-banners',
    description: 'Lists all promotional banners from Optimizely CMS with their scheduling information. Returns banner status, publish dates, and identifies which banner is currently active.',
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
            name: 'includeDraft',
            type: 'boolean',
            description: 'Whether to include draft banners in the results. Defaults to false.',
            required: false
        }
    ]
};
