const vscode = require('vscode');
const { detectLanguage } = require('../services/codeExecutor');

/**
 * Prompts the user to set or update a custom compile command for a programming language.
 * 
 * @param {string} [presetLanguage] Language to configure (optional)
 */
async function handleSetCustomCommand(presetLanguage) {
    let language = presetLanguage;

    if (!language) {
        const editor = vscode.window.activeTextEditor;
        const defaultLang = editor ? detectLanguage(editor.document.fileName) : null;
        const languages = ['C++', 'C', 'Python', 'Java', 'Rust', 'Go', 'Kotlin', 'Node.js'];
        language = await vscode.window.showQuickPick(languages, {
            placeHolder: defaultLang ? `Select language to configure (current file: ${defaultLang})` : 'Select programming language to configure custom command'
        });
        if (!language) return;
    }

    const config = vscode.workspace.getConfiguration('cp-buddy');
    const customCommands = { ...(config.get('customCompileCommands') || {}) };
    const currentCommand = customCommands[language] || '';

    let placeholderDefault = '';
    if (language === 'C++') {
        placeholderDefault = 'g++-16 -O2 -std=c++20 {file} -o {bin}';
    } else if (language === 'C') {
        placeholderDefault = 'gcc-16 -O2 {file} -o {bin}';
    } else if (language === 'Rust') {
        placeholderDefault = 'rustc -O {file} -o {bin}';
    } else if (language === 'Java') {
        placeholderDefault = 'javac {file}';
    }

    const newCommand = await vscode.window.showInputBox({
        title: `CP-Buddy: Custom Compile Command for ${language}`,
        prompt: 'Available placeholders: {file} (source file), {bin} (output executable), {dir} (file directory)',
        value: currentCommand || placeholderDefault,
        placeHolder: placeholderDefault
    });

    if (newCommand === undefined) {
        return; // User cancelled
    }

    if (newCommand.trim() === '') {
        delete customCommands[language];
        await config.update('customCompileCommands', customCommands, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Reset ${language} compile command to default.`);
    } else {
        customCommands[language] = newCommand.trim();
        await config.update('customCompileCommands', customCommands, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`✅ Saved custom compile command for ${language}!`);
    }
}

module.exports = {
    handleSetCustomCommand
};
