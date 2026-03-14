/* ==========================================
   AI 戰略引擎 - Gemini 診斷與報告生成
   ========================================== */

// --- Gist 外掛 Fallback Stubs ---
if (typeof normalizeAssetPriorityBuckets === 'undefined') {
    var normalizeAssetPriorityBuckets = function(obj) { return obj; };
}
if (typeof applyFormatToAllFields === 'undefined') {
    var applyFormatToAllFields = function() {};
}
if (typeof AI_PROMPT_PREFERENCES === 'undefined') {
    var AI_PROMPT_PREFERENCES = '';
}

// --- AI 前置處理 Helpers ---
function buildTopupCandidates(db) {
    const candidates = [];
    (db.settings.enabledBuiltins || []).forEach(id => {
        if (CARD_RULES[id] && CARD_RULES[id].ai_meta) {
            const meta = CARD_RULES[id].ai_meta;
            if (meta.bestRate > 0 && meta.baseRate > 0) {
                candidates.push({ id: id, cardName: CARD_RULES[id].name, ...meta });
            }
        }
    });

    (db.customCards || []).forEach(c => {
        if (!c || typeof c !== 'object') return;
        const name = (typeof c.name === 'string') ? c.name.trim() : '';
        const dom = parseFloat(c.domRate);
        const fgn = parseFloat(c.forRate);

        if (!name || isNaN(dom) || dom <= 0 || isNaN(fgn) || fgn <= 0) return;

        const bestRate = Math.min(dom, fgn);
        const baseRate = Math.max(dom, fgn);
        let bestScenario = "";
        if (dom === fgn) bestScenario = "國內/海外皆可";
        else bestScenario = dom < fgn ? "國內消費" : "海外消費";

        candidates.push({
            id: c.id || '',
            cardName: name,
            bestRate: bestRate,
            bestScenario: bestScenario,
            baseRate: baseRate,
            isUnlimitedLike: (!c.limitAmt || c.limitAmt === 0)
        });
    });
    return candidates;
}

function calculateBestTopup(candidates) {
    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) return { costChampion: null, speedChampion: null };

    const validCandidates = candidates.filter(c =>
        c &&
        typeof c.bestRate === 'number' && !isNaN(c.bestRate) && c.bestRate > 0 &&
        typeof c.baseRate === 'number' && !isNaN(c.baseRate) && c.baseRate > 0
    );

    if (validCandidates.length === 0) return { costChampion: null, speedChampion: null };

    const costChampion = [...validCandidates].sort((a, b) => a.bestRate - b.bestRate)[0];
    const unlimitedCards = validCandidates.filter(c => c.isUnlimitedLike);
    let speedChampion = null;

    if (unlimitedCards.length > 0) speedChampion = [...unlimitedCards].sort((a, b) => a.bestRate - b.bestRate)[0];
    else speedChampion = costChampion;

    return { costChampion, speedChampion };
}

// --- AI 回傳清洗與白名單過濾 (防白屏 & 防幽靈卡) ---
function sanitizeAIResponse(res, topupWhitelist) {
    const cleaned = {};
    if (!res || typeof res !== 'object') return cleaned;

    const safeNum = (val) => {
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        if (typeof val === 'string') {
            const parsed = Number(val.replace(/,/g, '').replace(/[^\d.-]/g, ''));
            return isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    };
    const safeArray = (arr) => Array.isArray(arr) ? arr : [];
    const safeObject = (obj) => (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
    const safeBool = (val) => {
        if (typeof val === 'boolean') return val;
        if (typeof val === 'string') {
            const lower = val.trim().toLowerCase();
            return lower === 'true' || lower === '1';
        }
        if (typeof val === 'number') return val === 1;
        return Boolean(val);
    };
    const localNormalizeStr = (str) => (typeof str === 'string' ? str.trim().replace(/\s+/g, ' ') : '');

    const normalizedWhitelist = safeArray(topupWhitelist).map(localNormalizeStr).filter(Boolean);

    // --- Global Mode 洗滌 ---
    if (res.asset_strategy_review) {
        const asr = safeObject(res.asset_strategy_review);
        let pUse = safeArray(asr.priority_use).map(i => {
            const si = safeObject(i);
            return { asset_name: String(si.asset_name || ''), reason: String(si.reason || '') };
        });
        let kReserve = safeArray(asr.keep_in_reserve).map(i => {
            const si = safeObject(i);
            return { asset_name: String(si.asset_name || ''), reason: String(si.reason || '') };
        });

        if (pUse.length > 1) {
            const overflow = pUse.slice(1);
            pUse = [pUse[0]];
            kReserve = kReserve.concat(overflow);
        }

        cleaned.asset_strategy_review = {
            overall_status: String(asr.overall_status || ''),
            priority_use: pUse,
            keep_in_reserve: kReserve,
            do_not_use_yet: safeArray(asr.do_not_use_yet).map(i => {
                const si = safeObject(i);
                return { asset_name: String(si.asset_name || ''), reason: String(si.reason || '') };
            })
        };
    }
    if (res.top_ranked_destinations) {
        cleaned.top_ranked_destinations = safeArray(res.top_ranked_destinations).map(d => {
            const sd = safeObject(d);
            return {
                rank: safeNum(sd.rank),
                route_name: String(sd.route_name || sd.destination || ''),
                is_positioning_required: safeBool(sd.is_positioning_required),
                positioning_strategy: String(sd.positioning_strategy || ''),
                feasibility_status: String(sd.feasibility_status || ''),
                value_potential: String(sd.value_potential || ''),
                est_tax_burden: String(sd.est_tax_burden || ''),
                topup_difficulty: String(sd.topup_difficulty || ''),
                final_verdict: String(sd.final_verdict || ''),
                sort_reason: String(sd.sort_reason || '')
            };
        });
    }
    cleaned.not_recommended_routes = safeArray(res.not_recommended_routes).map(r => {
        const sr = safeObject(r);
        return { destination: String(sr.destination || ''), reason: String(sr.reason || '') };
    });
    cleaned.contextual_note = String(res.contextual_note || '');

    // --- Specific Mode 洗滌 ---
    if (res.feasibility) {
        const fs = safeObject(res.feasibility);
        cleaned.feasibility = {
            is_achievable: safeBool(fs.is_achievable),
            target_est_miles: safeNum(fs.target_est_miles),
            current_effective_miles: safeNum(fs.current_effective_miles),
            shortfall: safeNum(fs.shortfall)
        };
    }

    if (res.four_core_strategies) {
        const fcs = safeObject(res.four_core_strategies);
        cleaned.four_core_strategies = {};
        ['direct_flight', 'low_tax', 'alliance_sweetspot', 'open_jaw_backup'].forEach(key => {
            const item = safeObject(fcs[key]);
            cleaned.four_core_strategies[key] = {
                route_details: String(item.route_details || ''),
                pros_cons: String(item.pros_cons || '')
            };
        });
    }

    if (res.topup_recommendations) {
        cleaned.topup_recommendations = safeArray(res.topup_recommendations)
            .filter(t => {
                const st = safeObject(t);
                const normCard = localNormalizeStr(st.recommended_card);
                return normalizedWhitelist.includes(normCard);
            })
            .map(t => {
                const st = safeObject(t);
                return {
                    topup_type: String(st.topup_type || ''),
                    recommended_card: localNormalizeStr(st.recommended_card),
                    trigger_scenario: String(st.trigger_scenario || ''),
                    math_formula: String(st.math_formula || ''),
                    required_spend_twd: safeNum(st.required_spend_twd)
                };
            });
    }

    return cleaned;
}

async function startAIDiagnosis(mode) {
    const key = safeGetItem('GEMINI_API_KEY');
    if (!key) { showModal('aiIntroModal'); return; }

    const contentBox = document.getElementById('ai-report-content');
    const modalTitle = document.getElementById('ai-modal-title');

    modalTitle.innerHTML = mode === 'global' ? '<svg class="me-2" style="width:20px;height:20px; color:#6d28d9;"><use href="#icon-sparkle"/></svg>全局資產價值指標 (戰略紫)' : '<svg class="me-2" style="width:20px;height:20px; color:#2563eb;"><use href="#icon-target"/></svg>指定航線達成方案 (精準藍)';
    contentBox.innerHTML = '<div class="tdc-text-center py-5 text-muted"><div class="spinner-border text-primary tdc-mb-3"></div><br>正在連接 Gemini 大腦，執行轉點估值與極限航線兵推...</div>';
    showModal('aiReportModal');

    try {
        const db = loadDB();

        // 1. 組裝 AIPayload：資產正規化與隔離
        let totalEffectiveMiles = 0;
        let totalRawPoints = 0;
        const normalizedAssets = [];
        const blockedRawAssets = [];

        db.warehouse.forEach((item, idx) => {
            if (!item || typeof item !== 'object') return;

            let currentVal = Number(item.current);
            if (isNaN(currentVal)) currentVal = 0;

            const safeName = (typeof item.name === 'string' && item.name.trim() !== '') ? item.name.trim() : '未命名資產';
            const safeType = ['raw', 'airline', 'transfer'].includes(item.type) ? item.type : 'raw';

            if(safeType === 'raw') {
                blockedRawAssets.push({ name: safeName, raw_points: currentVal });
                totalRawPoints += currentVal;
            } else {
                if(!plannerSelectedAssets.has(idx)) return;

                let uPts = Number(item.unitPoints);
                if (isNaN(uPts) || uPts === 0) uPts = 1;
                let uMiles = Number(item.unitMiles) || 0;
                let bReq = Number(item.bonusReq) || 0;
                let bGive = Number(item.bonusGive) || 0;

                let effMiles = safeType === 'transfer' ? Math.trunc(currentVal * (uMiles/uPts)) + ((bReq > 0) ? Math.trunc(currentVal / bReq) * bGive : 0) : currentVal;
                totalEffectiveMiles += effMiles;
                let srcProg = safeName + (safeType === 'airline' ? ' (航空哩程)' : ' (可轉點信用卡/飯店積分)');
                normalizedAssets.push({ source_program: srcProg, type: safeType, effective_miles: effMiles, original_points: currentVal });
            }
        });

        const assetSummary = {
            totalRawPoints,
            isNewbie: totalEffectiveMiles < 10000,
            hasDebt: totalEffectiveMiles < 0,
            crucial_rule: "Never sum different airline miles together."
        };

        // 2. 組裝 AIPayload：基礎卡包白名單
        const baseTopupCandidates = buildTopupCandidates(db);

        // 3. 組裝 AIPayload：目標參數與出發地基地
        const baseLocationEl = document.getElementById('planner-from');
        const baseLocation = baseLocationEl ? baseLocationEl.options[baseLocationEl.selectedIndex].text : '台灣';
        let userTarget = null;
        if(mode === 'specific') {
            const toEl = document.getElementById('planner-to');
            const classEl = document.getElementById('planner-class');
            userTarget = {
                base_location: baseLocation,
                from: baseLocation,
                to: toEl ? toEl.options[toEl.selectedIndex].text : '',
                cabinClass: classEl ? classEl.options[classEl.selectedIndex].text : '',
                tripType: document.getElementById('planner-trip-type').checked ? "來回" : "單程"
            };
        } else {
            userTarget = { base_location: baseLocation };
        }

        // 掛接 B: 依據 userTarget 資訊與 Alias 正規化白名單過濾無效補血卡
        const mainTargetEl = document.getElementById('redemption-target');
        const targetVal = mainTargetEl ? mainTargetEl.value : 'ALL';

        let topupCandidates = baseTopupCandidates;
        if (targetVal !== 'ALL') {
            const tPartnersConfig = getTransferPartnersConfig();

            topupCandidates = baseTopupCandidates.filter(c => {
                const cardName = c.cardName || '';
                const cardId = c.id || '';

                let poolName = null;
                if (cardId === 'hsbc_live') {
                    poolName = '匯豐Live+積分';
                } else if (cardId === 'hsbc_inf') {
                    poolName = '匯豐 旅人積分';
                } else if (!cardId) {
                    if (cardName === '匯豐 Live+') poolName = '匯豐Live+積分';
                    else if (cardName === '匯豐 旅人無限') poolName = '匯豐 旅人積分';
                }

                if (!poolName) {
                    const cardNorm = normalizeAirlineCode(cardName);
                    if (targetVal === 'CI') return cardNorm === 'CI';
                    if (targetVal === 'AM_BR') return cardNorm === 'CX' || cardNorm === 'BR';
                    return true;
                }

                const poolConfig = tPartnersConfig[poolName];
                if (poolConfig && Array.isArray(poolConfig.supported_partners)) {
                    const supportedNorms = poolConfig.supported_partners.map(p => normalizeAirlineCode(p));
                    if (targetVal === 'CI') return supportedNorms.includes('CI');
                    if (targetVal === 'AM_BR') return supportedNorms.includes('CX') || supportedNorms.includes('BR');
                }

                return false;
            });
        }

        const { costChampion, speedChampion } = calculateBestTopup(topupCandidates);

        const aiPayload = {
            assetSummary,
            normalizedAssets,
            blockedRawAssets,
            topupCandidates,
            recommendedTopupByCost: costChampion,
            recommendedTopupBySpeed: speedChampion,
            userTarget
        };
        const currentYear = new Date().getFullYear();

        // 4. 構建 System Prompt 與 JSON Schema
        const globalSchema = `{
  "asset_strategy_review": {
    "overall_status": "String",
    "priority_use": [{"asset_name": "String", "reason": "String"}],
    "keep_in_reserve": [{"asset_name": "String", "reason": "String"}],
    "do_not_use_yet": [{"asset_name": "String", "reason": "String"}]
  },
  "top_ranked_destinations": [
    {"rank": 1, "route_name": "String (起迄/艙等/單來回)", "is_positioning_required": false, "positioning_strategy": "String", "feasibility_status": "String (極短！15字以內！如：已達成 / 尚缺5000哩)", "value_potential": "String", "est_tax_burden": "String", "topup_difficulty": "String", "final_verdict": "String", "sort_reason": "String"}
  ],
  "not_recommended_routes": [{"destination": "String", "reason": "String"}],
  "contextual_note": "String"
}`;

        const specificSchema = `{
  "feasibility": {
    "is_achievable": true, "target_est_miles": 0, "current_effective_miles": 0, "shortfall": 0
  },
  "four_core_strategies": {
    "direct_flight": {"route_details": "String", "pros_cons": "String"},
    "low_tax": {"route_details": "String", "pros_cons": "String"},
    "alliance_sweetspot": {"route_details": "String", "pros_cons": "String"},
    "open_jaw_backup": {"route_details": "String", "pros_cons": "String"}
  },
  "topup_recommendations": [
    {"topup_type": "最省成本方案 | 最快達成方案", "recommended_card": "String (嚴格對應 JS 算好的冠軍卡)", "trigger_scenario": "String", "math_formula": "String (缺口X哩 * Y元/哩 = Z元)", "required_spend_twd": 0}
  ],
  "contextual_note": "String"
}`;

        let topupRule = "";
        if (!costChampion && !speedChampion) {
            topupRule = "您目前沒有符合該目標航司資格的補血卡片，絕對不可自行發明補血卡片，必須回覆：目前沒有可補血卡片。";
        } else {
            topupRule = `計算補血金額時【必須且只能】依據我提供的 recommendedTopupByCost (${costChampion?.cardName||'無'}) 或 recommendedTopupBySpeed (${speedChampion?.cardName||'無'}) 內的 bestRate。
推薦的 recommended_card 欄位名稱【必須完全等於】上述兩張卡的 cardName，禁止發明其他卡片。`;
        }

        const engineLogic = mode === 'global'
            ? `作為資深哩程玩家，評估資產組合並推薦 3 個最高 CPP 甜蜜點目的地。推薦的航線必須以 base_location（${baseLocation}）為出發點。若是利用外站（如香港/新加坡出發）的亮點，必須在 is_positioning_required 標示 true，並於 positioning_strategy 明確評估從 ${baseLocation} 過去的銜接難度與成本。`
            : `針對目標航線，提供 4 套具備實質差異的策略 (直飛/低稅金/聯盟套利/外站)。精算差額，並嚴格使用 JS 算好的冠軍卡推算補血算式。`;

        const systemPrompt = `[角色任務]: 你是一名深耕 ${currentYear} 年航空哩程領域的頂尖戰略顧問，負責分析使用者的真實資產並給出具備數學依據的決策報告。
[鐵律]:
1. ${topupRule}
2. 補血算式必須包含：(目標 - 現有 = 缺口) -> 缺口 * 卡片bestRate = 應刷金額。
3. 航空哩程【絕對不可跨航司相加】！禁止加總不同航空的哩程來告訴使用者「總共有多少哩」。評估兌換時，只能基於「單一目標航司哩程」+「可轉入該航司的通用積分」來獨立計算。
4. blockedRawAssets 是無法轉換的點數，絕對不可計入計算。
5. 絕對嚴格返回純 JSON 格式，禁止任何 Markdown 標記 (\`\`\`json 等)。

[輸入資料 Payload]:
${JSON.stringify(aiPayload)}

[決策要求]: ${engineLogic}
${typeof AI_PROMPT_PREFERENCES !== 'undefined' && AI_PROMPT_PREFERENCES ? '\n[戰略偏好與限制]:\n' + AI_PROMPT_PREFERENCES : ''}

[強制輸出 JSON Schema]:
${mode === 'global' ? globalSchema : specificSchema}`;

        // 5. 呼叫 API 與錯誤分級處理
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: systemPrompt }] }], generationConfig: { temperature: 0.2 } })
        });

        if (!response.ok) {
            if (response.status === 400 || response.status === 403) throw new Error("API 金鑰無效或權限不足，請至設定頁確認。");
            throw new Error(`伺服器回應異常 (Status: ${response.status})`);
        }

        let data;
        try {
            data = await response.json();
        } catch(e) {
            throw new Error("API 回傳格式異常 (非預期結構)。");
        }

        let aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        let rawJsonRes;
        try {
            const jsonStart = aiText.indexOf('{'); const jsonEnd = aiText.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd !== -1) { aiText = aiText.substring(jsonStart, jsonEnd + 1); }
            rawJsonRes = JSON.parse(aiText);
        } catch(e) {
            throw new Error("AI 回傳格式異常 (JSON 解析失敗)，請再試一次。");
        }

        // 6. 白名單縮限與資料清洗
        const strictWhitelist = [costChampion?.cardName, speedChampion?.cardName].filter(Boolean);
        const res = sanitizeAIResponse(rawJsonRes, strictWhitelist);

        if (typeof normalizeAssetPriorityBuckets === 'function') {
            res.asset_strategy_review = normalizeAssetPriorityBuckets(res.asset_strategy_review);
        }
        if (typeof applyFormatToAllFields === 'function') {
            applyFormatToAllFields(res);
        }

        // 7. UI 渲染
        const hasCustomAirline = db.warehouse.some(a =>
            a && a.type === 'airline' && normalizeAirlineCode(a.targetAirline) === 'UNKNOWN'
        );

        let extraWarningHtml = '';
        if (hasCustomAirline) {
            extraWarningHtml = `<div class="p-3 mb-3 bg-warning bg-opacity-10 border border-warning rounded-3 small text-dark" style="line-height: 1.5; text-align: justify;">⚠️ <b class="text-danger">系統高風險提示：</b><br>偵測到您的資產庫包含自由新增且非系統已知之航司。系統推薦路線以內建卡別主要可兌換之航司為主；針對自建航司，系統辨識力有限，AI 推估錯誤率顯著較高。<br>請自行查核該航司官方開票、兌換與可補血規則，本程式不負相關責任。</div>`;
        }

        const fixedDisclaimer = `${extraWarningHtml}<div class="mt-4 pt-3 border-top tdc-text-center"><small class="text-muted d-block" style="line-height: 1.6; text-align: justify;">【系統聲明】您的卡片費率與現有哩程餘額為系統已知事實；預估消耗、稅費、可行性與機位狀態為 AI 策略推估，實際仍以官方航司開票與兌換規則為準。<br><br>本系統推薦路線以內建卡別主要可兌換之航司路線為主；使用者自由新增之航司為系統難以完整判別之對象，錯誤率較高。若因自行新增航司或卡別而產生計算、判定或推薦落差，本程式不負相關責任。<br><br><span class="text-primary-dark fw-bold">${formatMD(res.contextual_note)}</span></small></div>`;

        if (mode === 'global') {
            const asr = res.asset_strategy_review || {};
            contentBox.innerHTML = `
                <div class="ai-level1-card mb-4 shadow-sm" style="background:#1e293b;">
                    <div class="text-muted small tdc-mb-2">資產戰略總評</div>
                    <div class="fw-bold text-white" style="font-size: 1.2rem; line-height: 1.4;">${formatMD(asr.overall_status)}</div>
                </div>

                <div class="tdc-mb-3">
                    ${(asr.priority_use || []).map(a => `<div class="tdc-mb-1 p-2 bg-success text-success bg-opacity-10 border border-success border-opacity-25 rounded-3 small">✅ <b>優先動用：${formatMD(a.asset_name)}</b> - ${formatMD(a.reason)}</div>`).join('')}
                    ${(asr.keep_in_reserve || []).map(a => `<div class="tdc-mb-1 p-2 bg-primary text-primary bg-opacity-10 border border-primary border-opacity-25 rounded-3 small">🛡️ <b>建議保留：${formatMD(a.asset_name)}</b> - ${formatMD(a.reason)}</div>`).join('')}
                    ${(asr.do_not_use_yet || []).map(a => `<div class="p-2 bg-danger text-danger bg-opacity-10 border border-danger border-opacity-25 rounded-3 small">🚫 <b>暫不建議：${formatMD(a.asset_name)}</b> - ${formatMD(a.reason)}</div>`).join('')}
                </div>

                <h6 class="fw-bold tdc-mb-3 px-1 mt-4" style="color:#6d28d9;"><svg class="lucide me-1"><use href="#icon-target"/></svg>高價值候選目的地 Top 3</h6>
                <div class="mb-4">
                    ${(res.top_ranked_destinations || []).map(r => `
                        <div class="card-box p-3 tdc-mb-3 border border-primary border-opacity-25 shadow-sm" style="background:#f8fafc; border-radius:16px;">
                            <div class="fw-bold text-dark fs-6 tdc-mb-2" style="line-height:1.4;"><span class="badge bg-primary me-2">No.${r.rank}</span>${formatMD(r.route_name)}</div>

                            <div class="small p-2 rounded-3 tdc-mb-2 ${String(r.feasibility_status).includes('達成') ? 'bg-success bg-opacity-10 text-success border border-success border-opacity-25' : 'bg-warning bg-opacity-10 text-dark border border-warning border-opacity-25'}">
                                <span class="fw-bold">${String(r.feasibility_status).includes('達成') ? '✅ 狀態：' : '⚠️ 狀態：'}</span>${formatMD(r.feasibility_status)}
                            </div>

                            <div class="small text-secondary tdc-mb-2" style="line-height:1.6;">${formatMD(r.value_potential)}</div>
                            ${r.is_positioning_required ? `<div class="small bg-warning bg-opacity-10 border border-warning rounded-3 p-2 tdc-mb-2 text-dark"><b class="text-danger">⚠️ 需外站出發</b><br>${formatMD(r.positioning_strategy)}</div>` : ''}
                            <div class="tdc-flex flex-wrap gap-2 tdc-mb-2 border-top pt-2 mt-2">
                                <span class="ai-tag tag-tax">稅費: ${formatMD(r.est_tax_burden)}</span>
                                <span class="ai-tag tag-hub">補血難度: ${formatMD(r.topup_difficulty)}</span>
                            </div>
                            <div class="small text-primary-dark fw-bold mt-1 bg-white p-2 rounded-3 border">✨ 結論：${formatMD(r.final_verdict)}</div>
                        </div>
                    `).join('')}
                </div>

                ${(res.not_recommended_routes && res.not_recommended_routes.length > 0) ? `
                <h6 class="fw-bold tdc-mb-2 px-1 mt-3 text-secondary"><svg class="lucide me-1"><use href="#icon-warn"/></svg>不推薦浪費清單</h6>
                <div class="bg-light border rounded-3 p-2 mb-3">
                    ${res.not_recommended_routes.map(r => `<div class="small tdc-mb-1 text-muted">• <b class="text-dark">${formatMD(r.destination)}</b>: ${formatMD(r.reason)}</div>`).join('')}
                </div>` : ''}

                ${fixedDisclaimer}
            `;
        } else {
            const fs = res.feasibility || {};
            contentBox.innerHTML = `
                <div class="p-3 tdc-mb-3 border-0 shadow-sm" style="background:#f8fafc; border-radius:16px; border-left: 4px solid ${fs.is_achievable ? '#10b981' : '#f59e0b'} !important;">
                    <div class="tdc-flex tdc-justify-between tdc-align-center tdc-mb-2">
                        <h6 class="fw-bold tdc-m-0 text-dark">達成狀態判定</h6>
                        <span class="badge ${fs.is_achievable ? 'bg-success' : 'bg-warning text-dark'} px-3">${fs.is_achievable ? '✅ 資源足夠' : '⚠️ 尚有缺口'}</span>
                    </div>
                    <div class="progress tdc-mb-2" style="height: 8px;">
                        <div class="progress-bar ${fs.is_achievable ? 'bg-success' : 'bg-warning'}" style="width: ${Math.min(100, ((fs.current_effective_miles || 0)/(fs.target_est_miles || 1))*100)}%"></div>
                    </div>
                    <div class="tdc-flex tdc-justify-between small fw-bold text-muted">
                        <span>預估目標: ${Number(fs.target_est_miles).toLocaleString()}</span>
                        <span class="${fs.is_achievable ? 'text-success' : 'text-danger'}">${fs.is_achievable ? '火力充足' : `缺口: ${Number(fs.shortfall).toLocaleString()} 哩`}</span>
                    </div>
                </div>

                <h6 class="fw-bold tdc-mb-3 px-1 mt-4" style="color:#2563eb;"><svg class="lucide me-1"><use href="#icon-map"/></svg>四核心戰略解析</h6>
                <div class="mb-4">
                    ${['direct_flight', 'low_tax', 'alliance_sweetspot', 'open_jaw_backup'].map(key => {
                        const strat = (res.four_core_strategies || {})[key];
                        if (!strat) return '';
                        let title = ''; let icon = '';
                        if(key==='direct_flight') { title='第一優先：兩點一線直飛'; icon='✈️'; }
                        else if(key==='low_tax') { title='第二優先：低稅金航線'; icon='💰'; }
                        else if(key==='alliance_sweetspot') { title='第三優先：同聯盟高CP'; icon='🤝'; }
                        else if(key==='open_jaw_backup') { title='第四優先：開口備選'; icon='🗺️'; }

                        return `
                        <div class="card-box p-3 tdc-mb-3 border-0 shadow-sm" style="background:#ffffff; border: 1px solid #e2e8f0; border-radius:16px;">
                            <div class="fw-bold fs-6 tdc-mb-2 text-primary-dark">${icon} ${title}</div>
                            <div class="small text-dark fw-bold tdc-mb-2 pb-2 border-bottom">${formatMD(strat.route_details)}</div>
                            <div class="small text-secondary m-0" style="line-height:1.6;">${formatMD(strat.pros_cons)}</div>
                        </div>`;
                    }).join('')}
                </div>

                ${(!fs.is_achievable && Number(fs.shortfall) > 0) ? `
                <div class="ai-level4-box shadow-sm mb-4 bg-warning bg-opacity-10 border-warning">
                    <div class="tdc-mb-3 text-warning fw-bold tdc-flex tdc-align-center" style="color:#b45309;"><svg class="lucide me-2"><use href="#icon-calc"/></svg>精確補血指派</div>
                    ${(res.topup_recommendations && res.topup_recommendations.length > 0) ?
                        res.topup_recommendations.map(t => `
                        <div class="bg-white p-3 rounded-3 border tdc-mb-2">
                            <div class="fw-bold text-dark tdc-mb-1">${formatMD(t.topup_type)}：使用 ${formatMD(t.recommended_card)}</div>
                            <div class="small text-muted tdc-mb-2">觸發情境：${formatMD(t.trigger_scenario)}</div>
                            <div class="ai-json-patch text-success border border-success bg-success bg-opacity-10 tdc-mb-2">${formatMD(t.math_formula)}</div>
                            <div class="tdc-text-end fw-bold text-danger fs-5">應刷 NT$ ${Number(t.required_spend_twd).toLocaleString()}</div>
                        </div>`).join('')
                        : `<div class="bg-white p-4 rounded-3 border tdc-text-center">
                            <svg class="lucide text-muted tdc-mb-2" style="width:24px;height:24px;margin: 0 auto 8px; display: block;"><use href="#icon-warn"/></svg>
                            <div class="small text-muted fw-bold">AI 補血建議未通過系統驗證，已自動隱藏，<br>請重新執行一次診斷。</div>
                           </div>`
                    }
                </div>` : ''}

                ${fixedDisclaimer}
            `;
        }
    } catch (error) {
        contentBox.innerHTML = `<div class="tdc-text-center py-5 text-danger fw-bold">⚠️ AI 診斷連線失敗。<br><small class="text-muted fw-normal mt-2 d-block">錯誤: ${escapeHTML(error.message)}<br>請檢查金鑰狀態，或 AI 回傳格式發生異常。</small></div>`;
    }
}
