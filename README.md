# WebEVA

## Description

WebEVA is a multimodal web agent that achieves a state-of-the-art 80.3% success rate on the WebVoyager dataset by improving element selection, task refinement, and efficient navigation.

## Prerequisites

Before running the project, make sure you have **Node.js** installed. You can download it from [Node.js official website](https://nodejs.org/).

Additionally, you will need a `.env` file to store your environment variables securely.

## Setup

Follow these steps to set up the project:

1. **Clone the repository**:

   - Clone the WebEVA repository from GitHub and navigate into the project directory.

2. **Install dependencies**:

   - Install the required Node.js packages by running `npm install`.
   - Install Playwright and its required browsers by running `npx playwright install`.

3. **Create the `.env` file**:

   - In the root of the project, create a `.env` file with the following environment variables:

     ```
     model="gpt-4o"
     OPENAI_API_KEY=YOUR_OPENAI_API_KEY
     OPENAI_API_URL=YOUR_OPENAI_API_URL
     ```

   - Replace `YOUR_OPENAI_API_KEY` and `YOUR_OPENAI_API_URL` with your actual OpenAI API credentials.

## Running the Project

Once the setup is complete, you can run the script by providing the task description as a command-line argument.

### Example Usage:

- Run the project with the following command to execute a task:
  `node index.js "Find the last composition by Mozart and play it on YouTube"`
