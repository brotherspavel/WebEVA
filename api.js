const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const { GET_INPUT, ADD_DATE, OBSERVATION_MESSAGES, UPDATE_TASK, GET_ACTION, PARSE_ACTION, TASK_COMPLETE, GET_URL, GET_ELEMENT, SUMMARIZE_TASK, CUSTOM_ACTION, IDENTIFY_OPTIONS, MODIFY_URL_PARAMS, SUMMARIZE_TASK_INCOMPLETE } = require('./messages');
const { getCurrentDate } = require('./utils');
const MAX_OBSERVATIONS_GET_NEXT_ACTION = 6
const MAX_OBSERVATIONS_NEW_OBSERVATION = 7
const MAX_OBSERVATIONS_UPDATE_TASK = 10

// note that there is 1 more in addition to whats listed here for MAX
const MAX_OBSERVATIONS_IS_TASK_COMPLETE = 24
const MAX_GET_SUMMARIZED_TASK = 6

const placeholderScreenshot = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTIcwt4U72qbCuk1Bzes5qODmYmrN2xp9MvOw&s";

async function getInput(task, current_action, current_screenshot = placeholderScreenshot) {
  const webMessages = [
    {
      role: "system",
      content: GET_INPUT,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `
            **Task**: ${task}
            **Current Action**: ${current_action}
          `,
        },
        {
          type: "image_url",
          image_url: {
            url: current_screenshot,
          },
        }
      ],
    },
  ];
  
  const jsonPayload = {
    model: process.env.model, // Replace with your desired model name
    messages: webMessages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "action_schema",
        schema: {
          type: "object",
          properties: {
            input_value: {
              type: "string",
              description: "The exact text to input into the field for text actions, using essential keywords only. Leave blank for other actions",
            },
          },
          required: ["input_value"],
          additionalProperties: false,
        },
      },
    },
  };
  
  try {
    // Make the API call using axios
    const response = await axios.post(
      process.env.OPENAI_API_URL,
      jsonPayload,
      {
        headers: {
          "Content-Type": "application/json",
          'api-key': process.env.OPENAI_API_KEY,
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Replace with your OpenAI API key
        },
      }
    );

    // Handle the response
    if (response.status === 200) {
      return response.data.choices[0].message;
    } else {
      console.error(`Error: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return null;
  }
}

async function getUpdatedURL(task_goal, current_url, action) {
  const webMessages = [
    {
      role: "system",
      content: MODIFY_URL_PARAMS,
    }
  ];
  
  webMessages.push({
    role: "user",
    content: [
      {
        type: "text",
        text: `**Task Goal**: ${task_goal}
        **Current URL**: ${current_url}
        **Action**: ${action || ''}`,
      },
    ],
  });

  const jsonPayload = {
    model: process.env.model, // Replace with your desired model name
    messages: webMessages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "action_schema",
        schema: {
          type: "object",
          properties: {
            new_url: {
              type: "string",
            },
            reasoning: {
              type: "string",
            },
          },
          required: ["new_url", "reasoning"],
          additionalProperties: false,
        },
      },
    },
  };  

  try {
    // Prepare the data payload for the API
    const response = await axios.post(
      process.env.OPENAI_API_URL,
      jsonPayload,
      {
        headers: {
          "Content-Type": "application/json",
          'api-key': process.env.OPENAI_API_KEY,
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Replace with your OpenAI API key
        },
      }
    );
    // Extract the result
    if (response.status === 200) {
      const result = response.data;
      return result.choices[0].message
    } else {
      console.error(`Errorh: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return null;
  }
}

async function getDateTask(task_goal) {
  const webMessages = [
    {
      role: "system",
      content: ADD_DATE,
    }
  ];
  
  webMessages.push({
    role: "user",
    content: [
      {
        type: "text",
        text: `**Task Goal**: ${task_goal}
        **Current DateTime**: ${getCurrentDate()}`,
      },
    ],
  });

  const jsonPayload = {
    model: process.env.model, // Replace with your desired model name
    messages: webMessages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "action_schema",
        schema: {
          type: "object",
          properties: {
            update_task_goal: {
              type: "boolean",
            },
            updated_task_goal: {
              type: "string",
            },
          },
          required: ["update_task_goal"],
          additionalProperties: false,
        },
      },
    },
  };  

  try {
    // Prepare the data payload for the API
    const response = await axios.post(
      process.env.OPENAI_API_URL,
      jsonPayload,
      {
        headers: {
          "Content-Type": "application/json",
          'api-key': process.env.OPENAI_API_KEY,
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Replace with your OpenAI API key
        },
      }
    );
    // Extract the result
    if (response.status === 200) {
      const result = response.data;
      const content = JSON.parse(result.choices[0].message?.content);
      if (content.update_task_goal && content.updated_task_goal?.length) {
        return content.updated_task_goal;
      } else {
        return task_goal;
      }
    } else {
      console.error(`Errorh: ${response.status}, ${response.data}`);
      return task_goal;
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return task_goal;
  }
}

async function getSummarizedTask(observations, screenshot1, screenshot2, screenshot3, lastStep = false) {
  const webMessages = [
    {
      role: "system",
      content: lastStep ? SUMMARIZE_TASK_INCOMPLETE : SUMMARIZE_TASK,
    }
  ];

  for (let i = 0; i < Math.min(observations.length, MAX_GET_SUMMARIZED_TASK); i++) {
    const observation = observations[i];
    webMessages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: `
            **task_goal**: ${observation.task || ''}
            **user_action_and_explanation**: ${observation.user_action_and_explanation || ''}
            **observation**: ${observation.observation || ''}
          `,
        },
      ],
    });
  }

  const screenshotsContent = [
    {
      type: "image_url",
      image_url: {
        url: screenshot1,
      },
    }
  ]

  if (screenshot2) {
    screenshotsContent.push({
      type: "image_url",
      image_url: {
        url: screenshot2,
      },
    })
  }

  if (screenshot3) {
    screenshotsContent.push({
      type: "image_url",
      image_url: {
        url: screenshot3,
      },
    })
  }
  webMessages.push({
    role: "user",
    content: screenshotsContent
  });

  const jsonPayload = {
    model: process.env.model, // Replace with your desired model name
    messages: webMessages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "action_schema",
        schema: {
          type: "object",
          properties: {
            task_answer: {
              type: "string",
            },
          },
          required: ["task_answer"],
          additionalProperties: false,
        },
      },
    },
  };  

  try {
    // Prepare the data payload for the API
    const response = await axios.post(
      process.env.OPENAI_API_URL,
      jsonPayload,
      {
        headers: {
          "Content-Type": "application/json",
          'api-key': process.env.OPENAI_API_KEY,
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Replace with your OpenAI API key
        },
      }
    );

    // Extract the result
    if (response.status === 200) {
      const result = response.data;
      return result.choices[0].message;
    } else {
      console.error(`Errorh: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return null;
  }
}

async function getIsTaskComplete(observations, current_screenshot) {
  const webMessages = [
    {
      role: "system",
      content: TASK_COMPLETE,
    }
  ];

  for (let i = 0; i < Math.min(observations.length - 1, MAX_OBSERVATIONS_IS_TASK_COMPLETE); i++) {
    const observation = observations[i];
    webMessages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: `
            **task_goal**: ${observation.task || ''}
            **user_action_and_explanation**: ${observation.user_action_and_explanation || ''}
            **observation**: ${observation.observation || ''}
          `,
        },
      ],
    });
  }
  
  // Handle the last observation separately
  if (observations.length > 0) {
    const lastObservation = observations[observations.length - 1];
    webMessages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: `
            **current_task_goal**: ${lastObservation.task || ''}
            **current_user_action_and_explanation**: ${lastObservation.user_action_and_explanation || ''}
            **current_observation**: ${lastObservation.observation || ''}
          `,
        },
      ],
    });
  }
  
  webMessages.push({
    role: "user",
    content: [
      {
        type: "text",
        text: `**Visual Context**:`,
      },
      {
        type: "image_url",
        image_url: {
          url: current_screenshot,
        },
      },
    ],
  });

  const jsonPayload = {
    model: process.env.model, // Replace with your desired model name
    messages: webMessages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "action_schema",
        schema: {
          type: "object",
          properties: {
            task_complete: {
              type: "boolean",
            },
          },
          required: ["task_complete"],
          additionalProperties: false,
        },
      },
    },
  };  

  try {
    // Prepare the data payload for the API
    const response = await axios.post(
      process.env.OPENAI_API_URL,
      jsonPayload,
      {
        headers: {
          "Content-Type": "application/json",
          'api-key': process.env.OPENAI_API_KEY,
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Replace with your OpenAI API key
        },
      }
    );

    // Extract the result
    if (response.status === 200) {
      const result = response.data;
      return result.choices[0].message;
    } else {
      console.error(`Errorh: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return null;
  }
}

async function getUpdateTask(observations, current_url, current_screenshot) {
  const webMessages = [
    {
      role: "system",
      content: UPDATE_TASK,
    }
  ];

  for (let i = 0; i < Math.min(observations.length - 1, MAX_OBSERVATIONS_UPDATE_TASK); i++) {
    const observation = observations[i];
    webMessages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: `
            **task_goal**: ${observation.task || ''}
            **user_action_and_explanation**: ${observation.user_action_and_explanation || ''}
            **observation**: ${observation.observation || ''}
          `,
        },
      ],
    });
  }
  
  // Handle the last observation separately
  if (observations.length > 0) {
    const lastObservation = observations[observations.length - 1];
    webMessages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: `
            **current_task_goal**: ${lastObservation.task || ''}
            **current_user_action_and_explanation**: ${lastObservation.user_action_and_explanation || ''}
            **current_observation**: ${lastObservation.observation || ''}
          `,
        },
      ],
    });
  }
  

  webMessages.push({
    role: "user",
    content: [
      {
        type: 'text',
        text: `**Current URL**: ${current_url}`
      },
      {
        type: "image_url",
        image_url: {
          url: current_screenshot,
        },
      }
    ]
  });

  const jsonPayload = {
    model: process.env.model, // Replace with your desired model name
    messages: webMessages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "action_schema",
        schema: {
          type: "object",
          properties: {
            update_task: {
              type: "boolean",
            },
            updated_task_goal: {
              type: "string",
            },
          },
          required: ["update_task", "updated_task_goal"],
          additionalProperties: false,
        },
      },
    },
  };  

  try {
    // Prepare the data payload for the API
    const response = await axios.post(
      process.env.OPENAI_API_URL,
      jsonPayload,
      {
        headers: {
          "Content-Type": "application/json",
          'api-key': process.env.OPENAI_API_KEY,
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Replace with your OpenAI API key
        },
      }
    );

    // Extract the result
    if (response.status === 200) {
      const result = response.data;
      return result.choices[0].message;
    } else {
      console.error(`Errorh: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return null;
  }
}

async function getNextAction(observations, current_screenshot = placeholderScreenshot) {
  const webMessages = [
    {
      role: "system",
      content: GET_ACTION,
    }
  ];

  for (let i = 0; i < Math.min(observations.length, MAX_OBSERVATIONS_GET_NEXT_ACTION); i++) {
    const observation = observations[i];
    webMessages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: `
            **task_goal**: ${observation.task || ''}
            **user_action_and_explanation**: ${observation.user_action_and_explanation || ''}
            **observation**: ${observation.observation || ''}
          `,
        },
      ],
    });
  }

  webMessages.push({
    role: "user",
    content: [
      {
        type: "image_url",
        image_url: {
          url: current_screenshot,
        },
      }
    ]
  });

  const jsonPayload = {
    model: process.env.model, // Replace with your desired model name
    messages: webMessages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "action_schema",
        schema: {
          type: "object",
          properties: {
            user_action_and_explanation: {
              type: "string",
            },
          },
          required: ["user_action_and_explanation"],
          additionalProperties: false,
        },
      },
    },
  };  

  try {
    // Prepare the data payload for the API
    const response = await axios.post(
      process.env.OPENAI_API_URL,
      jsonPayload,
      {
        headers: {
          "Content-Type": "application/json",
          'api-key': process.env.OPENAI_API_KEY,
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Replace with your OpenAI API key
        },
      }
    );

    // Extract the result
    if (response.status === 200) {
      const result = response.data;
      return result.choices[0].message;
    } else {
      console.error(`Errorh: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return null;
  }
}

async function getObservation(observations, current_task, current_user_action_and_explanation, prev_screenshot, current_screenshot) {
  const webMessages = [
    {
      role: "system",
      content: OBSERVATION_MESSAGES,
    }
  ];

  // At most 10 observations
  for (let i = 0; i < Math.min(observations.length, MAX_OBSERVATIONS_NEW_OBSERVATION); i++) {
    const observation = observations[i];
    webMessages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: `
            **task**: ${observation.task || ''}
            **user_action_and_explanation**: ${observation.user_action_and_explanation || ''}
            **observation**: ${observation.observation || ''}
          `,
        },
      ],
    });
  }

  webMessages.push({
    role: "user",
    content: [
      {
        type: "text",
        text: `
          **current_task**: ${current_task || ''}
          **current_user_action_and_explanation**: ${current_user_action_and_explanation || ''}
        `,
      },
    ],
  });

  webMessages.push({
    role: "user",
    content: [
      {
        type: 'text',
        text: `**Current Screenshot**`
      },
      {
        type: "image_url",
        image_url: {
          url: current_screenshot,
        },
      }
    ]
  });

  const jsonPayload = {
    model: process.env.model, // Replace with your desired model name
    messages: webMessages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "action_schema",
        schema: {
          type: "object",
          properties: {
            observation: {
              type: "string",
            },
            action_fail_or_stuck: {
              type: "boolean",
            }
          },
          required: ["observation"],
          additionalProperties: false,
        },
      },
    },
  };  

  try {
    // Prepare the data payload for the API
    const response = await axios.post(
      process.env.OPENAI_API_URL,
      jsonPayload,
      {
        headers: {
          "Content-Type": "application/json",
          'api-key': process.env.OPENAI_API_KEY,
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Replace with your OpenAI API key
        },
      }
    );

    // Extract the result
    if (response.status === 200) {
      const result = response.data;
      return result.choices[0].message;
    } else {
      console.error(`Errorh: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return null;
  }
}


async function getWeb(previousTask, previousObservation, currentTask, currentUrl, currentScreenshot) {
  const webMessages = [
    {
      role: "system",
      content: GET_URL,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `
            **Previous Task**: ${previousTask}
            **Previous Observation**: ${previousObservation}
            **Current Task**: ${currentTask}
            **Current URL**: ${currentUrl}
          `,
        },
      ],
    },
  ];

  if (currentScreenshot) {
    webMessages.push({
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: currentScreenshot,
          },
        },
      ],
    });
  }

  const jsonPayload = {
    model: process.env.model, // Replace with your desired model name
    messages: webMessages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "action_schema",
        schema: {
          type: "object",
          properties: {
            website_url: {
              type: "string",
            },
          },
          required: ["website_url"],
          additionalProperties: false,
        },
      },
    },
  };
 
  try {
    // Make the API call using axios
    const response = await axios.post(
      process.env.OPENAI_API_URL,
      jsonPayload,
      {
        headers: {
          "Content-Type": "application/json",
          'api-key': process.env.OPENAI_API_KEY,
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Replace with your OpenAI API key
        },
      }
    );

    // Handle the response
    if (response.status === 200) {
      return response.data.choices[0].message;
    } else {
      console.error(`Error: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return null;
  }
}

async function getParseAction(task, current_action, current_screenshot = placeholderScreenshot) {
  const webMessages = [
    {
      role: "system",
      content: PARSE_ACTION,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `
            **Task**: ${task}
            **Current Action**: ${current_action}
          `,
        },
        {
          type: "image_url",
          image_url: {
            url: current_screenshot,
          },
        }
      ],
    },
  ];
  
  const jsonPayload = {
    model: process.env.model, // Replace with your desired model name
    messages: webMessages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "action_schema",
        schema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["text", "click", "scroll_up", "scroll_down", "go_back"],
              description: "The type of action to be performed.",
            },
            inner_text: {
              type: "string",
              description: "The innerText or placeholder of the element for text or click actions. Leave empty for other actions.",
            },
            no_inner_text_click: {
              type: "boolean",
              description: "If the action is click and no inner text is available. Specifies if the element is an checkbox, a close, an image, or icon button.",
            },
            input_value: {
              type: "string",
              description: "The exact text to input into the field for text actions, using essential keywords only. Leave blank for other actions",
            },
          },
          required: ["action", "is_icon"],
          additionalProperties: false,
        },
      },
    },
  };
  
  try {
    // Make the API call using axios
    const response = await axios.post(
      process.env.OPENAI_API_URL,
      jsonPayload,
      {
        headers: {
          "Content-Type": "application/json",
          'api-key': process.env.OPENAI_API_KEY,
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Replace with your OpenAI API key
        },
      }
    );

    // Handle the response
    if (response.status === 200) {
      return response.data.choices[0].message;
    } else {
      console.error(`Error: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return null;
  }
}

async function getCustomAction(task, current_action, current_screenshot = placeholderScreenshot) {
  const webMessages = [
    {
      role: "system",
      content: CUSTOM_ACTION,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `
            **Task**: ${task}
            **Current Action**: ${current_action}
          `,
        },
        {
          type: "image_url",
          image_url: {
            url: current_screenshot,
          },
        }
      ],
    },
  ];
  
  const jsonPayload = {
    model: process.env.model, // Replace with your desired model name
    messages: webMessages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "action_schema",
        schema: {
          type: "object",
          properties: {
            javascript_code: {
              type: "string",
              description: "JavaScript code that will execute the required action directly on the page.",
            },
          },
          required: ["javascript_code"],
          additionalProperties: false,
        },
      },
    },
  };
  
  try {
    // Make the API call using axios
    const response = await axios.post(
      process.env.OPENAI_API_URL,
      jsonPayload,
      {
        headers: {
          "Content-Type": "application/json",
          'api-key': process.env.OPENAI_API_KEY,
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Replace with your OpenAI API key
        },
      }
    );

    // Handle the response
    if (response.status === 200) {
      return response.data.choices[0].message;
    } else {
      console.error(`Error: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return null;
  }
}

async function getElement(task, current_action, elementsList = [], currentScreenshot = placeholderScreenshot) {
  const webMessages = [
    {
      role: "system",
      content: GET_ELEMENT,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `
            **task**: ${task}
            **action**: ${current_action}
            **elements**: ${JSON.stringify(elementsList, null, 2)}
          `,
        },
      ],
    },
  ];

  if (currentScreenshot) {
    webMessages.push({
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: currentScreenshot,
          },
        },
      ],
    });
  }

  const jsonPayload = {
    model: process.env.model, // Replace with your desired model name
    messages: webMessages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "action_schema",
        schema: {
          type: "object",
          properties: {
            element_id: {
              type: "number",
            },
          },
          required: ["element_id"],
          additionalProperties: false,
        },
      },
    },
  };
 
  try {
    // Make the API call using axios
    const response = await axios.post(
      process.env.OPENAI_API_URL,
      jsonPayload,
      {
        headers: {
          "Content-Type": "application/json",
          'api-key': process.env.OPENAI_API_KEY,
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Replace with your OpenAI API key
        },
      }
    );

    // Handle the response
    if (response.status === 200) {
      return response.data.choices[0].message;
    } else {
      console.error(`Error: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return null;
  }
}

async function getOptions(current_action, elementsList = []) {
  const webMessages = [
    {
      role: "system",
      content: IDENTIFY_OPTIONS,
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `
            **action**: ${current_action}
            **elements**: ${JSON.stringify(elementsList, null, 2)}
          `,
        },
      ],
    },
  ];

  const jsonPayload = {
    model: process.env.model, // Replace with your desired model name
    messages: webMessages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "action_schema",
        schema: {
          type: "object",
          properties: {
            initial_option_value: {
              type: "string",
            },
            final_option_value: {
              type: "string",
            },
          },
          required: ["initial_option_value", "final_option_value"],
          additionalProperties: false,
        },
      },
    },
  };
 
  try {
    // Make the API call using axios
    const response = await axios.post(
      process.env.OPENAI_API_URL,
      jsonPayload,
      {
        headers: {
          "Content-Type": "application/json",
          'api-key': process.env.OPENAI_API_KEY,
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // Replace with your OpenAI API key
        },
      }
    );

    // Handle the response
    if (response.status === 200) {
      return response.data.choices[0].message;
    } else {
      console.error(`Error: ${response.status}, ${response.data}`);
      return null;
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return null;
  }
}

module.exports = {
  getNextAction,
  getWeb,
  getParseAction,
  getObservation,
  getUpdateTask,
  getIsTaskComplete,
  getElement,
  getSummarizedTask,
  getCustomAction,
  getOptions,
  getDateTask,
  getUpdatedURL,
  getInput,
};