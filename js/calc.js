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
    
    currentResults.sort((a, b) => Math.abs(b.miles) - Math.abs(a.miles));

    renderResults(currentResults);
    const targetVal = document.getElementById('redemption-target').value;
    const isRefund = currentResults.length > 0 && currentResults[0].twdBase < 0;
    const advice = getTacticalCardAdvice(currentResults, targetVal, isRefund);
    renderTacticalAdvice(advice);
}

// ==========================================
// 戰術主攻建議決策系統 (終極版)
// ==========================================

function getCardPoolInfo(cardId) {
    const id = (cardId || '').toLowerCase();
    if (id.includes('taishin_cx')) return { pool: 'CX', name: '國泰體系', type: 'DIRECT' };
    if (id.includes('ctbc_ci')) return { pool: 'CI', name: '華航體系', type: 'DIRECT' };
    if (id.includes('hsbc_inf')) return { pool: 'TRANSFER', name: '可轉點池', type: 'TRANSFER_FLEX' }; 
    if (id.includes('hsbc_live')) return { pool: 'TRANSFER_OTHER', name: 'Live+點數', type: 'TRANSFER_OTHER' }; 
    return { pool: 'OTHER', name: '其他體系', type: 'OTHER' };
}

function checkSpecialScenario(card) {
    const id = (card.id || '').toLowerCase();
    const note = card.note || '';
    if (id.includes('taishin_cx') && note.includes('越飛有哩')) return '越飛越有哩特例';
    if (['ctbc_ci_inf', 'ctbc_ci'].includes(id) && note.includes('華航官網')) return '華航官網特例';
    if (['ctbc_ci_inf', 'ctbc_ci'].includes(id) && note.includes('生日')) return '生日倍數加碼';
    if (['ctbc_ci_inf', 'ctbc_ci'].includes(id) && note.includes('訂房平台')) return '訂房平台特例';
    if (id.includes('hsbc_live') && note.includes('亞洲七國')) return 'Live+亞洲七國';
    if (id.includes('hsbc_live') && note.includes('精選')) return 'Live+精選通路';
    return null;
}

function evaluatePoolStatus(targetCode) {
    if (!targetCode || ['ALL', 'NONE', 'MIXED', 'AM_BR'].includes(targetCode)) return 'UNKNOWN';
    try {
        const db = typeof loadDB === 'function' ? loadDB() : null;
        if (!db || !db.warehouse || !Array.isArray(db.warehouse)) return 'UNKNOWN';

        let normalizedTarget = targetCode;
        if (targetCode === 'AM' || targetCode === 'ASIAMILES') {
            normalizedTarget = 'CX';
        }

        const exactMatches = {
            'CI': ['CI'],
            'CX': ['CX', 'AM'],
            'BR': ['BR']
        };

        const includesMatches = {
            'CI': ['CHINA AIRLINES', '華航', '中華航空'],
            'CX': ['CATHAY PACIFIC', '國泰', '國泰航空', '亞萬', 'ASIA MILES'],
            'BR': ['EVA AIR', '長榮', '長榮航空']
        };

        const targetAsset = db.warehouse.find(a => {
            if (!a) return false;
            const aName = (a.airline || a.name || '').toUpperCase().trim();
            
            const exactList = exactMatches[normalizedTarget] || [normalizedTarget];
            const includesList = includesMatches[normalizedTarget] || [];

            const matchExact = exactList.some(alias => aName === alias);
            const matchIncludes = includesList.some(alias => aName.includes(alias));
            
            return matchExact || matchIncludes;
        });

        if (!targetAsset) return 'UNKNOWN';

        const rawVal = targetAsset.amount ?? targetAsset.current ?? 0;
        const currentMiles = parseInt(rawVal, 10) || 0;
        
        if (currentMiles < 25000) return 'WEAK';
        return 'HEALTHY';

    } catch (e) {
        return 'UNKNOWN';
    }
}

function getTacticalCardAdvice(results, target, isRefund) {
    if (!results || results.length === 0 || isRefund || results[0].miles <= 0) {
        return null;
    }

    const topCard = results[0];
    const topMiles = topCard.miles;

    // 1. 目標解析
    let targetPool = 'NONE';
    let targetName = '無明確目標';
    if (target === 'CI') { targetPool = 'CI'; targetName = '華航體系'; }
    else if (target === 'CX' || target === 'AM' || target === 'ASIAMILES') { targetPool = 'CX'; targetName = '國泰體系'; }
    else if (target === 'BR' || target === 'EVA') { targetPool = 'BR'; targetName = '長榮體系'; }
    else if (target === 'AM_BR') { targetPool = 'MIXED'; targetName = '雙目標(亞萬/長榮)'; }

    // 2. 篩選候選清單 (容忍帶 3%)
    const candidates = results.filter(c => c.miles >= topMiles * 0.97 && c.miles > 0);
    const poolStatus = evaluatePoolStatus(targetPool);

    // 3. 特例優先判定 (Fast Path)
    const specialScenario = checkSpecialScenario(topCard);
    if (specialScenario) {
        const poolInfo = getCardPoolInfo(topCard.id);
        return {
            targetPool: poolInfo.type === 'TRANSFER_FLEX' ? '可轉點池' : poolInfo.name,
            primaryCard: topCard.name,
            strategyReason: `此筆命中「${specialScenario}」，具備絕對回饋優勢，建議直接以此卡集中火力。`,
            warning: topCard.isWarning ? "注意：此筆消費將超出該卡回饋上限" : null,
            confidence: 'HIGH'
        };
    }

    // 4. 多維評分模型
    const scoredCandidates = candidates.map(c => {
        let score = (c.miles / topMiles) * 100; // 基礎客觀回饋分 (97~100)
        const poolInfo = getCardPoolInfo(c.id);
        
        const isDirectMatch = (poolInfo.pool === targetPool && !['NONE', 'MIXED'].includes(targetPool));
        const isFlexTransfer = (poolInfo.type === 'TRANSFER_FLEX');

        const tags = { isDirectMatch, isFlexTransfer, weakBoost: false };

        if (['NONE', 'MIXED'].includes(targetPool)) {
            if (isFlexTransfer) score += 50; // 無目標時加權高彈性資產
        } else {
            if (isDirectMatch) {
                score += 30; // 基礎目標一致性
                if (poolStatus === 'WEAK') {
                    score += 60; // 弱池直補加權 (可壓過彈性)
                    tags.weakBoost = true;
                }
            } else if (isFlexTransfer) {
                score += 40; // 彈性價值大於非弱池直補
                if (poolStatus === 'UNKNOWN') score += 10; // 資訊不足時偏向保守彈性
            }
        }

        return { card: c, score, poolInfo, tags };
    });

    // 排序取得戰術最佳解
    scoredCandidates.sort((a, b) => b.score - a.score);
    const winner = scoredCandidates[0];
    const advisedCard = winner.card;
    const finalPoolName = winner.poolInfo.type === 'TRANSFER_FLEX' ? '可轉點池' : winner.poolInfo.name;

    // 5. 動態決策摘要產出
    let strategyReason = '';
    let confidence = 'MEDIUM';
    const hasDirectRival = scoredCandidates.some(x => x.tags.isDirectMatch && x.card.id !== advisedCard.id);

    if (['NONE', 'MIXED'].includes(targetPool)) {
        if (winner.tags.isFlexTransfer) {
            strategyReason = `在無單一明確目標下，此筆累積高彈性點數的回饋屬第一梯隊。優先保留 1:1 兌換靈活性，避免提早鎖死單一航司。`;
        } else {
            strategyReason = `目前無單一明確直補目標，且容忍帶內無高彈性卡片候選。建議依循最高客觀回饋率集中。`;
            confidence = 'LOW';
        }
    } else {
        if (winner.tags.isDirectMatch && winner.tags.weakBoost) {
            strategyReason = `此筆回饋落在第一梯隊，且【${targetName}】庫存目前偏弱；直補聯名池能更快拉高可用基數，因此本次優先判定直補。`;
            confidence = 'HIGH';
        } else if (winner.tags.isFlexTransfer && hasDirectRival) {
            strategyReason = `此筆與聯名卡回饋極近，且點數具 1:1 兌換彈性；目前【${targetName}】未見迫切直補需求，因此本次不先鎖定聯名池，保留後續轉向選擇權。`;
        } else if (winner.tags.isDirectMatch) {
            strategyReason = `此筆回饋具優勢且直擊兌換目標（${targetName}），在無其他高彈性替代方案下，集中累積效率最高。`;
            confidence = 'HIGH';
        } else if (winner.tags.isFlexTransfer) {
            strategyReason = `候選名單中無直接對應目標的強勢聯名卡。建議優先累積高彈性池，保留後續 1:1 轉入${targetName}的空間。`;
        } else {
            strategyReason = `此筆在客觀回饋上具備明顯優勢，差距足以抵銷跨池彈性考量，建議暫時妥協順應卡片特性集中。`;
        }
    }

    return {
        targetPool: finalPoolName,
        primaryCard: advisedCard.name,
        strategyReason: strategyReason,
        warning: advisedCard.isWarning ? "注意：此筆消費將超出該卡回饋上限" : null,
        confidence: confidence
    };
}

function renderTacticalAdvice(adviceObj) {
    const container = document.getElementById('tactical-advice-container');
    if (!container) return;

    if (!adviceObj) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    let poolText = adviceObj.targetPool === '可轉點池' ? '建議先累積：匯豐點數' : `建議先補：【${escapeHTML(adviceObj.targetPool)}】`;

    let confidenceHtml = '';
    if (adviceObj.confidence) {
        let confMap = { 'HIGH': '高', 'MEDIUM': '中', 'LOW': '保守' };
        let confColorMap = { 'HIGH': '#10b981', 'MEDIUM': '#6b7280', 'LOW': '#f59e0b' };
        let confText = confMap[adviceObj.confidence] || '中';
        let confColor = confColorMap[adviceObj.confidence] || '#6b7280';
        confidenceHtml = `<span class="badge ms-2" style="background-color: ${confColor}15; color: ${confColor}; border: 1px solid ${confColor}40; font-size: 0.75rem; font-weight: normal; vertical-align: middle;">判斷信心：${confText}</span>`;
    }

    let html = `
        <div class="card-box tdc-mb-3 p-3 shadow-sm" style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px solid #86efac; border-radius: 16px;">
            <div class="tdc-flex tdc-align-center tdc-mb-2">
                <svg class="lucide me-1 text-success"><use href="#icon-sparkle"/></svg>
                <h6 class="fw-bold tdc-m-0 text-success tdc-flex tdc-align-center">戰術主攻建議${confidenceHtml}</h6>
            </div>
            <div class="fw-bold text-dark" style="font-size: 1.05rem;">🎯 ${poolText}</div>
            <div class="fw-bold text-dark mt-1" style="font-size: 0.95rem;">💳 主攻卡片：${escapeHTML(adviceObj.primaryCard)}</div>
            <div class="small text-secondary mt-2">💡 理由：${escapeHTML(adviceObj.strategyReason)}</div>
    `;

    if (adviceObj.warning) {
        html += `<div class="small bg-white p-2 rounded-3 border border-warning text-danger fw-bold mt-2">🚨 ${escapeHTML(adviceObj.warning)}</div>`;
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

        let shortHint = '';
        if (c.id === 'taishin_cx' && c.note.includes('越飛有哩')) {
            shortHint = '<div class="mt-2 px-2 py-2 rounded-3" style="font-size:0.78rem; line-height:1.5; color:#9a6700; background:#fff7d6; border:1px solid #f3d98b; font-weight:700;">⚠️ 已依越飛越有哩資格試算；請再確認台幣、台灣出發、非套票/獎勵票、非行動支付等條件。</div>';
        } else if (['ctbc_ci_inf', 'ctbc_ci'].includes(c.id) && c.note.includes('生日')) {
            shortHint = '<div class="mt-2 px-2 py-2 rounded-3" style="font-size:0.78rem; line-height:1.5; color:#9a6700; background:#fff7d6; border:1px solid #f3d98b; font-weight:700;">⚠️ 中信生日加碼需先登錄，且仍須符合海外實體等活動條件；是否回饋以銀行入帳與活動認定為準。</div>';
        } else if (['ctbc_ci_inf', 'ctbc_ci'].includes(c.id) && c.note.includes('訂房平台')) {
            shortHint = '<div class="mt-2 px-2 py-2 rounded-3" style="font-size:0.78rem; line-height:1.5; color:#9a6700; background:#fff7d6; border:1px solid #f3d98b; font-weight:700;">⚠️ 中信指定訂房平台加碼需為國外訂房，且帳單同時列示國外交易手續費；不是只要刷到訂房平台就一定適用。</div>';
        } else if (['ctbc_ci_inf', 'ctbc_ci'].includes(c.id) && (c.note.includes('海外') || c.note.includes('生日海外實體'))) {
            shortHint = '<div class="mt-2 px-2 py-2 rounded-3" style="font-size:0.78rem; line-height:1.5; color:#9a6700; background:#fff7d6; border:1px solid #f3d98b; font-weight:700;">⚠️ 中信海外加碼僅限海外實體面對面交易；網購、條碼、第三方支付通常不適用。海外實體店面現場使用 Apple Pay / Google Pay / Samsung Pay 可能適用。</div>';
        }

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
                ${shortHint}
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
}

function initToggleConfirms() {
    const flyModeCheckbox = document.getElementById('flyMode');
    const birthdayModeCheckbox = document.getElementById('birthdayMode');

    if (flyModeCheckbox && !flyModeCheckbox.dataset.confirmBound) {
        flyModeCheckbox.dataset.confirmBound = '1';
        flyModeCheckbox.addEventListener('change', function() {
            if (this.checked) {
                const msg = "請先確認符合以下條件，再開啟「越飛越有哩」：\n\n" +
                            "1. 國泰官網購票\n" +
                            "• 需為國泰航空台灣官網或指定客服中心訂票\n" +
                            "• 需為新台幣付款\n" +
                            "• 需為從台灣出發的付費機票\n" +
                            "• 不適用套票、獎勵機票\n" +
                            "• 不適用國泰 App 搭配 Apple Pay、Google 錢包等行動支付付款\n\n" +
                            "2. 指定消費類別\n" +
                            "• 海外實體商店\n" +
                            "• 指定訂房網站：Agoda、Booking、Expedia、Hotels.com\n" +
                            "• 旅遊體驗：KKday、Klook\n" +
                            "• 免稅商店：昇恆昌、采盟、海外實體免稅商店\n\n" +
                            "3. 付款方式限制\n" +
                            "• 若使用 Apple Pay、Google 錢包、LINE Pay、街口、Pi 錢包、PayPal、Fami Pay、icash Pay、悠遊付、QR code 掃碼等付款方式，通常不適用\n\n" +
                            "4. 其他活動資格\n" +
                            "• 若活動另有資格要求（例如自動扣繳等），也請自行確認符合\n\n" +
                            "若不確定是否符合，請按「取消」，系統會先按一般回饋計算。";
                
                if (!confirm(msg)) {
                    this.checked = false;
                }
            }
            if (typeof calculate === 'function') {
                calculate();
            }
        });
    }

    if (birthdayModeCheckbox && !birthdayModeCheckbox.dataset.confirmBound) {
        birthdayModeCheckbox.dataset.confirmBound = '1';
        birthdayModeCheckbox.addEventListener('change', function() {
            if (this.checked) {
                const msg = "請先確認符合以下條件，再開啟「生日月」：\n\n" +
                            "1. 請先自行確認該卡生日月加碼活動目前有效\n" +
                            "2. 若活動需要登錄，請先完成登錄\n" +
                            "3. 若活動有卡等、身分、期間或其他限制，也請自行確認符合\n" +
                            "4. 若活動限定海外實體、指定通路或特定付款方式，需同時符合\n" +
                            "5. 實際回饋仍以銀行最終入帳資料與活動規則認定為準\n\n" +
                            "若不確定是否符合，請按「取消」，系統會先按一般回饋計算。";
                
                if (!confirm(msg)) {
                    this.checked = false;
                }
            }
            if (typeof calculate === 'function') {
                calculate();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', initToggleConfirms);
