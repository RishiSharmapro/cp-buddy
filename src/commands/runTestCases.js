const vscode = require('vscode');
const path = require('path');
const { extractUrlFromText, parseProblemUrl } = require('../utils/urlParser');
const { cacheService } = require('../services/cacheService');
const { fetchProblemTestCases } = require('../services/cfFetcher');
const { runSolution } = require('../services/codeExecutor');
const { showResultPanel } = require('../views/resultPanel');
const { handleSetCustomCommand } = require('./setCustomCommand');

/**
 * Main command handler for running test cases against active solution.
 * 
 * @param {vscode.ExtensionContext} context 
 */
async function handleRunTestCases(context) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found! Please open a code file.');
        return;
    }

    const filePath = editor.document.fileName;
    const documentText = editor.document.getText();

    // Auto-save the document if it has unsaved edits
    if (editor.document.isDirty) {
        await editor.document.save();
    }

    // Step 1: Extract Problem URL
    const problemUrl = extractUrlFromText(documentText);
    if (!problemUrl) {
        vscode.window.showErrorMessage(
            'Codeforces problem URL not found! Please add your problem link as a comment in your code, e.g.: // https://codeforces.com/contest/1903/problem/A'
        );
        return;
    }

    // Step 2: Parse Problem URL
    const problemInfo = parseProblemUrl(problemUrl);
    if (!problemInfo) {
        vscode.window.showErrorMessage(`Invalid Codeforces URL: ${problemUrl}`);
        return;
    }

    // Step 3: Check cache for sample test cases
    let testCases = cacheService.get(problemInfo.cacheKey);

    if (!testCases) {
        // Check if currently in failure cooldown
        const cooldown = cacheService.getFailureCooldown(problemInfo.cacheKey);
        if (cooldown.inCooldown) {
            const action = await vscode.window.showWarningMessage(
                `Codeforces recently failed (${cooldown.lastError}). Retrying available in ${cooldown.remainingSeconds}s.`,
                'Force Retry Now'
            );
            if (action === 'Force Retry Now') {
                cacheService.delete(problemInfo.cacheKey);
            } else {
                return;
            }
        }

        // Fetch test cases from Codeforces
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Fetching test cases for CF ${problemInfo.contestId}${problemInfo.problemLetter}...`,
                cancellable: false
            }, async () => {
                const fetched = await fetchProblemTestCases(problemInfo.canonicalUrl, problemInfo.alternativeUrl);
                testCases = fetched.testCases;
                if (!testCases || testCases.length === 0) {
                    throw new Error('No sample test cases found on the page.');
                }
                cacheService.set(problemInfo.cacheKey, testCases);
            });
        } catch (fetchErr) {
            cacheService.recordFailure(problemInfo.cacheKey, fetchErr.message);
            vscode.window.showErrorMessage(`Failed to fetch test cases: ${fetchErr.message}`);
            return;
        }
    }

    // Step 4: Execute code against sample test cases
    const baseName = path.basename(filePath);
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Running ${baseName}...`,
        cancellable: false
    }, async () => {
        try {
            const runResult = await runSolution(filePath, testCases);

            // Step 5: Render results in Webview panel
            showResultPanel(context, {
                problemInfo,
                runResult,
                sourceCode: documentText
            });

            if (runResult.compilationError) {
                vscode.window.showErrorMessage(
                    '❌ Compilation error! Check the results panel.',
                    'Configure Compile Command'
                ).then(action => {
                    if (action === 'Configure Compile Command') {
                        handleSetCustomCommand(runResult.language || 'C++');
                    }
                });
            } else if (runResult.allPassed) {
                vscode.window.showInformationMessage('✅ All test cases passed!');
            } else {
                vscode.window.showWarningMessage('⚠️ Some test cases failed. Check the results panel.');
            }
        } catch (execErr) {
            vscode.window.showErrorMessage(`Execution error: ${execErr.message}`);
        }
    });
}

module.exports = {
    handleRunTestCases
};
