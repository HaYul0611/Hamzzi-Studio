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

  /* 사진 자동 누끼 따기 (Sobel 경계선 장벽 감지 + 피사체 보호 BFS 플러드필 배경 투명화) */
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

    /* 1. 색상 그래디언트(Sobel/Gradient Magnitude) 맵 사전 계산 */
    /* 피사체(인물, 햄스터, 사물)의 외곽 윤곽선은 높은 그래디언트 값을 가짐 */
    var grad = new Uint8Array(totalPixels);
    for (var y = 1; y < h - 1; y++) {
      var rowOffset = y * w;
      for (var x = 1; x < w - 1; x++) {
        var idx = rowOffset + x;
        var rIdx = (idx + 1) * 4;
        var lIdx = (idx - 1) * 4;
        var dIdx = (idx + w) * 4;
        var uIdx = (idx - w) * 4;

        var dxR = Math.abs(data[rIdx] - data[lIdx]);
        var dxG = Math.abs(data[rIdx + 1] - data[lIdx + 1]);
        var dxB = Math.abs(data[rIdx + 2] - data[lIdx + 2]);

        var dyR = Math.abs(data[dIdx] - data[uIdx]);
        var dyG = Math.abs(data[dIdx + 1] - data[uIdx + 1]);
        var dyB = Math.abs(data[dIdx + 2] - data[uIdx + 2]);

        var mag = Math.max(dxR, dxG, dxB, dyR, dyG, dyB);
        grad[idx] = mag > 255 ? 255 : mag;
      }
    }

    /* 2. 안전 모서리(Safe Corners) 및 상단 외곽 영역에서 배경 대표 색상 추출 */
    /* 피사체(인물/동물)가 주로 위치하는 하단 중앙은 의도적으로 제외 */
    var cornerPatchW = Math.max(5, Math.min(25, Math.floor(w * 0.1)));
    var cornerPatchH = Math.max(5, Math.min(25, Math.floor(h * 0.1)));

    function getPatchAvgColor(startX, startY, pW, pH) {
      var sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (var py = startY; py < startY + pH; py++) {
        for (var px = startX; px < startX + pW; px++) {
          if (px >= 0 && px < w && py >= 0 && py < h) {
            var p4 = (py * w + px) * 4;
            sumR += data[p4];
            sumG += data[p4 + 1];
            sumB += data[p4 + 2];
            count++;
          }
        }
      }
      return count > 0 ? [Math.round(sumR / count), Math.round(sumG / count), Math.round(sumB / count)] : [245, 245, 245];
    }

    var colTL = getPatchAvgColor(0, 0, cornerPatchW, cornerPatchH);
    var colTR = getPatchAvgColor(w - cornerPatchW, 0, cornerPatchW, cornerPatchH);
    var colBL = getPatchAvgColor(0, h - cornerPatchH, cornerPatchW, cornerPatchH);
    var colBR = getPatchAvgColor(w - cornerPatchW, h - cornerPatchH, cornerPatchW, cornerPatchH);

    var topBgR = Math.round((colTL[0] + colTR[0]) / 2);
    var topBgG = Math.round((colTL[1] + colTR[1]) / 2);
    var topBgB = Math.round((colTL[2] + colTR[2]) / 2);

    var btmBgR = Math.round((colBL[0] + colBR[0]) / 2);
    var btmBgG = Math.round((colBL[1] + colBR[1]) / 2);
    var btmBgB = Math.round((colBL[2] + colBR[2]) / 2);

    function colorDist(r1, g1, b1, r2, g2, b2) {
      var dr = r1 - r2;
      var dg = g1 - g2;
      var db = b1 - b2;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    function distToBg(r, g, b, py) {
      /* 상하 수직 그라데이션 보간 배경 색상 */
      var yRatio = h > 1 ? py / (h - 1) : 0;
      var expR = topBgR + (btmBgR - topBgR) * yRatio;
      var expG = topBgG + (btmBgG - topBgG) * yRatio;
      var expB = topBgB + (btmBgB - topBgB) * yRatio;

      var dGrad = colorDist(r, g, b, expR, expG, expB);
      var dTL = colorDist(r, g, b, colTL[0], colTL[1], colTL[2]);
      var dTR = colorDist(r, g, b, colTR[0], colTR[1], colTR[2]);
      var dBL = colorDist(r, g, b, colBL[0], colBL[1], colBL[2]);
      var dBR = colorDist(r, g, b, colBR[0], colBR[1], colBR[2]);

      return Math.min(dGrad, dTL, dTR, dBL, dBR);
    }

    /* 3. 경계선 차단 BFS 플러드필 초기화 */
    var visited = new Uint8Array(totalPixels);
    var queue = new Int32Array(totalPixels);
    var head = 0, tail = 0;

    var baseTolDist = tolerance * 1.35;
    /* 경계선 차단 임계값: 감도에 연동하되 피사체 경계(14~28)를 넘지 않도록 제한 */
    var baseEdgeThresh = Math.max(10, Math.min(26, Math.round(11 + tolerance * 0.22)));
    var maxStepDiff = Math.max(12, Math.min(28, Math.round(13 + tolerance * 0.25)));

    /* 외곽 테두리에서 안전한 시드 픽셀 선택 (피사체 경계에 닿지 않는 모서리/상단 중심) */
    function trySeed(px, py) {
      var pIdx = py * w + px;
      if (visited[pIdx]) return;
      if (grad[pIdx] > baseEdgeThresh) return; /* 경계선 위 픽셀은 시드 제외 */

      var p4 = pIdx * 4;
      var d = distToBg(data[p4], data[p4 + 1], data[p4 + 2], py);
      if (d <= baseTolDist * 1.25) {
        visited[pIdx] = 1;
        queue[tail++] = pIdx;
      }
    }

    /* 상단 테두리 전 구간 */
    for (var x = 0; x < w; x++) {
      trySeed(x, 0);
    }
    /* 좌측 및 우측 테두리 */
    for (var y = 0; y < h; y++) {
      trySeed(0, y);
      trySeed(w - 1, y);
    }
    /* 하단 테두리는 좌/우 22% 모서리 영역만 안전 시드로 적용 (중앙 피사체 제외) */
    var btmSafeW = Math.floor(w * 0.22);
    for (var bx = 0; bx < btmSafeW; bx++) {
      trySeed(bx, h - 1);
      trySeed(w - 1 - bx, h - 1);
    }
    /* 하단 중앙부의 경우, 배경색과 아주 가깝고 그래디언트가 0에 가까운 경우에만 제한적 시드 */
    for (var mx = btmSafeW; mx < w - btmSafeW; mx++) {
      var mIdx = (h - 1) * w + mx;
      if (grad[mIdx] < 8) {
        var m4 = mIdx * 4;
        if (distToBg(data[m4], data[m4 + 1], data[m4 + 2], h - 1) < baseTolDist * 0.75) {
          trySeed(mx, h - 1);
        }
      }
    }

    /* 4. 피사체 중심 보호(Center Saliency Prior) + 경계선 차단 BFS 확장 */
    var centerX = w / 2;
    var centerY = h / 2;
    var maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);

    while (head < tail) {
      var curr = queue[head++];
      var cx = curr % w;
      var cy = Math.floor(curr / w);
      var c4 = curr * 4;
      var cr = data[c4];
      var cg = data[c4 + 1];
      var cbVal = data[c4 + 2];

      var neighbors = [
        cx > 0 ? curr - 1 : -1,
        cx < w - 1 ? curr + 1 : -1,
        cy > 0 ? curr - w : -1,
        cy < h - 1 ? curr + w : -1
      ];

      for (var ni = 0; ni < 4; ni++) {
        var nIdx = neighbors[ni];
        if (nIdx === -1 || visited[nIdx]) continue;

        var nx = nIdx % w;
        var ny = Math.floor(nIdx / w);

        /* 피사체 중심 거리 계산: 중심부(얼굴, 가슴, 배 털)로 진입할수록 임계값 강화 */
        var dx = nx - centerX;
        var dy = ny - centerY;
        var distCenter = Math.sqrt(dx * dx + dy * dy) / maxRadius; /* 0.0 ~ 1.0 */
        var centerFactor = Math.min(1.0, Math.max(0.38, distCenter * 1.25));

        /* 경계선(Edge) 장벽 검사: 중심부일수록 약한 경계선도 장벽으로 인정 */
        var curEdgeBarrier = Math.round(baseEdgeThresh * (0.55 + 0.45 * centerFactor));
        if (grad[nIdx] >= curEdgeBarrier) {
          continue; /* 경계선에 도달하면 플러드필 즉시 정지 */
        }

        /* 인접 픽셀 간 급격한 색상 점프 차단 */
        var n4 = nIdx * 4;
        var nr = data[n4];
        var ng = data[n4 + 1];
        var nb = data[n4 + 2];
        var stepDiff = colorDist(cr, cg, cbVal, nr, ng, nb);
        if (stepDiff > maxStepDiff * (0.6 + 0.4 * centerFactor)) {
          continue; /* 급격한 경계 통과 차단 */
        }

        /* 배경 색상과의 거리 검사 (중심부는 더욱 엄격하게 보호) */
        var curTolDist = baseTolDist * centerFactor;
        var d = distToBg(nr, ng, nb, ny);
        if (d <= curTolDist) {
          visited[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }
    }

    /* 5. 피사체 내부 고립 영역(Hole) 보호 및 알파 페더링(Anti-Aliasing) 처리 */
    var softBand = Math.max(6, Math.min(14, Math.round(tolerance * 0.3)));

    for (var y = 0; y < h; y++) {
      var row = y * w;
      for (var x = 0; x < w; x++) {
        var i = row + x;
        var p4 = i * 4;

        if (visited[i]) {
          var r = data[p4];
          var g = data[p4 + 1];
          var b = data[p4 + 2];
          var d = distToBg(r, g, b, y);

          /* 피사체 경계 부근 안티에일리어싱(페더링) */
          var hasFgNeighbor = false;
          if (x > 0 && !visited[i - 1]) hasFgNeighbor = true;
          else if (x < w - 1 && !visited[i + 1]) hasFgNeighbor = true;
          else if (y > 0 && !visited[i - w]) hasFgNeighbor = true;
          else if (y < h - 1 && !visited[i + w]) hasFgNeighbor = true;

          if (hasFgNeighbor || d > baseTolDist - softBand) {
            var alphaFactor = (d - (baseTolDist - softBand)) / softBand;
            if (alphaFactor < 0) alphaFactor = 0;
            if (alphaFactor > 1) alphaFactor = 1;
            data[p4 + 3] = Math.round(alphaFactor * 255);
          } else {
            data[p4 + 3] = 0; /* 배경 완전 투명화 */
          }
        } else {
          /* 피사체(인물/사물/햄스터)는 온전히 불투명(255) 유지 */
          data[p4 + 3] = 255;
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
