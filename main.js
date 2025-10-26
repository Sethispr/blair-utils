const CARD_W = 290;
const CARD_H = 416;
const canvas = document.getElementById('frameCanvas');

const scaleFactor = window.devicePixelRatio || 1;
const shadowOffset = 0.5;

let W, H;
const ctx = canvas.getContext('2d');

let animPhase = 0;
let noisePattern = null;

// card state and inputs
const charNameInput1 = document.getElementById('charName1');
const seriesTitleInput1 = document.getElementById('seriesTitle1');
const printNumberInput1 = document.getElementById('printNumber1');
const imageUploadInput1 = document.getElementById('imageUpload1');
const colorStatus1 = document.getElementById('colorStatus1');
const customColorInput1 = document.getElementById('customColor1');
const showImageCheckbox1 = document.getElementById('showImage1');

let dominantColor1 = { R: 150, G: 150, B: 150 };
let uploadedImage1 = null;

let palette1 = [];
let selectedColorIndex1 = 0;

const LOCAL_STORAGE_KEY = 'cardFrameState_v1';

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
            
            // apply text inputs
            if (state.charName1 !== undefined) charNameInput1.value = state.charName1;
            if (state.seriesTitle1 !== undefined) seriesTitleInput1.value = state.seriesTitle1;
            if (state.printNumber1 !== undefined) printNumberInput1.value = state.printNumber1;
            
            // apply custom color
            if (state.customColor1 !== undefined) {
                customColorInput1.value = state.customColor1;
            }
            
            // apply checkbox state
            if (state.showImage1 !== undefined) {
                showImageCheckbox1.checked = state.showImage1;
            }

            // apply dominant color, overriding default
            if (state.dominantColor1) {
                dominantColor1 = state.dominantColor1;
                const col = dominantColor1;
                const hex = rgbToHex(col);
                
                // ensure custom color input reflects the effective dominant color
                if (customColorInput1) {
                    customColorInput1.value = hex;
                }
                
                const statusEl = document.getElementById('colorStatus1');
                if (statusEl) {
                    const hex = rgbToHex(col);
                    statusEl.textContent = `Restored previous color: RGB(${col.R}, ${col.G}, ${col.B}) • ${hex}`;
                }
            }
            
            updateLengthWarning(1);
            // scheduleRender is called after DOMContentLoaded
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

/**
 * sample image → approximate average color
 * returns {R,G,B}
 */
function analyzeImageColors(img) {
    return new Promise(resolve => {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        const sampleSize = 100;
        tempCanvas.width = sampleSize;
        tempCanvas.height = sampleSize;
        tempCtx.drawImage(img, 0, 0, sampleSize, sampleSize);
        const imageData = tempCtx.getImageData(0, 0, sampleSize, sampleSize).data;
        let r = 0, g = 0, b = 0, pixelCount = 0;
        for (let i = 0; i < imageData.length; i += 16) {
            r += imageData[i];
            g += imageData[i + 1];
            b += imageData[i + 2];
            pixelCount++;
        }
        if (pixelCount === 0) return resolve({ R: 150, G: 150, B: 150 });
        resolve({ R: Math.floor(r / pixelCount), G: Math.floor(g / pixelCount), B: Math.floor(b / pixelCount) });
    });
}

/* helper to nudge rgb values */
function adjustColor(color, delta) {
    return {
        R: Math.max(0, Math.min(255, color.R + delta)),
        G: Math.max(0, Math.min(255, color.G + delta)),
        B: Math.max(0, Math.min(255, color.B + delta)),
    };
}

/* create subtle translucent background from a color */
function createTranslucentBg(color, opacity, darkenFactor = 0.6) {
    const luminance = (0.299 * color.R + 0.587 * color.G + 0.114 * color.B) / 255;
    const factor = (1 - luminance) * darkenFactor;
    const R = Math.max(0, Math.min(255, color.R * (1 - factor)));
    const G = Math.max(0, Math.min(255, color.G * (1 - factor)));
    const B = Math.max(0, Math.min(255, color.B * (1 - factor)));
    const effectiveOpacity = Math.min(1, Math.max(0.35, opacity * 1.15));
    return `rgba(${Math.floor(R)}, ${Math.floor(G)}, ${Math.floor(B)}, ${effectiveOpacity})`;
}

/* noise texture for subtle surface */
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
    preview.querySelectorAll('.etch, .vignette, .rim-highlight').forEach(el => {
      el.style.background = el.classList.contains('vignette')
        ? `radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.28) 100%)`
        : el.style.background;
    });
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

/**
 * draw one card at offset
 * textData: {charName, seriesTitle, printNumber}
 */
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
  const tertiary = 'rgba(255, 255, 255, 0.4)';
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

  const art = { x: inner.x, y: inner.y + topTextHeight, w: inner.w, h: inner.h - topTextHeight - bottomTextHeight, r: inner.r };

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

/* cut text for canvas display and put '..' if cut, may need improvements e.g. Omniscient Reader' */
function truncateForCanvas(text, limit = 18) {
  if (!text) return '';
  if (text.length <= limit) return text;
  const trimmed = text.slice(0, limit).trim();
  return trimmed + '..';
}

function drawFrame(exportScale = scaleFactor) {
  updateCanvasDimensions(exportScale);
  ctx.clearRect(0, 0, W, H);
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
    if (renderTimer) clearTimeout(renderTimer);
    if (immediate) {
        renderTimer = setTimeout(() => { renderTimer = null; renderNow(); }, 8);
        return;
    }
    renderTimer = setTimeout(() => { renderTimer = null; renderNow(); }, RENDER_DEBOUNCE_MS);
}

function renderNow() {
    drawFrame();
}

function downloadPNG() {
  const EXPORT_MULTIPLIER = 2.5;
  const logicalWidth = CARD_W;
  const exportScale = Math.max(1, EXPORT_MULTIPLIER);

  drawFrame(exportScale);

  // create a filename from character name (fallback to default)
  function makeFilenameFromName(name, width, scale) {
    if (!name) return `card-frame-${width}x${CARD_H}@${scale}x.png`;
    // keep letters/numbers only, split words, join so first word lowercase, subsequent words capitalized e.g. hanako1 or gigiMurin1
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
      // redraw once after export to restore normal scale without double flashing
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

function handleImageUpload(event, cardIndex) {
    const file = event.target.files[0];
    let statusElement = colorStatus1;

    if (file) {
        statusElement.textContent = 'Analyzing image...';
        const hint = document.getElementById(`paletteHint${cardIndex}`); if (hint) hint.style.display = 'none';
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
                    const pal = ct.getPalette(img, 5) || [];
                    palette1 = pal;
                    const first = pal[0] ? rgbArrToObj(pal[0]) : { R:150,G:150,B:150 };
                    dominantColor1 = first;
                    setPaletteUI(cardIndex, pal);
                    statusElement.textContent = 'Pick a dominant color from the palette below.';
                  } catch(err){
                    statusElement.textContent = 'Palette analysis failed, using average color.';
                  }

                  runWhenIdle(() => {
                    analyzeImageColors(img).then(color => {
                        dominantColor1 = color;
                        applyDynamicPreviewEffects(color);
                        const hex = rgbToHex(color);
                        statusElement.textContent = `Dominant color: RGB(${color.R}, ${color.G}, ${color.B}) • ${hex}`;
                        // keep custom color input in sync with auto-detected dominant color
                        if (customColorInput1) {
                          customColorInput1.value = hex;
                        }
                        scheduleRender(true);
                        saveState(); // save new dominant color
                    });
                  });
                });
            };
            img.onerror = () => {
                 statusElement.textContent = 'Error loading image.';
                 uploadedImage1 = null; dominantColor1 = { R: 150, G: 150, B: 150 };
                 drawFrame();
            }
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    } else {
        uploadedImage1 = null; dominantColor1 = { R: 150, G: 150, B: 150 };
        const pel = document.getElementById(`palette${cardIndex}`); if (pel){ pel.classList.add('hidden'); pel.innerHTML=''; }
        const hint = document.getElementById(`paletteHint${cardIndex}`); if (hint) { hint.style.display = 'block'; hint.textContent = 'No image uploaded. Default color will be used.'; }
        drawFrame();
    }
}

function setPaletteUI(cardIndex, palette) {
  const el = document.getElementById(`palette${cardIndex}`); if (!el) return;
  el.innerHTML = ''; el.classList.remove('hidden');
  const hint = document.getElementById(`paletteHint${cardIndex}`); if (hint) hint.style.display = 'none';
  const statusEl = document.getElementById(`colorStatus${cardIndex}`);
  palette.forEach((c, i) => {
    const d = document.createElement('button');
    d.className = 'swatch' + (i===0 ? ' selected':''); d.title = `RGB(${c[0]},${c[1]},${c[2]})`;
    d.style.background = `rgb(${c[0]},${c[1]},${c[2]})`;
    d.onclick = () => {
      [...el.children].forEach(ch => ch.classList.remove('selected')); d.classList.add('selected');
      const col = rgbArrToObj(c);
      dominantColor1=col; selectedColorIndex1=i;
      if (statusEl) statusEl.textContent = `Selected color: RGB(${col.R}, ${col.G}, ${col.B}) • ${rgbToHex(col)}`;
      // keep custom color input in sync when a palette swatch is chosen
      if (customColorInput1) {
        customColorInput1.value = rgbToHex(col);
      }
      scheduleRender(true);
      saveState(); // save selected palette color
    };
    el.appendChild(d);
  });
}

function rgbArrToObj(arr){ return { R: arr[0], G: arr[1], B: arr[2] }; }

function clearCard(cardIndex) {
    // Only clear card 1 state, ignore other indices
    if (cardIndex === 1) {
        document.getElementById('imageUpload1').value = '';
        const fn = document.getElementById('filename1'); if (fn) fn.textContent = '';
        uploadedImage1 = null;
        dominantColor1 = { R: 150, G: 150, B: 150 };
        palette1 = []; selectedColorIndex1 = 0;
        const p = document.getElementById('palette1'); if (p){ p.classList.add('hidden'); p.innerHTML=''; }
        colorStatus1.textContent = '';
        charNameInput1.value = '';
        seriesTitleInput1.value = '';
        printNumberInput1.value = '';
        saveState(); // save cleared state
    }
    scheduleRender(true);
}

function clearAll() {
    clearCard(1);
}

function attachDropZone(dropzoneId) {
  const dz = document.getElementById(dropzoneId);
  if (!dz) return;
  const input = document.getElementById(dz.getAttribute('data-target-input'));
  const filenameEl = document.getElementById(`filename${dropzoneId.replace('dropzone','')}`);
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }});
  ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, (e)=>{ e.preventDefault(); dz.classList.add('dragover'); }));
  ['dragleave','dragend','drop'].forEach(ev => dz.addEventListener(ev, (e)=>{ e.preventDefault(); dz.classList.remove('dragover'); }));
  dz.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) {
      const dt = { target: { files: [file] } };
      // Always pass index 1 as we only support one card
      handleImageUpload(dt, 1);
      if (filenameEl) filenameEl.textContent = file.name;
    }
  });
  input.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (filenameEl) filenameEl.textContent = f ? f.name : '';
    // Always pass index 1 as we only support one card for now
    handleImageUpload(e, 1);
  });
}

function updateLengthWarning(cardIndex) {
  const nameInput = document.getElementById(`charName${cardIndex}`);
  const seriesInput = document.getElementById(`seriesTitle${cardIndex}`);
  const nameWarn = document.getElementById(`charWarn${cardIndex}`);
  const seriesWarn = document.getElementById(`seriesWarn${cardIndex}`);
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

document.addEventListener('DOMContentLoaded', () => {
    // load state immediately to populate fields before listeners are attached
    loadState();
    
    document.querySelectorAll('[data-clear-card]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.getAttribute('data-clear-card'), 10);
            // Since we only clear card 1, we still need the index to match the data attribute in HTML
            clearCard(idx);
        });
    });

    const clearAllBtn = document.getElementById('clearAllBtn');
    if (clearAllBtn) clearAllBtn.addEventListener('click', () => {
        if (confirm('Clear all inputs and reset settings?')) clearAll();
    });

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

    updateLengthWarning(1);

    // setup clear x buttons for text inputs
    document.querySelectorAll('.clear-input-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-target');
            const targetInput = document.getElementById(targetId);
            if (targetInput) {
                targetInput.value = '';
                // manually dispatch input event to trigger existing listeners (updateLengthWarning, scheduleRender, saveState)
                targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                targetInput.focus();
            }
        });
    });

    // input change listeners for saving state and rendering
    if (charNameInput1) charNameInput1.addEventListener('input', () => { updateLengthWarning(1); scheduleRender(); saveState(); });
    if (seriesTitleInput1) seriesTitleInput1.addEventListener('input', () => { updateLengthWarning(1); scheduleRender(); saveState(); });
    // print number input triggers save/render
    if (printNumberInput1) printNumberInput1.addEventListener('input', () => { scheduleRender(); saveState(); });
    if (imageUploadInput1) imageUploadInput1.addEventListener('change', (e) => { handleImageUpload(e, 1); scheduleRender(); });

    if (customColorInput1) {
      customColorInput1.addEventListener('input', () => {
        const col = hexToRgb(customColorInput1.value);
        dominantColor1 = col;
        // update color status UI when custom color is picked
        if (colorStatus1) colorStatus1.textContent = `Custom color: RGB(${col.R}, ${col.G}, ${col.B}) • ${rgbToHex(col)}`;
        scheduleRender(true);
        saveState(); // save custom color change
      });
    }
    if (showImageCheckbox1) {
      showImageCheckbox1.addEventListener('change', () => {
        scheduleRender(true);
        saveState(); // save checkbox change
      });
    }
});

updateCanvasDimensions();
scheduleRender(true);
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
