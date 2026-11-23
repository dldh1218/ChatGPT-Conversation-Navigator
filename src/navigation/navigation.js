/* global chrome, window */

/** Renders the isolated in-page navigation panel and updates it incrementally. */
(function registerNavigation(global) {
  'use strict';

  const { scroll, activeHeading } = global.ChatGPTNavigator;
  const PANEL_ID = 'chatgpt-conversation-navigator-host';

  function createNavigation(collapser) {
    const oldHost = document.getElementById(PANEL_ID);
    if (oldHost) oldHost.remove();

    const host = document.createElement('aside');
    host.id = PANEL_ID;
    host.setAttribute('aria-label', 'Conversation table of contents');
    const shadow = host.attachShadow({ mode: 'open' });
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('src/styles/navigation.css');
    shadow.append(link);

    const panel = document.createElement('section');
    panel.className = 'cgn-panel';
    panel.innerHTML = `
      <header class="cgn-header"><span>대화 목차</span><button class="cgn-close" type="button" title="목차 닫기" aria-label="목차 닫기">×</button></header>
      <div class="cgn-actions"><button type="button" class="cgn-collapse">모두 접기</button><button type="button" class="cgn-expand">모두 펼치기</button></div>
      <nav class="cgn-list" aria-label="대화 목차"></nav>
      <div class="cgn-resize-grip" title="크기 조절" aria-hidden="true"></div>`;
    shadow.append(panel);
    // The panel is rendered in Shadow DOM, but its host must still be attached
    // to the page document for the fixed-position UI to become visible.
    document.body.append(host);

    let records = [];
    let collapsed = new Set();
    let activeButton = null;
    let navigationToken = 0;
    let stopNavigation = null;
    let conversationKey = location.pathname;
    const list = panel.querySelector('.cgn-list');
    const groups = new Map();
    const notice = document.createElement('p');
    notice.className = 'cgn-notice';
    notice.setAttribute('role', 'status');
    panel.insertBefore(notice, list);
    const tracker = activeHeading.createActiveTracker(setActive);

    function syncTheme() {
      const dark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');
      host.dataset.cgnTheme = dark ? 'dark' : 'light';
    }

    const themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    panel.querySelector('.cgn-close').addEventListener('click', () => destroy());
    panel.querySelector('.cgn-collapse').addEventListener('click', () => {
      collapsed = new Set(records.map((record) => record.messageId));
      collapser.collapseAll();
      render();
    });
    panel.querySelector('.cgn-expand').addEventListener('click', () => {
      collapsed.clear();
      collapser.expandAll();
      render();
    });

    function clamp(value, minimum, maximum) {
      return Math.min(Math.max(value, minimum), maximum);
    }

    function beginDrag(event) {
      if (event.button !== 0 || event.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      panel.classList.add('is-moving');
      panel.style.right = 'auto';
      panel.setPointerCapture(event.pointerId);
      const move = (moveEvent) => {
        const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
        const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
        panel.style.left = `${clamp(moveEvent.clientX - offsetX, 8, maxLeft)}px`;
        panel.style.top = `${clamp(moveEvent.clientY - offsetY, 8, maxTop)}px`;
      };
      const end = () => {
        panel.classList.remove('is-moving');
        panel.removeEventListener('pointermove', move);
        panel.removeEventListener('pointerup', end);
        panel.removeEventListener('pointercancel', end);
      };
      panel.addEventListener('pointermove', move);
      panel.addEventListener('pointerup', end);
      panel.addEventListener('pointercancel', end);
    }

    function beginResize(event) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = panel.getBoundingClientRect();
      const originX = event.clientX;
      const originY = event.clientY;
      panel.classList.add('is-resizing');
      panel.setPointerCapture(event.pointerId);
      const move = (moveEvent) => {
        const maxWidth = window.innerWidth - rect.left - 8;
        const maxHeight = window.innerHeight - rect.top - 8;
        panel.style.width = `${clamp(rect.width + moveEvent.clientX - originX, 220, maxWidth)}px`;
        panel.style.height = `${clamp(rect.height + moveEvent.clientY - originY, 130, maxHeight)}px`;
      };
      const end = () => {
        panel.classList.remove('is-resizing');
        panel.removeEventListener('pointermove', move);
        panel.removeEventListener('pointerup', end);
        panel.removeEventListener('pointercancel', end);
      };
      panel.addEventListener('pointermove', move);
      panel.addEventListener('pointerup', end);
      panel.addEventListener('pointercancel', end);
    }

    panel.querySelector('.cgn-header').addEventListener('pointerdown', beginDrag);
    panel.querySelector('.cgn-resize-grip').addEventListener('pointerdown', beginResize);

    function button(label, className, id, depth, onNavigate) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = className;
      item.dataset.targetId = id;
      item.style.setProperty('--cgn-depth', String(Math.max(0, depth)));
      item.title = label;
      item.textContent = label;
      item.addEventListener('click', onNavigate);
      return item;
    }

    function navigateById(entryId, headingId) {
      const record = records.find((item) => item.messageId === entryId);
      const target = headingId
        ? record?.headings.find((heading) => heading.id === headingId)?.element
        : record?.questionElement;
      if (!record) return;
      if (!target?.isConnected) {
        const anchor = headingId
          ? record.answerAnchorElement || record.anchorElement
          : record.anchorElement;
        if (anchor?.isConnected && anchor.getClientRects().length) {
          revealFromAnchor(entryId, headingId, anchor);
          return;
        }
        notice.textContent = '현재 화면에 이 대화의 위치 정보가 없어 이동할 수 없어요. 해당 부분이 다시 렌더링되면 이동할 수 있습니다.';
        return;
      }
      notice.textContent = '';
      revealAndScroll(record, target, headingId || `q-${entryId}`);
    }

    function revealFromAnchor(entryId, headingId, anchor) {
      cancelNavigation();
      const token = navigationToken;
      notice.textContent = '대화 내용을 불러오는 중…';
      scroll.scrollToElement(anchor, false);
      let attempts = 0;
      const userMoved = () => {
        cancelNavigation();
        notice.textContent = '사용자 조작으로 이동을 취소했어요.';
      };
      const inputEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
      inputEvents.forEach((type) => document.addEventListener(type, userMoved, { capture: true, passive: true }));
      const timer = window.setInterval(() => {
        if (token !== navigationToken) return;
        const current = records.find((entry) => entry.messageId === entryId);
        const target = headingId
          ? current?.headings.find((heading) => heading.id === headingId)?.element
          : current?.questionElement;
        if (target?.isConnected) {
          notice.textContent = '';
          revealAndScroll(current, target, headingId || `q-${entryId}`);
        } else if (++attempts >= 20 || !anchor.isConnected) {
          cancelNavigation();
          notice.textContent = '대화가 다시 렌더링되지 않아 이동하지 못했어요.';
        }
      }, 100);
      stopNavigation = () => {
        window.clearInterval(timer);
        inputEvents.forEach((type) => document.removeEventListener(type, userMoved, true));
      };
    }

    function cancelNavigation() {
      navigationToken += 1;
      if (stopNavigation) stopNavigation();
      stopNavigation = null;
    }

    function revealAndScroll(record, target, targetId) {
      cancelNavigation();
      const token = navigationToken;
      collapser.expand(record.messageId);

      const resolveTarget = () => {
        const current = records.find((item) => item.messageId === record.messageId);
        if (current) {
          if (targetId === `q-${record.messageId}`) return current.questionElement;
          return current.headings.find((heading) => heading.id === targetId)?.element || null;
        }
        return target.isConnected ? target : null;
      };
      const timers = [];
      const userMoved = () => cancelNavigation();
      const inputEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
      inputEvents.forEach((type) => document.addEventListener(type, userMoved, { capture: true, passive: true }));
      stopNavigation = () => {
        timers.forEach((timer) => window.clearTimeout(timer));
        inputEvents.forEach((type) => document.removeEventListener(type, userMoved, true));
      };

      const align = (first) => {
        if (token !== navigationToken) return;
        const element = resolveTarget();
        if (!element || !element.isConnected || !element.getClientRects().length) return;
        const desiredTop = scroll.getDesiredTop(element);
        if (first || Math.abs(element.getBoundingClientRect().top - desiredTop) > 18) {
          scroll.scrollToElement(element, first);
        }
      };

      // The first alignment follows layout. Later checks compensate for the
      // virtualizer remeasuring turns; direct user input cancels all checks.
      window.requestAnimationFrame(() => {
        if (token !== navigationToken) return;
        align(true);
        [80, 180, 360, 650, 1000, 1600, 2400].forEach((delay, index, delays) => {
          timers.push(window.setTimeout(() => {
            align(false);
            if (index === delays.length - 1 && token === navigationToken) {
              stopNavigation?.();
              stopNavigation = null;
            }
          }, delay));
        });
      });
    }

    function getGroup(entry) {
      if (groups.has(entry.messageId)) return groups.get(entry.messageId);
      const group = document.createElement('section');
      group.className = 'cgn-question-group';
      const toggle = button('▾', 'cgn-toggle', '', 0, () => {
        if (collapsed.has(entry.messageId)) collapsed.delete(entry.messageId);
        else collapsed.add(entry.messageId);
        render();
      });
      toggle.setAttribute('aria-label', '하위 제목 접기 또는 펼치기');
      const question = button(entry.questionText, 'cgn-question', `q-${entry.messageId}`, 0,
        () => navigateById(entry.messageId, null));
      const stateButton = button('펼치기', 'cgn-answer-toggle', '', 0, () => collapser.toggle(entry.messageId));
      const headings = document.createElement('div');
      headings.className = 'cgn-headings';
      group.append(toggle, question, stateButton, headings);
      const groupState = { group, toggle, question, stateButton, headings, headingButtons: new Map() };
      groups.set(entry.messageId, groupState);
      return groupState;
    }

    function updateGroup(entry, state) {
      const { group, toggle, question, stateButton, headings, headingButtons } = state;
      const label = entry.orderKnown ? entry.questionText : `순서 미확인 · ${entry.questionText}`;
      if (question.textContent !== label) question.textContent = label;
      question.title = entry.isMounted ? entry.questionText : `${entry.questionText} — 현재 화면에 없음`;
      if (!entry.orderKnown) question.title += ' (다른 항목과의 순서 미확인)';
      question.dataset.mounted = String(entry.isMounted);
      question.dataset.orderKnown = String(entry.orderKnown);
      question.dataset.collapsed = String(!collapser.isExpanded(entry.messageId));
      const answerLabel = collapser.isExpanded(entry.messageId) ? '답변 접기' : '답변 펼치기';
      if (stateButton.textContent !== answerLabel) stateButton.textContent = answerLabel;
      stateButton.setAttribute('aria-expanded', String(collapser.isExpanded(entry.messageId)));
      stateButton.hidden = !entry.hasAnswer;
      toggle.hidden = !entry.headings.length;
      toggle.textContent = collapsed.has(entry.messageId) ? '▸' : '▾';
      headings.hidden = collapsed.has(entry.messageId);
      const validIds = new Set(entry.headings.map((heading) => heading.id));
      for (const [id, headingButton] of headingButtons) {
        if (!validIds.has(id)) { headingButton.remove(); headingButtons.delete(id); }
      }
      entry.headings.forEach((heading, index) => {
        let headingButton = headingButtons.get(heading.id);
        if (!headingButton) {
          headingButton = button(heading.title, 'cgn-heading', heading.id, heading.level - 1,
            () => navigateById(entry.messageId, heading.id));
          headingButtons.set(heading.id, headingButton);
        }
        if (headingButton.textContent !== heading.title) headingButton.textContent = heading.title;
        headingButton.title = heading.element?.isConnected ? heading.title : `${heading.title} — 현재 화면에 없음`;
        headingButton.dataset.mounted = String(Boolean(heading.element?.isConnected));
        headingButton.style.setProperty('--cgn-depth', String(heading.level - 1));
        if (headings.children[index] !== headingButton) headings.insertBefore(headingButton, headings.children[index] || null);
      });
      return group;
    }

    function render() {
      syncTheme();
      const oldScrollTop = list.scrollTop;
      const validIds = new Set(records.map((entry) => entry.messageId));
      for (const [id, state] of groups) {
        if (!validIds.has(id)) { state.group.remove(); groups.delete(id); collapsed.delete(id); }
      }
      records.forEach((entry, index) => {
        const group = updateGroup(entry, getGroup(entry));
        if (list.children[index] !== group) list.insertBefore(group, list.children[index] || null);
      });
      if (!records.length && !list.querySelector('.cgn-empty')) {
        const empty = document.createElement('p');
        empty.className = 'cgn-empty';
        empty.textContent = '이 대화에서 질문 메시지를 찾지 못했어요.';
        list.append(empty);
      } else if (records.length) list.querySelector('.cgn-empty')?.remove();
      list.scrollTop = oldScrollTop;
      tracker.setTargets(records.flatMap((entry) => [
        { id: `q-${entry.messageId}`, element: entry.questionElement },
        ...(!collapsed.has(entry.messageId) ? entry.headings.map((heading) => ({ id: heading.id, element: heading.element })) : [])
      ]));
    }

    function setActive(id) {
      const next = list.querySelector(`[data-target-id="${CSS.escape(id)}"]`);
      if (next === activeButton) return;
      if (activeButton) activeButton.classList.remove('is-active');
      activeButton = next;
      if (activeButton) {
        activeButton.classList.add('is-active');
        // `scrollIntoView` can also scroll ChatGPT's transcript behind this
        // fixed panel. Restrict the adjustment to the TOC's own scroll area.
        const buttonTop = activeButton.offsetTop;
        const buttonBottom = buttonTop + activeButton.offsetHeight;
        if (buttonTop < list.scrollTop) list.scrollTop = buttonTop;
        else if (buttonBottom > list.scrollTop + list.clientHeight) list.scrollTop = buttonBottom - list.clientHeight;
      }
    }

    return {
      update(nextRecords, nextKey = location.pathname) {
        if (nextKey !== conversationKey) {
          cancelNavigation();
          groups.forEach((state) => state.group.remove());
          groups.clear();
          collapsed.clear();
          activeButton = null;
          notice.textContent = '';
          conversationKey = nextKey;
        }
        records = nextRecords;
        render();
      },
      destroy
    };

    function destroy() {
      cancelNavigation();
      tracker.destroy();
      themeObserver.disconnect();
      collapser.destroy();
      host.remove();
    }
  }

  global.ChatGPTNavigator.navigation = { createNavigation };
}(window));
