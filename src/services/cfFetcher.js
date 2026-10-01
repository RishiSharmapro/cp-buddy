/**
 * Two-tiered Codeforces test case fetcher.
 * 
 * Tier 1: Fast direct HTTP fetch with realistic browser headers (<300ms, non-invasive, no browser launched).
 * Tier 2: Stealth Puppeteer fallback (using puppeteer-extra + stealth plugin) if Cloudflare challenge is encountered.
 */

const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { parseSampleTests } = require('../utils/htmlParser');

// Register stealth plugin with puppeteer-extra once
puppeteerExtra.use(StealthPlugin());

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0'
};

/**
 * Attempts fast direct HTTP fetch.
 * @param {string} url 
 * @param {number} timeoutMs 
 * @returns {Promise<{ testCases: Array<{ id: number, input: string, output: string }>, source: string }>}
 */
async function fetchViaHttp(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            headers: BROWSER_HEADERS,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();

        // Check if blocked by Cloudflare challenge
        if (
            html.includes('Just a moment...') ||
            html.includes('Attention Required! | Cloudflare') ||
            html.includes('cf-browser-verification') ||
            html.includes('challenge-running')
        ) {
            throw new Error('Cloudflare challenge detected in HTTP response');
        }

        const testCases = parseSampleTests(html);
        if (testCases.length === 0) {
            throw new Error('No sample test cases found in page HTML');
        }

        return { testCases, source: 'http' };
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

/**
 * Fallback fetch using Stealth Puppeteer.
 * @param {string} url 
 * @param {number} timeoutMs 
 * @returns {Promise<{ testCases: Array<{ id: number, input: string, output: string }>, source: string }>}
 */
async function fetchViaPuppeteer(url, timeoutMs = 20000) {
    let browser = null;
    try {
        browser = await puppeteerExtra.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-size=1280,800'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent(BROWSER_HEADERS['User-Agent']);
        await page.setViewport({ width: 1280, height: 800 });

        // Navigate to problem URL
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: timeoutMs
        });

        // Wait for Cloudflare Turnstile challenge to resolve if present
        let currentTitle = await page.title();
        if (currentTitle.includes('Just a moment...') || currentTitle.includes('Attention Required')) {
            try {
                await page.waitForFunction(
                    () => !document.title.includes('Just a moment...') && !document.title.includes('Attention Required'),
                    { timeout: 10000 }
                );
            } catch {
                // If it timed out waiting for title change, continue to check selectors
            }
        }

        // Wait for sample-test element to appear
        try {
            await page.waitForSelector('.sample-test', { timeout: 8000 });
        } catch {
            // If selector not found yet, continue to inspect page content
        }

        const html = await page.content();
        const testCases = parseSampleTests(html);

        if (testCases.length === 0) {
            if (html.includes('Just a moment...') || html.includes('challenge-running')) {
                throw new Error('Cloudflare challenge blocked automated access. Please open Codeforces in your browser or try again shortly.');
            }
            throw new Error('No sample test cases could be parsed from the page.');
        }

        return { testCases, source: 'puppeteer' };
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (err) {
                console.warn('[CP-Buddy] Error closing browser:', err.message);
            }
        }
    }
}

/**
 * Attempts two-tier fetch for a single URL.
 * @param {string} url 
 * @returns {Promise<{ testCases: Array<{ id: number, input: string, output: string }>, source: string }>}
 */
async function fetchFromSingleUrl(url) {
    try {
        const result = await fetchViaHttp(url);
        return result;
    } catch {
        const result = await fetchViaPuppeteer(url);
        return result;
    }
}

/**
 * Fetches sample test cases using two-tier strategy, with optional alternative URL fallback.
 * (e.g. falls back between /contest/ and /problemset/ URLs).
 * 
 * @param {string} problemUrl 
 * @param {string} [alternativeUrl]
 * @returns {Promise<{ testCases: Array<{ id: number, input: string, output: string }>, source: string }>}
 */
async function fetchProblemTestCases(problemUrl, alternativeUrl) {
    try {
        return await fetchFromSingleUrl(problemUrl);
    } catch (primaryErr) {
        if (alternativeUrl && alternativeUrl !== problemUrl) {
            try {
                return await fetchFromSingleUrl(alternativeUrl);
            } catch (altErr) {
                throw new Error(`Failed to fetch test cases. (${primaryErr.message} | Fallback: ${altErr.message})`);
            }
        }
        throw primaryErr;
    }
}

module.exports = {
    fetchProblemTestCases,
    fetchViaHttp,
    fetchViaPuppeteer
};
