<div align="center">
<h1> WebEVA 
<br>The Next Impact Toward Smarter Web Agents </h1>
</div>

<div align="center">

<a href="https://github.com/MinorJerry/WebVoyager"><img src="https://img.shields.io/badge/Dataset-WebVoyager-silver.svg"></a>
<a href="https://playwright.dev/"><img src="https://img.shields.io/badge/Playwright-1.49.0-coral.svg"></a>
<a href="https://github.com/brotherspavel/WebEVA/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-teal.svg"></a>
<a href="https://github.com/brotherspavel/WebEVA/tree/main/webvoyager"><img src="https://img.shields.io/badge/WebEVA-ResultAnswers-green.svg"></a>
<a href="https://docs.google.com/spreadsheets/d/1CRMghks70kHsRv6FW9aAcS7u-_a8U6BUncvnJf4WPpQ/edit?gid=497099698#gid=497099698"><img src="https://img.shields.io/badge/WebEVA-ResultSheets-blue.svg"></a>
<a href="https://github.com/brotherspavel/WebEVA/blob/main/messages.js"><img src="https://img.shields.io/badge/WebEVA-Prompts-gold.svg"></a>

</div>

<div align="center">
<img src="./assets/image.png" width="80%">
</div>

## Description

WebEVA is a multimodal web agent that achieves a state-of-the-art 80.3% success rate on the WebVoyager dataset by improving element selection, task refinement, and efficient navigation.

## Prerequisites

Before running the project, make sure you have **Node.js** installed. You can download it from [Node.js official website](https://nodejs.org/).

Additionally, you will need a `.env` file to store your environment variables securely.

## Setup

Follow these steps to set up the project:

1. **Clone the repository**:

   ```bash
   git clone https://github.com/brotherspavel/WebEVA
   cd WebEVA
   ```

2. **Install dependencies**:
   Install the required Node.js packages:

   ```bash
   npm install
   ```

   Install Playwright and its required browsers:

   ```bash
   npx playwright install
   ```

3. **Create the `.env` file**:
   In the root of the project, create a .env file with the following environment variables:

   ```bash
   model="gpt-4o"
   OPENAI_API_KEY=YOUR_OPENAI_API_KEY
   OPENAI_API_URL=YOUR_OPENAI_API_URL
   ```

   Replace `YOUR_OPENAI_API_KEY` and `YOUR_OPENAI_API_URL` with your actual OpenAI API credentials.

## Running the Project

Once the setup is complete, you can run the script by providing the task description as a command-line argument.

### Example Usage:

```bash
node index.js "Find the last composition by Mozart and play it on YouTube"
```

If the task requires interaction with a particular website (like WebVoyager tasks), provide the website URL:

```bash
node index.js "Find the last composition by Mozart" "https://example.com"
```
