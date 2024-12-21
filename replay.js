const { createRunner, PuppeteerRunnerExtension, parse } = require('@puppeteer/replay');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function RunFile({ filePath, resultsDir, headless = true }) {
    const browser = await puppeteer.launch({
        headless,
    });

    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(30000); // Set a custom timeout of 30 seconds

    class Extension extends PuppeteerRunnerExtension {
        async beforeAllSteps(flow) {
            await super.beforeAllSteps(flow);
        }

        async beforeEachStep(step, flow) {
            await super.beforeEachStep(step, flow);
        }

        async afterEachStep(step, flow) {
            await super.afterEachStep(step, flow);
        }

        async afterAllSteps(flow) {
            await super.afterAllSteps(flow);
        }
    }

    try {
        // Read and parse steps from the JSON file
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const flow = JSON.parse(fileContent); // Parse the JSON content into a JavaScript object

        const runner = await createRunner(
            flow, // Use the steps from the parsed JSON file
            new Extension(browser, page, 30000)
        );

        await runner.run();

        /*
        // Save a screenshot with the JSON file name
        const screenshotFilename = `${path.basename(filePath, '.json')}_screenshot.png`;
        const screenshotPath = path.join(resultsDir, screenshotFilename);
        await page.screenshot({ path: screenshotPath });
        console.log(`Screenshot saved to: ${screenshotPath}`);
        */

        await browser.close();
        return { success: true, filePath};
    } catch (error) {
        console.error(`${path.basename(filePath)}: failed`, error.message);

        await browser.close();
        return { success: false, filePath, error: error.message };
    }
}

async function processAllFiles() {
    const directoryPath = path.resolve(__dirname, 'dataset', 'Recordings');
    const resultsDir = path.join(directoryPath, 'results');
    const resultsFilePath = path.join(directoryPath, 'results.txt'); // Save results.txt in the same directory

    // Ensure the results directory exists
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir);
    }

    const results = [];

    // Get all JSON files in the directory
    const files = fs.readdirSync(directoryPath).filter(file => file.endsWith('.json'));

    // Process each file
    for (const file of files) {
        const filePath = path.join(directoryPath, file);
        console.log(`Processing: ${file}`);
        let result;
        try {
            result = await RunFile({ filePath, resultsDir, headless: true });
        } catch {
            result = { success: false, filePath, error: 'Unknown error' };
        }
        results.push(result);
    }

    // Write results to a text file
    const resultsContent = results
        .map(
            ({ success, filePath, error, screenshotPath }) =>
                `${path.basename(filePath)}: ${
                    success
                        ? `succeeded`
                        : `failed - ${error || 'unknown error'}`
                }`
        )
        .join('\n');

    fs.writeFileSync(resultsFilePath, resultsContent, 'utf-8');
    console.log(`Results written to ${resultsFilePath}`);
}

// Start the processing
processAllFiles();
