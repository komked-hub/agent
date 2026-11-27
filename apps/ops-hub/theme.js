(() => {
  const storageKey = 'komked-theme';
  const modes = ['system', 'light', 'dark'];
  const labels = { system: '시스템 설정', light: '라이트 모드', dark: '다크 모드' };
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try {
    const stored = localStorage.getItem(storageKey);
    if (modes.includes(stored)) preference = stored;
  } catch {}
  const toggle = document.getElementById('themeToggle');
  const choices = [...document.querySelectorAll('[data-theme-choice]')];

  function render() {
    const scheme = preference === 'system' ? (systemDark.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = scheme;
    document.querySelector('meta[name="theme-color"]').content = scheme === 'dark' ? '#141311' : '#FAF6F2';
    toggle.setAttribute('aria-label', '화면 테마 변경 · 현재 ' + labels[preference]);
    toggle.title = labels[preference];
    toggle.textContent = scheme === 'dark' ? '☾' : '◐';
    for (const button of choices) button.setAttribute('aria-pressed', String(button.dataset.themeChoice === preference));
  }

  function select(mode) {
    preference = mode;
    try { localStorage.setItem(storageKey, mode); } catch {}
    render();
  }

  toggle.addEventListener('click', () => select(modes[(modes.indexOf(preference) + 1) % modes.length]));
  for (const button of choices) button.addEventListener('click', () => select(button.dataset.themeChoice));
  systemDark.addEventListener('change', render);
  render();
})();
