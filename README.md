<div align="center">
<h1> WebEVA 
<br>The Next Impact Toward Smarter Web Agents </h1>
</div>

<div align="center">

<a href="https://youtu.be/0YTMzVw1XEY"><img src="https://img.shields.io/badge/WebEVA-Demo-teal.svg"></a>
<a href="https://github.com/brotherspavel/WebEVA/tree/main/webvoyager"><img src="https://img.shields.io/badge/WebEVA-ResultAnswers-green.svg"></a>
<a href="https://docs.google.com/spreadsheets/d/1CRMghks70kHsRv6FW9aAcS7u-_a8U6BUncvnJf4WPpQ/edit?gid=497099698#gid=497099698"><img src="https://img.shields.io/badge/WebEVA-ResultSheets-blue.svg"></a>
<a href="https://github.com/brotherspavel/WebEVA/blob/main/messages.js"><img src="https://img.shields.io/badge/WebEVA-Prompts-gold.svg"></a>
<a href="https://github.com/MinorJerry/WebVoyager"><img src="https://img.shields.io/badge/Dataset-WebVoyager-silver.svg"></a>

</div>

<div align="center">
<img src="./assets/image.png" width="80%">
</div>

## Description

WebEVA is a multimodal web agent that achieved a state-of-the-art 80.3% success rate on the WebVoyager dataset. We support dynamic navigation and the ability to find elements without using visual cues/set-of-mark prompting.
Our code and prompts can be found under index.js and messages.js respectively. Currently under review.  
<br>
![Demo](./assets/eva.gif)
Check the IMDb scre of the movie Inception. and then find the names of its producers on wikipedia

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
node index.js "Check the IMDb scre of the movie Inception and then find its budget and box office on wikipedia"
```

If the task requires interaction with a particular website (like WebVoyager tasks), provide the website URL:

```bash
node index.js "Find the last composition by Mozart" "https://example.com"
```

## Authors (To be edited)

<div align="center">
<img src="./assets/authors.png" width="80%">
</div>
