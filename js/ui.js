/* ==========================================
   UI 操作、頁面切換、設定管理
   ========================================== */

function switchPage(p, btn) {
    document.querySelectorAll('.page-section').forEach(e => e.style.display='none');
    document.getElementById(`page-${p}`).style.display='block';
    document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active')); btn.classList.add('active');
    if(p==='warehouse') switchWarehouseTab('planner');
    if(p==='status') renderStatus();
    if(p==='list') renderList();
    window.scrollTo(0,0);
}

function switchWarehouseTab(view) {
    document.getElementById('warehouse-view-manage').style.display = (view === 'manage' ? 'block' : 'none');
    document.getElementById('warehouse-view-planner').style.display = (view === 'planner' ? 'block' : 'none');
    const btnManage = document.getElementById('tab-btn-manage'); const btnPlanner = document.getElementById('tab-btn-planner');
    if (view === 'manage') {
        btnManage.style.background = '#ffffff'; btnManage.style.color = 'var(--primary-dark)'; btnManage.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
        btnPlanner.style.background = 'transparent'; btnPlanner.style.color = 'inherit'; btnPlanner.style.boxShadow = 'none';
        if (typeof renderWarehouse === "function") renderWarehouse();
    } else {
        btnPlanner.style.background = '#ffffff'; btnPlanner.style.color = 'var(--primary-dark)'; btnPlanner.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
        btnManage.style.background = 'transparent'; btnManage.style.color = 'inherit'; btnManage.style.boxShadow = 'none';
    }
}

function clearInput(id) { const el = document.getElementById(id); el.value = ''; el.focus(); checkInputStyle(el); if(id === 'fx-rate-input') updateFxFeedback(true); }
function toggleNegative(id) {
    const el = document.getElementById(id); let val = parseFloat(el.value);
    if(isNaN(val)) val = 0; el.value = val === 0 ? '-' : (val * -1); checkInputStyle(el);
}
function checkInputStyle(el) {
    const val = parseFloat(el.value);
    if(val < 0) { el.classList.add('input-negative'); } else { el.classList.remove('input-negative'); }
}

function updateKeywordPlaceholder() {
    const cat = document.getElementById('category').value;
    const input = document.getElementById('keyword-input');
    if(cat === 'flight_ci' || cat === 'flight_cx' || cat === 'flight_other') input.placeholder = '可留空或輸入航線 (如: TPE-NRT)';
    else input.placeholder = '輸入店家關鍵字 (如: 麥當勞, Agoda, JPY, 日本)...';
}
function goToSettingsFromAI() { hideModal('aiIntroModal'); setTimeout(openSettings, 400); }

function toggleAITextSize() {
    const wrap = document.getElementById('ai-modal-content-wrap');
    if (wrap) {
        wrap.classList.toggle('ai-text-large');
    }
}

async function triggerSync() {
    const ind = document.getElementById('sync-indicator');
    const adapterBadge = document.getElementById('hsbc-adapter-status');

    if (ind) ind.className = 'sync-dot sync-yellow me-2';
    if (adapterBadge) {
        adapterBadge.innerText = 'Rules: Syncing...';
        adapterBadge.className = 'badge bg-warning text-dark ms-2';
    }

    const status = await fetchRules();

    if (status.mode === "remote") {
        renderCategorySelect();
        if (ind) ind.className = 'sync-dot sync-green me-2';
        if (adapterBadge) {
            adapterBadge.innerText = 'Rules: Active';
            adapterBadge.className = 'badge bg-success text-white ms-2';
        }
    } else if (status.mode === "cache") {
        if (ind) ind.className = 'sync-dot sync-green me-2';
        if (adapterBadge) {
            adapterBadge.innerText = 'Rules: Cached';
            adapterBadge.className = 'badge bg-primary text-white ms-2';
        }
    } else {
        if (ind) ind.className = 'sync-dot sync-red me-2';
        if (adapterBadge) {
            adapterBadge.innerText = 'Rules: Fallback';
            adapterBadge.className = 'badge bg-secondary text-white ms-2';
        }
    }
}

function exportDataMagic() {
    const db = safeGetItem(DB_KEY) || '{}'; const b64 = btoa(unescape(encodeURIComponent(db)));
    if (navigator.clipboard) { navigator.clipboard.writeText(b64).then(() => showCustomAlert('✅ 搬家代碼已成功複製！請妥善保存。')); }
    else { prompt('請全選並複製以下代碼：', b64); }
}
function triggerRestoreFlow() {
    hideModal('settingsModal');
    setTimeout(() => { document.body.classList.add('confirm-modal-open'); showModal('customConfirmModal'); }, 400);
}
function hideConfirmModal() {
    hideModal('customConfirmModal');
    document.body.classList.remove('confirm-modal-open');
}

function renderSettingsCards() {
    const db = loadDB();

    const builtinCon = document.getElementById('builtin-cards-list'); if(!builtinCon) return;
    builtinCon.innerHTML = '';
    BUILTIN_DEFS.forEach(def => {
        const isChecked = (db.settings.enabledBuiltins || []).includes(def.id) ? 'checked' : '';
        builtinCon.innerHTML += `<label class="switch-group tdc-mb-2"><span class="switch-label">${def.name}</span><input class="form-check-input" type="checkbox" onchange="toggleBuiltin('${def.id}', this.checked)" ${isChecked}></label>`;
    });

    const customCon = document.getElementById('custom-cards-list'); if(!customCon) return;
    customCon.innerHTML = '';
    (db.customCards || []).forEach((c, i) => {
        if (!c || typeof c !== 'object') return;
        let limitStr = (c.limitAmt && c.limitAmt > 0) ? `上限$${c.limitAmt.toLocaleString()}` : '無上限';
        let cycleStr = c.isAnnual ? '年度結算' : `每月${c.billingDay||1}日結`;
        customCon.innerHTML += `<div class="custom-card-item"><div class="fw-bold text-dark">${escapeHTML(c.name)} <span class="small text-muted ms-2">國$${c.domRate}/外$${c.forRate} (${limitStr}/${cycleStr})</span></div><button class="btn btn-sm btn-outline-danger border-0 p-1" onclick="delCustomCard(${i})"><svg class="lucide"><use href="#icon-trash"/></svg></button></div>`;
    });

    const bDayCon = document.getElementById('billing-days-container');
    if(bDayCon) {
        let bHtml = '';
        BUILTIN_DEFS.forEach(def => {
            if((db.settings.enabledBuiltins || []).includes(def.id)) {
                if(['taishin_cx', 'ctbc_ci', 'ctbc_ci_inf'].includes(def.id)) {
                    bHtml += `<div class="tdc-flex tdc-justify-between tdc-align-center tdc-mb-2"><span class="small fw-bold text-dark">${def.name}</span><span class="badge bg-secondary">年度結算</span></div>`;
                } else {
                    let currentDay = db.settings.billingDays[def.id] || db.settings.billingDays[def.id.split('_')[0]] || 1;
                    bHtml += `<div class="tdc-flex tdc-justify-between tdc-align-center tdc-mb-2"><span class="small fw-bold text-dark">${def.name}</span><select class="form-select form-select-sm w-auto rounded-pill" style="border-width: 2px;" onchange="updateBillingDay('${def.id}', this.value)">${Array.from({length:31}, (_, i)=>`<option value="${i+1}" ${i+1===currentDay?'selected':''}>每月 ${i+1} 日</option>`).join('')}</select></div>`;
                }
            }
        });
        (db.customCards || []).forEach(c => {
            if (!c || typeof c !== 'object') return;
            if(c.isAnnual) {
                bHtml += `<div class="tdc-flex tdc-justify-between tdc-align-center tdc-mb-2"><span class="small fw-bold text-dark">${escapeHTML(c.name)}</span><span class="badge bg-secondary">年度結算</span></div>`;
            } else {
                let currentDay = c.billingDay || 1;
                bHtml += `<div class="tdc-flex tdc-justify-between tdc-align-center tdc-mb-2"><span class="small fw-bold text-dark">${escapeHTML(c.name)}</span><select class="form-select form-select-sm w-auto rounded-pill" style="border-width: 2px;" onchange="updateCustomBillingDay('${c.id}', this.value)">${Array.from({length:31}, (_, i)=>`<option value="${i+1}" ${i+1===currentDay?'selected':''}>每月 ${i+1} 日</option>`).join('')}</select></div>`;
            }
        });
        bDayCon.innerHTML = bHtml || '<div class="text-muted small">尚未啟用任何卡片</div>';
    }
}

function toggleBuiltin(id, isEnabled) { const db = loadDB(); if(isEnabled && !db.settings.enabledBuiltins.includes(id)) db.settings.enabledBuiltins.push(id); else if(!isEnabled) db.settings.enabledBuiltins = db.settings.enabledBuiltins.filter(x => x !== id); saveDB(db); renderSettingsCards(); }
function updateBillingDay(id, day) { const db = loadDB(); if(!db.settings.billingDays) db.settings.billingDays={}; db.settings.billingDays[id] = parseInt(day); saveDB(db); }
function updateCustomBillingDay(id, day) { const db = loadDB(); const c = db.customCards.find(x=>x&&x.id===id); if(c) c.billingDay = parseInt(day); saveDB(db); }

function addCustomCard() {
    const name = prompt('自訂卡片名稱：'); if(!name) return;
    const dom = parseFloat(prompt('國內 $X/哩：', '10'));
    const fgn = parseFloat(prompt('海外 $X/哩：', '10'));
    if(isNaN(dom) || dom <= 0 || isNaN(fgn) || fgn <= 0) return alert('❌ 錯誤：兌換率必須是大於 0 的有效數字！');
    let limitAmt = parseFloat(prompt('請輸入此卡的回饋/刷卡上限金額 (TWD)：\n(若無上限請輸入 0)', '0'));
    if(isNaN(limitAmt) || limitAmt < 0) limitAmt = 0;

    const isAnnual = confirm('【上限類型確認】\n這張自訂卡片是「年度回饋上限」嗎？\n\n• 按「確定」：設為年度歸零\n• 按「取消」：設為每月結帳日歸零');
    let bDay = 1;
    if (!isAnnual) {
        bDay = parseInt(prompt('請輸入卡片結帳日 (1~31)：', '1'));
        if(isNaN(bDay) || bDay < 1 || bDay > 31) return alert('輸入無效，請確認數字格式及範圍 (1-31)');
    }

    const db = loadDB();
    db.customCards.push({ id: `custom_${Date.now()}`, name, domRate: dom, forRate: fgn, billingDay: bDay, isAnnual: isAnnual, limitAmt: limitAmt });
    saveDB(db); renderSettingsCards();
}

function delCustomCard(idx) { if(confirm('確定刪除這張自訂卡片？')) { const db = loadDB(); db.customCards.splice(idx, 1); saveDB(db); renderSettingsCards(); } }
function openSettings() { document.getElementById('gemini-key').value = safeGetItem('GEMINI_API_KEY') || ''; document.getElementById('github-token').value = safeGetItem('GITHUB_GIST_TOKEN') || ''; document.getElementById('setting-hsbc-autopay').checked = loadDB().settings.hsbc_autopay; renderSettingsCards(); showModal('settingsModal'); }
function saveSettings() { const key = document.getElementById('gemini-key').value.trim(); const git = document.getElementById('github-token').value.trim(); if(key) safeSetItem('GEMINI_API_KEY', key); else safeRemoveItem('GEMINI_API_KEY'); if(git) safeSetItem('GITHUB_GIST_TOKEN', git); else safeRemoveItem('GITHUB_GIST_TOKEN'); const db = loadDB(); db.settings.hsbc_autopay = document.getElementById('setting-hsbc-autopay').checked; saveDB(db); hideModal('settingsModal'); showCustomAlert("✅ 系統設定已更新"); triggerSync(); }
function openGuide() { showModal('guideModal'); }
