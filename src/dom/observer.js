/* global window */

/** Debounced DOM observation for ChatGPT's SPA navigation and streaming responses. */
(function registerObserver(global) {
  'use strict';

  function createConversationObserver(onChange) {
    let timeout = null;
    let lastPath = location.pathname;
    let pendingReason = null;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.target.closest?.('#chatgpt-conversation-navigator-host, [data-cgn-answer-control]')) continue;
        if (mutation.type === 'childList') {
          const changed = [...mutation.addedNodes, ...mutation.removedNodes];
          if (changed.length && changed.every((node) => node.nodeType === 1 &&
            (node.matches?.('[data-cgn-answer-control]') || node.closest?.('#chatgpt-conversation-navigator-host')))) continue;
          pendingReason = 'structure';
        } else if (!pendingReason) {
          const parent = mutation.target.parentElement;
          if (parent?.closest('[class*="MarkdownRoot"]') &&
              !parent.closest('h1, h2, h3, h4, h5, h6')) continue;
          pendingReason = 'text';
        }
      }
      if (pendingReason) schedule();
    });

    function schedule() {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        const reason = pendingReason || 'route';
        pendingReason = null;
        onChange(reason);
      }, pendingReason === 'structure' ? 100 : 180);
    }

    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    const routeTimer = window.setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        pendingReason = 'route';
        schedule();
      }
    }, 500);
    return {
      destroy() { observer.disconnect(); window.clearTimeout(timeout); window.clearInterval(routeTimer); }
    };
  }

  global.ChatGPTNavigator.observer = { createConversationObserver };
}(window));
