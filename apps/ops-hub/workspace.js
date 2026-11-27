(() => {
  const $ = id => document.getElementById(id);
  const base = '/api/workspace';
  const koreanDate = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short',
  });
  const dateDisplay = timestamp => koreanDate.format(new Date(timestamp));
  const query = () => new URLSearchParams(location.hash.split('?')[1]);

  function node(tag, text, className) {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  }

  function button(label, className = 'secondary') {
    const item = node('button', label, className);
    item.type = 'button';
    return item;
  }

  function link(route, label) {
    const item = node('a', label, 'workspace-preview');
    item.href = '#' + route;
    item.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(route);
    });
    return item;
  }

  async function request(path, payload, signal) {
    const upload = payload instanceof FormData;
    const options = payload === undefined ? {} : {
      method: 'POST',
      headers: upload ? {} : { 'Content-Type': 'application/json' },
      body: upload ? payload : JSON.stringify(payload),
    };
    const res = await fetch(base + path, { ...options, cache: 'no-store', signal });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result.error) {
      const error = new Error(result.error || 'network');
      error.status = res.status;
      throw error;
    }
    return result;
  }

  function errorText(error) {
    const messages = {
      sign_in_required: '다시 로그인한 뒤 시도해 주세요.',
      file_too_large: photoLimit + ' MB 이하의 사진을 선택해 주세요.',
      invalid_image: 'JPEG, PNG, HEIC, WebP, GIF 또는 AVIF 사진을 선택해 주세요.',
      invalid_details: '입력 내용을 확인해 주세요.',
      invalid_date: '결제일을 확인해 주세요.',
      storage_unavailable: '사이트 저장소를 아직 사용할 수 없어요.',
      not_found: '해당 항목을 찾을 수 없어요.',
    };
    return messages[error.message] || '잠시 후 다시 시도해 주세요.';
  }

  let receipts = [];
  let receiptLoad;
  let receiptReady = false;
  let receiptLoadError = '';
  let receiptListRevision = 0;
  const receiptForm = $('receiptForm');
  const photoLimit = Number(receiptForm.dataset.uploadMax) / (1024 * 1024) || 10;
  const uploadDialog = $('addReceiptDialog');
  const receiptStatus = $('filterReceipts');
  const receiptSearch = $('receiptSearch');
  let selectedFile;
  let receiptPreview;
  let submissionId;
  let uploading = false;
  const cameraVideo = $('receiptCameraVideo');
  const cameraPanel = $('receiptCameraPanel');
  const cameraButton = $('receiptCamera');
  const shutter = $('takeReceiptPhoto');
  const nativeCamera = $('receiptNativeCamera');
  const gallery = $('receiptGallery');
  const paidDate = receiptForm.elements.namedItem('paidDate');
  const receiptConfirmation = $('receiptConfirmation');
  const receiptSubmit = $('submitReceipt');
  const receiptProgress = $('receiptProgress');
  const receiptError = $('receiptUploadError');
  let receiptDraftInitialized = false;
  let pendingForm;
  let confirmedReceipt;
  let cameraStream;
  let cameraVersion = 0;
  let receiptVersion = 0;
  let editedPaidDate = false;

  function paintReceipts() {
    const pending = receipts.filter(row => !row.reviewed_at);
    for (const count of document.querySelectorAll('[data-receipt-count]')) {
      count.textContent = receiptReady ? String(pending.length) : '—';
      if (count.classList.contains('nav-badge')) count.hidden = !receiptReady || !pending.length;
    }
    $('receiptPending').textContent = receiptReady ? pending.length + '건 대기' : '—';
    const quick = $('briefReceipts');
    quick.replaceChildren();
    for (const row of pending.slice(0, 2)) {
      quick.append(link('finance?status=pending&receipt=' + encodeURIComponent(row.id), row.title));
    }
    if (pending.length === 0) {
      quick.append(node('p', receiptReady ? '검토할 영수증이 없습니다.' : '영수증 검토함에서 확인할 수 있어요.', 'workspace-empty'));
    }

    const keyword = receiptSearch.value.trim().toLowerCase();
    const rows = receipts.filter(row => (
      (!keyword || [row.title, row.description].some(value => value.toLowerCase().includes(keyword))) &&
      (!receiptStatus.value || row.reviewed_at === null && receiptStatus.value === 'pending' ||
        row.reviewed_at !== null && receiptStatus.value === 'reviewed')
    ));
    const list = $('receiptRows');
    list.replaceChildren();
    for (const row of rows) {
      const li = node('li', undefined, 'review-row');
      const details = node('div');
      details.append(node('strong', row.title), node('span', '접수 ' + dateDisplay(row.created_at), 'workspace-meta'));
      const pill = node('span', row.reviewed_at ? '확인 완료' : '검토 대기', 'pill ' + (row.reviewed_at ? 'info' : 'pending'));
      const open = button('열기', 'text-link');
      open.setAttribute('aria-label', row.title + ' 열기');
      open.addEventListener('click', () => {
        showReceipt(row.id);
      });
      li.append(details, pill, open);
      list.append(li);
    }
    $('receiptResults').textContent = receiptLoadError
      ? '영수증을 불러오지 못했어요. ' + receiptLoadError
      : !receiptReady ? '영수증을 불러오는 중…'
      : rows.length ? '표시 중인 영수증 ' + rows.length + '건'
      : receipts.length ? '조건에 맞는 영수증이 없습니다.' : '등록된 영수증이 없습니다.';
  }

  function upsertReceipt(row) {
    receiptListRevision++;
    receipts = [row, ...receipts.filter(item => item.id !== row.id)]
      .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));
    receiptReady = true;
    receiptLoadError = '';
    paintReceipts();
  }

  function showReceipt(id) {
    const row = receipts.find(item => item.id === id);
    if (!row) return;
    const source = base + '/receipts/' + row.id + '/image';
    const preview = node('img', undefined, 'receipt-image');
    const imageError = node('p', undefined, 'workspace-empty');
    preview.alt = '제출한 영수증 사진';
    preview.addEventListener('error', () => {
      preview.hidden = true;
      imageError.textContent = '이 브라우저에서 사진을 미리 볼 수 없어요. 원본을 내려받아 확인하세요.';
    });
    preview.src = source;
    const download = node('a', '원본 내려받기', 'text-link');
    download.href = source + '?download=1';
    const record = node('p',
      '◎ 결제자\n▶ ' + row.payer + '\n\n◎ 결제내역 설명\n' +
      [row.paid_date.replaceAll('-', '.'), row.account_group, row.account_section, row.account_item].join(' - ') +
      '\n▶ ' + row.description, 'workspace-body');
    const status = node('p', undefined, 'workspace-meta');
    const action = button('', 'primary');
    const actionError = node('p', undefined, 'task-form-error');
    actionError.setAttribute('role', 'alert');
    let reviewed = Boolean(row.reviewed_at);
    function paintStatus() {
      status.textContent = reviewed ? '상태 · 확인 완료' : '상태 · 검토 대기';
      action.textContent = reviewed ? '검토 대기로 되돌리기' : '확인 완료';
    }
    paintStatus();
    action.addEventListener('click', async () => {
      action.disabled = true;
      actionError.textContent = '';
      try {
        const { receipt } = await request('/receipts/' + row.id + '/review', { reviewed: !reviewed });
        upsertReceipt(receipt);
        reviewed = Boolean(receipt.reviewed_at);
        paintStatus();
        notify(reviewed ? '확인 완료로 표시했어요.' : '검토 대기로 되돌렸어요.');
      } catch (error) {
        actionError.textContent = '검토 상태를 저장하지 못했어요. ' + errorText(error);
      } finally {
        action.disabled = false;
      }
    });
    for (const item of [record, imageError, actionError]) item.style.margin = '.65rem 0';
    openDialog(row.title, [preview, imageError, download, record, status, action, actionError]);
  }

  async function readReceipts() {
    if (receiptLoad) return receiptLoad;
    receiptLoad = (async () => {
      const revision = receiptListRevision;
      try {
        const data = await request('/receipts');
        if (revision === receiptListRevision) receipts = data.receipts;
        else {
          const rows = new Map(data.receipts.map(item => [item.id, item]));
          for (const item of receipts) rows.set(item.id, item);
          receipts = [...rows.values()].sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));
        }
        receiptReady = true;
        receiptLoadError = '';
      } catch (error) {
        receiptLoadError = errorText(error);
      }
      paintReceipts();
    })();
    try {
      await receiptLoad;
    } finally {
      receiptLoad = null;
    }
  }

  function autoName() {
    const form = new FormData(receiptForm);
    const parts = ['paidDate', 'accountGroup', 'accountSection', 'accountItem', 'payer']
      .map(key => String(form.get(key) || '').trim());
    parts[0] = parts[0].replaceAll('-', '.');
    $('receiptNamePreview').textContent = parts.every(Boolean) ? parts.join(' - ') : '결제일, 관·항·목과 결제자를 입력하면 이름이 만들어집니다.';
  }

  function clearPhoto() {
    selectedFile = null;
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    receiptPreview = null;
    $('receiptPreview').removeAttribute('src');
    $('receiptPreview').hidden = true;
    $('receiptFileLabel').textContent = '사진 1장 · 최대 ' + photoLimit + ' MB';
  }

  function setPhoto(file) {
    if (!file) return;
    $('receiptPhotoError').textContent = '';
    cameraButton.setAttribute('aria-invalid', 'false');
    if (file.size > photoLimit * 1024 * 1024) {
      $('receiptPhotoError').textContent = photoLimit + ' MB 이하의 사진을 선택해 주세요.';
      return;
    }
    clearPhoto();
    submissionId = null;
    selectedFile = file;
    $('receiptFileLabel').textContent = file.name || '선택한 사진';
    receiptPreview = URL.createObjectURL(file);
    const image = $('receiptPreview');
    image.hidden = false;
    image.src = receiptPreview;
  }

  function stopCamera() {
    cameraVersion++;
    cameraStream?.getTracks().forEach(track => track.stop());
    cameraStream = null;
    cameraVideo.srcObject = null;
    cameraPanel.hidden = true;
    shutter.disabled = true;
    cameraButton.disabled = false;
  }

  function showCameraFallback(error) {
    $('receiptCameraFallback').hidden = false;
    $('receiptExternal').hidden = window.top === window.self;
    $('receiptCameraStatus').textContent = error?.name === 'NotAllowedError'
      ? '카메라 권한을 허용해 주세요. 앱 안에서 권한을 줄 수 없으면 브라우저에서 직접 여세요.'
      : '카메라를 열 수 없어요. 기기 카메라로 다시 시도하거나 사진첩에서 선택하세요.';
  }

  cameraButton.addEventListener('click', async () => {
    if (uploading) return;
    stopCamera();
    $('receiptCameraFallback').hidden = true;
    $('receiptUploadError').textContent = '';
    if (!navigator.mediaDevices?.getUserMedia) {
      showCameraFallback();
      return;
    }
    cameraButton.disabled = true;
    cameraPanel.hidden = false;
    const version = cameraVersion;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      });
      if (!uploadDialog.open || version !== cameraVersion) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      cameraStream = stream;
      cameraVideo.srcObject = stream;
      await cameraVideo.play();
      if (version === cameraVersion) shutter.disabled = false;
    } catch (error) {
      if (version === cameraVersion && uploadDialog.open) {
        stopCamera();
        showCameraFallback(error);
      }
    }
  });

  shutter.addEventListener('click', () => {
    if (!cameraVideo.videoWidth || !cameraVideo.videoHeight || shutter.disabled) return;
    shutter.disabled = true;
    const version = cameraVersion;
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1920 / Math.max(cameraVideo.videoWidth, cameraVideo.videoHeight));
      canvas.width = Math.max(1, Math.round(cameraVideo.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(cameraVideo.videoHeight * scale));
      canvas.getContext('2d').drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (!uploadDialog.open || version !== cameraVersion) return;
        stopCamera();
        if (!blob) {
          showCameraFallback();
          return;
        }
        setPhoto(new File([blob], '영수증-' + paidDate.value + '.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.9);
    } catch {
      stopCamera();
      showCameraFallback();
    }
  });
  $('cancelCamera').addEventListener('click', () => {
    stopCamera();
    cameraButton.focus();
  });
  $('receiptGalleryButton').addEventListener('click', () => gallery.click());
  $('receiptNativeCameraButton').addEventListener('click', () => nativeCamera.click());
  for (const picker of [nativeCamera, gallery]) {
    picker.addEventListener('change', () => {
      stopCamera();
      const photo = picker.files?.[0];
      picker.value = '';
      if (!photo) return;
      $('receiptCameraFallback').hidden = true;
      setPhoto(photo);
    });
  }
  const receiptFieldLabels = {
    payer: '결제자를 입력해 주세요.',
    paidDate: '올바른 결제일을 선택해 주세요.',
    accountGroup: '관을 입력해 주세요.',
    accountSection: '항을 입력해 주세요.',
    accountItem: '목을 입력해 주세요.',
    description: '사용 목적을 입력해 주세요.',
  };

  function markReceiptField(name, message) {
    const field = receiptForm.elements.namedItem(name);
    $(name + 'Error').textContent = message;
    field.setAttribute('aria-invalid', String(Boolean(message)));
    return field;
  }

  function resetReceiptDraft() {
    receiptForm.reset();
    pendingForm = null;
    submissionId = null;
    editedPaidDate = false;
    clearPhoto();
    $('receiptPhotoError').textContent = '';
    for (const name of Object.keys(receiptFieldLabels)) markReceiptField(name, '');
    receiptError.textContent = '';
    receiptProgress.textContent = '';
    receiptDraftInitialized = false;
  }

  function showReceiptFormState() {
    const locked = Boolean(pendingForm);
    receiptForm.hidden = Boolean(confirmedReceipt);
    receiptConfirmation.hidden = !confirmedReceipt;
    receiptSubmit.disabled = uploading;
    receiptSubmit.setAttribute('aria-busy', String(uploading));
    receiptSubmit.textContent = uploading ? '등록 중…' : locked ? '같은 영수증 다시 확인' : '영수증 등록';
    $('receiptDraftNote').textContent = locked && !uploading
      ? '중복 등록을 막기 위해 같은 내용으로만 다시 확인할 수 있어요.'
      : '이 탭에서 닫았다 열면 작성 중인 내용이 남아 있어요.';
    for (const group of receiptForm.querySelectorAll('fieldset')) group.disabled = uploading || locked;
    if (confirmedReceipt) {
      $('receiptConfirmedName').textContent = confirmedReceipt.title;
      $('receiptConfirmedStatus').textContent = confirmedReceipt.reviewed_at ? '접수됨 · 확인 완료' : '접수됨 · 검토 대기';
      if (uploadDialog.open) $('receiptConfirmedHeading').focus();
    }
  }

  function fitReceiptDialog() {
    if (!uploadDialog.open || !window.visualViewport) return;
    uploadDialog.style.setProperty('--receipt-viewport', window.visualViewport.height + 'px');
    uploadDialog.style.setProperty('--receipt-viewport-offset', window.visualViewport.offsetTop + 'px');
  }
  window.visualViewport?.addEventListener('resize', fitReceiptDialog);
  window.visualViewport?.addEventListener('scroll', fitReceiptDialog);

  function syncReceiptRoute(page) {
    const open = page === 'finance' && query().get('new') === '1';
    if (!open) {
      if (uploadDialog.open) {
        uploadDialog.close();
        if (confirmedReceipt) {
          confirmedReceipt = null;
          resetReceiptDraft();
        }
      }
      return;
    }
    if (uploadDialog.open) return;

    if (!receiptDraftInitialized && !confirmedReceipt) {
      paidDate.value = window.komkedClock.today();
      receiptDraftInitialized = true;
      autoName();
    }
    $('receiptCameraFallback').hidden = true;
    showReceiptFormState();
    uploadDialog.showModal();
    fitReceiptDialog();
    if (confirmedReceipt) $('receiptConfirmedHeading').focus();
    else $('addReceiptTitle').focus();

    const version = ++receiptVersion;
    void window.komkedClock.sync().then(() => {
      if (uploadDialog.open && version === receiptVersion && !editedPaidDate && !uploading && !pendingForm && !confirmedReceipt) {
        paidDate.value = window.komkedClock.today();
        autoName();
      }
    });
  }

  function dismissReceipt() {
    if (confirmedReceipt) {
      confirmedReceipt = null;
      resetReceiptDraft();
    }
    if (history.state?.receiptEditor) history.back();
    else {
      history.replaceState(null, '', '#finance');
      showPage('finance', true);
    }
  }

  $('receiptPreview').addEventListener('error', () => { $('receiptPreview').hidden = true; });
  for (const control of document.querySelectorAll('[data-receipt-start]')) {
    control.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate('finance?new=1', { receiptEditor: true });
    });
  }
  $('cancelReceipt').addEventListener('click', dismissReceipt);
  $('closeReceiptConfirmation').addEventListener('click', dismissReceipt);
  $('findConfirmedReceipt').addEventListener('click', () => {
    if (!confirmedReceipt) return;
    const route = 'finance?receipt=' + encodeURIComponent(confirmedReceipt.id);
    confirmedReceipt = null;
    resetReceiptDraft();
    history.replaceState(null, '', '#' + route);
    showPage(route, true);
  });
  uploadDialog.addEventListener('cancel', event => {
    event.preventDefault();
    dismissReceipt();
  });
  uploadDialog.addEventListener('close', () => {
    receiptVersion++;
    stopCamera();
  });
  receiptForm.addEventListener('input', event => {
    const name = event.target.name;
    if (name === 'paidDate') editedPaidDate = true;
    if (Object.hasOwn(receiptFieldLabels, name)) markReceiptField(name, '');
    if (!pendingForm) submissionId = null;
    autoName();
  });

  function validateReceipt() {
    let firstInvalid = null;
    const missingPhoto = !selectedFile;
    $('receiptPhotoError').textContent = missingPhoto ? '사진이 필요해요. 촬영하거나 사진을 선택해 주세요.' : '';
    cameraButton.setAttribute('aria-invalid', String(missingPhoto));
    if (missingPhoto) firstInvalid = cameraButton;
    for (const [name, message] of Object.entries(receiptFieldLabels)) {
      const field = receiptForm.elements.namedItem(name);
      const invalid = !field.value.trim() || !field.validity.valid;
      markReceiptField(name, invalid ? message : '');
      if (invalid && !firstInvalid) firstInvalid = field;
    }
    if (firstInvalid) {
      receiptError.textContent = '표시된 입력 항목을 확인해 주세요.';
      firstInvalid.focus();
      return false;
    }
    return true;
  }

  function completeReceipt(receipt) {
    upsertReceipt(receipt);
    resetReceiptDraft();
    confirmedReceipt = receipt;
    receiptSearch.value = '';
    receiptStatus.value = 'pending';
    paintReceipts();
    if (!uploadDialog.open) notify('영수증이 접수됐어요.');
  }

  receiptForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (uploading) return;
    receiptError.textContent = '';
    if (!pendingForm) {
      if (!validateReceipt()) return;
      const form = new FormData(receiptForm);
      submissionId ??= crypto.randomUUID();
      form.set('id', submissionId);
      form.set('image', selectedFile);
      pendingForm = form;
    }
    const submitted = pendingForm;
    stopCamera();
    uploading = true;
    receiptProgress.textContent = '사진과 결제 정보를 보내는 중입니다.';
    showReceiptFormState();

    try {
      const { receipt } = await request('/receipts', submitted, AbortSignal.timeout?.(35000));
      completeReceipt(receipt);
    } catch (failure) {
      const rejected = failure.status >= 400 && failure.status < 500 && failure.status !== 408;
      if (rejected) {
        pendingForm = null;
        receiptError.textContent = '등록하지 못했어요. ' + errorText(failure);
      } else {
        receiptProgress.textContent = '서버에서 접수 여부를 확인하는 중입니다.';
        try {
          const { receipt } = await request('/receipts/' + submissionId, undefined, AbortSignal.timeout?.(6000));
          completeReceipt(receipt);
        } catch {
          receiptError.textContent = '접수 여부를 확인하지 못했어요. 입력한 내용과 사진은 그대로 있습니다. 다시 확인하면 같은 요청을 사용합니다.';
        }
      }
    } finally {
      uploading = false;
      receiptProgress.textContent = '';
      showReceiptFormState();
      if (uploadDialog.open && receiptError.textContent) receiptError.focus();
    }
  });
  receiptStatus.addEventListener('change', paintReceipts);
  receiptSearch.addEventListener('input', paintReceipts);

  let messages = [];
  let messageTotal;
  let nextMessagePage;
  let messageLoad;
  let messageLoadError = '';
  const drafts = new Map();

  function meta(item) {
    return node('div', item.author + ' · ' + dateDisplay(item.created_at), 'workspace-meta');
  }

  function patchMessage(item) {
    const article = node('article', undefined, 'workspace-message');
    const details = node('details');
    const commentCount = node('summary', '댓글 ' + item.comments.length + '개');
    const comments = node('ul', undefined, 'workspace-comments');
    const form = node('form', undefined, 'workspace-form workspace-comment-form');
    const input = node('textarea');
    const label = node('label', '댓글');
    input.id = 'comment-' + item.id;
    input.required = true;
    input.maxLength = 1000;
    input.rows = 2;
    label.htmlFor = input.id;
    const error = node('p', undefined, 'task-form-error');
    error.setAttribute('role', 'alert');
    const actions = node('div', undefined, 'workspace-form-actions');
    const submit = node('button', '댓글 달기', 'secondary');
    submit.type = 'submit';
    actions.append(submit);
    form.append(label, input, actions, error);

    const draft = drafts.get(item.id) || { text: '', open: false, id: null };
    input.value = draft.text;
    details.open = draft.open;
    drafts.set(item.id, draft);
    details.addEventListener('toggle', () => { draft.open = details.open; });
    input.addEventListener('input', () => {
      draft.text = input.value;
      draft.id = null;
      error.textContent = '';
    });

    function paintComments() {
      comments.replaceChildren();
      commentCount.textContent = '댓글 ' + item.comments.length + '개';
      for (const comment of item.comments) {
        const li = node('li');
        li.append(meta(comment), node('p', comment.body, 'workspace-body'));
        comments.append(li);
      }
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!input.value.trim()) {
        error.textContent = '댓글 내용을 입력해 주세요.';
        return;
      }
      draft.id ??= crypto.randomUUID();
      input.disabled = submit.disabled = true;
      error.textContent = '';
      try {
        const { comment } = await request('/messages/' + item.id + '/comments', { id: draft.id, body: input.value });
        const current = messages.find(message => message.id === item.id);
        for (const target of new Set([item, current].filter(Boolean))) {
          if (!target.comments.some(entry => entry.id === comment.id)) target.comments.push(comment);
        }
        draft.id = null;
        draft.text = '';
        input.value = '';
        if (article.isConnected) paintComments();
        else paintMessages();
        notify('댓글을 남겼어요.');
      } catch (failure) {
        error.textContent = '댓글을 남기지 못했어요. ' + errorText(failure);
      } finally {
        input.disabled = submit.disabled = false;
      }
    });
    paintComments();
    details.append(commentCount, comments, form);
    article.append(meta(item), node('p', item.body, 'workspace-body'), details);
    return article;
  }

  function paintMessages() {
    $('reloadMessages').disabled = Boolean(messageLoad);
    document.querySelector('[data-message-count]').textContent = messageTotal ?? '—';
    const brief = $('briefMessages');
    brief.replaceChildren();
    for (const message of messages.slice(0, 2)) brief.append(link('communication', message.body));
    if (!messages.length) brief.append(node('p', messageTotal === 0 ? '아직 올라온 메시지가 없습니다.' : '소통에서 팀 메시지를 확인할 수 있어요.', 'workspace-empty'));

    const feed = $('messageFeed');
    const contents = [];
    if (messageLoadError) contents.push(node('p', '메시지를 불러오지 못했어요. ' + messageLoadError, 'workspace-empty'));
    if (messages.length) contents.push(...messages.map(patchMessage));
    else if (!messageLoadError) contents.push(node('p', messageTotal === 0 ? '첫 메시지를 남겨 보세요.' : '메시지를 불러오는 중…', 'workspace-empty'));
    if (nextMessagePage) {
      const more = button('이전 메시지 더 보기');
      more.disabled = Boolean(messageLoad);
      more.addEventListener('click', () => void readMessages(nextMessagePage));
      contents.push(more);
    }
    feed.replaceChildren(...contents);
  }

  async function readMessages(before) {
    if (messageLoad) return messageLoad;
    $('reloadMessages').disabled = true;
    messageLoad = (async () => {
      try {
        const suffix = before ? '?before=' + encodeURIComponent(before) : '';
        const result = await request('/messages' + suffix);
        messages = before ? [...new Map([...messages, ...result.messages].map(item => [item.id, item])).values()] : result.messages;
        messageTotal = result.total;
        nextMessagePage = result.next;
        messageLoadError = '';
      } catch (error) {
        messageLoadError = errorText(error);
      }
    })();
    try {
      await messageLoad;
    } finally {
      messageLoad = null;
      paintMessages();
    }
  }

  const messageForm = $('messageForm');
  const messageBody = $('messageBody');
  let postId;
  messageBody.addEventListener('input', () => {
    postId = null;
    $('messageError').textContent = '';
  });
  messageForm.addEventListener('submit', async event => {
    event.preventDefault();
    const error = $('messageError');
    const submit = messageForm.querySelector('[type="submit"]');
    if (submit.disabled) return;
    if (!messageBody.value.trim()) {
      error.textContent = '메시지 내용을 입력해 주세요.';
      return;
    }
    postId ??= crypto.randomUUID();
    submit.disabled = messageBody.disabled = true;
    error.textContent = '';
    try {
      const { message } = await request('/messages', { id: postId, body: messageBody.value });
      const exists = messages.some(item => item.id === message.id);
      if (!exists) messages.unshift(message);
      if (!exists && messageTotal !== undefined) messageTotal++;
      messageBody.value = '';
      postId = null;
      paintMessages();
      notify('메시지를 올렸어요.');
    } catch (failure) {
      error.textContent = '메시지를 올리지 못했어요. ' + errorText(failure);
    } finally {
      submit.disabled = messageBody.disabled = false;
    }
  });

  $('reloadMessages').addEventListener('click', () => void readMessages());
  function showPageData(page) {
    syncReceiptRoute(page);
    if (page === 'home' || page === 'communication') void readMessages();
    if (page === 'home') void readReceipts();
    if (page === 'finance') {
      const requested = query();
      if (requested.get('new') === '1') return;
      receiptStatus.value = requested.get('status') === 'pending' ? 'pending' : '';
      receiptSearch.value = '';
      paintReceipts();
      const route = location.hash;
      void readReceipts().then(() => {
        const id = requested.get('receipt');
        if (id && route === location.hash) showReceipt(id);
      });
    }
  }

  document.addEventListener('komked:page', event => showPageData(event.detail));
  paintReceipts();
  paintMessages();
  showPageData(location.hash.slice(1).split('?')[0] || 'home');
})();
