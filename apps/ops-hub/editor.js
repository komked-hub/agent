(() => {
  const $ = id => document.getElementById(id);
  const selection = $('layoutPage');
  const editor = $('layoutFields');
  const preview = $('layoutPreview');
  const form = $('layoutForm');
  const pages = {};
  const drafts = new Map();
  let administrator = false;
  let settingsReady = false;
  let saving = false;
  let template = '';

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function button(label, className = 'secondary') {
    const node = element('button', label, className);
    node.type = 'button';
    return node;
  }

  async function api(path, payload) {
    const isRead = payload === undefined;
    const response = await fetch('/api/site/' + path, {
      method: isRead ? 'GET' : 'POST',
      headers: isRead ? {} : { 'Content-Type': 'application/json' },
      body: isRead ? undefined : JSON.stringify(payload),
      cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'load_failed');
    return result;
  }

  function applyPage(page, layout) {
    const view = document.querySelector('[data-view="' + page + '"]');
    const nav = document.querySelector('[data-page="' + page + '"] [data-page-label]');
    nav.textContent = layout.nav;
    const heading = view.querySelector('.page-head h1');
    heading.textContent = layout.heading;
    const description = view.querySelector('.page-head p');
    description.textContent = layout.description;
    description.hidden = !layout.description;

    for (const [key, items] of Object.entries(layout.groups)) {
      const group = view.querySelector('[data-layout="' + key + '"]');
      const blocks = new Map([...group.children].map(block => [block.dataset.module, block]));
      for (const item of items) {
        const block = blocks.get(item.id);
        if (!block) continue;
        if (item.title !== null) {
          const title = block.querySelector('h2, .stat-label, .panel-title');
          if (title) title.textContent = item.title;
        }
        block.hidden = !item.visible;
        group.append(block);
      }
    }
    let notes = view.querySelector('.page-notes');
    if (!notes) {
      notes = element('div', undefined, 'grid page-notes');
      view.append(notes);
    }
    notes.replaceChildren(...layout.notes.map(note => {
      const card = element('section', undefined, 'card module-card editor-note');
      if (note.title) card.append(element('h2', note.title));
      if (note.body) card.append(element('p', note.body, 'workspace-body'));
      return card;
    }));
    notes.hidden = !layout.notes.length;

    if (page === 'communication') {
      $('messageBodyLabel').textContent = layout.message.field;
      $('messageBody').placeholder = layout.message.placeholder;
      $('postMessageAction').textContent = layout.message.action;
      template = layout.message.template;
      $('useMessageTemplate').hidden = !template;
    }

    if (nav.closest('button').getAttribute('aria-current') === 'page') {
      $('crumbPage').textContent = layout.nav;
      document.title = layout.nav + ' · KOMKED';
    }
  }

  $('useMessageTemplate').addEventListener('click', () => {
    if (!template) return;
    const input = $('messageBody');
    const insert = input.value ? '\n\n' + template : template;
    const remaining = input.maxLength - input.value.length;
    if (insert.length > remaining) {
      notify('메시지 길이 제한에 맞게 내용을 줄여 주세요.');
      return;
    }
    input.value += insert;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });

  function currentDraft() {
    const page = selection.value;
    if (!drafts.has(page)) drafts.set(page, structuredClone(pages[page]?.settings || defaultPageLayout(page)));
    return drafts.get(page);
  }

  function drawPreview(changed = true) {
    const page = selection.value;
    const layout = normalizedPageLayout(page, currentDraft());
    const shell = element('div', undefined, 'editor-live-shell');
    const top = element('div', undefined, 'editor-live-topbar');
    top.append(element('strong', 'KOMKED'), element('span', '/ ' + layout.nav, 'workspace-meta'));
    const header = element('header', undefined, 'editor-live-header');
    header.append(element('h3', layout.heading));
    if (layout.description) header.append(element('p', layout.description));
    shell.append(top, header);
    for (const [group, items] of Object.entries(layout.groups)) {
      const section = element('section', undefined, 'editor-live-group');
      section.append(element('h4', editorPages[page].groups[group].label));
      const list = element('div', undefined, 'editor-live-cards');
      for (const item of items) {
        const card = element('article', undefined, 'editor-live-card' + (item.visible ? '' : ' editor-muted'));
        card.append(element('strong', item.title || editorItemLabels[item.id]),
          element('span', item.visible ? '표시 중' : '숨김', 'workspace-meta'));
        list.append(card);
      }
      section.append(list);
      shell.append(section);
    }
    for (const note of layout.notes) {
      const card = element('article', undefined, 'editor-live-card editor-live-note');
      if (note.title) card.append(element('strong', note.title));
      if (note.body) card.append(element('p', note.body, 'workspace-body'));
      shell.append(card);
    }
    if (layout.message) {
      const composer = element('section', undefined, 'editor-live-card');
      composer.append(element('strong', layout.message.field), element('p', layout.message.template || layout.message.placeholder || '', 'workspace-body'));
      composer.append(element('span', layout.message.action, 'pill info'));
      shell.append(composer);
    }
    preview.replaceChildren(shell);
    if (changed) {
      const previous = pages[page]?.settings ?? defaultPageLayout(page);
      $('layoutSaveStatus').textContent = JSON.stringify(layout) === JSON.stringify(previous)
        ? '' : '미리보기입니다. 저장하면 페이지에 반영됩니다.';
    }
  }

  function field(label, value, callback, { multiline = false, maxLength = 80 } = {}) {
    const wrapper = element('label', label, 'editor-field');
    const input = element(multiline ? 'textarea' : 'input');
    if (multiline) input.rows = 3;
    input.value = value ?? '';
    input.maxLength = maxLength;
    input.addEventListener('input', () => {
      callback(input.value);
      drawPreview();
    });
    wrapper.append(input);
    return wrapper;
  }

  function drawEditor() {
    const page = selection.value;
    $('financeFilenameEditor').hidden = page !== 'finance';
    const layout = currentDraft();
    editor.replaceChildren(
      field('메뉴 이름', layout.nav, value => { layout.nav = value; }),
      field('페이지 제목', layout.heading, value => { layout.heading = value; }),
      field('페이지 안내 문구', layout.description, value => { layout.description = value; }, { maxLength: 220 }),
    );
    for (const [group, items] of Object.entries(layout.groups)) {
      const section = element('fieldset');
      section.append(element('legend', editorPages[page].groups[group].label));
      items.forEach((item, index) => {
        const row = element('div', undefined, 'editor-module-row');
        const caption = item.title ?? editorItemLabels[item.id];
        if (item.title !== null) row.append(field('카드 ' + (index + 1) + ' 제목', item.title, value => { item.title = value; }));
        else row.append(element('strong', caption));
        const controls = element('div', undefined, 'editor-module-actions');
        const visible = element('label', undefined, 'editor-checkbox');
        const checkbox = element('input');
        checkbox.type = 'checkbox';
        checkbox.checked = item.visible;
        checkbox.setAttribute('aria-label', caption + ' 표시');
        checkbox.addEventListener('change', () => {
          item.visible = checkbox.checked;
          drawPreview();
        });
        visible.append(checkbox, document.createTextNode('표시'));
        controls.append(visible);
        for (const [label, shift] of [['위', -1], ['아래', 1]]) {
          const move = button(label);
          move.disabled = index + shift < 0 || index + shift >= items.length;
          move.setAttribute('aria-label', caption + ' ' + label + '로 이동');
          move.dataset.move = group + ':' + item.id + ':' + label;
          move.addEventListener('click', () => {
            const other = index + shift;
            [items[index], items[other]] = [items[other], items[index]];
            drawEditor();
            const target = [...editor.querySelectorAll('[data-move]')].find(control => control.dataset.move === move.dataset.move);
            (target?.disabled ? target.parentElement.querySelector('input') : target)?.focus();
          });
          controls.append(move);
        }
        row.append(controls);
        section.append(row);
      });
      editor.append(section);
    }

    if (layout.message) {
      const section = element('fieldset');
      section.append(element('legend', '메시지 작성 방식'));
      for (const [key, label, max, multiline] of [
        ['field', '입력란 이름', 80, false], ['placeholder', '입력 예시', 180, false],
        ['action', '게시 버튼 문구', 80, false], ['template', '작성 템플릿', 1000, true],
      ]) {
        section.append(field(label, layout.message[key], value => { layout.message[key] = value; }, { multiline, maxLength: max }));
      }
      editor.append(section);
    }

    const notes = element('fieldset');
    notes.append(element('legend', '안내 카드'));
    layout.notes.forEach((note, index) => {
      const row = element('div', undefined, 'editor-note-row');
      row.append(field('카드 제목', note.title, value => { note.title = value; }));
      row.append(field('카드 내용', note.body, value => { note.body = value; }, { multiline: true, maxLength: 1000 }));
      const remove = button('카드 제거');
      remove.addEventListener('click', () => {
        layout.notes.splice(index, 1);
        drawEditor();
        $('addLayoutNote').focus();
      });
      row.append(remove);
      notes.append(row);
    });
    const add = button('안내 카드 추가');
    add.id = 'addLayoutNote';
    add.disabled = layout.notes.length >= 8;
    add.addEventListener('click', () => {
      layout.notes.push({ title: '', body: '' });
      drawEditor();
      editor.querySelector('.editor-note-row:last-of-type input')?.focus();
    });
    notes.append(add);
    editor.append(notes);
    drawPreview();
  }

  selection.addEventListener('change', () => {
    $('layoutError').textContent = '';
    drawEditor();
  });
  $('resetLayout').addEventListener('click', () => {
    drafts.set(selection.value, defaultPageLayout(selection.value));
    drawEditor();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!settingsReady || !administrator || saving) return;
    const page = selection.value;
    const settings = normalizedPageLayout(page, currentDraft());
    const error = $('layoutError');
    error.textContent = '';
    saving = true;
    const controls = [selection, ...form.elements].filter(control => !control.disabled);
    controls.forEach(control => { control.disabled = true; });
    try {
      const result = await api('layouts', { page, settings, version: pages[page]?.version ?? 0 });
      pages[page] = result;
      drafts.delete(page);
      applyPage(page, result.settings);
      drawEditor();
      $('layoutSaveStatus').textContent = '저장했어요. 다른 기기에서도 같은 구성이 표시됩니다.';
    } catch (failure) {
      error.textContent = failure.message === 'version_conflict'
        ? '이 페이지가 다른 기기에서 변경됐어요. 화면을 새로고침해 최신 구성을 확인해 주세요.'
        : '저장하지 못했어요. 연결과 관리 권한을 확인해 주세요.';
    } finally {
      controls.forEach(control => { control.disabled = false; });
      saving = false;
    }
  });

  const metricDialog = $('channelMetricDialog');
  const metricForm = $('channelMetricForm');
  const metricChannel = $('metricChannel');
  const metricDay = $('metricDay');
  const channelHistory = $('channelHistory');
  const numbers = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
  const dates = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium' });
  const formatDate = day => dates.format(new Date(day + 'T00:00:00+09:00'));
  let sheetRecords = [];
  let manualRecords = [];
  let sourceStatus = [];
  let sourceLoading = false;
  let metricsLoaded = false;
  let manualFailed = false;
  let pageSize = 25;
  let channelUpdatedAt;

  function cardRecords() {
    return [...manualRecords, ...sheetRecords].sort((a, b) => b.day.localeCompare(a.day) ||
      Number(b.source === 'manual') - Number(a.source === 'manual'));
  }

  function formatMetric(value, key) {
    return numbers.format(value) + (key.endsWith('Rate') ? '%' : '');
  }

  function renderChannels() {
    const records = cardRecords();
    for (const [key, channel] of Object.entries(channelMetrics)) {
      const card = document.querySelector('[data-channel-values="' + key + '"]');
      const candidates = records.filter(record => record.channel === key);
      const definition = element('dl', undefined, 'channel-metrics');
      for (const [metric, label] of Object.entries(channel.metrics)) {
        const row = element('div');
        const match = candidates.find(record => Number.isFinite(record.values[metric]));
        row.append(element('dt', label), element('dd', match ? formatMetric(match.values[metric], metric) : '—'));
        if (match) {
          const metadata = formatDate(match.day) + (match.period ? ' · ' + match.period : '');
          row.append(element('span', metadata + ' · ' + (match.source === 'manual' ? '직접 기록' : 'Google Sheets'), 'workspace-meta'));
          const prior = candidates.find(record => record.day < match.day && Number.isFinite(record.values[metric]));
          if (prior && ['subscribers', 'followers', 'posts'].includes(metric)) {
            const delta = match.values[metric] - prior.values[metric];
            row.append(element('small', '직전 기록 대비 ' + (delta > 0 ? '+' : '') + numbers.format(delta), 'channel-change'));
          }
        }
        definition.append(row);
      }
      card.replaceChildren(definition);
    }

    const selected = $('channelFilter').value;
    const shown = records.filter(row => !selected || row.channel === selected);
    channelHistory.replaceChildren();
    if (!shown.length) {
      channelHistory.append(element('p', sourceLoading ? '원본 기록을 불러오는 중…' : '표시할 기록이 없습니다.', 'workspace-empty'));
    } else {
      const list = element('ul', undefined, 'workspace-list channel-history');
      for (const record of shown.slice(0, pageSize)) {
        const channel = channelMetrics[record.channel];
        const row = element('li');
        const head = element('div', undefined, 'channel-record-head');
        head.append(element('strong', channel.label + ' · ' + formatDate(record.day)));
        const source = record.source === 'manual' ? '직접 기록' : 'Google Sheets';
        head.append(element('span', record.period ? source + ' · ' + record.period : source, 'workspace-meta'));
        if (administrator && record.source === 'manual') {
          const edit = button('수정');
          edit.addEventListener('click', () => openMetric(record));
          head.append(edit);
        }
        row.append(head, element('p', Object.entries(channel.metrics)
          .filter(([key]) => Number.isFinite(record.values[key]))
          .map(([key, label]) => label + ' ' + formatMetric(record.values[key], key)).join(' · '), 'workspace-empty'));
        list.append(row);
      }
      channelHistory.append(list);
      if (shown.length > pageSize) {
        const more = button('이전 기록 더 보기');
        more.addEventListener('click', () => { pageSize += 25; renderChannels(); });
        channelHistory.append(more);
      }
    }
    $('reloadChannels').disabled = sourceLoading;
    const status = $('channelStatus');
    if (sourceLoading) status.textContent = 'Google Sheets 기록을 불러오는 중…';
    else if (sourceStatus.some(item => item.status !== 'ok')) {
      status.textContent = sheetRecords.length
        ? '시트 일부를 불러오지 못했어요. 표시된 기록의 기준일을 확인하세요.'
        : '시트 기록을 불러오지 못했어요. 원본 접근 권한을 확인해 주세요.';
      if (sourceStatus.some(item => ['sign_in_required', 'reauthentication_required'].includes(item.code))) {
        const signIn = element('a', 'Google Sheets 연결 확인', 'source-link');
        signIn.href = '/signin-with-chatgpt?return_to=' + encodeURIComponent('/#channels');
        signIn.target = '_top';
        status.append(' ', signIn);
      }
    } else if (metricsLoaded) {
      status.textContent = manualFailed
        ? 'Google Sheets 기록만 표시 중입니다. 직접 기록을 불러오지 못했어요.'
        : '매시간 자동 업데이트 · 최근 ' + new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }).format(channelUpdatedAt || new Date()) + ' 갱신';
    }
  }

  async function loadChannels() {
    if (sourceLoading) return;
    sourceLoading = true;
    renderChannels();
    const [sheet, manual] = await Promise.allSettled([api('channel-source', {}), api('channels')]);
    if (sheet.status === 'fulfilled') {
      const value = sheet.value;
      sourceStatus = value.sources;
      sheetRecords = value.records;
    } else {
      sourceStatus = [{ status: 'error', code: sheet.reason.message }];
    }
    if (manual.status === 'fulfilled') {
      manualRecords = manual.value.records;
      manualFailed = false;
    } else manualFailed = true;
    sourceLoading = false;
    metricsLoaded = true;
    channelUpdatedAt = new Date();
    renderChannels();
  }

  function renderMetricFields(values) {
    const channel = channelMetrics[metricChannel.value];
    $('metricFields').replaceChildren(...Object.entries(channel.metrics).map(([key, label]) => {
      const control = element('label', label);
      const input = element('input');
      input.type = 'number';
      input.min = '0';
      input.name = key;
      input.inputMode = key.endsWith('Rate') ? 'decimal' : 'numeric';
      input.step = key.endsWith('Rate') ? '0.01' : '1';
      input.max = key.endsWith('Rate') ? '100' : String(Number.MAX_SAFE_INTEGER);
      input.value = values?.[key] ?? '';
      control.append(input);
      return control;
    }));
  }

  function openMetric(record) {
    if (!administrator) return;
    metricForm.reset();
    metricChannel.disabled = Boolean(record);
    metricDay.readOnly = Boolean(record);
    metricChannel.value = record?.channel || $('channelFilter').value || 'youtube';
    metricDay.value = record?.day || window.komkedClock.today();
    $('metricPeriod').value = record?.period || '';
    $('metricError').textContent = '';
    renderMetricFields(record?.values);
    metricDialog.showModal();
  }

  $('addChannelMetric').addEventListener('click', () => openMetric());
  $('cancelMetric').addEventListener('click', () => metricDialog.close());
  metricChannel.addEventListener('change', () => renderMetricFields());
  $('channelFilter').addEventListener('change', () => { pageSize = 25; renderChannels(); });
  $('reloadChannels').addEventListener('click', () => void loadChannels());
  metricForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!administrator) return;
    const submit = metricForm.querySelector('[type="submit"]');
    if (submit.disabled) return;
    const values = Object.fromEntries([...$('metricFields').querySelectorAll('input')]
      .filter(input => input.value !== '').map(input => [input.name, input.valueAsNumber]));
    const error = $('metricError');
    if (!Object.keys(values).length) {
      error.textContent = '수치를 하나 이상 입력해 주세요.';
      return;
    }
    error.textContent = '';
    submit.disabled = true;
    try {
      const { record } = await api('channels', {
        channel: metricChannel.value, day: metricDay.value, period: $('metricPeriod').value, values,
      });
      manualRecords = [record, ...manualRecords.filter(item => item.channel !== record.channel || item.day !== record.day)];
      renderChannels();
      metricDialog.close();
      notify('채널 수치를 저장했어요.');
    } catch {
      error.textContent = '기록을 저장하지 못했어요. 연결과 입력값을 확인해 주세요.';
    } finally {
      submit.disabled = false;
    }
  });

  async function loadSettings() {
    try {
      const result = await api('layouts');
      administrator = result.administrator;
      Object.assign(pages, result.pages);
      settingsReady = true;
      for (const [page, saved] of Object.entries(pages)) applyPage(page, saved.settings);
      document.querySelector('[data-page="settings"]').hidden = !administrator;
      $('addChannelMetric').hidden = !administrator;
      $('layoutAccess').hidden = administrator;
      if (administrator) {
        for (const [page, schema] of Object.entries(editorPages)) {
          const option = element('option', pages[page]?.settings.nav ?? schema.label);
          option.value = page;
          selection.append(option);
        }
        $('layoutEditor').hidden = false;
        drawEditor();
        if (metricsLoaded) renderChannels();
      } else $('layoutAccess').textContent = '페이지 구성은 사이트 소유자만 바꿀 수 있습니다.';
    } catch {
      $('layoutAccess').textContent = '관리 설정을 불러오지 못했어요. 페이지를 새로고침해 주세요.';
    }
  }

  document.addEventListener('komked:page', event => {
    if (event.detail === 'channels' && !metricsLoaded) void loadChannels();
  });
  if (location.hash.slice(1).split('?')[0] === 'channels') void loadChannels();
  window.setInterval(() => {
    if (location.hash.slice(1).split('?')[0] === 'channels') void loadChannels();
  }, 3_600_000);
  void loadSettings();
})();
