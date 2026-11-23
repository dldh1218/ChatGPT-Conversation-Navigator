/* global window */

/** Keeps discovered TOC metadata when ChatGPT unmounts virtualized turns. */
(function registerRegistry(global) {
  'use strict';

  function createConversationRegistry() {
    let conversationKey = location.pathname;
    let entries = [];
    let serial = 0;
    let elementIds = new WeakMap();

    function reset(nextKey) {
      conversationKey = nextKey;
      entries = [];
      serial = 0;
      elementIds = new WeakMap();
    }

    function identify(record, used) {
      const existingId = elementIds.get(record.questionElement);
      if (existingId) {
        const match = entries.find((entry) => entry.messageId === existingId);
        if (match && !used.has(match)) return match;
      }
      const candidates = entries.filter((entry) =>
        entry.identityKey === record.messageId && !used.has(entry) &&
        (!record.identityStable || entry.identityStable)
      );
      if (record.identityStable) return candidates[0] || null;
      // A fingerprint alone cannot distinguish identical questions. Reuse an
      // unmounted occurrence; never merge two simultaneously mounted turns.
      if (candidates.length === 1) return candidates[0];
      return candidates.find((entry) => !entry.questionElement?.isConnected) || null;
    }

    function update(records, nextKey) {
      if (nextKey !== conversationKey) reset(nextKey);
      const used = new Set();
      const observed = records.map((record) => {
        let entry = identify(record, used);
        if (!entry) {
          entry = {
            messageId: `cgn-${++serial}`,
            identityKey: record.messageId,
            identityStable: record.identityStable,
            questionText: record.questionText,
            headings: [],
            hasAnswer: false,
            orderKnown: false,
            questionElement: null,
            anchorElement: null,
            answerAnchorElement: null,
            answerElements: [],
            isMounted: false
          };
        }
        used.add(entry);
        elementIds.set(record.questionElement, entry.messageId);
        entry.questionText = record.questionText;
        entry.questionElement = record.questionElement;
        entry.anchorElement = global.ChatGPTNavigator.selectors.getTurnAnchor(record.questionElement);
        if (record.answerElements.length) {
          entry.answerAnchorElement = global.ChatGPTNavigator.selectors.getTurnAnchor(record.answerElements[0]);
        } else if (!entry.answerAnchorElement?.isConnected) {
          entry.answerAnchorElement = null;
        }
        entry.answerElements = record.answerElements;
        entry.hasAnswer ||= record.answerElements.length > 0;
        entry.isMounted = true;
        if (record.answerElements.length) {
          entry.headings = record.headings.map((heading, index) => ({
            id: `${entry.messageId}-heading-${index}`,
            title: heading.title,
            level: heading.level,
            element: heading.element
          }));
        } else {
          entry.headings.forEach((heading) => { heading.element = null; });
        }
        return entry;
      });

      entries.forEach((entry) => {
        if (!used.has(entry)) {
          entry.isMounted = false;
          entry.questionElement = null;
          entry.answerElements = [];
          if (!entry.anchorElement?.isConnected) entry.anchorElement = null;
          if (!entry.answerAnchorElement?.isConnected) entry.answerAnchorElement = null;
          entry.headings.forEach((heading) => { heading.element = null; });
        }
      });

      // Insert newly discovered turns beside observed neighbours. Existing
      // entries keep their order even when only a subset is mounted.
      observed.forEach((entry, index) => {
        if (entries.includes(entry) && entry.orderKnown) return;
        const previous = observed.slice(0, index).reverse().find((item) => entries.includes(item) && item.orderKnown);
        const next = observed.slice(index + 1).find((item) => entries.includes(item) && item.orderKnown);
        if (entries.includes(entry)) entries.splice(entries.indexOf(entry), 1);
        if (previous) {
          entries.splice(entries.indexOf(previous) + 1, 0, entry);
          entry.orderKnown = true;
        } else if (next) {
          entries.splice(entries.indexOf(next), 0, entry);
          entry.orderKnown = true;
        } else if (!entries.length) {
          entries.push(entry);
          entry.orderKnown = true;
        } else {
          entries.push(entry);
          entry.orderKnown = false;
        }
      });
      return entries;
    }

    return {
      update,
      getEntries: () => entries,
      stats: () => ({ discovered: entries.length, mounted: entries.filter((entry) => entry.isMounted).length })
    };
  }

  global.ChatGPTNavigator.registry = { createConversationRegistry };
}(window));
