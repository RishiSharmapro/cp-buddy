/**
 * Robust in-memory cache service for Codeforces problem sample test cases.
 * 
 * Guarantees:
 * 1. NEVER caches failed or empty test case arrays as valid data.
 * 2. Implements a short failure cooldown (e.g. 15s) to avoid spamming CF on consecutive runs,
 *    while allowing immediate retries as soon as the cooldown expires or via force-refresh.
 * 3. Supports TTL (default 2 hours) and manual cache invalidation.
 */

class CacheService {
    /**
     * @param {number} ttlMs Default TTL for valid test cases (default: 2 hours)
     * @param {number} failureCooldownMs Cooldown after a failed fetch (default: 15 seconds)
     */
    constructor(ttlMs = 2 * 60 * 60 * 1000, failureCooldownMs = 15 * 1000) {
        this.ttlMs = ttlMs;
        this.failureCooldownMs = failureCooldownMs;
        this.cache = new Map(); // key -> { testCases: Array, timestamp: number }
        this.failures = new Map(); // key -> { timestamp: number, error: string }

        // Periodic cleanup (unref so it does not block Node event loop exit)
        this.cleanupInterval = setInterval(() => this.cleanup(), 30 * 60 * 1000);
        if (this.cleanupInterval && typeof this.cleanupInterval.unref === 'function') {
            this.cleanupInterval.unref();
        }
    }

    /**
     * Retrieves cached test cases if present and not expired.
     * @param {string} key 
     * @returns {Array<{ id: number, input: string, output: string }> | null}
     */
    get(key) {
        if (!key || !this.cache.has(key)) {
            return null;
        }

        const entry = this.cache.get(key);
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return null;
        }

        return entry.testCases;
    }

    /**
     * Stores test cases in cache. ONLY stores valid, non-empty test cases!
     * @param {string} key 
     * @param {Array<{ id: number, input: string, output: string }>} testCases 
     * @returns {boolean} True if saved, false if rejected due to empty/invalid data
     */
    set(key, testCases) {
        if (!key || !Array.isArray(testCases) || testCases.length === 0) {
            return false;
        }

        this.cache.set(key, {
            testCases,
            timestamp: Date.now()
        });

        // Clear any previous failure recorded for this key
        this.failures.delete(key);
        return true;
    }

    /**
     * Checks if a valid non-expired cache entry exists for the key.
     * @param {string} key 
     * @returns {boolean}
     */
    has(key) {
        return this.get(key) !== null;
    }

    /**
     * Records a temporary fetch failure for cooldown management.
     * @param {string} key 
     * @param {string} errorMessage 
     */
    recordFailure(key, errorMessage) {
        if (!key) return;
        this.failures.set(key, {
            timestamp: Date.now(),
            error: errorMessage || 'Unknown fetch error'
        });
    }

    /**
     * Checks if a key is currently in failure cooldown.
     * @param {string} key 
     * @returns {{ inCooldown: boolean, remainingSeconds: number, lastError: string | null }}
     */
    getFailureCooldown(key) {
        if (!key || !this.failures.has(key)) {
            return { inCooldown: false, remainingSeconds: 0, lastError: null };
        }

        const failure = this.failures.get(key);
        const elapsed = Date.now() - failure.timestamp;
        const remaining = this.failureCooldownMs - elapsed;

        if (remaining > 0) {
            return {
                inCooldown: true,
                remainingSeconds: Math.ceil(remaining / 1000),
                lastError: failure.error
            };
        }

        // Cooldown has expired, clean up failure entry
        this.failures.delete(key);
        return { inCooldown: false, remainingSeconds: 0, lastError: null };
    }

    /**
     * Removes a specific key from both valid cache and failure records (force refresh).
     * @param {string} key 
     */
    delete(key) {
        this.cache.delete(key);
        this.failures.delete(key);
    }

    /**
     * Clears all cached items and failures.
     */
    clear() {
        this.cache.clear();
        this.failures.clear();
    }

    /**
     * Cleans up expired items.
     */
    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.ttlMs) {
                this.cache.delete(key);
            }
        }
        for (const [key, failure] of this.failures.entries()) {
            if (now - failure.timestamp > this.failureCooldownMs) {
                this.failures.delete(key);
            }
        }
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

// Export singleton instance
const defaultCacheService = new CacheService();

module.exports = {
    CacheService,
    cacheService: defaultCacheService
};
