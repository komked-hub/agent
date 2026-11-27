(() => {
  const element = id => document.getElementById(id);
  const section = document.querySelector('[data-view="calendar"]');
  const timeZone = 'Asia/Seoul';
  const dayMs = 86_400_000;
  const dayNumber = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dateText = new Intl.DateTimeFormat('ko-KR', { timeZone, dateStyle: 'full' });
  const timeText = new Intl.DateTimeFormat('ko-KR', {
    timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const shortDate = new Intl.DateTimeFormat('ko-KR', { timeZone, month: 'short', day: 'numeric' });
  const headerDay = new Intl.DateTimeFormat('ko-KR', { timeZone, month: 'numeric', day: 'numeric', weekday: 'short' });
  const parseDay = day => new Date(day + 'T00:00:00+09:00');
  const signIn = '/signin-with-chatgpt?return_to=' + encodeURIComponent('/#calendar');
  const refresh = element('refreshCalendar');
  const grid = element('calendarDays');
  const scaleButton = element('calendarSize');
  const popover = element('dayPopover');
  const buffers = { daily: element('dailyEvents'), major: element('majorEvents') };

  let today = dayNumber.format(new Date());
  let selected = today;
  let month = today.slice(0, 7);
  let active = false;
  let data = null;
  let requestedMonth;
  let pending;
  let updatedAt;
  let retryUntil = 0;
  let timeAnchor;
  let lastClockSync = -Infinity;
  let clockRequest;
  let expanded = false;
  let popupAnchor;
  let pinchStart;
  let overviewDay;
  let overviewRequest;
  let hoverTimer;

  function overviewVisible() {
    return ['', 'home', 'team'].includes(location.hash.slice(1).split('?')[0]);
  }

  function currentTime() {
    return timeAnchor ? new Date(timeAnchor.stamp + performance.now() - timeAnchor.tick) : new Date();
  }

  function syncClock() {
    if (clockRequest) return clockRequest;
    if (performance.now() - lastClockSync < 300_000) return Promise.resolve();
    const sent = performance.now();
    lastClockSync = sent;
    clockRequest = (async () => {
      try {
        const res = await fetch('/api/calendar/time', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
        const { now } = await res.json();
        const received = performance.now();
        if (res.ok && Number.isFinite(now)) {
          timeAnchor = { stamp: now, tick: (sent + received) / 2 };
          updateClock();
        }
      } catch {
        // The clock can still use the device timestamp with the Seoul time zone.
      } finally {
        clockRequest = null;
      }
    })();
    return clockRequest;
  }

  window.komkedClock = Object.freeze({ today: () => dayNumber.format(currentTime()), sync: syncClock });

  function updateClock() {
    const now = currentTime();
    if (active) void syncClock();
    const currentDay = dayNumber.format(now);
    const clock = element('seoulClock');
    clock.textContent = dateText.format(now) + ' ' + timeText.format(now);
    clock.dateTime = currentDay + 'T' + timeText.format(now) + '+09:00';
    for (const id of ['todayLabel', 'dashboardToday', 'teamDay']) {
      const label = element(id);
      if (label.dateTime === currentDay) continue;
      label.textContent = headerDay.format(now);
      label.dateTime = currentDay;
    }
    if (currentDay !== today) {
      const followToday = selected === today;
      today = currentDay;
      if (followToday) selectDay(today);
      else renderGrid();
      if (overviewVisible()) void loadOverview();
    }
    refresh.disabled = Boolean(pending) || Date.now() < retryUntil;
  }

  function eventsOn(source, date, type) {
    if (source?.status !== 'ok') return [];
    return source.events.filter(event => (
      type === 'daily' ? event.date === date : event.start <= date && date <= event.end
    ));
  }

  function taskEvents(date) {
    return (window.komkedTasks?.() || []).filter(task => task.date === date).map(task => ({
      date, title: '업무 · ' + task.title, label: task.label, area: task.area, task: true,
    }));
  }

  function personAvatar(name) {
    const avatar = document.createElement('span');
    avatar.className = 'calendar-person-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = (name || '팀').slice(0, 1);
    let hue = 0;
    for (const character of name || '팀') hue = (hue * 31 + character.charCodeAt(0)) % 360;
    avatar.style.setProperty('--person-hue', hue);
    return avatar;
  }

  function renderGrid() {
    const focusedDate = grid.contains(document.activeElement) ? document.activeElement.dataset.date : null;
    const [year, monthNumber] = month.split('-').map(Number);
    element('calendarMonth').textContent = year + '년 ' + monthNumber + '월';
    element('previousMonth').disabled = month === '2000-01';
    element('nextMonth').disabled = month === '2099-12';
    const first = new Date(Date.UTC(year, monthNumber - 1, 1));
    const dayCount = (Date.UTC(year, monthNumber, 1) - first.getTime()) / dayMs;
    const cells = Array.from({ length: first.getUTCDay() }, () => document.createElement('span'));
    for (let day = 1; day <= dayCount; day++) {
      const date = month + '-' + String(day).padStart(2, '0');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-day';
      button.dataset.date = date;
      button.textContent = day;
      button.setAttribute('aria-pressed', String(date === selected));
      if (date === today) button.setAttribute('aria-current', 'date');
      const types = [];
      const daily = [...eventsOn(data?.daily, date, 'daily'), ...taskEvents(date)];
      const major = eventsOn(data?.major, date, 'major');
      if (daily.length) types.push('하루 일정');
      if (major.length) types.push('주요 일정');
      button.setAttribute('aria-label', dateText.format(parseDay(date)) + (types.length ? ' · ' + types.join(', ') : ''));
      button.setAttribute('aria-controls', 'dayPopover');
      button.setAttribute('aria-expanded', String(!popover.hidden && date === selected));
      if (types.length) {
        const markers = document.createElement('span');
        markers.className = 'calendar-markers';
        markers.setAttribute('aria-hidden', 'true');
        for (const type of types) {
          const marker = document.createElement('i');
          marker.className = type === '주요 일정' ? 'major-marker' : 'daily-marker';
          markers.append(marker);
        }
        button.append(markers);
      }
      if (expanded) {
        const preview = document.createElement('span');
        preview.className = 'calendar-cell-events';
        preview.setAttribute('aria-hidden', 'true');
        const entries = [
          ...major.map(event => [event, 'major']),
          ...daily.map(event => [event, 'daily']),
        ];
        for (const [event, type] of entries.slice(0, 3)) {
          const chip = document.createElement('span');
          chip.className = 'calendar-cell-event ' + type;
          if (event.label) chip.append(personAvatar(event.label));
          chip.append(document.createTextNode(event.title));
          preview.append(chip);
        }
        if (entries.length > 3) {
          const more = document.createElement('span');
          more.textContent = '+' + (entries.length - 3);
          preview.append(more);
        }
        button.append(preview);
      }
      cells.push(button);
    }
    grid.replaceChildren(...cells);
    if (focusedDate) grid.querySelector('[data-date="' + focusedDate + '"]')?.focus({ preventScroll: true });
  }

  function paragraph(text) {
    const p = document.createElement('p');
    p.className = 'calendar-message';
    p.textContent = text;
    return p;
  }

  function renderSource(type, container = buffers[type]) {
    let source = data?.[type];
    const localTasks = type === 'daily' ? taskEvents(selected) : [];
    let sourceWarning = '';
    if (!source && localTasks.length) source = { status: 'ok', events: [] };
    if (!source) {
      container.replaceChildren(paragraph(pending ? '일정을 불러오는 중…' : '날짜를 선택하거나 일정을 새로고침해 주세요.'));
      return;
    }
    if (source.status === 'error') {
      const needsSignIn = ['sign_in_required', 'reauthentication_required'].includes(source.code);
      const message = needsSignIn ? 'Google Sheets 접근을 확인하려면 다시 연결해 주세요.'
        : source.code === 'connector_unavailable' ? '사이트에서 Google Sheets 연결을 사용할 수 없습니다.'
        : '일정을 읽지 못했습니다. 원본 시트를 확인하거나 잠시 후 다시 시도해 주세요.';
      if (localTasks.length) {
        sourceWarning = message;
        source = { status: 'ok', events: [] };
      } else {
      container.replaceChildren(paragraph(message));
      if (needsSignIn) {
        const link = document.createElement('a');
        link.className = 'calendar-connect';
        link.href = signIn;
        link.target = '_top';
        link.textContent = 'Google Sheets 연결 확인';
        container.append(link);
      }
      return;
      }
    }
    const events = [...eventsOn(source, selected, type), ...localTasks];
    if (!events.length) {
      container.replaceChildren(paragraph('이 날짜에 등록된 일정이 없습니다.'));
      return;
    }
    const list = document.createElement('ul');
    list.className = 'calendar-event-list';
    for (const event of events) {
      const li = document.createElement('li');
      const title = document.createElement('p');
      title.className = 'calendar-event-title';
      title.textContent = event.title;
      const tags = [event.label];
      if (type === 'major' && event.start !== event.end) {
        tags.push(shortDate.format(parseDay(event.start)) + ' ~ ' + shortDate.format(parseDay(event.end)));
      }
      if (tags.some(Boolean)) {
        const meta = document.createElement('p');
        meta.className = 'calendar-event-meta';
        if (event.label) meta.append(personAvatar(event.label));
        meta.append(document.createTextNode(tags.filter(Boolean).join(' · ')));
        li.append(meta);
      }
      li.append(title);
      list.append(li);
    }
    container.replaceChildren(list);
    if (sourceWarning) container.append(paragraph(sourceWarning + ' 브라우저에 추가한 업무는 계속 표시합니다.'));
  }

  function positionPopover() {
    if (popover.hidden || !popupAnchor) return;
    if (window.innerWidth <= 560) {
      popover.style.removeProperty('left');
      popover.style.removeProperty('top');
      return;
    }
    const cell = grid.querySelector('[data-date="' + selected + '"]');
    const rect = cell?.getBoundingClientRect();
    const monthCard = grid.closest('.calendar-card')?.getBoundingClientRect();
    const { x = rect?.right ?? 16, y = rect?.top ?? 16 } = popupAnchor;
    const gap = 12;
    const { width, height } = popover.getBoundingClientRect();
    const leftEdge = Math.max(gap, monthCard?.left ?? gap);
    const rightEdge = Math.min(window.innerWidth - gap, monthCard?.right ?? window.innerWidth - gap);
    const bottomEdge = Math.min(window.innerHeight - gap, monthCard?.bottom ?? window.innerHeight - gap);
    const preferred = x + gap + width <= rightEdge ? x + gap : x - width - gap;
    popover.style.left = Math.max(leftEdge, Math.min(preferred, rightEdge - width)) + 'px';
    popover.style.top = Math.max(monthCard?.top ?? gap, Math.min(y, bottomEdge - height)) + 'px';
  }

  function renderPopover() {
    if (popover.hidden) return;
    element('popoverDate').textContent = dateText.format(parseDay(selected));
    const items = [];
    for (const [type, label] of [['daily', '하루 일정'], ['major', '주요 일정']]) {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      const content = document.createElement('div');
      heading.textContent = element(type + 'Schedule')?.textContent || label;
      renderSource(type, content);
      section.append(heading, content);
      items.push(section);
    }
    element('popoverSchedule').replaceChildren(...items);
    positionPopover();
  }

  function closePopover(returnFocus = false) {
    if (popover.hidden) return;
    popover.hidden = true;
    popupAnchor = null;
    const currentDay = grid.querySelector('[data-date="' + selected + '"]');
    currentDay?.setAttribute('aria-expanded', 'false');
    if (returnFocus) currentDay?.focus({ preventScroll: true });
  }

  function setExpanded(value) {
    if (expanded === value) return;
    expanded = value;
    grid.classList.toggle('expanded', expanded);
    scaleButton.setAttribute('aria-pressed', String(expanded));
    scaleButton.textContent = expanded ? '일정 접기' : '일정 펼치기';
    renderGrid();
    positionPopover();
  }

  function renderOverview(payload) {
    renderTeam(payload?.daily);
    const summary = element('briefSchedule');
    const found = [
      ...eventsOn(payload?.major, today, 'major').map(event => [event, '주요 일정']),
      ...eventsOn(payload?.daily, today, 'daily').map(event => [event, '하루 일정']),
    ];
    const ready = payload?.daily?.status === 'ok' && payload?.major?.status === 'ok';
    document.querySelector('[data-today-schedule-count]').textContent = ready ? String(found.length) : '—';
    if (!found.length) {
      summary.textContent = ready ? '오늘 등록된 일정이 없습니다.' : '캘린더에서 오늘 일정을 확인할 수 있어요.';
      return;
    }
    summary.replaceChildren();
    for (const [event, type] of found.slice(0, 3)) {
      const entry = document.createElement('div');
      entry.className = 'dashboard-event';
      const badge = document.createElement('span');
      badge.className = 'pill ' + (type === '주요 일정' ? 'pending' : 'info');
      badge.textContent = type;
      entry.append(badge, paragraph(event.title));
      summary.append(entry);
    }
    if (found.length > 3) summary.append(paragraph('외 ' + (found.length - 3) + '건'));
  }

  function renderTeam(source) {
    const cards = element('teamCards');
    const status = element('teamStatus');
    cards.replaceChildren();
    const names = new Map();
    for (const event of eventsOn(source, today, 'daily')) {
      if (!event.label || ['팀 공통', '팀 일정'].includes(event.label)) continue;
      if (!names.has(event.label)) names.set(event.label, []);
      names.get(event.label).push(event.title);
    }
    status.textContent = source?.status !== 'ok' ? '팀원 일정을 불러오지 못했어요. 연결을 확인하고 새로고침해 주세요.'
      : names.size ? '' : '오늘 캘린더에 등록된 팀원별 일정이 없습니다.';
    if (['sign_in_required', 'reauthentication_required'].includes(source?.code)) {
      const connect = document.createElement('a');
      connect.className = 'calendar-connect';
      connect.textContent = 'Google Sheets 연결 확인';
      connect.href = '/signin-with-chatgpt?return_to=' + encodeURIComponent('/#team');
      connect.target = '_top';
      status.append(' ', connect);
    }
    for (const [name, entries] of names) {
      const card = document.createElement('article');
      card.className = 'card module-card team-person';
      const header = document.createElement('div');
      header.className = 'team-person-heading';
      const avatar = document.createElement('span');
      avatar.className = 'avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = name.slice(0, 1);
      const title = document.createElement('h3');
      title.textContent = name;
      const count = document.createElement('span');
      count.className = 'pill info';
      count.textContent = '일정 ' + entries.length + '건';
      header.append(avatar, title, count);
      const list = document.createElement('ul');
      list.className = 'workspace-list';
      for (const entry of entries) {
        const item = document.createElement('li');
        item.textContent = entry;
        list.append(item);
      }
      card.append(header, list);
      cards.append(card);
    }
  }

  async function loadOverview(reload = false) {
    if (overviewRequest || (!reload && overviewDay === today)) return;
    const day = today;
    overviewDay = day;
    overviewRequest = true;
    void syncClock();
    element('refreshTeam').disabled = true;
    element('teamStatus').textContent = '오늘의 팀원 일정을 불러오는 중…';
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: day.slice(0, 7) }),
      });
      if (!res.ok) throw new Error();
      const payload = await res.json();
      if (today === day) renderOverview(payload);
    } catch {
      if (today === day) renderOverview(null);
    } finally {
      overviewRequest = false;
      element('refreshTeam').disabled = false;
      if (today !== day && overviewVisible()) void loadOverview();
    }
  }

  function render() {
    element('selectedCalendarDate').textContent = dateText.format(parseDay(selected));
    const serverStatus = element('calendarStatus');
    if (pending) serverStatus.textContent = 'Google Sheets에서 일정을 불러오는 중…';
    else if (updatedAt) serverStatus.textContent = '불러온 시간 (KST) ' + timeText.format(updatedAt);
    else serverStatus.textContent = '';
    refresh.disabled = Boolean(pending) || Date.now() < retryUntil;
    renderGrid();
    renderSource('daily');
    renderSource('major');
    renderPopover();
  }

  async function loadMonth(force = false) {
    if (!active || (!force && requestedMonth === month)) return;
    if (Date.now() < retryUntil) {
      render();
      return;
    }
    pending?.abort();
    const request = new AbortController();
    const requestMonth = month;
    pending = request;
    requestedMonth = month;
    data = null;
    updatedAt = null;
    render();
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: requestMonth }),
        signal: request.signal,
      });
      const payload = await res.json();
      if (pending !== request) return;
      if (!res.ok || payload.month !== requestMonth || !payload.daily || !payload.major) {
        throw new Error(res.status === 401 ? 'sign_in_required' : 'source_failed');
      }
      data = payload;
      if (requestMonth === today.slice(0, 7)) renderOverview(payload);
      if (payload.daily.status === 'ok' || payload.major.status === 'ok') updatedAt = new Date();
      const retrySeconds = Math.max(payload.daily.retryAfter ?? 0, payload.major.retryAfter ?? 0);
      if (retrySeconds > 0) retryUntil = Date.now() + retrySeconds * 1000;
    } catch (error) {
      if (pending !== request) return;
      const failure = { status: 'error', code: error.message === 'sign_in_required' ? error.message : 'source_failed' };
      data = { daily: failure, major: failure };
    } finally {
      if (pending === request) {
        pending = null;
        render();
      }
    }
  }

  function selectDay(date) {
    selected = date;
    const nextMonth = date.slice(0, 7);
    if (nextMonth !== month) {
      pending?.abort();
      pending = null;
      data = null;
      updatedAt = null;
      requestedMonth = null;
      month = nextMonth;
    }
    render();
    void loadMonth();
  }

  function shiftMonth(delta) {
    closePopover();
    const [year, monthNumber] = month.split('-').map(Number);
    const next = new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7);
    selectDay(next === today.slice(0, 7) ? today : next + '-01');
  }

  grid.addEventListener('click', event => {
    const day = event.target.closest('button[data-date]');
    if (!day) return;
    if (selected === day.dataset.date && !popover.hidden) {
      closePopover();
      return;
    }
    popupAnchor = event.detail ? { x: event.clientX, y: event.clientY } : {};
    popover.hidden = false;
    selectDay(day.dataset.date);
    if (!event.detail) element('closeDayPopover').focus();
  });
  grid.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    const day = event.target.closest('button[data-date]');
    if (!day || day.contains(event.relatedTarget)) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      const bounds = day.getBoundingClientRect();
      popupAnchor = { x: bounds.right, y: bounds.top };
      popover.hidden = false;
      selectDay(day.dataset.date);
    }, 500);
  });
  grid.addEventListener('pointerout', event => {
    const day = event.target.closest('button[data-date]');
    if (day && !day.contains(event.relatedTarget)) clearTimeout(hoverTimer);
  });
  scaleButton.addEventListener('click', () => setExpanded(!expanded));
  const touchDistance = touches => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  grid.addEventListener('touchstart', event => {
    if (event.touches.length === 2) pinchStart = touchDistance(event.touches);
  }, { passive: true });
  grid.addEventListener('touchmove', event => {
    if (event.touches.length !== 2 || pinchStart === undefined) return;
    if (event.cancelable) event.preventDefault();
    const change = touchDistance(event.touches) - pinchStart;
    if (Math.abs(change) >= 26) {
      closePopover();
      setExpanded(change > 0);
      pinchStart = touchDistance(event.touches);
    }
  }, { passive: false });
  for (const type of ['touchend', 'touchcancel']) {
    grid.addEventListener(type, () => { pinchStart = undefined; }, { passive: true });
  }
  element('closeDayPopover').addEventListener('click', () => closePopover(true));
  document.addEventListener('pointerdown', event => {
    if (!popover.contains(event.target) && !grid.contains(event.target)) closePopover();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closePopover(popover.contains(document.activeElement));
  });
  window.addEventListener('resize', positionPopover);
  window.addEventListener('scroll', () => { if (window.innerWidth > 560) closePopover(); });
  element('previousMonth').addEventListener('click', () => shiftMonth(-1));
  element('nextMonth').addEventListener('click', () => shiftMonth(1));
  element('calendarToday').addEventListener('click', () => { closePopover(); selectDay(today); });
  refresh.addEventListener('click', () => void loadMonth(true));
  element('refreshTeam').addEventListener('click', () => void loadOverview(true));
  document.addEventListener('komked:tasks-changed', () => {
    render();
    if (overviewVisible()) void loadOverview(true);
  });
  document.addEventListener('komked:page', event => {
    closePopover();
    active = event.detail === 'calendar';
    if (active) {
      updateClock();
      const query = location.hash.split('?')[1];
      if (new URLSearchParams(query).get('date') === 'today') selectDay(today);
      else void loadMonth();
    } else if (event.detail === 'home' || event.detail === 'team') {
      void loadOverview();
    }
  });

  active = !section.hidden;
  render();
  updateClock();
  window.setInterval(updateClock, 1000);
  window.setInterval(() => {
    if (active) void loadMonth(true);
    if (overviewVisible()) void loadOverview(true);
  }, 3_600_000);
  void loadMonth();
  if (overviewVisible()) void loadOverview();
})();
