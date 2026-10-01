document.addEventListener('DOMContentLoaded', function () {
    const submitButton = document.getElementById('submitBtn');
    if (submitButton) {
        submitButton.addEventListener('click', () => {
            const problemUrl = document.getElementById('problemUrl').value;
            const sourceCode = document.getElementById('sourceCode').value;

            if (problemUrl && sourceCode) {
                console.log('Submitting solution for problem:', problemUrl);
                
                chrome.runtime.sendMessage({
                    action: 'submitSolution',
                    problemUrl: problemUrl,
                    sourceCode: sourceCode
                }, (response) => {
                    if (response.status === 'success') {
                        alert('Solution submitted successfully!');
                    } else {
                        alert('Error: ' + response.message);
                    }
                });
            } else {
                alert('Please provide both the problem URL and the source code.');
            }
        });
    }
});
