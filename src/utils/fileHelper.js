const fs = require('fs');
const path = require('path');

/**
 * Ensures temporary files related to test execution are cleanly deleted.
 * @param {string[]} filePaths 
 */
function cleanUpFiles(filePaths) {
    if (!Array.isArray(filePaths)) return;

    for (const file of filePaths) {
        if (!file) continue;
        try {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        } catch (err) {
            console.warn(`[CP-Buddy] Warning deleting temporary file ${file}:`, err.message);
        }
    }
}

/**
 * Returns absolute temporary paths for a given source code file.
 * @param {string} sourceFilePath 
 * @param {number} testIndex 
 * @returns {{ dir: string, baseName: string, inputFile: string, outputFile: string, binaryFile: string }}
 */
function getExecutionPaths(sourceFilePath, testIndex = 0) {
    const absPath = path.resolve(sourceFilePath);
    const dir = path.dirname(absPath);
    const ext = path.extname(absPath);
    const baseName = path.basename(absPath, ext);

    const inputFile = path.join(dir, `.cp_${baseName}_in_${testIndex}.txt`);
    const outputFile = path.join(dir, `.cp_${baseName}_out_${testIndex}.txt`);
    const binaryFile = path.join(dir, `.cp_${baseName}.out`);

    return {
        dir,
        baseName,
        inputFile,
        outputFile,
        binaryFile
    };
}

module.exports = {
    cleanUpFiles,
    getExecutionPaths
};
