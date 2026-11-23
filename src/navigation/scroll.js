/* global window */

/** Provides safe, offset-aware navigation without modifying ChatGPT's own scroll behavior. */
(function registerScroll(global) {
  'use strict';

  const { selectors } = global.ChatGPTNavigator;
  function getDesiredTop(element) {
    const container = selectors.getScrollContainer(element);
    const isDocument = container === document.scrollingElement || container === document.documentElement;
    const viewportHeight = isDocument ? window.innerHeight : container.clientHeight;
    // Leave enough context above the heading for fixed headers and late
    // virtualizer adjustments, while keeping it inside smaller viewports.
    const inset = Math.max(32, Math.min(160, Math.max(96, viewportHeight * 0.2), viewportHeight - 48));
    return (isDocument ? 0 : container.getBoundingClientRect().top) + inset;
  }

  function highlight(element) {
    if (typeof element.animate === 'function') {
      element.animate([
        { boxShadow: '0 0 0 0 rgba(22, 131, 223, 0)', backgroundColor: 'rgba(22, 131, 223, 0)' },
        { boxShadow: '0 0 0 3px rgba(22, 131, 223, .6)', backgroundColor: 'rgba(22, 131, 223, .12)', offset: 0.25 },
        { boxShadow: '0 0 0 0 rgba(22, 131, 223, 0)', backgroundColor: 'rgba(22, 131, 223, 0)' }
      ], { duration: 1400, easing: 'ease-out' });
    }
  }

  function scrollToElement(element, shouldHighlight = true) {
    if (!element || !element.isConnected || !element.getClientRects().length) return false;
    const container = selectors.getScrollContainer(element);
    const top = element.getBoundingClientRect().top;
    const distance = top - getDesiredTop(element);
    const isDocument = container === document.scrollingElement || container === document.documentElement;
    if (isDocument) {
      window.scrollBy({ top: distance, behavior: 'instant' });
    } else {
      container.scrollBy({ top: distance, behavior: 'instant' });
    }
    if (shouldHighlight) highlight(element);
    return true;
  }

  global.ChatGPTNavigator.scroll = { scrollToElement, getDesiredTop };
}(window));
