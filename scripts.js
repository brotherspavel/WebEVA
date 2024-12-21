const borderColor = 'black';
const { getNextAction, getWeb, getDescribeAction, getObservation, locateBox, getSummarizedTask, getCustomAction } = require('./api');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const axios = require('axios');

function addBoundingBoxes(elementType, yOffset) {
  // Define valid tag groups
  const validGroups = {
      input: ["INPUT", "TEXTAREA"],
      select_item: ["LI", "TD", "OPTION"],
      select: ["SELECT", "BUTTON"],
      button: ["SELECT", "BUTTON"],
      a: ["A"],
      iframe: ["IFRAME"],
      video: ["VIDEO"]
  };

  const tagsToFilter = validGroups[elementType] || [];
  const elements = Array.from(document.querySelectorAll('*')).filter(element =>
      tagsToFilter.includes(element.tagName)
  )

  let index = 1;

  elements.forEach((el) => {
      const bbox = el.getBoundingClientRect();

      // !(bbox.top < 1280) this is for headers and stuff
      if (!(bbox.bottom > yOffset && bbox.top < Number(yOffset) + 1280) && !(bbox.top < 1280)) {
        return;
      }


      el.setAttribute('el-index', index);

      const newElement = document.createElement('div');
      newElement.classList.add('bounding-box-overlay');
      newElement.style.outline = `2px dashed ${borderColor}`;
      newElement.style.position = 'fixed';
      newElement.style.left = `${bbox.left}px`;
      newElement.style.top = `${bbox.top}px`;
      newElement.style.width = `${bbox.width}px`;
      newElement.style.height = `${bbox.height}px`;
      newElement.style.pointerEvents = 'none';
      newElement.style.boxSizing = 'border-box';
      newElement.style.zIndex = 999999;

      const label = document.createElement('span');
      label.textContent = index;
      label.style.position = 'absolute';
      label.style.top = `${Math.max(-16, -bbox.top)}px`;
      label.style.left = '0px';
      label.style.background = borderColor;
      label.style.color = 'white';
      label.style.padding = '2px 4px';
      label.style.fontSize = '12px';
      label.style.borderRadius = '2px';

      newElement.appendChild(label);
      document.body.appendChild(newElement);

      index++;
  });
}

const segmentWidth = 1024;
const segmentHeight = 1792;

async function TestRun() {
  const browser = await chromium.launch({
    headless: false, // Set to true if you want headless mode
    args: ["--lang=en-US"], // Force US English locale
    ignoreDefaultArgs: ["--hide-scrollbars"], // Ignore default args
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: segmentWidth, height: segmentHeight });
  await page.goto("https://www.allrecipes.com/recipe/284027/chocolate-chip-coconut-cookies/");
  
  await page.waitForTimeout(3000);
    // Take a full-page screenshot as a buffer
    const screenshotBuffer = await page.screenshot({ fullPage: true });
  
    // Close the browser
    await browser.close();
    
    // Get dimensions of the screenshot
    const { height, width } = await sharp(screenshotBuffer).metadata();
  
    console.log(`Screenshot Dimensions: width = ${width}, height = ${height}`);
  
    // Define the base yOffset and height for cropping
    const baseYOffset = 0;
    const cropHeight = 1600;
  
    // Initialize sections
    const sections = [];
    let currentYOffset = baseYOffset;
  
    while (currentYOffset < height && sections.length < 3) {
      // Calculate the height of the current section
      const adjustedHeight = Math.min(cropHeight, height - currentYOffset);
  
      sections.push({ yOffset: currentYOffset, height: adjustedHeight });
  
      // Update yOffset for the next section
      currentYOffset += cropHeight;
    }
  
    console.log("Cropping sections:", sections);
    
  // Variables to hold Base64 image URLs
  let screenshot1base64ImageUrl;
  let screenshot2base64ImageUrl;
  let screenshot3base64ImageUrl;

  // Process and save each section
  await Promise.all(
    sections.map(async ({ yOffset, height }, index) => {
      const croppedBuffer = await sharp(screenshotBuffer)
        .extract({ left: 0, top: yOffset, width, height })
        .toBuffer();
      
      const fileName = `section${index + 1}.png`;
      fs.writeFileSync(fileName, croppedBuffer);
      console.log(`Saved ${fileName}`);

      // Assign Base64 image URLs
      const base64String = `data:image/png;base64,${croppedBuffer.toString('base64')}`;
      if (index === 0) {
        screenshot1base64ImageUrl = base64String;
      } else if (index === 1) {
        screenshot2base64ImageUrl = base64String;
      } else if (index === 2) {
        screenshot3base64ImageUrl = base64String;
      }
    })
  );

  await getSummarizedTask([{ task: "What is the title, ingredients, and steps for this recipe" }], screenshot1base64ImageUrl, screenshot2base64ImageUrl, screenshot3base64ImageUrl).then((response) => {
    console.log(response);
  })
    /*
  await page.screenshot({ path: 'fullpage-screenshot.png', fullPage: true });
  const base64Image = fs.readFileSync('fullpage-screenshot.png', 'base64');
  const base64ImageUrl = `data:image/png;base64,${base64Image}`;

  await page.waitForTimeout(50000);
  browser.close();
  */
}

//TestRun();

async function BasicTest() {
  const jsonPayload = {
    model: process.env.model, // Replace with your desired model name
    messages: [
      {
        role: "system",
        content: "You are a robot designed to browse and interact with web pages. Your role is to identify and act on specific web elements based on the provided inputs and observations.",
      }
    ]
  };

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    jsonPayload,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Replace with your OpenAI API key
      },
    }
  ).catch((error) => {
    console.error("error", error);
  });

  //console.log(response.data.choices[0].message.content);
}

const { chromium } = require('playwright');

/*
      input: ["INPUT", "TEXTAREA"],
      select_item: ["LI", "TD", "OPTION"],
      select: ["SELECT", "BUTTON"],
      button: ["SELECT", "BUTTON", "A"],
      a: ["A", "BUTTON"],
      */

      /*
    - Use \`click\` for obvious navigation or interaction elements (e.g., "Click the 'Submit' button").
    - Use \`type\` if the task involves entering text or utilizing a search field (e.g., "Type 'weather today' into the search bar labeled 'Search'").
    - Use \`scroll\` if the needed information is likely not currently visible (e.g., "Scroll down to reveal more options").
    - Use \`go back\` if navigation to a previous page is necessary (e.g., "Go back to the previous page to revisit the article").


    const LOCATE_BOX = `
You are a robot designed to browse and interact with web pages. Your role is to identify and act on specific web elements based on the provided inputs and observations.

### Inputs Provided:
1. **Task**:
   - A high-level description of the user's objective or goal that you are assisting with.

2. **Action and Explanation**:
   - A detailed description of the specific action to perform and the reasoning behind it, such as clicking a button, entering text, or selecting an option.

3. **Expected Element Type**:
   - The type of web element you are expected to locate (e.g., button, input, dropdown).

4. **Screenshot**:
   - A screenshot of the current webpage.
   - **Important**: Interactable web elements in the screenshot are labeled with **numerical labels**. These labels are positioned in the **TOP LEFT corner** of each corresponding element.

### Objective:
Your primary goal is to:
- Identify the **numerical label** of the element required to complete the described action, based on the \`expected_element_type\`.
- If the element cannot be identified or is missing from the screenshot, you must return \`0\`.
- **Do not guess or fabricate numbers**. Only return the label if it is clearly visible and corresponds to the element needed for the action.

### Key Rules:
1. Prioritize accuracy. Identify only the element that directly corresponds to the provided \`action_and_explanation\` and \`expected_element_type\`.
2. If the label for the desired element is not visible, unclear, or missing in the screenshot, return \`0\`.
3. Ensure your output reflects the provided inputs without assumptions or guesses.

### Output Format:
You must respond with a JSON object in the following structure:
\`\`\`json
{
  "number": <number>
}
\`\`\`
`;
    */


/*
        await page.evaluate(
          ({ validGroups, elementType, yOffset, borderColor }) => {
            const tagsToFilter = validGroups[elementType] || [];
            const elements = Array.from(document.querySelectorAll('*')).filter((element) =>
              tagsToFilter.includes(element.tagName)
            );
        
            let index = 1;
        
            elements.forEach((el) => {
              // Skip elements with innerText or placeholder
              if (el.innerText.trim() || el.hasAttribute('placeholder')) {
                return;
              }
        
              const bbox = el.getBoundingClientRect();
        
              // Skip elements outside the visible viewport
              if (!(bbox.bottom > yOffset && bbox.top < Number(yOffset) + 1600) && !(bbox.top < 1600)) {
                return;
              }
        
              el.setAttribute('el-index', index);
        
              // Create a bounding box
              const newElement = document.createElement('div');
              newElement.classList.add('bounding-box-overlay');
              newElement.style.outline = `2px dashed ${borderColor}`;
              newElement.style.position = 'fixed';
              newElement.style.left = `${bbox.left}px`;
              newElement.style.top = `${bbox.top}px`;
              newElement.style.width = `${bbox.width}px`;
              newElement.style.height = `${bbox.height}px`;
              newElement.style.pointerEvents = 'none';
              newElement.style.boxSizing = 'border-box';
              newElement.style.zIndex = 99999999;
        
              // Add a label with the index
              const label = document.createElement('span');
              label.textContent = index;
              label.style.position = 'absolute';
              label.style.top = `${Math.max(-12, -bbox.top)}px`;
              label.style.left = '0px';
              label.style.background = borderColor;
              label.style.color = 'white';
              label.style.padding = '1px 4px 1px 4px';
              label.style.fontSize = '16px';
              label.style.borderRadius = '2px';
        
              newElement.appendChild(label);
              document.body.appendChild(newElement);
        
              index++;
            });
          },
          {
            validGroups,
            elementType: 'button',
            yOffset: yOffset * localState.scrollIndex,
            borderColor: "black",
          } // Passing arguments to the browser context
        );
        */

        /*
const validGroups = {
  input: ["INPUT", "TEXTAREA"],
  select_item: ["LI", "TD", "OPTION", '[role="treeitem"]', '[role="button"]'],
  select: ["SELECT", "BUTTON", '[role="treeitem"]'],
  button: ["SELECT", "BUTTON", "A", '[role="button"]', '[role="treeitem"]'],
  a: ["A", "BUTTON", '[role="button"]', '[role="treeitem"]'],
  iframe: ["IFRAME"], // ignore for now
  video: ["VIDEO"]  // ignore for now
};
*/

            /*
                      const visibleRange = { top: localState.scrollIndex*yOffset, bottom: localState.scrollIndex*yOffset + segmentHeight };

            const filteredElements = [];
            for (const element of elementsSet) {
                const bbox = await element.boundingBox();
                if (!bbox) continue; // Skip if boundingBox is null (element not visible at all)
          
                // Apply filtering logic
                if (
                    !((bbox.y + bbox.height) > visibleRange.top && bbox.top < visibleRange.bottom) &&
                    !(bbox.y < 1600)
                ) {
                    continue; // Skip elements outside the viewport or range
                }
          
                filteredElements.push(element);
            }
  
            if (filteredElements.length > 0) {
              elementsSet = filteredElements;
            }
              */


            /*
                      const visibleRange = { top: localState.scrollY, bottom: localState.scrollY + segmentHeight };

          const filteredElements = [];
          // Might need to change to account for modals
          for (const element of elementsSet) {
            const rect = await page.evaluate(el => {
              const boundingRect = el.getBoundingClientRect();
              return {
                  top: boundingRect.top,
                  bottom: boundingRect.bottom,
                  height: boundingRect.height,
                  y: boundingRect.y
              };
            }, element);
        
            if (!rect) {
              if (verbose) {
                // no rect for outerhtml e lement
                console.log("no rect for element", await element.evaluate((el) => el.outerHTML));
              }
              filteredElements.push(element);
              continue;
            }
        
            // Apply filtering logic
            if (
              !((rect.y + rect.height) > visibleRange.top && rect.top < visibleRange.bottom) &&
              !(rect.y < 1600)
            ) {
              continue; // Skip elements outside the viewport or range
            }
        
            filteredElements.push(element);
          }

          if (verbose) {
            console.log("elementsSet length", elementsSet.length);
          }
          if (verbose) {
            console.log("filtering by visible range", filteredElements.length);
          }
          if (filteredElements.length > 0) {
            elementsSet = filteredElements;
          }
            */

                            /*
                // Additional check for children's innerText and placeholder
                if (!isMatch) {
                  const children = await element.locator('*').all(); // Get all children
                  for (const child of children) {

                    const isHTMLElement = await child.evaluate((node) => node instanceof HTMLElement);
                    if (!isHTMLElement) {
                      continue; // Skip non-HTML elements
                    }
                
                    const childInnerText = ((await child.innerText()) || '').trim().toLowerCase();
                    const childPlaceholder = ((await child.getAttribute('placeholder')) || '').trim().toLowerCase();
                    if (
                      (childInnerText && (childInnerText.includes(normalizedStringToMatch) || normalizedStringToMatch.includes(childInnerText))) ||
                      (childPlaceholder && (childPlaceholder.includes(normalizedStringToMatch) || normalizedStringToMatch.includes(childPlaceholder)))
                    ) {
                      isMatch = true;
                      break; // Exit loop early if a match is found
                    }
                  }
                }
                */