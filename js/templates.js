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

  function create(state, customName) {
    var tpl = stateToTemplate(state);
    tpl.id = (window.Utils && Utils.generateId) ? Utils.generateId() : ('tpl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));

    var trimmedName = customName ? String(customName).trim() : '';
    if (trimmedName) {
      tpl.name = trimmedName;
    } else if (state.text && String(state.text).trim()) {
      tpl.name = String(state.text).trim().substring(0, 20);
    } else {
      tpl.name = '새 템플릿';
    }

    var now = Date.now();
    tpl.createdAt = now;
    tpl.updatedAt = now;

    var all = loadAll();
    all.push(tpl);
    saveAll(all);
    return tpl;
  }

  function update(id, state, customName) {
    var all = loadAll();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) {
        var prev = all[i];
        var updated = stateToTemplate(state);
        updated.id = id;

        var trimmedName = customName ? String(customName).trim() : '';
        if (trimmedName) {
          updated.name = trimmedName;
        } else {
          updated.name = prev.name || (state.text ? String(state.text).trim().substring(0, 20) : '새 템플릿');
        }

        updated.createdAt = prev.createdAt || Date.now();
        updated.updatedAt = Date.now();
        all[i] = updated;
        saveAll(all);
        return updated;
      }
    }
    return null;
  }

  function rename(id, newName) {
    var all = loadAll();
    var trimmed = String(newName || '').trim();
    if (!trimmed) return null;

    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) {
        all[i].name = trimmed;
        all[i].updatedAt = Date.now();
        saveAll(all);
        return all[i];
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
    var now = Date.now();
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
      bubbleTail: state.bubbleTail || 'bottom-left',
      bgColor: state.bgColor,
      fitMode: state.fitMode || 'cover',
      imagePanX: state.imagePanX || 0,
      imagePanY: state.imagePanY || 0,
      imageZoom: state.imageZoom || 100,
      fontFamily: state.fontFamily || "'Noto Sans KR', sans-serif",
      stickers: state.stickers || [],
      textItems: state.textItems ? JSON.parse(JSON.stringify(state.textItems)) : [],
      createdAt: now,
      updatedAt: now
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

  /* JSON import: 전체 검증 후 저장 (mode: 'merge' | 'replace') */
  function importJson(jsonStr, mode) {
    mode = mode || 'merge';
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

    if (templates.length === 0) {
      return { ok: false, reason: '가져올 템플릿 데이터가 비어 있습니다.' };
    }

    /* 전체 먼저 검증 */
    for (var i = 0; i < templates.length; i++) {
      var v = validateTemplate(templates[i]);
      if (!v.ok) {
        return { ok: false, reason: '템플릿 ' + (i + 1) + '번: ' + v.reason };
      }
    }

    var importedNames = [];
    var now = Date.now();

    // 템플릿 복제 및 타임스탬프 보정
    var processed = templates.map(function (t, idx) {
      var copy = Object.assign({}, t);
      copy.name = copy.name || ('템플릿 ' + (idx + 1));
      importedNames.push(copy.name);
      if (!copy.createdAt) copy.createdAt = now;
      if (!copy.updatedAt) copy.updatedAt = copy.createdAt;
      return copy;
    });

    var finalCount = 0;
    if (mode === 'replace') {
      saveAll(processed);
      finalCount = processed.length;
    } else {
      // merge (기존 목록에 추가)
      var currentAll = loadAll();
      var existingIds = {};
      for (var k = 0; k < currentAll.length; k++) {
        existingIds[currentAll[k].id] = true;
      }

      processed.forEach(function (t) {
        // ID 중복 방지
        if (existingIds[t.id]) {
          t.id = (window.Utils && Utils.generateId) ? Utils.generateId() : ('tpl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
        }
        existingIds[t.id] = true;
        currentAll.push(t);
      });
      saveAll(currentAll);
      finalCount = currentAll.length;
    }

    return {
      ok: true,
      count: processed.length,
      totalCount: finalCount,
      importedNames: importedNames,
      mode: mode
    };
  }

  function exportJson() {
    var all = loadAll();
    return JSON.stringify({ templates: all }, null, 2);
  }

  return {
    loadAll: loadAll,
    create: create,
    update: update,
    rename: rename,
    remove: remove,
    getById: getById,
    importJson: importJson,
    exportJson: exportJson,
    validateTemplate: validateTemplate
  };
})();
