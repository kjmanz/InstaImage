/**
 * インスタ投稿画像自動生成アプリ - メインロジック
 * 住まいるでんき館きょうしん
 */

// ===== 定数 =====
const CONFIG = {
    TEXT_MODEL: 'gemini-2.5-flash',
    IMAGE_MODEL: 'gemini-3.1-flash-image-preview',
    API_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models',
    BRAND_NAME: '住まいるでんき館きょうしん',
    MAX_RETRIES: 3,
    TIMEOUT_MS: 60000,
    IMAGE_SIZE: '1K'
};

const DEFAULT_ASPECT_RATIO = '4:5'; // デフォルトは縦長

const DESIGN_VARIATIONS = {
    A: {
        name: 'シンプル',
        style: '白背景に大きな文字で見やすいシンプルなデザイン。余白を活かしたミニマルで清潔感のあるレイアウト。'
    },
    B: {
        name: '鉛筆イラスト',
        style: '鉛筆で書いたような手描き風イラストデザイン。温かみのある線画と、少し粗いテクスチャで親しみやすい雰囲気。'
    },
    C: {
        name: '親しみやすいイラスト',
        style: '可愛らしいイラストアイコン付き。やわらかいパステルカラー背景で、誰にでも好かれる親しみやすいデザイン。'
    },
    D: {
        name: 'マーカーイラスト',
        style: 'カラフルなマーカーで描いたようなイラストデザイン。太い線と鮮やかな色使いで、元気でポップな印象。'
    },
    E: {
        name: '手書き風ペン',
        style: 'ラフなペンで手書き風に描いたデザイン。少し崩した文字と自由な線で、アットホームで温かい雰囲気。'
    }
};

// ===== グローバル状態 =====
let state = {
    apiKey: null,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    generationMode: 'normal', // 'normal' or 'batch'
    notifyOnBatchComplete: true,
    enabledVariations: ['A', 'B', 'C', 'D', 'E'],
    parsedSlides: null,
    slideData: null,
    designOptions: { A: null, B: null, C: null, D: null, E: null },
    selectedDesign: null,
    generatedSlides: [],
    currentRevision: '',
    isGenerating: false,
    referenceImages: [] // { base64, mimeType, name }
};

// ===== DOM要素 =====
const elements = {};
let successHideTimer = null;
let successActionHandler = null;

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', () => {
    initElements();
    loadApiKey();
    setupEventListeners();
});

function initElements() {
    // API設定
    elements.apiModal = document.getElementById('apiModal');
    elements.apiKeyInput = document.getElementById('apiKeyInput');
    elements.batchNotifyEnabled = document.getElementById('batchNotifyEnabled');
    elements.saveApiKey = document.getElementById('saveApiKey');
    elements.closeModal = document.getElementById('closeModal');
    elements.settingsBtn = document.getElementById('settingsBtn');

    // ローディング
    elements.loadingOverlay = document.getElementById('loadingOverlay');
    elements.loadingMessage = document.getElementById('loadingMessage');
    elements.progressFill = document.getElementById('progressFill');
    elements.progressText = document.getElementById('progressText');

    // STEP 1
    elements.step1 = document.getElementById('step1');
    elements.inputText = document.getElementById('inputText');
    elements.charCount = document.getElementById('charCount');
    elements.generateBtn = document.getElementById('generateBtn');
    elements.parsePreview = document.getElementById('parsePreview');
    elements.slideCount = document.getElementById('slideCount');
    elements.slideStructure = document.getElementById('slideStructure');

    // STEP 2
    elements.step2 = document.getElementById('step2');
    elements.previewA = document.getElementById('previewA');
    elements.previewB = document.getElementById('previewB');
    elements.previewC = document.getElementById('previewC');
    elements.previewD = document.getElementById('previewD');
    elements.previewE = document.getElementById('previewE');
    elements.revisionInput = document.getElementById('revisionInput');
    elements.regenerateBtn = document.getElementById('regenerateBtn');
    elements.backToStep1 = document.getElementById('backToStep1');

    // STEP 3
    elements.step3 = document.getElementById('step3');
    elements.generationStatus = document.getElementById('generationStatus');
    elements.generationProgress = document.getElementById('generationProgress');
    elements.slidesContainer = document.getElementById('slidesContainer');
    elements.downloadZip = document.getElementById('downloadZip');
    elements.backToStep2 = document.getElementById('backToStep2');
    elements.startOver = document.getElementById('startOver');

    // エラー・成功
    elements.errorContainer = document.getElementById('errorContainer');
    elements.errorMessage = document.getElementById('errorMessage');
    elements.retryBtn = document.getElementById('retryBtn');
    elements.dismissError = document.getElementById('dismissError');
    elements.successContainer = document.getElementById('successContainer');
    elements.successMessage = document.getElementById('successMessage');
    elements.successActionBtn = document.getElementById('successActionBtn');

    // ライトボックス
    elements.lightbox = document.getElementById('lightbox');
    elements.lightboxImg = document.getElementById('lightboxImg');
    elements.lightboxClose = document.getElementById('lightboxClose');

    // 参考画像アップロード
    elements.refDropZone = document.getElementById('refDropZone');
    elements.refFileInput = document.getElementById('refFileInput');
    elements.refPreviewContainer = document.getElementById('refPreviewContainer');
    elements.regenerateWithRefBtn = document.getElementById('regenerateWithRefBtn');
}

function setupEventListeners() {
    // APIキー設定
    elements.settingsBtn.addEventListener('click', () => {
        elements.apiKeyInput.value = state.apiKey || '';
        // 現在のアスペクト比を選択
        const aspectRadio = document.querySelector(`input[name="aspectRatio"][value="${state.aspectRatio}"]`);
        if (aspectRadio) {
            aspectRadio.checked = true;
        }
        // 現在の生成モードを選択
        const modeRadio = document.querySelector(`input[name="generationMode"][value="${state.generationMode}"]`);
        if (modeRadio) {
            modeRadio.checked = true;
        }
        if (elements.batchNotifyEnabled) {
            elements.batchNotifyEnabled.checked = state.notifyOnBatchComplete;
        }
        // 現在のデザインバリエーション設定を復元
        document.querySelectorAll('input[name="designVariation"]').forEach(cb => {
            cb.checked = state.enabledVariations.includes(cb.value);
        });
        elements.apiModal.classList.remove('hidden');
    });
    elements.saveApiKey.addEventListener('click', saveApiKey);
    elements.closeModal.addEventListener('click', () => {
        elements.apiModal.classList.add('hidden');
    });

    // STEP 1
    elements.inputText.addEventListener('input', () => {
        elements.charCount.textContent = `${elements.inputText.value.length}文字`;
        parseInputText();
    });
    elements.generateBtn.addEventListener('click', startGeneration);

    // STEP 2
    document.querySelectorAll('.btn-select').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const option = e.target.dataset.option;
            selectDesign(option);
        });
    });
    elements.regenerateBtn.addEventListener('click', regenerateDesigns);
    elements.backToStep1.addEventListener('click', () => showStep(1));

    // STEP 3
    elements.downloadZip.addEventListener('click', downloadAllAsZip);
    elements.backToStep2.addEventListener('click', () => showStep(2));
    elements.startOver.addEventListener('click', resetAll);

    // エラー
    elements.dismissError.addEventListener('click', hideError);
    if (elements.successActionBtn) {
        elements.successActionBtn.addEventListener('click', () => {
            const action = successActionHandler;
            hideSuccess();
            if (typeof action === 'function') {
                action();
            }
        });
    }

    // ライトボックス
    elements.lightboxClose.addEventListener('click', closeLightbox);
    elements.lightbox.addEventListener('click', (e) => {
        if (e.target === elements.lightbox) closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLightbox();
    });

    // 参考画像アップロード
    elements.refDropZone.addEventListener('click', () => elements.refFileInput.click());
    elements.refFileInput.addEventListener('change', (e) => handleRefFiles(e.target.files));
    elements.refDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.refDropZone.classList.add('drag-over');
    });
    elements.refDropZone.addEventListener('dragleave', () => {
        elements.refDropZone.classList.remove('drag-over');
    });
    elements.refDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.refDropZone.classList.remove('drag-over');
        handleRefFiles(e.dataTransfer.files);
    });
    elements.regenerateWithRefBtn.addEventListener('click', regenerateDesigns);
}

// ===== APIキー管理 =====
function loadApiKey() {
    state.apiKey = localStorage.getItem('gemini_api_key');
    state.aspectRatio = localStorage.getItem('aspect_ratio') || DEFAULT_ASPECT_RATIO;
    state.generationMode = localStorage.getItem('generation_mode') || 'normal';
    state.notifyOnBatchComplete = localStorage.getItem('batch_notify_enabled') !== 'false';
    const savedVariations = localStorage.getItem('enabled_variations');
    if (savedVariations) {
        try {
            state.enabledVariations = JSON.parse(savedVariations);
        } catch (e) {
            state.enabledVariations = ['A', 'B', 'C', 'D', 'E'];
        }
    }
    if (!state.apiKey) {
        elements.apiModal.classList.remove('hidden');
    }
}

function saveApiKey() {
    const key = elements.apiKeyInput.value.trim();
    if (!key) {
        showError('APIキーを入力してください');
        return;
    }
    state.apiKey = key;

    // アスペクト比を保存
    const selectedAspect = document.querySelector('input[name="aspectRatio"]:checked');
    if (selectedAspect) {
        state.aspectRatio = selectedAspect.value;
        localStorage.setItem('aspect_ratio', state.aspectRatio);
    }

    // 生成モードを保存
    const selectedMode = document.querySelector('input[name="generationMode"]:checked');
    if (selectedMode) {
        state.generationMode = selectedMode.value;
        localStorage.setItem('generation_mode', state.generationMode);
    }
    if (elements.batchNotifyEnabled) {
        state.notifyOnBatchComplete = elements.batchNotifyEnabled.checked;
        localStorage.setItem('batch_notify_enabled', String(state.notifyOnBatchComplete));
    }

    localStorage.setItem('gemini_api_key', key);

    // デザインバリエーションを保存
    const checkedVariations = Array.from(document.querySelectorAll('input[name="designVariation"]:checked')).map(cb => cb.value);
    if (checkedVariations.length === 0) {
        showError('デザイン案を最侎1つ選択してください');
        return;
    }
    state.enabledVariations = checkedVariations;
    localStorage.setItem('enabled_variations', JSON.stringify(checkedVariations));

    elements.apiModal.classList.add('hidden');
    showSuccess('設定を保存しました');
}

function getApiKey() {
    if (!state.apiKey) {
        state.apiKey = localStorage.getItem('gemini_api_key');
    }
    return state.apiKey;
}

// ===== テキストパース =====
function parseInputText() {
    const text = elements.inputText.value;
    const slides = detectSlides(text);

    if (slides.length > 0) {
        elements.parsePreview.classList.remove('hidden');
        elements.slideCount.textContent = `検出されたスライド: ${slides.length}枚`;
        elements.slideStructure.innerHTML = slides.map((s, i) =>
            `<div>${i + 1}枚目: ${s.type === 'cover' ? '（表紙）' : ''} ${s.headline.substring(0, 30)}...</div>`
        ).join('');
        state.parsedSlides = slides;
    } else {
        elements.parsePreview.classList.add('hidden');
        state.parsedSlides = null;
    }
}

function detectSlides(text) {
    const slides = [];
    const slidePattern = /■\s*(\d+)枚目\s*(?:（[^）]+）)?\s*([\s\S]*?)(?=■\s*\d+枚目|$)/g;
    let match;

    while ((match = slidePattern.exec(text)) !== null) {
        const slideNum = parseInt(match[1]);
        const content = match[2].trim();
        const lines = content.split('\n').filter(l => l.trim());

        slides.push({
            number: slideNum,
            type: slideNum === 1 ? 'cover' : (lines[0]?.includes('最終') ? 'cta' : 'content'),
            headline: lines[0] || '',
            subtext: lines[1] || '',
            detail: lines.slice(2).join('\n') || '',
            rawContent: content
        });
    }

    return slides;
}

// ===== Gemini API呼び出し =====
async function callGeminiAPI(model, contents, generationConfig = {}) {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('APIキーが設定されていません');
    }

    const url = `${CONFIG.API_BASE_URL}/${model}:generateContent`;

    const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
            contents,
            generationConfig
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
            throw new Error('APIキーが正しくありません');
        } else if (response.status === 429) {
            throw new Error('レート制限にかかりました。しばらく待ってから再試行してください');
        }
        throw new Error(errorData.error?.message || `API エラー: ${response.status}`);
    }

    return response.json();
}

async function fetchWithRetry(url, options, retries = CONFIG.MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('リクエストがタイムアウトしました');
            }
            if (i === retries - 1) throw error;
            await sleep(1000 * (i + 1));
        }
    }
}

// テキスト解析（Gemini 2.5 Flash）
async function analyzeTextWithGemini(text) {
    const prompt = `以下のインスタ投稿案からカルーセルの各スライド情報をJSON形式で抽出してください。
必ず以下の形式のJSONのみを返してください：

{
  "slides": [
    {
      "number": 1,
      "type": "cover",
      "headline": "見出しテキスト",
      "subtext": "サブテキスト",
      "detail": "詳細テキスト",
      "notes": "デザインのヒント"
    }
  ],
  "total_slides": 6,
  "theme": "メインテーマ",
  "target_audience": "ターゲット層",
  "brand": "住まいるでんき館きょうしん"
}

投稿案:
${text}`;

    const response = await callGeminiAPI(CONFIG.TEXT_MODEL, [{
        parts: [{ text: prompt }]
    }]);

    const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
    }
    throw new Error('テキスト解析に失敗しました');
}

// 画像生成（Gemini 3 Pro Image Preview）
async function generateImage(prompt, referenceImage = null) {
    const parts = [];

    if (referenceImage) {
        parts.push({
            inlineData: {
                mimeType: 'image/png',
                data: referenceImage
            }
        });
    }

    parts.push({ text: prompt });

    const response = await callGeminiAPI(
        CONFIG.IMAGE_MODEL,
        [{ parts }],
        {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: {
                aspectRatio: state.aspectRatio,
                imageSize: CONFIG.IMAGE_SIZE
            }
        }
    );

    const partsList = response.candidates?.[0]?.content?.parts || [];
    for (const part of partsList) {
        if (part.thought) continue;
        if (part.inlineData) {
            return part.inlineData.data;
        }
    }

    throw new Error('画像が生成されませんでした');
}

// ===== Batch API =====
async function createBatchJob(requestItems) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('APIキーが設定されていません');

    const url = `${CONFIG.API_BASE_URL}/${CONFIG.IMAGE_MODEL}:batchGenerateContent`;

    const batchRequests = requestItems.map((item, i) => ({
        request: {
            contents: [{ parts: item.parts }],
            generationConfig: {
                responseModalities: ['TEXT', 'IMAGE'],
                imageConfig: {
                    aspectRatio: state.aspectRatio,
                    imageSize: CONFIG.IMAGE_SIZE
                }
            }
        },
        metadata: { key: `request-${i}` }
    }));

    const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
            batch: {
                display_name: `insta-gen-${Date.now()}`,
                input_config: {
                    requests: {
                        requests: batchRequests
                    }
                }
            }
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Batch API エラー: ${response.status}`);
    }

    const data = await response.json();
    return data.name; // バッチジョブ名
}

function getBatchPollIntervalMs(elapsedMs) {
    const twentyMinutes = 20 * 60 * 1000;
    const sixtyMinutes = 60 * 60 * 1000;

    if (elapsedMs < twentyMinutes) {
        return 30 * 1000;
    }
    if (elapsedMs < sixtyMinutes) {
        return 60 * 1000;
    }
    return 3 * 60 * 1000;
}

async function pollBatchJob(batchName, onProgress = null) {
    const apiKey = getApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/${batchName}`;
    const startTime = Date.now();
    const MAX_WAIT = 24 * 60 * 60 * 1000; // 24時間

    while (true) {
        const elapsed = Date.now() - startTime;
        if (elapsed > MAX_WAIT) {
            throw new Error('Batchジョブがタイムアウトしました（24時間超過）');
        }

        const response = await fetch(url, {
            headers: { 'x-goog-api-key': apiKey }
        });

        if (!response.ok) {
            throw new Error(`Batchステータス確認エラー: ${response.status}`);
        }

        const job = await response.json();
        const elapsedSec = Math.round(elapsed / 1000);
        const jobState = job.metadata?.state || job.state;
        const nextPollIntervalMs = getBatchPollIntervalMs(elapsed);

        if (onProgress) {
            onProgress(jobState, elapsedSec, Math.round(nextPollIntervalMs / 1000));
        }

        // doneフラグまたはstateで完了判定
        if (job.done || jobState === 'JOB_STATE_SUCCEEDED') {
            if (job.error) {
                throw new Error(`Batchジョブエラー: ${job.error.message || JSON.stringify(job.error)}`);
            }
            return job;
        } else if (jobState === 'JOB_STATE_FAILED') {
            throw new Error('Batchジョブが失敗しました');
        } else if (jobState === 'JOB_STATE_CANCELLED') {
            throw new Error('Batchジョブがキャンセルされました');
        }

        // JOB_STATE_PENDING or JOB_STATE_RUNNING
        await sleep(nextPollIntervalMs);
    }
}

function extractBatchImages(job) {
    // REST APIでは job.response.inlinedResponses にレスポンスが入る
    // フォールバック: job.dest?.inlinedResponses?.responses も試す
    const inlined = job.response?.inlinedResponses
        || job.response?.inlined_responses
        || job.dest?.inlinedResponses?.responses
        || job.dest?.inlined_responses?.responses
        || [];
    // inlinedがオブジェクトの場合、中のresponses配列を取得
    const responses = Array.isArray(inlined) ? inlined : (inlined.responses || inlined || []);
    const images = [];

    for (const item of responses) {
        const parts = item.response?.candidates?.[0]?.content?.parts || [];
        let imageData = null;
        for (const part of parts) {
            if (part.thought) continue;
            if (part.inlineData || part.inline_data) {
                imageData = (part.inlineData || part.inline_data).data;
                break;
            }
        }
        images.push({
            key: item.metadata?.key || '',
            imageData
        });
    }

    // メタデータのキーでソート
    images.sort((a, b) => a.key.localeCompare(b.key));
    return images;
}

// Batch APIで単一画像を生成（STEP 3の順次処理用）
async function generateImageViaBatch(prompt, referenceImage = null, onProgress = null) {
    const parts = [];
    if (referenceImage) {
        parts.push({
            inlineData: {
                mimeType: 'image/png',
                data: referenceImage
            }
        });
    }
    parts.push({ text: prompt });

    const batchName = await createBatchJob([{ parts }]);

    const job = await pollBatchJob(batchName, onProgress);
    const images = extractBatchImages(job);

    if (images.length === 0 || !images[0].imageData) {
        throw new Error('Batch: 画像が生成されませんでした');
    }

    return images[0].imageData;
}

// Batch APIで複数画像を一括生成（STEP 2のデザイン案用）
async function generateImagesBatch(requestItems, onProgress = null) {
    const batchName = await createBatchJob(requestItems);

    const job = await pollBatchJob(batchName, onProgress);
    return extractBatchImages(job);
}

// ===== 画像生成プロンプト作成 =====
function createDesignPrompt(slide, variationKey, revision = '') {
    const variation = DESIGN_VARIATIONS[variationKey];
    const typeDesign = slide.type === 'cover'
        ? 'インパクト重視の表紙デザイン。大きな見出しで目を引く。'
        : slide.type === 'cta'
            ? '行動喚起デザイン。「お気軽にご相談ください」などのCTAを強調。'
            : '情報整理されたコンテンツスライド。番号と見出しを明確に。';

    const aspectText = state.aspectRatio === '1:1' ? '正方形（1:1）' : '縦長（4:5）';
    const hasRef = state.referenceImages.length > 0;
    const refNote = hasRef
        ? '\n【参考デザイン】\n添付した参考画像のデザインテイスト（色使い、レイアウト、雰囲気、フォント感）を参考にしてください。ただし内容はコピーせず、以下のスライド情報に基づいて新しい画像を作成してください。'
        : '';

    return `以下の条件でInstagramカルーセル投稿の${slide.number}枚目の画像を生成してください。
${refNote}
【基本仕様】
- ${aspectText}のInstagram投稿画像
- ターゲット：50代以上がスマホで見やすいデザイン
- 文字は大きく、少なめに
- 店名やブランド名は画像に含めないでください

【スライド情報】
- スライド番号: ${slide.number}
- タイプ: ${slide.type === 'cover' ? '表紙' : slide.type === 'cta' ? 'CTA（最終）' : 'コンテンツ'}
- 見出し: ${slide.headline}
${slide.subtext ? `- サブテキスト: ${slide.subtext}` : ''}
${slide.detail ? `- 詳細: ${slide.detail}` : ''}

【デザインスタイル】
- ${variation.style}
- ${typeDesign}
${revision ? `\n【修正指示】\n${revision}` : ''}

日本語のテキストを正確に描画してください。`;
}

function createSlidePrompt(slide, designStyle, prevImage = null) {
    const typeDesign = slide.type === 'cover'
        ? 'インパクト重視の表紙デザイン。'
        : slide.type === 'cta'
            ? '行動喚起デザイン。'
            : '情報整理されたコンテンツスライド。';

    const basePrompt = prevImage
        ? `添付画像のデザインスタイルを踏襲して、以下の条件で${slide.number}枚目のスライド画像を生成してください。`
        : `以下の条件でInstagramカルーセル投稿の${slide.number}枚目の画像を生成してください。`;

    const aspectText = state.aspectRatio === '1:1' ? '正方形（1:1）' : '縦長（4:5）';

    return `${basePrompt}

【踏襲するデザインスタイル】
${designStyle}

【基本仕様】
- ${aspectText}のInstagram投稿画像
- ターゲット：50代以上がスマホで見やすいデザイン
- 文字は大きく、少なめに
- 店名やブランド名は画像に含めないでください
- 全体の統一感を保つこと

【スライド情報】
- スライド番号: ${slide.number}
- タイプ: ${slide.type === 'cover' ? '表紙' : slide.type === 'cta' ? 'CTA（最終）' : 'コンテンツ'}
- 見出し: ${slide.headline}
${slide.subtext ? `- サブテキスト: ${slide.subtext}` : ''}
${slide.detail ? `- 詳細: ${slide.detail}` : ''}

${typeDesign}
日本語のテキストを正確に描画してください。`;
}

// ===== UI制御 =====
function showStep(stepNum) {
    elements.step1.classList.add('hidden');
    elements.step2.classList.add('hidden');
    elements.step3.classList.add('hidden');

    if (stepNum === 1) elements.step1.classList.remove('hidden');
    if (stepNum === 2) elements.step2.classList.remove('hidden');
    if (stepNum === 3) elements.step3.classList.remove('hidden');
}

function showLoading(message = '処理中...', progress = 0) {
    elements.loadingMessage.textContent = message;
    elements.progressFill.style.width = `${progress}%`;
    elements.progressText.textContent = progress > 0 ? `${Math.round(progress)}%` : '';
    elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    elements.loadingOverlay.classList.add('hidden');
}

function showError(message, showRetry = false) {
    elements.errorMessage.textContent = message;
    elements.retryBtn.classList.toggle('hidden', !showRetry);
    elements.errorContainer.classList.remove('hidden');
}

function hideError() {
    elements.errorContainer.classList.add('hidden');
}

function hideSuccess() {
    if (successHideTimer) {
        clearTimeout(successHideTimer);
        successHideTimer = null;
    }
    successActionHandler = null;
    if (elements.successActionBtn) {
        elements.successActionBtn.classList.add('hidden');
        elements.successActionBtn.textContent = '結果を見る';
    }
    elements.successContainer.classList.add('hidden');
}

function showSuccess(message, options = {}) {
    if (successHideTimer) {
        clearTimeout(successHideTimer);
        successHideTimer = null;
    }

    const { actionLabel = '', onAction = null, autoHideMs = 3000 } = options;
    elements.successMessage.textContent = message;

    if (elements.successActionBtn && actionLabel && typeof onAction === 'function') {
        successActionHandler = onAction;
        elements.successActionBtn.textContent = actionLabel;
        elements.successActionBtn.classList.remove('hidden');
    } else if (elements.successActionBtn) {
        successActionHandler = null;
        elements.successActionBtn.classList.add('hidden');
    }

    elements.successContainer.classList.remove('hidden');

    if (autoHideMs > 0) {
        successHideTimer = setTimeout(() => {
            hideSuccess();
        }, autoHideMs);
    }
}

function openResultStep(stepNum, selector = '') {
    showStep(stepNum);
    if (!selector) return;

    const target = document.querySelector(selector);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function showBatchResultAction(message, stepNum, selector = '') {
    showSuccess(message, {
        actionLabel: '結果を見る',
        autoHideMs: 20000,
        onAction: () => {
            openResultStep(stepNum, selector);
        }
    });
}

async function ensureBatchNotificationPermission() {
    if (!state.notifyOnBatchComplete) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;

    try {
        await Notification.requestPermission();
    } catch (error) {
        console.warn('通知許可リクエストに失敗:', error);
    }
}

function notifyBatchCompletion(title, body, stepNum, selector = '') {
    if (!state.notifyOnBatchComplete) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
        const notification = new Notification(title, {
            body,
            tag: 'instaimage-batch-complete'
        });

        notification.onclick = () => {
            window.focus();
            openResultStep(stepNum, selector);
            notification.close();
        };
    } catch (error) {
        console.warn('通知表示に失敗:', error);
    }
}

function displayImage(container, base64Data) {
    container.innerHTML = '';
    const img = document.createElement('img');
    img.src = `data:image/png;base64,${base64Data}`;
    img.alt = '生成された画像';
    img.style.cursor = 'pointer';
    img.addEventListener('click', () => openLightbox(img.src));
    container.appendChild(img);
}

// ===== ライトボックス =====
function openLightbox(src) {
    elements.lightboxImg.src = src;
    elements.lightbox.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    elements.lightbox.classList.add('hidden');
    elements.lightboxImg.src = '';
    document.body.style.overflow = '';
}

// ===== メインフロー =====
async function startGeneration() {
    if (state.isGenerating) return;

    const text = elements.inputText.value.trim();

    if (!text) {
        showError('投稿案を入力してください');
        return;
    }

    if (!getApiKey()) {
        elements.apiModal.classList.remove('hidden');
        return;
    }

    const quickSlides = detectSlides(text);
    if (quickSlides.length === 0) {
        showError('カルーセル構造が検出できませんでした。「■ 1枚目」「■ 2枚目」の形式で入力してください');
        return;
    }

    try {
        state.isGenerating = true;
        if (state.generationMode === 'batch') {
            await ensureBatchNotificationPermission();
        }
        showLoading('テキストを解析中...', 10);

        state.slideData = await analyzeTextWithGemini(text);
        console.log('解析結果:', state.slideData);

        const modeLabel = state.generationMode === 'batch' ? '[Batch] ' : '';
        showLoading(`${modeLabel}デザイン案を生成中...`, 20);
        showStep(2);

        await generateDesignOptions();

        hideLoading();
        if (state.generationMode === 'batch') {
            showBatchResultAction('Batchでデザイン案の生成が完了しました', 2, '.design-options');
            notifyBatchCompletion(
                'Batch処理が完了しました',
                'デザイン案の生成が完了しました。結果を確認できます。',
                2,
                '.design-options'
            );
        }
    } catch (error) {
        hideLoading();
        showError(error.message, true);
        elements.retryBtn.onclick = () => {
            hideError();
            startGeneration();
        };
    } finally {
        state.isGenerating = false;
    }
}

async function generateDesignOptions() {
    const firstSlide = state.slideData.slides[0];
    const revision = elements.revisionInput.value.trim();
    state.currentRevision = revision;

    const allOptions = ['A', 'B', 'C', 'D', 'E'];
    const allPreviews = {
        A: elements.previewA,
        B: elements.previewB,
        C: elements.previewC,
        D: elements.previewD,
        E: elements.previewE
    };

    // 有効なバリエーションのみ表示・生成
    allOptions.forEach(opt => {
        const card = document.querySelector(`.design-option[data-option="${opt}"]`);
        if (state.enabledVariations.includes(opt)) {
            card.style.display = '';
            allPreviews[opt].innerHTML = '<div class="placeholder generating">生成中...</div>';
        } else {
            card.style.display = 'none';
            state.designOptions[opt] = null;
        }
    });

    // グリッド列数を有効なバリエーション数に合わせて調整
    const designGrid = document.querySelector('.design-options');
    const count = state.enabledVariations.length;
    designGrid.style.gridTemplateColumns = `repeat(${Math.min(count, 5)}, 1fr)`;

    // 参考画像がある場合、最初の画像（最大1枚）をリファレンスとして渡す
    const refImage = state.referenceImages.length > 0 ? state.referenceImages[0] : null;

    if (state.generationMode === 'batch') {
        // Batchモード: 全デザイン案を一括送信
        const requestItems = state.enabledVariations.map(opt => {
            const prompt = createDesignPrompt(firstSlide, opt, revision);
            const parts = [];
            if (refImage) {
                parts.push({
                    inlineData: { mimeType: 'image/png', data: refImage.base64 }
                });
            }
            parts.push({ text: prompt });
            return { parts };
        });

        try {
            const images = await generateImagesBatch(requestItems, (jobState, elapsedSec, nextPollSec) => {
                const nextPollText = nextPollSec ? ` / 次回確認 ${nextPollSec}秒後` : '';
                showLoading(`Batch処理中... (${elapsedSec}秒経過${nextPollText})`, 50);
            });

            images.forEach((img, i) => {
                const opt = state.enabledVariations[i];
                if (img.imageData) {
                    state.designOptions[opt] = img.imageData;
                    displayImage(allPreviews[opt], img.imageData);
                } else {
                    allPreviews[opt].innerHTML = `<div class="placeholder">生成エラー</div>`;
                }
            });
        } catch (error) {
            state.enabledVariations.forEach(opt => {
                allPreviews[opt].innerHTML = `<div class="placeholder">生成エラー</div>`;
            });
            throw error;
        }
    } else {
        // 通常モード: 並列で個別生成
        await Promise.all(state.enabledVariations.map(async (opt) => {
            try {
                const prompt = createDesignPrompt(firstSlide, opt, revision);
                const imageData = await generateImage(prompt, refImage ? refImage.base64 : null);
                state.designOptions[opt] = imageData;
                displayImage(allPreviews[opt], imageData);
            } catch (error) {
                allPreviews[opt].innerHTML = `<div class="placeholder">生成エラー</div>`;
                console.error(`デザイン${opt}生成エラー:`, error);
            }
        }));
    }
}

async function regenerateDesigns() {
    if (state.isGenerating) return;

    try {
        state.isGenerating = true;
        showLoading('デザイン案を再生成中...', 0);
        await generateDesignOptions();
        hideLoading();
        if (state.generationMode === 'batch') {
            showBatchResultAction('Batchでデザイン案の再生成が完了しました', 2, '.design-options');
            notifyBatchCompletion(
                'Batch処理が完了しました',
                'デザイン案の再生成が完了しました。結果を確認できます。',
                2,
                '.design-options'
            );
        } else {
            showSuccess('デザイン案を再生成しました');
        }
    } catch (error) {
        hideLoading();
        showError(error.message);
    } finally {
        state.isGenerating = false;
    }
}

async function selectDesign(optionKey) {
    if (!state.designOptions[optionKey]) {
        showError('このデザイン案の画像が生成されていません');
        return;
    }

    state.selectedDesign = optionKey;

    document.querySelectorAll('.design-option').forEach(el => {
        el.classList.remove('selected');
    });
    document.querySelector(`.design-option[data-option="${optionKey}"]`).classList.add('selected');

    await generateAllSlides();
}

async function generateAllSlides() {
    showStep(3);
    state.generatedSlides = [];

    const slides = state.slideData.slides;
    const totalSlides = slides.length;
    const designStyle = DESIGN_VARIATIONS[state.selectedDesign].style;

    elements.slidesContainer.innerHTML = '';
    elements.downloadZip.disabled = true;

    try {
        let prevImageBase64 = null;
        const isBatch = state.generationMode === 'batch';
        if (isBatch) {
            await ensureBatchNotificationPermission();
        }

        // スライド要素を先に全部作成
        const slideElements = [];
        for (let i = 0; i < totalSlides; i++) {
            const slideEl = createSlideElement(i + 1);
            elements.slidesContainer.appendChild(slideEl);
            slideElements.push(slideEl);
        }

        for (let i = 0; i < totalSlides; i++) {
            const slide = slides[i];
            const progress = ((i + 1) / totalSlides) * 100;
            const slideEl = slideElements[i];

            const prompt = createSlidePrompt(slide, designStyle, prevImageBase64);

            try {
                let imageData;

                if (isBatch) {
                    showLoading(`[Batch] スライド ${i + 1}/${totalSlides} 処理中...`, progress);
                    elements.generationStatus.textContent = `[Batch] ${i + 1}/${totalSlides}枚目を処理中...`;
                    elements.generationProgress.style.width = `${progress}%`;

                    imageData = await generateImageViaBatch(prompt, prevImageBase64, (jobState, elapsedSec, nextPollSec) => {
                        const nextPollText = nextPollSec ? ` / 次回確認 ${nextPollSec}秒後` : '';
                        showLoading(`[Batch] スライド ${i + 1}/${totalSlides} 処理中... (${elapsedSec}秒${nextPollText})`, progress);
                        elements.generationStatus.textContent = `[Batch] ${i + 1}/${totalSlides}枚目 処理中 (${elapsedSec}秒)`;
                    });
                } else {
                    showLoading(`スライド ${i + 1}/${totalSlides} を生成中...`, progress);
                    elements.generationStatus.textContent = `${i + 1}/${totalSlides}枚目を生成中...`;
                    elements.generationProgress.style.width = `${progress}%`;

                    imageData = await generateImage(prompt, prevImageBase64);
                }

                state.generatedSlides[i] = imageData;
                prevImageBase64 = imageData;

                const previewEl = slideEl.querySelector('.slide-preview');
                displayImage(previewEl, imageData);

                slideEl.querySelector('.download-btn').disabled = false;
                slideEl.querySelector('.regenerate-btn').disabled = false;

            } catch (error) {
                const previewEl = slideEl.querySelector('.slide-preview');
                previewEl.innerHTML = `<div class="placeholder">生成エラー</div>`;
                console.error(`スライド${i + 1}生成エラー:`, error);
            }
        }

        hideLoading();
        elements.generationStatus.textContent = '生成完了！';
        elements.downloadZip.disabled = false;
        if (isBatch) {
            showBatchResultAction('全スライドの生成が完了しました（Batchモード）', 3, '.slides-container');
            notifyBatchCompletion(
                'Batch処理が完了しました',
                '全スライドの生成が完了しました。結果を確認できます。',
                3,
                '.slides-container'
            );
        } else {
            showSuccess('全スライドの生成が完了しました');
        }

    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

function createSlideElement(slideNum) {
    const div = document.createElement('div');
    div.className = 'slide-item';
    div.id = `slide-${slideNum}`;
    div.innerHTML = `
        <div class="slide-number">${slideNum}枚目</div>
        <div class="slide-preview">
            <div class="placeholder generating">生成中...</div>
        </div>
        <div class="slide-actions">
            <button class="btn btn-secondary download-btn" disabled>📥</button>
            <button class="btn btn-secondary regenerate-btn" disabled>🔄</button>
        </div>
    `;

    div.querySelector('.download-btn').addEventListener('click', () => {
        downloadSingleSlide(slideNum);
    });
    div.querySelector('.regenerate-btn').addEventListener('click', () => {
        regenerateSlide(slideNum);
    });

    return div;
}

async function regenerateSlide(slideNum) {
    const index = slideNum - 1;
    const slide = state.slideData.slides[index];
    const designStyle = DESIGN_VARIATIONS[state.selectedDesign].style;
    const prevImageBase64 = index > 0 ? state.generatedSlides[index - 1] : null;
    const isBatch = state.generationMode === 'batch';

    try {
        showLoading(`スライド ${slideNum} を再生成中...`, 0);
        if (isBatch) {
            await ensureBatchNotificationPermission();
        }

        const prompt = createSlidePrompt(slide, designStyle, prevImageBase64);
        const imageData = isBatch
            ? await generateImageViaBatch(prompt, prevImageBase64, (jobState, elapsedSec, nextPollSec) => {
                const nextPollText = nextPollSec ? ` / 次回確認 ${nextPollSec}秒後` : '';
                showLoading(`[Batch] スライド ${slideNum} を再生成中... (${elapsedSec}秒${nextPollText})`, 0);
            })
            : await generateImage(prompt, prevImageBase64);

        state.generatedSlides[index] = imageData;

        const slideEl = document.getElementById(`slide-${slideNum}`);
        const previewEl = slideEl.querySelector('.slide-preview');
        displayImage(previewEl, imageData);

        hideLoading();
        if (isBatch) {
            showBatchResultAction(`スライド ${slideNum} を再生成しました（Batchモード）`, 3, `#slide-${slideNum}`);
            notifyBatchCompletion(
                'Batch処理が完了しました',
                `スライド ${slideNum} の再生成が完了しました。`,
                3,
                `#slide-${slideNum}`
            );
        } else {
            showSuccess(`スライド ${slideNum} を再生成しました`);
        }

    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

function downloadSingleSlide(slideNum) {
    const index = slideNum - 1;
    const base64Data = state.generatedSlides[index];

    if (!base64Data) {
        showError('このスライドの画像がありません');
        return;
    }

    const link = document.createElement('a');
    link.href = `data:image/png;base64,${base64Data}`;
    link.download = `slide_${String(slideNum).padStart(2, '0')}.png`;
    link.click();
}

async function downloadAllAsZip() {
    if (state.generatedSlides.length === 0) {
        showError('ダウンロードする画像がありません');
        return;
    }

    try {
        showLoading('ZIPファイルを作成中...', 50);

        const zip = new JSZip();

        state.generatedSlides.forEach((base64Data, i) => {
            if (base64Data) {
                const slideNum = String(i + 1).padStart(2, '0');
                zip.file(`slide_${slideNum}.png`, base64Data, { base64: true });
            }
        });

        const blob = await zip.generateAsync({ type: 'blob' });

        hideLoading();

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `instagram_slides_${Date.now()}.zip`;
        link.click();

        showSuccess('ZIPファイルをダウンロードしました');

    } catch (error) {
        hideLoading();
        showError('ZIP作成に失敗しました: ' + error.message);
    }
}

function resetAll() {
    hideSuccess();
    state = {
        apiKey: state.apiKey,
        aspectRatio: state.aspectRatio,
        generationMode: state.generationMode,
        notifyOnBatchComplete: state.notifyOnBatchComplete,
        enabledVariations: state.enabledVariations,
        parsedSlides: null,
        slideData: null,
        designOptions: { A: null, B: null, C: null, D: null, E: null },
        selectedDesign: null,
        generatedSlides: [],
        currentRevision: '',
        isGenerating: false,
        referenceImages: []
    };

    elements.inputText.value = '';
    elements.charCount.textContent = '0文字';
    elements.parsePreview.classList.add('hidden');
    elements.revisionInput.value = '';
    elements.slidesContainer.innerHTML = '';
    elements.downloadZip.disabled = true;
    elements.refPreviewContainer.innerHTML = '';
    elements.refFileInput.value = '';
    elements.regenerateWithRefBtn.classList.add('hidden');

    ['A', 'B', 'C', 'D', 'E'].forEach(opt => {
        const preview = document.getElementById(`preview${opt}`);
        preview.innerHTML = '<div class="placeholder">生成中...</div>';
    });

    document.querySelectorAll('.design-option').forEach(el => {
        el.classList.remove('selected');
    });

    showStep(1);
}

// ===== 参考画像処理 =====
async function handleRefFiles(files) {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    for (const file of imageFiles) {
        try {
            const result = await readFileAsBase64(file);
            state.referenceImages.push({
                base64: result.base64,
                mimeType: file.type,
                name: file.name
            });
            renderRefPreviews();
        } catch (error) {
            console.error('参考画像の読み込みエラー:', error);
        }
    }
    // ファイル入力をリセット（同じファイルを再選択可能に）
    elements.refFileInput.value = '';
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result;
            // 「data:image/png;base64,」の部分を除去
            const base64 = dataUrl.split(',')[1];
            resolve({ base64, dataUrl });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function renderRefPreviews() {
    elements.refPreviewContainer.innerHTML = '';
    state.referenceImages.forEach((img, index) => {
        const item = document.createElement('div');
        item.className = 'ref-preview-item';
        item.innerHTML = `
            <img src="data:${img.mimeType};base64,${img.base64}" alt="${img.name}">
            <button class="ref-preview-remove" title="削除">&times;</button>
        `;
        item.querySelector('.ref-preview-remove').addEventListener('click', () => {
            state.referenceImages.splice(index, 1);
            renderRefPreviews();
        });
        item.querySelector('img').addEventListener('click', () => {
            openLightbox(`data:${img.mimeType};base64,${img.base64}`);
        });
        elements.refPreviewContainer.appendChild(item);
    });

    // 参考画像があるときは再生成ボタンを表示
    if (state.referenceImages.length > 0) {
        elements.regenerateWithRefBtn.classList.remove('hidden');
    } else {
        elements.regenerateWithRefBtn.classList.add('hidden');
    }
}

// ===== ユーティリティ =====
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
