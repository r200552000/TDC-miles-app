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
                if(def.id === 'taishin_cx') {
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
