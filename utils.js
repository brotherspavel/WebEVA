// Define a function to identify clickable elements
const isClickable = async (elementHandle) => {
  return await elementHandle.evaluate((el) => {
    const tagName = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const type = el.getAttribute('type');
    const classList = el.classList || el.className || '';

    // Define navigation-related terms
    const navRelatedTerms = ['nav', 'menu', 'link', 'navbar', 'navigation', 'select'];

    // Check if the element is inherently or custom clickable
    return (
      // Inherently clickable elements
      tagName === 'button' ||
      tagName === 'a' ||
      tagName === 'select' ||
      tagName === 'option' ||
      tagName === 'td' || 
      (tagName === 'input' && ['button', 'submit', 'reset', 'checkbox', 'radio', 'image', 'file'].includes(type)) ||
      // ARIA roles
      role === 'button' ||
      role === 'checkbox' ||
      role === 'link' ||
      role === 'menuitem' ||
      role === 'tab' ||
      role === 'radio' ||
      // Check if the class contains any of the navigation-related terms
      (classList && navRelatedTerms.some(term => classList.toString().toLowerCase().includes(term)))
    );
  });
};

/*
We only run this when it matches one.
Albeit, we can let chatGPT decide, but this saves money and time.
*/
const dateIndicators = [
  "today", "yesterday", "tomorrow",
  "newest", "latest", "earliest", 
  "this week", "last week", "next week",
  "this month", "last month", "next month",
  "this year", "last year", "next year",
  "previous", "upcoming", "current",
  "on date", "on [date]",
  "January", "Jan",
  "February", "Feb",
  "March", "Mar",
  "April", "Apr",
  "May", "May",
  "June", "Jun",
  "July", "Jul",
  "August", "Aug",
  "September", "Sep",
  "October", "Oct",
  "November", "Nov",
  "December", "Dec", "days", "weeks", "months", "years", "now", "currently", 2024, 2025, 2026, 2027, 2028, 2029, 2030
];

// use getTaskDate instead.
function containsDateIndicator(str) {
  for (let i = 0; i < dateIndicators.length; i++) {
    const word = dateIndicators[i];
    const regex = new RegExp(`\\b${word}\\b`, 'i');  // Word boundary and case-insensitive match
    if (regex.test(str)) {
      return true;  // Return true if any date indicator matches
    }
  }
  return false;  // Return false if no match is found
}

function getCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');  // months are zero-indexed
  const day = String(now.getDate()).padStart(2, '0');

  // Format: YYYY-MM-DD
  return `${year}-${month}-${day}.`;
}

module.exports = { isClickable, containsDateIndicator, getCurrentDate };