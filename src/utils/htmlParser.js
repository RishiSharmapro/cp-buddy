/**
 * Utility for extracting and parsing sample test cases from Codeforces problem HTML.
 */

/**
 * Decodes standard HTML entities.
 * @param {string} str 
 * @returns {string}
 */
function decodeHtmlEntities(str) {
    if (!str) return '';
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

/**
 * Cleans the contents of a <pre> element from Codeforces sample tests.
 * Handles both older raw text/<br> format and modern <div class="test-example-line"> format.
 * 
 * @param {string} preHtml 
 * @returns {string}
 */
function cleanPreContent(preHtml) {
    if (!preHtml) return '';

    // Check if it contains <div class="test-example-line..."> elements
    const divLineRegex = /<div[^>]*class=["'][^"']*test-example-line[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
    const divMatches = [...preHtml.matchAll(divLineRegex)];

    if (divMatches.length > 0) {
        return divMatches
            .map(m => decodeHtmlEntities(m[1].replace(/<[^>]+>/g, '').trim()))
            .join('\n')
            .trim();
    }

    // Alternative div format: any <div>line</div> inside <pre>
    const genericDivRegex = /<div[^>]*>([\s\S]*?)<\/div>/gi;
    const genericMatches = [...preHtml.matchAll(genericDivRegex)];
    if (genericMatches.length > 0) {
        return genericMatches
            .map(m => decodeHtmlEntities(m[1].replace(/<[^>]+>/g, '').trim()))
            .join('\n')
            .trim();
    }

    // Otherwise, it's raw text possibly with <br> or <br/>
    let text = preHtml
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '');

    text = decodeHtmlEntities(text);

    // Normalize newlines and trim leading/trailing empty lines
    const lines = text.split(/\r?\n/).map(l => l.trimEnd());
    // remove leading empty lines
    while (lines.length > 0 && lines[0].trim() === '') {
        lines.shift();
    }
    // remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
    }

    return lines.join('\n');
}

/**
 * Parses Codeforces problem HTML and extracts sample test cases.
 * 
 * @param {string} html 
 * @returns {Array<{ id: number, input: string, output: string }>}
 */
function parseSampleTests(html) {
    if (!html || typeof html !== 'string') {
        return [];
    }

    // Find the sample-test container
    const sampleTestIndex = html.indexOf('sample-test');
    if (sampleTestIndex === -1) {
        return [];
    }

    // Substring around sample-test section to avoid accidental matches elsewhere
    const matchStart = html.search(/class=["'][^"']*\bsample-test/i);
    const startIndex = matchStart !== -1 ? matchStart : html.indexOf('sample-test');
    if (startIndex === -1) {
        return [];
    }
    const sampleSection = html.substring(startIndex, startIndex + 200000);

    // Extract all input <pre> contents (ensure class token is 'input' and not 'input-output-copier')
    const inputRegex = /<div[^>]*class=["'][^"']*(?<![a-zA-Z0-9_-])input(?![a-zA-Z0-9_-])[^"']*["'][^>]*>[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/gi;
    const inputs = [];
    let match;
    while ((match = inputRegex.exec(sampleSection)) !== null) {
        inputs.push(cleanPreContent(match[1]));
    }

    // Extract all output <pre> contents (ensure class token is 'output' and not 'input-output-copier')
    const outputRegex = /<div[^>]*class=["'][^"']*(?<![a-zA-Z0-9_-])output(?![a-zA-Z0-9_-])[^"']*["'][^>]*>[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/gi;
    const outputs = [];
    while ((match = outputRegex.exec(sampleSection)) !== null) {
        outputs.push(cleanPreContent(match[1]));
    }

    // Pair inputs with outputs
    const testCases = [];
    const count = Math.min(inputs.length, outputs.length);

    for (let i = 0; i < count; i++) {
        testCases.push({
            id: i + 1,
            input: inputs[i],
            output: outputs[i]
        });
    }

    return testCases;
}

module.exports = {
    parseSampleTests,
    cleanPreContent,
    decodeHtmlEntities
};
