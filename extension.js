// The module 'vscode' contains the VS Code extensibility API

// import { stderr, stdout } from 'process';

// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode'); // For interacting with the editor

const cp = require('child_process'); // For running shell commands
const fs = require('fs'); // For working with files
const path = require('path'); // For working with file paths
// const axios = require('axios');	// For making HTTP requests
// const cheerio = require('cheerio'); // For web scraping
const puppeteer = require('puppeteer'); // For web scraping - as direct HTTP requests are blocked by Cloudflare

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "cp-buddy" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('cp-buddy.helloWorld', function () {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from CP-buddy!');
	});
	context.subscriptions.push(disposable);

	/**
	 * @param {string} inputFilePath
	 * @param {string} outputFilePath
	 * @param {string} filePath
	 */
	function takeInputFromUser(inputFilePath, outputFilePath, filePath) {

		// Taking the input from the user
		vscode.window.showInputBox({
			placeHolder: "Enter the input for the program"
		}).then((input) => {
			if (!input) {
				vscode.window.showErrorMessage("No input provided!");
				return;
			}

			// writing the input to the input file
			// fs.writeFileSync(inputFilePath, "5\n1 2 3 4 5\n");
			fs.writeFileSync(inputFilePath, input);
			console.log(`Input written to ${inputFilePath}`);

			// Defining commands to run based on the file extension
			const ext = path.extname(filePath);
			let command = "";

			if (ext === ".cpp") {
				// command = `g++ ${filePath} -o ${filePath}.out && ${filePath}.out < ${inputFilePath} > ${outputFilePath}`;
				const outputFileBase = path.basename(filePath, '.cpp'); // Get file name without extension
				// command = `g++ ${filePath} -o ${outputFileBase}.out && ./${outputFileBase}.out < ${inputFilePath} > ${outputFilePath}`;
				command = `cd "${path.dirname(filePath)}" && g++ ${path.basename(filePath)} -o ${outputFileBase}.out && ./${outputFileBase}.out < "${inputFilePath}" > "${outputFilePath}"`;
			}
			else {
				vscode.window.showErrorMessage("Unsupported file type.");
				return;
			}

			// Executing the command and Getting the result of file execution
			cp.exec(command, (err, stdout, stderr) => {
				if (err || stderr) {
					vscode.window.showErrorMessage(`Error: ${err || stderr}`);
					return;
				}

				try {
					const output = fs.readFileSync(outputFilePath, 'utf8');
					vscode.window.showInformationMessage(`Output:\n${output}`);
				}
				catch (readError) {
					vscode.window.showErrorMessage(`Failed to read output: ${readError}\n\n${readError}`);
				}
				finally {
					cleanUpFiles();
				}
			})

			// Deleting the input and output files
			// fs.unlinkSync(inputFilePath);
			// fs.unlinkSync(outputFilePath);
			function cleanUpFiles() {
				[inputFilePath, outputFilePath].forEach((file) => {
					if (fs.existsSync(file)) {
						fs.unlinkSync(file);
						console.log(`Deleted temporary file: ${file}`);
					}
				});
			}
			// cleanUpFiles();
			console.log("Successfully executed the command: runTestCases");
		});
	}

	// function to extract problem url from the user code 
	function extractUrlCommand() {
		const editor = vscode.window.activeTextEditor;
	
		if (editor) {
		  const documentText = editor.document.getText();
	
		  // Regex to match the problem URL comment
		  const urlRegex = /\/\/\s*problem:\s*(https:\/\/codeforces\.com\/contest\/\d+\/problem\/[A-Z])/i;
		  const match = documentText.match(urlRegex);
	
		  if (match && match[1]) {
			const problemUrl = match[1];
			vscode.window.showInformationMessage(`Problem URL: ${problemUrl}`);
			return problemUrl;

		  } else {
			vscode.window.showErrorMessage('Problem URL not found in the code.');
		  }
		}
	  };

	//   context.subscriptions.push(extractUrlCommand);

	// for deleting the input and output files
	function cleanUpFiles(inputFilePath, outputFilePath) {
		[inputFilePath, outputFilePath].forEach((file) => {
			if (fs.existsSync(file)) {
				fs.unlinkSync(file);
				console.log(`Deleted temporary file: ${file}`);
			}
		});
	}

	function parseCompilerError(stderr) {
		const lines = stderr.split("\n");
		const errorLineIndex = lines.findIndex(line => line.includes("error:") && !line.includes("note:"));

		if (errorLineIndex !== -1) {
			// Extract main error message
			const mainError = lines[errorLineIndex].trim();

			// Extract the code snippet (usually the next line)
			const codeSnippet = lines[errorLineIndex + 1]?.trim() || "";

			// Combine error and snippet
			return `${mainError}\n${codeSnippet}`;
		}

		return "No errors detected.";
	}

	
	async function createPannel(userInput, stdout, stderr, contestId, problemLetter, actualOutput) {
		// Show the result in a webview panel
		const panel = vscode.window.createWebviewPanel(
			'testCases', // Internal identifier
			'Test Cases Result', // Title of the panel
			vscode.ViewColumn.Beside, // Where to show the panel
			{
				enableScripts: true,
			} // Webview options
		);
		let mainErrorMessage = "No errors detected.";
		if (stderr) {
			mainErrorMessage = parseCompilerError(stderr);
		}
		// setting the pannel width
		// await vscode.commands.executeCommand('workbench.action.splitEditorRight');
		// deleting the extra panel
		// await vscode.commands.executeCommand('workbench.action.closeEditorsInGroupToLeft');


		// Set HTML content for the webview
		panel.webview.html = `
			<!DOCTYPE html>
			<html lang="en">
			<head>
			  <meta charset="UTF-8">
			  <meta name="viewport" content="width=device-width, initial-scale=1.0">
			  <title>Test Cases</title>
			  <style>
				body {
					font-family: Arial, sans-serif;
					padding: 10px;
					text: white;
					background: rgb(40, 40, 40);
					color: white;
					
				  }
				pre {
					background:rgb(28, 28, 28);
					padding: 10px;
					border-radius: 5px;
					word-wrap: break-word;
					white-space: pre-wrap;
					overflow-wrap: break-word;
					overflow: auto;
				}
				#output {
					display: grid;
					grid-template-columns: 1fr 1fr;
					gap: 1px;
					min-width: 100%;
					overflow:scroll;
        		}
				.width {
					width: 80%;
				}
				.structure {
					border: 1px solid gray;
					border-radius: 10px;
					padding: 10px;
					padding-top: 0px;
					padding-bottom: 0px;
					margin-bottom: 10px;
				}
			  </style>
			</head>
			<body>
				<p>Contest ID: ${contestId} <br />Problem ID: ${problemLetter}</p>
				<div class="structure">
						<h2>Input</h2>
						<pre class="width">${userInput}</pre>
				</div>
					${!stderr ? `
						<div class="structure" style="border: 1px solid ${(stdout === actualOutput) ? `green`: `red`}; border-radius: 10px;>
							<h2>Output</h2>
							<div id="output">
								<div>
									<h3>User Output</h3>
									<pre class="width">${stdout}</pre>
								</div>
								<div>
									<h3>Expected Output</h3>
									<pre class="width">${actualOutput}</pre>
								</div>
							</div>
						</div>
					`
					: ''
				}
			  
			  ${stderr ? `<h2>Errors</h2><pre>${mainErrorMessage}</pre>` : ''}
			</body>
			</html>
		  `;
	}

	async function fetchTestCaseWithPuppeteer(problemUrl) {
		try {
			// launch the browser
			const browser = await puppeteer.launch({
				// executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', // to use other browsers
				headless: true, // set to false to see the browser in action
				args: ['--no-sandbox', '--disable-setuid-sandbox']
			});

			// create a new page
			const page = await browser.newPage();
			// set the user agent
			await page.setUserAgent(
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36'
			);

			// open the problem URL
			await page.goto(problemUrl, {
				waitUntil: 'domcontentloaded'
			});
			// console.log(`Opened the problem: ${problemUrl}`);
			// const samples = await page.waitForSelector('.sample-test', { visible: true, timeout: 60000 });
			// console.log("samples: ", samples);


			// Extract the test cases using the page selectors
			const testCases = await page.evaluate(() => {
				const inputs = [];
				const outputs = [];
				// @ts-ignore 
				// eslint-disable-next-line no-undef
				const sampleTests = document.querySelectorAll('.sample-test');
				console.log("sampleTests: ", sampleTests);

				// Iterate over all sample test cases
				sampleTests.forEach((test) => {
					const inputElement = test.querySelector('.input pre');
					const outputElement = test.querySelector('.output pre');

					// Process the input: iterate over all <div> children of the <pre> element
					let input = '';
					if (inputElement) {
						const inputLines = inputElement.querySelectorAll('div');
						input = Array.from(inputLines).map(line => line.textContent.trim()).join('\n');
					}

					// Process the output: directly use the content of the <pre> tag
					const output = outputElement ? outputElement.textContent.trim() : null;

					inputs.push(input + '\n');
					outputs.push(output + '\n');
					// console.log("inputs: ", inputs);
				});

				return { inputs, outputs };
			});

			await browser.close();
			return testCases;

		}
		catch (error) {
			vscode.window.showErrorMessage(`Failed to fetch the problem: ${error}`);
			return;
		}
	}

	async function fetchInputDynamically(inputFilePath, outputFilePath, filePath) {

		// Fetching the input and problem dynamically from the codeforces website using puppeteer (as direct HTTP requests are blocked by Cloudflare)
		/*
		const problemUrlFromUser = await vscode.window.showInputBox({
			placeHolder: "Enter the Codeforces problem URL (e.g., https://codeforces.com/problemset/problem/123/A)"
		});
		// removing the extra spaces from the URL
		const problemUrl = problemUrlFromUser.trim();
		*/
		const problemUrl = extractUrlCommand();
		
		if (!problemUrl) {
			vscode.window.showErrorMessage("No problem URL provided!");
			return;
		}
		else if (!problemUrl.startsWith("https://codeforces.com/")) {
			vscode.window.showErrorMessage("Invalid problem URL!");
			return;
		}

		const contestId = problemUrl.split('/')[problemUrl.split('/').length - 3]; // contest ID
		const problemLetter = problemUrl.split('/')[problemUrl.split('/').length - 1]; // problem letter

		try {

			const { inputs, outputs } = await fetchTestCaseWithPuppeteer(problemUrl);

			if (inputs.length === 0 || outputs.length === 0) {
				vscode.window.showErrorMessage("Failed to fetch test cases. Please check the problem URL.");
				return;
			}

			// console.log("inputs: ", inputs);
			// console.log("outputs: ", outputs);

			// Writing the input to file
			fs.writeFileSync(inputFilePath, inputs.join('\n'));
			console.log(`Input written to ${inputFilePath}`);

			// Defining commands to run based on the file extension
			const ext = path.extname(filePath);
			let command = "";

			if (ext === ".cpp") {
				// command = `g++ ${filePath} -o ${filePath}.out && ${filePath}.out < ${inputFilePath} > ${outputFilePath}`;
				const outputFileBase = path.basename(filePath, '.cpp'); // Get file name without extension
				// command = `g++ ${filePath} -o ${outputFileBase}.out && ./${outputFileBase}.out < ${inputFilePath} > ${outputFilePath}`;
				command = `cd "${path.dirname(filePath)}" && g++ -std=c++20 ${path.basename(filePath)} -o ${outputFileBase}.out && ./${outputFileBase}.out < "${inputFilePath}" > "${outputFilePath}"`;
			}
			else {
				vscode.window.showErrorMessage("Unsupported file type.");
				return;
			}

			// Executing the command and Getting the result of file execution
			cp.exec(command, (err, stdout, stderr) => {
				if (err || stderr) {
					vscode.window.showErrorMessage(`Error: ${err || stderr}`);
					createPannel(inputs.join('\n'), stdout, stderr, contestId, problemLetter);
					return;
				}

				try {
					const userOutput = fs.readFileSync(outputFilePath, 'utf8');
					// vscode.window.showInformationMessage(`Output:\n${userOutput}`);
					const correctOutput = outputs.join('\n');
					if (userOutput.trim() === correctOutput.trim()) {
						createPannel(inputs.join('\n'), userOutput, stderr, contestId, problemLetter, correctOutput);
						vscode.window.showInformationMessage("✅ All test cases passed! ");
					}
					else {
						// vscode.window.showErrorMessage("Some test cases failed!");
						vscode.window.showWarningMessage("Some test cases failed!");
						createPannel(inputs.join('\n'), userOutput, stderr, contestId, problemLetter, correctOutput);
					}
				}
				catch (readError) {
					vscode.window.showErrorMessage(`Failed to read output: ${readError}`);
				}
				finally {
					console.log("Cleaning up files");
					cleanUpFiles(inputFilePath, outputFilePath);
				}
			})
		}
		catch (error) {
			vscode.window.showErrorMessage(`Failed to fetch the problem: ${error}`);
			return;
		}

		console.log("Successfully executed the command: runTestCases");
	}

	const runTests = vscode.commands.registerCommand('cp-buddy.runTestCases', function () {
		const editor = vscode.window.activeTextEditor;
		console.log("Successfully executed the command: editor");


		if (!editor) {
			vscode.window.showErrorMessage('No active editor found!');
			return;
		}

		const filePath = editor.document.fileName;

		// Defining the input and output file paths
		const inputFilePath = path.join(__dirname, "input.txt");
		const outputFilePath = path.join(__dirname, "output.txt");

		// takeInputFromUser(inputFilePath, outputFilePath, filePath);
		fetchInputDynamically(inputFilePath, outputFilePath, filePath);
	});
	context.subscriptions.push(runTests);
}



// This method is called when your extension is deactivated
function deactivate() { }

module.exports = {
	//run command "vsce package" to create the .vsix file and use it locally or publish it on the marketplace
	activate,
	deactivate
}
