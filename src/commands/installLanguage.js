const vscode = require('vscode');
const cp = require('child_process');

const SUPPORTED_LANGUAGES = [
    'C++', 'C', 'Python', 'Java', 'Go', 'Rust', 'Ruby', 'Node.js',
    'PHP', 'Scala', 'Perl', 'Haskell', 'Kotlin', 'C#', 'OCaml', 'D', 'Delphi', 'Pascal'
];

const BREW_INSTALL_COMMANDS = {
    'C++': 'brew install gcc',
    'C': 'brew install gcc',
    'Python': 'brew install python',
    'Java': 'brew install openjdk',
    'Go': 'brew install go',
    'Rust': 'brew install rust',
    'Ruby': 'brew install ruby',
    'Node.js': 'brew install node',
    'PHP': 'brew install php',
    'Scala': 'brew install scala',
    'Perl': 'brew install perl',
    'Haskell': 'brew install ghc',
    'Kotlin': 'brew install kotlin',
    'C#': 'brew install mono',
    'OCaml': 'brew install ocaml',
    'D': 'brew install dmd',
    'Delphi': 'brew install fpc',
    'Pascal': 'brew install fpc'
};

/**
 * Handles language installation via Homebrew.
 * @param {vscode.ExtensionContext} context 
 */
async function handleInstallLanguage(context) {
    const selection = await vscode.window.showQuickPick(SUPPORTED_LANGUAGES, {
        placeHolder: 'Select a programming language to install via Homebrew'
    });

    if (!selection) {
        vscode.window.showWarningMessage('No language selected.');
        return;
    }

    const brewCommand = BREW_INSTALL_COMMANDS[selection];
    if (!brewCommand) {
        vscode.window.showErrorMessage(`Installation command for ${selection} not defined.`);
        return;
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Installing ${selection}...`,
        cancellable: false
    }, () => {
        return new Promise((resolve, reject) => {
            cp.exec(brewCommand, (error, stdout, stderr) => {
                if (error) {
                    vscode.window.showErrorMessage(`Error installing ${selection}: ${stderr}`);
                    reject(error);
                    return;
                }
                vscode.window.showInformationMessage(`${selection} installed successfully!`);
                context.globalState.update('cpBuddy.languageInstalled', selection);
                resolve();
            });
        });
    });
}

module.exports = {
    handleInstallLanguage,
    SUPPORTED_LANGUAGES
};
