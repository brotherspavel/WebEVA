const { getNextAction, getWeb, getDescribeAction, getObservation, getUpdateTask, getIsTaskComplete, getElement, getSummarizedTask, getCustomAction, getOptions } = require('./api');
const { chromium } = require('playwright');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const { writeToStream } = require('fast-csv');
const sharp = require('sharp');

const segmentWidth = 900;
const segmentHeight = 1600;
const yOffset = 1000;

// Adjust these when needed. Depends on vpn and network speed.
const firstUrlWait = 4000; // when scroll to
const newUrlWait = 3000;  // when button click
const sameUrlWait = 500; // scroll

const MAX_STEPS = 25;
const MAX_ERRORS = 8;

const state = {
  stateAction: null,
  web: "https://www.example123.com/",
  task: null,
  user_action_and_explanation: null,
  actionJson: {},
  observations: [],
  currentImage: null,
  currentBoxedImage: null,
  prevImage: null,
  task_answer: "",
  currentStep: 0,
  scrollY: 0,
  errors: 0,

  // Method to reset the state
  reset(prompt) {
    this.browsing = true;
    this.currentStep = 0;
    this.errors = 0;
    this.newUrl = null;
    this.currentTask = prompt;
    this.messages = [...initialMessages]; // Reset to initial messages
    this.retrieveMessages = [...initialRetrieveMessages]; // Reset to initial retrieve messages
    this.nextActionText = "";
    this.scrollY = 0;
    this.screenshotIndex = 0;
  },
};

async function browse({ task, web = "", verbose = false, headless = false, taskUpdate = true }) {
  // Path to the directory where the files are located
  const directory = ".";

  // Delete all files matching the pattern "screenshot_*.png"
  fs.readdirSync(directory).forEach((file) => {
    if (file.startsWith("screenshot_") && file.endsWith(".png")) {
      fs.unlinkSync(path.join(directory, file));
    }
  });

  const browser = await chromium.launch({
    headless, // Set to true if you want headless mode
    args: ["--lang=en-US"], // Force US English locale
    ignoreDefaultArgs: ["--hide-scrollbars"], // Ignore default args
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: segmentWidth, height: segmentHeight });
  await page.setDefaultTimeout(150000); // Default timeout set to 60 seconds

  const localState = {...state, task: task};

  if (web && web.length) {
    localState.web = web;
    localState.stateAction = "goto"
  } else {
    localState.stateAction = "getWeb";
  }

  while (localState.stateAction !== null && localState.currentStep < MAX_STEPS 
    && localState.errors < MAX_ERRORS 
  ) {
    switch (localState.stateAction) {
      case 'getWeb':
        //getWeb(previousTask, previousObservation, currentTask, currentUrl)
        const lastObservation = localState.observations[localState.observations.length - 1] || { 
          task: '',
          observation: '',
        };
        await getWeb(lastObservation.task, lastObservation.observation, localState.task, localState.web, localState.currentImage).then((res) => {
          const content = JSON.parse(res.content);
          const url1 = new URL(content.website_url);
          const baseUrl1 = `${url1.protocol}//${url1.host}`;
          const url2 = new URL(localState.web || "");
          const baseUrl2 = `${url2.protocol}//${url2.host}` || "";
          if (baseUrl1 !== baseUrl2) { 
            localState.web = content.website_url;
            localState.stateAction = "goto";
          } else {
            localState.stateAction = "getNextAction";
          }
        }).catch((e) => {
          localState.errors += 1;
          console.error("web browsing error", e);
        });
        break;
      case "goto":
        localState.currentStep++;
        try {
          await page.goto(localState.web);
          await page.waitForTimeout(firstUrlWait);
          localState.observations = [
            ...localState.observations,
            { task: localState.task, user_action_and_explanation: `Going to ${localState.web}`, observation: `Went to ${localState.web}` },
          ]

          // Take a screenshot as a Base64-encoded string
          await page.screenshot({ path: 'screenshot.png' });
          const gotobase64Image = fs.readFileSync('screenshot.png', 'base64');
          const gotobase64ImageUrl = `data:image/png;base64,${gotobase64Image}`;
          localState.prevImage = localState.currentImage;
          localState.currentImage = gotobase64ImageUrl;
          localState.scrollY = 0;
          localState.stateAction = "getNextAction";
        } catch (e) {
          console.error("goto error", e);
          localState.errors += 1;
          localState.stateAction = "getNextAction";
        }
        break;
      case 'observe':
        try {
        const scrollY = await page.evaluate(() => window.scrollY);
        localState.scrollY = scrollY;
        await page.evaluate(() => {
          // Define selectors for various modals and backdrops
            const modalSelectors = [
              '[role="dialog"]', // ARIA role for accessibility
              '.modal', // Bootstrap or custom modals
              '.overlay', // Generic overlays
              '.popup', // Generic popups
            ];
          
            const backdropSelectors = [
              '.modal-backdrop', // Bootstrap backdrops
              '.overlay-backdrop', // Generic overlay backdrops
              '.popup-backdrop', // Generic popup backdrops
            ];
        
            // Query and close all modals
            const modals = document.querySelectorAll(modalSelectors.join(','));
            modals.forEach((modal) => {
              // Try to find a close button within the modal
              const closeButton = modal.querySelector('[aria-label="Close"], .close, .btn-close, [data-dismiss="modal"]');
              if (closeButton) {
                closeButton.click(); // Simulate a click on the close button
              } else {
                modal.remove(); // Fallback: Remove modal from DOM
              }
            });
          
            // Query and remove all backdrops
            const backdrops = document.querySelectorAll(backdropSelectors.join(','));
            backdrops.forEach((backdrop) => backdrop.remove());
          
            // Reset body scroll locking caused by modals
            document.body.style.overflow = '';
            document.body.classList.remove('modal-open');
          });
        } catch (e) {
          localState.errors += 1;
          console.error("closing popup error", e);
        }
        
        // Take a screenshot as a Base64-encoded string
        await page.screenshot({ path: 'screenshot.png' });
        const base64Image = fs.readFileSync('screenshot.png', 'base64');
        const base64ImageUrl = `data:image/png;base64,${base64Image}`;
        localState.prevImage = localState.currentImage;
        localState.currentImage = base64ImageUrl;
        //getObservation(observations, current_task, current_user_action_and_explanation, prev_screenshot, current_screenshot) 
        await getObservation(localState.observations, localState.task, localState.user_action_and_explanation, localState.prevImage, localState.currentImage).then((res) => {
          const content = JSON.parse(res.content);


          console.log(content.observation);

          localState.observations = [...localState.observations, {
            task: localState.task,
            user_action_and_explanation: localState.user_action_and_explanation,
            observation: content.observation,
          }];
          localState.stateAction = "getUpdatedTask";
        }).catch((e) => {
          localState.errors += 1;
          localState.stateAction = "getUpdatedTask";
          console.error("getObservation error", e);
        });
        break;
      case "getUpdatedTask":
        await getIsTaskComplete(localState.observations, localState.currentImage).then(async (res) => {
          const content = JSON.parse(res.content);

          if (content.task_complete) {
            const secondRes = await getIsTaskComplete(localState.observations, localState.currentImage);
            const secondContent = JSON.parse(secondRes.content);
            if (secondContent.task_complete) {
              localState.stateAction = null;

              const screenshotBuffer = await page.screenshot({ fullPage: true });
              
              // Get dimensions of the screenshot
              const { height, width } = await sharp(screenshotBuffer).metadata();
              // Define the base yOffset and height for cropping
              const baseYOffset = localState.scrollY;
              const cropHeight = segmentHeight;
  
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
            
              await getSummarizedTask(localState.observations, screenshot1base64ImageUrl, screenshot2base64ImageUrl, screenshot3base64ImageUrl).then((response) => {
                const content = JSON.parse(response.content);
                if (verbose) {
                  console.log("getSummarizedTask", content);
                }
                localState.observations = [...localState.observations, {
                  task: localState.task,
                  user_action_and_explanation: "Summarizing last observations",
                  observation: content.task_answer,
                }];
              }).catch((e) => {
                localState.errors += 1;
                console.error("getSummarizedTask error", e);
              });
            }
          } 
        }).catch((e) => {
          localState.stateAction = "getNextAction";
          localState.errors += 1;
          console.error("isTaskCompleteError error", e);
        });

        if (localState.stateAction === null) {
          break;
        }
        // current url
        localState.web = page.url();
        if (taskUpdate) {
          await getUpdateTask(localState.observations, localState.web, localState.currentImage).then((res) => {
            const content = JSON.parse(res.content);

            if (content.update_task) {
              console.log("Updating Task", content.updated_task_goal);
              localState.task = content.updated_task_goal;
              localState.stateAction = "getWeb";
            } else {
              localState.stateAction = "getNextAction";
            }
          }).catch((e) => {
            localState.stateAction = "getNextAction";
            console.error("getUpdateTask error", e);
            localState.errors += 1;
          });
        } else {
          localState.stateAction = "getNextAction";
        }
        break;
      case "getNextAction":
        localState.currentStep++;
        // getNextAction(observations, current_screenshot = placeholderScreenshot)
        await getNextAction(localState.observations, localState.currentImage).then((res) => {
          if (!res) {
            return;
          }
          const content = JSON.parse(res.content);
          if (verbose) {
            console.log("getNextAction", content);
          }
          localState.user_action_and_explanation = content.user_action_and_explanation;
          localState.stateAction = "getDescribeAction";
        }).catch((e) => {
          console.error("getNextAction error", e);
          localState.errors += 1;
        });
        break;
      case "getDescribeAction":
        //getDescribeAction(task, current_action, current_screenshot = placeholderScreenshot)
        await getDescribeAction(localState.task, localState.user_action_and_explanation, localState.currentImage).then(async (res) => {
          const content = JSON.parse(res.content);
          if (verbose) {
            console.log("getDescribeAction", content);
          }
          localState.actionJson = content;

          switch (localState.actionJson?.action) {
            case "go_back":
              localState.stateAction = "goBack";
              break;
            case "scroll_up":
              localState.stateAction = "scrollUp";
              break;
            case "scroll_down":
              localState.stateAction = "scrollDown";
              break;
            case "click":
              localState.stateAction = "click";
              break;
            case "text":
              localState.stateAction = "text";
              break;
            case "custom":
              localState.stateAction = "custom";
              break;
            default:
              localState.stateAction = "scrollDown";
            }
        }).catch((e) => {
          console.error("getDescribeAction error", e);
          localState.stateAction = "getNextAction";
          localState.errors += 1;
        });
        break;
      case "goBack":
        await page.goBack();
        await page.waitForTimeout(newUrlWait);
        localState.stateAction = "observe";
        break;
      case "custom":
        // Unstable, works perfectly fine for things like wait, but situational for more complex actions
        await getCustomAction(localState.task, localState.user_action_and_explanation, localState.currentImage).then(async (res) => {
          const content = JSON.parse(res.content);
          if (verbose) {
            console.log("getCustomAction", content.javascript_code);
          }
          try {
            await page.evaluate(async ({ code }) => {
              // Execute the passed string as JavaScript code
              const executeCode = new Function(code);
              return executeCode();
            }, { code: content.javascript_code });

            await page.waitForTimeout(sameUrlWait);
          } catch (e) {
            console.error("custom action error", e);
            localState.errors += 1;
          }
          localState.stateAction = "observe";
        }).catch((e) => {
          console.error("getCustomAction error", e);
          localState.stateAction = "observe";
          localState.errors += 1;
        });
        break;
      case "scrollUp":
        // cannot be less than 0
        const newScrollY = localState.scrollY - yOffset;
        if (newScrollY < 0) {
          newScrollY = 0;
        }
        await page.evaluate((scrollTo) => {
          window.scrollTo(0, Number(scrollTo));
        }, newScrollY);
        await page.waitForTimeout(sameUrlWait);
        localState.stateAction = "observe";
        break
      case "scrollDown":
        await page.evaluate((scrollTo) => {
          window.scrollTo(0, Number(scrollTo));
        }, localState.scrollY + yOffset);
        
        await page.waitForTimeout(sameUrlWait);
        localState.stateAction = "observe";
        break
      case "click":
      case "text":
        try {
          let elementsSet = null;

          if (localState.actionJson.action === "click" && localState.actionJson.no_inner_text_click) {
            const elements = page.locator('button, a, img, input:not([type="hidden"]):is([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"], [type="image"], [type="file"])');

            // Filter elements without innerText or placeholder
            const elementsWithoutInnerText = await Promise.all(
              (await elements.all()).map(async (element) => {
                const innerText = (await element.innerText()) || ''; // Get innerText
                const trimmedText = innerText.trim(); // Trim whitespace
                const placeholder = (await element.getAttribute('placeholder')) || '';
                const isEnabled = await element.isEnabled();
                const isVisible = await element.isVisible();
                
                // Exclude elements with any non-empty innerText or placeholder
                if (!trimmedText && !placeholder && isEnabled && isVisible) {
                  // Get the bounding box of the element
        
                  const boundingBox = await element.boundingBox();
                  if (boundingBox) {
                    const { y, height } = boundingBox;
                    const bottomY = y + height;
            
                    // Check if any part of the element overlaps the range [scrollY, scrollY + segmentHeight]
                    const isWithinRange = bottomY >= localState.scrollY && y <= localState.scrollY + segmentHeight;
                    return isWithinRange ? element : null;
                  }
                }
                return null;
              })
            );

            // Store the filtered elements
            elementsSet = elementsWithoutInnerText.filter(Boolean);
          } else if (localState.actionJson.action === "click") {

            const stringToMatch = (localState.actionJson.inner_text || "").toLowerCase();

            // Normalize the string to match
            const normalizedStringToMatch = stringToMatch.trim() || 'probablynotneededbutjustincase';
            // Create a locator that includes elements matching both specific tags and navigation-related classes
            const elements = page.locator(`
              button:not([disabled]), 
              a[href], 
              option, 
              select, 
              td, 
              input:is([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"], [type="image"], [type="file"], [type="text"])
            `);
            console.log("Elements.length", (await elements.all()).length);
            // Filter elements based on conditions
            const interactableElements = await Promise.all(
              (await elements.all()).map(async (element) => {
                // Check if the element is an HTMLElement
                const isInteractable =
                  (await element.isEnabled()) &&
                  (await element.isVisible() || !!(await element.getAttribute('href')));
            
                if (!isInteractable) {
                  return null;
                }
                // Check if the element is a checkbox
                const isCheckbox = (await element.getAttribute('type')) === 'checkbox';

                let innerText;
                if (isCheckbox) {
                  // Traverse up the DOM tree to find a parent with innerText
                  let currentElement = element;
                  while (currentElement) {
                    const parent = await currentElement.locator('..');
                    innerText = ((await parent.innerText()) || '').trim().toLowerCase();
                    if (innerText) {
                      break;
                    }
                    currentElement = parent;
                  }
                } else {
                  // Use the element's own innerText otherwise
                  innerText = ((await element.innerText()) || '').trim().toLowerCase();
                }

                const placeholder = ((await element.getAttribute('placeholder')) || '').trim().toLowerCase();
                
                let isMatch =
                  (innerText && (innerText.includes(normalizedStringToMatch) || normalizedStringToMatch.includes(innerText))) ||
                  (placeholder && (placeholder.includes(normalizedStringToMatch) || normalizedStringToMatch.includes(placeholder)));
            
                return isMatch ? element : null;
              })
            );
            
            // Filter out null values and assign to elementsSet
            elementsSet = interactableElements.filter(Boolean);
            if (verbose) {
              console.log("elementsSet1 length", elementsSet.length);
            }

            if (!elementsSet.length) {
              // not regular clickable elements, try div, span, and p
              const elementsDivSpan = page.locator(`
                div, 
                span,
                p
              `);
              
              // Filter elements based on conditions
              const interactableElementsDivSpan = await Promise.all(
                (await elementsDivSpan.all()).map(async (element) => {
                  const isInteractable =
                    (await element.isEnabled()) &&
                    (await element.isVisible() || !!(await element.getAttribute('href')));
              
                  if (!isInteractable) {
                    return null;
                  }

                  //Check if the element has children
                  const hasNoChildren = await element.evaluate((node) => node.childElementCount === 0);
                  if (!hasNoChildren) {
                    return null; // Skip elements with children
                  }
                  // Check element's innerText and placeholder
                  const innerText = ((await element.innerText()) || '').trim().toLowerCase();
                  const placeholder = ((await element.getAttribute('placeholder')) || '').trim().toLowerCase();
              
                  let isMatch =
                    (innerText && (innerText.includes(normalizedStringToMatch) || normalizedStringToMatch.includes(innerText))) ||
                    (placeholder && (placeholder.includes(normalizedStringToMatch) || normalizedStringToMatch.includes(placeholder)));
              

                  return isMatch ? element : null;
                })
              );
            
              elementsSet = interactableElementsDivSpan.filter(Boolean);

              if (verbose) {
                console.log("elementsSetDivSpan length", elementsSet.length);
              }
            }

            // sometimes it interprets text images as inner text, this is to catch those cases
            if (!elementsSet.length) {
              const elements2 = page.locator('button, a, img, input:not([type="hidden"]):is([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"], [type="image"], [type="file"])');

              // Filter elements without innerText or placeholder
              const elementsWithoutInnerText = await Promise.all(
                (await elements2.all()).map(async (element) => {
                  const innerText = (await element.innerText()) || ''; // Get innerText
                  const trimmedText = innerText.trim(); // Trim whitespace
                  const placeholder = (await element.getAttribute('placeholder')) || '';
                  const isEnabled = await element.isEnabled();
                  const isVisible = await element.isVisible();
              
                  // Exclude elements with any non-empty innerText or placeholder
                  if (!trimmedText && !placeholder && isEnabled && isVisible) {
                    // Get the bounding box of the element
                    const boundingBox = await element.boundingBox();
                    if (boundingBox) {
                      const { y, height } = boundingBox;
                      const bottomY = y + height;
              
                      // Check if any part of the element overlaps the range [scrollY, scrollY + segmentHeight]
                      const isWithinRange = bottomY >= localState.scrollY && y <= localState.scrollY + segmentHeight;
                      return isWithinRange ? element : null;
                    }
                    return element;
                  }
                  return null;
                })
              );
  
              // Store the filtered elements
              elementsSet = elementsWithoutInnerText.filter(Boolean);
            }
          } else if (localState.actionJson.action === "text") {
            // Locate all valid inputs and textareas
            const validInputs = page.locator(
              'input:not([type="hidden"]):not([type="checkbox"]):not([type="range"]):not([type="submit"]), textarea'
            );

            // Filter only visible elements
            const visibleEnabledElements = await validInputs.filter(async (element) => {
              return await element.isVisible() && await element.isEnabled();
            }).all();

            // Use the filtered elements directly
            elementsSet = visibleEnabledElements; // Locators of visible elements
          }
          if (verbose) {
            console.log("elementsSet length", elementsSet.length);
          }

          let specificElement = null; 

          if (elementsSet.length === 1) {
            specificElement = elementsSet[0];
          } else if (elementsSet.length > 1) {
            const elementDetails = [];

            for (const [index, element] of elementsSet.entries()) {
              // Stop the loop if elementDetails reaches 100
              if (elementDetails.length >= 100) {
                if (verbose) {
                  console.log("Reached maximum allowed elements (199). Stopping loop.");
                }
                break;
              }
            
              // Combine operations into a single evaluate call for efficiency
              const elementData = await element.evaluate((el, id) => {
                // Add a unique attribute
                el.setAttribute('element_id', id);

                // Extract the tag name and attributes
                const tagName = el.tagName.toLowerCase();
                const attributes = Array.from(el.attributes)
                  .map(attr => `${attr.name}="${attr.value}"`)
                  .join(' ');

                // Construct the first-layer outerHTML
                const outerHTML = `<${tagName} ${attributes}></${tagName}>`;

                // Extract innerText
                const innerText = el.innerText || ''; // Handle missing innerText

                return {
                  element_id: id, // Unique identifier
                  outerHTML: outerHTML, // First-layer outerHTML
                  innerText: innerText, // Text content
                };
              }, index + 1);

              elementDetails.push(elementData);
            }
            console.log("elementDetails", elementDetails)
            await getElement(localState.task, localState.user_action_and_explanation, elementDetails, localState.currentImage).then(async (res) => {
              const content = JSON.parse(res.content);
              if (verbose) {
                console.log("getElement", content);
              }
              if (Number(content.element_id) > 0 && Number(content.element_id) <= elementDetails.length) {
                specificElement = page.locator(`[element_id="${content.element_id}"]`);
              }
            }).catch((e) => {
              console.error("getElement error", e);
              localState.errors += 1;
            });
          }
          if (specificElement) {
            const tagName = (await specificElement.evaluate(el => el.tagName) || '').toLowerCase();

            if (tagName === 'option' || tagName === 'select') {
              let selectElement1; 
              // Find the parent <select> element as a locator
              if (tagName === 'option') {
                selectElement1 = specificElement.locator('xpath=ancestor::select');
              } else {
                selectElement1 = specificElement;
              }            
              // Retrieve all <option> elements within the parent <select>
              const optionsOuterHTML = await selectElement.evaluate((select) =>
                Array.from(select.options).map(option => option.outerHTML)
              );
            
              await getOptions(localState.user_action_and_explanation, optionsOuterHTML).then(async (res) => {
                try {
                  const content = JSON.parse(res.content);
                  if (verbose) {
                    console.log("getOptions", content);
                  }
                  const newOptionValue = content.final_option_value;
                  if (!newOptionValue) {
                    throw new Error("Invalid option value returned by getOptions.");
                  }
                  // Change the value of the <select> element and dispatch a change event
                  await selectElement1.evaluate((selectElement, value) => {
                    selectElement.value = value; // Set the new value
                    const event = new Event('change', { bubbles: true }); // Create a 'change' event
                    selectElement.dispatchEvent(event); // Dispatch the event
                  }, newOptionValue);
                } catch (error) {
                  console.error("Error processing getOptions result:", error);
                  localState.errors += 1;
                }
              }).catch((e) => {
                console.error("getOptions error", e);
                localState.errors += 1;
              });
            } else {
              if (localState.actionJson.action === "click") {
                try {
                  // Check for href since hrefs aren't always clickable
                  const href = await specificElement.getAttribute('href');
                
                  if (href) {
                    const absoluteHref = new URL(href, page.url()).href; // Resolves relative URLs based on the current page URL
                    await page.goto(absoluteHref);
                  } else {
                    // Ensure the element is visible and enabled before clicking
                    if (await specificElement.isVisible() && await specificElement.isEnabled()) {
                      await specificElement.click();
                    } else {
                      throw new Error('Element is not interactable');
                    }
                  }
                } catch (e) {
                  console.error("Error interacting with the element:", e);
                  localState.errors += 1;
                }
              } else {
                try {
                  const inputValue = localState.actionJson.input_value || '';
                
                  // Ensure the input is interactable
                  if (await specificElement.isVisible() && await specificElement.isEnabled()) {
                    await specificElement.focus(); // Explicitly focus on the input element
                    await specificElement.fill(inputValue); // Clears and types the value
                    await page.keyboard.press("Enter"); // Simulate pressing Enter
                  } 
                } catch (e) {
                  console.error("Error interacting with the input element:", e);
                  localState.errors += 1;
                }
              }
            }
          }
          await page.waitForTimeout(newUrlWait);
          // remove element_id attribute

          for (const element of elementsSet) {
            await element.evaluate((el) => {
                el.removeAttribute('element_id');
            });
          }
        } catch (e) {
          console.log("error during clicking or text", e)
          localState.errors += 1;
        }
        localState.stateAction = "observe";
        break;
      default:
        localState.stateAction = null;
        console.log("Invalid day");
    }
  }
  
  await browser.close();
  return {
    observations: localState.observations,
  }
}



// Example call to the function
const data = [];

fs.createReadStream('./webvoyager/coursera.csv')
.pipe(csv())
.on('data', (row) => {
  data.push(row);
})
.on('end', async () => {
  for (const row of data) {
    if (!row.ques) {
      continue;
    }
    try {
      let resObs = [];
      try {
        console.log("Row", row)
        const { observations } = await browse({ task: row.ques, web: row.web, verbose: true, headless: true, taskUpdate: false });
        resObs = observations;
      } catch (e) {
        console.error(`Error browsing ${row.id}`, e);
      }
      const filePath = `./webvoyager/coursera/${row.id}.csv`;
      const stream = fs.createWriteStream(filePath);
  
      writeToStream(stream, resObs, { headers: true })
        .on('finish', () => {
          console.log(`CSV file written successfully! ${row.id}`);
        })
        .on('error', (error) => {
          console.error(`Error writing to CSV file: ${row.id}`, error);
        });
    } catch (e) {
      console.error(`Error browsing ${row.id}`, e);
    }
  }
})
.on('error', (err) => {
  console.error('Error reading the CSV file:', err);
});

/*
Go on Wikipedia and search for Mozart, find his last composition, play this song on youtube.
Go on google and find two high school math problems, solve these with WolframAlpha.
*/

/*
async function navigate() {
  await browse({ task: "Go on Wikipedia and search for Mozart, find his last composition, play this song on youtube.", web: "", verbose: false, headless: false, taskUpdate: true });
}
navigate();
*/