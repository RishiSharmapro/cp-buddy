// The module 'vscode' contains the VS Code extensibility API

// import { time, timeStamp } from 'console';

// import { stderr, stdout } from 'process';

// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode'); // For interacting with the editor

const cp = require('child_process'); // For running shell commands
const fs = require('fs'); // For working with files
const path = require('path'); // For working with file paths
// const axios = require('axios');	// For making HTTP requests
// const cheerio = require('cheerio'); // For web scraping
const puppeteer = require('puppeteer'); // For web scraping - as direct HTTP requests are blocked by Cloudflare
const puppeteerExtra = require('puppeteer-extra'); // for bypassing cloudfare at login
const StealthPlugin = require('puppeteer-extra-plugin-stealth'); // for bypassing cloudfare at login
const CACHE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
// Object to hold cache entries keyed by problem ID
// Each entry is an object: { data: <test cases>, timestamp: <time in ms> }
let TestCaseCache = {};

// function to cleanup the test case cache after 2 hours
function clearCache() {
	for(const key in TestCaseCache) {
		if (Date.now() - TestCaseCache[key].timeStamp > CACHE_DURATION_MS) {
			delete TestCaseCache[key];
		}
	}
}

setInterval(() => {
	clearCache()
}, CACHE_DURATION_MS);

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// This line of code will only be executed once when the extension is activated
	console.log('Congratulations, your extension "cp-buddy" is now active!');


	const disposable = vscode.commands.registerCommand('cp-buddy.helloWorld', function () {
		vscode.window.showInformationMessage('Hello World from CP-buddy!');
	});
	context.subscriptions.push(disposable);


	const FIRST_RUN_KEY = 'cpbuddy.firstRun';
	// Check if the extension is running for the first time
    if(!context.globalState.get(FIRST_RUN_KEY)) {
		// Show welcome message
		vscode.window.showInformationMessage('Welcome to CP Buddy! 🚀');
		// install the required language
		installLanguage(context);
	}

	// Register command to install additional languages
	const installLanguageCommand = vscode.commands.registerCommand('cp-buddy.installLanguage',function () {
        installLanguage(context);
    });
	context.subscriptions.push(installLanguageCommand);

	// Function to install a language via Homebrew
	function installLanguage(context) {
		vscode.window.showQuickPick(getSupportedLanguages(), {
			placeHolder: 'Select a programming language to install via Homebrew'}).then(selection => {
			if (!selection) {
				vscode.window.showWarningMessage('No language selected.');
				return;
			}

			const brewInstallCommand = getBrewInstallCommand(selection);
			if (!brewInstallCommand) {
				vscode.window.showErrorMessage(`Installation command for ${selection} not defined.`);
				return;
			}

			// Run the brew install command
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Installing ${selection}...`,
				cancellable: false
			}, () => {
				return new Promise((resolve, reject) => {
					cp.exec(brewInstallCommand, (error, stdout, stderr) => {
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
		});
	}
	// List of supported languages
	function getSupportedLanguages() {
		return [
			'C++', 'C', 'Python', 'Java', 'Go', 'Rust', 'Ruby', 'Node.js', 'PHP', 'Scala','Perl', 'Haskell', 'Kotlin', 'C#', 'OCaml', 'D', 'Delphi', 'Pascal'
		];
	}

		// Map of languages to their corresponding Homebrew install commands
	function getBrewInstallCommand(language) {
		const commands = {
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

		return commands[language] || null;
	}


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
			// const urlRegex = /\/\/\s*problem\s*:\s*(https:\/\/codeforces\.com\/contest\/\d+\/problem\/[A-Z])/i;

			const urlRegex = /\s*(https:\/\/codeforces\.com\/(?:contest\/\d+\/problem|problemset\/problem\/\d+)\/[A-Z]\d*)/i;
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


	// for deleting the input and output files
	async function cleanUpFiles(inputFilePath, outputFilePath) {
		// also deleting compiled binary file
		const binaryFilePath = outputFilePath.replace('_result.txt', '.out');
		console.log("binaryFilePath: ", binaryFilePath);
		
		[inputFilePath, outputFilePath, binaryFilePath].forEach((file) => {
			if (fs.existsSync(file)) {
				fs.unlinkSync(file);
				console.log(`Deleted temporary file: ${file}`);
			}
			else {
                console.log(`File not found: ${file}`);
            }
		});

		// deleting binary file after 0.5s
		// setTimeout(() => {
		// 		if (fs.existsSync(binaryFilePath)) {
		// 			fs.unlinkSync(binaryFilePath);
		// 			console.log(`Deleted temporary file: ${binaryFilePath}`);
		// 		}
		// 		else {
		// 			console.log("Error deleting binary file: ");
		// 		}
		// }, 1000);
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
		else if(stderr.length > 0) {
			return stderr;
		}

		return "No errors detected.";
	}


	async function createPannel(userInput, stdout, stderr, contestId, problemLetter, actualOutput, sourceCode = '') {
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
		
		if (stderr.length > 0) {
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
				${isNaN(contestId) ? '' : `<p>Contest ID: ${contestId} <br />Problem ID: ${problemLetter}</p>`}
				
				<div class="structure">
						<h2>Input</h2>
						<pre class="width">${userInput}</pre>
				</div>
					${!stderr ? `
						<div class="structure" style="border: 1px solid ${(stdout === actualOutput) ? `green` : `red`}; border-radius: 10px;>
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

		  	/* submit solution html code 
				${!stderr && stdout === actualOutput ? `
					<button id="submitButton">Submit Solution</button>
					<script>
						const vscode = acquireVsCodeApi();
						document.getElementById('submitButton').addEventListener('click', () => {
							vscode.postMessage({ command: 'submitSolution' });
						});
					</script>
				` : ''}
			 */

		// Handle messages from the webview
		// panel.webview.onDidReceiveMessage(
		// 	message => {
		// 		if (message.command === 'submitSolution') {
		// 			handleSubmissionButtonClick(`https://codeforces.com/contest/${contestId}/problem/${problemLetter}`, sourceCode);
		// 		}
		// 	},
		// 	undefined,
		// 	context.subscriptions
		// );

	}

	// function for submission of the solution to codeforces
	async function submitSolutionToCodeforces(problemUrl, sourceCode, languageId) {
		try {
			
			puppeteerExtra.use(StealthPlugin());

			const browser = await puppeteerExtra.launch({
				headless: false,
				args: [
					'--no-sandbox',
					'--disable-setuid-sandbox',
					'--disable-blink-features=AutomationControlled',
					'--disable-infobars',
					'--window-size=1280x800',
				]
			});

			const context = await browser.createBrowserContext();
			// creating a new page
			const page = await context.newPage();

			// setting the user agent
			await page.setUserAgent(
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36'
			);

			// Maximize the window by setting a large window size (e.g., 1920x1080)
			await page.setViewport({ width: 1420, height: 1080 });

			// ✅ Set cf_clearance cookie using browser context
			// const context = browser.defaultBrowserContext();
			// await context.overridePermissions('https://codeforces.com', []);


			await context.setCookie({
				name: 'cf_clearance',
				value: 'w8Su_FoYN94VwIesSGN7tlDINfUrPRkYlF891uDfjGY-1736936837-1.2.1.1-Qmiq.24c9TUZa8SUoWvlMr4RpyaCWaCEzsPGmIgVVdHcLFmIDNDwduM59UHoTsUXWYqY3fZInkiMRMbzOj92f9W7T3THBqHLbgynx2X1arQxoIzD9e32ZsK_lOuEdfP1FxamayG0kF2jgFek1QplJN9c3ZnLqexKtH4tZ0retfnLijg3geqPYaHCTRg3ZE3rPBs84EHr9dIkffuU5ZZUUGrsRzuDuBpJ8tWrKpQEer8wyZ7Uhca07kDYhISgxSnCOFicHeXhavXk4itbkexbc.XZfHLnTknfZOM.wgJ2P2JGTCF9qaAAI1AWK4MC.0PaADEZObJ99dENNpCFo2diIQ',
				domain: 'codeforces.com',
				path: '/',
				httpOnly: true,
				secure: true,
				sameSite: 'Strict'
			});


			// bypassing cloudfaree
			await page.goto('https://codeforces.com/');
			await page.mouse.move(100, 100);
await page.mouse.move(200, 200);
await page.mouse.move(300, 300);

			// wait for 1 second
			// ⏳ Custom sleep function as waitForTimeout workaround
			const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
			await sleep(3000);

			await page.goto('https://codeforces.com/enter');
			await page.mouse.move(100, 100);
await page.mouse.move(200, 200);
await page.mouse.move(300, 300);




			// Replace with your credentials
			const username = 'YOUR_USERNAME';
			const password = 'YOUR_PASSWORD';

			await page.type('#handleOrEmail', username);
			await page.type('#password', password);
			await Promise.all([
				page.click('.submit'),
				page.waitForNavigation({ waitUntil: 'networkidle2' }),
			]);

			await page.goto(problemUrl.replace('/problem/', '/submit'));
			await page.select('select[name="programTypeId"]', languageId.toString());
			await page.type('textarea[name="source"]', sourceCode);

			await Promise.all([
				page.click('input[type="submit"]'),
				page.waitForNavigation({ waitUntil: 'networkidle2' }),
			]);

			vscode.window.showInformationMessage('✅ Solution submitted successfully!');
			await browser.close();
		} catch (error) {
			vscode.window.showErrorMessage(`❌ Submission failed: ${error}`);
		}
	}

	function handleSubmissionButtonClick(problemUrl, sourceCode) {
		// const sourceCode = fs.readFileSync(filePath, 'utf8');
		const languageId = '54'; // Example: 54 for GNU G++20 (C++20)

		submitSolutionToCodeforces(problemUrl, sourceCode, languageId);
	}


	async function fetchTestCase(problemUrl, contestId, problemLetter) {

		const cacheKey = contestId + problemLetter;
		try {
			if(TestCaseCache[cacheKey]) {
				console.log("Current Cache: ", TestCaseCache);
				// console.log("Using cached test cases");
				const input = TestCaseCache[cacheKey].inputData;
				const output = TestCaseCache[cacheKey].outputData;
				// console.log("input -> ", input);
				// console.log("output -> ", output);
				const testCases = {input, output};
				return testCases;
			}
			// launch the browser
			const browser = await puppeteer.launch({
				// executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', // to use other browsers
				// headless: true, // set to false to see the browser in action
				headless: false, // set to false to see the browser in action
				args: ['--no-sandbox', '--disable-setuid-sandbox']
			});

			// create a new page
			const page = await browser.newPage();
			// setting the user agent
			await page.setUserAgent(
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36'
			);

			// open the problem URL
			await page.goto(problemUrl, {
				waitUntil: 'domcontentloaded'
			});
			console.log(`Opened the problem: ${problemUrl}`);
			// const samples = await page.waitForSelector('.sample-test', { visible: true, timeout: 60000 });
			// console.log("samples: ", samples);


			// Extract the test cases using the page selectors
			const testCases = await page.evaluate(() => {
				const inputs = [];
				const outputs = [];
				// @ts-ignore 
				// eslint-disable-next-line no-undef
				const sampleTests = document.querySelectorAll('.sample-test');

				// Iterate over all sample test cases
				sampleTests.forEach((test) => {
					
					const inputElement = test.querySelector('.input pre');
					const outputElement = test.querySelector('.output pre');

					// Process the input: iterate over all <div> children of the <pre> element
					let input = '';
					if (inputElement) {
						const inputLines = inputElement.querySelectorAll('div');
						if(inputLines.length === 0) {
							input = inputElement.textContent.trim();
						}
						else {
							input = Array.from(inputLines).map(line => line.textContent.trim()).join('\n');
						}
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
			console.log("Closing the browser!!!");
			
			TestCaseCache[cacheKey] = {
				inputData: testCases.inputs,
				outputData: testCases.outputs,
				timeStamp: Date.now()
			}
			return testCases;

		}
		catch (error) {
			vscode.window.showErrorMessage(`Failed to fetch the sample cases: ${error}`);
			return;
		}
	}

	// Detect language based on file extension
	function detectLanguage(extension) {
		const extensionMap = {
			'.cpp': 'C++',
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
		return extensionMap[extension] || null;
	}
	
	// Get the command to run code
	function getRunCommand(language, filePath) {
		const fileDir = path.dirname(filePath);
		const fileName = path.basename(filePath, path.extname(filePath)); // e.g., 1903_A_Halloumi_Boxes
		const outputBinary = path.join(fileDir, `${fileName}.out`);
		// Define input and result output files (you can change these as needed)
		const inputFile = path.join(fileDir, `${fileName}_input.txt`);
		const resultOutputFile = path.join(fileDir, `${fileName}_result.txt`);
			
		const commands = {
			'C++': `/opt/homebrew/bin/g++-14 "${filePath}" -o "${outputBinary}" -std=c++20 && "${outputBinary}" < "${inputFile}" > "${resultOutputFile}"`,
			'C': `/opt/homebrew/bin/gcc-14 "${filePath}" -o "${outputBinary}" && "${outputBinary}"`,
			'Python': `python3 "${filePath}"`,
			'Java': `javac "${filePath}" && java "${fileName}"`,
			'Node.js': `node "${filePath}"`,
			'Go': `go run "${filePath}"`,
			'Rust': `rustc "${filePath}" -o "${outputBinary}" && "${outputBinary}"`,
			'Ruby': `ruby "${filePath}"`,
			'PHP': `php "${filePath}"`,
			'Scala': `scala "${filePath}"`,
			'Perl': `perl "${filePath}"`,
			'Haskell': `runhaskell "${filePath}"`,
			'Kotlin': `kotlinc "${filePath}" -include-runtime -d "${fileDir}/${fileName}.jar" && java -jar "${fileDir}/${fileName}.jar"`,
			'C#': `mono "${filePath}"`,
			'OCaml': `ocaml "${filePath}"`,
			'D': `dmd "${filePath}" -of"${outputBinary}" && "${outputBinary}"`,
			'Pascal': `fpc "${filePath}" && "${path.join(fileDir, fileName)}"`
		};

		return commands[language] || null;
	}

	async function fetchInputDynamically(inputFilePath, outputFilePath, filePath, sourceCode) {

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
			// Fetching the test cases
			// let {inputs, outputs} = await fetchTestCase(problemUrl, contestId, problemLetter);
			let inputs = [];
			let outputs = [];
			await fetchTestCase(problemUrl, contestId, problemLetter)
			inputs = TestCaseCache[contestId + problemLetter].inputData;
			outputs = TestCaseCache[contestId + problemLetter].outputData;			

			if (inputs.length === 0 || outputs.length === 0) {
				console.log(inputs, outputs);
				
				vscode.window.showErrorMessage("Failed to fetch test cases. Please check the problem URL.");
				return;
			}

			console.log("inputs: ", inputs);
			// console.log("outputs: ", outputs);

			
			// Defining commands to run based on the file extension
			const ext = path.extname(filePath);
			const language = detectLanguage(ext);
			
			if (!language) {
				vscode.window.showErrorMessage("Unsupported file type.");
				return;
			}
			
			// getting the appropriate run command
			const runCommand = getRunCommand(language, filePath);
			
			const fileDir = path.dirname(filePath);
			const fileName = path.basename(filePath, path.extname(filePath));
			// Writing the input to file
			inputFilePath = path.join(fileDir, `${fileName}_input.txt`);
			outputFilePath = path.join(fileDir, `${fileName}_result.txt`);
			fs.writeFileSync(inputFilePath, inputs.join('\n'));
			console.log(`Input written to ${inputFilePath}`);
			
			if (!runCommand) {
				vscode.window.showErrorMessage(`No execution command found for ${language}.`);
				return;
			}

			// if (ext === ".cpp") {
			// 	// command = `g++ ${filePath} -o ${filePath}.out && ${filePath}.out < ${inputFilePath} > ${outputFilePath}`;
			// 	const outputFileBase = path.basename(filePath, '.cpp'); // Get file name without extension
			// 	// command = `g++ ${filePath} -o ${outputFileBase}.out && ./${outputFileBase}.out < ${inputFilePath} > ${outputFilePath}`;
			// 	command = `cd "${path.dirname(filePath)}" && g++ -std=c++20 ${path.basename(filePath)} -o ${outputFileBase}.out && ./${outputFileBase}.out < "${inputFilePath}" > "${outputFilePath}"`;
			// }
			// else {
			// 	vscode.window.showErrorMessage("Unsupported file type.");
			// 	return;
			// }

			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Running ${path.basename(filePath)}`,
				cancellable: false
				}, () => {
				return new Promise((resolve, reject) => {
					// Executing the command and Getting the result of file execution
					cp.exec(runCommand, {timeout: 10000}, (err, stdout, stderr) => {
						if (err || stderr) {
							if (err.killed) {
								vscode.window.showErrorMessage("Error: Execution timed out!");
							} else {
								vscode.window.showErrorMessage(`Error: ${err.message || stderr}`);
							}
							console.log("stderr: " + stderr);
							
							createPannel(inputs.join('\n'), stdout, "Execution timed out!", contestId, problemLetter);
							reject(err || stderr);
							return;
						}
						try {
							const userOutput = fs.readFileSync(outputFilePath, 'utf8');
							// vscode.window.showInformationMessage(`Output:\n${userOutput}`);
							const correctOutput = outputs.join('\n');
							// console.log("correctOutput: ", correctOutput);
							// console.log("userOutput: ", userOutput);
							
							if (userOutput.trim() === correctOutput.trim()) {
								createPannel(inputs.join('\n'), userOutput.trim(), stderr, contestId, problemLetter, correctOutput.trim(), sourceCode);
								vscode.window.showInformationMessage("✅ All test cases passed! ");
							}
							else {
								// vscode.window.showErrorMessage("Some test cases failed!");
								vscode.window.showWarningMessage("Some test cases failed!");
								createPannel(inputs.join('\n'), userOutput, stderr, contestId, problemLetter, correctOutput, sourceCode);
							}
						}
						catch (readError) {
							vscode.window.showErrorMessage(`Failed to read output: ${readError}`);
						}
						finally {
							console.log("Cleaning up files");
							cleanUpFiles(inputFilePath, outputFilePath);				
							resolve();
						}
					}).on('kill', (code) => {
						console.log("Exit code: ", code);
						cleanUpFiles(inputFilePath, outputFilePath);				
					});
					console.log("Successfully executed the command: runTestCases");
				});
			});
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
		let sourceCode = ''


		if (!editor) {
			vscode.window.showErrorMessage('No active editor found!');
			return;
		}
		else {
			sourceCode = editor.document.getText();
		}

		const filePath = editor.document.fileName;

		// Defining the input and output file paths
		const inputFilePath = path.join(__dirname, "input.txt");
		var outputFilePath = path.join(__dirname, "output.txt");

		// takeInputFromUser(inputFilePath, outputFilePath, filePath);
		fetchInputDynamically(inputFilePath, outputFilePath, filePath, sourceCode);
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
