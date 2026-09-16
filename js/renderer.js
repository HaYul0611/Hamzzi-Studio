/* === renderer.js — 고화질 Canvas 렌더링 엔진 V2 (이미지 팬/줌/맞춤 + 부분 글자색 + 폰트 5종 + 스티커) === */

var Renderer = (function () {

  /**
   * 공통 렌더 함수: 미리보기(400px 기준)와 다운로드(1080px/2160px 기준) 동일 렌더링
   * @param {HTMLCanvasElement} canvas
   * @param {Object} state - 편집 상태
   * @param {number} outputWidth - 출력 너비 (px)
   */
  function render(canvas, state, outputWidth) {
    var size = Utils.getOutputSize(state.ratio, outputWidth);
    canvas.width = size.w;
    canvas.height = size.h;
    var ctx = canvas.getContext('2d');
    var W = size.w;
    var H = size.h;

    /* 고화질 렌더링 세팅 */
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    /* 1. 캔버스 배경 채우기 (투명 여백 또는 배경색 적용) */
    if (state.transparentBg) {
      ctx.clearRect(0, 0, W, H);
    } else {
      ctx.fillStyle = state.bgColor || '#f5f5f5';
      ctx.fillRect(0, 0, W, H);
    }

    /* 2. 이미지 렌더링 (맞춤/채우기 + 팬/줌 지원) 또는 미선택 시 세련된 플레이스홀더 */
    if (state.image) {
      drawImageTransform(ctx, state.image, W, H, state);
    } else {
      drawEmptyPlaceholder(ctx, W, H);
    }

    /* 3. 귀여운 스티커 및 소품 렌더링 */
    if (state.stickers && state.stickers.length > 0) {
      drawStickers(ctx, state.stickers, W, H, state.selectedStickerId, outputWidth <= 600);
    }

    /* 4. 문구 및 말풍선 레이아웃 통합 렌더링 (부분 글자색 지원) */
    if (state.text) {
      drawTextAndBubble(ctx, state, W, H);
    }
  }

  /* --- 햄찌/이미지 미선택 시 플레이스홀더 --- */
  function drawEmptyPlaceholder(ctx, W, H) {
    var pad = Math.round(W * 0.08);
    var pw = W - pad * 2;
    var ph = H - pad * 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = Math.max(2, Math.round(W / 200));
    ctx.setLineDash([8, 6]);
    drawRoundRect(ctx, pad, pad, pw, ph, 16);
    ctx.stroke();
    ctx.setLineDash([]);

    var cx = W / 2;
    var cy = H / 2 - Math.round(W * 0.04);
    var r = Math.round(W * 0.06);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = Math.max(2, Math.round(W / 250));
    drawRoundRect(ctx, cx - r, cy - r, r * 2, r * 2, 8);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx - r * 0.7, cy + r * 0.7);
    ctx.lineTo(cx - r * 0.1, cy);
    ctx.lineTo(cx + r * 0.25, cy + r * 0.3);
    ctx.lineTo(cx + r * 0.7, cy + r * 0.7);
    ctx.stroke();

    var txtSize = Math.max(12, Math.round(W * 0.038));
    ctx.font = '500 ' + txtSize + 'px "Noto Sans KR", sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('햄찌를 선택하거나 이미지를 업로드하세요', W / 2, H / 2 + r + txtSize * 1.2);
    ctx.restore();
  }

  /* --- 이미지 맞춤/채우기 + 드래그 팬(Pan) + 줌(Zoom) 렌더러 --- */
  function drawImageTransform(ctx, img, W, H, state) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;

    var fitMode = state.fitMode || 'cover'; /* 'cover' 또는 'contain' */
    var zoom = state.imageZoom !== undefined ? (state.imageZoom / 100) : 1.0;
    var panX = state.imagePanX || 0; /* -100 ~ 100 % */
    var panY = state.imagePanY || 0;

    var baseScale;
    if (fitMode === 'contain') {
      /* 여백을 남기고 프레임 안에 전체 사진을 쏙 맞춤 */
      baseScale = Math.min(W / iw, H / ih);
    } else {
      /* 프레임을 꽉 채움 (잘리는 부분 발생) */
      baseScale = Math.max(W / iw, H / ih);
    }

    var scale = baseScale * zoom;
    var dw = iw * scale;
    var dh = ih * scale;

    /* 중앙 기준 위치 + 마우스 팬 이동량(panX, panY) */
    var dx = (W - dw) / 2 + (panX / 100) * (W / 2);
    var dy = (H - dh) / 2 + (panY / 100) * (H / 2);

    ctx.save();
    /* 부드러운 이미지 안티에일리어싱 */
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  }

  /* --- 스티커 렌더러 --- */
  function drawStickers(ctx, stickers, W, H, selectedId, isPreview) {
    ctx.save();
    for (var i = 0; i < stickers.length; i++) {
      var s = stickers[i];
      var size = Math.round((s.size || 40) * (W / 400));
      var sx = W * (s.x / 100);
      var sy = H * (s.y / 100);

      ctx.font = size + 'px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      /* 은은한 드롭 섀도우 */
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = size * 0.2;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 2;

      ctx.fillText(s.icon, sx, sy);

      /* 미리보기 화면에서 선택된 스티커 강조 표시 링 */
      if (isPreview && selectedId && s.id === selectedId) {
        ctx.save();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = 'rgba(255, 107, 107, 0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        var r = size * 0.65;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /* --- 부분 글자색 파서 ([단어](#hex) 또는 <c=#hex>단어</c>) --- */
  function parseFormattedTokens(str, defaultColor) {
    var tokens = [];
    var regex = /\[(.*?)\]\(#(?:color:)?([a-fA-F0-9]{3,8})\)|<c=#([a-fA-F0-9]{3,8})>(.*?)<\/c>/g;
    var lastIndex = 0;
    var match;

    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({
          text: str.substring(lastIndex, match.index),
          color: defaultColor
        });
      }

      if (match[1] !== undefined) {
        /* [단어](#hex) 매치 */
        tokens.push({
          text: match[1],
          color: '#' + match[2]
        });
      } else {
        /* <c=#hex>단어</c> 매치 */
        tokens.push({
          text: match[4],
          color: '#' + match[3]
        });
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < str.length) {
      tokens.push({
        text: str.substring(lastIndex),
        color: defaultColor
      });
    }

    return tokens;
  }

  /* --- 텍스트 및 말풍선 레이아웃 계산 (바운딩 박스 & 히트테스트용 공통) --- */
  function computeLayout(ctx, state, W, H) {
    var scale = W / 400;
    var fontSize = Math.round(state.fontSize * scale);
    var fontFamily = state.fontFamily || "'Noto Sans KR', sans-serif";

    /* Dongle 폰트 등은 글꼴 특성상 1.4배 키워야 비율이 맞음 */
    if (fontFamily.indexOf('Dongle') !== -1) {
      fontSize = Math.round(fontSize * 1.35);
    }

    var font = 'bold ' + fontSize + 'px ' + fontFamily;
    ctx.font = font;

    var hasBubble = state.bubble && state.bubble !== 'none';
    var maxAllowWidth = hasBubble ? W * 0.72 : W * 0.85;

    /* 말풍선 종류별 패딩 */
    var padX = fontSize * 1.0;
    var padY = fontSize * 0.75;
    if (state.bubble === 'shout') {
      padX = fontSize * 1.4;
      padY = fontSize * 1.1;
    } else if (state.bubble === 'round') {
      padX = fontSize * 1.25;
      padY = fontSize * 0.9;
    } else if (state.bubble === 'think') {
      padX = fontSize * 1.15;
      padY = fontSize * 0.85;
    }

    /* 토큰 기반 줄바꿈 계산 */
    var contentMaxWidth = Math.max(fontSize * 2, maxAllowWidth - padX * 2);
    var wrappedLines = wrapFormattedText(ctx, state.text, contentMaxWidth, state.textColor || '#ffffff');
    var lineHeight = fontSize * 1.32;
    var textH = wrappedLines.length * lineHeight;
    var textW = getMaxLineWidthFromLines(ctx, wrappedLines);

    /* 말풍선 전체 크기 (텍스트를 완전히 감싸도록 계산) */
    var bw = Math.min(W * 0.92, Math.max(fontSize * 2.5, textW + padX * 2));
    var bh = Math.max(fontSize * 2, textH + padY * 2);

    /* 위치 (state.textX, state.textY 기준) */
    var cx = W * (state.textX / 100);
    var cy = H * (state.textY / 100);

    var bx = cx - bw / 2;
    var by = cy - bh / 2;

    /* 캔버스 경계 밖으로 나가지 않도록 보정 */
    var margin = Math.round(10 * scale);
    bx = Math.max(margin, Math.min(W - bw - margin, bx));
    by = Math.max(margin, Math.min(H - bh - margin, by));

    var textCenterY = hasBubble ? (by + bh / 2) : cy;
    var textCenterX = hasBubble ? (bx + bw / 2) : cx;

    return {
      fontSize: fontSize,
      font: font,
      wrappedLines: wrappedLines,
      lineHeight: lineHeight,
      textW: textW,
      textH: textH,
      padX: padX,
      padY: padY,
      bw: bw,
      bh: bh,
      bx: bx,
      by: by,
      cx: textCenterX,
      cy: textCenterY,
      hasBubble: hasBubble
    };
  }

  /* --- 말풍선 및 텍스트 렌더링 --- */
  function drawTextAndBubble(ctx, state, W, H) {
    var layout = computeLayout(ctx, state, W, H);
    var bColor = state.bubbleColor || '#ffffff';
    var defaultTextColor = state.textColor || '#ffffff';

    /* 말풍선 렌더링 */
    if (layout.hasBubble) {
      drawSpecificBubble(ctx, state.bubble, layout.bx, layout.by, layout.bw, layout.bh, layout.fontSize, bColor);
    }

    /* 텍스트 렌더링 */
    ctx.save();
    ctx.font = layout.font;
    ctx.textBaseline = 'middle';

    var totalHeight = layout.wrappedLines.length * layout.lineHeight;
    var startY = layout.cy - totalHeight / 2;

    var isBubbleLight = getLuminance(bColor) > 0.6;

    for (var i = 0; i < layout.wrappedLines.length; i++) {
      var line = layout.wrappedLines[i];
      var ly = startY + (i + 0.5) * layout.lineHeight;
      var lineWidth = getTokensLineWidth(ctx, line);
      var curX = layout.cx - lineWidth / 2;

      for (var j = 0; j < line.length; j++) {
        var token = line[j];
        var tokenW = ctx.measureText(token.text).width;
        var tokenColor = token.color || defaultTextColor;
        var isTokenLight = getLuminance(tokenColor) > 0.6;

        ctx.fillStyle = tokenColor;

        if (!layout.hasBubble) {
          /* 말풍선 없을 때 가독성 그림자 */
          ctx.shadowColor = 'rgba(0,0,0,0.65)';
          ctx.shadowBlur = layout.fontSize * 0.22;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;
        } else {
          /* 말풍선 있을 때 배경과 텍스트 대비 보정 외곽선 */
          if ((isBubbleLight && isTokenLight) || (!isBubbleLight && !isTokenLight)) {
            ctx.lineWidth = Math.max(2, Math.round(layout.fontSize * 0.08));
            ctx.strokeStyle = isBubbleLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)';
            ctx.lineJoin = 'round';
            ctx.strokeText(token.text, curX, ly);
          }
          ctx.shadowColor = 'transparent';
        }

        ctx.fillText(token.text, curX, ly);
        curX += tokenW;
      }
    }

    ctx.restore();
  }

  /* --- 토큰 기반 자동 줄바꿈 --- */
  function wrapFormattedText(ctx, rawText, maxWidth, defaultColor) {
    var paragraphs = rawText.split('\n');
    var allLines = [];

    for (var p = 0; p < paragraphs.length; p++) {
      var para = paragraphs[p];
      if (para === '') {
        allLines.push([{ text: '', color: defaultColor }]);
        continue;
      }

      var tokens = parseFormattedTokens(para, defaultColor);
      var currentLine = [];
      var currentLineWidth = 0;

      for (var t = 0; t < tokens.length; t++) {
        var tok = tokens[t];
        var words = splitForWrap(tok.text);

        for (var w = 0; w < words.length; w++) {
          var word = words[w];
          var wordW = ctx.measureText(word).width;

          if (currentLineWidth + wordW > maxWidth && currentLine.length > 0) {
            allLines.push(currentLine);
            currentLine = [{ text: word, color: tok.color }];
            currentLineWidth = wordW;
          } else {
            /* 현재 라인에 토큰 추가 */
            if (currentLine.length > 0 && currentLine[currentLine.length - 1].color === tok.color) {
              currentLine[currentLine.length - 1].text += word;
            } else {
              currentLine.push({ text: word, color: tok.color });
            }
            currentLineWidth += wordW;
          }
        }
      }

      if (currentLine.length > 0) {
        allLines.push(currentLine);
      }
    }

    return allLines.length > 0 ? allLines : [[{ text: '', color: defaultColor }]];
  }

  function getTokensLineWidth(ctx, tokens) {
    var w = 0;
    for (var i = 0; i < tokens.length; i++) {
      w += ctx.measureText(tokens[i].text).width;
    }
    return w;
  }

  function getMaxLineWidthFromLines(ctx, lines) {
    var max = 0;
    for (var i = 0; i < lines.length; i++) {
      var w = getTokensLineWidth(ctx, lines[i]);
      if (w > max) max = w;
    }
    return max;
  }

  /* --- 한글/영문/이모지 혼합 분리 --- */
  function splitForWrap(str) {
    var result = [];
    var current = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      var code = str.charCodeAt(i);
      if (ch === ' ') {
        result.push(current + ' ');
        current = '';
      } else if (isCJK(code)) {
        if (current) { result.push(current); current = ''; }
        result.push(ch);
      } else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length) {
        if (current) { result.push(current); current = ''; }
        result.push(str[i] + str[i + 1]);
        i++;
      } else {
        current += ch;
      }
    }
    if (current) result.push(current);
    return result;
  }

  function isCJK(code) {
    return (code >= 0xAC00 && code <= 0xD7AF) ||
      (code >= 0x3000 && code <= 0x9FFF) ||
      (code >= 0xF900 && code <= 0xFAFF);
  }

  /* --- 다양한 말풍선 모양 렌더러 --- */
  function drawSpecificBubble(ctx, type, x, y, w, h, fontSize, fillColor) {
    ctx.save();
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = 'rgba(40,40,40,0.85)';
    ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.07));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    /* 세련된 드롭 섀도우 */
    ctx.shadowColor = 'rgba(0,0,0,0.14)';
    ctx.shadowBlur = Math.round(fontSize * 0.4);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 3;

    var tailSize = fontSize * 0.6;

    if (type === 'speech') {
      drawSpeechBubble(ctx, x, y, w, h, 16, tailSize);
    } else if (type === 'round') {
      drawRoundBubble(ctx, x, y, w, h, tailSize);
    } else if (type === 'think') {
      drawThinkBubble(ctx, x, y, w, h, fontSize);
    } else if (type === 'shout') {
      drawShoutBubble(ctx, x, y, w, h);
    } else if (type === 'square') {
      drawSquareBubble(ctx, x, y, w, h, tailSize);
    } else if (type === 'whisper') {
      drawWhisperBubble(ctx, x, y, w, h, 14);
    }

    ctx.restore();
  }

  function drawSpeechBubble(ctx, x, y, w, h, r, tailSize) {
    var tailX = x + w * 0.35;
    var tailY = y + h;

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(tailX + tailSize * 1.1, y + h);
    ctx.lineTo(tailX - tailSize * 0.2, tailY + tailSize);
    ctx.lineTo(tailX, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();

    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();
  }

  function drawRoundBubble(ctx, x, y, w, h, tailSize) {
    var cx = x + w / 2;
    var cy = y + h / 2;
    var rx = w / 2;
    var ry = h / 2;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();

    ctx.beginPath();
    var tailStartX = cx - rx * 0.4;
    var tailStartY = cy + ry * 0.8;
    ctx.moveTo(tailStartX, tailStartY);
    ctx.lineTo(tailStartX - tailSize * 0.6, tailStartY + tailSize * 0.9);
    ctx.lineTo(tailStartX + tailSize * 0.8, tailStartY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawThinkBubble(ctx, x, y, w, h, fontSize) {
    var bumps = 8;
    var cx = x + w / 2;
    var cy = y + h / 2;
    var rx = w / 2;
    var ry = h / 2;

    ctx.beginPath();
    for (var i = 0; i < bumps; i++) {
      var angle1 = (i / bumps) * Math.PI * 2;
      var angle2 = ((i + 1) / bumps) * Math.PI * 2;
      var midAngle = (angle1 + angle2) / 2;

      var p1x = cx + Math.cos(angle1) * rx;
      var p1y = cy + Math.sin(angle1) * ry;
      var p2x = cx + Math.cos(angle2) * rx;
      var p2y = cy + Math.sin(angle2) * ry;

      var bumpDist = fontSize * 0.28;
      var cpx = cx + Math.cos(midAngle) * (rx + bumpDist);
      var cpy = cy + Math.sin(midAngle) * (ry + bumpDist);

      if (i === 0) ctx.moveTo(p1x, p1y);
      ctx.quadraticCurveTo(cpx, cpy, p2x, p2y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();

    var b1x = x + w * 0.3;
    var b1y = y + h + fontSize * 0.35;
    var b1r = fontSize * 0.22;
    ctx.beginPath();
    ctx.arc(b1x, b1y, b1r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    var b2x = x + w * 0.22;
    var b2y = y + h + fontSize * 0.72;
    var b2r = fontSize * 0.13;
    ctx.beginPath();
    ctx.arc(b2x, b2y, b2r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function drawShoutBubble(ctx, x, y, w, h) {
    var points = 16;
    var cx = x + w / 2;
    var cy = y + h / 2;
    var rxOut = w / 2;
    var ryOut = h / 2;
    var rxIn = rxOut * 0.76;
    var ryIn = ryOut * 0.76;

    ctx.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      var isOuter = (i % 2 === 0);
      var rxi = isOuter ? rxOut : rxIn;
      var ryi = isOuter ? ryOut : ryIn;
      var px = cx + Math.cos(angle) * rxi;
      var py = cy + Math.sin(angle) * ryi;

      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();
  }

  function drawSquareBubble(ctx, x, y, w, h, tailSize) {
    var tailX = x + w * 0.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(tailX + tailSize, y + h);
    ctx.lineTo(tailX, y + h + tailSize);
    ctx.lineTo(tailX, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();

    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();
  }

  function drawWhisperBubble(ctx, x, y, w, h, r) {
    drawRoundRect(ctx, x, y, w, h, r);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function getLuminance(hex) {
    if (!hex || hex[0] !== '#') return 1.0;
    var c = hex.substring(1);
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var rgb = parseInt(c, 16);
    var r = (rgb >> 16) & 0xff;
    var g = (rgb >> 8) & 0xff;
    var b = (rgb >> 0) & 0xff;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  /**
   * 마우스 드래그 히트테스트용 텍스트/말풍선 바운딩 박스 반환
   */
  function getTextBounds(state, outputWidth) {
    if (!state.text) return null;
    var size = Utils.getOutputSize(state.ratio, outputWidth);
    var dummyCanvas = document.createElement('canvas');
    dummyCanvas.width = size.w;
    dummyCanvas.height = size.h;
    var ctx = dummyCanvas.getContext('2d');
    var layout = computeLayout(ctx, state, size.w, size.h);

    if (layout.hasBubble) {
      return {
        x: layout.bx,
        y: layout.by,
        w: layout.bw,
        h: layout.bh + (layout.fontSize * 0.7)
      };
    } else {
      return {
        x: layout.cx - layout.textW / 2 - 15,
        y: layout.cy - layout.textH / 2 - 10,
        w: layout.textW + 30,
        h: layout.textH + 20
      };
    }
  }

  /**
   * 스티커 개별 히트테스트용 바운딩 박스 반환
   */
  function getStickersBounds(state, outputWidth) {
    if (!state.stickers || state.stickers.length === 0) return [];
    var size = Utils.getOutputSize(state.ratio, outputWidth);
    var bounds = [];
    for (var i = 0; i < state.stickers.length; i++) {
      var s = state.stickers[i];
      var sSize = Math.round((s.size || 40) * (size.w / 400));
      var sx = size.w * (s.x / 100);
      var sy = size.h * (s.y / 100);
      bounds.push({
        id: s.id,
        index: i,
        x: sx - sSize / 2,
        y: sy - sSize / 2,
        w: sSize,
        h: sSize
      });
    }
    return bounds;
  }

  return {
    render: render,
    getTextBounds: getTextBounds,
    getStickersBounds: getStickersBounds,
    parseFormattedTokens: parseFormattedTokens
  };
})();
