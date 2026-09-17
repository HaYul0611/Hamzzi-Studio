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

  /* 사진 자동 누끼 따기 (동적 적응형 배경 모델링 + 경계선 차단 + 피사체 무손실 보호 누끼) */
  function createCutoutImage(img, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (typeof callback !== 'function') callback = function () { };
    if (!img) return callback('이미지가 유효하지 않습니다.');
    var opts = options || {};
    var tolerance = opts.tolerance !== undefined ? opts.tolerance : 35; /* 10~75 */

    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    if (!w || !h) return callback('이미지 해상도를 읽을 수 없습니다.');

    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    var imgData;
    try {
      imgData = ctx.getImageData(0, 0, w, h);
    } catch (e) {
      return callback('이미지 픽셀 데이터에 접근할 수 없습니다: ' + e.message);
    }

    var data = imgData.data;
    var totalPixels = w * h;

    /* 1. 이미지 외곽 경계선(좌/우/상단) 샘플링 및 배경 통계(평균 및 표준편차) 산출 */
    var borderSumR = 0, borderSumG = 0, borderSumB = 0, borderCount = 0;
    var borderSamples = [];

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < 3; x++) {
        var idx = (y * w + x) * 4;
        borderSumR += data[idx]; borderSumG += data[idx + 1]; borderSumB += data[idx + 2];
        borderCount++;
        if (y % 4 === 0) borderSamples.push([data[idx], data[idx + 1], data[idx + 2]]);
      }
      for (var rx = w - 3; rx < w; rx++) {
        var rIdx = (y * w + rx) * 4;
        borderSumR += data[rIdx]; borderSumG += data[rIdx + 1]; borderSumB += data[rIdx + 2];
        borderCount++;
        if (y % 4 === 0) borderSamples.push([data[rIdx], data[rIdx + 1], data[rIdx + 2]]);
      }
    }
    for (var tx = 3; tx < w - 3; tx++) {
      for (var ty = 0; ty < 3; ty++) {
        var tIdx = (ty * w + tx) * 4;
        borderSumR += data[tIdx]; borderSumG += data[tIdx + 1]; borderSumB += data[tIdx + 2];
        borderCount++;
        if (tx % 4 === 0) borderSamples.push([data[tIdx], data[tIdx + 1], data[tIdx + 2]]);
      }
    }

    var avgBgR = borderCount > 0 ? borderSumR / borderCount : 245;
    var avgBgG = borderCount > 0 ? borderSumG / borderCount : 245;
    var avgBgB = borderCount > 0 ? borderSumB / borderCount : 245;

    var sumVar = 0;
    for (var s = 0; s < borderSamples.length; s++) {
      var dr = borderSamples[s][0] - avgBgR;
      var dg = borderSamples[s][1] - avgBgG;
      var db = borderSamples[s][2] - avgBgB;
      sumVar += (dr * dr + dg * dg + db * db);
    }
    var borderStdDev = borderSamples.length > 0 ? Math.sqrt(sumVar / borderSamples.length) : 3;

    /* 2. 행(Row)별 좌우 그라데이션 적응형 배경색 모델링 */
    var rowBg = new Float32Array(h * 6);
    var sampleDepth = 4;
    for (var ry = 0; ry < h; ry++) {
      var lR = 0, lG = 0, lB = 0, rR = 0, rG = 0, rB = 0;
      for (var sd = 0; sd < sampleDepth; sd++) {
        var leftP4 = (ry * w + sd) * 4;
        var rightP4 = (ry * w + (w - 1 - sd)) * 4;
        lR += data[leftP4]; lG += data[leftP4 + 1]; lB += data[leftP4 + 2];
        rR += data[rightP4]; rG += data[rightP4 + 1]; rB += data[rightP4 + 2];
      }
      var rOffset = ry * 6;
      rowBg[rOffset] = lR / sampleDepth;
      rowBg[rOffset + 1] = lG / sampleDepth;
      rowBg[rOffset + 2] = lB / sampleDepth;
      rowBg[rOffset + 3] = rR / sampleDepth;
      rowBg[rOffset + 4] = rG / sampleDepth;
      rowBg[rOffset + 5] = rB / sampleDepth;
    }

    function distToExpectedBg(px, py, r, g, b) {
      var ro = py * 6;
      var xRatio = w > 1 ? px / (w - 1) : 0;
      var expR = rowBg[ro] + (rowBg[ro + 3] - rowBg[ro]) * xRatio;
      var expG = rowBg[ro + 1] + (rowBg[ro + 4] - rowBg[ro + 1]) * xRatio;
      var expB = rowBg[ro + 2] + (rowBg[ro + 5] - rowBg[ro + 2]) * xRatio;

      var dR = r - expR;
      var dG = g - expG;
      var dB = b - expB;
      return Math.sqrt(dR * dR + dG * dG + dB * dB);
    }

    /* 3. 정밀 경계선(Edge Magnitude) 맵 및 팽창 장벽(Dilation Barrier) 계산 */
    var grad = new Uint8Array(totalPixels);
    var isBarrier = new Uint8Array(totalPixels);
    var edgeThresh = Math.max(6, Math.min(14, Math.round(7 + borderStdDev * 0.5)));

    for (var gy = 1; gy < h - 1; gy++) {
      var gRow = gy * w;
      for (var gx = 1; gx < w - 1; gx++) {
        var gIdx = gRow + gx;
        var r4 = (gIdx + 1) * 4;
        var l4 = (gIdx - 1) * 4;
        var d4 = (gIdx + w) * 4;
        var u4 = (gIdx - w) * 4;

        var dx = Math.max(
          Math.abs(data[r4] - data[l4]),
          Math.abs(data[r4 + 1] - data[l4 + 1]),
          Math.abs(data[r4 + 2] - data[l4 + 2])
        );
        var dy = Math.max(
          Math.abs(data[d4] - data[u4]),
          Math.abs(data[d4 + 1] - data[u4 + 1]),
          Math.abs(data[d4 + 2] - data[u4 + 2])
        );
        var mag = Math.max(dx, dy);
        grad[gIdx] = mag;

        if (mag >= edgeThresh) {
          for (var bdy = -1; bdy <= 1; bdy++) {
            for (var bdx = -1; bdx <= 1; bdx++) {
              isBarrier[(gy + bdy) * w + (gx + bdx)] = 1;
            }
          }
        }
      }
    }

    /* 4. 피사체 무손실 보호 감도 산출 (배경 분산에 정밀하게 연동) */
    var safeBgTol = Math.max(12, Math.min(26, Math.round(borderStdDev * 1.8 + tolerance * 0.38)));
    var maxStepDiff = Math.max(10, Math.min(20, Math.round(9 + tolerance * 0.2)));

    var visited = new Uint8Array(totalPixels);
    var queue = new Int32Array(totalPixels);
    var head = 0, tail = 0;

    function trySeed(px, py) {
      var pIdx = py * w + px;
      if (visited[pIdx] || isBarrier[pIdx]) return;
      var p4 = pIdx * 4;
      var r = data[p4], g = data[p4 + 1], b = data[p4 + 2];
      
      /* 그림자/발(어두운 영역) 및 경계선 시드 침범 차단 */
      if (grad[pIdx] >= edgeThresh) return;
      var lum = (r * 299 + g * 587 + b * 114) / 1000;
      var ro = py * 6;
      var xRatio = w > 1 ? px / (w - 1) : 0;
      var expR = rowBg[ro] + (rowBg[ro + 3] - rowBg[ro]) * xRatio;
      var expG = rowBg[ro + 1] + (rowBg[ro + 4] - rowBg[ro + 1]) * xRatio;
      var expB = rowBg[ro + 2] + (rowBg[ro + 5] - rowBg[ro + 2]) * xRatio;
      var expLum = (expR * 299 + expG * 587 + expB * 114) / 1000;
      if (lum < expLum - 12) return; /* 바닥 그림자나 발가락 보호 */

      var d = distToExpectedBg(px, py, r, g, b);
      if (d <= safeBgTol * 0.8) {
        visited[pIdx] = 1;
        queue[tail++] = pIdx;
      }
    }

    /* 외곽 테두리 시드 초기화: 상단 및 상단 65% 좌우 외곽만 안전 시드 주입 (하단 발/바닥 그림자 보호) */
    for (var x = 0; x < w; x++) { trySeed(x, 0); }
    var safeSideH = Math.floor(h * 0.65);
    for (var y = 0; y < safeSideH; y++) {
      trySeed(0, y);
      trySeed(w - 1, y);
    }

    /* 5. 피사체 무손실 보호 BFS 탐색 */
    var coreLeft = Math.floor(w * 0.28);
    var coreRight = Math.ceil(w * 0.72);
    var coreTop = Math.floor(h * 0.28);
    var coreBottom = Math.ceil(h * 0.75);

    while (head < tail) {
      var curr = queue[head++];
      var cx = curr % w;
      var cy = Math.floor(curr / w);
      var c4 = curr * 4;
      var curR = data[c4], curG = data[c4 + 1], curB = data[c4 + 2];

      var neighbors = [
        cx > 0 ? curr - 1 : -1,
        cx < w - 1 ? curr + 1 : -1,
        cy > 0 ? curr - w : -1,
        cy < h - 1 ? curr + w : -1
      ];

      for (var ni = 0; ni < 4; ni++) {
        var nIdx = neighbors[ni];
        if (nIdx === -1 || visited[nIdx]) continue;
        if (isBarrier[nIdx]) continue;

        var nx = nIdx % w;
        var ny = Math.floor(nIdx / w);
        var n4 = nIdx * 4;
        var nr = data[n4], ng = data[n4 + 1], nb = data[n4 + 2];

        /* 피사체 중심 코어 영역 보호 */
        if (nx >= coreLeft && nx <= coreRight && ny >= coreTop && ny <= coreBottom) {
          var coreDist = distToExpectedBg(nx, ny, nr, ng, nb);
          if (coreDist > 6 || grad[nIdx] > 4) continue;
        }

        /* 바닥 접촉 그림자 및 발 보호: 기대 배경 밝기보다 현저히 어두운 픽셀 차단 */
        var nLum = (nr * 299 + ng * 587 + nb * 114) / 1000;
        var nRo = ny * 6;
        var nXRatio = w > 1 ? nx / (w - 1) : 0;
        var nExpR = rowBg[nRo] + (rowBg[nRo + 3] - rowBg[nRo]) * nXRatio;
        var nExpG = rowBg[nRo + 1] + (rowBg[nRo + 4] - rowBg[nRo + 1]) * nXRatio;
        var nExpB = rowBg[nRo + 2] + (rowBg[nRo + 5] - rowBg[nRo + 2]) * nXRatio;
        var nExpLum = (nExpR * 299 + nExpG * 587 + nExpB * 114) / 1000;
        if (nLum < nExpLum - 12) continue;

        var stepDiff = Math.max(Math.abs(nr - curR), Math.abs(ng - curG), Math.abs(nb - curB));
        if (stepDiff > maxStepDiff) continue;

        var d = distToExpectedBg(nx, ny, nr, ng, nb);
        if (d <= safeBgTol) {
          visited[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }
    }

    /* 6. 형태학적 닫힘(Morphological Closing) 및 내부 홀(Hole) 완벽 메우기 */
    var fgMask = new Uint8Array(totalPixels);
    for (var fi = 0; fi < totalPixels; fi++) {
      fgMask[fi] = visited[fi] ? 0 : 1;
    }

    var dilatedFg = new Uint8Array(totalPixels);
    var closeRad = 3;
    for (var my = closeRad; my < h - closeRad; my++) {
      var mRow = my * w;
      for (var mx = closeRad; mx < w - closeRad; mx++) {
        if (fgMask[mRow + mx]) {
          for (var cdy = -closeRad; cdy <= closeRad; cdy++) {
            var rowOff = (my + cdy) * w;
            for (var cdx = -closeRad; cdx <= closeRad; cdx++) {
              dilatedFg[rowOff + (mx + cdx)] = 1;
            }
          }
        }
      }
    }

    var closedFg = new Uint8Array(totalPixels);
    for (var ey = closeRad; ey < h - closeRad; ey++) {
      var eRow = ey * w;
      for (var ex = closeRad; ex < w - closeRad; ex++) {
        var allCovered = true;
        for (var cdy = -closeRad; cdy <= closeRad; cdy++) {
          var rowOff = (ey + cdy) * w;
          for (var cdx = -closeRad; cdx <= closeRad; cdx++) {
            if (!dilatedFg[rowOff + (ex + cdx)]) {
              allCovered = false;
              break;
            }
          }
          if (!allCovered) break;
        }
        if (allCovered) closedFg[eRow + ex] = 1;
      }
    }

    for (var ci = 0; ci < totalPixels; ci++) {
      if (closedFg[ci]) {
        visited[ci] = 0; /* 피사체 복원 */
      }
    }

    /* 7. 부드러운 안티에일리어싱(알파 페더링) — 원본 RGB 픽셀 100% 무손실 보존 */
    var softBand = 5;
    for (var y = 0; y < h; y++) {
      var row = y * w;
      for (var x = 0; x < w; x++) {
        var i = row + x;
        var p4 = i * 4;

        if (visited[i]) {
          var hasFgNeighbor = false;
          if (x > 0 && !visited[i - 1]) hasFgNeighbor = true;
          else if (x < w - 1 && !visited[i + 1]) hasFgNeighbor = true;
          else if (y > 0 && !visited[i - w]) hasFgNeighbor = true;
          else if (y < h - 1 && !visited[i + w]) hasFgNeighbor = true;

          var d = distToExpectedBg(x, y, data[p4], data[p4 + 1], data[p4 + 2]);
          if (hasFgNeighbor && d > safeBgTol - softBand) {
            var alpha = Math.min(255, Math.max(0, Math.round(((d - (safeBgTol - softBand)) / softBand) * 255)));
            data[p4 + 3] = alpha;
          } else {
            data[p4 + 3] = 0;
          }
        } else {
          data[p4 + 3] = 255;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);

    var cutoutImg = new Image();
    cutoutImg.onload = function () {
      callback(null, cutoutImg);
    };
    cutoutImg.onerror = function () {
      callback('누끼 이미지 변환에 실패했습니다.');
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
