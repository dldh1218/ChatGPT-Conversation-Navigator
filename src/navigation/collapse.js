/* global window */

/** Explicit per-question display state and a compact answer control row. */
(function registerCollapser(global) {
  'use strict';

  const ATTRIBUTE = 'data-cgn-collapsed-answer';
  const ROW_ATTRIBUTE = 'data-cgn-answer-control';

  function ensureStyles() {
    if (document.getElementById('cgn-collapse-style')) return;
    const style = document.createElement('style');
    style.id = 'cgn-collapse-style';
    style.textContent = `
      [${ATTRIBUTE}="true"] { max-height:0 !important; min-height:0 !important; overflow:hidden !important;
        margin-block:0 !important; padding-block:0 !important; visibility:hidden !important; }
      [${ROW_ATTRIBUTE}] { display:flex; align-items:center; justify-content:space-between; gap:12px;
        min-height:32px; margin:4px 0 8px; padding:4px 10px; border:1px solid rgba(127,127,127,.25);
        border-radius:8px; color:#666; background:rgba(127,127,127,.06); font:12px/1.4 system-ui,sans-serif; }
      [${ROW_ATTRIBUTE}] button { border:0; border-radius:5px; padding:3px 7px;
        background:rgba(127,127,127,.12); color:inherit; cursor:pointer; font:inherit; white-space:nowrap; }
      [${ROW_ATTRIBUTE}] button:hover, [${ROW_ATTRIBUTE}] button:focus-visible { background:rgba(127,127,127,.22); }
      html.dark [${ROW_ATTRIBUTE}], body.dark [${ROW_ATTRIBUTE}] { color:#c5c5c5; }
    `;
    document.head.append(style);
  }

  function createConversationCollapser(onStateChange) {
    ensureStyles();
    let conversationKey = location.pathname;
    let entries = [];
    const expansionState = new Map();

    function debug(reason, id, expanded) {
      try {
        if (localStorage.getItem('cgn-debug') === '1') {
          console.debug('[대화 목차] 펼침 상태', { reason, id, expanded });
        }
      } catch (_) { /* Storage access is optional. */ }
    }

    function setExpanded(id, expanded, reason, notify = true) {
      if (expansionState.get(id) === expanded) return false;
      expansionState.set(id, expanded);
      debug(reason, id, expanded);
      const entry = entries.find((item) => item.messageId === id);
      if (entry) apply(entry);
      if (notify) onStateChange?.();
      return true;
    }

    function rowFor(answer, id) {
      let row = answer.previousElementSibling;
      if (!row?.hasAttribute(ROW_ATTRIBUTE)) {
        row = document.createElement('div');
        row.setAttribute(ROW_ATTRIBUTE, '');
        const label = document.createElement('span');
        const button = document.createElement('button');
        button.type = 'button';
        row.append(label, button);
        answer.before(row);
      }
      row.dataset.cgnEntryId = id;
      const expanded = expansionState.get(id) === true;
      const label = expanded ? 'ChatGPT 답변' : 'ChatGPT 답변 접힘';
      if (row.firstElementChild.textContent !== label) row.firstElementChild.textContent = label;
      const button = row.lastElementChild;
      const buttonLabel = expanded ? '접기' : '펼치기';
      if (button.textContent !== buttonLabel) button.textContent = buttonLabel;
      button.setAttribute('aria-expanded', String(expanded));
      button.onclick = () => setExpanded(row.dataset.cgnEntryId, !expansionState.get(row.dataset.cgnEntryId), '개별 버튼');
    }

    function apply(entry) {
      const expanded = expansionState.get(entry.messageId) === true;
      entry.answerElements.forEach((answer) => {
        if (!answer.isConnected) return;
        rowFor(answer, entry.messageId);
        if (expanded && answer.hasAttribute(ATTRIBUTE)) answer.removeAttribute(ATTRIBUTE);
        else if (!expanded && !answer.hasAttribute(ATTRIBUTE)) answer.setAttribute(ATTRIBUTE, 'true');
      });
    }

    return {
      update(nextEntries, nextKey) {
        if (nextKey !== conversationKey) {
          entries.forEach((entry) => entry.answerElements.forEach((answer) => {
            answer.removeAttribute(ATTRIBUTE);
            if (answer.previousElementSibling?.hasAttribute(ROW_ATTRIBUTE)) answer.previousElementSibling.remove();
          }));
          expansionState.clear();
          conversationKey = nextKey;
        }
        entries = nextEntries;
        entries.forEach((entry) => {
          if (!expansionState.has(entry.messageId)) {
            expansionState.set(entry.messageId, false);
            debug('새 질문 기본값', entry.messageId, false);
          }
          apply(entry);
        });
      },
      expand(id) { setExpanded(id, true, '목차 이동'); },
      toggle(id) { setExpanded(id, !expansionState.get(id), '목차 버튼'); },
      collapseAll() {
        let changed = false;
        entries.forEach((entry) => { changed = setExpanded(entry.messageId, false, '모두 접기', false) || changed; });
        if (changed) onStateChange?.();
      },
      expandAll() {
        let changed = false;
        entries.forEach((entry) => { changed = setExpanded(entry.messageId, true, '모두 펼치기', false) || changed; });
        if (changed) onStateChange?.();
      },
      isExpanded(id) { return expansionState.get(id) === true; },
      destroy() {
        entries.forEach((entry) => entry.answerElements.forEach((answer) => {
          answer.removeAttribute(ATTRIBUTE);
          if (answer.previousElementSibling?.hasAttribute(ROW_ATTRIBUTE)) answer.previousElementSibling.remove();
        }));
        document.getElementById('cgn-collapse-style')?.remove();
      }
    };
  }

  global.ChatGPTNavigator.collapse = { createConversationCollapser };
}(window));
