const CARD_W = 290;
const CARD_H = 416;
const canvas = document.getElementById('frameCanvas');

const scaleFactor = window.devicePixelRatio || 1;
const shadowOffset = 0.5;

let W, H;
const ctx = canvas.getContext('2d');

let animPhase = 0;
let noisePattern = null;
let renderNeeded = true;

const charNameInput1 = document.getElementById('charName1');
const seriesTitleInput1 = document.getElementById('seriesTitle1');
const printNumberInput1 = document.getElementById('printNumber1');
const imageUploadInput1 = document.getElementById('imageUpload1');
const colorStatus1 = document.getElementById('colorStatus1');
const customColorInput1 = document.getElementById('customColor1');
const showImageCheckbox1 = document.getElementById('showImage1');

let dominantColor1 = { R: 150, G: 150, B: 150 };
let uploadedImage1 = null;
let uploadedFile1 = null;

let palette1 = [];
let selectedColorIndex1 = 0;

const LOCAL_STORAGE_KEY = 'cardFrameState_v1';

let lastRenderTime = 0;
const ANIMATION_FPS = 30;
const FRAME_DURATION = 1000 / ANIMATION_FPS;

let sendCooldown = false;

let tutorialManagerInstance = null;

let topbarPurgeAwaitingConfirm = false;
let topbarPurgeTimer = null;
const TOPBAR_PURGE_CONFIRM_MS = 5000;

function animate(timestamp) {
    if (!lastRenderTime) {
        lastRenderTime = timestamp;
    }
    const elapsed = timestamp - lastRenderTime;

    let animated = false;

    if (elapsed > FRAME_DURATION) {
        animPhase += elapsed / 1000;
        lastRenderTime = timestamp - (elapsed % FRAME_DURATION);
        animated = true;
    }

    if (animated || renderNeeded) {
        renderNow();
    }

    requestAnimationFrame(animate);
}

function saveState() {
    const state = {
        charName1: charNameInput1.value,
        seriesTitle1: seriesTitleInput1.value,
        printNumber1: printNumberInput1.value,
        customColor1: customColorInput1.value,
        showImage1: showImageCheckbox1.checked,
        dominantColor1: dominantColor1,
    };
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn("could not save state to local storage:", e);
    }
}

function loadState() {
    try {
        const storedState = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedState) {
            const state = JSON.parse(storedState);
            
            if (state.charName1 !== undefined) charNameInput1.value = state.charName1;
            if (state.seriesTitle1 !== undefined) seriesTitleInput1.value = state.seriesTitle1;
            if (state.printNumber1 !== undefined) printNumberInput1.value = state.printNumber1;
            
            if (state.showImage1 !== undefined) {
                showImageCheckbox1.checked = state.showImage1;
            }

            let effectiveColorHex = rgbToHex(dominantColor1);
            if (state.dominantColor1) {
                dominantColor1 = state.dominantColor1;
                effectiveColorHex = rgbToHex(dominantColor1);
                
                const statusEl = document.getElementById('colorStatus1');
                if (statusEl) {
                    const col = dominantColor1;
                    statusEl.textContent = `Restored previous color: RGB(${col.R}, ${col.G}, ${col.B}) • ${effectiveColorHex}`;
                }
            } else if (state.customColor1 !== undefined) {
                 dominantColor1 = hexToRgb(state.customColor1);
                 effectiveColorHex = state.customColor1;
            }
            
            if (customColorInput1) {
                customColorInput1.value = effectiveColorHex;
            }
            
            updateLengthWarning();
        }
    } catch (e) {
        console.error("error loading state from local storage:", e);
    }
}

function updateCanvasDimensions(scale = scaleFactor) {
    let cssW;
    cssW = CARD_W;
    W = cssW * scale;
    H = CARD_H * scale;
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${CARD_H}px`;
}

function rgbToCss(color) {
    return `rgb(${color.R}, ${color.G}, ${color.B})`;
}
function rgbToHex(color) {
    const toHex = (v) => v.toString(16).padStart(2, '0');
    return `#${toHex(color.R)}${toHex(color.G)}${toHex(color.B)}`.toUpperCase();
}
function hexToRgb(hex) {
    const m = hex.replace('#','').match(/^([0-9a-f]{6})$/i);
    if (!m) return { R:150, G:150, B:150 };
    const n = parseInt(m[1], 16);
    return { R: (n >> 16) & 255, G: (n >> 8) & 255, B: n & 255 };
}

function adjustColor(color, delta) {
    return {
        R: Math.max(0, Math.min(255, color.R + delta)),
        G: Math.max(0, Math.min(255, color.G + delta)),
        B: Math.max(0, Math.min(255, color.B + delta)),
    };
}

function createTranslucentBg(color, opacity, darkenFactor = 0.6) {
    const luminance = (0.299 * color.R + 0.587 * color.G + 0.114 * color.B) / 255;
    const factor = (1 - luminance) * darkenFactor;
    const R = Math.max(0, Math.min(255, color.R * (1 - factor)));
    const G = Math.max(0, Math.min(255, color.G * (1 - factor)));
    const B = Math.max(0, Math.min(255, color.B * (1 - factor)));
    const effectiveOpacity = Math.min(1, Math.max(0.35, opacity * 1.15));
    return `rgba(${Math.floor(R)}, ${Math.floor(G)}, ${Math.floor(B)}, ${effectiveOpacity})`;
}

function createNoisePattern() {
    if (noisePattern) return noisePattern;
    const pCan = document.createElement('canvas');
    const pCtx = pCan.getContext('2d');
    const size = 256;
    pCan.width = size;
    pCan.height = size;
    const imgData = pCtx.createImageData(size, size);
    for (let i = 0; i < imgData.data.length; i += 4) {
        const v = 240 + Math.floor(Math.random() * 20);
        imgData.data[i] = v;
        imgData.data[i + 1] = v;
        imgData.data[i + 2] = v;
        imgData.data[i + 3] = 10;
    }
    pCtx.putImageData(imgData, 0, 0);
    noisePattern = ctx.createPattern(pCan, 'repeat');
    return noisePattern;
}

function applyDynamicPreviewEffects(dominantColor) {
    const preview = document.getElementById('previewWrap');
    if (!preview) return;
    const halo = `rgba(${dominantColor.R}, ${dominantColor.G}, ${dominantColor.B}, 0.14)`;
    preview.setAttribute('data-halo-color', halo);
    preview.style.setProperty('--frame-halo-alpha', '0.10');
    preview.style.setProperty('--halo-color', halo);
}

function roundRectPath(x, y, w, h, r) {
  const rr = Math.max(0, r);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function drawSingleCard(offsetX, colorData, uploadedImage, textData, showImage = true) {
  const charName = textData.charName;
  const seriesTitle = textData.seriesTitle;
  const printNumber = textData.printNumber;

  const VISIBLE_LIMIT = 18;
  const displayCharName = truncateForCanvas(charName, VISIBLE_LIMIT);
  const displaySeriesTitle = truncateForCanvas(seriesTitle, VISIBLE_LIMIT);

  const baseColor = colorData.dominantColor;
  const colorLight = adjustColor(baseColor, 80);
  const colorMid = adjustColor(baseColor, 0);
  const colorDark = adjustColor(baseColor, -80);
  const colorDeepDark = adjustColor(baseColor, -120);

  const cssColorLight = rgbToCss(colorLight);
  const cssColorMid = rgbToCss(colorMid);
  const cssColorDark = rgbToCss(colorDark);
  const cssColorDeepDark = rgbToCss(colorDeepDark);

  const primary = 'rgba(255, 255, 255, 1.0)';
  const secondary = 'rgba(255, 255, 255, 0.8)';
  const textBg = createTranslucentBg(baseColor, 0.6, 0.5);
  const bottomTextBg = createTranslucentBg(baseColor, 0.1, 0.5);

  const textGlowColor = 'rgba(255, 255, 255, 0.9)';
  const textGlowBlur = 6;

  const BASE_W = CARD_W;
  const BASE_H = CARD_H;

  ctx.translate(offsetX, 0);

  const outer = { x: 5, y: 5, w: BASE_W - 10, h: BASE_H - 10, r: 20 };
  const frameThickness = 12;
  const inner = { x: outer.x + frameThickness, y: outer.y + frameThickness, w: outer.w - frameThickness * 2, h: outer.h - frameThickness * 2, r: outer.r - frameThickness + 6 };

  const topTextHeight = 30;
  const bottomTextHeight = 30;

  ctx.save();
  roundRectPath(outer.x, outer.y, outer.w, outer.h, outer.r);
  const colorGradient = ctx.createLinearGradient(outer.x, outer.y, outer.x + outer.w, outer.y + outer.h);
  colorGradient.addColorStop(0, cssColorLight);
  colorGradient.addColorStop(0.15, cssColorMid);
  colorGradient.addColorStop(0.5, cssColorDark);
  colorGradient.addColorStop(0.85, cssColorMid);
  colorGradient.addColorStop(1, cssColorDeepDark);
  ctx.fillStyle = colorGradient;
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let y = outer.y + 6; y < outer.y + outer.h - 6; y += 6) {
      ctx.beginPath();
      ctx.moveTo(outer.x + 6, y + Math.sin((y + animPhase * 30) * 0.02) * 0.6);
      ctx.lineTo(outer.x + outer.w - 6, y + Math.sin((y + animPhase * 30) * 0.02) * 0.6);
      ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = createNoisePattern();
  roundRectPath(outer.x, outer.y, outer.w, outer.h, outer.r);
  ctx.fill();
  ctx.restore();

  ctx.shadowColor = 'rgba(255, 255, 255, 0.2)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 0;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.stroke();

  ctx.save();
  const haloColor = `rgba(${baseColor.R}, ${baseColor.G}, ${baseColor.B}, 0.12)`;
  ctx.shadowColor = haloColor;
  ctx.shadowBlur = 18;
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(0,0,0,0)';
  roundRectPath(outer.x, outer.y, outer.w, outer.h, outer.r);
  ctx.stroke();
  ctx.restore();

  ctx.shadowBlur = 0;

  ctx.save();
  ctx.lineWidth = 1;
  const rimGrad = ctx.createLinearGradient(outer.x, outer.y, outer.x + outer.w, outer.y + outer.h);
  rimGrad.addColorStop(0, 'rgba(255,255,255,0.28)');
  rimGrad.addColorStop(0.25, 'rgba(255,255,255,0.08)');
  rimGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = rimGrad;
  roundRectPath(outer.x + 0.8, outer.y + 0.8, outer.w - 1.6, outer.h - 1.6, outer.r);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 2;
  roundRectPath(inner.x + 1, inner.y + 1, inner.w - 2, inner.h - 2, inner.r + 4);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 0.5;
  roundRectPath(inner.x + 0.5, inner.y + 0.5, inner.w - 1, inner.h - 1, inner.r + 4);
  ctx.stroke();

  ctx.restore();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 1;
  ctx.shadowOffsetX = shadowOffset;
  ctx.shadowOffsetY = shadowOffset;

  ctx.save();
  roundRectPath(inner.x, inner.y, inner.w, inner.h, inner.r + 4);
  ctx.clip();

  const topTextRect = { x: inner.x, y: inner.y, w: inner.w, h: topTextHeight };
  ctx.fillStyle = textBg;
  ctx.fillRect(topTextRect.x, topTextRect.y, topTextRect.w, topTextRect.h);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  ctx.fillStyle = primary;
  ctx.font = '700 14px "Lexend Deca", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(displayCharName, topTextRect.x + 10, topTextRect.y + 14);

  ctx.shadowColor = textGlowColor;
  ctx.shadowBlur = textGlowBlur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = secondary;
  ctx.font = '12px "Lexend Deca", sans-serif';
  ctx.fillText(displaySeriesTitle, topTextRect.x + 10, topTextRect.y + 27);

  ctx.restore();

  ctx.save();
  roundRectPath(inner.x, inner.y, inner.w, inner.h, inner.r + 4);
  ctx.clip();

  const bottomTextRect = { x: inner.x, y: inner.y + inner.h - bottomTextHeight, w: inner.w, h: bottomTextHeight };
  ctx.fillStyle = bottomTextBg;
  ctx.fillRect(bottomTextRect.x, bottomTextRect.y, bottomTextRect.w, bottomTextRect.h);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = primary;
  ctx.font = '700 18px "Lexend Deca", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(printNumber, bottomTextRect.x + bottomTextRect.w - 10, bottomTextRect.y + 21);

  ctx.restore();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  roundRectPath(inner.x, inner.y, inner.w, inner.h, inner.r + 4);
  ctx.fill();
  ctx.restore();

  if (uploadedImage && showImage) {
      ctx.save();
      roundRectPath(inner.x, inner.y, inner.w, inner.h, inner.r + 4);
      ctx.clip();
      const imageW = uploadedImage.width;
      const imageH = uploadedImage.height;
      const holeW = inner.w;
      const holeH = inner.h;
      let scale = Math.max(holeW / imageW, holeH / imageH);
      let newW = imageW * scale;
      let newH = imageH * scale;
      let dx = inner.x + (holeW - newW) / 2;
      let dy = inner.y + (holeH - newH) / 2;
      ctx.drawImage(uploadedImage, dx, dy, newW, newH);
      ctx.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 2;
  roundRectPath(inner.x + 1, inner.y + 1, inner.w - 2, inner.h - 2, inner.r + 4);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.lineWidth = 1.2;
  const ir = ctx.createLinearGradient(inner.x, inner.y, inner.x + inner.w, inner.y + inner.h);
  ir.addColorStop(0, 'rgba(220,255,255,0.25)');
  ir.addColorStop(0.5, 'rgba(255,220,255,0.18)');
  ir.addColorStop(1, 'rgba(220,255,220,0.12)');
  ctx.strokeStyle = ir;
  roundRectPath(inner.x + 2, inner.y + 2, inner.w - 4, inner.h - 4, inner.r + 6);
  ctx.stroke();
  ctx.restore();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 1;
  ctx.shadowOffsetX = shadowOffset;
  ctx.shadowOffsetY = shadowOffset;

  ctx.save();
  roundRectPath(inner.x, inner.y, inner.w, inner.h, inner.r + 4);
  ctx.clip();

  const topTextRectRedraw = { x: inner.x, y: inner.y, w: inner.w, h: topTextHeight };
  ctx.fillStyle = textBg;
  ctx.fillRect(topTextRectRedraw.x, topTextRectRedraw.y, topTextRectRedraw.w, topTextRectRedraw.h);

  ctx.fillStyle = primary;
  ctx.font = '700 14px "Lexend Deca", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(displayCharName, topTextRectRedraw.x + 10, topTextRectRedraw.y + 14);

  ctx.shadowColor = textGlowColor;
  ctx.shadowBlur = textGlowBlur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = secondary;
  ctx.font = '12px "Lexend Deca", sans-serif';
  ctx.fillText(displaySeriesTitle, topTextRectRedraw.x + 10, topTextRectRedraw.y + 27);

  ctx.restore();

  ctx.save();
  roundRectPath(inner.x, inner.y, inner.w, inner.h, inner.r + 4);
  ctx.clip();

  const bottomTextRectRedraw = { x: inner.x, y: inner.y + inner.h - bottomTextHeight, w: inner.w, h: bottomTextHeight };
  ctx.fillStyle = bottomTextBg;
  ctx.fillRect(bottomTextRectRedraw.x, bottomTextRectRedraw.y, bottomTextRectRedraw.w, bottomTextRectRedraw.h);

  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 1;
  ctx.shadowOffsetX = shadowOffset;
  ctx.shadowOffsetY = shadowOffset;

  ctx.fillStyle = primary;
  ctx.font = '700 18px "Lexend Deca", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(printNumber, bottomTextRectRedraw.x + bottomTextRectRedraw.w - 10, bottomTextRectRedraw.y + 21);

  ctx.restore();

  ctx.translate(-offsetX, 0);
}

function truncateForCanvas(text, limit = 18) {
  if (!text) return '';
  if (text.length <= limit) return text;
  const trimmed = text.slice(0, limit).trim();
  return trimmed + '..';
}

function drawFrame(exportScale = scaleFactor) {
  updateCanvasDimensions(exportScale);
  ctx.clearRect(0, 0, W, H);
  
  if (exportScale === scaleFactor) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
  }

  ctx.save();
  ctx.setTransform(exportScale, 0, 0, exportScale, 0, 0);

  const textData1 = {
      charName: charNameInput1.value,
      seriesTitle: seriesTitleInput1.value,
      printNumber: printNumberInput1.value
  };
  const colorData1 = { dominantColor: dominantColor1 };

  const showImg1 = showImageCheckbox1 ? showImageCheckbox1.checked : true;
  drawSingleCard(0, colorData1, uploadedImage1, textData1, showImg1);

  ctx.restore();
}

let renderTimer = null;
const RENDER_DEBOUNCE_MS = 80;

function scheduleRender(immediate = false) {
    renderNeeded = true;
    if (renderTimer) clearTimeout(renderTimer);
    if (!immediate) {
        renderTimer = setTimeout(() => { renderTimer = null; renderNeeded = true; }, RENDER_DEBOUNCE_MS);
    }
}

function renderNow() {
    drawFrame();
    renderNeeded = false;
}

function downloadPNG() {
  const EXPORT_MULTIPLIER = 2.5;
  const logicalWidth = CARD_W;
  const exportScale = Math.max(1, EXPORT_MULTIPLIER);

  drawFrame(exportScale);

  function makeFilenameFromName(name, width, scale) {
    if (!name) return `card-frame-${width}x${CARD_H}@${scale}x.png`;
    const cleaned = name.replace(/[^A-Za-z0-9\s]+/g, '').trim();
    if (!cleaned) return `card-frame-${width}x${CARD_H}@${scale}x.png`;
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const first = parts[0].charAt(0).toLowerCase() + parts[0].slice(1);
    const rest = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    return `${first}${rest}.png`;
  }

  if (canvas.toBlob) {
    canvas.toBlob((blob) => {
      if (!blob) {
        const link = document.createElement('a');
        const filename = makeFilenameFromName(charNameInput1 && charNameInput1.value ? charNameInput1.value : '', logicalWidth, exportScale);
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
        drawFrame();
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = makeFilenameFromName(charNameInput1 && charNameInput1.value ? charNameInput1.value : '', logicalWidth, exportScale);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 200);
      setTimeout(() => drawFrame(), 16);
    }, 'image/png', 1);
  } else {
    const link = document.createElement('a');
    const filename = makeFilenameFromName(charNameInput1 && charNameInput1.value ? charNameInput1.value : '', logicalWidth, exportScale);
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setTimeout(() => drawFrame(), 16);
  }
}

const _partA = "1442642975736987861"; 
const _partB = "-W2WBvzzHpPPIE85uJwREK-oy0HV_3lLDd9BotnaCtNamHWPD-1PzUgua763gbFzumRA";
const DISCORD_WEBHOOK_URL = `https://discord.com/api/webhooks/${_partA}/${_partB}`

async function sendToDiscord({ name, series, printNumber }) {
  const btn = document.getElementById('sendDiscordBtn');
  const originalHtml = btn ? btn.innerHTML : null;
  try {
    if (sendCooldown) return showToast('Please wait before sending again', 'info', 2000);
    if (btn) {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:8px;"></i>Sending...';
    }

    sendCooldown = true;

    const now = new Date();
    const epochSeconds = Math.floor(now.getTime() / 1000);
    const discordTimestampShort = `<t:${epochSeconds}:f>`;

    const cardBlob = await getExportBlob(2.5);

    const cardFilename = makeDiscordFilenameFromName(name);

    const originalFile = uploadedFile1 || null;
    const originalFilenameSafe = originalFile ? originalFile.name.replace(/\s+/g, '_') : null;

    const discordEmbedColor = (dominantColor1 && typeof dominantColor1.R === 'number')
      ? ((dominantColor1.R & 0xff) << 16) | ((dominantColor1.G & 0xff) << 8) | (dominantColor1.B & 0xff)
      : 0xC0A5B2;
    const fd = new FormData();
    const embedObj = {
      username: "Blair Submissions",
      embeds: [
        {
          title: name || 'Untitled Card',
          color: discordEmbedColor,
          fields: [
            { name: 'Series', value: (series || '—'), inline: true },
            { name: 'Created at', value: discordTimestampShort, inline: false }
          ],
          image: { url: `attachment://${cardFilename}` }
        }
      ]
    };

    if (originalFilenameSafe) {
      embedObj.embeds[0].thumbnail = { url: `attachment://${originalFilenameSafe}` };
    }

    fd.append("payload_json", JSON.stringify(embedObj));
    fd.append("files[0]", cardBlob, cardFilename);
    if (originalFile) {
      fd.append("files[1]", originalFile, originalFilenameSafe);
    }

    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      body: fd,
    });

    if (!res.ok) {
      throw new Error(`Discord webhook failed with status ${res.status}`);
    }

    showToast('Sent to Discord', 'success', 2500);
  } catch (err) {
    console.error(err);
    showToast('Failed to send to Discord', 'error', 3500);
  } finally {
    if (btn) {
      btn.removeAttribute('aria-busy');
      if (originalHtml) btn.innerHTML = originalHtml;
    }
    setTimeout(() => {
      if (btn) btn.disabled = false;
      sendCooldown = false;
    }, 3000);
    setTimeout(() => drawFrame(), 16);
  }
}

async function getExportBlob(exportScale = 2.5) {
  return new Promise((resolve, reject) => {
    try {
      drawFrame(exportScale);
      if (canvas.toBlob) {
        canvas.toBlob((blob) => {
          if (!blob) {
            try {
              const dataUrl = canvas.toDataURL('image/png');
              const byteString = atob(dataUrl.split(',')[1]);
              const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
              const ab = new ArrayBuffer(byteString.length);
              const ia = new Uint8Array(ab);
              for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
              }
              resolve(new Blob([ab], { type: mimeString }));
            } catch (e) {
              reject(e);
            }
          } else {
            resolve(blob);
          }
        }, 'image/png', 1);
      } else {
        const dataUrl = canvas.toDataURL('image/png');
        const byteString = atob(dataUrl.split(',')[1]);
        const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        resolve(new Blob([ab], { type: mimeString }));
      }
    } catch (err) {
      reject(err);
    }
  });
}

function makeDiscordFilenameFromName(name) {
  if (!name) return `card-frame-${CARD_W}x${CARD_H}@2_5x.png`;
  const cleaned = name.replace(/[^A-Za-z0-9\s]+/g, '').trim();
  if (!cleaned) return `card-frame-${CARD_W}x${CARD_H}@2_5x.png`;
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const first = parts[0].charAt(0).toLowerCase() + parts[0].slice(1);
  const rest = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return `${first}${rest}.png`;
}

let _colorThiefPromise = null;
async function loadColorThief() {
  if (_colorThiefPromise) return _colorThiefPromise;
  _colorThiefPromise = new Promise((resolve, reject) => {
    if (window.ColorThief) return resolve(window.ColorThief);
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/colorthief/dist/color-thief.umd.js';
    s.async = true;
    s.onload = () => resolve(window.ColorThief);
    s.onerror = () => reject(new Error('ColorThief failed to load'));
    document.head.appendChild(s);
  });
  return _colorThiefPromise;
}

function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    window._toastCache = window._toastCache || { lastMessage: null, lastTime: 0, visible: 0 };
    const now = Date.now();
    if (window._toastCache.lastMessage === message && (now - window._toastCache.lastTime) < 1200) {
        return;
    }
    window._toastCache.lastMessage = message;
    window._toastCache.lastTime = now;

     const toast = document.createElement('div');
     toast.className = `toast ${type}`;
     
     let iconClass = 'fa-circle-info';
     if (type === 'success') {
         iconClass = 'fa-circle-check';
     } else if (type === 'error') {
         iconClass = 'fa-circle-xmark';
     }
     
     const cleanMessage = message.replace(/[;:\u2014]/g, '');

     toast.innerHTML = `<span class="toast-icon"><i class="fa-solid ${iconClass}"></i></span><span>${cleanMessage}</span>`;
     
     while (container.children.length >= 2) {
         container.removeChild(container.children[0]);
     }

     container.appendChild(toast);
     window._toastCache.visible = container.children.length;

     setTimeout(() => {
         toast.classList.add('show');
     }, 0);

     const timer = setTimeout(() => {
         toast.classList.remove('show');
         toast.addEventListener('transitionend', () => toast.remove(), { once: true });
     }, duration);
     
     toast.addEventListener('click', () => {
         clearTimeout(timer);
         toast.classList.remove('show');
         toast.addEventListener('transitionend', () => toast.remove(), { once: true });
     });
}

function handleImageUpload(event) {
    const prevInputs = {
        charName: charNameInput1 ? charNameInput1.value : '',
        seriesTitle: seriesTitleInput1 ? seriesTitleInput1.value : '',
        printNumber: printNumberInput1 ? printNumberInput1.value : ''
    };

    const file = event.target.files[0];
    let statusElement = colorStatus1;
    
    if (file) {
        uploadedFile1 = file;
        statusElement.textContent = 'Analyzing image...';
        const hint = document.getElementById(`paletteHint1`); if (hint) hint.style.display = 'none';
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                uploadedImage1 = img;

                runWhenIdle(async () => {
                  try {
                    const ColorThiefClass = await loadColorThief();
                    const ct = new ColorThiefClass();
                    
                    // Get dominant color and palette
                    const dominantRgb = ct.getColor(img) || [150, 150, 150];
                    const pal = ct.getPalette(img, 5) || [];
                    
                    dominantColor1 = rgbArrToObj(dominantRgb);
                    palette1 = pal;
                    
                    setPaletteUI(pal);
                    
                    applyDynamicPreviewEffects(dominantColor1);
                    const hex = rgbToHex(dominantColor1);
                    
                    statusElement.textContent = `Dominant color RGB(${dominantColor1.R}, ${dominantColor1.G}, ${dominantColor1.B}) • ${hex}`;
                    if (customColorInput1) {
                        customColorInput1.value = hex;
                    }

                    scheduleRender(true);
                    saveState();
                    showToast('Image uploaded', 'success', 2000);
                  } catch(err){
                    console.error("Color analysis failed:", err);
                    statusElement.textContent = 'Color analysis failed. Using default color.';
                    dominantColor1 = { R: 150, G: 150, B: 150 };
                    scheduleRender(true);
                    saveState();
                  }
                });
            };
            img.onerror = () => {
                 statusElement.textContent = 'Error loading image';
                 uploadedImage1 = null; dominantColor1 = { R: 150, G: 150, B: 150 };
                 drawFrame();
            }
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    } else {
        uploadedImage1 = null; dominantColor1 = { R: 150, G: 150, B: 150 };
        uploadedFile1 = null;
        dominantColor1 = { R: 150, G: 150, B: 150 };
        palette1 = []; selectedColorIndex1 = 0;
        const p = document.getElementById(`palette1`); if (p){ p.classList.add('hidden'); p.innerHTML=''; }
        const hint = document.getElementById(`paletteHint1`); if (hint) { hint.style.display = 'block'; hint.textContent = 'No image uploaded. Default color will be used'; }
        drawFrame();
    }

    if (charNameInput1) charNameInput1.value = prevInputs.charName;
    if (seriesTitleInput1) seriesTitleInput1.value = prevInputs.seriesTitle;
    if (printNumberInput1) printNumberInput1.value = prevInputs.printNumber;

}

function setPaletteUI(palette) {
  const el = document.getElementById(`palette1`); if (!el) return;
  el.innerHTML = ''; el.classList.remove('hidden');
  const hint = document.getElementById(`paletteHint1`); if (hint) hint.style.display = 'none';
  const statusEl = document.getElementById(`colorStatus1`);
  palette.forEach((c, i) => {
    const d = document.createElement('button');
    d.className = 'swatch' + (i===0 ? ' selected':''); d.title = `RGB(${c[0]},${c[1]},${c[2]})`;
    d.style.background = `rgb(${c[0]},${c[1]},${c[2]})`;
    d.onclick = () => {
      [...el.children].forEach(ch => ch.classList.remove('selected')); d.classList.add('selected');
      const col = rgbArrToObj(c);
      dominantColor1=col; selectedColorIndex1=i;
      if (statusEl) statusEl.textContent = `Selected frame color RGB(${col.R}, ${col.G}, ${col.B}) • ${rgbToHex(col)}`;
      if (customColorInput1) {
        customColorInput1.value = rgbToHex(col);
      }
      scheduleRender(true);
      saveState();
    };
    el.appendChild(d);
  });
}

function rgbArrToObj(arr){ return { R: arr[0], G: arr[1], B: arr[2] }; }

function clearCard() {
    const fileInput = document.getElementById('imageUpload1');
    if (fileInput) fileInput.value = '';
    const fn = document.getElementById('filename1'); if (fn) fn.textContent = '';
    uploadedImage1 = null;
    uploadedFile1 = null;
    dominantColor1 = { R: 150, G: 150, B: 150 };
    palette1 = []; selectedColorIndex1 = 0;
    const p = document.getElementById('palette1'); if (p){ p.classList.add('hidden'); p.innerHTML=''; }
    if (colorStatus1) colorStatus1.textContent = '';
    saveState();
    scheduleRender(true);
}

function clearAll() {
    clearCard();
    if (charNameInput1) charNameInput1.value = '';
    if (seriesTitleInput1) seriesTitleInput1.value = '';
    if (printNumberInput1) printNumberInput1.value = '';
    if (customColorInput1) customColorInput1.value = '#969696';
    if (showImageCheckbox1) showImageCheckbox1.checked = true;
    dominantColor1 = { R: 150, G: 150, B: 150 };
    saveState();
    showToast('All inputs cleared and settings reset', 'success');
}

function attachDropZone(dropzoneId) {
  const dz = document.getElementById(dropzoneId);
  if (!dz) return;
  const input = document.getElementById(dz.getAttribute('data-target-input'));
  const filenameEl = document.getElementById(`filename${dropzoneId.replace('dropzone','')}`);
  dz.addEventListener('click', (e) => {
    const clickedInteractive = e.target.closest('button, a, input, label');
    if (!clickedInteractive) input.click();
  });
  dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }});
  ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, (e)=>{ e.preventDefault(); dz.classList.add('dragover'); }));
  ['dragleave','dragend','drop'].forEach(ev => dz.addEventListener(ev, (e)=>{ e.preventDefault(); dz.classList.remove('dragover'); }));
  dz.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) {
      const dt = { target: { files: [file] } };
      handleImageUpload(dt);
      if (filenameEl) filenameEl.textContent = file.name;
    }
  });
  input.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (filenameEl) filenameEl.textContent = f ? f.name : '';
    handleImageUpload(e);
  });
}

function updateLengthWarning() {
  const nameInput = document.getElementById(`charName1`);
  const seriesInput = document.getElementById(`seriesTitle1`);
  const nameWarn = document.getElementById(`charWarn1`);
  const seriesWarn = document.getElementById(`seriesWarn1`);
  const VISIBLE_LIMIT = 18;
  if (nameInput && nameWarn) {
    const len = nameInput.value.length;
    if (len > VISIBLE_LIMIT) {
      nameWarn.textContent = `Name will be cut, it will be shown as '..'`;
    } else {
      nameWarn.textContent = '';
    }
  }
  if (seriesInput && seriesWarn) {
    const len = seriesInput.value.length;
    if (len > VISIBLE_LIMIT) {
      seriesWarn.textContent = `Name will be cut, it will be shown as '..'`;
    } else {
      seriesWarn.textContent = '';
    }
  }
}

class TutorialManager {
    constructor() {
        this.STORAGE_KEY = 'cardFrameTutorialDone';
        this.isDone = localStorage.getItem(this.STORAGE_KEY) === 'true';

        this.overlay = document.getElementById('tutorial-overlay');
        this.backdrop = document.getElementById('tutorial-backdrop');
        this.popover = document.getElementById('tutorial-popover');
        this.popoverTitle = document.getElementById('tutorial-title');
        this.popoverBody = document.getElementById('tutorial-body');
        this.stepIndicator = document.getElementById('tutorial-step-indicator');
        this.nextBtn = document.getElementById('tutorial-next-btn');
        this.skipBtn = document.getElementById('tutorial-skip-btn');
        this.prevBtn = document.getElementById('tutorial-prev-btn');


        this.steps = [
            { id: 'dropzone1', title: 'Step 1: Upload Your Image', body: 'Start by uploading your artwork here. JPGs and PNGs are supported.' },
            { id: 'customColor1', title: 'Step 2: Select a Frame Color', body: 'The color is detected automatically, but you can override it by picking a swatch or a custom color here.' },
            { id: 'charName1', title: 'Step 3: Add Card Details', body: 'Fill in the Character Name and Series Title. The print number is optional for non-submission cards.' },
            { id: 'sendDiscordBtn', title: 'Step 4: Submit to Discord', body: 'Once ready, use this button to send your card details and image to Discord for review (requires no print number).' },
            { id: 'downloadBtn', title: 'Step 5: Download PNG', body: 'Finally, click here to download your high-resolution finished card image.' }
        ];
        
        this.currentStepIndex = 0;

        this.highlightEl = document.createElement('div');
        this.highlightEl.className = 'tutorial-highlight';
        this.overlay.appendChild(this.highlightEl);

        this.initListeners();
    }

    initListeners() {
        if (!this.overlay) return;
        
        this.backdrop.addEventListener('click', (e) => {
            if (e.target.id === 'tutorial-backdrop') {
                this.nextStep();
            }
        });

        this.nextBtn.addEventListener('click', () => this.nextStep());
        this.skipBtn.addEventListener('click', () => this.endTour());
        if (this.prevBtn) {
            this.prevBtn.addEventListener('click', () => this.prevStep());
        }


        window.addEventListener('resize', () => this.updatePopoverPosition(true), { passive: true });
        window.addEventListener('scroll', () => this.updatePopoverPosition(false), { passive: true });
    }

    startTour() {
        if (!this.overlay) return this.endTour(true);
        this.currentStepIndex = 0;
        this.overlay.style.display = 'block';
        this.overlay.classList.add('active');
        this.showStep(0);
    }
    
    endTour(initialLoad = false) {
        if (!this.overlay) return;
        this.overlay.style.display = 'none';
        this.overlay.classList.remove('active');
        localStorage.setItem(this.STORAGE_KEY, 'true');
        this.isDone = true;
        if (!initialLoad) {
            showToast('Tutorial finished. Happy cardmaking!', 'success', 2500);
        }
    }
    
    nextStep() {
        if (this.currentStepIndex < this.steps.length - 1) {
            this.currentStepIndex++;
            this.showStep(this.currentStepIndex);
        } else {
            this.endTour();
        }
    }
    
    prevStep() {
        if (this.currentStepIndex > 0) {
            this.currentStepIndex--;
            this.showStep(this.currentStepIndex);
        }
    }

    showStep(index) {
        const step = this.steps[index];
        const targetEl = document.getElementById(step.id);
        
        if (!targetEl) {
            console.warn(`Tutorial target element ${step.id} not found.`);
            this.nextStep(); 
            return;
        }

        this.popoverTitle.textContent = step.title;
        this.popoverBody.textContent = step.body;
        this.stepIndicator.textContent = `Step ${index + 1} of ${this.steps.length}`;
        
        if (this.prevBtn) {
            this.prevBtn.style.display = index === 0 ? 'none' : 'block';
        }
        
        if (index === this.steps.length - 1) {
            this.nextBtn.innerHTML = 'Finish';
        } else {
            this.nextBtn.innerHTML = 'Next';
        }

        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        if (this.popover) {
            this.popover.classList.add('visible');
            this.popover.style.visibility = 'hidden';
        }
        setTimeout(() => this.updatePopoverPosition(true), 200);
    }
    
    updatePopoverPosition(forceRecalc) {
        const step = this.steps[this.currentStepIndex];
        const targetEl = document.getElementById(step.id);
        if (!targetEl || !this.popover || (!this.popover.classList.contains('visible') && !forceRecalc)) {
            return;
        }
        
        const rect = targetEl.getBoundingClientRect();
        
        const padding = 8;
        this.highlightEl.style.width = `${rect.width + padding * 2}px`;
        this.highlightEl.style.height = `${rect.height + padding * 2}px`;
        this.highlightEl.style.left = `${rect.left - padding}px`;
        this.highlightEl.style.top = `${rect.top - padding}px`;
        
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        
        const popoverWidth = this.popover.offsetWidth;
        const popoverHeight = this.popover.offsetHeight;
        const margin = 20;

        let left, top;
        let position = 'right';

        if (rect.right + margin + popoverWidth < vw) {
            left = rect.right + margin;
            top = rect.top + rect.height / 2 - popoverHeight / 2;
            position = 'right';
        } 
        else if (rect.left - margin - popoverWidth > 0) {
            left = rect.left - margin - popoverWidth;
            top = rect.top + rect.height / 2 - popoverHeight / 2;
            position = 'left';
        }
        else {
            left = rect.left + rect.width / 2 - popoverWidth / 2;
            top = rect.bottom + margin;
            position = 'bottom';
        }

        left = Math.max(margin, Math.min(vw - popoverWidth - margin, left));
        top = Math.max(margin, Math.min(vh - popoverHeight - margin, top));

        if (vw < 600 || position === 'bottom') {
            left = rect.left + rect.width / 2 - popoverWidth / 2;
            if (rect.bottom + margin + popoverHeight > vh) {
                 top = vh - popoverHeight - margin;
            } else {
                 top = rect.bottom + margin;
            }
            left = Math.max(margin, Math.min(vw - popoverWidth - margin, left));
            
            this.popover.classList.add('mobile-bottom');
        } else {
            this.popover.classList.remove('mobile-bottom');
        }
        
        this.popover.style.visibility = 'visible';
        this.popover.style.left = `${left}px`;
        this.popover.style.top = `${top}px`;
    }
}

function showConfirmToast(message, confirmAction, type = 'error', duration = 6000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon"><i class="fa-solid fa-circle-exclamation"></i></span><span>${message}</span>`;
    while (container.children.length >= 2) {
        container.removeChild(container.children[0]);
    }
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);

    const timer = setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);

    toast.addEventListener('click', () => {
        clearTimeout(timer);
        try { confirmAction(); } catch (e) { console.error(e); }
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    tutorialManagerInstance = new TutorialManager();
    
    loadState();
    
    document.querySelectorAll('[data-clear-card]').forEach(btn => {
        btn.addEventListener('click', () => {
            clearCard();
            showToast('Card image removed', 'success');
        });
    });

    const clearAllBtn = document.getElementById('clearAllBtn');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (topbarPurgeAwaitingConfirm) {
                // reset UI state
                clearTimeout(topbarPurgeTimer);
                topbarPurgeTimer = null;
                topbarPurgeAwaitingConfirm = false;
                clearAllBtn.classList.remove('confirm');
                // perform full purge without showing the extra topbar toast (use the same behavior as purgeBtn)
                clearAll();
                // restore original button content & title immediately after purge
                const prevInner = clearAllBtn.getAttribute('data-prev-inner') || '<i class="fa-solid fa-broom"></i>';
                clearAllBtn.innerHTML = prevInner;
                clearAllBtn.title = clearAllBtn.getAttribute('data-prev-title') || 'Clear all inputs';
                clearAllBtn.removeAttribute('data-prev-inner');
                clearAllBtn.removeAttribute('data-prev-title');
                return;
            }
            // Enter confirm mode: change appearance and label, start timeout
            topbarPurgeAwaitingConfirm = true;
            clearAllBtn.classList.add('confirm');
            // swap icon to confirm text for clarity
            clearAllBtn.setAttribute('data-prev-title', clearAllBtn.title || '');
            clearAllBtn.title = 'Confirm purge';
            const prevInner = clearAllBtn.innerHTML;
            clearAllBtn.setAttribute('data-prev-inner', prevInner);
            clearAllBtn.innerHTML = 'Confirm?';
            // Do not use entering animation class; keep it a simple state change

            // if user does not confirm within timeout, reset the button
            topbarPurgeTimer = setTimeout(() => {
                topbarPurgeAwaitingConfirm = false;
                if (topbarPurgeTimer) { clearTimeout(topbarPurgeTimer); topbarPurgeTimer = null; }
                clearAllBtn.classList.remove('confirm');
                const prev = clearAllBtn.getAttribute('data-prev-inner') || '<i class="fa-solid fa-broom"></i>';
                clearAllBtn.innerHTML = prev;
                clearAllBtn.title = clearAllBtn.getAttribute('data-prev-title') || 'Clear all inputs';
                // cleanup stored attributes
                clearAllBtn.removeAttribute('data-prev-inner');
                clearAllBtn.removeAttribute('data-prev-title');
            }, TOPBAR_PURGE_CONFIRM_MS);
        });
    }

    // cancel the topbar confirm if user clicks anywhere else on the page
    document.addEventListener('click', (e) => {
        const btn = document.getElementById('clearAllBtn');
        if (!topbarPurgeAwaitingConfirm || !btn) return;
        // if click occurred on the button itself, let its handler deal with it
        if (e.target === btn || btn.contains(e.target)) return;
        // otherwise cancel confirm state
        topbarPurgeAwaitingConfirm = false;
        if (topbarPurgeTimer) { clearTimeout(topbarPurgeTimer); topbarPurgeTimer = null; }
        btn.classList.remove('confirm', 'entering');
        const prevInner = btn.getAttribute('data-prev-inner') || '<i class="fa-solid fa-broom"></i>';
        btn.innerHTML = prevInner;
        btn.title = btn.getAttribute('data-prev-title') || 'Clear all inputs';
        // cleanup stored attributes
        btn.removeAttribute('data-prev-inner');
        btn.removeAttribute('data-prev-title');
    }, { capture: true });

    const helpPanel = document.getElementById('helpPanel');
    const toggleHelpBtn = document.getElementById('toggleHelpBtn');
    if (toggleHelpBtn && helpPanel) {
      const setHelpState = (collapsed) => {
        helpPanel.classList.toggle('collapsed', collapsed);
        toggleHelpBtn.setAttribute('aria-expanded', String(!collapsed));
        const icon = toggleHelpBtn.querySelector('i');
        if (icon) icon.className = collapsed ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-up';
      };

      toggleHelpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const collapsed = !helpPanel.classList.contains('collapsed');
        setHelpState(collapsed);
      });

      helpPanel.addEventListener('click', (e) => {
        const ignoreTags = ['BUTTON','INPUT','A','SELECT','TEXTAREA','LABEL'];
        if (ignoreTags.includes(e.target.tagName) || e.target.closest('.btn')) return;
        const collapsed = !helpPanel.classList.contains('collapsed');
        setHelpState(collapsed);
      });
      
      // Add restart tutorial button logic
      const restartBtn = document.getElementById('restartTutorialBtn');
      if (restartBtn) {
          restartBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              if (tutorialManagerInstance) {
                   // Ensure tutorial is considered not done so it runs
                   localStorage.removeItem(tutorialManagerInstance.STORAGE_KEY);
                   tutorialManagerInstance.isDone = false;
                   tutorialManagerInstance.startTour();
              }
              // Collapse help panel after clicking restart
              setHelpState(true);
          });
      }
    }

    // initialize resources panel toggle
    const resourcesPanel = document.getElementById('resourcesPanel');
    const toggleResourcesBtn = document.getElementById('toggleResourcesBtn');
    if (toggleResourcesBtn && resourcesPanel) {
        const setResourcesState = (collapsed) => {
            resourcesPanel.classList.toggle('collapsed', collapsed);
            toggleResourcesBtn.setAttribute('aria-expanded', String(!collapsed));
            const icon = toggleResourcesBtn.querySelector('i');
            if (icon) icon.className = collapsed ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-up';
        };

        toggleResourcesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const collapsed = !resourcesPanel.classList.contains('collapsed');
            setResourcesState(collapsed);
        });

        resourcesPanel.addEventListener('click', (e) => {
            const ignoreTags = ['BUTTON','INPUT','A','SELECT','TEXTAREA','LABEL'];
            if (e.target.tagName === 'A') return; // do not collapse if clicking a link
            if (ignoreTags.includes(e.target.tagName) || e.target.closest('.btn')) return;
            const collapsed = !resourcesPanel.classList.contains('collapsed');
            setResourcesState(collapsed);
        });
    }
    
    const firstName = document.getElementById('charName1');
    if (firstName) { setTimeout(() => firstName.focus(), 250); }

    attachDropZone('dropzone1');
    // link the visible Choose file button to the hidden file input for accessibility
    const chooseBtn = document.getElementById('dropChooseBtn');
    if (chooseBtn) {
      chooseBtn.addEventListener('click', (e) => {
         const dz = document.getElementById('dropzone1');
         const input = document.getElementById(dz.getAttribute('data-target-input'));
         if (input) input.click();
      });
    }

    updateLengthWarning();

    // Setup clear buttons for text inputs
    document.querySelectorAll('.clear-input-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-target');
            const targetInput = document.getElementById(targetId);
            if (targetInput) {
                targetInput.value = '';
                // Manually dispatch input event to trigger existing listeners (like updateLengthWarning, scheduleRender, saveState)
                targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                targetInput.focus();
            }
        });
    });

    // input change listeners for saving state and rendering
    if (charNameInput1) charNameInput1.addEventListener('input', () => { updateLengthWarning(); scheduleRender(); saveState(); });
    if (seriesTitleInput1) seriesTitleInput1.addEventListener('input', () => { updateLengthWarning(); scheduleRender(); saveState(); });
    if (printNumberInput1) printNumberInput1.addEventListener('input', () => { scheduleRender(); saveState(); });
    if (imageUploadInput1) imageUploadInput1.addEventListener('change', (e) => { handleImageUpload(e); scheduleRender(); });

    if (customColorInput1) {
      customColorInput1.addEventListener('input', () => {
        const col = hexToRgb(customColorInput1.value);
        dominantColor1 = col;
        // Update color status UI when custom color is picked
        if (colorStatus1) colorStatus1.textContent = `Custom color RGB(${col.R}, ${col.G}, ${col.B}) • ${rgbToHex(col)}`;
        scheduleRender(true);
        saveState();
        // Do not show toast for custom color changes per user preference
      });
    }
    if (showImageCheckbox1) {
      showImageCheckbox1.addEventListener('change', () => {
        scheduleRender(true);
        saveState();
        // No toast for toggling image visibility to avoid non-essential notifications
      });
    }

    // Wire up topbar download button (new)
    const topbarDownloadBtn = document.getElementById('topbarDownloadBtn');
    if (topbarDownloadBtn) {
        topbarDownloadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            downloadPNG();
        });
    }

    // Wire up Send to Discord button
    const sendDiscordBtn = document.getElementById('sendDiscordBtn');
    if (sendDiscordBtn) {
      sendDiscordBtn.addEventListener('click', () => {
        const payload = {
          name: charNameInput1 ? charNameInput1.value.trim() : '',
          series: seriesTitleInput1 ? seriesTitleInput1.value.trim() : '',
          printNumber: printNumberInput1 ? printNumberInput1.value.trim() : '',
        };
        // Disallow sending if a print number is present
        if (payload.printNumber) {
          showToast('Cards must have no print number in order to submit', 'error', 3500);
          return;
        }
        // Minimal validation: allow empty but inform on success/error via toast
        sendToDiscord(payload);
      });
    }
});

updateCanvasDimensions();
// renderNow(); // Removed initial synchronous render call, handled by requestAnimationFrame

document.getElementById('downloadBtn').addEventListener('click', downloadPNG);

function runWhenIdle(fn, timeout = 500) {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(fn, { timeout });
  } else {
    setTimeout(fn, 200);
  }
}

window.addEventListener('resize', () => {
    if (window._frameResizeTimer) clearTimeout(window._frameResizeTimer);
    window._frameResizeTimer = setTimeout(() => {
        updateCanvasDimensions();
        scheduleRender(true);
    }, 160);
}, { passive: true });

requestAnimationFrame(animate); // Start the main animation loop
