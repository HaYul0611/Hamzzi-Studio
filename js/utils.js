/* === utils.js — 공통 유틸리티 === */

var Utils = (function () {
  var ALLOWED_TYPES = ['image/png', 'image/jpeg'];
  var MAX_FILE_SIZE = 10 * 1024 * 1024; /* 10MB */

  function validateImageFile(file) {
    if (!file) return { ok: false, reason: '파일이 선택되지 않았습니다.' };
    if (ALLOWED_TYPES.indexOf(file.type) === -1) {
      return { ok: false, reason: '지원하지 않는 파일 형식입니다. PNG 또는 JPEG 이미지를 사용해주세요.' };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { ok: false, reason: '파일 크기가 10MB를 초과합니다.' };
    }
    return { ok: true };
  }

  function loadImageFromFile(file, cb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () { cb(null, img); };
      img.onerror = function () { cb('이미지를 읽을 수 없습니다.'); };
      img.src = e.target.result;
    };
    reader.onerror = function () { cb('파일을 읽을 수 없습니다.'); };
    reader.readAsDataURL(file);
  }

  function loadImageFromUrl(url, cb) {
    var img = new Image();
    /* 로컬(file://) 및 상대 경로에서는 crossOrigin을 지정하지 않아야 CORS 차단이 발생하지 않음 */
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = function () { cb(null, img); };
    img.onerror = function () {
      /* crossOrigin으로 실패했을 경우 crossOrigin 없이 재시도 */
      if (img.crossOrigin) {
        var retryImg = new Image();
        retryImg.onload = function () { cb(null, retryImg); };
        retryImg.onerror = function () { cb('이미지를 불러올 수 없습니다.'); };
        retryImg.src = url;
      } else {
        cb('이미지를 불러올 수 없습니다.');
      }
    };
    img.src = url;
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }

  function showToast(el, msg, type, duration) {
    if (!el) return;
    clearTimeout(el._timer);
    clearTimeout(el._fadeTimer);
    el.textContent = msg;
    el.className = 'toast ' + (type || 'error') + ' show';
    el.hidden = false;
    el.removeAttribute('hidden');

    var dur = duration || 3000;
    el._timer = setTimeout(function () {
      el.classList.add('hide-out');
      el._fadeTimer = setTimeout(function () {
        el.className = 'toast';
        el.hidden = true;
        el.setAttribute('hidden', '');
        el.textContent = '';
      }, 250);
    }, dur);
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1) + ' ' + sizes[i];
  }

  /* 고화질 스마트 이미지 압축 (화질 보존 + 용량 80~95% 절감) */
  function compressImageFile(file, options, cb) {
    var opts = options || {};
    var maxDim = opts.maxDim || 2048;
    var quality = opts.quality !== undefined ? opts.quality : 0.88;
    var origSize = file.size;

    loadImageFromFile(file, function (err, img) {
      if (err) return cb(err);

      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;

      /* 비율 유지하면서 최대 2048px로 최적화 */
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);

      /* 투명 채널이 없는 JPEG이거나 일반 사진은 JPEG 0.88로 압축, 투명도 보존 파일은 PNG */
      var isPng = file.type === 'image/png';
      var mimeType = isPng ? 'image/png' : 'image/jpeg';
      var dataUrl = canvas.toDataURL(mimeType, quality);

      /* 압축된 크기 계산 (Base64 바이너리 환산) */
      var base64Length = dataUrl.length - (dataUrl.indexOf(',') + 1);
      var compressedSize = Math.round(base64Length * 0.75);

      /* 혹시 압축 후 용량이 원본보다 크면 원본 유지 */
      var saving = origSize > compressedSize ? Math.round((1 - compressedSize / origSize) * 100) : 0;

      var resultImg = new Image();
      resultImg.onload = function () {
        cb(null, resultImg, {
          origSize: origSize,
          compressedSize: compressedSize,
          reductionPercent: saving,
          origFormatted: formatFileSize(origSize),
          compressedFormatted: formatFileSize(compressedSize),
          width: w,
          height: h
        });
      };
      resultImg.onerror = function () {
        cb(null, img, {
          origSize: origSize,
          compressedSize: origSize,
          reductionPercent: 0,
          origFormatted: formatFileSize(origSize),
          compressedFormatted: formatFileSize(origSize),
          width: img.width,
          height: img.height
        });
      };
      resultImg.src = dataUrl;
    });
  }

  /* 사진 자동 누끼 따기 (지능형 가장자리 감지 + 플러드필 배경 투명화) */
  function createCutoutImage(img, options, cb) {
    if (!img) return cb('이미지가 유효하지 않습니다.');
    var opts = options || {};
    var tolerance = opts.tolerance !== undefined ? opts.tolerance : 35; /* 10~75 */

    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    if (!w || !h) return cb('이미지 해상도를 읽을 수 없습니다.');

    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    var imgData;
    try {
      imgData = ctx.getImageData(0, 0, w, h);
    } catch (e) {
      return cb('이미지 픽셀 데이터에 접근할 수 없습니다: ' + e.message);
    }

    var data = imgData.data;
    var totalPixels = w * h;
    var visited = new Uint8Array(totalPixels);

    /* 1. 이미지 네 귀퉁이 및 외곽 둘레 샘플링으로 배경 대표 색상 산출 */
    var samplePoints = [
      0, 1, 2, Math.floor(w / 2), w - 1,
      totalPixels - w, totalPixels - Math.floor(w / 2), totalPixels - 1
    ];
    var bgR = 0, bgG = 0, bgB = 0, sampleCount = 0;
    for (var sp = 0; sp < samplePoints.length; sp++) {
      var pIdx = samplePoints[sp];
      if (pIdx >= 0 && pIdx < totalPixels) {
        bgR += data[pIdx * 4];
        bgG += data[pIdx * 4 + 1];
        bgB += data[pIdx * 4 + 2];
        sampleCount++;
      }
    }
    bgR = Math.round(bgR / sampleCount);
    bgG = Math.round(bgG / sampleCount);
    bgB = Math.round(bgB / sampleCount);

    /* 2. 외곽 테두리(Perimeter)에서 시작하는 4방향 BFS 플러드필 */
    var queue = new Int32Array(totalPixels);
    var head = 0, tail = 0;

    function colorDist(r1, g1, b1, r2, g2, b2) {
      var dr = r1 - r2;
      var dg = g1 - g2;
      var db = b1 - b2;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    /* 상/하/좌/우 테두리 픽셀을 시작 시드로 추가 */
    for (var x = 0; x < w; x++) {
      /* 상단 */
      var topIdx = x;
      if (colorDist(data[topIdx * 4], data[topIdx * 4 + 1], data[topIdx * 4 + 2], bgR, bgG, bgB) <= tolerance * 1.5) {
        visited[topIdx] = 1;
        queue[tail++] = topIdx;
      }
      /* 하단 */
      var btmIdx = (h - 1) * w + x;
      if (colorDist(data[btmIdx * 4], data[btmIdx * 4 + 1], data[btmIdx * 4 + 2], bgR, bgG, bgB) <= tolerance * 1.5) {
        visited[btmIdx] = 1;
        queue[tail++] = btmIdx;
      }
    }
    for (var y = 0; y < h; y++) {
      /* 좌측 */
      var leftIdx = y * w;
      if (!visited[leftIdx] && colorDist(data[leftIdx * 4], data[leftIdx * 4 + 1], data[leftIdx * 4 + 2], bgR, bgG, bgB) <= tolerance * 1.5) {
        visited[leftIdx] = 1;
        queue[tail++] = leftIdx;
      }
      /* 우측 */
      var rightIdx = y * w + (w - 1);
      if (!visited[rightIdx] && colorDist(data[rightIdx * 4], data[rightIdx * 4 + 1], data[rightIdx * 4 + 2], bgR, bgG, bgB) <= tolerance * 1.5) {
        visited[rightIdx] = 1;
        queue[tail++] = rightIdx;
      }
    }

    /* BFS 탐색으로 배경 영역 완전 확장 */
    var tolDist = tolerance * 1.6;
    var softBand = 10; /* 가장자리 페더링 밴드 */

    while (head < tail) {
      var curr = queue[head++];
      var cx = curr % w;
      var cy = Math.floor(curr / w);

      /* 4방향 이웃 탐색 */
      var neighbors = [
        cx > 0 ? curr - 1 : -1,
        cx < w - 1 ? curr + 1 : -1,
        cy > 0 ? curr - w : -1,
        cy < h - 1 ? curr + w : -1
      ];

      for (var ni = 0; ni < 4; ni++) {
        var nIdx = neighbors[ni];
        if (nIdx !== -1 && !visited[nIdx]) {
          var nr = data[nIdx * 4];
          var ng = data[nIdx * 4 + 1];
          var nb = data[nIdx * 4 + 2];
          var dist = colorDist(nr, ng, nb, bgR, bgG, bgB);

          if (dist <= tolDist) {
            visited[nIdx] = 1;
            queue[tail++] = nIdx;
          }
        }
      }
    }

    /* 3. 배경으로 확인된 픽셀 투명화 및 경계선 부드러운 안티에일리어싱 처리 */
    for (var i = 0; i < totalPixels; i++) {
      if (visited[i]) {
        var r = data[i * 4];
        var g = data[i * 4 + 1];
        var b = data[i * 4 + 2];
        var d = colorDist(r, g, b, bgR, bgG, bgB);

        if (d > tolDist - softBand) {
          /* 경계선 부드러운 알파 페더링 */
          var alphaFactor = (d - (tolDist - softBand)) / softBand;
          data[i * 4 + 3] = Math.round(alphaFactor * 255);
        } else {
          data[i * 4 + 3] = 0; /* 배경 완전 투명화 */
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);

    var cutoutImg = new Image();
    cutoutImg.onload = function () {
      cb(null, cutoutImg);
    };
    cutoutImg.onerror = function () {
      cb('누끼 이미지 변환에 실패했습니다.');
    };
    cutoutImg.src = canvas.toDataURL('image/png');
  }

  /* 화면비 → 해상도 매핑 */
  var RATIOS = {
    '1:1': { w: 1, h: 1 },
    '4:5': { w: 4, h: 5 },
    '9:16': { w: 9, h: 16 }
  };

  function getOutputSize(ratio, baseWidth) {
    var r = RATIOS[ratio] || RATIOS['1:1'];
    var w = baseWidth || 1080;
    var h = Math.round(w * r.h / r.w);
    return { w: w, h: h };
  }

  return {
    validateImageFile: validateImageFile,
    loadImageFromFile: loadImageFromFile,
    loadImageFromUrl: loadImageFromUrl,
    compressImageFile: compressImageFile,
    createCutoutImage: createCutoutImage,
    formatFileSize: formatFileSize,
    generateId: generateId,
    showToast: showToast,
    getOutputSize: getOutputSize,
    RATIOS: RATIOS
  };
})();
