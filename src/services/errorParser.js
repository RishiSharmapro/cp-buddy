/**
 * Utility to parse and format compiler and runtime stderr into human-readable messages.
 */

/**
 * Parses stderr output from compilers and interpreters.
 * @param {string} stderr 
 * @returns {string}
 */
function parseCompilerError(stderr) {
    if (!stderr || typeof stderr !== 'string' || stderr.trim().length === 0) {
        return 'No errors detected.';
    }

    const lines = stderr.split('\n');

    // C / C++ / Clang / GCC style errors
    const errorLineIndex = lines.findIndex(line => 
        (line.includes('error:') || line.includes('fatal error:')) && 
        !line.includes('note:')
    );

    if (errorLineIndex !== -1) {
        const mainError = lines[errorLineIndex].trim();
        const codeSnippet = lines[errorLineIndex + 1]?.trim() || '';
        const pointerLine = lines[errorLineIndex + 2]?.trim() || '';
        
        let snippet = mainError;
        if (codeSnippet) snippet += `\n${codeSnippet}`;
        if (pointerLine && (pointerLine.includes('^') || pointerLine.includes('~'))) {
            snippet += `\n${pointerLine}`;
        }
        return snippet;
    }

    // Python Traceback errors
    if (stderr.includes('Traceback (most recent call last):')) {
        const nonBlankLines = lines.filter(l => l.trim().length > 0);
        return nonBlankLines.slice(-3).join('\n');
    }

    // Java / Node.js runtime exceptions
    const exceptionIndex = lines.findIndex(line => line.includes('Exception') || line.includes('Error:'));
    if (exceptionIndex !== -1) {
        return lines.slice(exceptionIndex, exceptionIndex + 3).join('\n');
    }

    return stderr.trim();
}

module.exports = {
    parseCompilerError
};
