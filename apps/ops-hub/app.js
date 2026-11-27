const byId = id => document.getElementById(id);
const all = selector => [...document.querySelectorAll(selector)];

let toastTimer;
function notify(message) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4200);
}

function load(key, fallback, validate) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return validate(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    notify('브라우저 저장을 사용할 수 없어 이번 화면에서만 변경됩니다.');
    return false;
  }
}

const menu = byId('sidebar');
const menuButton = byId('menuBtn');
const menuOverlay = byId('menuOverlay');
const main = byId('mainContent');
const navButtons = all('.nav button[data-page]');
const views = new Map(all('[data-view]').map(view => [view.dataset.view, view]));

function setMenu(open, restoreFocus = false) {
  menu.classList.toggle('open', open);
  menu.hidden = !open;
  main.inert = open;
  byId('shellHeader').inert = open;
  menuOverlay.hidden = !open;
  menuButton.setAttribute('aria-expanded', String(open));
  if (open) (menu.querySelector('[aria-current="page"]:not([hidden])') || byId('closeMenu')).focus();
  if (restoreFocus) menuButton.focus();
}

function showPage(page, moveFocus = false) {
  const [route, query] = page.split('?');
  const current = views.has(route) ? route : 'home';
  const params = new URLSearchParams(query);
  let currentButton;
  for (const button of navButtons) {
    const selected = button.dataset.page === current;
    button.classList.toggle('active', selected);
    if (selected) {
      button.setAttribute('aria-current', 'page');
      currentButton = button;
    } else {
      button.removeAttribute('aria-current');
    }
  }
  for (const [name, view] of views) {
    view.hidden = name !== current;
    view.classList.toggle('active', name === current);
  }
  const name = currentButton.querySelector('[data-page-label]').textContent;
  byId('crumbPage').textContent = name;
  document.title = name + ' · KOMKED';
  setMenu(false);
  if (current === 'tasks') byId('taskStatus').value = params.get('status') === 'open' ? 'open' : '';
  document.dispatchEvent(new CustomEvent('komked:page', { detail: current }));
  if (moveFocus) {
    views.get(current).querySelector('h1').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function navigate(page, state = null) {
  if (location.hash !== '#' + page) history.pushState(state, '', '#' + page);
  showPage(page, true);
}

for (const button of navButtons) button.addEventListener('click', () => navigate(button.dataset.page));
for (const control of all('[data-go]')) control.addEventListener('click', event => {
  if (control.tagName === 'A' && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
  event.preventDefault();
  navigate(control.dataset.go);
});
window.addEventListener('popstate', () => showPage(location.hash.slice(1), true));
menuButton.addEventListener('click', () => setMenu(true));
byId('closeMenu').addEventListener('click', () => setMenu(false, true));
menuOverlay.addEventListener('click', () => setMenu(false, true));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.classList.contains('open')) setMenu(false, true);
});
showPage(location.hash.slice(1));

const taskKey = 'komked-demo-tasks';
const personalTaskPrefix = 'komked-personal-task:';
const sampleTasks = [
  { id: 'expenses', title: '행사 지출 내역 확인하기', area: '재정', due: '오늘 마감' },
  { id: 'meeting', title: '팀 모임 자료 정리', area: '소통', due: '금요일 마감' },
  { id: 'schedule', title: '주간 일정 업데이트', area: '운영', due: '이번 주' },
];
const taskAreas = ['운영', '소통', '재정', '기타'];
const seoulDay = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
});
const dueDateFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium' });

function loadAddedTasks() {
  try {
    const valid = (task, key) => task?.id === key && typeof task.title === 'string' &&
      taskAreas.includes(task.area) && Number.isFinite(task.createdAt) && typeof task.dueDate === 'string' &&
      (!task.dueDate || (/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate) && !Number.isNaN(Date.parse(task.dueDate))));
    return Object.keys(localStorage).filter(key => key.startsWith(personalTaskPrefix))
      .map(key => load(key, null, task => valid(task, key))).filter(Boolean)
      .sort((first, second) => second.createdAt - first.createdAt);
  } catch {
    return [];
  }
}

let addedTasks = loadAddedTasks();
let completed = new Set(load(taskKey, ['schedule'], Array.isArray));
const taskRows = [];
const tasks = () => [...addedTasks, ...sampleTasks];
const taskBoard = byId('allTasks');
const taskColumns = new Map();

for (const [key, label] of [['open', '진행 중'], ['done', '완료']]) {
  const column = document.createElement('section');
  column.className = 'task-column';
  column.dataset.status = key;
  const header = document.createElement('header');
  const heading = document.createElement('h3');
  heading.textContent = label;
  const count = document.createElement('span');
  count.className = 'pill info';
  header.append(heading, count);
  const cards = document.createElement('div');
  cards.className = 'task-cards';
  const empty = document.createElement('p');
  empty.className = 'workspace-empty';
  empty.textContent = '이 상태의 업무가 없습니다.';
  column.append(header, cards, empty);
  taskBoard.append(column);
  taskColumns.set(key, { column, cards, count, empty });
}

function buildTaskRows(container, entries, board = false) {
  if (board) {
    for (const { cards } of taskColumns.values()) cards.replaceChildren();
  } else container.replaceChildren();
  for (const task of entries) {
    const row = document.createElement('div');
    row.className = 'task-row';
    row.innerHTML = '<button class="check" type="button"></button><div><div class="task-title"></div><div class="task-meta"></div></div><span></span>';
    const button = row.querySelector('button');
    const meta = row.querySelector('.task-meta');
    const pill = row.lastElementChild;
    row.querySelector('.task-title').textContent = task.title;
    button.setAttribute('aria-label', task.title + ' 완료');
    button.addEventListener('click', () => {
      completed = new Set(load(taskKey, [...completed], Array.isArray));
      const done = !completed.has(task.id);
      if (done) completed.add(task.id);
      else completed.delete(task.id);
      renderTasks();
      if (board) (row.hidden ? byId('taskStatus') : button).focus({ preventScroll: true });
      if (save(taskKey, [...completed])) notify(done ? '업무를 완료로 표시했어요.' : '업무를 진행 중으로 표시했어요.');
    });
    (board ? taskColumns.get(completed.has(task.id) ? 'done' : 'open').cards : container).append(row);
    taskRows.push({ task, row, button, meta, pill, board });
  }
}

function taskDue(task, today) {
  if (task.due) return task.due;
  if (!task.dueDate) return '마감일 없음';
  if (task.dueDate === today) return '오늘 마감';
  return dueDateFormat.format(new Date(task.dueDate + 'T00:00:00+09:00')) + ' 마감';
}

function renderTasks() {
  const today = seoulDay.format(new Date());
  const status = byId('taskStatus').value;
  let visible = 0;
  const counts = { open: 0, done: 0 };
  for (const { task, row, button, meta, pill, board } of taskRows) {
    const done = completed.has(task.id);
    const due = taskDue(task, today);
    if (board) {
      const key = done ? 'done' : 'open';
      counts[key]++;
      const cards = taskColumns.get(key).cards;
      if (row.parentElement !== cards) cards.append(row);
      row.hidden = (status === 'open' && done) || (status === 'done' && !done);
      if (!row.hidden) visible++;
    }
    const overdue = Boolean(task.dueDate && task.dueDate < today);
    const urgent = overdue || due === '오늘 마감';
    row.classList.toggle('is-done', done);
    button.classList.toggle('done', done);
    button.setAttribute('aria-pressed', String(done));
    button.textContent = done ? '✓' : '';
    meta.textContent = task.area + ' · ' + (done ? '완료' : due);
    pill.className = 'pill ' + (done ? 'info' : urgent ? 'high' : 'normal');
    pill.textContent = done ? '완료' : overdue ? '기한 지남' : urgent ? '오늘 마감' : '진행 중';
  }
  for (const [key, { column, count, empty }] of taskColumns) {
    column.hidden = Boolean(status && status !== key);
    count.textContent = counts[key];
    empty.hidden = Boolean(counts[key] || status);
  }
  byId('taskEmpty').hidden = visible > 0;
  const entries = tasks();
  const open = entries.filter(task => !completed.has(task.id));
  for (const stat of all('[data-stat]')) {
    stat.textContent = stat.dataset.stat === 'open' ? open.length : entries.length - open.length;
  }
  document.querySelector('[data-task-due]').textContent = '오늘 마감 ' +
    open.filter(task => task.due === '오늘 마감' || task.dueDate === today).length + '건';
}

function refreshTaskLists() {
  const entries = tasks();
  taskRows.length = 0;
  buildTaskRows(byId('taskList'), entries);
  buildTaskRows(taskBoard, entries, true);
  renderTasks();
}

refreshTaskLists();
byId('taskStatus').addEventListener('change', renderTasks);

const taskDialog = byId('addTaskDialog');
const taskForm = byId('addTaskForm');
const taskTitle = byId('newTaskTitle');
const taskError = byId('newTaskError');

byId('addTaskButton').addEventListener('click', () => {
  taskForm.reset();
  taskTitle.setCustomValidity('');
  taskError.textContent = '';
  taskDialog.showModal();
});

byId('cancelAddTask').addEventListener('click', () => taskDialog.close());
taskTitle.addEventListener('input', () => taskTitle.setCustomValidity(''));

taskForm.addEventListener('submit', event => {
  event.preventDefault();
  const title = taskTitle.value.trim();
  if (!title) {
    taskTitle.setCustomValidity('업무 이름을 입력해 주세요.');
    taskTitle.reportValidity();
    return;
  }

  const task = {
    id: personalTaskPrefix + crypto.randomUUID(),
    title,
    area: byId('newTaskArea').value,
    dueDate: byId('newTaskDue').value,
    createdAt: Date.now(),
  };
  try {
    localStorage.setItem(task.id, JSON.stringify(task));
  } catch {
    taskError.textContent = '업무를 저장하지 못했어요. 브라우저 저장 설정을 확인해 주세요.';
    return;
  }

  addedTasks = loadAddedTasks();
  refreshTaskLists();
  taskDialog.close();
  notify('업무를 추가했어요.');
});

document.addEventListener('komked:page', event => {
  if (event.detail !== 'tasks' && taskDialog.open) taskDialog.close();
  if (event.detail === 'home' || event.detail === 'tasks') renderTasks();
});
window.addEventListener('storage', event => {
  if (event.key === null || event.key.startsWith(personalTaskPrefix)) {
    addedTasks = loadAddedTasks();
    refreshTaskLists();
  }
  if (event.key === taskKey || event.key === null) {
    completed = new Set(load(taskKey, ['schedule'], Array.isArray));
    renderTasks();
  }
});

const dialog = byId('detailDialog');
const dialogContent = byId('dialogContent');

function openDialog(title, content) {
  byId('dialogTitle').textContent = title;
  dialogContent.replaceChildren(...content);
  dialog.showModal();
}

function paragraph(text) {
  const element = document.createElement('p');
  element.textContent = text;
  return element;
}

byId('helpBtn').addEventListener('click', () => {
  setMenu(false, true);
  openDialog('사용 안내', [
    paragraph('대시보드 카드에서 각 화면으로 이동할 수 있어요. 재정에서는 영수증 사진과 제출 정보를 확인하고, 소통에서는 메시지와 댓글을 남길 수 있습니다.'),
    paragraph('개인 업무와 화면 테마는 이 브라우저에 저장됩니다.'),
  ]);
});

byId('briefBtn').addEventListener('click', async () => {
  const today = seoulDay.format(new Date());
  const summary = ['KOMKED 오늘의 브리핑 · 예시',
    ...tasks().map(task => (completed.has(task.id) ? '완료' : taskDue(task, today)) + ' · ' + task.title),
    '영수증 검토 대기 ' + (document.querySelector('main [data-receipt-count]').textContent) + '건',
    '오늘 일정 ' + document.querySelector('[data-today-schedule-count]').textContent + '건',
  ].join('\n');
  try {
    await navigator.clipboard.writeText(summary);
    notify('예시 브리핑을 복사했어요.');
  } catch {
    const field = document.createElement('textarea');
    field.value = summary;
    field.readOnly = true;
    field.setAttribute('aria-label', '브리핑 내용');
    openDialog('브리핑 복사', [paragraph('텍스트를 선택해 복사하세요.'), field]);
    field.select();
  }
});

const defaultRules = [
  { label: '결제일', value: '날짜' },
  { label: '상호명', value: '상호명' },
  { label: '금액', value: '금액' },
  { label: '결제자', value: '결제자' },
];
const ruleKey = 'komked-demo-filename-rules';
const ruleList = byId('ruleList');
const defaultRuleCopy = () => defaultRules.map(rule => ({ ...rule }));
let rules = load(ruleKey, defaultRuleCopy(), value => Array.isArray(value) &&
  value.every(rule => typeof rule?.label === 'string' && typeof rule?.value === 'string'));

function updateFilename() {
  const parts = rules.map(rule => rule.value.trim()).filter(Boolean);
  byId('filePreview').textContent = parts.length ? parts.join('_') : '항목을 추가해 주세요';
}

function changeRules(focusIndex, focusSelector = 'input') {
  renderRules();
  save(ruleKey, rules);
  const target = ruleList.children[focusIndex]?.querySelector(focusSelector);
  if (target && !target.disabled) target.focus();
  else if (ruleList.children[focusIndex]) ruleList.children[focusIndex].querySelector('input').focus();
  else byId('addRule').focus();
}

function renderRules() {
  ruleList.replaceChildren();
  rules.forEach((rule, index) => {
    const row = document.createElement('div');
    row.className = 'rule-row';
    row.innerHTML = '<div class="rule-field"><label></label><input maxlength="80"></div>' +
      '<div class="rule-actions"><button type="button" data-rule="up">위</button>' +
      '<button type="button" data-rule="down">아래</button><button type="button" data-rule="remove">삭제</button></div>';
    const input = row.querySelector('input');
    const label = row.querySelector('label');
    input.id = 'rule-' + index;
    input.value = rule.value;
    label.htmlFor = input.id;
    label.textContent = rule.label;
    input.addEventListener('input', () => {
      rule.value = input.value;
      updateFilename();
      save(ruleKey, rules);
    });

    const [up, down, remove] = row.querySelectorAll('button');
    up.disabled = index === 0;
    down.disabled = index === rules.length - 1;
    for (const [button, label] of [[up, '위로 이동'], [down, '아래로 이동'], [remove, '삭제']]) {
      button.setAttribute('aria-label', rule.label + ' ' + label);
    }
    for (const [button, offset] of [[up, -1], [down, 1]]) {
      button.addEventListener('click', () => {
        const next = index + offset;
        [rules[index], rules[next]] = [rules[next], rules[index]];
        changeRules(next, '[data-rule="' + button.dataset.rule + '"]');
      });
    }
    remove.addEventListener('click', () => {
      rules.splice(index, 1);
      changeRules(Math.min(index, rules.length - 1));
    });
    ruleList.append(row);
  });
  updateFilename();
}

byId('addRule').addEventListener('click', () => {
  rules.push({ label: '새 항목', value: '' });
  changeRules(rules.length - 1);
});
byId('resetRules').addEventListener('click', () => {
  rules = defaultRuleCopy();
  renderRules();
  if (save(ruleKey, rules)) notify('파일명 규칙을 기본값으로 복원했어요.');
});
renderRules();
