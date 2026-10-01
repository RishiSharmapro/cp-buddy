console.log("✅ Content script loaded on Codeforces");

chrome.runtime.onMessage.addListener((message) => {
    console.log("📨 Content script received message:", message);

    if (message.action === "submitSolution") {
        const sourceCode = message.sourceCode;
        const problemUrl = message.problemUrl;
        
        (async () => {
            const submitUrl = problemUrl.replace('/problem/', '/submit/');
            window.location.href = submitUrl;

            window.addEventListener('load', async () => {
                try {
                    await new Promise(resolve => setTimeout(resolve, 2000));  // Wait for the form to load

                    const sourceTextArea = document.querySelector('textarea[name="source"]');
                    const submitButton = document.querySelector('input[type="submit"]');

                    if (sourceTextArea && submitButton) {
                        sourceTextArea.value = sourceCode;
                        submitButton.click();

                        console.log("🚀 Solution submitted.");
                        chrome.runtime.sendMessage({ status: "success" });
                    } else {
                        console.error("❌ Submission form not found.");
                        chrome.runtime.sendMessage({ status: "error", message: "Submission form not found!" });
                    }
                } catch (error) {
                    console.error("❌ Error in content script:", error);
                    chrome.runtime.sendMessage({ status: "error", message: error.message });
                }
            });
        })();

        return true;  // Keep the message channel open
    }
});
