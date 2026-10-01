const vscode = require('vscode');
const { extractUrlFromText, parseProblemUrl } = require('../utils/urlParser');
const { cacheService } = require('../services/cacheService');
const { fetchProblemTestCases } = require('../services/cfFetcher');

/**
 * Command handler to force-refetch test cases from Codeforces, bypassing the cache.
 */
async function handleRefetchTestCases() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found! Open a solution file first.');
        return;
    }

    const documentText = editor.document.getText();
    const problemUrl = extractUrlFromText(documentText);

    if (!problemUrl) {
        vscode.window.showErrorMessage('Codeforces problem URL not found in active file. Add comment like: // https://codeforces.com/contest/1903/problem/A');
        return;
    }

    const problemInfo = parseProblemUrl(problemUrl);
    if (!problemInfo) {
        vscode.window.showErrorMessage(`Invalid Codeforces URL: ${problemUrl}`);
        return;
    }

    // Force delete existing cache and failure records for this problem
    cacheService.delete(problemInfo.cacheKey);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Fetching test cases for CF ${problemInfo.contestId}${problemInfo.problemLetter}...`,
        cancellable: false
    }, async () => {
        try {
            const { testCases, source } = await fetchProblemTestCases(problemInfo.canonicalUrl, problemInfo.alternativeUrl);
            if (!testCases || testCases.length === 0) {
                throw new Error('No sample test cases found.');
            }

            // Store in cache
            cacheService.set(problemInfo.cacheKey, testCases);
            vscode.window.showInformationMessage(`✅ Fetched ${testCases.length} test case(s) via ${source.toUpperCase()}!`);

            // Automatically run the test cases now that we have fresh ones
            vscode.commands.executeCommand('cp-buddy.runTestCases');
        } catch (error) {
            cacheService.recordFailure(problemInfo.cacheKey, error.message);
            vscode.window.showErrorMessage(`❌ Failed to refetch test cases: ${error.message}`);
        }
    });
}

module.exports = {
    handleRefetchTestCases
};
