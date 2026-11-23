/* global window */

/** Entry point: parses the current rendered conversation and refreshes the side TOC. */
(function startConversationNavigator(global) {
  'use strict';

  const app = global.ChatGPTNavigator;
  if (app.instance) app.instance.destroy();

  const registry = app.registry.createConversationRegistry();
  let navigation;
  const collapser = app.collapse.createConversationCollapser(() => navigation?.update(registry.getEntries()));
  navigation = app.navigation.createNavigation(collapser);
  let lastStats = '';
  const refresh = (reason = 'initial') => {
    const records = app.parser.parseConversation();
    const entries = registry.update(records, location.pathname);
    collapser.update(entries, location.pathname);
    navigation.update(entries, location.pathname);
    try {
      if (localStorage.getItem('cgn-debug') === '1') {
        const stats = registry.stats();
        const signature = `${location.pathname}:${stats.discovered}:${stats.mounted}`;
        if (signature !== lastStats) {
          lastStats = signature;
          console.debug('[대화 목차] Registry', { reason, ...stats, domQuestions: records.length });
        }
      }
    } catch (_) { /* Storage access is optional. */ }
  };
  const observer = app.observer.createConversationObserver(refresh);
  app.instance = { destroy() { observer.destroy(); navigation.destroy(); } };
  refresh();
}(window));
