const editorPages = {
  home: {
    label: '대시보드',
    description: '오늘 일정, 진행 중인 업무와 영수증 상태를 확인하세요.',
    heading: '운영 대시보드',
    groups: {
      homeStats: { label: '상단 요약 카드', items: {
        'work-summary': '진행 중인 업무', 'receipt-summary': '검토할 영수증',
        'schedule-summary': '오늘 일정', 'message-summary': '팀 메시지',
      } },
      homePanels: { label: '아래 카드', items: {
        'schedule-panel': '오늘의 일정', 'task-panel': '내 업무',
        'message-panel': '팀 메시지', 'receipt-panel': '영수증 검토함',
      } },
    },
  },
  communication: {
    label: '소통', heading: '소통', description: '팀에 메시지를 남기고 댓글로 이야기해요.',
    groups: { communicationMain: { label: '페이지 섹션', items: { composer: '메시지 남기기', feed: '팀 메시지' } } },
    message: { field: '메시지', placeholder: '', action: '메시지 올리기', template: '' },
  },
  finance: {
    label: '재정', heading: '재정', description: '영수증을 등록하고 제출 정보와 사진을 확인하세요.',
    groups: { financeMain: { label: '페이지 섹션', items: { inbox: '영수증 검토함' } } },
  },
  calendar: {
    label: '팀 캘린더', heading: '캘린더', description: '날짜를 누르면 일정이 바로 열려요.',
    groups: {
      calendarMain: { label: '페이지 섹션', items: { month: null, 'day-agenda': null } },
      calendarAgenda: { label: '날짜별 일정 카드', items: { daily: '하루 일정', major: '주요 일정' } },
    },
  },
  tasks: {
    label: '업무 보드', heading: '업무 보드', description: '할 일을 추가하고 완료 상태를 확인하세요.',
    groups: { tasksMain: { label: '페이지 섹션', items: { list: '내 업무 목록' } } },
  },
  team: {
    label: '팀원 현황', heading: '팀원 현황', description: '오늘 연결된 캘린더에 등록된 팀원별 일정을 확인하세요.',
    groups: { teamMain: { label: '페이지 섹션', items: { members: '팀원 일정' } } },
  },
  analytics: {
    label: '분석', heading: '분석', description: '운영 현황 지표를 모아보는 공간이에요.',
    groups: {
      analyticsMain: { label: '페이지 섹션', items: { stats: null, overview: '운영 요약' } },
      analyticsStats: { label: '요약 지표', items: { open: '열린 업무', done: '완료한 업무', pending: '검토 대기', events: '예정된 일정' } },
    },
  },
  crm: {
    label: '관계 관리', heading: '관계 관리', description: '민감한 연락처 기록은 권한과 담당자 기준으로 관리해야 해요.',
    groups: { crmMain: { label: '페이지 섹션', items: { overview: '관계 관리 공간' } } },
  },
  channels: {
    label: '채널 성과', heading: '채널 성과', description: 'YouTube, Instagram, 스티비의 기록을 한곳에서 비교하세요.',
    groups: {
      channelsMain: { label: '페이지 섹션', items: { summaries: null, history: '기록 내역' } },
      channelCards: { label: '채널 카드', items: { youtube: 'YouTube', instagram: 'Instagram', stibee: '스티비' } },
    },
  },
};

const editorItemLabels = { month: '월간 달력', 'day-agenda': '선택 날짜의 일정', stats: '요약 지표', summaries: '채널 카드' };

const channelMetrics = {
  youtube: {
    label: 'YouTube', url: 'https://studio.youtube.com/',
    metrics: { views: '조회수', subscribers: '구독자 수', uploads: '기간 발행 영상', posts: '누적 게시물' },
  },
  instagram: {
    label: 'Instagram', url: 'https://business.facebook.com/',
    metrics: { views: '조회수', followers: '팔로워 수', reach: '도달 계정', uploads: '기간 발행 게시물', posts: '누적 게시물' },
  },
  stibee: {
    label: '스티비', url: 'https://stibee.com/',
    metrics: { subscribers: '구독자 수', sends: '기간 발행 수', posts: '누적 발행 수', openRate: '오픈율 (%)', clickRate: '클릭률 (%)' },
  },
};

function defaultPageLayout(page) {
  const schema = editorPages[page];
  return {
    nav: schema.label,
    heading: schema.heading,
    description: schema.description,
    groups: Object.fromEntries(Object.entries(schema.groups).map(([name, group]) => [
      name, Object.entries(group.items).map(([id, title]) => ({ id, title, visible: true })),
    ])),
    notes: [],
    ...(schema.message ? { message: { ...schema.message } } : {}),
  };
}

function normalizedPageLayout(page, input) {
  const defaults = defaultPageLayout(page);
  const schema = editorPages[page];
  const text = (value, otherwise, max) => typeof value === 'string' ? value.trim().slice(0, max) : otherwise;
  function required(value, otherwise) { return text(value, otherwise, 80) || otherwise; }
  return {
    nav: required(input?.nav, defaults.nav),
    heading: required(input?.heading, defaults.heading),
    description: text(input?.description, defaults.description, 220),
    groups: Object.fromEntries(Object.entries(defaults.groups).map(([name, base]) => {
      const raw = Array.isArray(input?.groups?.[name]) ? input.groups[name] : [];
      const items = new Map(base.map(item => [item.id, item]));
      const result = [];
      for (const item of raw) {
        const original = items.get(item?.id);
        if (!original) continue;
        result.push({
          ...original,
          title: original.title === null ? null : required(item.title, original.title),
          visible: item.visible !== false,
        });
        items.delete(item.id);
      }
      result.push(...items.values());
      return [name, result];
    })),
    notes: (Array.isArray(input?.notes) ? input.notes : []).slice(0, 8)
      .map(note => ({ title: text(note?.title, '', 80), body: text(note?.body, '', 1000) }))
      .filter(note => note.title || note.body),
    ...(schema.message ? { message: {
      field: required(input?.message?.field, defaults.message.field),
      placeholder: text(input?.message?.placeholder, defaults.message.placeholder, 180),
      action: required(input?.message?.action, defaults.message.action),
      template: text(input?.message?.template, defaults.message.template, 1000),
    } } : {}),
  };
}
