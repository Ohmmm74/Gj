const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
const cameraInput = document.getElementById('cameraInput');
const btnUpload = document.getElementById('btnUpload');
const btnCamera = document.getElementById('btnCamera');
const initialBtnRow = document.getElementById('initialBtnRow');
const preview = document.getElementById('preview');
const previewImg = document.getElementById('previewImg');
const btnRead = document.getElementById('btnRead');
const btnReset = document.getElementById('btnReset');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressPct = document.getElementById('progressPct');
const progressText = document.getElementById('progressText');
const result = document.getElementById('result');
const ocrText = document.getElementById('ocrText');
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const btnCopy = document.getElementById('btnCopy');
const infoBtn = document.getElementById('infoBtn');
const infoPopup = document.getElementById('infoPopup');

// Gemini API Key
const GEMINI_API_KEY = "AIzaSyAX7WaJPohfR0XIXeIx_Xpyqd3zdoNoZnQ";

// แสดง/ซ่อนคำแนะนำตามภาษาที่เลือก
const thaiHint = document.getElementById('thaiHint');
document.querySelectorAll('input[name="ocrLang"]').forEach(el => {
  el.addEventListener('change', () => {
    if (thaiHint) thaiHint.style.display = (el.checked && el.value === 'tha') ? 'block' : 'none';
  });
});
if (thaiHint && document.querySelector('input[name="ocrLang"]:checked').value === 'tha') thaiHint.style.display = 'block';

// Info Popup Toggle
if (infoBtn && infoPopup) {
  infoBtn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = infoPopup.classList.toggle('show');
    infoBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  document.addEventListener('click', e => {
    if (!infoPopup.contains(e.target) && e.target !== infoBtn) {
      infoPopup.classList.remove('show');
      infoBtn.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      infoPopup.classList.remove('show');
      infoBtn.setAttribute('aria-expanded', 'false');
    }
  });
}

let currentFile = null;
let currentPreviewUrl = null;
let processGeneration = 0;

btnCopy.addEventListener('click', async () => {
  const text = ocrText.value.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    btnCopy.textContent = 'คัดลอกแล้ว';
    btnCopy.classList.add('copied');
    setTimeout(() => { btnCopy.textContent = 'คัดลอก'; btnCopy.classList.remove('copied'); }, 1800);
  } catch (e) {
    btnCopy.textContent = 'คัดลอกไม่สำเร็จ';
    setTimeout(() => { btnCopy.textContent = 'คัดลอก'; }, 1800);
  }
});

function setStep(n) {
  [step1, step2].forEach((el, i) => {
    if (el) {
      el.classList.remove('active', 'done');
      if (i + 1 < n) el.classList.add('done');
      if (i + 1 === n) el.classList.add('active');
    }
  });
}

function handleFile(file) {
  if (!file) return;
  if (!file.type || !file.type.startsWith('image/')) {
    alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น (เช่น .jpg .png)');
    return;
  }
  processGeneration++;
  currentFile = file;
  if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
  currentPreviewUrl = URL.createObjectURL(file);
  previewImg.src = currentPreviewUrl;
  preview.style.display = 'block';
  drop.style.display = 'none';
  if (initialBtnRow) initialBtnRow.style.display = 'none';
  result.classList.remove('show');
  progressWrap.classList.remove('show');
  document.getElementById('correctionNote').classList.remove('show', 'fixed');
  document.getElementById('techDetail').style.display = 'none';
  setStep(1);
}

drop.addEventListener('click', () => fileInput.click());
btnUpload.addEventListener('click', () => fileInput.click());
btnCamera.addEventListener('click', () => cameraInput.click());
fileInput.addEventListener('change', e => handleFile(e.target.files[0]));
cameraInput.addEventListener('change', e => handleFile(e.target.files[0]));

['dragover'].forEach(evt => {
  drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.add('drag'); });
});
['dragleave', 'drop'].forEach(evt => {
  drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.remove('drag'); });
});
drop.addEventListener('drop', e => {
  const file = e.dataTransfer.files[0];
  handleFile(file);
});

btnReset.addEventListener('click', () => {
  processGeneration++;
  currentFile = null;
  if (currentPreviewUrl) { URL.revokeObjectURL(currentPreviewUrl); currentPreviewUrl = null; }
  preview.style.display = 'none';
  drop.style.display = 'block';
  if (initialBtnRow) initialBtnRow.style.display = 'flex';
  result.classList.remove('show');
  progressWrap.classList.remove('show');
  document.getElementById('correctionNote').classList.remove('show', 'fixed');
  document.getElementById('techDetail').style.display = 'none';
  fileInput.value = '';
  cameraInput.value = '';
  setStep(1);
});

// ฟังก์ชันแปลงไฟล์รูปภาพเป็น Base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
  });
}

// ฟังก์ชันอ่านลายมือผ่าน Gemini Vision API (รองรับทั้งไทยและอังกฤษ)
async function readWithGemini(file, isThai) {
  const base64Data = await fileToBase64(file);
  const prompt = isThai
    ? "กรุณาอ่านข้อความลายมือภาษาไทยทั้งหมดที่ปรากฏในรูปภาพนี้อย่างแม่นยำที่สุด และถอดข้อความออกมาเป็นตัวพิมพ์บรรทัดต่อบรรทัด โดยไม่ต้องเพิ่มคำอธิบาย ไม่ต้องใส่ markdown quotation หรือข้อความเกริ่นนำใดๆ ทั้งสิ้น"
    : "Please transcribe all English handwritten text in this image accurately line by line without any markdown quotation, introduction, or additional explanation.";

  const models = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'];
  let lastError = null;

  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: file.type || "image/jpeg",
                  data: base64Data
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1
          }
        })
      });

      const data = await response.json();
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        return data.candidates[0].content.parts[0].text.trim();
      } else if (data.error) {
        lastError = new Error(`Gemini API (${model}): ${data.error.message}`);
      }
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('ไม่สามารถประมวลผลภาพได้');
}

function showCorrectionNote(isThai) {
  const el = document.getElementById('correctionNote');
  el.classList.add('show', 'fixed');
  const langLabel = isThai ? 'ภาษาไทย' : 'ภาษาอังกฤษ';
  el.innerHTML = `<span class="dot"></span>อ่านลายมือ${langLabel}ด้วย Gemini Vision AI · ความแม่นยำสูง`;
}

btnRead.addEventListener('click', async () => {
  if (!currentFile) return;
  const myGen = ++processGeneration;
  setStep(2);
  progressWrap.classList.add('show');
  btnRead.disabled = true;
  progressFill.style.width = '30%';
  progressPct.textContent = '30%';

  const selectedLangEl = document.querySelector('input[name="ocrLang"]:checked');
  const selectedLang = selectedLangEl ? selectedLangEl.value : 'eng';
  const isThai = (selectedLang === 'tha');

  progressText.textContent = isThai 
    ? 'กำลังอ่านลายมือภาษาไทยผ่าน Gemini Vision…' 
    : 'กำลังอ่านลายมือภาษาอังกฤษผ่าน Gemini Vision…';

  document.getElementById('techDetail').style.display = 'none';

  try {
    const resultText = await readWithGemini(currentFile, isThai);
    if (myGen !== processGeneration) return;

    progressFill.style.width = '100%';
    progressPct.textContent = '100%';
    progressText.textContent = 'อ่านข้อความเสร็จสิ้น!';

    ocrText.value = resultText;
    showCorrectionNote(isThai);
    result.classList.add('show');
    setStep(2);
  } catch (err) {
    if (myGen !== processGeneration) return;
    const detailEl = document.getElementById('techDetail');
    detailEl.style.display = 'block';
    progressText.textContent = 'อ่านภาพไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
    detailEl.textContent = 'รายละเอียดทางเทคนิค:\n' + (err.message || String(err));
    detailEl.style.whiteSpace = 'pre-wrap';
  } finally {
    if (myGen === processGeneration) btnRead.disabled = false;
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}