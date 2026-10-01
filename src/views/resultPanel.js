const vscode = require('vscode');
const { handleSetCustomCommand } = require('../commands/setCustomCommand');

let currentPanel = null;

/**
 * Escapes HTML characters for safe rendering.
 * @param {string} str 
 * @returns {string}
 */
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Creates or updates the test case results Webview panel.
 * 
 * @param {vscode.ExtensionContext} context 
 * @param {{
 *   problemInfo: { contestId: string, problemLetter: string, canonicalUrl: string },
 *   runResult: {
 *     success: boolean,
 *     compilationError?: string,
 *     allPassed: boolean,
 *     results: Array<{
 *       id: number,
 *       input: string,
 *       expectedOutput: string,
 *       actualOutput: string,
 *       passed: boolean,
 *       executionTimeMs: number,
 *       timedOut: boolean,
 *       stderr: string
 *     }>
 *   },
 *   sourceCode?: string
 * }} data
 */
function showResultPanel(context, data) {
    const column = vscode.window.activeTextEditor
        ? vscode.ViewColumn.Beside
        : vscode.ViewColumn.One;

    if (currentPanel) {
        currentPanel.reveal(column);
    } else {
        currentPanel = vscode.window.createWebviewPanel(
            'cpBuddyResults',
            'CP-Buddy Test Results',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        currentPanel.onDidDispose(() => {
            currentPanel = null;
        }, null, context.subscriptions);

        currentPanel.webview.onDidReceiveMessage((message) => {
            if (message.command === 'rerun') {
                vscode.commands.executeCommand('cp-buddy.runTestCases');
            } else if (message.command === 'refetch') {
                vscode.commands.executeCommand('cp-buddy.refetchTestCases');
            } else if (message.command === 'configureCommand') {
                handleSetCustomCommand(message.language || 'C++');
            } else if (message.command === 'openUrl' && message.url) {
                vscode.env.openExternal(vscode.Uri.parse(message.url));
            }
        }, null, context.subscriptions);
    }

    const { problemInfo, runResult } = data;
    currentPanel.webview.html = generateHtmlContent(problemInfo, runResult);
}

/**
 * Generates the HTML for the test results Webview.
 */
function generateHtmlContent(problemInfo, runResult) {
    const { contestId, problemLetter, canonicalUrl } = problemInfo;
    const { compilationError, allPassed, results } = runResult;

    const totalTests = results ? results.length : 0;
    const passedTests = results ? results.filter(r => r.passed).length : 0;

    let overallBadge = '';
    if (compilationError) {
        overallBadge = `<span class="badge badge-error">Compilation Error</span>`;
    } else if (allPassed) {
        overallBadge = `<span class="badge badge-success">Passed (${passedTests}/${totalTests})</span>`;
    } else {
        overallBadge = `<span class="badge badge-failed">Failed (${passedTests}/${totalTests} Passed)</span>`;
    }

    let testCasesHtml = '';
    if (results && results.length > 0) {
        testCasesHtml = results.map((tc) => {
            const statusClass = tc.passed ? 'border-success' : 'border-failed';
            const statusBadge = tc.timedOut
                ? `<span class="badge badge-error">Time Limit Exceeded</span>`
                : tc.passed
                    ? `<span class="badge badge-success">Accepted (${tc.executionTimeMs}ms)</span>`
                    : `<span class="badge badge-failed">Wrong Answer (${tc.executionTimeMs}ms)</span>`;

            return `
            <div class="test-card ${statusClass}">
                <div class="card-header">
                    <div class="card-title">
                        <strong>Test Case #${tc.id}</strong>
                    </div>
                    <div>${statusBadge}</div>
                </div>

                <div class="grid-container">
                    <div class="code-block">
                        <div class="block-title">Input</div>
                        <pre>${escapeHtml(tc.input)}</pre>
                    </div>
                    <div class="code-block">
                        <div class="block-title">Expected Output</div>
                        <pre>${escapeHtml(tc.expectedOutput)}</pre>
                    </div>
                    <div class="code-block">
                        <div class="block-title">Your Output</div>
                        <pre class="${tc.passed ? 'output-passed' : 'output-failed'}">${escapeHtml(tc.actualOutput || '(no output)')}</pre>
                    </div>
                </div>

                ${tc.stderr ? `
                    <div class="error-section">
                        <div class="error-title">Runtime Output / Error:</div>
                        <pre class="error-pre">${escapeHtml(tc.stderr)}</pre>
                    </div>
                ` : ''}
            </div>
            `;
        }).join('');
    }

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CP-Buddy Results</title>
        <style>
            :root {
                --bg: var(--vscode-editor-background, #1e1e1e);
                --fg: var(--vscode-editor-foreground, #d4d4d4);
                --card-bg: var(--vscode-editorWidget-background, #252526);
                --border: var(--vscode-editorWidget-border, #454545);
                --pre-bg: var(--vscode-textCodeBlock-background, #181818);
                --success: #4ec9b0;
                --failed: #f48771;
                --warning: #cca700;
            }

            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }

            body {
                background-color: var(--bg);
                color: var(--fg);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                padding: 16px;
                line-height: 1.5;
            }

            .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 12px;
                padding-bottom: 12px;
                margin-bottom: 16px;
                border-bottom: 1px solid var(--border);
            }

            .title-area h1 {
                font-size: 1.25rem;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .title-area .sub {
                font-size: 0.85rem;
                opacity: 0.8;
                margin-top: 4px;
            }

            .actions {
                display: flex;
                gap: 8px;
            }

            button {
                background: var(--vscode-button-background, #0e639c);
                color: var(--vscode-button-foreground, #ffffff);
                border: none;
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 0.85rem;
                cursor: pointer;
                transition: opacity 0.2s;
            }

            button:hover {
                opacity: 0.9;
                background: var(--vscode-button-hoverBackground, #1177bb);
            }

            button.secondary {
                background: var(--vscode-button-secondaryBackground, #3a3d41);
                color: var(--vscode-button-secondaryForeground, #ffffff);
            }

            .badge {
                padding: 3px 8px;
                border-radius: 12px;
                font-size: 0.75rem;
                font-weight: bold;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .badge-success {
                background: rgba(78, 201, 176, 0.2);
                color: var(--success);
                border: 1px solid var(--success);
            }

            .badge-failed {
                background: rgba(244, 135, 113, 0.2);
                color: var(--failed);
                border: 1px solid var(--failed);
            }

            .badge-error {
                background: rgba(255, 85, 85, 0.3);
                color: #ff5555;
                border: 1px solid #ff5555;
            }

            .compilation-card {
                background: rgba(244, 135, 113, 0.1);
                border: 1px solid var(--failed);
                border-radius: 6px;
                padding: 16px;
                margin-bottom: 16px;
            }

            .compilation-title {
                color: var(--failed);
                font-weight: bold;
                margin-bottom: 8px;
            }

            .test-card {
                background: var(--card-bg);
                border: 1px solid var(--border);
                border-radius: 6px;
                margin-bottom: 16px;
                overflow: hidden;
            }

            .border-success {
                border-left: 4px solid var(--success);
            }

            .border-failed {
                border-left: 4px solid var(--failed);
            }

            .card-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 14px;
                background: rgba(0, 0, 0, 0.15);
                border-bottom: 1px solid var(--border);
            }

            .grid-container {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                gap: 12px;
                padding: 12px 14px;
            }

            .code-block {
                display: flex;
                flex-direction: column;
            }

            .block-title {
                font-size: 0.75rem;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 6px;
                opacity: 0.75;
                font-weight: 600;
            }

            pre {
                background: var(--pre-bg);
                padding: 10px;
                border-radius: 4px;
                font-family: var(--vscode-editor-font-family, Menlo, Monaco, Consolas, monospace);
                font-size: 0.85rem;
                overflow-x: auto;
                white-space: pre-wrap;
                word-break: break-all;
                border: 1px solid var(--border);
                min-height: 48px;
                flex: 1;
            }

            .output-passed {
                color: var(--success);
            }

            .output-failed {
                color: var(--failed);
            }

            .error-section {
                padding: 0 14px 14px 14px;
            }

            .error-title {
                font-size: 0.8rem;
                color: var(--failed);
                margin-bottom: 4px;
                font-weight: 600;
            }

            .error-pre {
                background: rgba(255, 85, 85, 0.08);
                color: #ff8888;
                border-color: rgba(255, 85, 85, 0.3);
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="title-area">
                <h1>
                    <span>CF ${escapeHtml(contestId)} - Problem ${escapeHtml(problemLetter)}</span>
                    ${overallBadge}
                </h1>
                <div class="sub">
                    <a href="#" id="openProblemLink" style="color: var(--vscode-textLink-foreground, #3794ff); text-decoration: none;">
                        🔗 ${escapeHtml(canonicalUrl)}
                    </a>
                </div>
            </div>
            <div class="actions">
                <button id="rerunBtn">▶ Re-run</button>
                <button id="refetchBtn" class="secondary">🔄 Refetch Cases</button>
            </div>
        </div>

        ${compilationError ? `
            <div class="compilation-card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div class="compilation-title">⚠️ Compilation Failed</div>
                    <button id="configCmdBtn" class="secondary" style="font-size: 0.75rem; padding: 4px 8px;">⚙️ Edit Compile Command</button>
                </div>
                <pre class="error-pre">${escapeHtml(compilationError)}</pre>
            </div>
        ` : ''}

        ${testCasesHtml}

        <script>
            const vscode = acquireVsCodeApi();

            document.getElementById('rerunBtn')?.addEventListener('click', () => {
                vscode.postMessage({ command: 'rerun' });
            });

            document.getElementById('refetchBtn')?.addEventListener('click', () => {
                vscode.postMessage({ command: 'refetch' });
            });

            document.getElementById('configCmdBtn')?.addEventListener('click', () => {
                vscode.postMessage({ command: 'configureCommand', language: '${escapeHtml(runResult.language || 'C++')}' });
            });

            document.getElementById('openProblemLink')?.addEventListener('click', (e) => {
                e.preventDefault();
                vscode.postMessage({ command: 'openUrl', url: '${escapeHtml(canonicalUrl)}' });
            });
        </script>
    </body>
    </html>
    `;
}

module.exports = {
    showResultPanel
};
