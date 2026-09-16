/* === templates.js — 템플릿 CRUD + localStorage === */

var Templates = (function () {
  var STORE_KEY = 'hamzzi_templates';
  var REQUIRED_FIELDS = ['id', 'name', 'aspectRatio', 'text', 'textColor', 'fontSize', 'textX', 'textY'];

  function loadAll() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (t) { return validateTemplate(t).ok; });
    } catch (e) {
      return [];
    }
  }

  function saveAll(templates) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(templates));
    } catch (e) { /* silent */ }
  }

  function create(state) {
    var tpl = stateToTemplate(state);
    tpl.id = Utils.generateId();
    tpl.name = state.text ? state.text.substring(0, 20) : '새 템플릿';
    tpl.createdAt = Date.now();
    var all = loadAll();
    all.push(tpl);
    saveAll(all);
    return tpl;
  }

  function update(id, state) {
    var all = loadAll();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) {
        var updated = stateToTemplate(state);
        updated.id = id;
        updated.name = state.text ? state.text.substring(0, 20) : all[i].name;
        updated.createdAt = all[i].createdAt;
        all[i] = updated;
        saveAll(all);
        return updated;
      }
    }
    return null;
  }

  function remove(id) {
    var all = loadAll();
    var filtered = all.filter(function (t) { return t.id !== id; });
    saveAll(filtered);
    return filtered;
  }

  function getById(id) {
    var all = loadAll();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) return all[i];
    }
    return null;
  }

  function stateToTemplate(state) {
    return {
      id: '',
      name: '',
      hamsterId: state.hamsterId || 'default',
      imageData: state.imageDataUrl || '',
      aspectRatio: state.ratio,
      text: state.text,
      textColor: state.textColor,
      fontSize: state.fontSize,
      textX: state.textX,
      textY: state.textY,
      bubble: state.bubble,
      bubbleColor: state.bubbleColor || '#ffffff',
      bgColor: state.bgColor,
      fitMode: state.fitMode || 'cover',
      imagePanX: state.imagePanX || 0,
      imagePanY: state.imagePanY || 0,
      imageZoom: state.imageZoom || 100,
      fontFamily: state.fontFamily || "'Noto Sans KR', sans-serif",
      stickers: state.stickers || [],
      createdAt: Date.now()
    };
  }

  function validateTemplate(t) {
    if (!t || typeof t !== 'object') return { ok: false, reason: '템플릿 데이터가 올바르지 않습니다.' };
    for (var i = 0; i < REQUIRED_FIELDS.length; i++) {
      if (t[REQUIRED_FIELDS[i]] === undefined || t[REQUIRED_FIELDS[i]] === null) {
        return { ok: false, reason: '필수 항목 "' + REQUIRED_FIELDS[i] + '"이 없습니다.' };
      }
    }
    return { ok: true };
  }

  /* JSON import: 전체 검증 후 저장 */
  function importJson(jsonStr) {
    var parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      return { ok: false, reason: '잘못된 JSON 형식입니다: ' + e.message };
    }

    var templates;
    if (Array.isArray(parsed)) {
      templates = parsed;
    } else if (parsed && Array.isArray(parsed.templates)) {
      templates = parsed.templates;
    } else {
      return { ok: false, reason: 'JSON에 templates 배열이 없습니다.' };
    }

    /* 전체 먼저 검증 */
    for (var i = 0; i < templates.length; i++) {
      var v = validateTemplate(templates[i]);
      if (!v.ok) {
        return { ok: false, reason: '템플릿 ' + (i + 1) + '번: ' + v.reason };
      }
    }

    /* 모두 통과 → 저장 */
    saveAll(templates);
    return { ok: true, count: templates.length };
  }

  function exportJson() {
    var all = loadAll();
    return JSON.stringify({ templates: all }, null, 2);
  }

  return {
    loadAll: loadAll,
    create: create,
    update: update,
    remove: remove,
    getById: getById,
    importJson: importJson,
    exportJson: exportJson,
    validateTemplate: validateTemplate
  };
})();
