/**
 * Service for detecting language, compiling, and running user solution against test cases.
 */

const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const { cleanUpFiles, getExecutionPaths } = require('../utils/fileHelper');
const { parseCompilerError } = require('./errorParser');

let vscode;
try {
    vscode = require('vscode');
} catch {
    vscode = null;
}

const LANGUAGE_EXTENSIONS = {
    '.cpp': 'C++',
    '.cc': 'C++',
    '.cxx': 'C++',
    '.c': 'C',
    '.py': 'Python',
    '.java': 'Java',
    '.js': 'Node.js',
    '.ts': 'Node.js',
    '.go': 'Go',
    '.rs': 'Rust',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.scala': 'Scala',
    '.pl': 'Perl',
    '.hs': 'Haskell',
    '.kt': 'Kotlin',
    '.cs': 'C#',
    '.ml': 'OCaml',
    '.d': 'D',
    '.pas': 'Pascal'
};

/**
 * Detects programming language from file path extension.
 * @param {string} filePath 
 * @returns {string | null}
 */
function detectLanguage(filePath) {
    if (!filePath) return null;
    const ext = path.extname(filePath).toLowerCase();
    return LANGUAGE_EXTENSIONS[ext] || null;
}

/**
 * Scans standard Homebrew and local directories for the highest version of a compiler (e.g. g++-16, gcc-16).
 * @param {string} prefixRegex E.g. 'g\\+\\+' or 'gcc'
 * @returns {string | null}
 */
function findBestHomebrewCompiler(prefixRegex) {
    const searchDirs = ['/opt/homebrew/bin', '/usr/local/bin'];
    const regex = new RegExp(`^${prefixRegex}-(\\d+)$`);

    for (const dir of searchDirs) {
        try {
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                const matches = files
                    .filter(f => regex.test(f))
                    .map(f => ({ path: path.join(dir, f), ver: parseInt(f.match(regex)[1], 10) }))
                    .sort((a, b) => b.ver - a.ver);

                if (matches.length > 0) {
                    return matches[0].path;
                }
            }
        } catch {
            // Directory read error, ignore and continue
        }
    }
    return null;
}

/**
 * Gets macOS SDK path using xcrun (needed for Apple clang to find <iostream>).
 * @returns {string | null}
 */
function getMacSdkPath() {
    if (process.platform !== 'darwin') return null;
    try {
        const sdk = cp.execSync('xcrun --show-sdk-path', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        return sdk && fs.existsSync(sdk) ? sdk : null;
    } catch {
        return null;
    }
}

/**
 * Resolves the best available C++ compiler.
 * Checks user configuration, Homebrew GCC installations (e.g. g++-16), PATH, and Apple clang.
 * @returns {string}
 */
function resolveCppCompiler() {
    // 1. Check user configured C++ compiler path
    if (vscode) {
        const customPath = vscode.workspace.getConfiguration('cp-buddy').get('cppCompilerPath');
        if (customPath && customPath.trim()) {
            return customPath.trim();
        }
    }

    // 2. Scan Homebrew for GCC/G++ installations (g++-16, g++-15, etc.)
    const homebrewGpp = findBestHomebrewCompiler('g\\+\\+');
    if (homebrewGpp) {
        return homebrewGpp;
    }

    // 3. Check for specific versioned g++ binaries in PATH
    for (let ver = 18; ver >= 10; ver--) {
        const bin = `g++-${ver}`;
        try {
            cp.execSync(`which ${bin}`, { stdio: 'ignore' });
            return bin;
        } catch {
            // Not in PATH
        }
    }

    // 4. Check system g++ / clang++
    return 'g++';
}

/**
 * Resolves the best available C compiler.
 * @returns {string}
 */
function resolveCCompiler() {
    const homebrewGcc = findBestHomebrewCompiler('gcc');
    if (homebrewGcc) {
        return homebrewGcc;
    }

    for (let ver = 18; ver >= 10; ver--) {
        const bin = `gcc-${ver}`;
        try {
            cp.execSync(`which ${bin}`, { stdio: 'ignore' });
            return bin;
        } catch {
            // Not in PATH
        }
    }

    return 'gcc';
}

/**
 * Normalizes string output for fair comparison.
 * - Normalizes Windows \r\n to \n
 * - Trims trailing whitespace on each line
 * - Trims leading and trailing empty lines
 * @param {string} str 
 * @returns {string}
 */
function normalizeOutput(str) {
    if (!str) return '';
    return str
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(l => l.trimEnd())
        .join('\n')
        .trim();
}

/**
 * Executes a single command asynchronously with timeout.
 * @param {string} command 
 * @param {string} cwd 
 * @param {number} timeoutMs 
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number, timedOut: boolean }>}
 */
function executeCommand(command, cwd, timeoutMs = 10000) {
    return new Promise((resolve) => {
        cp.exec(command, { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                resolve({
                    stdout: stdout || '',
                    stderr: stderr || err.message || '',
                    exitCode: err.code || 1,
                    timedOut: Boolean(err.killed)
                });
                return;
            }
            resolve({
                stdout: stdout || '',
                stderr: stderr || '',
                exitCode: 0,
                timedOut: false
            });
        });
    });
}

/**
 * Formats a template command string with actual file paths.
 * Supported placeholders: {file}, {dir}, {baseName}, {bin}, {input}, {output}
 */
function formatCommandTemplate(template, vars) {
    return template
        .replace(/\{file\}/g, `"${vars.filePath}"`)
        .replace(/\{dir\}/g, `"${vars.dir}"`)
        .replace(/\{baseName\}/g, vars.baseName)
        .replace(/\{bin\}/g, vars.binaryPath ? `"${vars.binaryPath}"` : '')
        .replace(/\{input\}/g, vars.inputFile ? `"${vars.inputFile}"` : '')
        .replace(/\{output\}/g, vars.outputFile ? `"${vars.outputFile}"` : '');
}

/**
 * Compiles source file if the language requires compilation.
 * Checks user custom compile command first, then uses default compiler resolution.
 * 
 * @param {string} language 
 * @param {string} filePath 
 * @param {string} binaryPath 
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function compileSource(language, filePath, binaryPath) {
    const cwd = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));

    // Check user custom compile command for this language
    if (vscode) {
        const config = vscode.workspace.getConfiguration('cp-buddy');
        const customCompileCommands = config.get('customCompileCommands') || {};
        if (customCompileCommands[language] && customCompileCommands[language].trim()) {
            const template = customCompileCommands[language].trim();
            const compileCmd = formatCommandTemplate(template, {
                filePath,
                dir: cwd,
                baseName,
                binaryPath
            });

            console.log(`[CP-Buddy] Using custom compile command for ${language}: ${compileCmd}`);
            const res = await executeCommand(compileCmd, cwd, 20000);
            if (res.exitCode !== 0 || res.timedOut) {
                return {
                    success: false,
                    error: res.timedOut ? 'Compilation timed out (20s limit)' : parseCompilerError(res.stderr)
                };
            }
            return { success: true };
        }
    }

    let compileCmd = null;

    if (language === 'C++') {
        const compiler = resolveCppCompiler();
        let extraFlags = '';
        // If falling back to Apple clang (not GNU GCC), add macOS SDK path so <iostream> is found
        if (!compiler.includes('g++-') && process.platform === 'darwin') {
            const sdkPath = getMacSdkPath();
            if (sdkPath) {
                extraFlags = ` -isysroot "${sdkPath}"`;
            }
        }
        compileCmd = `"${compiler}" -O2 -std=c++20${extraFlags} "${filePath}" -o "${binaryPath}"`;
    } else if (language === 'C') {
        const compiler = resolveCCompiler();
        let extraFlags = '';
        if (!compiler.includes('gcc-') && process.platform === 'darwin') {
            const sdkPath = getMacSdkPath();
            if (sdkPath) {
                extraFlags = ` -isysroot "${sdkPath}"`;
            }
        }
        compileCmd = `"${compiler}" -O2${extraFlags} "${filePath}" -o "${binaryPath}"`;
    } else if (language === 'Rust') {
        compileCmd = `rustc -O "${filePath}" -o "${binaryPath}"`;
    } else if (language === 'Java') {
        compileCmd = `javac "${filePath}"`;
    } else if (language === 'Kotlin') {
        const jarPath = binaryPath + '.jar';
        compileCmd = `kotlinc "${filePath}" -include-runtime -d "${jarPath}"`;
    }

    if (!compileCmd) {
        // Interpreted language, no compilation step needed
        return { success: true };
    }

    console.log(`[CP-Buddy] Compiling ${language} with: ${compileCmd}`);
    const res = await executeCommand(compileCmd, cwd, 20000);
    if (res.exitCode !== 0 || res.timedOut) {
        return {
            success: false,
            error: res.timedOut ? 'Compilation timed out (20s limit)' : parseCompilerError(res.stderr)
        };
    }

    return { success: true };
}

/**
 * Returns the run command for an individual test case.
 * 
 * @param {string} language 
 * @param {string} filePath 
 * @param {string} binaryPath 
 * @param {string} inputFile 
 * @param {string} outputFile 
 * @returns {string}
 */
function getRunCommand(language, filePath, binaryPath, inputFile, outputFile) {
    const cwd = path.dirname(filePath);
    const fileNameWithoutExt = path.basename(filePath, path.extname(filePath));

    // Check user custom run command
    if (vscode) {
        const config = vscode.workspace.getConfiguration('cp-buddy');
        const customRunCommands = config.get('customRunCommands') || {};
        if (customRunCommands[language] && customRunCommands[language].trim()) {
            return formatCommandTemplate(customRunCommands[language].trim(), {
                filePath,
                dir: cwd,
                baseName: fileNameWithoutExt,
                binaryPath,
                inputFile,
                outputFile
            });
        }
    }

    switch (language) {
        case 'C++':
        case 'C':
        case 'Rust':
            return `"${binaryPath}" < "${inputFile}" > "${outputFile}"`;
        case 'Python':
            return `python3 "${filePath}" < "${inputFile}" > "${outputFile}"`;
        case 'Node.js':
            return `node "${filePath}" < "${inputFile}" > "${outputFile}"`;
        case 'Java':
            return `java -cp "${cwd}" "${fileNameWithoutExt}" < "${inputFile}" > "${outputFile}"`;
        case 'Go':
            return `go run "${filePath}" < "${inputFile}" > "${outputFile}"`;
        case 'Ruby':
            return `ruby "${filePath}" < "${inputFile}" > "${outputFile}"`;
        case 'Kotlin':
            return `java -jar "${binaryPath}.jar" < "${inputFile}" > "${outputFile}"`;
        default:
            return null;
    }
}

/**
 * Runs user solution against a set of sample test cases.
 * 
 * @param {string} filePath 
 * @param {Array<{ id: number, input: string, output: string }>} testCases 
 * @param {number} timeoutMs 
 * @returns {Promise<{
 *   success: boolean,
 *   language: string,
 *   compilationError?: string,
 *   allPassed: boolean,
 *   results: Array<{
 *     id: number,
 *     input: string,
 *     expectedOutput: string,
 *     actualOutput: string,
 *     passed: boolean,
 *     executionTimeMs: number,
 *     timedOut: boolean,
 *     stderr: string
 *   }>
 * }>}
 */
async function runSolution(filePath, testCases, timeoutMs = 8000) {
    const language = detectLanguage(filePath);
    if (!language) {
        throw new Error(`Unsupported file type: ${path.extname(filePath)}`);
    }

    const { dir, binaryFile } = getExecutionPaths(filePath, 0);
    const filesToClean = [binaryFile, `${binaryFile}.jar`];

    try {
        // Step 1: Compile if necessary
        const compileResult = await compileSource(language, filePath, binaryFile);
        if (!compileResult.success) {
            return {
                success: false,
                language,
                compilationError: compileResult.error,
                allPassed: false,
                results: []
            };
        }

        // Step 2: Run against each test case
        const results = [];
        let allPassed = true;

        for (let i = 0; i < testCases.length; i++) {
            const tc = testCases[i];
            const { inputFile, outputFile } = getExecutionPaths(filePath, tc.id);
            filesToClean.push(inputFile, outputFile);

            // Write input to input file
            fs.writeFileSync(inputFile, tc.input || '');

            const runCmd = getRunCommand(language, filePath, binaryFile, inputFile, outputFile);
            if (!runCmd) {
                throw new Error(`Execution command not defined for ${language}`);
            }

            const startTime = Date.now();
            const execRes = await executeCommand(runCmd, dir, timeoutMs);
            const executionTimeMs = Date.now() - startTime;

            let actualOutput = '';
            if (fs.existsSync(outputFile)) {
                actualOutput = fs.readFileSync(outputFile, 'utf8');
            } else if (execRes.stdout) {
                actualOutput = execRes.stdout;
            }

            const normActual = normalizeOutput(actualOutput);
            const normExpected = normalizeOutput(tc.output);
            const passed = !execRes.timedOut && execRes.exitCode === 0 && normActual === normExpected;

            if (!passed) {
                allPassed = false;
            }

            results.push({
                id: tc.id,
                input: tc.input,
                expectedOutput: tc.output,
                actualOutput: normActual,
                passed,
                executionTimeMs,
                timedOut: execRes.timedOut,
                stderr: execRes.stderr ? parseCompilerError(execRes.stderr) : ''
            });
        }

        return {
            success: true,
            language,
            allPassed,
            results
        };
    } finally {
        cleanUpFiles(filesToClean);
    }
}

module.exports = {
    detectLanguage,
    resolveCppCompiler,
    resolveCCompiler,
    findBestHomebrewCompiler,
    runSolution,
    normalizeOutput,
    formatCommandTemplate,
    LANGUAGE_EXTENSIONS
};
