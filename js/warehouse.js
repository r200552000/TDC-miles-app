/* ==========================================
   倉庫管理 2.0 (三位一體) & 兌換試算
   ========================================== */

// ==========================================
// Fallback：若 utils.js 尚未成功載入 recomputeAssetCurrent
// 則在此提供後備版本，避免新增資產流程失效
// ==========================================
if (typeof recomputeAssetCurrent !== 'function') {
    function recomputeAssetCurrent(asset) {
        if (!asset || typeof asset !== 'object') return;

        if (!Array.isArray(asset.batches)) {
            asset.current = Number(asset.current) || 0;
            return;
        }

        let total = 0;

        asset.batches.forEach(batch => {
            if (!batch || typeof batch !== 'object') return;

            let amt = Number(batch.amount);
            if (isNaN(amt)) amt = 0;

            if (batch.direction === 'in') {
                total += Math.abs(amt);
            } else if (batch.direction === 'out') {
                total -= Math.abs(amt);
            }
        });

        asset.current = total;
    }
}

// ==========================================
// 航司 canonical / alias map
// 只用於 type === 'airline'
// ==========================================
const AIRLINE_ALIAS_MAP = {
    [normalizeStr('長榮')]: '長榮航空',
    [normalizeStr('長榮航空')]: '長榮航空',
    [normalizeStr('立榮')]: '長榮航空',
    [normalizeStr('立榮航空')]: '長榮航空',
    [normalizeStr('無限萬哩遊')]: '長榮航空',
    [normalizeStr('infinity mileagelands')]: '長榮航空',
    [normalizeStr('eva')]: '長榮航空',
    [normalizeStr('br')]: '長榮航空',

    [normalizeStr('國泰')]: '國泰航空',
    [normalizeStr('國泰航空')]: '國泰航空',
    [normalizeStr('亞洲萬里通')]: '國泰航空',
    [normalizeStr('亞萬')]: '國泰航空',
    [normalizeStr('asiamiles')]: '國泰航空',
    [normalizeStr('asia miles')]: '國泰航空',
    [normalizeStr('cathay')]: '國泰航空',
    [normalizeStr('cx')]: '國泰航空',

    [normalizeStr('新航')]: '新加坡航空',
    [normalizeStr('新加坡航空')]: '新加坡航空',
    [normalizeStr('勝安航空')]: '新加坡航空',
    [normalizeStr('酷航')]: '新加坡航空',
    [normalizeStr('krisflyer')]: '新加坡航空',
    [normalizeStr('sq')]: '新加坡航空',

    [normalizeStr('日航')]: '日本航空',
    [normalizeStr('日本航空')]: '日本航空',
    [normalizeStr('jal')]: '日本航空',
    [normalizeStr('jal mileage bank')]: '日本航空',
    [normalizeStr('jl')]: '日本航空',

    [normalizeStr('全日空')]: '全日空',
    [normalizeStr('全日空航空')]: '全日空',
    [normalizeStr('ana')]: '全日空',
    [normalizeStr('ana mileage club')]: '全日空',
    [normalizeStr('nh')]: '全日空',

    [normalizeStr('亞航')]: '亞航',
    [normalizeStr('airasia')]: '亞航',
    [normalizeStr('airasia rewards')]: '亞航',

    [normalizeStr('阿聯酋')]: '阿聯酋航空',
    [normalizeStr('阿聯酋航空')]: '阿聯酋航空',
    [normalizeStr('skywards')]: '阿聯酋航空',
    [normalizeStr('emirates')]: '阿聯酋航空',
    [normalizeStr('ek')]: '阿聯酋航空',

    [normalizeStr('加航')]: '加拿大航空',
    [normalizeStr('加拿大航空')]: '加拿大航空',
    [normalizeStr('aeroplan')]: '加拿大航空',
    [normalizeStr('air canada')]: '加拿大航空',
    [normalizeStr('ac')]: '加拿大航空',

    [normalizeStr('哥倫比亞航空')]: '哥倫比亞航空',
    [normalizeStr('lifemiles')]: '哥倫比亞航空',
    [normalizeStr('avianca')]: '哥倫比亞航空',
    [normalizeStr('av')]: '哥倫比亞航空',

    [normalizeStr('法航')]: '法航荷航藍天飛行',
    [normalizeStr('荷航')]: '法航荷航藍天飛行',
    [normalizeStr('法航與荷航')]: '法航荷航藍天飛行',
    [normalizeStr('藍天飛行')]: '法航荷航藍天飛行',
    [normalizeStr('flying blue')]: '法航荷航藍天飛行',
    [normalizeStr('air france')]: '法航荷航藍天飛行',
    [normalizeStr('klm')]: '法航荷航藍天飛行',

    [normalizeStr('海南航空')]: '海南航空',
    [normalizeStr('金鵬俱樂部')]: '海南航空',
    [normalizeStr('fortuna')]: '海南航空',
    [normalizeStr('hainan airlines')]: '海南航空',
    [normalizeStr('hu')]: '海南航空',

    [normalizeStr('澳航')]: '澳洲航空',
    [normalizeStr('澳洲航空')]: '澳洲航空',
    [normalizeStr('qantas')]: '澳洲航空',
    [normalizeStr('qantas frequent flyer')]: '澳洲航空',
    [normalizeStr('qf')]: '澳洲航空',

    [normalizeStr('卡達')]: '卡達航空',
    [normalizeStr('卡達航空')]: '卡達航空',
    [normalizeStr('貴賓俱樂部')]: '卡達航空',
    [normalizeStr('privilege club')]: '卡達航空',
    [normalizeStr('avios')]: '卡達航空',
    [normalizeStr('qr')]: '卡達航空',

    [normalizeStr('聯合航空')]: '聯合航空',
    [normalizeStr('前程萬里')]: '聯合航空',
    [normalizeStr('前程萬里飛行計劃')]: '聯合航空',
    [normalizeStr('mileageplus')]: '聯合航空',
    [normalizeStr('united')]: '聯合航空',
    [normalizeStr('ua')]: '聯合航空',

    [normalizeStr('越南航空')]: '越南航空',
    [normalizeStr('微笑蓮花')]: '越南航空',
    [normalizeStr('lotusmiles')]: '越南航空',
    [normalizeStr('vn')]: '越南航空',

    [normalizeStr('土耳其航空')]: '土耳其航空',
    [normalizeStr('miles&smiles')]: '土耳其航空',
    [normalizeStr('miles and smiles')]: '土耳其航空',
    [normalizeStr('turkish airlines')]: '土耳其航空',
    [normalizeStr('tk')]: '土耳其航空',

    [normalizeStr('華航')]: '中華航空',
    [normalizeStr('中華航空')]: '中華航空',
    [normalizeStr('華信')]: '中華航空',
    [normalizeStr('華信航空')]: '中華航空',
    [normalizeStr('華夏哩程')]: '中華航空',
    [normalizeStr('華夏哩程酬賓計劃')]: '中華航空',
    [normalizeStr('china airlines')]: '中華航空',
    [normalizeStr('ci')]: '中華航空'
};

// ==========================================
// transfer / raw 匯豐來源池 alias map
// ==========================================
const TRANSFER_SOURCE_ALIAS_MAP = {
    [normalizeStr('匯豐旅人')]: '匯豐 旅人積分',
    [normalizeStr('匯豐 旅人')]: '匯豐 旅人積分',
    [normalizeStr('匯豐旅人積分')]: '匯豐 旅人積分',
    [normalizeStr('hsbc旅人')]: '匯豐 旅人積分',
    [normalizeStr('hsbc 旅人')]: '匯豐 旅人積分',
    [normalizeStr('hsbc旅人積分')]: '匯豐 旅人積分',
    [normalizeStr('旅人積分')]: '匯豐 旅人積分',

    [normalizeStr('匯豐live+')]: '匯豐Live+積分',
    [normalizeStr('匯豐 live+')]: '匯豐Live+積分',
    [normalizeStr('匯豐live+積分')]: '匯豐Live+積分',
    [normalizeStr('hsbc live+')]: '匯豐Live+積分',
    [normalizeStr('hsbc live+積分')]: '匯豐Live+積分',
    [normalizeStr('live+')]: '匯豐Live+積分',
    [normalizeStr('live+積分')]: '匯豐Live+積分'
};

function canonicalizeAirlineName(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    const norm = normalizeStr(raw);
    return AIRLINE_ALIAS_MAP[norm] || raw;
}

function canonicalizeTransferSourceName(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    const norm = normalizeStr(raw);
    return TRANSFER_SOURCE_ALIAS_MAP[norm] || raw;
}

function findAirlineAssetByAlias(warehouse, inputName) {
    if (!Array.isArray(warehouse)) return null;
    const canonical = canonicalizeAirlineName(inputName);
    const canonicalNorm = normalizeStr(canonical);

    return warehouse.find(a =>
        a &&
        typeof a === 'object' &&
        a.type === 'airline' &&
        normalizeStr(canonicalizeAirlineName(a.targetAirline || a.name || '')) === canonicalNorm
    ) || null;
}

function findTransferAssetByAlias(warehouse, inputName) {
    if (!Array.isArray(warehouse)) return null;
    const canonical = canonicalizeTransferSourceName(inputName);
    const canonicalNorm = normalizeStr(canonical);

    return warehouse.find(a =>
        a &&
        typeof a === 'object' &&
        a.type === 'transfer' &&
        normalizeStr(canonicalizeTransferSourceName(a.name || '')) === canonicalNorm
    ) || null;
}

// ==========================================
// 一次性 legacy merge：把舊匯豐別名卡收斂
// 只處理 raw / transfer，不動 airline
// ==========================================
function mergeLegacyTransferAliases(db) {
    if (!db || !Array.isArray(db.warehouse)) return false;

    let changed = false;
    const groups = {};

    db.warehouse.forEach((asset, idx) => {
        if (!asset || typeof asset !== 'object') return;
        if (asset.type !== 'raw' && asset.type !== 'transfer') return;

        const canonical = canonicalizeTransferSourceName(asset.name || '');
        if (!canonical) return;

        if (!groups[canonical]) groups[canonical] = [];
        groups[canonical].push({ asset, idx });
    });

    Object.keys(groups).forEach(canonical => {
        const list = groups[canonical];
        if (!Array.isArray(list) || list.length <= 1) return;

        const master = list[0].asset;
        if (!Array.isArray(master.batches)) master.batches = [];

        master.name = canonical;
        if (master.type === 'transfer') master.targetAirline = canonical;

        for (let i = 1; i < list.length; i++) {
            const other = list[i].asset;
            if (!other || typeof other !== 'object') continue;

            if (Array.isArray(other.batches) && other.batches.length > 0) {
                master.batches.push(...other.batches);
            } else {
                const val = Number(other.current) || 0;
                if (val !== 0) {
                    master.batches.push({
                        batch_id: `legacy_${Date.now()}_${i}_${canonical.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').substring(0,3) || 'UNK'}`,
                        direction: val > 0 ? 'in' : 'out',
                        amount: Math.abs(val),
                        created_at: Date.now(),
                        source_type: 'legacy_merge',
                        ref_id: null,
                        note: `舊版別名歸戶：${other.name || canonical}`
                    });
                }
            }

            other.__merged_into__ = canonical;
            other.current = 0;
            other.batches = [];
            changed = true;
        }

        recomputeAssetCurrent(master);
        changed = true;
    });

    if (changed) {
        db.warehouse = db.warehouse.filter(a => !(a && a.__merged_into__));
    }

    return changed;
}

function renderWarehouse() {
    const db = loadDB();
    if (mergeLegacyTransferAliases(db)) {
        saveDB(db);
    }

    const con = document.getElementById('warehouse-list'); if(!con) return; con.innerHTML = '';
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
    try {
        const nameEl = document.getElementById('native-airline-name');
        const qtyEl = document.getElementById('native-current');

        if (!nameEl || !qtyEl) {
            return alert('DEBUG: 找不到 native-airline-name 或 native-current 欄位');
        }

        const rawName = nameEl.value.trim();
        const qty = parseInt(qtyEl.value, 10);

        if(!rawName || isNaN(qty) || qty <= 0) return showCustomAlert('請填寫完整資訊');

        const db = loadDB();
        if (!db || !Array.isArray(db.warehouse)) {
            return alert('DEBUG: loadDB() 回傳異常，db.warehouse 不是陣列');
        }

        const finalAirlineName = canonicalizeAirlineName(rawName);
        let exactAsset = findAirlineAssetByAlias(db.warehouse, finalAirlineName);
        const timestamp = Date.now();

        if(!exactAsset) {
            exactAsset = {
                type: 'airline',
                targetAirline: finalAirlineName,
                name: finalAirlineName,
                current: 0,
                unitPoints: 1,
                unitMiles: 1,
                bonusReq: 0,
                bonusGive: 0,
                schema_version: 2,
                created_at: timestamp,
                batches: []
            };
            db.warehouse.push(exactAsset);
        }

        if (!Array.isArray(exactAsset.batches)) exactAsset.batches = [];

        const safeNameSnippet = finalAirlineName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').substring(0, 3) || 'UNK';
        const seq = exactAsset.batches.length;
        const batchId = `txn_${timestamp}_${seq}_${safeNameSnippet}`;

        exactAsset.batches.push({
            batch_id: batchId,
            direction: 'in',
            amount: Math.abs(qty),
            created_at: timestamp,
            source_type: 'manual_input',
            ref_id: null,
            note: `手動存入航空哩程（原始輸入：${rawName}）`
        });

        recomputeAssetCurrent(exactAsset);
        saveDB(db);

        clearInput('native-airline-name');
        clearInput('native-current');
        renderWarehouse();
        showCustomAlert('✅ 航空哩程存入成功！');
    } catch (err) {
        alert('DEBUG ERROR: ' + (err && err.message ? err.message : err));
    }
}

function addRawAsset() {
    try {
        const nameEl = document.getElementById('raw-point-name');
        const qtyEl = document.getElementById('raw-point-current');

        if (!nameEl || !qtyEl) {
            return alert('DEBUG: 找不到 raw-point-name 或 raw-point-current 欄位');
        }

        const rawName = nameEl.value.trim();
        const qty = parseInt(qtyEl.value, 10);

        if (!rawName || isNaN(qty) || qty <= 0) {
            return showCustomAlert('請填寫完整資訊');
        }

        const db = loadDB();
        if (!db || !Array.isArray(db.warehouse)) {
            return alert('DEBUG: loadDB() 回傳異常，db.warehouse 不是陣列');
        }

        const finalName = canonicalizeTransferSourceName(rawName);
        let asset = db.warehouse.find(a => a && typeof a === 'object' && a.type === 'raw' && normalizeStr(canonicalizeTransferSourceName(a.name || '')) === normalizeStr(finalName));
        const timestamp = Date.now();

        if (!asset) {
            asset = {
                type: 'raw',
                targetAirline: '無',
                name: finalName,
                current: 0,
                unitPoints: 1,
                unitMiles: 1,
                bonusReq: 0,
                bonusGive: 0,
                schema_version: 2,
                created_at: timestamp,
                batches: []
            };
            db.warehouse.push(asset);
        }

        if (!Array.isArray(asset.batches)) asset.batches = [];

        const safeNameSnippet = finalName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').substring(0, 3) || 'UNK';
        const seq = asset.batches.length;
        const batchId = `txn_${timestamp}_${seq}_${safeNameSnippet}`;

        asset.batches.push({
            batch_id: batchId,
            direction: 'in',
            amount: Math.abs(qty),
            created_at: timestamp,
            source_type: 'manual_input',
            ref_id: null,
            note: `手動存入（原始輸入：${rawName}）`
        });

        recomputeAssetCurrent(asset);
        saveDB(db);

        clearInput('raw-point-name');
        clearInput('raw-point-current');
        renderWarehouse();
        showCustomAlert('✅ 通用積分存入成功！');
    } catch (err) {
        alert('DEBUG ERROR: ' + (err && err.message ? err.message : err));
    }
}

function addTransferAsset() {
    try {
        const sourceEl = document.getElementById('trans-source-name');
        const qtyEl = document.getElementById('trans-current');
        const targetEl = document.getElementById('trans-target-airline');
        const unitPtsEl = document.getElementById('trans-unit-points');
        const unitMilesEl = document.getElementById('trans-unit-miles');
        const bonusReqEl = document.getElementById('trans-bonus-req');
        const bonusGiveEl = document.getElementById('trans-bonus-give');

        if (!sourceEl || !qtyEl || !targetEl || !unitPtsEl || !unitMilesEl || !bonusReqEl || !bonusGiveEl) {
            return alert('DEBUG: 轉點欄位缺失');
        }

        const rawSourceName = sourceEl.value.trim();
        const rawQty = Number(qtyEl.value);
        const rawTargetName = targetEl.value.trim();
        const uPts = parseFloat(unitPtsEl.value);
        const uMis = parseFloat(unitMilesEl.value);

        const rawBonusReq = bonusReqEl.value;
        const rawBonusGive = bonusGiveEl.value;
        let bonusReq = parseFloat(rawBonusReq);
        let bonusGive = parseFloat(rawBonusGive);

        if(!rawSourceName || !rawTargetName || isNaN(uPts) || uPts <= 0 || isNaN(uMis) || uMis <= 0) {
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
        if (!db || !Array.isArray(db.warehouse)) {
            return alert('DEBUG: loadDB() 回傳異常，db.warehouse 不是陣列');
        }

        const finalSourceName = canonicalizeTransferSourceName(rawSourceName);
        let sourceAsset = findTransferAssetByAlias(db.warehouse, finalSourceName);

        if(!sourceAsset) {
            sourceAsset = db.warehouse.find(a =>
                a &&
                typeof a === 'object' &&
                a.type === 'raw' &&
                normalizeStr(canonicalizeTransferSourceName(a.name || '')) === normalizeStr(finalSourceName)
            );
        }

        if(!sourceAsset) {
            return showCustomAlert(`❌ 找不到名為「${rawSourceName}」的可扣除來源資產，請先確認倉庫內是否已有此項目。`);
        }

        if (!Array.isArray(sourceAsset.batches)) sourceAsset.batches = [];

        const currentBalance = Number(sourceAsset.current) || 0;
        if(currentBalance < qty) {
            return showCustomAlert(`❌ 轉出失敗！「${sourceAsset.name || rawSourceName}」餘額不足 (目前餘額僅: ${currentBalance.toLocaleString()})`);
        }

        const baseMiles = Math.trunc(qty * (uMis / uPts));
        const bonusMilesCalc = (hasBonusReq && hasBonusGive) ? Math.trunc(qty / bonusReq) * bonusGive : 0;
        const totalAcquiredMiles = baseMiles + bonusMilesCalc;

        if (totalAcquiredMiles <= 0) {
            return showCustomAlert('❌ 依目前轉換比例，本次轉出實得哩程為 0，操作已自動取消。');
        }

        const finalTargetName = canonicalizeAirlineName(rawTargetName);
        let targetAsset = findAirlineAssetByAlias(db.warehouse, finalTargetName);
        const timestamp = Date.now();
        const transferRefId = `transfer_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;

        if (!targetAsset) {
            targetAsset = {
                type: 'airline',
                targetAirline: finalTargetName,
                name: finalTargetName,
                current: 0,
                unitPoints: 1,
                unitMiles: 1,
                bonusReq: 0,
                bonusGive: 0,
                schema_version: 2,
                created_at: timestamp,
                batches: []
            };
            db.warehouse.push(targetAsset);
        }

        if (!Array.isArray(targetAsset.batches)) targetAsset.batches = [];

        const sourceSnippet = String(sourceAsset.name || 'SRC').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').substring(0, 3) || 'SRC';
        const targetSnippet = String(targetAsset.name || 'TGT').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').substring(0, 3) || 'TGT';

        sourceAsset.batches.push({
            batch_id: `tout_${timestamp}_${sourceAsset.batches.length}_${sourceSnippet}`,
            direction: 'out',
            amount: Math.abs(qty),
            created_at: timestamp,
            source_type: 'transfer_out',
            ref_id: transferRefId,
            note: `轉出至 ${targetAsset.name || finalTargetName}`
        });

        targetAsset.batches.push({
            batch_id: `tin_${timestamp}_${targetAsset.batches.length}_${targetSnippet}`,
            direction: 'in',
            amount: Math.abs(totalAcquiredMiles),
            created_at: timestamp,
            source_type: 'transfer_in',
            ref_id: transferRefId,
            note: `由 ${sourceAsset.name || finalSourceName} 轉入`
        });

        recomputeAssetCurrent(sourceAsset);
        recomputeAssetCurrent(targetAsset);

        saveDB(db);
        clearInput('trans-source-name');
        clearInput('trans-current');
        clearInput('trans-target-airline');
        clearInput('trans-unit-points');
        clearInput('trans-unit-miles');
        clearInput('trans-bonus-req');
        clearInput('trans-bonus-give');

        renderWarehouse();
        showCustomAlert(`✅ 轉點成功！\n已從「${sourceAsset.name || rawSourceName}」扣除 ${qty.toLocaleString()} 點\n「${targetAsset.name || finalTargetName}」增加 ${totalAcquiredMiles.toLocaleString()} 哩`);
    } catch (err) {
        alert('DEBUG ERROR: ' + (err && err.message ? err.message : err));
    }
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
