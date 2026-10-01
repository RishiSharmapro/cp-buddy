/**
 * Utility for parsing Codeforces problem URLs and extracting problem identifiers.
 */

/**
 * Regex to find Codeforces problem URLs in source code (e.g. within comments).
 */
const CF_URL_REGEX = /https?:\/\/codeforces\.com\/(?:contest\/\d+\/problem\/[A-Za-z0-9]+|problemset\/problem\/\d+\/[A-Za-z0-9]+|gym\/\d+\/problem\/[A-Za-z0-9]+|group\/[a-zA-Z0-9_-]+\/contest\/\d+\/problem\/[A-Za-z0-9]+)/i;

/**
 * Parses a Codeforces URL to extract contestId and problemLetter.
 *
 * Supported formats:
 * - https://codeforces.com/contest/1903/problem/A
 * - https://codeforces.com/problemset/problem/1903/A
 * - https://codeforces.com/gym/102694/problem/C1
 * - https://codeforces.com/group/abc/contest/1903/problem/A
 *
 * @param {string} rawUrl 
 * @returns {{ contestId: string, problemLetter: string, canonicalUrl: string, cacheKey: string } | null}
 */
function parseProblemUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
        return null;
    }

    const cleanUrl = rawUrl.trim().split('?')[0].split('#')[0].replace(/\/+$/, '');

    // Format 1: /contest/:id/problem/:letter or /gym/:id/problem/:letter
    const contestMatch = cleanUrl.match(/codeforces\.com\/(?:contest|gym)\/(\d+)\/problem\/([A-Za-z0-9]+)/i);
    if (contestMatch) {
        const contestId = contestMatch[1];
        const problemLetter = contestMatch[2].toUpperCase();
        return {
            contestId,
            problemLetter,
            canonicalUrl: `https://codeforces.com/contest/${contestId}/problem/${problemLetter}`,
            alternativeUrl: `https://codeforces.com/problemset/problem/${contestId}/${problemLetter}`,
            cacheKey: `CF_${contestId}_${problemLetter}`
        };
    }

    // Format 2: /problemset/problem/:id/:letter
    const problemsetMatch = cleanUrl.match(/codeforces\.com\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)/i);
    if (problemsetMatch) {
        const contestId = problemsetMatch[1];
        const problemLetter = problemsetMatch[2].toUpperCase();
        return {
            contestId,
            problemLetter,
            canonicalUrl: `https://codeforces.com/problemset/problem/${contestId}/${problemLetter}`,
            alternativeUrl: `https://codeforces.com/contest/${contestId}/problem/${problemLetter}`,
            cacheKey: `CF_${contestId}_${problemLetter}`
        };
    }

    // Format 3: /group/:group/contest/:id/problem/:letter
    const groupMatch = cleanUrl.match(/codeforces\.com\/group\/([a-zA-Z0-9_-]+)\/contest\/(\d+)\/problem\/([A-Za-z0-9]+)/i);
    if (groupMatch) {
        const groupId = groupMatch[1];
        const contestId = groupMatch[2];
        const problemLetter = groupMatch[3].toUpperCase();
        return {
            contestId,
            problemLetter,
            canonicalUrl: `https://codeforces.com/group/${groupId}/contest/${contestId}/problem/${problemLetter}`,
            cacheKey: `CF_GROUP_${groupId}_${contestId}_${problemLetter}`
        };
    }

    return null;
}

/**
 * Extracts the first valid Codeforces problem URL from the provided text.
 * @param {string} text 
 * @returns {string | null}
 */
function extractUrlFromText(text) {
    if (!text) {
        return null;
    }
    const match = text.match(CF_URL_REGEX);
    return match ? match[0] : null;
}

module.exports = {
    parseProblemUrl,
    extractUrlFromText,
    CF_URL_REGEX
};
