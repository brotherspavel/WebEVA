const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// Function to find all files matching a specific pattern
function findFiles(dir, pattern, fileList = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            findFiles(fullPath, pattern, fileList);
        } else if (file.endsWith(pattern)) {
            fileList.push(fullPath);
        }
    });
    return fileList;
}

// Helper function to calculate median
function calculateMedian(values) {
    if (values.length === 0) return 0;
    values.sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    return values.length % 2 !== 0 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

// Function to process CSV files and calculate total, average, and median lengths
async function processCSVFiles(folderPath) {
    const csvFiles = findFiles(folderPath, 'no_text.csv');
    if (csvFiles.length === 0) {
        console.log('No text_elements.csv files found.');
        return;
    }

    let totalOriginalLength = 0;
    let totalFilteredLength = 0;
    let totalRows = 0;
    let totalNumberOf1s = 0;
    const originalLengths = [];
    const filteredLengths = [];

    for (const file of csvFiles) {
        await new Promise((resolve, reject) => {
            fs.createReadStream(file)
                .pipe(csv())
                .on('data', (row) => {
                    const originalLength = parseFloat(row.original_length) || 0;
                    const filteredLength = parseFloat(row.filtered_length) || 0;

                    totalOriginalLength += originalLength;
                    totalFilteredLength += filteredLength;
                    originalLengths.push(originalLength);
                    filteredLengths.push(filteredLength);
                    if (filteredLength === 1) {
                        totalNumberOf1s++;
                    }
                    totalRows++;
                })
                .on('end', resolve)
                .on('error', reject);
        });
    }

    if (totalRows === 0) {
        console.log('No rows found in the CSV files.');
        return;
    }

    const averageOriginalLength = totalOriginalLength / totalRows;
    const averageFilteredLength = totalFilteredLength / totalRows;
    const medianOriginalLength = calculateMedian(originalLengths);
    const medianFilteredLength = calculateMedian(filteredLengths);

    console.log(`Total Rows: ${totalRows}`);
    console.log(`Total Number of 1s: ${totalNumberOf1s}`);
    console.log("1 percent: " + (totalNumberOf1s / totalRows) * 100);
    console.log(`Total Original Length: ${totalOriginalLength}`);
    console.log(`Total Filtered Length: ${totalFilteredLength}`);
    console.log(`Average Original Length: ${averageOriginalLength}`);
    console.log(`Average Filtered Length: ${averageFilteredLength}`);
    console.log(`Median Original Length: ${medianOriginalLength}`);
    console.log(`Median Filtered Length: ${medianFilteredLength}`);
}

const folderPaths = ['./allrecipes', './amazon', './apple', './arxiv', './bbc', './booking', './cambridge',
    './coursera', './espn', './flights', './github', './google', './huggingface', './maps', './wolfram'
 ]; // Add multiple folder paths here

async function processAllFolders() {
    for (const folderPath of folderPaths) {
        try {
            await processCSVFiles(folderPath);
            console.log(`Successfully processed files in: ${folderPath}`);
        } catch (err) {
            console.error(`Error processing CSV files in ${folderPath}:`, err);
        }
    }
}

processAllFolders();
