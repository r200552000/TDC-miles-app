/* ==========================================
   記帳、明細管理、監控與額度編輯
   ========================================== */

function recordTx(idx, isManual = false, originalMiles = 0) {
    const item = currentResults[idx]; const db = loadDB(); const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    if(!db.records[monthKey]) db.records[monthKey] = {}; const txId = `tx_${Date.now()}`;

    let unitText = '哩'; let points = item.miles;
    if(item.id === 'hsbc_live') { points = Math.trunc(item.miles / 2); unitText = '積分'; }
    else if(item.id === 'hsbc_inf') { unitText = '積分'; }

    let kwNote = document.getElementById('keyword-input').value || '一般消費';
    if(isManual) kwNote += ` (微調: 原算 ${originalMiles})`;
    if(item.twdBase < 0) kwNote = `(退刷) ${kwNote}`;

    const limitKey = getLimitKey(db, item.id, now);

    db.records[monthKey][txId] = {
        id: item.id,
        name: item.name,
        spend: item.twdBase,
        consumedQuota: item.consumedQuota,
        miles: points,
        unit: unitText,
        note: kwNote,
        createdAt: Date.now(),
        limitKey: limitKey
    };

    if(!db.limits[limitKey]) db.limits[limitKey] = { spend:0, points:0 };
    let qToConsume = item.consumedQuota !== undefined ? item.consumedQuota : item.twdBase;
    if(qToConsume !== 0) { db.limits[limitKey].spend += qToConsume; }

    saveDB(db);
    document.getElementById('nav-badge-list').innerText = Object.keys(db.records[monthKey]).length;
    document.getElementById('nav-badge-list').style.display = Object.keys(db.records[monthKey]).length > 0 ? 'inline-block' : 'none';
    showCustomAlert(`✅ 已加入待結算明細\n${item.name}: ${points>0?'+':''}${points} ${unitText}`);
}

function openManualAdjust(idx) {
    const item = currentResults[idx]; document.getElementById('manual-adjust-val').value = item.miles;
    document.getElementById('manual-adjust-idx').value = idx; showModal('manualAdjustModal');
}

function confirmManualAdjust() {
    const idx = document.getElementById('manual-adjust-idx').value; const manualVal = parseFloat(document.getElementById('manual-adjust-val').value);
    if(isNaN(manualVal)) return showCustomAlert('請輸入有效的數字！');
    const item = currentResults[idx]; const originalMiles = item.miles; item.miles = manualVal;
    hideModal('manualAdjustModal'); recordTx(idx, true, originalMiles);
}

// ==========================================
// 總帳、編輯額度與明細管理 (含防空洞保護)
// ==========================================
function renderStatus() {
    const db = loadDB(); const now = new Date(); const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const data = db.records[monthKey] || {}; const agg = {};
    for(let key in data) {
        const r = data[key];
        if(!r || typeof r !== 'object') continue;
        if(!agg[r.id]) agg[r.id] = { name: escapeHTML(r.name), spend: 0, miles: 0, unit: escapeHTML(r.unit) };
        agg[r.id].spend += r.spend; agg[r.id].miles += r.miles;
    }

    const statusCon = document.getElementById('status-container'); if(!statusCon) return;
    if(Object.keys(agg).length === 0) statusCon.innerHTML = '<div class="tdc-text-center py-3 text-muted font-hand fw-bold">本月尚無累積</div>';
    else {
        let h = '';
        for(let id in agg) {
            const item = agg[id];
            h += `<div class="tdc-flex tdc-justify-between tdc-align-center tdc-mb-3 pb-3 border-bottom"><div><div class="fw-bold text-dark tdc-mb-1">${item.name}</div><div class="text-muted small">$${item.spend.toLocaleString()}</div></div><div class="text-primary fw-bold fs-5">${item.miles.toLocaleString()} <small class="text-muted" style="font-size:0.6em">${item.unit}</small></div></div>`;
        }
        statusCon.innerHTML = h;
    }

    const limitsCon = document.getElementById('limits-container'); if(!limitsCon) return;
    let lh = '';
    (db.settings.enabledBuiltins || []).forEach(id => {
        const limit = getLimitVal(id); if (limit >= 999999999) return;
        const def = BUILTIN_DEFS.find(d=>d.id===id);
        const lKey = getLimitKey(db, id, now); const curr = db.limits[lKey] ? db.limits[lKey].spend : 0; const pct = Math.min(100, Math.max(0, (curr/limit)*100));
        lh += `<div class="tdc-mb-3">
            <div class="tdc-flex tdc-justify-between tdc-align-center small tdc-mb-1">
                <strong>${def?def.name:id}</strong>
                <div class="tdc-flex tdc-align-center gap-2"><span>$${curr.toLocaleString()} / $${limit.toLocaleString()}</span><button class="btn-edit-limit" title="修改進度" onclick="openEditLimit('${id}')"><svg class="lucide"><use href="#icon-pen"/></svg></button></div>
            </div>
            <div class="progress" style="height:8px; background-color:#fef3c7;">
                <div class="progress-bar ${pct>80?'bg-danger':'bg-warning'}" style="width:${pct}%"></div>
            </div>
        </div>`;
    });

    (db.customCards || []).forEach(c => {
        if (!c || typeof c !== 'object') return;
        const lKey = getLimitKey(db, c.id, now); const curr = db.limits[lKey] ? db.limits[lKey].spend : 0;
        if (c.limitAmt && c.limitAmt > 0) {
            const pct = Math.min(100, Math.max(0, (curr/c.limitAmt)*100));
            lh += `<div class="tdc-mb-3">
                <div class="tdc-flex tdc-justify-between tdc-align-center small tdc-mb-1">
                    <strong>${escapeHTML(c.name)} <span class="text-muted">(自訂${c.isAnnual?'年':'月'})</span></strong>
                    <div class="tdc-flex tdc-align-center gap-2"><span>$${curr.toLocaleString()} / $${c.limitAmt.toLocaleString()}</span><button class="btn-edit-limit" title="修改進度" onclick="openEditLimit('${c.id}')"><svg class="lucide"><use href="#icon-pen"/></svg></button></div>
                </div>
                <div class="progress" style="height:8px; background-color:#fef3c7;">
                    <div class="progress-bar ${pct>80?'bg-danger':'bg-warning'}" style="width:${pct}%"></div>
                </div>
            </div>`;
        } else {
            lh += `<div class="tdc-mb-3">
                <div class="tdc-flex tdc-justify-between tdc-align-center small tdc-mb-1">
                    <strong>${escapeHTML(c.name)} <span class="text-muted">(自訂無上限)</span></strong>
                    <div class="tdc-flex tdc-align-center gap-2"><span>已刷 $${curr.toLocaleString()}</span><button class="btn-edit-limit" title="修改進度" onclick="openEditLimit('${c.id}')"><svg class="lucide"><use href="#icon-pen"/></svg></button></div>
                </div>
            </div>`;
        }
    });
    limitsCon.innerHTML = lh || '<div class="text-muted small">目前主力卡皆為無上限</div>';
}

function renderList() {
    const db = loadDB(); const now = new Date(); const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const data = db.records[monthKey] || {}; const con = document.getElementById('transaction-list-container'); con.innerHTML = '';
    const groups = {}; let count = 0;
    for(let key in data) {
        const r = data[key];
        if(!r || typeof r !== 'object') continue;
        const safeName = escapeHTML(r.name);
        if(!groups[safeName]) groups[safeName] = [];
        groups[safeName].push({ ...r, key }); count++;
    }

    document.getElementById('nav-badge-list').innerText = count; document.getElementById('nav-badge-list').style.display = count > 0 ? 'inline-block' : 'none';
    document.getElementById('pending-count').innerText = `${count} 筆`;

    if(count === 0) { con.innerHTML = '<div class="tdc-text-center text-muted py-5 font-hand fw-bold">本月目前沒有待結算的紀錄</div>'; return; }

    let allHtml = '';
    for(let name in groups) {
        let html = `<div class="card-box p-0 tdc-mb-3 overflow-hidden"><div class="bg-light p-2 fw-bold text-primary px-3 border-bottom">${name}</div><div>`;
        groups[name].forEach(item => {
            let dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : new Date(parseInt(item.key.split('_')[1] || Date.now())).toLocaleDateString();
            html += `
            <div class="tdc-flex tdc-justify-between tdc-align-center p-3 border-bottom">
                <div>
                    <div class="fw-bold ${item.spend<0?'text-danger':'text-dark'}">${escapeHTML(item.note)}</div>
                    <div class="text-muted" style="font-size:0.7rem;">${dateStr}</div>
                </div>
                <div class="tdc-flex tdc-align-center">
                    <div class="tdc-text-end me-3">
                        <div class="${item.spend<0?'text-danger':''} fw-bold">$${item.spend.toLocaleString()}</div>
                        <div class="text-primary small font-hand">${item.miles>0?'+':''}${item.miles} ${escapeHTML(item.unit)}</div>
                    </div>
                    <button class="btn btn-sm btn-outline-danger rounded-circle p-1 tdc-flex" onclick="delTx('${monthKey}','${item.key}')"><svg class="lucide" style="width:14px;height:14px;"><use href="#icon-trash"/></svg></button>
                </div>
            </div>`;
        });
        html += '</div></div>';
        allHtml += html;
    }
    con.innerHTML = allHtml;
}

function delTx(monthKey, txId) {
    if(!confirm('確定要刪除這筆紀錄嗎？\n（同時會退還該卡片的累積額度）')) return;
    const db = loadDB(); const rec = db.records[monthKey] ? db.records[monthKey][txId] : null;
    if(rec && typeof rec === 'object') {
        const limitKey = rec.limitKey || getLimitKey(db, rec.id, new Date(parseInt(txId.split('_')[1] || Date.now())));
        let qToRestore = rec.consumedQuota !== undefined ? rec.consumedQuota : rec.spend;
        if(db.limits[limitKey]) { db.limits[limitKey].spend -= qToRestore; if(db.limits[limitKey].spend < 0) db.limits[limitKey].spend = 0; }
        delete db.records[monthKey][txId]; saveDB(db); renderList(); renderStatus();
    }
}

function clearCurrentStats() {
    if(!confirm('⚠️ 確定要重置本期所有數據嗎？\n（這會將本月相關的額度全部退還）')) return;
    const db = loadDB(); const now = new Date(); const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    if(db.records[monthKey]) {
        for(let txId in db.records[monthKey]) {
            const rec = db.records[monthKey][txId];
            if(!rec || typeof rec !== 'object') continue;
            const lKey = rec.limitKey || getLimitKey(db, rec.id, now);
            let qToRestore = rec.consumedQuota !== undefined ? rec.consumedQuota : rec.spend;
            if(db.limits[lKey]) { db.limits[lKey].spend -= qToRestore; if(db.limits[lKey].spend < 0) db.limits[lKey].spend = 0; }
        }
        db.records[monthKey] = {}; saveDB(db); renderStatus(); renderList();
    }
}

function batchImport() {
    if(!confirm('確定將明細全部存入倉庫？')) return;
    const db = loadDB(); const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
    const data = db.records[monthKey]; if(!data) return;

    const autoAssetsConfig = getAutoAssetsConfig();

    for(let k in data) {
        const r = data[k];
        if(!r || typeof r !== 'object') continue;
        const rule = autoAssetsConfig[r.id];
        if(rule) {
            let asset = db.warehouse.find(a => a && typeof a === 'object' && a.targetAirline === rule.target && a.type === rule.type);
            if(!asset) { asset = { type: rule.type, targetAirline: rule.target, name: rule.target, current: 0, unitPoints:rule.unitPoints, unitMiles:rule.unitMiles, bonusReq:0, bonusGive:0 }; db.warehouse.push(asset); }
            asset.current = (Number(asset.current) || 0) + r.miles;
        }
    }
    db.records[monthKey] = {}; saveDB(db); renderStatus(); renderList(); renderWarehouse(); showCustomAlert('✅ 已全部入庫！');
}

function confirmEditLimit() {
    const id = document.getElementById('edit-limit-id').value;
    let val = parseFloat(document.getElementById('edit-limit-val').value);
    if(isNaN(val) || val < 0) val = 0;
    const db = loadDB(); const now = new Date(); const limitKey = getLimitKey(db, id, now);
    if(!db.limits[limitKey]) db.limits[limitKey] = { spend:0, points:0 };
    db.limits[limitKey].spend = val;
    saveDB(db); hideModal('editLimitModal');
    renderStatus(); showCustomAlert('✅ 卡片額度已成功手動覆寫！');
}

function openEditLimit(id) {
    document.getElementById('edit-limit-id').value = id;
    document.getElementById('edit-limit-val').value = '';
    showModal('editLimitModal');
}
