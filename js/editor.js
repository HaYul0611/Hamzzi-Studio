/* === editor.js — UI 컨트롤, 인터랙션 및 60fps 마우스 드래그 (V2 종합 개선) === */

var Editor = (function () {

  var HAMSTERS = [
    { id: 'default', label: '기본', file: 'assets/hamsters/default.jpg' },
    { id: 'happy', label: '행복', file: 'assets/hamsters/happy.jpg' },
    { id: 'surprised', label: '놀람', file: 'assets/hamsters/surprised.jpg' },
    { id: 'smile', label: '미소', file: 'assets/hamsters/smile.jpg' },
    { id: 'sleepy', label: '졸림', file: 'assets/hamsters/sleepy.jpg' },
    { id: 'sad', label: '슬픔', file: 'assets/hamsters/sad.jpg' },
    { id: 'crying', label: '우는', file: 'assets/hamsters/crying.jpg' },
    { id: 'angry', label: '화남', file: 'assets/hamsters/angry.jpg' },
    { id: 'annoyed', label: '짜증', file: 'assets/hamsters/annoyed.jpg' },
    { id: 'touched', label: '감동', file: 'assets/hamsters/touched.jpg' }
  ];

  /* 종합 편집 상태 */
  var state = {
    image: null,
    imageDataUrl: '',
    hamsterId: 'default',
    ratio: '1:1',
    fitMode: 'cover',   /* 'cover' (채우기) | 'contain' (맞춤 - 여백에 배경색 채움) */
    imagePanX: 0,       /* -100 ~ 100 */
    imagePanY: 0,
    imageZoom: 100,     /* 50 ~ 250 % */
    fontFamily: "'Noto Sans KR', sans-serif",
    text: '',
    fontSize: 32,
    textColor: '#ffffff',
    textX: 50,
    textY: 50,
    bubble: 'none',
    bubbleColor: '#ffffff',
    bgColor: '#f5f5f5',
    transparentBg: false,
    originalImage: null, /* 누끼 복원용 원본 이미지 인스턴스 */
    selectedStickerId: null,
    stickers: []        /* [{ id, icon, x, y, size }] */
  };

  /* DOM 요소 캐시 */
  var previewCanvas, downloadCanvas, toastEl, clearImageBtn;
  var textInput, fontSizeInput, fontSizeVal, textColorInput, colorHex;
  var textXInput, textXVal, textYInput, textYVal;
  var bubbleColorSec, bubbleColorInput, bubbleColorHex;
  var bgColorInput, bgColorHex, transparentBgCheck;
  var fitCoverBtn, fitContainBtn, fitModeDesc, imgZoomInput, imgZoomVal, resetPanBtn;
  var fontFamilySelect, undoBtn, redoBtn, activeStickersWrap;
  var selectedStickerId = null;

  var hamsterImages = {}; /* 고성능 이미지 캐시 */

  /* 실행 취소 / 다시 실행 (Undo / Redo) 히스토리 */
  var historyStack = [];
  var historyIndex = -1;
  var MAX_HISTORY = 30;
  var isHistoryAction = false;

  /* 마우스 & 터치 드래그 상태 */
  var dragTarget = null; /* 'text' | 'sticker' | 'image' */
  var activeStickerIndex = -1;
  var dragStartMouseX = 0;
  var dragStartMouseY = 0;
  var dragStartTextX = 50;
  var dragStartTextY = 50;
  var dragStartPanX = 0;
  var dragStartPanY = 0;
  var dragStartStickerX = 50;
  var dragStartStickerY = 50;
  var rafDragId = null;

  function init() {
    cacheDomElements();
    buildHamsterGrid();
    bindControls();
    bindDragAndDropUpload();
    bindCanvasInteractions();
    bindShortcuts();
    loadDefaultHamster();
    pushHistory();
  }

  function cacheDomElements() {
    previewCanvas = document.getElementById('previewCanvas');
    downloadCanvas = document.getElementById('downloadCanvas');
    toastEl = document.getElementById('toast');
    clearImageBtn = document.getElementById('clearImageBtn');

    textInput = document.getElementById('textInput');
    fontSizeInput = document.getElementById('fontSize');
    fontSizeVal = document.getElementById('fontSizeVal');
    textColorInput = document.getElementById('textColor');
    colorHex = document.getElementById('colorHex');

    textXInput = document.getElementById('textX');
    textXVal = document.getElementById('textXVal');
    textYInput = document.getElementById('textY');
    textYVal = document.getElementById('textYVal');

    bubbleColorSec = document.getElementById('bubbleColorSection');
    bubbleColorInput = document.getElementById('bubbleColor');
    bubbleColorHex = document.getElementById('bubbleColorHex');

    bgColorInput = document.getElementById('bgColor');
    bgColorHex = document.getElementById('bgColorHex');
    transparentBgCheck = document.getElementById('transparentBgCheck');

    fitCoverBtn = document.getElementById('fitCoverBtn');
    fitContainBtn = document.getElementById('fitContainBtn');
    fitModeDesc = document.getElementById('fitModeDesc');
    imgZoomInput = document.getElementById('imgZoom');
    imgZoomVal = document.getElementById('imgZoomVal');
    resetPanBtn = document.getElementById('resetPanBtn');

    fontFamilySelect = document.getElementById('fontFamily');
    undoBtn = document.getElementById('undoBtn');
    redoBtn = document.getElementById('redoBtn');
    activeStickersWrap = document.getElementById('activeStickersWrap');
  }

  function getState() { return state; }

  /* --- 히스토리 관리 (Undo / Redo) --- */
  function pushHistory() {
    if (isHistoryAction) return;
    /* 스택 트렁케이트 */
    if (historyIndex < historyStack.length - 1) {
      historyStack = historyStack.slice(0, historyIndex + 1);
    }
    /* 상태 스냅샷 저장 (Image 인스턴스는 유지) */
    var snapshot = JSON.parse(JSON.stringify({
      imageDataUrl: state.imageDataUrl,
      hamsterId: state.hamsterId,
      ratio: state.ratio,
      fitMode: state.fitMode,
      imagePanX: state.imagePanX,
      imagePanY: state.imagePanY,
      imageZoom: state.imageZoom,
      fontFamily: state.fontFamily,
      text: state.text,
      fontSize: state.fontSize,
      textColor: state.textColor,
      textX: state.textX,
      textY: state.textY,
      bubble: state.bubble,
      bubbleColor: state.bubbleColor,
      bgColor: state.bgColor,
      transparentBg: state.transparentBg,
      stickers: state.stickers
    }));

    historyStack.push({ snapshot: snapshot, image: state.image, originalImage: state.originalImage });
    if (historyStack.length > MAX_HISTORY) historyStack.shift();
    historyIndex = historyStack.length - 1;
    updateUndoRedoBtns();
  }

  function undo() {
    if (historyIndex > 0) {
      historyIndex--;
      applyHistoryState(historyStack[historyIndex]);
    }
  }

  function redo() {
    if (historyIndex < historyStack.length - 1) {
      historyIndex++;
      applyHistoryState(historyStack[historyIndex]);
    }
  }

  function applyHistoryState(item) {
    isHistoryAction = true;
    var s = item.snapshot;
    state.imageDataUrl = s.imageDataUrl;
    state.hamsterId = s.hamsterId;
    state.ratio = s.ratio;
    state.fitMode = s.fitMode;
    state.imagePanX = s.imagePanX;
    state.imagePanY = s.imagePanY;
    state.imageZoom = s.imageZoom;
    state.fontFamily = s.fontFamily;
    state.text = s.text;
    state.fontSize = s.fontSize;
    state.textColor = s.textColor;
    state.textX = s.textX;
    state.textY = s.textY;
    state.bubble = s.bubble;
    state.bubbleColor = s.bubbleColor;
    state.bgColor = s.bgColor;
    state.transparentBg = s.transparentBg || false;
    state.stickers = s.stickers || [];
    state.image = item.image;
    state.originalImage = item.originalImage || item.image;

    var revertBtn = document.getElementById('revertCutoutBtn');
    if (revertBtn) {
      revertBtn.disabled = (!state.originalImage || state.image === state.originalImage);
    }

    syncUiFromState();
    renderPreview();
    updateUndoRedoBtns();
    isHistoryAction = false;
  }

  function updateUndoRedoBtns() {
    if (undoBtn) undoBtn.disabled = (historyIndex <= 0);
    if (redoBtn) redoBtn.disabled = (historyIndex >= historyStack.length - 1);
  }

  function bindShortcuts() {
    window.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault(); redo();
        } else {
          e.preventDefault(); undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault(); redo();
      }

      /* 키보드 Delete / Backspace 키로 선택한 스티커 개별 삭제 */
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedStickerId) {
        e.preventDefault();
        deleteStickerById(selectedStickerId);
      }
    });
  }

  /* --- 햄스터 그리드 --- */
  function buildHamsterGrid() {
    var grid = document.getElementById('hamsterGrid');
    var html = '';
    for (var i = 0; i < HAMSTERS.length; i++) {
      var h = HAMSTERS[i];
      var cls = h.id === state.hamsterId ? ' active' : '';
      var imgSrc = (window.HamsterData && HamsterData[h.id]) || h.file;
      html += '<div class="hamster-thumb' + cls + '" data-id="' + h.id + '" tabindex="0" role="button" aria-label="' + h.label + ' 햄찌">' +
        '<img src="' + imgSrc + '" alt="' + h.label + '" loading="lazy">' +
        '<span class="thumb-label">' + h.label + '</span></div>';
    }
    grid.innerHTML = html;

    grid.addEventListener('click', function (e) {
      var thumb = e.target.closest('.hamster-thumb');
      if (!thumb) return;
      selectHamster(thumb.dataset.id);
    });

    grid.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var thumb = e.target.closest('.hamster-thumb');
        if (thumb) { e.preventDefault(); selectHamster(thumb.dataset.id); }
      }
    });
  }

  function selectHamster(id) {
    state.hamsterId = id;
    var thumbs = document.querySelectorAll('.hamster-thumb');
    thumbs.forEach(function (t) { t.classList.toggle('active', t.dataset.id === id); });

    var h = HAMSTERS.find(function (h) { return h.id === id; });
    if (!h) return;

    if (hamsterImages[id]) {
      state.image = hamsterImages[id];
      state.originalImage = hamsterImages[id];
      state.imageDataUrl = (window.HamsterData && HamsterData[id]) || '';
      var revertBtn = document.getElementById('revertCutoutBtn');
      if (revertBtn) revertBtn.disabled = true;
      updateClearBtn();
      renderPreview();
      pushHistory();
    } else {
      /* Tainted Canvas 완전 방지를 위해 Base64 HamsterData 우선 로드 */
      var sourceUrl = (window.HamsterData && HamsterData[id]) || h.file;
      Utils.loadImageFromUrl(sourceUrl, function (err, img) {
        if (err) {
          Utils.loadImageFromUrl(h.file, function (err2, img2) {
            if (err2) { Utils.showToast(toastEl, err2, 'error'); return; }
            hamsterImages[id] = img2;
            state.image = img2;
            state.originalImage = img2;
            state.imageDataUrl = '';
            var revertBtn2 = document.getElementById('revertCutoutBtn');
            if (revertBtn2) revertBtn2.disabled = true;
            updateClearBtn();
            renderPreview();
            pushHistory();
          });
          return;
        }
        hamsterImages[id] = img;
        state.image = img;
        state.originalImage = img;
        state.imageDataUrl = (window.HamsterData && HamsterData[id]) || '';
        var revertBtn3 = document.getElementById('revertCutoutBtn');
        if (revertBtn3) revertBtn3.disabled = true;
        updateClearBtn();
        renderPreview();
        pushHistory();
      });
    }
  }

  function loadDefaultHamster() {
    selectHamster('default');
  }

  function updateClearBtn() {
    if (clearImageBtn) {
      clearImageBtn.hidden = !state.image;
    }
  }

  /* --- UI 컨트롤 이벤트 바인딩 --- */
  function bindControls() {
    /* 실행 취소 & 다시 실행 버튼 */
    if (undoBtn) undoBtn.addEventListener('click', undo);
    if (redoBtn) redoBtn.addEventListener('click', redo);

    /* 우상단 'X' 이미지 취소/제거 버튼 */
    if (clearImageBtn) {
      clearImageBtn.addEventListener('click', function () {
        state.image = null;
        state.originalImage = null;
        state.hamsterId = '';
        state.imageDataUrl = '';
        document.querySelectorAll('.hamster-thumb').forEach(function (t) { t.classList.remove('active'); });
        var revertBtn = document.getElementById('revertCutoutBtn');
        if (revertBtn) revertBtn.disabled = true;
        updateClearBtn();
        renderPreview();
        pushHistory();
        Utils.showToast(toastEl, '이미지가 제거되었습니다.', 'success');
      });
    }

    /* 사진 맞춤 모드 UI 설명 갱신 헬퍼 */
    function updateFitModeUi() {
      var isCover = state.fitMode === 'cover';
      if (fitCoverBtn) fitCoverBtn.classList.toggle('active', isCover);
      if (fitContainBtn) fitContainBtn.classList.toggle('active', !isCover);
      if (fitModeDesc) {
        var svgIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> ';
        if (isCover) {
          fitModeDesc.innerHTML = svgIcon + '<span><strong>채우기 모드</strong>: 사진이 여백 없이 프레임을 꽉 채웁니다. <br>마우스 드래그로 노출 위치를 맞추세요.</span>';
        } else {
          fitModeDesc.innerHTML = svgIcon + '<span><strong>맞춤 모드</strong>: 사진 전체가 표시되며, 남는 여백은 <br>아래 [캔버스 배경색]으로 채워집니다.</span>';
        }
      }
    }

    /* 이미지 맞춤 모드 토글 (Cover vs Contain) */
    if (fitCoverBtn && fitContainBtn) {
      fitCoverBtn.addEventListener('click', function () {
        state.fitMode = 'cover';
        updateFitModeUi();
        renderPreview();
        pushHistory();
      });
      fitContainBtn.addEventListener('click', function () {
        state.fitMode = 'contain';
        updateFitModeUi();
        renderPreview();
        pushHistory();
      });
    }

    /* 이미지 줌(Zoom) 슬라이더 */
    if (imgZoomInput) {
      imgZoomInput.addEventListener('input', function (e) {
        state.imageZoom = parseInt(e.target.value, 10);
        if (imgZoomVal) imgZoomVal.textContent = state.imageZoom + '%';
        renderPreview();
      });
      imgZoomInput.addEventListener('change', pushHistory);
    }

    /* 줌 확대 / 축소 버튼 */
    var zoomInBtn = document.getElementById('zoomInBtn');
    var zoomOutBtn = document.getElementById('zoomOutBtn');
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', function () {
        var nz = Math.min(250, state.imageZoom + 15);
        state.imageZoom = nz;
        if (imgZoomInput) imgZoomInput.value = nz;
        if (imgZoomVal) imgZoomVal.textContent = nz + '%';
        renderPreview();
        pushHistory();
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', function () {
        var nz = Math.max(50, state.imageZoom - 15);
        state.imageZoom = nz;
        if (imgZoomInput) imgZoomInput.value = nz;
        if (imgZoomVal) imgZoomVal.textContent = nz + '%';
        renderPreview();
        pushHistory();
      });
    }

    /* 여백 투명 배경 토글 */
    if (transparentBgCheck) {
      transparentBgCheck.addEventListener('change', function (e) {
        state.transparentBg = e.target.checked;
        if (previewCanvas) {
          previewCanvas.classList.toggle('transparent-canvas', state.transparentBg);
        }
        renderPreview();
        pushHistory();
      });
    }

    /* 이미지 팬(Pan) 위치 초기화 */
    if (resetPanBtn) {
      resetPanBtn.addEventListener('click', function () {
        state.imagePanX = 0;
        state.imagePanY = 0;
        state.imageZoom = 100;
        if (imgZoomInput) imgZoomInput.value = 100;
        if (imgZoomVal) imgZoomVal.textContent = '100%';
        renderPreview();
        pushHistory();
        Utils.showToast(toastEl, '이미지 위치가 중앙으로 초기화되었습니다.', 'success');
      });
    }
    /* (processUploadedFile은 모듈 스코프로 이동 — 아래 참조) */

    /* 이미지 업로드 이벤트 바인딩 */
    var imgUploadInput = document.getElementById('imageUpload');
    if (imgUploadInput) {
      imgUploadInput.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;
        processUploadedFile(file);
        e.target.value = '';
      });
    }

    /* 누끼(배경 제거) 제어 버튼 바인딩 */
    var applyCutoutBtn = document.getElementById('applyCutoutBtn');
    var revertCutoutBtn = document.getElementById('revertCutoutBtn');
    var cutoutTolInput = document.getElementById('cutoutTolerance');
    var cutoutTolVal = document.getElementById('cutoutTolVal');

    if (cutoutTolInput && cutoutTolVal) {
      cutoutTolInput.addEventListener('input', function (e) {
        cutoutTolVal.textContent = e.target.value;
      });
    }

    if (applyCutoutBtn) {
      applyCutoutBtn.addEventListener('click', function () {
        var sourceImg = state.originalImage || state.image;
        if (!sourceImg) {
          Utils.showToast(toastEl, '누끼를 적용할 사진이 없습니다. 먼저 사진을 업로드해주세요.', 'error');
          return;
        }
        var tol = cutoutTolInput ? parseInt(cutoutTolInput.value, 10) : 35;
        Utils.createCutoutImage(sourceImg, { tolerance: tol }, function (err, cutImg) {
          if (err) {
            Utils.showToast(toastEl, '누끼 처리 실패: ' + err, 'error');
            return;
          }
          state.originalImage = sourceImg;
          state.image = cutImg;
          state.imageDataUrl = cutImg.src;
          if (revertCutoutBtn) revertCutoutBtn.disabled = false;
          renderPreview();
          pushHistory();
          Utils.showToast(toastEl, '🪄 배경 투명화(누끼)가 성공적으로 적용되었습니다!', 'success');
        });
      });
    }

    if (revertCutoutBtn) {
      revertCutoutBtn.addEventListener('click', function () {
        if (!state.originalImage) return;
        state.image = state.originalImage;
        state.imageDataUrl = state.originalImage.src || '';
        revertCutoutBtn.disabled = true;
        renderPreview();
        pushHistory();
        Utils.showToast(toastEl, '배경 제거 전 원본 사진으로 복원되었습니다.', 'success');
      });
    }

    /* 토스트 클릭 시 즉시 부드럽게 닫기 */
    if (toastEl) {
      toastEl.addEventListener('click', function () {
        clearTimeout(toastEl._timer);
        clearTimeout(toastEl._fadeTimer);
        toastEl.classList.add('hide-out');
        setTimeout(function () {
          toastEl.className = 'toast';
          toastEl.hidden = true;
          toastEl.setAttribute('hidden', '');
          toastEl.textContent = '';
        }, 200);
      });
    }

    /* 글꼴(폰트) 슬라이딩 드로어 초기화 */
    initFontPicker();
    if (fontFamilySelect) {
      fontFamilySelect.addEventListener('change', function (e) {
        state.fontFamily = e.target.value;
        syncFontPickerUi(state.fontFamily);
        renderPreview();
        pushHistory();
      });
    }

    /* 밈 퀵 프리셋 칩 */
    var memeChips = document.getElementById('memeChips');
    if (memeChips) {
      memeChips.addEventListener('click', function (e) {
        var btn = e.target.closest('.chip-btn');
        if (!btn) return;
        var txt = btn.dataset.text;
        textInput.value = txt;
        state.text = txt;
        renderPreview();
        pushHistory();
      });
    }

    /* 문구 인라인 특정 글자색 적용 툴바 */
    var inlineColorChips = document.getElementById('inlineColorChips');
    if (inlineColorChips) {
      inlineColorChips.addEventListener('click', function (e) {
        var btn = e.target.closest('.cpre');
        if (!btn) return;
        var c = btn.dataset.color;
        applyInlineColor(c);
      });
    }

    /* 문구 입력 */
    textInput.addEventListener('input', function (e) {
      state.text = e.target.value;
      renderPreview();
    });
    textInput.addEventListener('change', pushHistory);

    /* 글자 크기 */
    fontSizeInput.addEventListener('input', function (e) {
      state.fontSize = parseInt(e.target.value, 10);
      fontSizeVal.textContent = state.fontSize;
      renderPreview();
    });
    fontSizeInput.addEventListener('change', pushHistory);

    /* 기본 글자 색 */
    textColorInput.addEventListener('input', function (e) {
      state.textColor = e.target.value;
      colorHex.textContent = e.target.value;
      renderPreview();
    });
    textColorInput.addEventListener('change', pushHistory);

    /* 기본 글자 색 프리셋 */
    document.getElementById('colorPresets').addEventListener('click', function (e) {
      var btn = e.target.closest('.cpre');
      if (!btn) return;
      var c = btn.dataset.color;
      state.textColor = c;
      textColorInput.value = c;
      colorHex.textContent = c;
      renderPreview();
      pushHistory();
    });

    /* 문구 위치 프리셋 버튼 */
    document.querySelectorAll('.pos-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.pos-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var pos = btn.dataset.pos;
        if (pos === 'top') state.textY = 15;
        else if (pos === 'center') state.textY = 50;
        else state.textY = 85;
        textYInput.value = state.textY;
        textYVal.textContent = state.textY + '%';
        renderPreview();
        pushHistory();
      });
    });

    /* Y 위치 슬라이더 */
    textYInput.addEventListener('input', function (e) {
      state.textY = parseInt(e.target.value, 10);
      textYVal.textContent = state.textY + '%';
      document.querySelectorAll('.pos-btn').forEach(function (b) { b.classList.remove('active'); });
      renderPreview();
    });
    textYInput.addEventListener('change', pushHistory);

    /* X 위치 슬라이더 */
    textXInput.addEventListener('input', function (e) {
      state.textX = parseInt(e.target.value, 10);
      textXVal.textContent = state.textX + '%';
      renderPreview();
    });
    textXInput.addEventListener('change', pushHistory);

    /* 스티커 카테고리 탭 필터 */
    var stickerTabs = document.getElementById('stickerTabs');
    if (stickerTabs) {
      stickerTabs.addEventListener('click', function (e) {
        var tab = e.target.closest('.stk-tab');
        if (!tab) return;
        document.querySelectorAll('.stk-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var cat = tab.dataset.cat || 'all';

        document.querySelectorAll('#stickerRow .stk-btn').forEach(function (btn) {
          if (cat === 'all' || btn.dataset.cat === cat) {
            btn.hidden = false;
          } else {
            btn.hidden = true;
          }
        });
      });
    }

    /* 스티커 추가 */
    var stickerRow = document.getElementById('stickerRow');
    if (stickerRow) {
      stickerRow.addEventListener('click', function (e) {
        var btn = e.target.closest('.stk-btn');
        if (!btn) return;
        var icon = btn.dataset.stk;
        var newSticker = {
          id: Utils.generateId(),
          icon: icon,
          x: 50 + (Math.random() * 10 - 5),
          y: 40 + (Math.random() * 10 - 5),
          size: 44
        };
        state.stickers.push(newSticker);
        selectedStickerId = newSticker.id;
        renderActiveStickersUi();
        renderPreview();
        pushHistory();
        Utils.showToast(toastEl, icon + ' ' + getStickerName(icon) + ' 스티커가 추가되었습니다. 캔버스에서 드래그하여 배치하세요.', 'success');
      });
    }

    /* 스티커 모두 지우기 */
    var clearStickersBtn = document.getElementById('clearStickersBtn');
    if (clearStickersBtn) {
      clearStickersBtn.addEventListener('click', function () {
        state.stickers = [];
        selectedStickerId = null;
        renderActiveStickersUi();
        renderPreview();
        pushHistory();
        Utils.showToast(toastEl, '모든 스티커가 제거되었습니다.', 'success');
      });
    }

    /* 선택한 스티커 크기 미세조절 슬라이더 이벤트 */
    var stkScaleSlider = document.getElementById('stkScaleSlider');
    var stkScaleVal = document.getElementById('stkScaleVal');
    if (stkScaleSlider) {
      stkScaleSlider.addEventListener('input', function (e) {
        if (!selectedStickerId) return;
        var s = (state.stickers || []).find(function (item) { return item.id === selectedStickerId; });
        if (s) {
          s.size = parseInt(e.target.value, 10);
          if (stkScaleVal) stkScaleVal.textContent = s.size + 'px';
          renderPreview();
        }
      });
      stkScaleSlider.addEventListener('change', pushHistory);
    }

    /* 화면비 선택 */
    document.querySelectorAll('.ratio-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.ratio-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.ratio = btn.dataset.ratio;
        renderPreview();
        pushHistory();
      });
    });

    /* 말풍선 모양 선택 */
    document.getElementById('bubbleRow').addEventListener('click', function (e) {
      var btn = e.target.closest('.bub-btn');
      if (!btn) return;
      document.querySelectorAll('.bub-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      state.bubble = btn.dataset.bubble;

      if (bubbleColorSec) {
        bubbleColorSec.hidden = (state.bubble === 'none');
      }
      renderPreview();
      pushHistory();
    });

    /* 말풍선 색상 피커 */
    if (bubbleColorInput) {
      bubbleColorInput.addEventListener('input', function (e) {
        state.bubbleColor = e.target.value;
        if (bubbleColorHex) bubbleColorHex.textContent = e.target.value;
        renderPreview();
      });
      bubbleColorInput.addEventListener('change', pushHistory);
    }

    /* 말풍선 색상 프리셋 */
    var bColorPresets = document.getElementById('bubbleColorPresets');
    if (bColorPresets) {
      bColorPresets.addEventListener('click', function (e) {
        var btn = e.target.closest('.cpre');
        if (!btn) return;
        var c = btn.dataset.color;
        state.bubbleColor = c;
        if (bubbleColorInput) bubbleColorInput.value = c;
        if (bubbleColorHex) bubbleColorHex.textContent = c;
        renderPreview();
        pushHistory();
      });
    }

    /* 배경색 피커 */
    bgColorInput.addEventListener('input', function (e) {
      state.bgColor = e.target.value;
      bgColorHex.textContent = e.target.value;
      renderPreview();
    });
    bgColorInput.addEventListener('change', pushHistory);

    /* 배경색 프리셋 */
    var bgPresets = document.getElementById('bgColorPresets');
    if (bgPresets) {
      bgPresets.addEventListener('click', function (e) {
        var btn = e.target.closest('.cpre');
        if (!btn) return;
        var c = btn.dataset.color;
        state.bgColor = c;
        bgColorInput.value = c;
        bgColorHex.textContent = c;
        renderPreview();
        pushHistory();
      });
    }

    /* 클립보드 바로 복사 (One-Click Copy) */
    var copyBtn = document.getElementById('copyClipboardBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', copyToClipboard);
    }

    /* 저장 포맷 & 해상도 선택기 (슬라이딩 글라이더 & 4K UHD 지원) */
    var currentFormat = 'png';
    var currentResolution = 1080;
    var formatSelector = document.getElementById('exportFormatSelector');
    var mainDownloadBtn = document.getElementById('mainDownloadBtn');
    var mainDownloadText = document.getElementById('mainDownloadText');

    function updateExportGlider(activeBtn) {
      var glider = document.getElementById('exportGlider');
      var track = document.getElementById('exportChipsTrack');
      if (!glider || !track) return;
      var btn = activeBtn || track.querySelector('.export-chip.active');
      if (!btn) return;

      var apply = function () {
        var left = btn.offsetLeft;
        var width = btn.offsetWidth;
        if (!width || width === 0) {
          var trackRect = track.getBoundingClientRect();
          var btnRect = btn.getBoundingClientRect();
          left = btnRect.left - trackRect.left;
          width = btnRect.width;
        }
        if (width > 0) {
          glider.style.left = left + 'px';
          glider.style.width = width + 'px';
          glider.style.transform = 'none';
        }
      };

      apply();
      requestAnimationFrame(apply);
    }

    if (formatSelector) {
      formatSelector.addEventListener('click', function (e) {
        var chip = e.target.closest('.export-chip');
        if (!chip) return;
        document.querySelectorAll('.export-chip').forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');
        currentFormat = chip.dataset.format || 'png';
        currentResolution = parseInt(chip.dataset.res || '1080', 10);
        updateExportGlider(chip);

        if (mainDownloadText) {
          if (currentResolution >= 3000) {
            mainDownloadText.textContent = '4K 초고화질 다운로드 (3840px)';
          } else if (currentFormat === 'jpeg') {
            mainDownloadText.textContent = 'JPEG 다운로드 (1080px)';
          } else if (currentFormat === 'webp') {
            mainDownloadText.textContent = 'WebP 다운로드 (1080px)';
          } else {
            mainDownloadText.textContent = 'PNG 다운로드 (1080px)';
          }
        }
      });

      setTimeout(function () { updateExportGlider(); }, 60);
      window.addEventListener('resize', function () { updateExportGlider(); });
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { updateExportGlider(); });
      }
    }

    if (mainDownloadBtn) {
      mainDownloadBtn.addEventListener('click', function () {
        download(currentFormat, currentResolution);
      });
    }

    /* 하위 호환성 핸들러 (혹시 모를 구버전 버튼 대비) */
    var dlPng = document.getElementById('dlPng');
    if (dlPng) dlPng.addEventListener('click', function () { download('png', 1080); });
    var dlJpg = document.getElementById('dlJpg');
    if (dlJpg) dlJpg.addEventListener('click', function () { download('jpeg', 1080); });
    var dl4k = document.getElementById('dl4k') || document.getElementById('dl2k');
    if (dl4k) dl4k.addEventListener('click', function () { download('png', 3840); });
  }

  /* --- 선택 영역에 부분 글자색 태그 적용 --- */
  function applyInlineColor(color) {
    var start = textInput.selectionStart;
    var end = textInput.selectionEnd;
    var val = textInput.value;

    if (start !== undefined && end !== undefined && start < end) {
      /* 특정 영역을 드래그 선택한 경우 */
      var selected = val.substring(start, end);
      /* 이미 포맷팅 태그가 있으면 정리 */
      selected = selected.replace(/\[(.*?)\]\(#.*?\)/g, '$1');
      var formatted = '[' + selected + '](' + color + ')';
      textInput.value = val.substring(0, start) + formatted + val.substring(end);
      state.text = textInput.value;
      renderPreview();
      pushHistory();
      Utils.showToast(toastEl, '선택한 문구에 색상이 적용되었습니다.', 'success');
    } else {
      /* 선택 영역이 없을 때는 기본 글자 색 변경 */
      state.textColor = color;
      textColorInput.value = color;
      colorHex.textContent = color;
      renderPreview();
      pushHistory();
    }
  }

  /* --- 클립보드 이미지 복사 기능 --- */
  /* --- 클립보드 이미지 복사 기능 --- */
  function copyToClipboard() {
    function executeCopy() {
      Renderer.render(downloadCanvas, state, 1080);
      if (!navigator.clipboard || !window.ClipboardItem) {
        Utils.showToast(toastEl, '이 브라우저는 클립보드 이미지 복사를 지원하지 않습니다.', 'error');
        return;
      }
      try {
        downloadCanvas.toBlob(function (blob) {
          if (!blob) {
            Utils.showToast(toastEl, '이미지 생성에 실패했습니다.', 'error');
            return;
          }
          try {
            var data = [new ClipboardItem({ 'image/png': blob })];
            navigator.clipboard.write(data).then(function () {
              Utils.showToast(toastEl, '클립보드에 복사되었습니다! 카톡이나 SNS에 바로 붙여넣기(Ctrl+V) 하세요.', 'success');
            }).catch(function (err) {
              Utils.showToast(toastEl, '클립보드 복사 실패: ' + err.message, 'error');
            });
          } catch (e) {
            Utils.showToast(toastEl, '클립보드 복사 에러: ' + e.message, 'error');
          }
        }, 'image/png', 0.95);
      } catch (e) {
        console.error('Clipboard toBlob error:', e);
        Utils.showToast(toastEl, '클립보드 생성 에러: ' + e.message, 'error');
      }
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(executeCopy).catch(executeCopy);
    } else {
      executeCopy();
    }
  }

  /* --- 파일 업로드 통합 처리 (고화질 스마트 압축 + 자동 누끼 따기) --- */
  /* 모듈 스코프에 위치하여 bindControls / bindDragAndDropUpload 양쪽에서 호출 가능 */
  function processUploadedFile(file) {
    var check = Utils.validateImageFile(file);
    if (!check.ok) {
      Utils.showToast(toastEl, check.reason, 'error');
      return;
    }

    /* 1. 고화질 스마트 용량 압축 (JPEG 0.88 / PNG, 최대 2048px, 80~95% 절감) */
    Utils.compressImageFile(file, { maxDim: 2048, quality: 0.88 }, function (err, compImg, stats) {
      if (err) {
        Utils.showToast(toastEl, err, 'error');
        return;
      }

      /* 원본 백업 (누끼 복원 및 재시도용) */
      state.originalImage = compImg;
      state.hamsterId = 'custom';
      state.imagePanX = 0;
      state.imagePanY = 0;
      state.imageZoom = 100;
      if (imgZoomInput) imgZoomInput.value = 100;
      if (imgZoomVal) imgZoomVal.textContent = '100%';

      /* 용량 최적화 배지 노출 */
      var optBadge = document.getElementById('uploadOptimizeBadge');
      var optText = document.getElementById('uploadOptText');
      var optSaving = document.getElementById('uploadOptSaving');
      if (optBadge && optText && optSaving) {
        optBadge.hidden = false;
        optBadge.removeAttribute('hidden');
        optText.innerHTML = '용량 최적화: <strong>' + stats.origFormatted + ' → ' + stats.compressedFormatted + '</strong>';
        optSaving.textContent = stats.reductionPercent > 0 ? (stats.reductionPercent + '% 절감') : '최적화 완료';
      }

      /* 2. 자동 누끼 따기 옵션 확인 */
      var autoCutout = document.getElementById('autoCutoutToggle');
      var revertBtn = document.getElementById('revertCutoutBtn');
      var tolInput = document.getElementById('cutoutTolerance');
      var tol = tolInput ? parseInt(tolInput.value, 10) : 35;

      if (autoCutout && autoCutout.checked) {
        Utils.createCutoutImage(compImg, { tolerance: tol }, function (cutErr, cutImg) {
          if (cutErr) {
            console.warn('Auto cutout fallback:', cutErr);
            state.image = compImg;
            state.imageDataUrl = compImg.src;
            if (revertBtn) revertBtn.disabled = true;
            Utils.showToast(toastEl, '고화질 사진 업로드 & 용량 압축 완료! (' + stats.reductionPercent + '% 절감)', 'success');
          } else {
            state.image = cutImg;
            state.imageDataUrl = cutImg.src;
            if (revertBtn) revertBtn.disabled = false;
            Utils.showToast(toastEl, '🪄 고화질 사진 압축(' + stats.reductionPercent + '% 절감) 및 자동 누끼(배경 투명화) 완료!', 'success');
          }
          document.querySelectorAll('.hamster-thumb').forEach(function (t) { t.classList.remove('active'); });
          updateClearBtn();
          renderPreview();
          pushHistory();
        });
      } else {
        state.image = compImg;
        state.imageDataUrl = compImg.src;
        if (revertBtn) revertBtn.disabled = true;
        document.querySelectorAll('.hamster-thumb').forEach(function (t) { t.classList.remove('active'); });
        updateClearBtn();
        Utils.showToast(toastEl, '고화질 사진 업로드 & 용량 압축 완료! (' + stats.reductionPercent + '% 절감)', 'success');
        renderPreview();
        pushHistory();
      }
    });
  }

  /* --- 호스트 파일 탐색기 드래그 & 드롭 자동 업로드 --- */
  function bindDragAndDropUpload() {
    var previewWrapEl = document.getElementById('previewWrap');
    var uploadBtnEl = document.querySelector('.upload-btn');
    var dragDropOv = document.getElementById('dragDropOverlay');

    var targets = [
      { el: previewWrapEl, isWrap: true },
      { el: uploadBtnEl, isWrap: false }
    ];

    targets.forEach(function (item) {
      if (!item.el) return;
      var el = item.el;
      var dragCounter = 0;

      el.addEventListener('dragenter', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dragCounter++;
        el.classList.add('drag-over');
        if (item.isWrap && dragDropOv) {
          dragDropOv.classList.add('active');
        }
      });

      el.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'copy';
        }
      });

      el.addEventListener('dragleave', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dragCounter--;
        if (dragCounter <= 0) {
          dragCounter = 0;
          el.classList.remove('drag-over');
          if (item.isWrap && dragDropOv) {
            dragDropOv.classList.remove('active');
          }
        }
      });

      el.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dragCounter = 0;
        el.classList.remove('drag-over');
        if (item.isWrap && dragDropOv) {
          dragDropOv.classList.remove('active');
        }

        var files = e.dataTransfer ? e.dataTransfer.files : null;
        if (!files || files.length === 0) return;
        processUploadedFile(files[0]);
      });
    });

    /* 전역 드래그 시 브라우저 기본 파일 열기 동작 방지 */
    window.addEventListener('dragover', function (e) {
      e.preventDefault();
    }, false);
    window.addEventListener('drop', function (e) {
      if (!e.target.closest('#previewWrap') && !e.target.closest('.upload-btn')) {
        e.preventDefault();
      }
    }, false);
  }

  /* --- 캔버스 마우스/터치 드래그 인터랙션 (문구/말풍선 + 스티커 + 배경 이미지 팬) --- */
  function bindCanvasInteractions() {
    function getClientPos(e) {
      if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      return { x: e.clientX, y: e.clientY };
    }

    function getCanvasPoint(clientX, clientY) {
      var rect = previewCanvas.getBoundingClientRect();
      var scaleX = previewCanvas.width / rect.width;
      var scaleY = previewCanvas.height / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
        rect: rect
      };
    }

    /* 마우스 커서 호버 상태 관리 */
    previewCanvas.addEventListener('mousemove', function (e) {
      if (dragTarget) return;
      var pt = getCanvasPoint(e.clientX, e.clientY);

      /* 1. 스티커 히트 체크 */
      var stkBounds = Renderer.getStickersBounds(state, 400);
      var isOverSticker = false;
      for (var i = stkBounds.length - 1; i >= 0; i--) {
        var sb = stkBounds[i];
        if (pt.x >= sb.x && pt.x <= sb.x + sb.w && pt.y >= sb.y && pt.y <= sb.y + sb.h) {
          isOverSticker = true;
          break;
        }
      }
      if (isOverSticker) {
        previewCanvas.style.cursor = 'grab';
        return;
      }

      /* 2. 텍스트/말풍선 히트 체크 */
      var textBounds = Renderer.getTextBounds(state, 400);
      var isOverText = false;
      if (textBounds) {
        var margin = 15;
        isOverText = (
          pt.x >= textBounds.x - margin &&
          pt.x <= textBounds.x + textBounds.w + margin &&
          pt.y >= textBounds.y - margin &&
          pt.y <= textBounds.y + textBounds.h + margin
        );
      }
      if (isOverText) {
        previewCanvas.style.cursor = 'grab';
        return;
      }

      /* 3. 배경 이미지 위에 있을 때 (팬 가능 안내) */
      if (state.image) {
        previewCanvas.style.cursor = 'move';
      } else {
        previewCanvas.style.cursor = 'default';
      }
    });

    /* 드래그 시작 */
    function onDragStart(e) {
      var pos = getClientPos(e);
      var pt = getCanvasPoint(pos.x, pos.y);

      dragStartMouseX = pos.x;
      dragStartMouseY = pos.y;

      /* 우선순위 1: 스티커 클릭 판정 */
      var stkBounds = Renderer.getStickersBounds(state, 400);
      for (var i = stkBounds.length - 1; i >= 0; i--) {
        var sb = stkBounds[i];
        if (pt.x >= sb.x && pt.x <= sb.x + sb.w && pt.y >= sb.y && pt.y <= sb.y + sb.h) {
          dragTarget = 'sticker';
          activeStickerIndex = sb.index;
          selectedStickerId = state.stickers[sb.index].id;
          renderActiveStickersUi();
          dragStartStickerX = state.stickers[sb.index].x;
          dragStartStickerY = state.stickers[sb.index].y;
          previewCanvas.style.cursor = 'grabbing';
          if (e.cancelable) e.preventDefault();
          return;
        }
      }

      /* 스티커 외 영역 클릭 시 선택 해제 */
      if (selectedStickerId) {
        selectedStickerId = null;
        renderActiveStickersUi();
      }

      /* 우선순위 2: 텍스트/말풍선 클릭 판정 */
      var textBounds = Renderer.getTextBounds(state, 400);
      if (textBounds) {
        var margin = 15;
        var hitText = (
          pt.x >= textBounds.x - margin &&
          pt.x <= textBounds.x + textBounds.w + margin &&
          pt.y >= textBounds.y - margin &&
          pt.y <= textBounds.y + textBounds.h + margin
        );
        if (hitText) {
          dragTarget = 'text';
          dragStartTextX = state.textX;
          dragStartTextY = state.textY;
          previewCanvas.style.cursor = 'grabbing';
          if (e.cancelable) e.preventDefault();
          return;
        }
      }

      /* 우선순위 3: 이미지 영역 클릭 시 배경 사진 팬(Pan) 이동 */
      if (state.image) {
        dragTarget = 'image';
        dragStartPanX = state.imagePanX || 0;
        dragStartPanY = state.imagePanY || 0;
        previewCanvas.style.cursor = 'grabbing';
        if (e.cancelable) e.preventDefault();
      }
    }

    /* 드래그 중 (rAF 60fps 고속 반응) */
    function onDragMove(e) {
      if (!dragTarget) return;
      if (e.cancelable) e.preventDefault();

      var pos = getClientPos(e);
      var rect = previewCanvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      var dxPercent = ((pos.x - dragStartMouseX) / rect.width) * 100;
      var dyPercent = ((pos.y - dragStartMouseY) / rect.height) * 100;

      if (dragTarget === 'text') {
        var newX = Math.round(Math.max(5, Math.min(95, dragStartTextX + dxPercent)));
        var newY = Math.round(Math.max(5, Math.min(95, dragStartTextY + dyPercent)));
        if (newX !== state.textX || newY !== state.textY) {
          state.textX = newX;
          state.textY = newY;
          textXInput.value = newX;
          textXVal.textContent = newX + '%';
          textYInput.value = newY;
          textYVal.textContent = newY + '%';
          document.querySelectorAll('.pos-btn').forEach(function (b) { b.classList.remove('active'); });
          scheduleRender();
        }
      } else if (dragTarget === 'sticker' && activeStickerIndex >= 0 && state.stickers[activeStickerIndex]) {
        var s = state.stickers[activeStickerIndex];
        s.x = Math.round(Math.max(5, Math.min(95, dragStartStickerX + dxPercent)));
        s.y = Math.round(Math.max(5, Math.min(95, dragStartStickerY + dyPercent)));
        scheduleRender();
      } else if (dragTarget === 'image') {
        /* 이미지 팬 이동 */
        var newPanX = Math.round(Math.max(-100, Math.min(100, dragStartPanX + dxPercent * 1.2)));
        var newPanY = Math.round(Math.max(-100, Math.min(100, dragStartPanY + dyPercent * 1.2)));
        if (newPanX !== state.imagePanX || newPanY !== state.imagePanY) {
          state.imagePanX = newPanX;
          state.imagePanY = newPanY;
          scheduleRender();
        }
      }
    }

    function scheduleRender() {
      if (!rafDragId) {
        rafDragId = requestAnimationFrame(function () {
          renderPreview();
          rafDragId = null;
        });
      }
    }

    /* 드래그 종료 */
    function onDragEnd() {
      if (dragTarget) {
        dragTarget = null;
        activeStickerIndex = -1;
        previewCanvas.style.cursor = 'default';
        renderPreview();
        pushHistory();
      }
    }

    /* 마우스 휠 줌 (확대 / 축소) */
    var wheelTimer = null;
    previewCanvas.addEventListener('wheel', function (e) {
      if (!state.image) return;
      e.preventDefault();
      var delta = e.deltaY < 0 ? 10 : -10;
      var newZoom = Math.max(50, Math.min(250, state.imageZoom + delta));
      if (newZoom !== state.imageZoom) {
        state.imageZoom = newZoom;
        if (imgZoomInput) imgZoomInput.value = newZoom;
        if (imgZoomVal) imgZoomVal.textContent = newZoom + '%';
        scheduleRender();
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(function () {
          pushHistory();
        }, 300);
      }
    }, { passive: false });

    /* 캔버스 더블 클릭 시 이미지 위치 및 줌 리셋 */
    previewCanvas.addEventListener('dblclick', function () {
      if (!state.image) return;
      state.imagePanX = 0;
      state.imagePanY = 0;
      state.imageZoom = 100;
      if (imgZoomInput) imgZoomInput.value = 100;
      if (imgZoomVal) imgZoomVal.textContent = '100%';
      renderPreview();
      pushHistory();
      Utils.showToast(toastEl, '이미지 위치 및 줌이 중앙으로 초기화되었습니다.', 'success');
    });

    previewCanvas.addEventListener('mousedown', onDragStart);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);

    previewCanvas.addEventListener('touchstart', onDragStart, { passive: false });
    window.addEventListener('touchmove', onDragMove, { passive: false });
    window.addEventListener('touchend', onDragEnd);
  }

  /* --- UI 요소와 상태 동기화 --- */
  function syncUiFromState() {
    textInput.value = state.text || '';
    fontSizeInput.value = state.fontSize || 32;
    fontSizeVal.textContent = state.fontSize || 32;
    textColorInput.value = state.textColor || '#ffffff';
    colorHex.textContent = state.textColor || '#ffffff';

    textXInput.value = state.textX || 50;
    textXVal.textContent = (state.textX || 50) + '%';
    textYInput.value = state.textY || 50;
    textYVal.textContent = (state.textY || 50) + '%';

    bgColorInput.value = state.bgColor || '#f5f5f5';
    bgColorHex.textContent = state.bgColor || '#f5f5f5';

    if (bubbleColorInput) bubbleColorInput.value = state.bubbleColor || '#ffffff';
    if (bubbleColorHex) bubbleColorHex.textContent = state.bubbleColor || '#ffffff';
    if (bubbleColorSec) bubbleColorSec.hidden = (state.bubble === 'none');

    if (fontFamilySelect) fontFamilySelect.value = state.fontFamily || "'Noto Sans KR', sans-serif";
    syncFontPickerUi(state.fontFamily);

    updateFitModeUi();
    if (imgZoomInput) imgZoomInput.value = state.imageZoom || 100;
    if (imgZoomVal) imgZoomVal.textContent = (state.imageZoom || 100) + '%';
    if (transparentBgCheck) transparentBgCheck.checked = !!state.transparentBg;
    if (previewCanvas) previewCanvas.classList.toggle('transparent-canvas', !!state.transparentBg);

    document.querySelectorAll('.ratio-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.ratio === state.ratio);
    });
    document.querySelectorAll('.bub-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.bubble === state.bubble);
    });

    var thumbs = document.querySelectorAll('.hamster-thumb');
    thumbs.forEach(function (t) { t.classList.toggle('active', t.dataset.id === state.hamsterId); });

    renderActiveStickersUi();
    updateClearBtn();
  }

  /* 스티커 한글 이름 매핑 헬퍼 */
  function getStickerName(icon) {
    if (!window._stkNameMap) {
      window._stkNameMap = {};
      document.querySelectorAll('.stk-btn').forEach(function (btn) {
        if (btn.dataset.stk) {
          window._stkNameMap[btn.dataset.stk] = btn.title || btn.dataset.stk;
        }
      });
    }
    return window._stkNameMap[icon] || icon;
  }

  /* 적용된 스티커 목록 UI 렌더링 & 개별 삭제 태그 동기화 */
  function renderActiveStickersUi() {
    var wrap = document.getElementById('activeStickersWrap');
    var chipsContainer = document.getElementById('activeStickerChips');
    var countEl = document.getElementById('activeStickerCount');
    if (!wrap) return;

    var stickers = state.stickers || [];
    wrap.hidden = (stickers.length === 0);
    if (countEl) countEl.textContent = stickers.length;
    if (!chipsContainer) return;

    chipsContainer.innerHTML = '';
    stickers.forEach(function (s) {
      var isSelected = (s.id === selectedStickerId);
      var chip = document.createElement('div');
      chip.className = 'stk-chip' + (isSelected ? ' active-target' : '');
      chip.dataset.id = s.id;
      chip.title = '클릭하여 선택 / 캔버스에서 드래그';

      var iconSpan = document.createElement('span');
      iconSpan.className = 'stk-chip-icon';
      iconSpan.textContent = s.icon;

      var nameSpan = document.createElement('span');
      nameSpan.className = 'stk-chip-label';
      nameSpan.textContent = getStickerName(s.icon);

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'stk-chip-del';
      delBtn.title = (nameSpan.textContent || '스티커') + ' 삭제';
      delBtn.setAttribute('aria-label', (nameSpan.textContent || '스티커') + ' 삭제');
      delBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

      delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteStickerById(s.id);
      });

      chip.appendChild(iconSpan);
      chip.appendChild(nameSpan);
      chip.appendChild(delBtn);

      chip.addEventListener('click', function () {
        selectedStickerId = s.id;
        renderActiveStickersUi();
        renderPreview();
      });

      chipsContainer.appendChild(chip);
    });

    /* 선택한 스티커 크기 슬라이더 UI 동기화 */
    var scaleControl = document.getElementById('stkScaleControl');
    var scaleSlider = document.getElementById('stkScaleSlider');
    var scaleVal = document.getElementById('stkScaleVal');
    var selectedStk = stickers.find(function (s) { return s.id === selectedStickerId; });
    if (scaleControl && scaleSlider && scaleVal) {
      if (selectedStk) {
        scaleControl.hidden = false;
        scaleControl.removeAttribute('hidden');
        scaleSlider.value = selectedStk.size || 44;
        scaleVal.textContent = (selectedStk.size || 44) + 'px';
      } else {
        scaleControl.hidden = true;
        scaleControl.setAttribute('hidden', '');
      }
    }
  }

  /* 개별 스티커 삭제 함수 */
  function deleteStickerById(id) {
    if (!state.stickers) return;
    var idx = state.stickers.findIndex(function (s) { return s.id === id; });
    if (idx !== -1) {
      var removed = state.stickers.splice(idx, 1)[0];
      if (selectedStickerId === id) {
        selectedStickerId = null;
      }
      renderActiveStickersUi();
      renderPreview();
      pushHistory();
      Utils.showToast(toastEl, (removed.icon || '') + ' ' + getStickerName(removed.icon) + ' 스티커가 삭제되었습니다.', 'success');
    }
  }

  /* 글꼴(폰트) 슬라이딩 드로어 초기화 */
  function initFontPicker() {
    var drawerWrap = document.getElementById('fontDrawerWrap');
    var triggerBtn = document.getElementById('fontTriggerBtn');
    var slidingPanel = document.getElementById('fontSlidingPanel');
    if (!drawerWrap || !triggerBtn || !slidingPanel) return;

    function toggleFontDrawer(open) {
      var isOpen = drawerWrap.classList.contains('is-open');
      var shouldOpen = typeof open === 'boolean' ? open : !isOpen;
      drawerWrap.classList.toggle('is-open', shouldOpen);
      triggerBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    }

    triggerBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleFontDrawer();
    });

    var optItems = slidingPanel.querySelectorAll('.font-opt-item');
    optItems.forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        var val = item.dataset.value;
        if (!val) return;
        state.fontFamily = val;
        syncFontPickerUi(val);
        toggleFontDrawer(false);
        renderPreview();
        pushHistory();
      });
    });

    document.addEventListener('click', function (e) {
      if (drawerWrap.classList.contains('is-open') && !drawerWrap.contains(e.target)) {
        toggleFontDrawer(false);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawerWrap.classList.contains('is-open')) {
        toggleFontDrawer(false);
        triggerBtn.focus();
      }
    });
  }

  /* 글꼴 드로어 및 숨김 셀렉트 UI 동기화 */
  function syncFontPickerUi(fontVal) {
    var triggerName = document.getElementById('fontTriggerName');
    var nativeSelect = document.getElementById('fontFamily');
    var currentVal = fontVal || "'Noto Sans KR', sans-serif";

    if (nativeSelect) {
      nativeSelect.value = currentVal;
    }

    var optItems = document.querySelectorAll('.font-opt-item');
    var matchedLabel = '';
    optItems.forEach(function (item) {
      var isMatch = item.dataset.value === currentVal;
      item.classList.toggle('selected', isMatch);
      if (isMatch) {
        var label = item.querySelector('.font-opt-label');
        var desc = item.querySelector('.font-opt-desc');
        matchedLabel = (label ? label.textContent : '') + (desc ? ' (' + desc.textContent + ')' : '');
      }
    });

    if (triggerName) {
      triggerName.textContent = matchedLabel || currentVal;
      triggerName.style.fontFamily = currentVal;
    }
  }

  /* --- 렌더 --- */
  function renderPreview() {
    state.selectedStickerId = selectedStickerId;
    Renderer.render(previewCanvas, state, 400);
  }

  /* --- 다운로드 (1080px 또는 3840px 4K 초고화질 / PNG, JPEG, WebP) --- */
  function download(format, resolution) {
    var width = resolution || 1080;

    function executeDownload() {
      Renderer.render(downloadCanvas, state, width);
      var mime = format === 'jpeg' ? 'image/jpeg' : (format === 'webp' ? 'image/webp' : 'image/png');
      var ext = format === 'jpeg' ? 'jpg' : (format === 'webp' ? 'webp' : 'png');
      var ratioStr = state.ratio.replace(':', 'x');
      var hqPrefix = width >= 3000 ? '-4K' : (width >= 2000 ? '-2K' : '');
      var filename = 'hamzzi-' + ratioStr + hqPrefix + '.' + ext;

      try {
        var link = document.createElement('a');
        link.download = filename;
        link.href = downloadCanvas.toDataURL(mime, 0.95);
        link.click();
      } catch (e) {
        console.error('Download error:', e);
        Utils.showToast(toastEl, '다운로드 실패: ' + e.message, 'error');
      }
    }

    /* 카드 2 검증: 글꼴 준비 뒤 저장 보장 */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(executeDownload).catch(executeDownload);
    } else {
      executeDownload();
    }
  }

  /* --- 외부에서 상태 설정 (템플릿 불러오기용) --- */
  function loadState(tpl) {
    state.text = tpl.text || '';
    state.fontSize = tpl.fontSize || 32;
    state.fontFamily = tpl.fontFamily || "'Noto Sans KR', sans-serif";
    state.textColor = tpl.textColor || '#ffffff';
    state.textX = tpl.textX || 50;
    state.textY = tpl.textY || 50;
    state.ratio = tpl.aspectRatio || '1:1';
    state.fitMode = tpl.fitMode || 'cover';
    state.imagePanX = tpl.imagePanX || 0;
    state.imagePanY = tpl.imagePanY || 0;
    state.imageZoom = tpl.imageZoom || 100;
    state.bubble = tpl.bubble || 'none';
    state.bubbleColor = tpl.bubbleColor || '#ffffff';
    state.bgColor = tpl.bgColor || '#f5f5f5';
    state.stickers = tpl.stickers || [];

    syncUiFromState();

    if (tpl.hamsterId && tpl.hamsterId !== 'custom') {
      selectHamster(tpl.hamsterId);
    } else if (tpl.imageData) {
      Utils.loadImageFromUrl(tpl.imageData, function (err, img) {
        if (!err) {
          state.image = img;
          state.originalImage = img;
          state.imageDataUrl = tpl.imageData;
          var revertBtn = document.getElementById('revertCutoutBtn');
          if (revertBtn) revertBtn.disabled = true;
        }
        updateClearBtn();
        renderPreview();
        pushHistory();
      });
    } else {
      updateClearBtn();
      renderPreview();
      pushHistory();
    }
  }

  return {
    init: init,
    getState: getState,
    renderPreview: renderPreview,
    loadState: loadState,
    HAMSTERS: HAMSTERS
  };
})();
