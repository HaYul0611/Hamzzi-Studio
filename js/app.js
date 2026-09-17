/* === app.js — 진입점, 오버레이 관리 (템플릿 이름 CRUD, 날짜시간, JSON 강화) === */

(function () {
  document.addEventListener('DOMContentLoaded', function () {
    Editor.init();
    bindOverlays();
  });

  function formatDateTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var year = d.getFullYear();
    var month = pad(d.getMonth() + 1);
    var day = pad(d.getDate());
    var hours = pad(d.getHours());
    var minutes = pad(d.getMinutes());
    return year + '.' + month + '.' + day + ' ' + hours + ':' + minutes;
  }

  function bindOverlays() {
    var toastEl = document.getElementById('toast');

    /* ========================================================
       1. 템플릿 오버레이
       ======================================================== */
    var tplOv = document.getElementById('templateOv');
    var tplNameInput = document.getElementById('tplNameInput');

    document.getElementById('templateBtn').addEventListener('click', function () {
      renderTemplateList();
      tplOv.hidden = false;
      if (tplNameInput) {
        tplNameInput.value = '';
        setTimeout(function () { tplNameInput.focus(); }, 100);
      }
    });

    document.getElementById('closeTemplateOv').addEventListener('click', function () {
      tplOv.hidden = true;
    });

    tplOv.addEventListener('click', function (e) {
      if (e.target === tplOv) tplOv.hidden = true;
    });

    /* 템플릿 저장 (사용자 입력 이름 지원) */
    var saveBtn = document.getElementById('saveTemplateBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var customName = tplNameInput ? tplNameInput.value.trim() : '';
        var tpl = Templates.create(Editor.getState(), customName);
        if (tplNameInput) tplNameInput.value = '';
        renderTemplateList();
        Utils.showToast(toastEl, '템플릿 "' + tpl.name + '"이(가) 저장되었습니다.', 'success');
      });
    }

    if (tplNameInput) {
      tplNameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (saveBtn) saveBtn.click();
        }
      });
    }

    /* ========================================================
       2. JSON 오버레이 (백업 / 복원)
       ======================================================== */
    var jsonOv = document.getElementById('jsonOv');
    var jsonInput = document.getElementById('jsonInput');
    var jsonResultArea = document.getElementById('jsonResultArea');

    document.getElementById('jsonBtn').addEventListener('click', function () {
      if (jsonResultArea) jsonResultArea.hidden = true;
      jsonOv.hidden = false;
    });

    document.getElementById('closeJsonOv').addEventListener('click', function () {
      jsonOv.hidden = true;
    });

    jsonOv.addEventListener('click', function (e) {
      if (e.target === jsonOv) jsonOv.hidden = true;
    });

    /* JSON 파일 다운로드 */
    document.getElementById('exportJson').addEventListener('click', function () {
      var json = Templates.exportJson();
      var all = Templates.loadAll();
      var blob = new Blob([json], { type: 'application/json' });
      var link = document.createElement('a');
      link.download = 'hamzzi-templates-' + (new Date().toISOString().slice(0, 10)) + '.json';
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
      Utils.showToast(toastEl, '템플릿 ' + all.length + '개가 JSON 파일로 다운로드되었습니다.', 'success');
    });

    /* JSON 클립보드 복사 */
    var copyBtn = document.getElementById('copyJsonBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var json = Templates.exportJson();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(json).then(function () {
            Utils.showToast(toastEl, 'JSON 데이터가 클립보드에 복사되었습니다.', 'success');
          }).catch(function () {
            fallbackCopy(json);
          });
        } else {
          fallbackCopy(json);
        }
      });
    }

    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
        Utils.showToast(toastEl, 'JSON 데이터가 클립보드에 복사되었습니다.', 'success');
      } catch (err) {
        Utils.showToast(toastEl, '클립보드 복사에 실패했습니다.', 'error');
      }
      document.body.removeChild(ta);
    }

    /* JSON 파일 열기 (파일 업로드) */
    var fileInput = document.getElementById('jsonFileInput');
    var triggerBtn = document.getElementById('triggerJsonFile');
    if (triggerBtn && fileInput) {
      triggerBtn.addEventListener('click', function () {
        fileInput.value = '';
        fileInput.click();
      });

      fileInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (evt) {
          if (jsonInput) {
            jsonInput.value = evt.target.result;
            if (jsonResultArea) jsonResultArea.hidden = true;
            Utils.showToast(toastEl, file.name + ' 파일을 불러왔습니다. [가져오기 실행]을 누르세요.', 'info');
          }
        };
        reader.readAsText(file);
      });
    }

    /* JSON 가져오기 실행 (리치 알림 카드 및 모드 지원) */
    document.getElementById('importJson').addEventListener('click', function () {
      var input = jsonInput ? jsonInput.value.trim() : '';
      if (!input) {
        renderJsonResult({
          ok: false,
          reason: 'JSON 데이터를 입력하거나 [📁 파일 열기]로 선택해주세요.'
        });
        Utils.showToast(toastEl, 'JSON 데이터를 입력해주세요.', 'error');
        return;
      }

      // 가져오기 모드 확인 (merge vs replace)
      var mode = 'merge';
      var modeRadio = document.querySelector('input[name="jsonImportMode"]:checked');
      if (modeRadio) mode = modeRadio.value;

      var result = Templates.importJson(input, mode);
      renderJsonResult(result);

      if (result.ok) {
        if (jsonInput) jsonInput.value = '';
        Utils.showToast(toastEl, '템플릿 ' + result.count + '개를 성공적으로 복원했습니다!', 'success');
      } else {
        Utils.showToast(toastEl, result.reason, 'error');
      }
    });

    function renderJsonResult(result) {
      if (!jsonResultArea) return;
      jsonResultArea.hidden = false;

      if (result.ok) {
        var modeText = result.mode === 'merge' ? '기존 목록에 추가(병합)' : '전체 덮어쓰기(대체)';
        var chipsHtml = '';
        if (result.importedNames && result.importedNames.length > 0) {
          chipsHtml = result.importedNames.map(function (name) {
            return '<span class="json-chip" title="' + escHtml(name) + '">🏷️ ' + escHtml(name) + '</span>';
          }).join('');
        }

        jsonResultArea.innerHTML =
          '<div class="json-result-card success">' +
          '<div class="json-res-header">' +
          '<span class="json-res-icon">🎉</span>' +
          '<div class="json-res-title-wrap">' +
          '<strong class="json-res-title">템플릿 ' + result.count + '개를 성공적으로 가져왔습니다!</strong>' +
          '<div class="json-res-badges">' +
          '<span class="json-res-badge">' + modeText + '</span>' +
          '<span class="json-res-badge highlight">총 ' + result.totalCount + '개 보관 중</span>' +
          '</div>' +
          '</div>' +
          '</div>' +
          (chipsHtml ? (
            '<div class="json-res-body">' +
            '<p class="json-res-label">가져온 템플릿 목록 (' + result.count + '개):</p>' +
            '<div class="json-chip-list">' + chipsHtml + '</div>' +
            '</div>'
          ) : '') +
          '<div class="json-res-footer">' +
          '<button type="button" id="btnViewTemplates" class="json-jump-btn">👉 내 템플릿 목록 바로가기</button>' +
          '</div>' +
          '</div>';

        var jumpBtn = document.getElementById('btnViewTemplates');
        if (jumpBtn) {
          jumpBtn.addEventListener('click', function () {
            jsonOv.hidden = true;
            renderTemplateList();
            tplOv.hidden = false;
          });
        }
      } else {
        jsonResultArea.innerHTML =
          '<div class="json-result-card error">' +
          '<div class="json-res-header">' +
          '<span class="json-res-icon">⚠️</span>' +
          '<div class="json-res-title-wrap">' +
          '<strong class="json-res-title">템플릿 가져오기 실패</strong>' +
          '<p class="json-res-desc">' + escHtml(result.reason) + '</p>' +
          '</div>' +
          '</div>' +
          '<p class="json-res-hint">JSON 형식이 올바른지, 필수 필드(id, name, text 등)가 누락되지 않았는지 확인해 주세요.</p>' +
          '</div>';
      }
    }
  }

  /* ========================================================
     3. 내 템플릿 목록 렌더링 (이름 CRUD + 날짜/시간)
     ======================================================== */
  function renderTemplateList() {
    var list = document.getElementById('templateList');
    var all = Templates.loadAll();
    var toastEl = document.getElementById('toast');

    if (all.length === 0) {
      list.innerHTML = '<p class="empty-msg">저장된 템플릿이 없습니다. 현재 작업 내용을 저장해보세요!</p>';
      return;
    }

    var html = '';
    for (var i = 0; i < all.length; i++) {
      var t = all[i];
      var createdStr = formatDateTime(t.createdAt || Date.now());
      var updatedStr = (t.updatedAt && t.updatedAt !== t.createdAt) ? formatDateTime(t.updatedAt) : '';

      html += '<div class="tpl-card" data-id="' + t.id + '">' +
        '<div class="tpl-info">' +
        '<div class="tpl-title-row">' +
        '<span class="tpl-name" title="' + escHtml(t.name || '새 템플릿') + '">' + escHtml(t.name || '새 템플릿') + '</span>' +
        '</div>' +
        '<div class="tpl-meta">' +
        '<span class="tpl-meta-spec">' + (t.aspectRatio || '1:1') + ' · ' + (t.fontSize || 32) + 'px</span>' +
        '<span class="tpl-meta-sep">·</span>' +
        '<span class="tpl-meta-date" title="생성일시: ' + createdStr + '">📅 ' + createdStr + '</span>' +
        (updatedStr ? ('<span class="tpl-meta-updated" title="최근 수정일시: ' + updatedStr + '"> (수정: ' + updatedStr + ')</span>') : '') +
        '</div>' +
        '</div>' +
        '<div class="tpl-actions">' +
        '<button class="tpl-btn tpl-load" type="button">불러오기</button>' +
        '<button class="tpl-btn tpl-rename-btn" type="button" title="템플릿 이름 수정">이름 수정</button>' +
        '<button class="tpl-btn tpl-update" type="button" title="현재 상태로 덮어쓰기">덮어쓰기</button>' +
        '<button class="tpl-btn danger tpl-del" type="button" title="템플릿 삭제">삭제</button>' +
        '</div>' +
        '</div>';
    }
    list.innerHTML = html;

    /* 이벤트 위임 */
    list.onclick = function (e) {
      var card = e.target.closest('.tpl-card');
      if (!card) return;
      var id = card.dataset.id;

      // 1) 불러오기
      if (e.target.classList.contains('tpl-load')) {
        var tpl = Templates.getById(id);
        if (tpl) {
          Editor.loadState(tpl);
          document.getElementById('templateOv').hidden = true;
          Utils.showToast(toastEl, '템플릿 "' + tpl.name + '"을(를) 불러왔습니다.', 'success');
        }
      }

      // 2) 이름 수정 (인라인 인풋 편집 모드 전환)
      if (e.target.classList.contains('tpl-rename-btn')) {
        startInlineRename(card, id);
      }

      // 3) 현재 상태로 덮어쓰기
      if (e.target.classList.contains('tpl-update')) {
        var currentTpl = Templates.getById(id);
        var oldName = currentTpl ? currentTpl.name : '템플릿';
        if (confirm('현재 작업 중인 화면 내용으로 "' + oldName + '" 템플릿을 덮어쓰시겠습니까?')) {
          Templates.update(id, Editor.getState());
          renderTemplateList();
          Utils.showToast(toastEl, '"' + oldName + '" 템플릿이 현재 상태로 덮어쓰기되었습니다.', 'success');
        }
      }

      // 4) 삭제
      if (e.target.classList.contains('tpl-del')) {
        var targetTpl = Templates.getById(id);
        var nameToDelete = targetTpl ? targetTpl.name : '템플릿';
        if (confirm('"' + nameToDelete + '" 템플릿을 삭제하시겠습니까?')) {
          Templates.remove(id);
          renderTemplateList();
          Utils.showToast(toastEl, '템플릿이 삭제되었습니다.', 'info');
        }
      }
    };
  }

  /* 인라인 이름 수정 모드 */
  function startInlineRename(card, id) {
    var tpl = Templates.getById(id);
    if (!tpl) return;

    var infoEl = card.querySelector('.tpl-info');
    var actionsEl = card.querySelector('.tpl-actions');
    if (!infoEl || !actionsEl) return;

    // 인라인 폼 치환
    var originalInfoHtml = infoEl.innerHTML;
    var originalActionsDisplay = actionsEl.style.display;
    actionsEl.style.display = 'none';

    infoEl.innerHTML =
      '<div class="tpl-rename-box">' +
      '<input type="text" class="text-input tpl-rename-input" value="' + escHtml(tpl.name) + '" maxlength="30" />' +
      '<button class="tpl-btn primary tpl-rename-ok" type="button">저장</button>' +
      '<button class="tpl-btn tpl-rename-cancel" type="button">취소</button>' +
      '</div>';

    var input = infoEl.querySelector('.tpl-rename-input');
    var okBtn = infoEl.querySelector('.tpl-rename-ok');
    var cancelBtn = infoEl.querySelector('.tpl-rename-cancel');

    if (input) {
      input.focus();
      input.select();

      var doSave = function () {
        var newName = input.value.trim();
        if (!newName) {
          alert('템플릿 이름을 입력해주세요.');
          input.focus();
          return;
        }
        Templates.rename(id, newName);
        renderTemplateList();
        Utils.showToast(document.getElementById('toast'), '템플릿 이름이 변경되었습니다.', 'success');
      };

      var doCancel = function () {
        infoEl.innerHTML = originalInfoHtml;
        actionsEl.style.display = originalActionsDisplay;
      };

      okBtn.addEventListener('click', doSave);
      cancelBtn.addEventListener('click', doCancel);

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          doSave();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          doCancel();
        }
      });
    }
  }

  function escHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
