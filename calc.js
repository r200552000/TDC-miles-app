/* ==========================================
   核心運算引擎 - 計算邏輯與結果渲染
   ========================================== */

// ==========================================
// 主計算流程
// ==========================================
function calculate() {
    renderTacticalAdvice(null);
    const db = loadDB(); const amt = parseFloat(document.getElementById('amount').value);
    if(isNaN(amt) || amt === 0) return showCustomAlert('請輸入消費金額！');

    const currType = document.getElementById('currency-type').value;
    let twdBase = amt; let twdSpend = amt;

    const fxBoard = document.getElementById('fx-calc-board');
    if (currType === 'FOREIGN') {
        const rawRate = parseFloat(document.getElementById('fx-rate-input').value);
        if(!rawRate) return showCustomAlert('請輸入當下的牌告匯率！');

        twdBase = Math.round(amt * rawRate);
        twdSpend = Math.round(amt * rawRate * 1.015);

        fxBoard.innerHTML = `
            <div class="tdc-flex tdc-justify-between tdc-align-center tdc-mb-1">
                <span class="text-secondary small fw-bold">外幣本金折合 (回饋計算基準)</span>
                <span class="text-dark fw-bold">NT$ ${twdBase.toLocaleString()}</span>
            </div>
            <div class="tdc-flex tdc-justify-between tdc-align-center tdc-mb-1">
                <span class="text-secondary small fw-bold">1.5% 結匯手續費</span>
                <span class="text-danger fw-bold">+ NT$ ${Math.round(twdBase * 0.015).toLocaleString()}</span>
            </div>
            <hr class="my-2" style="border-color: #e879f9; opacity: 0.3;">
            <div class="tdc-flex tdc-justify-between tdc-align-center">
                <span class="text-primary-dark fw-bold">預估總扣款金額</span>
                <span class="text-primary-dark fs-5 fw-bold font-hand">NT$ ${twdSpend.toLocaleString()}</span>
            </div>
        `;
        fxBoard.style.display = 'block';
    } else {
        fxBoard.style.display = 'none';
    }

    const kwKey = (document.getElementById('keyword-input').value || '').trim().toLowerCase();
    const rawFxCode = document.getElementById('fx-currency-code') ? document.getElementById('fx-currency-code').value.trim() : '';
    const currencyCode = detectCurrencyCode(rawFxCode) || rawFxCode.toUpperCase();
    const isForeign = (currType === 'FOREIGN');
    const payMethod = document.getElementById('payment').value;

    const kwConfig = getKeywordsConfig();
    const isEUPhysical = isForeign && payMethod !== 'online' && ((currencyCode && ['EUR','GBP'].includes(currencyCode)) || kwConfig.eu_uk.some(w => kwKey.includes(w)));

    const rawCat = document.getElementById('category').value;
    const ctx = {
        db: db, curr: isForeign ? 'FOREIGN' : 'TWD', currencyCode: currencyCode, cat: rawCat, group: mapCategoryGroup(rawCat),
        pay: payMethod, kwKey: kwKey,
        isBirthday: document.getElementById('birthdayMode').checked, isFlyMode: document.getElementById('flyMode').checked,
        isForeign: isForeign, isEUR: isEUPhysical, twdBase: twdBase, twdSpend: twdSpend, isLiveSelect: false
    };

    if (isCategoryGroup(ctx, 'dining')) {
        ctx.isLiveSelect = true;
    } else if (ctx.cat !== 'dining_hotel' && ctx.cat !== 'delivery' && kwConfig.live.dining.some(w => ctx.kwKey.includes(w))) {
        ctx.isLiveSelect = true;
    } else if (ctx.cat !== 'delivery' && (kwConfig.live.shop.some(w => ctx.kwKey.includes(w)) || kwConfig.live.entertainment.some(w => ctx.kwKey.includes(w)))) {
        ctx.isLiveSelect = true;
    }

    currentResults = [];
    db.settings.enabledBuiltins.forEach(cardId => {
        if(CARD_RULES[cardId]) { const res = CARD_RULES[cardId].calc(ctx); currentResults.push({ id: cardId, name: CARD_RULES[cardId].name, ...res, twdSpend, twdBase }); }
    });

    db.customCards.forEach(c => {
        if (!c || typeof c !== 'object') return;
        let div = ctx.isForeign ? c.forRate : c.domRate;

        if (!div || isNaN(div) || div <= 0) {
            currentResults.push({ id: c.id, name: escapeHTML(c.name), miles: 0, note: '<span class="text-danger">⚠️ 兌換率設定異常 (除以零防護)</span>', consumedQuota: 0, isWarning: true, twdSpend: ctx.twdSpend, twdBase: ctx.twdBase });
            return;
        }

        let miles = Math.trunc(ctx.twdBase/div);
        let note = `自訂 $${div}/哩`;
        let isWarning = false;
        let consumedQuota = ctx.twdBase;

        if (c.limitAmt && c.limitAmt > 0) {
            let limitKey = getLimitKey(db, c.id, new Date());
            let used = db.limits[limitKey]?.spend || 0;
            let remaining = Math.max(0, c.limitAmt - used);

            if (ctx.twdBase > remaining) {
                isWarning = true;
                let validSpend = remaining;
                miles = Math.trunc(validSpend / div);
                note += `<span class="text-danger fw-bold d-block mt-1">⚠️ 額度已滿，超額部分無回饋</span>`;
                consumedQuota = validSpend;
            }
        }
        currentResults.push({ id: c.id, name: escapeHTML(c.name), miles: miles, note: note, consumedQuota: consumedQuota, isWarning: isWarning, twdSpend: ctx.twdSpend, twdBase: ctx.twdBase });
    });
    if (amt < 0) currentResults.sort((a,b) => a.miles - b.miles);
    else currentResults.sort((a,b) => b.miles - a.miles);

    renderResults(currentResults);
    const targetVal = document.getElementById('redemption-target').value;
    const isRefund = currentResults.length > 0 && currentResults[0].twdBase < 0;
    const advice = getTacticalCardAdvice(currentResults, targetVal, isRefund);
    renderTacticalAdvice(advice);
}

function getTacticalCardAdvice(results, target, isRefund) {
    if (!results || results.length === 0 || isRefund || results[0].miles <= 0) {
        return null;
    }

    const primary = results[0];
    const advice = {
        primaryCard: primary.name,
        primaryReason: primary.isWarning ? "雖達上限，但綜合評估仍為當下最高" : "回饋率最高，且額度健康",
        secondaryCard: null,
        secondaryReason: null,
        warning: primary.isWarning ? "注意：此筆消費將超出該卡回饋上限" : null,
        targetHint: null
    };

    for (let i = 1; i < results.length; i++) {
        const card = results[i];
        if (!card.isWarning && card.miles > 0 && card.name !== primary.name) {
            advice.secondaryCard = card.name;
            advice.secondaryReason = "若需分刷，此為額度健康的最佳備案";
            break;
        }
    }

    if (primary.id && typeof primary.id === 'string' && !primary.id.startsWith('custom_')) {
        const idLower = primary.id.toLowerCase();
        const isCxSystem = idLower.includes('taishin_cx');
        const isCiSystem = idLower.includes('ctbc_ci');

        if (target === 'CI' && isCxSystem) {
            advice.targetHint = "⚠️ 最佳卡片偏向國泰體系，請留意是否支援轉點至華航";
        } else if (target === 'AM_BR' && isCiSystem) {
            advice.targetHint = "⚠️ 最佳卡片偏向華航體系，請留意是否支援轉點至亞萬/長榮";
        }
    }

    return advice;
}

function renderTacticalAdvice(adviceObj) {
    const container = document.getElementById('tactical-advice-container');
    if (!container) return;

    if (!adviceObj) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    let html = `
        <div class="card-box tdc-mb-3 p-3 shadow-sm" style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px solid #86efac; border-radius: 16px;">
            <div class="tdc-flex tdc-align-center tdc-mb-2">
                <svg class="lucide me-1 text-success"><use href="#icon-sparkle"/></svg>
                <h6 class="fw-bold tdc-m-0 text-success">戰術主攻建議</h6>
            </div>
            <div class="fw-bold text-dark" style="font-size: 1.05rem;">🎯 首選：${escapeHTML(adviceObj.primaryCard)}</div>
            <div class="small text-secondary tdc-mb-2">💡 ${escapeHTML(adviceObj.primaryReason)}</div>
    `;

    if (adviceObj.warning) {
        html += `<div class="small bg-white p-2 rounded-3 border border-warning text-danger fw-bold tdc-mb-2">🚨 ${escapeHTML(adviceObj.warning)}</div>`;
    }

    if (adviceObj.targetHint) {
        html += `<div class="small bg-white p-2 rounded-3 border border-danger text-danger fw-bold tdc-mb-2">${escapeHTML(adviceObj.targetHint)}</div>`;
    }

    if (adviceObj.secondaryCard) {
        html += `
            <div class="border-top pt-2 mt-2">
                <div class="fw-bold text-dark" style="font-size: 0.95rem;">🛡️ 備援：${escapeHTML(adviceObj.secondaryCard)}</div>
                <div class="small text-secondary">💡 ${escapeHTML(adviceObj.secondaryReason)}</div>
            </div>
        `;
    } else {
        html += `
            <div class="border-top pt-2 mt-2">
                <div class="small text-secondary">💡 目前沒有更健康的備援卡可建議</div>
            </div>
        `;
    }

    html += `</div>`;

    container.innerHTML = html;
    container.style.display = 'block';
}

function renderResults(list) {
    const con = document.getElementById('cards-container'); con.innerHTML = '';
    document.getElementById('result-area').style.display = 'block';
    list.forEach((c, idx) => {
        const isWinner = idx === 0 && !c.isWarning;
        const integrityColor = '#10b981';

        let trueCostHtml = '';
        if (c.miles > 0) {
            let trueCost = (c.twdSpend / c.miles).toFixed(2);
            trueCostHtml = `<span class="badge bg-light text-secondary border mt-1" style="font-size:0.7rem;">實質成本 $${trueCost}/哩</span>`;
        }

        const div = document.createElement('div'); div.className = `plan-card ${isWinner ? 'plan-winner' : ''} ${c.isWarning ? 'plan-warning' : ''}`;
        div.innerHTML = `
        ${isWinner ? '<span class="winner-badge">最佳選擇</span>' : ''}
        <div class="tdc-flex tdc-justify-between align-items-start">
            <div>
                <h4 class="card-name">${c.name}</h4>
                <div class="text-muted small font-hand mt-1">${c.note}</div>
                ${trueCostHtml}
            </div>
            <div class="tdc-text-end flex-shrink-0 ms-2">
                <div class="card-miles">${c.miles.toLocaleString()} <small style="font-size:0.5em">哩</small></div>
                <div class="integrity-badge" style="background:${integrityColor}15; color:${integrityColor}; border:1px solid ${integrityColor}40;">🟢 數據已核實</div>
            </div>
        </div>
        <div class="tdc-flex gap-2 mt-3">
            <button class="btn-card-action ${isWinner?'btn-record-win':''}" onclick="recordTx(${idx})">記帳</button>
            <button class="btn-card-action btn-manual-adjust" onclick="openManualAdjust(${idx})">修正</button>
        </div>`;
        con.appendChild(div);
    });

    const linksContainer = document.getElementById('airline-links-container');
    if (linksContainer) {
        linksContainer.innerHTML = `
            <a href="https://www.evaair.com/" target="_blank" class="btn-airline-link">長榮</a>
            <a href="https://www.china-airlines.com/" target="_blank" class="btn-airline-link">華航</a>
            <a href="https://www.cathaypacific.com/" target="_blank" class="btn-airline-link">國泰</a>
            <a href="https://www.ana.co.jp/" target="_blank" class="btn-airline-link">ANA</a>
            <a href="https://www.ana.co.jp/zh-tw/amc/reference/tux/staralliance/" target="_blank" class="btn-airline-link">ANA 換星盟</a>
        `;
        linksContainer.style.display = (list && list.length > 0) ? 'flex' : 'none';
    }
}
