/* ==========================================
   倉庫管理 2.0 (三位一體) & 兌換試算
   ========================================== */

function renderWarehouse() {
    const db = loadDB(); const con = document.getElementById('warehouse-list'); if(!con) return; con.innerHTML = '';
    const chkCon = document.getElementById('planner-asset-container'); if(chkCon) chkCon.innerHTML = '';

    db.warehouse.forEach((item, idx) => {
        if (!item || typeof item !== 'object') return;
        let miles = 0; let displaySubText = '';

        if(item.type === 'transfer') {
            let uPts = Number(item.unitPoints); if(isNaN(uPts) || uPts === 0) uPts = 1;
            let uMiles = Number(item.unitMiles) || 0;
            let bReq = Number(item.bonusReq) || 0;
            let bGive = Number(item.bonusGive) || 0;
            let cur = Number(item.current) || 0;

            let baseMiles = Math.trunc(cur * (uMiles/uPts));
            let bonusMiles = (bReq > 0) ? Math.trunc(cur / bReq) * bGive : 0;
            miles = baseMiles + bonusMiles;

            let partnerInfo = '';
            const tConf = getTransferPartnersConfig()[item.name];
            if (tConf) {
                const pCount = Array.isArray(tConf.supported_partners) ? tConf.supported_partners.length : 0;
                const rText = tConf.ratio_text ? escapeHTML(tConf.ratio_text) : '';
                partnerInfo = `<div class="tdc-text-end text-muted" style="font-size:0.7rem; margin-top:4px;">支援 ${pCount} 家夥伴 | ${rText}</div>`;
            }

            displaySubText = `<div class="tdc-text-end text-success fw-bold small mt-1">≅ ${miles.toLocaleString()} 哩</div>${partnerInfo}`;
        } else if(item.type === 'airline') {
            miles = Number(item.current) || 0;
        } else if(item.type === 'raw') {
            miles = 0; displaySubText = `<div class="tdc-text-end text-muted fw-bold small mt-1">⚠️ 通用積分 (不參與 AI 換算)</div>`;
        }

        const safeName = (typeof item.name === 'string' && item.name.trim() !== '') ? item.name.trim() : '未命名資產';

        con.innerHTML += `
        <div class="airline-group-card tdc-mb-3">
            <div class="airline-header">
                <div class="fw-bold fs-5 text-primary-dark">${escapeHTML(safeName)}</div>
                <button class="btn btn-sm btn-outline-danger rounded-circle p-1 tdc-flex" onclick="delWarehouseAsset(${idx})"><svg class="lucide" style="width:14px;height:14px;"><use href="#icon-trash"/></svg></button>
            </div>
            <div class="p-3 bg-white">
                <div class="tdc-flex tdc-justify-between tdc-align-center">
                    <div class="text-muted small">${item.type==='transfer'?'換算試算池':item.type==='raw'?'靜態通用點數':'航空哩程'}</div>
                    <div class="fs-4 fw-bold font-hand text-dark">${(Number(item.current)||0).toLocaleString()}</div>
                </div>
                ${displaySubText}
            </div>
        </div>`;

        const safeType = ['raw', 'airline', 'transfer'].includes(item.type) ? item.type : 'raw';
        if(chkCon && safeType !== 'raw') {
            const isChecked = plannerSelectedAssets.has(idx) ? 'checked' : '';
            chkCon.innerHTML += `<label class="switch-group tdc-mb-2"><span class="switch-label text-dark">${escapeHTML(safeName)} <small class="text-secondary">(${miles.toLocaleString()}哩)</small></span><input class="form-check-input" type="checkbox" onchange="togglePlannerAsset(${idx}, this.checked)" ${isChecked}></label>`;
        }
    });
    if(db.warehouse.length === 0) { con.innerHTML = '<div class="tdc-text-center py-5 text-muted font-hand fw-bold">倉庫空空如也</div>'; }
}

function addNativeAsset() {
    const name = document.getElementById('native-airline-name').value.trim(); const qty = parseInt(document.getElementById('native-current').value);
    if(!name || isNaN(qty) || qty <= 0) return showCustomAlert('請填寫完整資訊');
    const db = loadDB();
    let exactAsset = db.warehouse.find(a => a && typeof a === 'object' && a.type === 'airline' && a.targetAirline === name);
    if (!exactAsset) {
        let similarAsset = db.warehouse.find(a => a && typeof a === 'object' && a.type === 'airline' && typeof a.targetAirline === 'string' && (a.targetAirline.includes(name) || name.includes(a.targetAirline)));
        if (similarAsset && confirm(`系統偵測到相似的航空資產「${similarAsset.targetAirline}」，是否要進行歸戶合併？\n(若選取消，將建立獨立新帳戶)`)) exactAsset = similarAsset;
    }
    if(!exactAsset) { exactAsset = { type: 'airline', targetAirline: name, name: name, current: 0, unitPoints: 1, unitMiles: 1, bonusReq:0, bonusGive:0 }; db.warehouse.push(exactAsset); }
    exactAsset.current = (Number(exactAsset.current) || 0) + qty; saveDB(db);
    clearInput('native-airline-name'); clearInput('native-current'); renderWarehouse(); showCustomAlert('✅ 航空哩程存入成功！');
}

function addRawAsset() {
    const name = document.getElementById('raw-point-name').value.trim(); const qty = parseInt(document.getElementById('raw-point-current').value);
    if(!name || isNaN(qty) || qty <= 0) return showCustomAlert('請填寫完整資訊');
    const db = loadDB(); let asset = db.warehouse.find(a => a && typeof a === 'object' && a.type === 'raw' && a.name === name);
    if(!asset) { asset = { type: 'raw', targetAirline: '無', name: name, current: 0, unitPoints: 1, unitMiles: 1, bonusReq:0, bonusGive:0 }; db.warehouse.push(asset); }
    asset.current = (Number(asset.current) || 0) + qty; saveDB(db);
    clearInput('raw-point-name'); clearInput('raw-point-current'); renderWarehouse(); showCustomAlert('✅ 通用積分存入成功！');
}

function addTransferAsset() {
    const name = document.getElementById('trans-source-name').value.trim();
    const rawQty = Number(document.getElementById('trans-current').value);
    const tgt = document.getElementById('trans-target-airline').value.trim();
    const uPts = parseFloat(document.getElementById('trans-unit-points').value);
    const uMis = parseFloat(document.getElementById('trans-unit-miles').value);

    const rawBonusReq = document.getElementById('trans-bonus-req').value;
    const rawBonusGive = document.getElementById('trans-bonus-give').value;
    let bonusReq = parseFloat(rawBonusReq);
    let bonusGive = parseFloat(rawBonusGive);

    if(!name || !tgt || isNaN(uPts) || uPts <= 0 || isNaN(uMis) || uMis <= 0) {
        return showCustomAlert('請填寫完整的轉出資訊，且兌換比例必須大於 0！');
    }
    if(!Number.isInteger(rawQty) || rawQty <= 0) {
        return showCustomAlert('❌ 轉出數量必須為大於 0 的正整數！');
    }

    const hasBonusReq = rawBonusReq.trim() !== '';
    const hasBonusGive = rawBonusGive.trim() !== '';
    if(hasBonusReq || hasBonusGive) {
        if(!hasBonusReq || !hasBonusGive || isNaN(bonusReq) || isNaN(bonusGive) || bonusReq <= 0 || bonusGive <= 0 || !Number.isInteger(bonusReq) || !Number.isInteger(bonusGive)) {
            return showCustomAlert('❌ 額外轉換加碼設定錯誤！必須同時填寫「每滿」與「加贈」，且皆須為大於 0 的有效正整數。');
        }
    }

    const qty = rawQty;
    const db = loadDB();

    const rawNormName = normalizeStr(name);
    const SOURCE_ALIAS_MAP = {
        [normalizeStr('匯豐旅人')]: '匯豐 旅人積分',
        [normalizeStr('匯豐旅人積分')]: '匯豐 旅人積分',
        [normalizeStr('匯豐Live+')]: '匯豐Live+積分',
        [normalizeStr('匯豐Live+積分')]: '匯豐Live+積分'
    };

    let finalSourceName = SOURCE_ALIAS_MAP[rawNormName] || name;
    let finalNormSourceName = normalizeStr(finalSourceName);

    let sourceAsset = db.warehouse.find(a => a && typeof a === 'object' && (a.type === 'transfer' || a.type === 'raw') && a.name === finalSourceName);
    if(!sourceAsset) {
        sourceAsset = db.warehouse.find(a => a && typeof a === 'object' && (a.type === 'transfer' || a.type === 'raw') && normalizeStr(a.name) === finalNormSourceName);
    }

    if(!sourceAsset) {
        return showCustomAlert(`❌ 找不到名為「${name}」的可扣除來源資產，請先確認倉庫內是否已有此項目。`);
    }

    let currentBalance = Number(sourceAsset.current) || 0;
    if(currentBalance < qty) {
        return showCustomAlert(`❌ 轉出失敗！「${sourceAsset.name || name}」餘額不足 (目前餘額僅: ${currentBalance.toLocaleString()})`);
    }

    let baseMiles = Math.trunc(qty * (uMis / uPts));
    let bonusMilesCalc = (hasBonusReq && hasBonusGive) ? Math.trunc(qty / bonusReq) * bonusGive : 0;
    let totalAcquiredMiles = baseMiles + bonusMilesCalc;

    if (totalAcquiredMiles <= 0) {
        return showCustomAlert('❌ 依目前轉換比例，本次轉出實得哩程為 0，操作已自動取消。');
    }

    sourceAsset.current = currentBalance - qty;

    const rawNormTgt = normalizeStr(tgt);
    let finalTgtStr = tgt;

    const TARGET_ALIAS_MAP = {
        [normalizeStr('華航')]: '中華航空',
        [normalizeStr('中華航空')]: '中華航空',
        [normalizeStr('國泰')]: '國泰航空',
        [normalizeStr('國泰航空')]: '國泰航空',
        [normalizeStr('亞萬')]: '國泰航空',
        [normalizeStr('亞洲萬里通')]: '國泰航空',
        [normalizeStr('國泰航空(亞洲萬里通)')]: '國泰航空',
        [normalizeStr('長榮')]: '長榮航空',
        [normalizeStr('長榮航空')]: '長榮航空'
    };

    if (TARGET_ALIAS_MAP[rawNormTgt]) {
        finalTgtStr = TARGET_ALIAS_MAP[rawNormTgt];
    }

    let targetAsset = db.warehouse.find(a => a && typeof a === 'object' && a.type === 'airline' && a.targetAirline === finalTgtStr);
    if (!targetAsset) {
        const finalNormTgt = normalizeStr(finalTgtStr);
        targetAsset = db.warehouse.find(a => a && typeof a === 'object' && a.type === 'airline' && normalizeStr(a.targetAirline) === finalNormTgt);
        if (!targetAsset) {
            targetAsset = db.warehouse.find(a => a && typeof a === 'object' && a.type === 'airline' && typeof a.targetAirline === 'string' && (normalizeStr(a.targetAirline).includes(finalNormTgt) || finalNormTgt.includes(normalizeStr(a.targetAirline))));
        }
    }

    let finalTargetName = finalTgtStr;
    if (!targetAsset) {
        targetAsset = { type: 'airline', targetAirline: finalTargetName, name: finalTargetName, current: 0, unitPoints: 1, unitMiles: 1, bonusReq: 0, bonusGive: 0 };
        db.warehouse.push(targetAsset);
    } else {
        finalTargetName = targetAsset.targetAirline || targetAsset.name || finalTgtStr;
    }

    targetAsset.current = (Number(targetAsset.current) || 0) + totalAcquiredMiles;

    saveDB(db);
    clearInput('trans-source-name');
    clearInput('trans-current');
    clearInput('trans-target-airline');
    clearInput('trans-unit-points');
    clearInput('trans-unit-miles');
    clearInput('trans-bonus-req');
    clearInput('trans-bonus-give');

    renderWarehouse();
    showCustomAlert(`✅ 轉點成功！\n已從「${sourceAsset.name || name}」扣除 ${qty.toLocaleString()} 點\n「${finalTargetName}」增加 ${totalAcquiredMiles.toLocaleString()} 哩`);
}

function delWarehouseAsset(idx) {
    if(confirm('確定要刪除這筆資產嗎？')) {
        const db = loadDB(); db.warehouse.splice(idx, 1);
        const newSet = new Set(); plannerSelectedAssets.forEach(val => { if (val < idx) newSet.add(val); else if (val > idx) newSet.add(val - 1); });
        plannerSelectedAssets = newSet; saveDB(db); renderWarehouse();
    }
}

function togglePlannerAsset(idx, isChecked) { if(isChecked) plannerSelectedAssets.add(idx); else plannerSelectedAssets.delete(idx); runPlannerCalc(); }

function togglePlannerTrip() {
    const isRt = document.getElementById('planner-trip-type').checked;
    document.getElementById('trip-label').innerText = isRt ? '來回 (Round-trip)' : '單程 (One-way)';
    runPlannerCalc();
}

function runPlannerCalc() {
    const to = document.getElementById('planner-to').value;
    const isRt = document.getElementById('planner-trip-type').checked;
    const cls = document.getElementById('planner-class').value;

    let baseMiles = 10000;
    switch(to) {
        case 'TW': baseMiles = 5000; break;
        case 'HK_MO': baseMiles = 10000; break;
        case 'CN': baseMiles = 15000; break;
        case 'NE_ASIA': baseMiles = 10000; break;
        case 'SE_ASIA': baseMiles = 15000; break;
        case 'S_ASIA': baseMiles = 25000; break;
        case 'OCEANIA': baseMiles = 30000; break;
        case 'NA_W': case 'NA_E': case 'EU': baseMiles = 35000; break;
        case 'AFRICA': baseMiles = 40000; break;
        case 'S_AMERICA': baseMiles = 55000; break;
    }
    if (cls === 'C') baseMiles *= 2; if (cls === 'F') baseMiles *= 3; if (isRt) baseMiles *= 2;

    let html = `
        <div class="p-3 tdc-text-center mt-3" style="background: transparent; border: 2px dashed #cbd5e1; border-radius: 16px;">
            <div class="text-muted small fw-bold tdc-mb-1"><svg class="lucide me-1"><use href="#icon-plane"/></svg>區域制基礎估算 (非正式標準)</div>
            <div class="fs-3 fw-bold text-secondary font-hand opacity-75">${baseMiles.toLocaleString()} <small class="fs-6">哩</small></div>
            <div class="small mt-2" style="color: #64748b; line-height: 1.5;">⚠️ 此僅為粗略暖身估算，實際需求受聯盟兌換表與淡旺季影響。<br><strong class="text-primary">請點擊上方「AI 雙引擎」取得精確戰報與補血策略。</strong></div>
        </div>
    `;
    document.getElementById('planner-results-container').innerHTML = html;
}
