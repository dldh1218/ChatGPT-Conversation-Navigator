/* global window */

/**
 * DOM selectors and small DOM utilities. Keeping page-specific assumptions here
 * makes ChatGPT markup changes easier to diagnose and update.
 */
(function registerSelectors(global) {
  'use strict';

  const MESSAGE_SELECTOR = '[data-message-author-role]';
  // Fallbacks for newer ChatGPT layouts which use turn-oriented test IDs.
  const TURN_SELECTOR = 'article[data-testid*="conversation-turn"], [data-testid^="conversation-turn-"]';
  // ChatGPT's current virtualized transcript does not expose message roles.
  // It uses these styling hooks for the actual user/assistant content roots.
  const MODERN_USER_SELECTOR = '[class*="group/user-message"]';
  const MODERN_ASSISTANT_SELECTOR = '[class*="MarkdownRoot"], [class*="DilResponseRoot"]';
  const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

  function getMessages() {
    const roleMessages = Array.from(document.querySelectorAll(MESSAGE_SELECTOR));
    const turns = Array.from(document.querySelectorAll(TURN_SELECTOR)).filter((element) =>
      !element.parentElement?.closest(TURN_SELECTOR) && !element.querySelector(MESSAGE_SELECTOR)
    );
    const users = Array.from(document.querySelectorAll(MODERN_USER_SELECTOR)).filter((element) =>
      !element.parentElement?.closest(MODERN_USER_SELECTOR) && !element.closest(MESSAGE_SELECTOR) &&
      !element.closest(TURN_SELECTOR)
    );
    const assistants = Array.from(document.querySelectorAll('[class*="MarkdownRoot"]')).filter((element) =>
      !element.closest(MODERN_USER_SELECTOR) && !element.closest(MESSAGE_SELECTOR) &&
      !element.closest(TURN_SELECTOR) && !element.parentElement?.closest('[class*="MarkdownRoot"]')
    );
    const messages = [...new Set([...roleMessages, ...turns, ...users, ...assistants])];
    return messages.sort((left, right) => {
      if (left === right) return 0;
      return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  }

  function getRole(message) {
    if (!message) return null;
    const explicitRole = message.getAttribute('data-message-author-role') ||
      message.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role');
    if (explicitRole) return explicitRole;

    if (message.matches(MODERN_USER_SELECTOR) || message.querySelector(MODERN_USER_SELECTOR)) return 'user';
    if (message.matches(MODERN_ASSISTANT_SELECTOR) || message.querySelector(MODERN_ASSISTANT_SELECTOR)) return 'assistant';

    const identity = [
      message.getAttribute('data-testid'),
      message.getAttribute('data-turn-id'),
      message.getAttribute('aria-label'),
      message.className,
      ...Array.from(message.querySelectorAll('[data-testid], [aria-label]')).slice(0, 12).map((node) =>
        `${node.getAttribute('data-testid') || ''} ${node.getAttribute('aria-label') || ''}`)
    ].join(' ').toLowerCase();
    if (/\b(user|human)\b/.test(identity)) return 'user';
    if (/\b(assistant|bot|model)\b/.test(identity)) return 'assistant';
    return null;
  }

  function getMessageIdentity(message, index) {
    const explicitId = message.getAttribute('data-message-id') ||
      message.getAttribute('data-turn-id') ||
      message.dataset.messageId ||
      message.closest('[data-virtualized-turn-content]')?.getAttribute('data-turn-id');
    if (explicitId) return { key: `id-${explicitId}`, stable: true };

    // Array indices change as ChatGPT virtualizes older turns. A fingerprint
    // of the visible question survives removal and recreation of its DOM node.
    const content = (message.textContent || '').replace(/\s+/g, ' ').trim();
    if (!content) return { key: `empty-message-${index}`, stable: false };
    let hash = 2166136261;
    for (let i = 0; i < content.length; i += 1) {
      hash ^= content.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return { key: `question-${(hash >>> 0).toString(36)}`, stable: false };
  }

  function getTurnAnchor(message) {
    return message.closest('[data-virtualized-turn-content], [data-testid^="conversation-turn-"], article[data-testid*="conversation-turn"]');
  }

  /**
   * Finds a useful scroll container instead of assuming window always scrolls.
   * ChatGPT has used both document and nested scroll layouts.
   */
  function getScrollContainer(element) {
    let current = element && element.parentElement;
    let nearestScrollable = null;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      if (/(auto|scroll)/.test(style.overflowY)) {
        // Keep the same container while content expands/collapses. Its current
        // scrollHeight can briefly fit the viewport during virtualization.
        nearestScrollable ||= current;
        if (current.scrollHeight > current.clientHeight) return current;
      }
      current = current.parentElement;
    }
    return nearestScrollable || document.scrollingElement || document.documentElement;
  }

  global.ChatGPTNavigator = global.ChatGPTNavigator || {};
  global.ChatGPTNavigator.selectors = {
    HEADING_SELECTOR,
    getMessages,
    getRole,
    getMessageIdentity,
    getTurnAnchor,
    getScrollContainer
  };
}(window));
