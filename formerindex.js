const { getNextAction, getWeb, getDescribeAction, getObservation, locateBox, getUpdateTask } = require('./api');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const segmentWidth = 1024;
const segmentHeight = 1792;
const yOffset = 1000;
const newUrlWait = 5000;
const sameUrlWait = 1000;
const MAX_STEPS = 400;

const validGroups = {
  input: ["INPUT", "TEXTAREA"],
  select_item: ["LI", "TD", "OPTION", '[role="treeitem"]', '[role="button"]'],
  select: ["SELECT", "BUTTON", '[role="treeitem"]'],
  button: ["SELECT", "BUTTON", "A", '[role="button"]', '[role="treeitem"]'],
  a: ["A", "BUTTON", '[role="button"]', '[role="treeitem"]'],
  iframe: ["IFRAME"], // ignore for now
  video: ["VIDEO"]  // ignore for now
};

const state = {
  stateAction: null,
  web: null,
  task: null,
  action_and_explanation: null,
  actionJson: {},
  observations: [],
  currentImage: null,
  currentBoxedImage: null,
  prevImage: null,
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
    this.importantObservations = [];
    this.messages = [...initialMessages]; // Reset to initial messages
    this.retrieveMessages = [...initialRetrieveMessages]; // Reset to initial retrieve messages
    this.nextActionText = "";
    this.scrollIndex = 0;
    this.screenshotIndex = 0;
  },
};

async function browse(task, web = "", verbose = false) {
  // Path to the directory where the files are located
  const directory = ".";

  // Delete all files matching the pattern "screenshot_*.png"
  fs.readdirSync(directory).forEach((file) => {
    if (file.startsWith("screenshot_") && file.endsWith(".png")) {
      fs.unlinkSync(path.join(directory, file));
    }
  });

  const browser = await chromium.launch({
    headless: false, // Set to true if you want headless mode
    args: ["--lang=en-US"], // Force US English locale
    ignoreDefaultArgs: ["--hide-scrollbars"], // Ignore default args
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: segmentWidth, height: segmentHeight });

  const localState = {...state, task: task};

  if (web) {
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
          const baseUrl1 = `${url.protocol}//${url.host}`;
          const url2 = new URL(localState.web || "");
          const baseUrl2 = `${url.protocol}//${url.host}` || "";
          if (baseUrl1 !== baseUrl2) { 
            localState.web = content.website_url;
            localState.stateAction = "goto";
          } else {
            localState.stateAction = "getNextAction";
          }
        }).catch((e) => {
          console.error("web browsing error", e);
        });
        break;
      case "goto":
        localState.currentStep++;
        await page.goto(localState.web);
        await page.waitForTimeout(newUrlWait);
        localState.observations = [
          ...localState.observations,
          { task: localState.task, observation: `Went to ${localState.web}`, action_and_explanation: `Going to ${localState.web}` },
        ]

        // Take a screenshot as a Base64-encoded string
        await page.screenshot({ path: 'screenshot.png' });
        const gotobase64Image = fs.readFileSync('screenshot.png', 'base64');
        const gotobase64ImageUrl = `data:image/png;base64,${gotobase64Image}`;
        localState.prevImage = localState.currentImage;
        localState.currentImage = gotobase64ImageUrl;
        localState.stateAction = "getNextAction";
        break;
      case 'observe':
        // Close the boxes
        await page.evaluate(() => {
          (function closeOverlays() {
            const overlays = document.querySelectorAll('.bounding-box-overlay');
            overlays.forEach((overlay) => overlay.remove());
        
            const elements = document.querySelectorAll('[el-index]');
            elements.forEach((el) => el.removeAttribute('el-index'));
          })();
        });

        // Take a screenshot as a Base64-encoded string
        await page.screenshot({ path: 'screenshot.png' });
        const base64Image = fs.readFileSync('screenshot.png', 'base64');
        const base64ImageUrl = `data:image/png;base64,${base64Image}`;
        localState.prevImage = localState.currentImage;
        localState.currentImage = base64ImageUrl;
        //getObservation(observations, current_task, current_action_and_explanation, prev_screenshot, current_screenshot) 
        await getObservation(localState.observations, localState.task, localState.action_and_explanation, localState.prevImage, localState.currentImage).then((res) => {
          const content = JSON.parse(res.content);

          if (verbose) {
            console.log("getObservation", content);
          }
          localState.observations = [...localState.observations, {
            task: localState.task,
            observation: content.observation,
            action_and_explanation: localState.action_and_explanation,
          }];
          localState.stateAction = "getUpdatetTask";
        }).catch((e) => {
          console.error("getObservation error", e);
        });
      case "getUpdatetTask":
        // current url
        localState.web = page.url();
        await getUpdateTask(localState.observations, localState.web, localState.currentImage).then((res) => {
          const content = JSON.parse(res.content);
          if  (verbose) {
            console.log("getUpdateTask", content);
          }
          if (content.update_task) {
            localState.task = content.updated_task_query;
            localState.stateAction = "getWeb";
          } else {
            localState.stateAction = "getNextAction";
          }

          if (content.task_complete) {
            localState.stateAction = null;
          }
        }).catch((e) => {
          console.error("getUpdateTask error", e);
        });
      case "getNextAction":
        localState.currentStep++;
        // getNextAction(observations, current_screenshot = placeholderScreenshot)
        await getNextAction(localState.observations, localState.currentImage).then((res) => {
          const content = JSON.parse(res.content);
          if (verbose) {
            console.log("getNextAction", content);
          }
          localState.action_and_explanation = content.action_and_explanation;
          localState.stateAction = "getDescribeAction";
        }).catch((e) => {
          console.error("getNextAction error", e);
        });
        break;
      case "getDescribeAction":
        localState.currentStep++;
        //getDescribeAction(task, current_action, current_screenshot = placeholderScreenshot)
        await getDescribeAction(localState.task, localState.action_and_explanation, localState.currentImage).then(async (res) => {
          const content = JSON.parse(res.content);
          if (verbose) {
            console.log("getDescribeAction", content);
          }
          localState.actionJson = content;
          switch (localState.actionJson.action) {
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
              localState.stateAction = "getNextAction";
          }
          
        }).catch((e) => {
          console.error("getDescribeAction error", e);
          localState.stateAction = "getNextAction";
        });
        break;
      case "goBack":
        localState.currentStep++;
        await page.goBack();
        await page.waitForTimeout(newUrlWait);
        localState.stateAction = "observe";
        break;
      case "scrollUp":
        localState.currentStep++;
        // cannot be less than 0
        localState.scrollIndex = localState.scrollIndex - 1 < 0 ? 0 : localState.scrollIndex - 1;
        await page.evaluate(() => {
          window.scrollTo(0, localState.scrollIndex * yOffset);
        });
        await page.waitForTimeout(sameUrlWait);
        localState.stateAction = "observe";
        break
      case "scrollDown":
        localState.currentStep++;
        localState.scrollIndex = localState.scrollIndex + 1;
        await page.evaluate(() => {
          window.scrollTo(0, localState.scrollIndex * yOffset);
        });
        await page.waitForTimeout(sameUrlWait);
        localState.stateAction = "observe";
        break
      case "click":
      case "text":
        await page.evaluate(
          ({ validGroups, elementType, yOffset, borderColor }) => {
            const tagsToFilter = validGroups[elementType] || [];
            const elements = Array.from(document.querySelectorAll('*')).filter((element) =>
              tagsToFilter.includes(element.tagName)
            );
      
            let index = 1;
      
            elements.forEach((el) => {
              const bbox = el.getBoundingClientRect();
      
              if (!(bbox.bottom > yOffset && bbox.top < Number(yOffset) + 1792) && !(bbox.top < 1792)) {
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
              newElement.style.zIndex = 99999999;
      
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
          },
          { validGroups, elementType: localState.actionJson.element_type, yOffset: yOffset*localState.scrollIndex, borderColor: "black" } // Passing arguments to the browser context
        );
        await page.screenshot({ path: 'screenshot_boxed.png' });
        const base64ImageBoxed = fs.readFileSync('screenshot.png', 'base64');
        const base64ImageBoxedUrl = `data:image/png;base64,${base64ImageBoxed}`;
        localState.currentBoxedImage = base64ImageBoxedUrl;

        //locateBox(task, current_action, element_type, current_screenshot = placeholderScreenshot)
        await locateBox(localState.task, localState.action_and_explanation, localState.actionJson.element_type, localState.currentBoxedImage).then(async (res) => {
          try {
            if (verbose) {
              console.log("res.content", res.content);
            }
            const index = JSON.parse(res.content).number; 
            if (!index) {

            } else  {
              const element = page.locator(`[el-index="${index}"]`);

              if (localState.actionJson.action === "click") {
                await element.click()
                await page.waitForTimeout(newUrlWait);
              } 

              if (localState.actionJson.action === "text") {
                const isInput = await element.evaluate((el) => ["input", "textarea"].includes(el.tagName.toLowerCase()));
                if (isInput) {
                  await element.focus(); // Ensure the input field is focused
                  await element.fill(localState.actionJson.content); // Clear and type the provided content
                  await page.keyboard.press("Enter"); // Simulate pressing Enter while the input is focused

                  await page.waitForTimeout(newUrlWait);
                }
              }
            }
          } catch (e) {
            console.error("locateBox error", e);
          }
          localState.stateAction = "observe";
        }).catch((e) => {
          localState.stateAction = "observe";
          console.error("locateBox error", e);
        });
        break;
      default:
        localState.stateAction = null;
        console.log("Invalid day");
    }
  }
  
  await browser.close();
}

// Example call to the function
browse("Provide a recipe for vegetarian lasagna with more than 100 reviews and a rating of at least 4.5 stars suitable for 6 people.", "https://www.allrecipes.com/", true);

//const elements = await page.locator('text="Your Text"').elementHandles();

//const elements = await page.locator('[placeholder="Your Placeholder"]').elementHandles();
