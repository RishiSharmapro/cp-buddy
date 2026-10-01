// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "submitSolution") {
        console.log("Background received submission request:", request);

        // Get the active tab in the current window
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) {
                sendResponse({ status: "error", message: "No active tab found." });
                return;
            }

            const activeTabId = tabs[0].id;

            // Inject content.js if not already injected
            chrome.scripting.executeScript(
                {
                    target: { tabId: activeTabId },
                    files: ["content.js"]
                },
                () => {
                    if (chrome.runtime.lastError) {
                        console.error("Injection failed:", chrome.runtime.lastError.message);
                        sendResponse({ status: "error", message: "Script injection failed." });
                    } else {
                        // Now send the message to content.js
                        chrome.tabs.sendMessage(
                            activeTabId,
                            {
                                action: "submitSolution",
                                problemUrl: request.problemUrl,
                                sourceCode: request.sourceCode
                            },
                        );

                        // Listen for response from content.js
                        chrome.runtime.onMessage.addListener(function responseListener(response) {
                            console.log("📨 Background received response:", response);

                            if (response.status === "success") {
                                sendResponse({ status: "success" });
                            } else {
                                sendResponse({ status: "error", message: response.message });
                            }

                            chrome.runtime.onMessage.removeListener(responseListener);
                        });
                    }
                }
            );
        });
        return true; // Keep the response channel open for async response
    }
});
