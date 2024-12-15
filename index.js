const { getNextAction, getWeb, getDescribeAction, getObservation, getUpdateTask, getIsTaskComplete, getElement, getSummarizedTask } = require('./api');
const { isClickable } = require('./utils');
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

const state = {
  stateAction: null,
  web: "https://www.example123.com/",
  task: null,
  user_action: null,
  actionJson: {},
  observations: [],
  currentImage: null,
  currentBoxedImage: null,
  prevImage: null,
  task_answer: "",
  currentStep: 0,
  numTries: 0,
  scrollIndex: 0,

  // Method to reset the state
  reset(prompt) {
    this.browsing = true;
    this.currentStep = 0;
    this.numTries = this.numTries + 1;
    this.newUrl = null;
    this.currentTask = prompt;
    this.messages = [...initialMessages]; // Reset to initial messages
    this.retrieveMessages = [...initialRetrieveMessages]; // Reset to initial retrieve messages
    this.nextActionText = "";
    this.scrollIndex = 0;
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

  const localState = {...state, task: task};

  if (web && web.length) {
    localState.web = web;
    localState.stateAction = "goto"
  } else {
    localState.stateAction = "getWeb";
  }

  while (localState.stateAction !== null && localState.currentStep < MAX_STEPS) {
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
          localState.currentStep++;
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
            { task: localState.task, user_action: `Going to ${localState.web}`, observation: `Went to ${localState.web}` },
          ]

          // Take a screenshot as a Base64-encoded string
          await page.screenshot({ path: 'screenshot.png' });
          const gotobase64Image = fs.readFileSync('screenshot.png', 'base64');
          const gotobase64ImageUrl = `data:image/png;base64,${gotobase64Image}`;
          localState.prevImage = localState.currentImage;
          localState.currentImage = gotobase64ImageUrl;
          localState.stateAction = "getNextAction";
        } catch (e) {
          console.error("goto error", e);
          localState.stateAction = "getNextAction";
        }
        break;
      case 'observe':
        // Take a screenshot as a Base64-encoded string
        await page.screenshot({ path: 'screenshot.png' });
        const base64Image = fs.readFileSync('screenshot.png', 'base64');
        const base64ImageUrl = `data:image/png;base64,${base64Image}`;
        localState.prevImage = localState.currentImage;
        localState.currentImage = base64ImageUrl;
        //getObservation(observations, current_task, current_user_action, prev_screenshot, current_screenshot) 
        await getObservation(localState.observations, localState.task, localState.user_action, localState.prevImage, localState.currentImage).then((res) => {
          const content = JSON.parse(res.content);

          if (verbose) {
            console.log("getObservation", content);
          }
          localState.observations = [...localState.observations, {
            task: localState.task,
            user_action: localState.user_action,
            observation: content.observation,
          }];
          localState.stateAction = "getUpdatedTask";
        }).catch((e) => {
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
              const baseYOffset = localState.scrollIndex * yOffset;
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
                  user_action: "Summarizing last observations",
                  observation: content.task_answer,
                }];
              }).catch((e) => {
                console.error("getSummarizedTask error", e);
              });
            }
          } 
        }).catch((e) => {
          localState.stateAction = "getNextAction";
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
            if  (verbose) {
              console.log("getUpdateTask", content);
            }
            if (content.update_task) {
              localState.task = content.updated_task_goal;
              localState.stateAction = "getWeb";
            } else {
              localState.stateAction = "getNextAction";
            }
          }).catch((e) => {
            localState.stateAction = "getNextAction";
            console.error("getUpdateTask error", e);
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
          localState.user_action = content.user_action;
          localState.stateAction = "getDescribeAction";
        }).catch((e) => {
          console.error("getNextAction error", e);
        });
        break;
      case "getDescribeAction":
        //getDescribeAction(task, current_action, current_screenshot = placeholderScreenshot)
        await getDescribeAction(localState.task, localState.user_action, localState.currentImage).then(async (res) => {
          const content = JSON.parse(res.content);
          if (verbose) {
            console.log("getDescribeAction", content);
          }
          localState.actionJson = content;
          localState.stateAction = "scrollDown";

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
            default:
              localState.stateAction = "scrollDown";
            }
          
        }).catch((e) => {
          console.error("getDescribeAction error", e);
          localState.stateAction = "getNextAction";
        });
        break;
      case "goBack":
        await page.goBack();
        await page.waitForTimeout(newUrlWait);
        localState.stateAction = "observe";
        break;
      case "scrollUp":
        // cannot be less than 0
        localState.scrollIndex = localState.scrollIndex - 1 < 0 ? 0 : localState.scrollIndex - 1;
        await page.evaluate((scrollTo) => {
          window.scrollTo(0, Number(scrollTo));
        }, localState.scrollIndex * yOffset);
        await page.waitForTimeout(sameUrlWait);
        localState.stateAction = "observe";
        break
      case "scrollDown":
        localState.scrollIndex = localState.scrollIndex + 1;
        if (verbose) {
          console.log("scrollingTo", localState.scrollIndex * yOffset);
        }
        await page.evaluate((scrollTo) => {
          window.scrollTo(0, Number(scrollTo));
        }, localState.scrollIndex * yOffset);
        
        await page.waitForTimeout(sameUrlWait);
        localState.stateAction = "observe";
        break
      case "click":
      case "text":
        try {
          let elementsSet = null;

          if (localState.actionJson.action === "click" && localState.actionJson.is_clickable_without_visible_text) {
            const buttons = await page.locator('button').elementHandles();
            const links = await page.locator('a').elementHandles();
            // Get all visible inputs (excluding hidden) and ensure they are clickable
            const visibleInputs = await page.locator(
              'input:not([type="hidden"])'
            ).elementHandles();

            // Filter only clickable inputs
            const clickableInputs = visibleInputs.filter(async (input) => {
              const type = await input.evaluate((el) => el.getAttribute('type') || '');
              // Check if the type is a known clickable type
              return ['button', 'submit', 'reset', 'checkbox', 'radio', 'image', 'file'].includes(type.toLowerCase());
            });
            // Combine buttons and links
            const elements = [...buttons, ...links, ...clickableInputs];

            // Filter elements without innerText
            const elementsWithoutInnerText = [];
            for (const element of elements) {
                const innerText = await element.evaluate(el => el.innerText.trim());
                const placeHolder = await element.evaluate(el => el.getAttribute('placeholder'));
                if (!innerText && !placeHolder) { // If innerText is empty or consists of only whitespace
                    elementsWithoutInnerText.push(element);
                }
            }

            elementsSet = elementsWithoutInnerText;
          } else if (localState.actionJson.action === "click") {
            // Get all elements on the page
            const allElements = await page.locator('*').elementHandles();

            // Filter to find clickable elements
            const clickableElements = [];
            for (const element of allElements) {
              if (await isClickable(element)) {
                clickableElements.push(element);
              }
            }

            elementsSet = clickableElements;
            // Retrieve elements matching innerText and placeholder
            const elementsInnerText = await page
            .locator(`text=${localState.actionJson.inner_text}`)
            .elementHandles();

            const elementsPlaceholder = await page
            .locator(`[placeholder="${localState.actionJson.inner_text}"]`)
            .elementHandles();

            // Combine elements matching innerText and placeholder
            const matchingElements = [...elementsInnerText, ...elementsPlaceholder];
            
            if (matchingElements.length > 0) {
              elementsSet = matchingElements;
            }

            const filteredElements = [];
            for (const clickableElement of clickableElements) {
              for (const matchingElement of matchingElements) {
                const isSameElement = await clickableElement.evaluate(
                  (el1, el2) => el1 === el2,
                  matchingElement
                );
                if (isSameElement) {
                  filteredElements.push(clickableElement);
                  break; // If a match is found, move to the next clickableElement
                }
              }
            }
 
            if (filteredElements.length > 0) {
              elementsSet = filteredElements;
            }
          } else if (localState.actionJson.action === "text") {
            // Select all input elements that are not of type hidden, checkbox, range, or submit
            const validInputs = await page.locator(
              'input:not([type="hidden"]):not([type="checkbox"]):not([type="range"]):not([type="submit"]), textarea'
            ).elementHandles();

            // Combine with other filters if needed
            elementsSet = [...new Set(validInputs)];
          }

          const visibleRange = { top: localState.scrollIndex*yOffset, bottom: localState.scrollIndex*yOffset + segmentHeight };

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

          let specificElement = null; 

          if (elementsSet.length === 1) {
            specificElement = elementsSet[0];
          } else if (elementsSet.length > 1) {
            const elementDetails = [];
            for (const [index, element] of elementsSet.entries()) {
              // Add unique_element_id as an attribute to the element
              await element.evaluate((el, id) => {
                  el.setAttribute('element_id', id);
              }, index + 1);
          
              elementDetails.push(await element.evaluate((el) => el.outerHTML));
            }

            await getElement(localState.task, localState.user_action, elementDetails, localState.currentImage).then(async (res) => {
              const content = JSON.parse(res.content);
              if (verbose) {
                console.log("getElement", content);
              }
              specificElement = await page.$(`[element_id="${content.element_id}"]`);
            }).catch((e) => {
              console.error("getElement error", e);
            });

            // remove element_id attribute
            for (const element of elementsSet) {
              await element.evaluate((el) => {
                  el.removeAttribute('element_id');
              });
            }
          }
          if (verbose) {
            //tag
            console.log("specificElement's tag", await specificElement?.evaluate(el => el.tagName));
            // inner text
            console.log("specificElement's innerText", await specificElement?.evaluate(el => el.innerText));
          }
          if (specificElement) {
            if (localState.actionJson.action === "click") {
              try {
                await specificElement.click();
              } catch (e) {
                console.error("click error", e);
              }
            } else {
              await specificElement.focus(); // Ensure the input field is focused
              await specificElement.fill(localState.actionJson.input_value); // Clear and type the provided content
              await page.keyboard.press("Enter"); // Simulate pressing Enter while the input is focused
            }
          }
          await page.waitForTimeout(newUrlWait);
        } catch (e) {
          console.error("click or text error", e);
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

/*
// Example call to the function
const data = [];

fs.createReadStream('./WV_WA.csv')
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
      console.log("try", row.ques, row.web);
      //{ task, web = "", verbose = false, headless = false, taskUpdate = true }
      const { observations } = await browse({ task: row.ques, web: row.web, verbose: true, headless: false, taskUpdate: false });
      const filePath = `./${row.id}.csv`;
      const stream = fs.createWriteStream(filePath);
  
      writeToStream(stream, observations, { headers: true })
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
*/

//Go on wikipedia and search for the singer Faye Wong, note what song she sang for Final Fantasy, then go on youtube and play the song there.
//Find a stephen chow movie from 1995 on google, just 1, note its name, find its price on amazon, and compare it with ebay
//Find two high school math problems, solve with wolfram alpha, report the answers

// go to wikipedia and find the musician mozart, find his last composition, go to youtube and play it
async function navigate() {
  await browse({ task: "go to wikipedia and find the musician mozart, find his last composition, go to youtube and play it", web: "", verbose: true, headless: false, taskUpdate: true });
}

navigate();

// To DO, add price slider. Add javascript functionality (so it can drag, wait, etc.)