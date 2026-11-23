/* global window */

/** Watches reading position and reports the nearest currently visible TOC target. */
(function registerActiveHeading(global) {
  'use strict';

  function createActiveTracker(onActiveChange) {
    let targets = [];
    let activeId = null;
    let frame = null;

    function update() {
      frame = null;
      const visible = targets.filter((target) =>
        target.element && target.element.isConnected &&
        target.element.getClientRects().length &&
        !target.element.closest('[data-cgn-collapsed-answer="true"]')
      );
      if (!visible.length) return;
      const candidates = visible.map((target) => ({
        target,
        top: target.element.getBoundingClientRect().top
      }));
      const readingLine = global.ChatGPTNavigator.scroll.getDesiredTop(visible[0].element) + 16;
      const above = candidates.filter((item) => item.top <= readingLine);
      const current = (above.length ? above[above.length - 1] : candidates[0]).target;
      if (current.id !== activeId) {
        activeId = current.id;
        onActiveChange(activeId);
      }
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }

    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule, { passive: true });

    return {
      setTargets(nextTargets) {
        targets = nextTargets;
        schedule();
      },
      destroy() {
        window.removeEventListener('scroll', schedule, true);
        window.removeEventListener('resize', schedule);
        if (frame) window.cancelAnimationFrame(frame);
      }
    };
  }

  global.ChatGPTNavigator.activeHeading = { createActiveTracker };
}(window));
