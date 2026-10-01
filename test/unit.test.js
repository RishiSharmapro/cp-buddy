const assert = require('assert');
const { parseProblemUrl, extractUrlFromText } = require('../src/utils/urlParser');
const { parseSampleTests, cleanPreContent } = require('../src/utils/htmlParser');
const { CacheService } = require('../src/services/cacheService');
const { detectLanguage, normalizeOutput, formatCommandTemplate, resolveCppCompiler } = require('../src/services/codeExecutor');

describe('CP-Buddy Unit Tests', () => {

    describe('URL Parser', () => {
        it('should parse standard contest problem URLs', () => {
            const parsed = parseProblemUrl('https://codeforces.com/contest/1903/problem/A');
            assert.deepStrictEqual(parsed, {
                contestId: '1903',
                problemLetter: 'A',
                canonicalUrl: 'https://codeforces.com/contest/1903/problem/A',
                alternativeUrl: 'https://codeforces.com/problemset/problem/1903/A',
                cacheKey: 'CF_1903_A'
            });
        });

        it('should parse problemset URLs correctly without setting contestId to "problem"', () => {
            const parsed = parseProblemUrl('https://codeforces.com/problemset/problem/158/B/');
            assert.deepStrictEqual(parsed, {
                contestId: '158',
                problemLetter: 'B',
                canonicalUrl: 'https://codeforces.com/problemset/problem/158/B',
                alternativeUrl: 'https://codeforces.com/contest/158/problem/B',
                cacheKey: 'CF_158_B'
            });
        });

        it('should parse URLs with query parameters and alphanumeric problem letters', () => {
            const parsed = parseProblemUrl('https://codeforces.com/contest/1903/problem/C1?order=BY_ARRIVED_ASC');
            assert.strictEqual(parsed.contestId, '1903');
            assert.strictEqual(parsed.problemLetter, 'C1');
            assert.strictEqual(parsed.cacheKey, 'CF_1903_C1');
        });

        it('should extract URL from code comments', () => {
            const code = `
            // Problem: https://codeforces.com/contest/1903/problem/A
            #include <iostream>
            using namespace std;
            int main() { return 0; }
            `;
            const extracted = extractUrlFromText(code);
            assert.strictEqual(extracted, 'https://codeforces.com/contest/1903/problem/A');
        });
    });

    describe('HTML Parser', () => {
        it('should parse multiple input/output pairs from .sample-test HTML', () => {
            const html = `
            <div class="sample-tests">
                <div class="sample-test">
                    <div class="input">
                        <div class="title">Input</div>
                        <pre><div class="test-example-line">5</div><div class="test-example-line">1 2 4 3 3</div></pre>
                    </div>
                    <div class="output">
                        <div class="title">Output</div>
                        <pre>4</pre>
                    </div>
                    <div class="input">
                        <div class="title">Input</div>
                        <pre>8<br>2 3 4 4 2 1 3 1</pre>
                    </div>
                    <div class="output">
                        <div class="title">Output</div>
                        <pre>5</pre>
                    </div>
                </div>
            </div>
            `;
            const tests = parseSampleTests(html);
            assert.strictEqual(tests.length, 2);
            assert.strictEqual(tests[0].id, 1);
            assert.strictEqual(tests[0].input, '5\n1 2 4 3 3');
            assert.strictEqual(tests[0].output, '4');
            assert.strictEqual(tests[1].id, 2);
            assert.strictEqual(tests[1].input, '8\n2 3 4 4 2 1 3 1');
            assert.strictEqual(tests[1].output, '5');
        });

        it('should parse sample tests when pre and div tags have attributes like id or class', () => {
            const html = `
            <div class="sample-test">
                <div class="input" data-test="in">
                    <div class="title">Input</div>
                    <pre id="id12345" class="code-pre">3\n1 2 3</pre>
                </div>
                <div class="output" data-test="out">
                    <div class="title">Output</div>
                    <pre id="id67890">6</pre>
                </div>
            </div>
            `;
            const tests = parseSampleTests(html);
            assert.strictEqual(tests.length, 1);
            assert.strictEqual(tests[0].input, '3\n1 2 3');
            assert.strictEqual(tests[0].output, '6');
        });

        it('should not treat input-output-copier buttons as input/output blocks', () => {
            const html = `
            <div class="sample-test">
                <div class="input">
                    <div class="title">Input<div title="Copy" data-clipboard-target="#id1" id="id2" class="input-output-copier">Copy</div></div>
                    <pre id="id1"><div class="test-example-line">7</div><div class="test-example-line">1 2 3</div></pre>
                </div>
                <div class="output">
                    <div class="title">Output<div title="Copy" data-clipboard-target="#id3" id="id4" class="input-output-copier">Copy</div></div>
                    <pre id="id3">1 2 3 4</pre>
                </div>
            </div>
            `;
            const tests = parseSampleTests(html);
            assert.strictEqual(tests.length, 1);
            assert.strictEqual(tests[0].id, 1);
            assert.strictEqual(tests[0].input, '7\n1 2 3');
            assert.strictEqual(tests[0].output, '1 2 3 4');
        });

        it('should return empty array if no sample tests exist', () => {
            const html = `<html><body><div>No test cases here</div></body></html>`;
            const tests = parseSampleTests(html);
            assert.deepStrictEqual(tests, []);
        });

        it('should decode HTML entities properly in test content', () => {
            const cleaned = cleanPreContent('&lt;Hello &amp; World&gt;');
            assert.strictEqual(cleaned, '<Hello & World>');
        });
    });

    describe('Cache Service', () => {
        it('should store and retrieve valid non-empty test cases', () => {
            const cache = new CacheService(10000, 1000);
            const testData = [{ id: 1, input: '1', output: '2' }];
            const saved = cache.set('CF_100_A', testData);
            assert.strictEqual(saved, true);
            assert.deepStrictEqual(cache.get('CF_100_A'), testData);
            cache.destroy();
        });

        it('should NEVER store empty or invalid test cases', () => {
            const cache = new CacheService(10000, 1000);
            assert.strictEqual(cache.set('CF_100_A', []), false);
            assert.strictEqual(cache.get('CF_100_A'), null);
            assert.strictEqual(cache.has('CF_100_A'), false);
            cache.destroy();
        });

        it('should record failure and report cooldown, then expire cleanly', async () => {
            const cache = new CacheService(10000, 200); // 200ms cooldown for test
            cache.recordFailure('CF_100_B', 'Cloudflare challenge');

            const cooldown1 = cache.getFailureCooldown('CF_100_B');
            assert.strictEqual(cooldown1.inCooldown, true);
            assert.strictEqual(cooldown1.lastError, 'Cloudflare challenge');

            // Wait for cooldown to expire
            await new Promise(r => setTimeout(r, 250));

            const cooldown2 = cache.getFailureCooldown('CF_100_B');
            assert.strictEqual(cooldown2.inCooldown, false);
            cache.destroy();
        });

        it('should support manual deletion for force refetch', () => {
            const cache = new CacheService(10000, 10000);
            cache.set('CF_100_C', [{ id: 1, input: 'a', output: 'b' }]);
            cache.recordFailure('CF_100_C', 'Some error');

            cache.delete('CF_100_C');
            assert.strictEqual(cache.get('CF_100_C'), null);
            assert.strictEqual(cache.getFailureCooldown('CF_100_C').inCooldown, false);
            cache.destroy();
        });
    });

    describe('Code Executor & Normalization', () => {
        it('should detect languages by file extension', () => {
            assert.strictEqual(detectLanguage('main.cpp'), 'C++');
            assert.strictEqual(detectLanguage('solution.py'), 'Python');
            assert.strictEqual(detectLanguage('Main.java'), 'Java');
            assert.strictEqual(detectLanguage('index.js'), 'Node.js');
            assert.strictEqual(detectLanguage('main.rs'), 'Rust');
        });

        it('should normalize output across carriage returns and line-endings', () => {
            const raw1 = 'YES  \r\nNO \r\n';
            const raw2 = 'YES\nNO\n\n';
            assert.strictEqual(normalizeOutput(raw1), normalizeOutput(raw2));
        });

        it('should format custom command template with placeholders', () => {
            const template = 'g++-16 -std=c++20 -I/custom/include {file} -o {bin}';
            const formatted = formatCommandTemplate(template, {
                filePath: '/path/to/sol.cpp',
                binaryPath: '/path/to/sol.out',
                dir: '/path/to',
                baseName: 'sol'
            });
            assert.strictEqual(formatted, 'g++-16 -std=c++20 -I/custom/include "/path/to/sol.cpp" -o "/path/to/sol.out"');
        });

        it('should auto-resolve C++ compiler to installed Homebrew GCC or valid compiler', () => {
            const compiler = resolveCppCompiler();
            assert.ok(typeof compiler === 'string' && compiler.length > 0);
        });
    });
});
