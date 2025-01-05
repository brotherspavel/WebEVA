const { getInput, getDateTask, getNextAction, getWeb, getParseAction, getObservation, getUpdateTask, getIsTaskComplete, getElement, getSummarizedTask, getCustomAction, getOptions, getUpdatedURL } = require('./api');
const { chromium } = require('playwright');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const { writeToStream } = require('fast-csv');
const sharp = require('sharp');
const { text } = require('stream/consumers');
const segmentWidth = 900;
const segmentHeight = 1600;
const yOffset = 1000;

// Adjust these when needed. Depends on vpn and network speed.
const firstUrlWait = 6000; // when browsed
const newUrlWait = 5000;  // when button click
const sameUrlWait = 500; // scroll

// breaks if at these limits
const MAX_STEP_OBSERVATIONS = 30;
const MAX_ERRORS = 5;

// if observations no change, change parameters after these many observatins
const ENABLE_PARAM_LENGTH = 20;

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
  taskUpdate: true,

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
    this.taskUpdate = true;
  },
};

async function browse({ task, web = "", verbose = false, headless = false }) {
  const text_elements = [];
  const no_text_elements = [];
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
    channel: "chrome"
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: segmentWidth, height: segmentHeight });
  await page.setDefaultTimeout(90000); // Default timeout set to 90 seconds

  const localState = { ...state, task: task };

  // If web, we turn off task update. Otherwise, it may browse other urls which isnt allowed for webvoyager
  if (web && web.length) {
    localState.web = web;
    localState.taskUpdate = false;
    localState.stateAction = "goto"
  } else {
    localState.taskUpdate = true;
    localState.stateAction = "getWeb";
  }

  await getDateTask(localState.task).then((res) => {
    localState.task = res;
    console.log("currenTask", res)
  }).catch((e) => {
    console.error("getDateTask error", e);
    localState.errors += 1;
  });

  while (localState.stateAction !== null && Number(localState.observations?.length) < MAX_STEP_OBSERVATIONS) {
    if (localState.errors >= MAX_ERRORS) {
      localState.stateAction = "changeParams";
      localState.errors = 0;
    }
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
          // Take a screenshot as a Base64-encoded string
          const bufferImage = await page.screenshot(); // Screenshot returns a Buffer by default
          const base64Image = bufferImage.toString('base64'); // Convert the Buffer to Base64
          const base64ImageUrl = `data:image/png;base64,${base64Image}`;


          // Update the local state
          localState.prevImage = localState.currentImage;
          localState.currentImage = base64ImageUrl;

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

          // Close popups, these sometimes appear when scrapping the same site multiple times.
          await page.evaluate(() => {
            // Define selectors for various modals and backdrops
            const modalSelectors = [
              '[role="dialog"]', // ARIA role for accessibility
              '.modal', // Bootstrap or custom modals
              '.overlay', // Generic overlays
              '.popup', // Generic popups
              '[role="presentation"]', // ARIA role for presentation
            ];

            const backdropSelectors = [
              '.modal-backdrop', // Bootstrap backdrops
              '.overlay-backdrop', // Generic overlay backdrops
              '.popup-backdrop', // Generic popup backdrops
            ];

            // Query and close all modals
            const modals = document.querySelectorAll(modalSelectors.join(','));
            modals.forEach((modal) => {
              const closeButtons = modal.querySelectorAll('[aria-label*="close"], [aria-label*="dismiss"], .close, .btn-close, [data-dismiss="modal"]');

              closeButtons.forEach((closeButton) => {
                try {
                  closeButton.click(); // Simulate a click on each close button
                } catch (error) {
                  console.error('Failed to click close button:', error);
                }
              });

              // Check if modal is dialog or presentation
              const isDialogOrPresentation = modal.getAttribute('role') === 'dialog' || modal.getAttribute('role') === 'presentation' || modal.hasAttribute('aria-hidden');
              if (!isDialogOrPresentation) {
                modal.remove(); // Remove the modal if it's not a dialog
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
        await page.waitForTimeout(newUrlWait)
        // Take a screenshot as a Base64-encoded string
        const bufferImage = await page.screenshot(); // Screenshot returns a Buffer by default
        const base64Image = bufferImage.toString('base64'); // Convert the Buffer to Base64
        const base64ImageUrl = `data:image/png;base64,${base64Image}`;


        // Update the local state
        localState.prevImage = localState.currentImage;
        localState.currentImage = base64ImageUrl;

        //getObservation(observations, current_task, current_user_action_and_explanation, prev_screenshot, current_screenshot) 
        await getObservation(localState.observations, localState.task, localState.user_action_and_explanation, localState.prevImage, localState.currentImage).then((res) => {
          const content = JSON.parse(res.content);

          // change to get Url if user is stuck and need to have different parameters.
          console.log(content);

          localState.observations = [...localState.observations, {
            task: localState.task,
            user_action_and_explanation: localState.user_action_and_explanation,
            observation: content.observation,
          }];
          //scroll down isn't stuck and don't try to change parameters too early
          if (content.action_fail_or_stuck && localState.user_action_and_explanation !== "scrollDown" && localState.observations.length > ENABLE_PARAM_LENGTH) {
            localState.stateAction = "changeParams";
          } else {
            localState.stateAction = "getUpdatedTask";
          }
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
                localState.screenshot1base64ImageUrl = screenshot1base64ImageUrl;
                localState.screenshot2base64ImageUrl = screenshot2base64ImageUrl;
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
        if (localState.taskUpdate) {
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
            throw new Error("No response from getNextAction");
          }
          const content = JSON.parse(res.content);
          console.log("Next Action", content.user_action_and_explanation);

          localState.user_action_and_explanation = content.user_action_and_explanation;
          localState.stateAction = "getParseAction";
        }).catch((e) => {
          console.error("getNextAction error", e);
          localState.errors += 1;
        });
        break;
      case "getParseAction":
        //getParseAction(task, current_action, current_screenshot = placeholderScreenshot)
        await getParseAction(localState.task, localState.user_action_and_explanation, localState.currentImage).then(async (res) => {
          const content = JSON.parse(res.content);
          if (verbose) {
            console.log("getParseAction", content);
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
          console.error("getParseAction error", e);
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
            let elements = [];
            try {
              elements = page.locator('button, a, img[role="button"], input');
            } catch {
              elements = []
            }

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

            if (elementsSet.length) {
              const original_length = await elements.count();
              no_text_elements.push({
                original_length,
                filtered_length: elementsSet.length
              })
            }
          } else if (localState.actionJson.action === "click") {

            const stringToMatch = (localState.actionJson.inner_text || "").toLowerCase();

            // Normalize the string to match
            const normalizedStringToMatch = stringToMatch.trim() || 'probablynotneededbutjustincase';
            // Create a locator that includes elements matching both specific tags and navigation-related classes
            let elements = []
            try {
              elements = page.locator(`
                button, 
                a, 
                option, 
                select, 
                td, 
                li,
                input
              `);
            } catch {
              elements = []
            }

            // Filter elements based on conditions
            const interactableElements = await Promise.all(
              (await elements.all()).map(async (element) => {
                // Check if the element is an HTMLElement
                const isInput = await element.evaluate(el => el.tagName.toLowerCase() === 'input');

                const isInteractable =
                  (await element.isEnabled()) &&
                  (await element.isVisible() || !!(await element.getAttribute('href')) || isInput);

                if (!isInteractable) {
                  return null;
                }
                // Check if the element is a checkbox
                const isCheckbox = (await element.getAttribute('type')) === 'checkbox' || (await element.getAttribute('type')) === 'radio'

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
                const value = ((await element.getAttribute('value')) || '').trim().toLowerCase();

                let isMatch =
                  (innerText && (innerText.includes(normalizedStringToMatch) || normalizedStringToMatch.includes(innerText))) ||
                  (placeholder && (placeholder.includes(normalizedStringToMatch) || normalizedStringToMatch.includes(placeholder))) ||
                  (value && (value.includes(normalizedStringToMatch) || normalizedStringToMatch.includes(value)));

                return isMatch ? element : null;
              })
            );

            // Filter out null values and assign to elementsSet
            elementsSet = interactableElements.filter(Boolean);
            if (verbose) {
              console.log("elementsSet1 length", elementsSet.length);
            }

            if (elementsSet.length) {
              const original_length = await elements.count();
              text_elements.push({
                original_length,
                filtered_length: elementsSet.length
              })
            }

            if (!elementsSet.length) {
              // not regular clickable elements, try div, span, and p
              let elementsDivSpan = []
              try {
                elementsDivSpan = page.locator(`
                  div, 
                  span,
                  p
                `);
              } catch {
                elementsDivSpan = [];
              }

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

              if (elementsSet.length) {
                const original_length = await elementsDivSpan.count();
                text_elements.push({
                  original_length,
                  filtered_length: elementsSet.length
                })
              }

              if (verbose) {
                console.log("elementsSetDivSpan length", elementsSet.length);
              }
            }

            /*
            // sometimes it interprets text images as inner text, this is to catch those cases
            if (!elementsSet.length) {
              const elements2 = page.locator('button, a, img[role="button"], input)');

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
              */
          } else if (localState.actionJson.action === "text") {
            // Locate all valid inputs and textareas
            let validInputs = [];
            try {
              validInputs = page.locator(
                'input[type="text"], input:not([type]), textarea'
              );
            } catch {
              validInputs = [];
            }

            const stringToMatch = (localState.actionJson.inner_text || "").toLowerCase();

            // Normalize the string to match
            const normalizedStringToMatch = stringToMatch.trim() || 'probablynotneededbutjustincase';

            // Filter elements based on conditions
            const validInputsMatch = await Promise.all(
              (await validInputs.all()).map(async (element) => {
                // Check if the element is an HTMLElement
                const isInteractable = await element.isEnabled()

                if (!isInteractable) {
                  return null;
                }

                let innerText = ((await element.innerText()) || '').trim().toLowerCase();

                const placeholder = ((await element.getAttribute('placeholder')) || '').trim().toLowerCase();

                let isMatch =
                  (innerText && (innerText.includes(normalizedStringToMatch) || normalizedStringToMatch.includes(innerText))) ||
                  (placeholder && (placeholder.includes(normalizedStringToMatch) || normalizedStringToMatch.includes(placeholder)));

                return isMatch ? element : null;
              })
            );

            // Filter out null values and assign to elementsSet
            elementsSet = validInputsMatch.filter(Boolean);

            // if no match, we use all visible inputs
            if (!elementsSet.length) {
              // Filter only visible elements
              const visibleEnabledElements = await validInputs.filter(async (element) => {
                return await element.isEnabled();
              }).all();

              elementsSet = visibleEnabledElements; // Locators of visible elements
            }

            // for determining elements length
            if (elementsSet.length) {
              const original_length = await validInputs.count();
              text_elements.push({
                original_length,
                filtered_length: elementsSet.length
              })
            }
          }

          let specificElement = null;

          if (elementsSet.length === 1) {
            specificElement = elementsSet[0];
          } else if (elementsSet.length > 1) {
            const elementDetails = [];

            for (const [index, element] of elementsSet.entries()) {
              // Stop the loop if elementDetails reaches 100, 
              if (elementDetails.length >= 100) {
                if (verbose) {
                  console.log("Reached maximum allowed elements (100). Stopping loop.");
                }
                break;
              }

              // Combine operations into a single evaluate call for efficiency
              const elementData = await element.evaluate((el, id) => {
                // Add a unique attribute
                el.setAttribute('element_id', id);

                // Add an aria-label attribute if not already present
                if (!el.hasAttribute('aria-label')) {
                  // Derive aria-label from children's aria-label attributes
                  let textForAriaLabel = Array.from(el.children)
                    .map(child => child.getAttribute('aria-label')) // Get aria-label from children
                    .filter(label => label && label.trim().length > 0) // Filter out null or empty labels
                    .join(' ')
                    .trim();

                  // Set the aria-label if derived content is available
                  if (textForAriaLabel) {
                    el.setAttribute('aria-label', textForAriaLabel);
                  }
                }

                // Extract the tag name and attributes
                const tagName = el.tagName.toLowerCase();
                const maxLength = 100; // Define a threshold for long attributes
                const attributes = Array.from(el.attributes)
                  .filter(attr => !['src', 'style'].includes(attr.name)) // Exclude 'src' and 'style'
                  .map(attr => {
                    const value = attr.value.length > maxLength ? attr.value.slice(0, maxLength) + '...' : attr.value;
                    return `${attr.name}="${value}"`;
                  })
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
            if (verbose) {
              console.log("elementDetails", elementDetails);
            }
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
          if (!specificElement) {
            localState.stateAction = "changeParams";
            break;
          }
          if (specificElement) {
            let tagNameChild = (await specificElement.evaluate(el => el.tagName) || '').toLowerCase();
            let classNameChild = (await specificElement.evaluate(el => el.className) || '').toLowerCase();
            while (tagNameChild === 'span' && !classNameChild.includes('link')) {
              specificElement = specificElement.locator('..'); // Move to the parent
              tagNameChild = (await specificElement.evaluate(node => node.tagName) || '').toLowerCase(); // Update the existing variable
            }
            // Shouldn't be a click action
            if (localState.actionJson.action === "click" && await specificElement.getAttribute('type') === 'text') {
              await getInput(localState.task, localState.user_action_and_explanation, localState.currentImage).then(async (res) => {
                if (!res?.content) {
                  throw new Error("No response from getInput");
                }
                const content = JSON.parse(res.content);

                localState.actionJson.action = "text";
                localState.actionJson.input_value = content.input_value;
                if (verbose) {
                  console.log("getInput", content);
                }
              }).catch((e) => {
                console.error("getInput error", e);
                localState.errors += 1;
              });
            }
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
                    await specificElement.click();
                  }
                } catch (e) {
                  console.error("Error interacting with the click element:", e);
                  localState.stateAction = "changeParams";
                  localState.errors += 1;
                  break;
                }
              } else {
                try {
                  const inputValue = localState.actionJson.input_value || '';

                  // Ensure the input is interactable
                  if (await specificElement.isEnabled()) {
                    await specificElement.focus(); // Explicitly focus on the input element
                    await page.waitForTimeout(200); // Wait for 100ms
                    await specificElement.fill(''); // Clear the input field by setting it to an empty string
                    await page.waitForTimeout(100); // Wait for 100ms
                    await specificElement.pressSequentially(inputValue, { delay: 100 });

                    const isASearch = await specificElement.evaluate((element) => {
                      const attributesToCheck = ['placeholder', 'aria-label', 'id'];
                      const includesSearch = attributesToCheck.some(attr =>
                        element.getAttribute(attr)?.toLowerCase().includes('search')
                      );
                      const hasEnterKeyHint = element.hasAttribute('enterkeyhint');
                      return includesSearch || hasEnterKeyHint;
                    });

                    if (isASearch) {
                      await page.keyboard.press("Enter"); // Simulate pressing Enter
                    } else {
                      const isCombobox = await specificElement.evaluate((element) => {
                        return element.getAttribute('role') === 'combobox';
                      });

                      if (isCombobox) {
                        await page.waitForTimeout(1000);
                        await page.keyboard.press('ArrowDown');
                        await page.waitForTimeout(100);
                        await page.keyboard.press("Enter"); // Simulate pressing Enter
                      }
                    }
                  }
                } catch (e) {
                  console.error("Error interacting with the input element:", e);
                  localState.stateAction = "changeParams";
                  localState.errors += 1;
                  break;
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
          //localState.stateAction = "changeParams";
          localState.errors += 1;
        }
        localState.stateAction = "observe";
        break;
      case 'changeParams':
        const currentUrl = page.url();

        await getUpdatedURL(localState.task, currentUrl, localState.user_action_and_explanation).then(async (res) => {
          if (!res?.content) {
            throw new Error("No response from getUpdatedUrl");
          }
          const newUrl = JSON.parse(res.content).new_url;
          const reasoning = JSON.parse(res.content).reasoning;
          const url1 = new URL(newUrl);
          const baseUrl1 = `${url1.protocol}//${url1.host}`;
          const url2 = new URL(currentUrl);
          const baseUrl2 = `${url2.protocol}//${url2.host}` || "";
          if (baseUrl1 === baseUrl2 && url1 !== url2) {
            localState.web = newUrl;
            try {
              await page.goto(localState.web);
              await page.waitForTimeout(firstUrlWait);
              localState.observations = [
                ...localState.observations,
                { task: localState.task, user_action_and_explanation: `Changing URL parameters. ${reasoning}`, observation: `Went to ${localState.web}` },
              ]

              if (verbose) {
                console.log("reasoning for new url", reasoning);
              }
              // Take a screenshot as a Base64-encoded string
              const bufferImage = await page.screenshot(); // Screenshot returns a Buffer by default
              const base64Image = bufferImage.toString('base64'); // Convert the Buffer to Base64
              const base64ImageUrl = `data:image/png;base64,${base64Image}`;

              // Update the local state
              localState.prevImage = localState.currentImage;
              localState.currentImage = base64ImageUrl;
              localState.scrollY = 0;
              localState.stateAction = "getUpdatedTask";
            } catch (e) {
              console.error("updated url error error", e);
              localState.errors += 1;
              localState.stateAction = "getNextAction";
            }
          } else {
            localState.stateAction = "getNextAction";
          }
        }).catch((e) => {
          localState.errors += 1;
          localState.stateAction = "getNextAction";

          console.error("web browsing error", e);
        });
        break;
      default:
        localState.stateAction = null;
        console.log("Invalid day");
    }
  }
  //                localState.screenshot1base64ImageUrl = screenshot1base64ImageUrl;
  //localState.screenshot2base64ImageUrl = screenshot2base64ImageUrl;
  await browser.close();
  return {
    observations: localState.observations,
    screenshot1base64ImageUrl: localState.screenshot1base64ImageUrl,
    screenshot2base64ImageUrl: localState.screenshot2base64ImageUrl,
    no_text_elements,
    text_elements,
  }
}

// Example call to the function
const data = [];

fs.createReadStream('./webvoyager/apple.csv')
  .pipe(csv())
  .on('data', (row) => {
    data.push(row);
  })
  .on('end', async () => {
    let no_text_elements_arr = [];
    let text_elements_arr = [];
    for (const row of data) {
      if (!row.ques) {
        continue;
      }
      try {
        let resObs = [];
        const path = './webvoyager/apple';

        try {
          const { observations, no_text_elements, text_elements, screenshot1base64ImageUrl, screenshot2base64ImageUrl } = await browse({ task: row.ques, web: row.web, verbose: false, headless: true });

          no_text_elements_arr = [...no_text_elements];
          text_elements_arr = [...text_elements];

          if (screenshot1base64ImageUrl) {
            const screenshot1Buffer = Buffer.from(screenshot1base64ImageUrl.split(',')[1], 'base64');
            fs.writeFileSync(`${path}/${row.id}_screen1.png`, screenshot1Buffer);
          }

          if (screenshot2base64ImageUrl) {
            const screenshot2Buffer = Buffer.from(screenshot2base64ImageUrl.split(',')[1], 'base64');
            fs.writeFileSync(`${path}/${row.id}_screen2.png`, screenshot2Buffer);
          }

          resObs = observations;
        } catch (e) {
          console.error(`Error browsing ${row.id}`, e);
        }
        const filePaths = {
          main: `${path}/${row.id}.csv`,
          noText: `${path}/${row.id}_no_text_elements.csv`,
          text: `${path}/${row.id}_text_elements.csv`
        };

        const streams = {
          main: fs.createWriteStream(filePaths.main),
          noText: fs.createWriteStream(filePaths.noText),
          text: fs.createWriteStream(filePaths.text)
        };

        const writeDataToStream = (stream, data, description) => {
          writeToStream(stream, data, { headers: true })
            .on('finish', () => {
              console.log(`CSV file written successfully for ${description}: ${row.id}`);
            })
            .on('error', (error) => {
              console.error(`Error writing to CSV file for ${description}: ${row.id}`, error);
            });
        };

        // Write data to each stream
        writeDataToStream(streams.main, resObs, 'main data');
        writeDataToStream(streams.noText, no_text_elements_arr, 'no text elements');
        writeDataToStream(streams.text, text_elements_arr, 'text elements');
      } catch (e) {
        console.error(`Error browsing ${row.id}`, e);
      }
    }
  })
  .on('error', (err) => {
    console.error('Error reading the CSV file:', err);
  });


/*
const task = "Go on wikipedia and find American food, note the first mentioning of a dish, search for a recipe on allrecipes related to that food"
async function navigate() {
  await browse({ task, web: "", verbose: true, headless: false });
}
navigate();
*/