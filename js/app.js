/* === app.js — 진입점, 오버레이 관리 === */

(function () {
  document.addEventListener('DOMContentLoaded', function () {
    Editor.init();
    bindOverlays();
  });

  function bindOverlays() {
    /* 템플릿 오버레이 */
    var tplOv = document.getElementById('templateOv');
    document.getElementById('templateBtn').addEventListener('click', function () {
      renderTemplateList();
      tplOv.hidden = false;
    });
    document.getElementById('closeTemplateOv').addEventListener('click', function () {
      tplOv.hidden = true;
    });
    tplOv.addEventListener('click', function (e) {
      if (e.target === tplOv) tplOv.hidden = true;
    });

    /* 템플릿 저장 */
    document.getElementById('saveTemplateBtn').addEventListener('click', function () {
      var tpl = Templates.create(Editor.getState());
      renderTemplateList();
      Utils.showToast(document.getElementById('toast'), '템플릿이 저장되었습니다.', 'success');
    });

    /* JSON 오버레이 */
    var jsonOv = document.getElementById('jsonOv');
    document.getElementById('jsonBtn').addEventListener('click', function () {
      jsonOv.hidden = false;
    });
    document.getElementById('closeJsonOv').addEventListener('click', function () {
      jsonOv.hidden = true;
    });
    jsonOv.addEventListener('click', function (e) {
      if (e.target === jsonOv) jsonOv.hidden = true;
    });

    /* JSON 내보내기 */
    document.getElementById('exportJson').addEventListener('click', function () {
      var json = Templates.exportJson();
      var blob = new Blob([json], { type: 'application/json' });
      var link = document.createElement('a');
      link.download = 'hamzzi-templates.json';
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    });

    /* JSON 가져오기 */
    document.getElementById('importJson').addEventListener('click', function () {
      var msgEl = document.getElementById('jsonMsg');
      var input = document.getElementById('jsonInput').value.trim();
      if (!input) {
        msgEl.textContent = 'JSON 데이터를 입력해주세요.';
        msgEl.className = 'json-msg error';
        msgEl.hidden = false;
        return;
      }
      var result = Templates.importJson(input);
      if (result.ok) {
        msgEl.textContent = '템플릿 ' + result.count + '개를 가져왔습니다.';
        msgEl.className = 'json-msg success';
        document.getElementById('jsonInput').value = '';
      } else {
        msgEl.textContent = result.reason;
        msgEl.className = 'json-msg error';
      }
      msgEl.hidden = false;
    });
  }

  function renderTemplateList() {
    var list = document.getElementById('templateList');
    var all = Templates.loadAll();
    if (all.length === 0) {
      list.innerHTML = '<p class="empty-msg">저장된 템플릿이 없습니다.</p>';
      return;
    }

    var html = '';
    for (var i = 0; i < all.length; i++) {
      var t = all[i];
      html += '<div class="tpl-card" data-id="' + t.id + '">' +
              '<div class="tpl-info">' +
              '<p class="tpl-name">' + escHtml(t.name || '이름 없음') + '</p>' +
              '<p class="tpl-meta">' + (t.aspectRatio || '1:1') + ' · ' + (t.fontSize || 32) + 'px</p>' +
              '</div>' +
              '<div class="tpl-actions">' +
              '<button class="tpl-btn tpl-load" type="button">불러오기</button>' +
              '<button class="tpl-btn tpl-update" type="button">덮어쓰기</button>' +
              '<button class="tpl-btn danger tpl-del" type="button">삭제</button>' +
              '</div></div>';
    }
    list.innerHTML = html;

    /* 이벤트 위임 */
    list.onclick = function (e) {
      var card = e.target.closest('.tpl-card');
      if (!card) return;
      var id = card.dataset.id;

      if (e.target.classList.contains('tpl-load')) {
        var tpl = Templates.getById(id);
        if (tpl) {
          Editor.loadState(tpl);
          document.getElementById('templateOv').hidden = true;
        }
      }
      if (e.target.classList.contains('tpl-update')) {
        Templates.update(id, Editor.getState());
        renderTemplateList();
      }
      if (e.target.classList.contains('tpl-del')) {
        Templates.remove(id);
        renderTemplateList();
      }
    };
  }

  function escHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
