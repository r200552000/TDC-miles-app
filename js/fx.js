/* ==========================================
   外幣匯率處理模組
   ========================================== */
let lastFetchedRate = null;

// --- 匯率國家辨識 Helper ---
function clearFxCurrencyCode() {
    clearInput('fx-currency-code');
    const hintEl = document.getElementById('fx-currency-hint');
    if (hintEl) {
        hintEl.style.display = 'none';
        hintEl.innerText = '';
    }

    const timeEl = document.getElementById('fx-api-time');
    if (timeEl) {
        timeEl.style.display = 'none';
        timeEl.innerText = '';
    }

    lastFetchedRate = null;
    safeRemoveItem('LAST_FX_CODE');

    const currType = document.getElementById('currency-type').value;
    if (currType === 'FOREIGN') {
        document.getElementById('amount-label').innerHTML = '🌎 消費金額 (外幣)';
    }
}

function detectCurrencyCode(input) {
    if (!input || typeof input !== 'string') return null;
    const str = input.trim().toLowerCase();
    if (str === '') return null;

    const map = {
        '日本': 'JPY', '日圓': 'JPY', '日幣': 'JPY', 'jpy': 'JPY',
        '新加坡': 'SGD', '新幣': 'SGD', 'sgd': 'SGD',
        '香港': 'HKD', '港幣': 'HKD', 'hkd': 'HKD',
        '韓國': 'KRW', '南韓': 'KRW', '韓幣': 'KRW', '韓元': 'KRW', 'krw': 'KRW',
        '泰國': 'THB', '泰銖': 'THB', 'thb': 'THB',
        '美國': 'USD', '美金': 'USD', 'usd': 'USD',
        '英國': 'GBP', '英鎊': 'GBP', 'gbp': 'GBP',
        '歐洲': 'EUR', '歐元': 'EUR', 'eur': 'EUR', '法國': 'EUR', '德國': 'EUR', '義大利': 'EUR', '西班牙': 'EUR',
        '中國': 'CNY', '人民幣': 'CNY', 'cny': 'CNY', 'rmb': 'CNY',
        '馬來西亞': 'MYR', '馬幣': 'MYR', 'myr': 'MYR',
        '越南': 'VND', '越盾': 'VND', 'vnd': 'VND',
        '菲律賓': 'PHP', '披索': 'PHP', 'php': 'PHP',
        '印度': 'INR', '盧比': 'INR', 'inr': 'INR',
        '斯里蘭卡': 'LKR', 'lkr': 'LKR'
    };

    if (map[str]) return map[str];
    if (str.length === 3 && /^[a-z]{3}$/.test(str)) return str.toUpperCase();
    return null;
}

function handleCurrencyInput(val) {
    const detected = detectCurrencyCode(val);
    const hintEl = document.getElementById('fx-currency-hint');
    if (detected) {
        hintEl.innerText = `✅ 已辨識幣別：${detected}`;
        hintEl.style.display = 'block';
        updateCurrencyLabel(detected);
    } else {
        hintEl.style.display = 'none';
        updateCurrencyLabel(val);
    }
}

function updateCurrencyLabel(codeParam) {
    let code = codeParam;
    if (!code) {
        const rawVal = document.getElementById('fx-currency-code').value;
        code = detectCurrencyCode(rawVal) || rawVal.trim().toUpperCase();
    }

    if (code) safeSetItem('LAST_FX_CODE', code);
    const currType = document.getElementById('currency-type').value;
    if (currType === 'FOREIGN') {
        document.getElementById('amount-label').innerHTML = `🌎 消費金額 (${code || '外幣'})`;
    }
}

function toggleFxInput(val) {
    document.getElementById('fx-input-group').style.display = (val === 'FOREIGN') ? 'block' : 'none';
    if (val === 'FOREIGN') {
        const savedCode = safeGetItem('LAST_FX_CODE') || '';
        if (savedCode && !document.getElementById('fx-currency-code').value) {
            document.getElementById('fx-currency-code').value = savedCode;
            handleCurrencyInput(savedCode);
        } else {
            updateCurrencyLabel();
        }
    } else {
        document.getElementById('amount-label').innerHTML = '🇹🇼 消費金額 (TWD)';
    }
}

function updateFxFeedback(isManual = false) {
    const inputVal = document.getElementById('fx-rate-input').value;
    const feedbackBlock = document.getElementById('fx-feedback');
    const realRateSpan = document.getElementById('fx-real-rate');
    const warningSpan = document.getElementById('fx-manual-warning');

    if (inputVal && !isNaN(inputVal) && parseFloat(inputVal) > 0) {
        const realRate = parseFloat(inputVal) * 1.015;
        realRateSpan.innerText = realRate.toFixed(4);
        feedbackBlock.style.display = 'block';

        if (isManual && lastFetchedRate !== null && parseFloat(inputVal) !== lastFetchedRate) {
            warningSpan.style.display = 'inline';
        } else {
            warningSpan.style.display = 'none';
        }
    } else {
        feedbackBlock.style.display = 'none';
        warningSpan.style.display = 'none';
    }
}

async function autoFetchFxRate() {
    const rawInput = document.getElementById('fx-currency-code').value;
    const codeInput = detectCurrencyCode(rawInput) || rawInput.trim().toUpperCase();
    const btn = document.getElementById('btn-fetch-fx');

    if (!codeInput || codeInput.length !== 3) return showCustomAlert('請先輸入國家或 3 碼外幣代碼 (如：日本、JPY)');
    if (codeInput === 'TWD') return showCustomAlert('台幣不需要抓取匯率！');

    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>抓取中';
    btn.disabled = true;

    try {
        const res = await fetch(`https://open.er-api.com/v6/latest/${codeInput}`);
        if (!res.ok) throw new Error('API 異常');
        const data = await res.json();

        if (data && data.rates && data.rates['TWD']) {
            const rateInput = document.getElementById('fx-rate-input');
            const rate = data.rates['TWD'];
            rateInput.value = rate.toFixed(4);
            lastFetchedRate = parseFloat(rate.toFixed(4));
            updateFxFeedback(false);

            const timeEl = document.getElementById('fx-api-time');
            if (timeEl) {
                if (data.time_last_update_unix) {
                    const d = new Date(data.time_last_update_unix * 1000);
                    const formatted = d.toLocaleString('zh-TW', {
                        timeZone: 'Asia/Taipei',
                        hour12: false,
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    }).replace(/-/g, '/');
                    timeEl.innerText = `🕒 資料來源時間 (API 提供): ${formatted}`;
                    timeEl.style.display = 'block';
                } else {
                    timeEl.innerText = '';
                    timeEl.style.display = 'none';
                }
            }

            rateInput.style.transition = '0.3s';
            rateInput.style.backgroundColor = '#dcfce7';
            setTimeout(() => rateInput.style.backgroundColor = '#fff', 800);
        } else {
            throw new Error('查無此幣別');
        }
    } catch (err) {
        console.warn(err);
        const timeEl = document.getElementById('fx-api-time');
        if (timeEl) {
            timeEl.innerText = '';
            timeEl.style.display = 'none';
        }
        showCustomAlert(`抓取失敗 (${codeInput})，請檢查代碼或直接手動輸入牌告匯率。`);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
