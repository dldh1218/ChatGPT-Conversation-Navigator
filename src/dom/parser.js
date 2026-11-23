/* global window */

/** Turns rendered ChatGPT message DOM into a lightweight, in-memory TOC model. */
(function registerParser(global) {
  'use strict';

  const { selectors } = global.ChatGPTNavigator;
  const MAX_TITLE_LENGTH = 72;

  function normaliseText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function titleForMessage(message, fallback) {
    const text = normaliseText(message.innerText || message.textContent);
    if (!text) return fallback;
    return text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : text;
  }

  function collectHeadings(answerElement) {
    return Array.from(answerElement.querySelectorAll(selectors.HEADING_SELECTOR)).reduce((all, element) => {
      const title = normaliseText(element.innerText || element.textContent);
      if (!title) return all;
      const level = Number(element.tagName.slice(1));
      all.push({
        title,
        level,
        element
      });
      return all;
    }, []);
  }

  /**
   * Associates assistant messages with the most recent user message in DOM order.
   * This deliberately supports zero or many assistant messages for one question.
   */
  function parseConversation() {
    const messages = selectors.getMessages();
    const results = [];
    let activeQuestion = null;

    messages.forEach((message, index) => {
      const role = selectors.getRole(message);
      if (role === 'user') {
        const identity = selectors.getMessageIdentity(message, index);
        activeQuestion = {
          messageId: identity.key,
          identityStable: identity.stable,
          questionText: titleForMessage(message, 'Untitled question'),
          questionElement: message,
          answerElements: [],
          headings: []
        };
        results.push(activeQuestion);
      } else if (role === 'assistant' && activeQuestion) {
        activeQuestion.answerElements.push(message);
        activeQuestion.headings.push(...collectHeadings(message));
      }
    });
    return results;
  }

  global.ChatGPTNavigator.parser = { parseConversation };
}(window));
