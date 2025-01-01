const borderColor = 'black';
const { getNextAction, getWeb, getDescribeAction, getObservation, locateBox, getSummarizedTask, getCustomAction } = require('./api');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const axios = require('axios');

// app.js

// Load environment variables from .env file
require('dotenv').config();

// Configuration from environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_BASE = process.env.OPENAI_API_BASE;
const OPENAI_API_VERSION = process.env.OPENAI_API_VERSION;

// Define the deployment name (replace with your actual deployment name)
const DEPLOYMENT_NAME = 'your-deployment-name'; // e.g., 'gpt-4-deployment'

// Construct the API endpoint
const API_ENDPOINT = `${OPENAI_API_BASE}openai/deployments/gpt-4o/chat/completions?api-version=2024-08-01-preview`;

// Define the request payload
const data = {
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello, how can you assist me today?' },
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
        "name": "CalendarEventResponse",
        "strict": true,
        "schema": {
            "type": "object",
            "properties": {
                "name": {
                  "type": "string"
                },
                "date": {
                    "type": "string"
                },
                "participants": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    }
                }
            },
            "required": [
                "name",
                "date",
                "participants"
            ],
            "additionalProperties": false
        }
    },
  }
};

const config = {
  headers: {
    'api-key': OPENAI_API_KEY,
    'Content-Type': 'application/json',
  },
};

const getOpenAIResponse = async () => {
  try {
    const response = await axios.post(API_ENDPOINT, data, config);
    console.log('OpenAI Response:', response.data.choices[0].message.content);
  } catch (error) {
    if (error.response) {
      // The server responded with a status code outside the 2xx range
      console.error('Error Response Data:', error.response.data);
      console.error('Error Status:', error.response.status);
      console.error('Error Headers:', error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No Response Received:', error.request);
    } else {
      // Something else happened while setting up the request
      console.error('Error Message:', error.message);
    }
  }
};

// Execute the POST request
getOpenAIResponse();
