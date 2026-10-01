const vscode = require('vscode');
const { handleRunTestCases } = require('./src/commands/runTestCases');
const { handleRefetchTestCases } = require('./src/commands/refetchTestCases');
const { handleInstallLanguage } = require('./src/commands/installLanguage');
const { handleSetCustomCommand } = require('./src/commands/setCustomCommand');
const { cacheService } = require('./src/services/cacheService');

/**
 * Extension entry point activated by VS Code.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('[CP-Buddy] Extension is now active!');

    // Command: Hello World
    const helloCmd = vscode.commands.registerCommand('cp-buddy.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from CP-Buddy! 🚀');
    });

    // Command: Run Test Cases
    const runTestsCmd = vscode.commands.registerCommand('cp-buddy.runTestCases', () => {
        return handleRunTestCases(context);
    });

    // Command: Refetch Test Cases (force refresh bypassing cache)
    const refetchCmd = vscode.commands.registerCommand('cp-buddy.refetchTestCases', () => {
        return handleRefetchTestCases();
    });

    // Command: Install Language
    const installLangCmd = vscode.commands.registerCommand('cp-buddy.installLanguage', () => {
        return handleInstallLanguage(context);
    });

    // Command: Clear Test Case Cache
    const clearCacheCmd = vscode.commands.registerCommand('cp-buddy.clearCache', () => {
        cacheService.clear();
        vscode.window.showInformationMessage('🗑️ CP-Buddy test case cache cleared.');
    });

    // Command: Configure Custom Command
    const setCustomCmd = vscode.commands.registerCommand('cp-buddy.setCustomCommand', (language) => {
        return handleSetCustomCommand(language);
    });

    // First run welcome prompt
    const FIRST_RUN_KEY = 'cpbuddy.firstRun';
    if (!context.globalState.get(FIRST_RUN_KEY)) {
        vscode.window.showInformationMessage('Welcome to CP-Buddy! 🚀 Setup your language compiler.');
        context.globalState.update(FIRST_RUN_KEY, true);
        handleInstallLanguage(context);
    }

    context.subscriptions.push(
        helloCmd,
        runTestsCmd,
        refetchCmd,
        installLangCmd,
        clearCacheCmd,
        setCustomCmd
    );
}

/**
 * Called when extension is deactivated.
 */
function deactivate() {
    cacheService.destroy();
}

module.exports = {
    activate,
    deactivate
};
