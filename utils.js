// Define a function to identify clickable elements
const isClickable = async (elementHandle) => {
  return await elementHandle.evaluate((el) => {
    const tagName = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const type = el.getAttribute('type');

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
      role === 'radio'
    );
  });
};

module.exports = { isClickable };