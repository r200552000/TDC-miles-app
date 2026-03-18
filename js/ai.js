/* ==========================================
   AI 戰略引擎 - Gemini 診斷與報告生成 (保守輸出終極版)
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

// --- AI 攔截防幻覺後處理 (二次過濾) ---
function enforceConservativePhrasing(text) {
    if (!text || typeof text !== 'string') return text;
    let sanitized = text;
    // 狀態斷言降級
    sanitized = sanitized.replace(/目前可飛|現在還有|有飛|目前有開|目前仍有營運|現在仍有營運/g, '理論上可對應(需確認當季班表)');
    // 產品斷言降級
    sanitized = sanitized.replace(/有頭等艙|配置頭等艙|目前仍提供頭等艙/g, '歷史/理論上具備頭等艙(需確認實際機型)');
    sanitized = sanitized.replace(/有商務艙|配置商務艙|目前仍提供商務艙/g, '歷史/理論上具備商務艙(需確認實際機型)');
    sanitized = sanitized.replace(/可以換|直接換這條|現在可換/g, '規則上可兌換(需確認放票狀態)');
    // 排名與強推薦斷言降級
    sanitized = sanitized.replace(/推薦這條線|這條線適合換|最推薦|首選路線|首選方案|第一名路線|最值得換/g, '理論高價值選項');
    return sanitized;
}

// --- 去重 Helper ---
const dedupeByAssetName = (arr) => {
    const seen = new Set();
    return arr.filter(item => {
        const key = String(item.asset_name || '').trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

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
    const safeConservativeStr = (val) => enforceConservativePhrasing(String(val || ''));

    const normalizedWhitelist = safeArray(topupWhitelist).map(localNormalizeStr).filter(Boolean);

    // --- Global Mode 洗滌 ---
    if (res.asset_strategy_review) {
        const asr = safeObject(res.asset_strategy_review);
        
        let pUse = [];
        let kReserve = [];
        let dNotUse = [];
        
        const isTransfer = (name) => name.includes('可轉點信用卡/飯店積分');
        const transferMsg = '此為可靈活轉換的積分，較適合作為保留彈性的調度資產，現階段不建議直接併入單一航司哩程餘額計算。';

        safeArray(asr.priority_use).forEach(i => {
            const si = safeObject(i);
            const name = String(si.asset_name || '');
            if (isTransfer(name)) {
                kReserve.push({ asset_name: name, reason: transferMsg });
            } else {
                pUse.push({ asset_name: name, reason: safeConservativeStr(si.reason) });
            }
        });

        safeArray(asr.keep_in_reserve).forEach(i => {
            const si = safeObject(i);
            const name = String(si.asset_name || '');
            if (isTransfer(name)) {
                kReserve.push({ asset_name: name, reason: transferMsg });
            } else {
                kReserve.push({ asset_name: name, reason: safeConservativeStr(si.reason) });
            }
        });

        safeArray(asr.do_not_use_yet).forEach(i => {
            const si = safeObject(i);
            const name = String(si.asset_name || '');
            if (isTransfer(name)) {
                kReserve.push({ asset_name: name, reason: transferMsg });
            } else {
                dNotUse.push({ asset_name: name, reason: safeConservativeStr(si.reason) });
            }
        });

        // 執行去重邏輯
        pUse = dedupeByAssetName(pUse);
        kReserve = dedupeByAssetName(kReserve);
        dNotUse = dedupeByAssetName(dNotUse);

        if (pUse.length > 1) {
            const overflow = pUse.slice(1);
            pUse = [pUse[0]];
            kReserve = kReserve.concat(overflow);
            // 由於可能從 pUse 溢出到 kReserve，再次去重
            kReserve = dedupeByAssetName(kReserve);
        }

        cleaned.asset_strategy_review = {
            overall_status: safeConservativeStr(asr.overall_status),
            priority_use: pUse,
            keep_in_reserve: kReserve,
            do_not_use_yet: dNotUse
        };
    }
    
    if (res.candidate_routes) {
        cleaned.candidate_routes = safeArray(res.candidate_routes).map(d => {
            const sd = safeObject(d);
            return {
                route_name: String(sd.route_name || sd.destination || ''),
                is_positioning_required: safeBool(sd.is_positioning_required),
                positioning_strategy: safeConservativeStr(sd.positioning_strategy),
                theoretical_value: safeConservativeStr(sd.theoretical_value),
                est_tax_burden: String(sd.est_tax_burden || ''),
                current_verification_status: safeConservativeStr(sd.current_verification_status),
                risk_note: safeConservativeStr(sd.risk_note),
                recommendation_level: safeConservativeStr(sd.recommendation_level)
            };
        });
    }
    
    cleaned.not_recommended_routes = safeArray(res.not_recommended_routes).map(r => {
        const sr = safeObject(r);
        return { destination: String(sr.destination || ''), reason: safeConservativeStr(sr.reason) };
    });
    cleaned.contextual_note = safeConservativeStr(res.contextual_note);

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

    if (res.theoretical_paths) {
        const tp = safeObject(res.theoretical_paths);
        cleaned.theoretical_paths = {};
        ['direct_flight', 'low_tax', 'alliance_sweetspot', 'open_jaw_backup'].forEach(key => {
            const item = safeObject(tp[key]);
            cleaned.theoretical_paths[key] = {
                route_details: safeConservativeStr(item.route_details),
                current_verification_status: safeConservativeStr(item.current_verification_status),
                risk_note: safeConservativeStr(item.risk_note),
                tax_note: safeConservativeStr(item.tax_note)
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

// --- AI 保守輸出模式 (現況閘門) ---
function buildConservativeSystemPrompt() {
    return `
你是「TDC環哩匯」的資深哩程策略顧問。你非常嚴謹、專業，且絕對不會在缺乏現況證據時給予盲目推測或肯定式推薦。

【重要前提：資料可信度降級】
你目前接收到的所有航線、距離帶 (Distance Zone)、兌換表格 (Award Chart) 與歷史艙等資訊，一律被視為「B級 (理論規則)」或「C級 (歷史推測)」資料。
你**完全沒有**「A級現況驗證資料」(如當前即時航班表、官方當下可售機位、近期開票實績)。
若資料未提供現役航班、現役艙等或現行可售性，你不得自行推定其存在，也不得補完成現況事實。

【強制輸出規範：保守模式】
基於缺乏 A 級資料，你進行任何兌換評估時，必須強制進入「保守輸出模式」，嚴格遵守以下規則：

1. 允許理論推演，但絕對禁止偽裝成現況斷言
你可以依據 B 級資料進行理論推演，例如：「若該航線目前仍有營運，依距離表理論上會落在某區間」、「若仍可依此規則兌換，理論所需哩程約為 X」。
但你【絕對禁止】將理論推演寫成現況斷言。嚴禁使用以下詞彙或其同義表達：
⛔ 「目前可飛」、「現在還有」、「有飛」、「目前有開」、「目前仍有營運」、「現在仍有營運」
⛔ 「有頭等艙」、「有商務艙」、「配置頭等艙」、「目前仍提供頭等艙」、「目前仍提供商務艙」
⛔ 「可以換」、「直接換這條」、「現在可換」

2. 禁止排序式強推薦
你不得給出具體排名的推薦清單，例如：
⛔ 「推薦這條線」、「這條線適合換」、「最推薦」、「首選路線」、「首選方案」、「第一名路線」、「最值得換」
你只能做規則說明、風險提醒與理論上的條件式推演。

3. 強制使用的保守替代句型
當必須評估具體路線或艙等時，請強制使用以下句型：
✅ 「距離表雖有列入，但仍需確認目前是否仍有航班/營運。」
✅ 「規則上可對應，但目前是否仍有營運需再確認。」
✅ 「歷史上曾出現過，不代表目前仍提供此艙等。」
✅ 「是否仍可飛/可換，需以官方現行航網與實際庫存為準。」
✅ 「因缺乏現況驗證，暫不建議直接列為推薦選項。」
✅ 「目前資料不足以確認是否仍提供。」

4. 負面與正面示範 (Few-Shot Examples)
❌ 錯誤：「國泰現在有飛馬爾地夫，可以直接換。」
⭕ 正確：「國泰的距離表上雖有馬爾地夫的對應標準，但是否仍有現行航班與可換艙等，需以當季航網與實際放票為準。」
❌ 錯誤：「台灣飛香港有頭等艙，可以優先考慮。」
⭕ 正確：「台灣飛香港歷史上曾出現過頭等艙，但不代表目前仍提供，暫不建議直接納入推薦考量。」

5. 條件式保底結尾
【注意】若你的回覆內容涉及「具體航線評估」、「具體艙等討論」或「兌換策略建議」時，請務必在該段落或文末補上這句提醒：
「最終仍需以航空公司現行航網、實際放票與當日可售艙等為準。」
(若僅為一般哩程制度說明或抽象規則整理，則不強制附加此句。)
`;
}

function buildCompactAIDiagnosisContext(aiPayload, mode) {
    const { assetSummary, normalizedAssets, blockedRawAssets, recommendedTopupByCost, recommendedTopupBySpeed, userTarget, topup_strict_rule } = aiPayload;

    let contextStr = `【診斷模式】: ${mode === 'global' ? '全局資產價值探索 (保守模式)' : '指定航線策略推演 (保守模式)'}\n`;
    contextStr += `【出發基地】: ${userTarget?.base_location || '未知'}\n`;
    if (mode === 'specific') {
        contextStr += `【目標航線】: ${userTarget.from} 飛往 ${userTarget.to} (${userTarget.tripType} / ${userTarget.cabinClass})\n`;
    }

    contextStr += `\n【資產總體摘要】:\n`;
    contextStr += `- 總未轉換點數 (Raw Points): ${assetSummary?.totalRawPoints || 0}\n`;
    contextStr += `- 是否為哩程新手 (<10k): ${assetSummary?.isNewbie || false}\n`;
    contextStr += `- 是否負債: ${assetSummary?.hasDebt || false}\n`;

    contextStr += `\n【可用資產清單 (有效哩程)】:\n`;
    if (normalizedAssets && normalizedAssets.length > 0) {
        normalizedAssets.forEach(a => {
            contextStr += `- ${a.source_program}: 折算有效哩程 ${a.effective_miles} 哩 (原始數量: ${a.original_points})\n`;
        });
    } else {
        contextStr += `- 無有效資產\n`;
    }

    contextStr += `\n【不可用資產 (絕對禁止計入)】:\n`;
    if (blockedRawAssets && blockedRawAssets.length > 0) {
        blockedRawAssets.forEach(a => {
            contextStr += `- ${a.name}: ${a.raw_points} 點\n`;
        });
    } else {
        contextStr += `- 無\n`;
    }

    contextStr += `\n【指定補血卡片】:\n`;
    contextStr += `- 成本最優卡: ${recommendedTopupByCost ? `${recommendedTopupByCost.cardName} (比例 ${recommendedTopupByCost.bestRate})` : '無'}\n`;
    contextStr += `- 速度最快卡: ${recommendedTopupBySpeed ? `${recommendedTopupBySpeed.cardName} (比例 ${recommendedTopupBySpeed.bestRate})` : '無'}\n`;

    contextStr += `\n【系統強制限制】:\n${topup_strict_rule}\n`;

    return contextStr;
}

function assembleAIPayload(engineLogic, compactContext, globalSchema, specificSchema, mode) {
    const systemPrompt = buildConservativeSystemPrompt();
    const currentYear = new Date().getFullYear();
    const baseSystemInstructions = `[角色任務]: 你是一名深耕 ${currentYear} 年航空哩程領域的頂尖戰略顧問，負責分析使用者的真實資產並給出具備數學依據的保守決策報告。
[鐵律]:
1. 航空哩程【絕對不可跨航司相加】！禁止加總不同航空的哩程來告訴使用者「總共有多少哩」。評估兌換時，只能基於「單一目標航司哩程」+「可轉入該航司的通用積分」來獨立計算。
2. 對於「可轉點信用卡/飯店積分」(transfer型資產)，必須將其視為「可靈活轉換的積分」，建議歸類為「建議保留(keep_in_reserve)」，並說明其較適合作為保留彈性的調度資產，現階段不建議直接併入單一航司餘額。絕對不可將其描述為「無法轉換」或「暫不建議」。
3. blockedRawAssets (raw型資產) 才是無法轉換的點數，絕對不可計入計算。
4. 絕對嚴格返回純 JSON 格式，禁止任何 Markdown 標記 (\`\`\`json 等)。

[決策要求]: ${engineLogic}
${typeof AI_PROMPT_PREFERENCES !== 'undefined' && AI_PROMPT_PREFERENCES ? '\n[戰略偏好與限制]:\n' + AI_PROMPT_PREFERENCES : ''}

[強制輸出 JSON Schema]:
${mode === 'global' ? globalSchema : specificSchema}`;

    return {
        system_instruction: {
            parts: [{ text: baseSystemInstructions + "\n\n" + systemPrompt }]
        },
        contents: [
            { role: "user", parts: [{ text: `[輸入資料 Context]:\n${compactContext}` }] }
        ],
        generationConfig: {
            temperature: 0.2
        }
    };
}


async function startAIDiagnosis(mode) {
    const key = safeGetItem('GEMINI_API_KEY');
    if (!key) { showModal('aiIntroModal'); return; }

    const contentBox = document.getElementById('ai-report-content');
    const modalTitle = document.getElementById('ai-modal-title');

    modalTitle.style.display = 'inline-flex';
    modalTitle.style.alignItems = 'center';
    modalTitle.style.gap = '8px';
    modalTitle.style.whiteSpace = 'nowrap';
    modalTitle.style.flexWrap = 'nowrap';
    modalTitle.innerHTML = mode === 'global' 
        ? '<svg style="width:20px;height:20px; color:#6d28d9; flex-shrink: 0;"><use href="#icon-sparkle"/></svg><span>全局資產價值指標（保守評估）</span>' 
        : '<svg style="width:20px;height:20px; color:#2563eb; flex-shrink: 0;"><use href="#icon-target"/></svg><span>指定航線達成方案（保守推演）</span>';

    contentBox.innerHTML = '<div class="tdc-text-center py-5 text-muted"><div class="spinner-border text-primary tdc-mb-3"></div><br>正在連接 Gemini 大腦，執行轉點估值與理論航線兵推...</div>';
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

        let topupRule = "";
        if (!costChampion && !speedChampion) {
            topupRule = "您目前沒有符合該目標航司資格的補血卡片，絕對不可自行發明補血卡片，必須回覆：目前沒有可補血卡片。";
        } else {
            topupRule = `計算補血金額時【必須且只能】依據我提供的 recommendedTopupByCost (${costChampion?.cardName||'無'}) 或 recommendedTopupBySpeed (${speedChampion?.cardName||'無'}) 內的 bestRate。推薦的 recommended_card 欄位名稱【必須完全等於】上述兩張卡的 cardName，禁止發明其他卡片。`;
        }
        
        // 將 topupRule 塞回 aiPayload，讓它跟著資料走
        const aiPayload = {
            assetSummary,
            normalizedAssets,
            blockedRawAssets,
            topupCandidates,
            recommendedTopupByCost: costChampion,
            recommendedTopupBySpeed: speedChampion,
            userTarget,
            topup_strict_rule: topupRule 
        };

        // 4. 構建 System Prompt 與 JSON Schema
        const globalSchema = `{
  "asset_strategy_review": {
    "overall_status": "String",
    "priority_use": [{"asset_name": "String", "reason": "String"}],
    "keep_in_reserve": [{"asset_name": "String", "reason": "String"}],
    "do_not_use_yet": [{"asset_name": "String", "reason": "String"}]
  },
  "candidate_routes": [
    {"route_name": "String (起迄/艙等/單來回)", "is_positioning_required": false, "positioning_strategy": "String", "theoretical_value": "String", "est_tax_burden": "String", "current_verification_status": "String (極短！如：需查證當季班表)", "risk_note": "String", "recommendation_level": "String (如：理論探討/保守觀望)"}
  ],
  "not_recommended_routes": [{"destination": "String", "reason": "String"}],
  "contextual_note": "String"
}`;

        const specificSchema = `{
  "feasibility": {
    "is_achievable": true, "target_est_miles": 0, "current_effective_miles": 0, "shortfall": 0
  },
  "theoretical_paths": {
    "direct_flight": {"route_details": "String", "current_verification_status": "String", "risk_note": "String", "tax_note": "String"},
    "low_tax": {"route_details": "String", "current_verification_status": "String", "risk_note": "String", "tax_note": "String"},
    "alliance_sweetspot": {"route_details": "String", "current_verification_status": "String", "risk_note": "String", "tax_note": "String"},
    "open_jaw_backup": {"route_details": "String", "current_verification_status": "String", "risk_note": "String", "tax_note": "String"}
  },
  "topup_recommendations": [
    {"topup_type": "最省成本方案 | 最快達成方案", "recommended_card": "String (嚴格對應 JS 算好的冠軍卡)", "trigger_scenario": "String", "math_formula": "String (缺口X哩 * Y元/哩 = Z元)", "required_spend_twd": 0}
  ],
  "contextual_note": "String"
}`;

        const engineLogic = mode === 'global'
            ? `評估資產組合並列出 3 個理論上具高 CPP 價值的候選目的地。禁止使用絕對排名，必須加上現況驗證提示。若是利用外站的亮點，必須在 is_positioning_required 標示 true，並於 positioning_strategy 明確評估銜接難度與風險。`
            : `針對目標航線，提供 4 套具備實質差異的理論策略路徑 (直飛/低稅金/聯盟套利/外站)。精算理論差額，並嚴格使用 JS 算好的冠軍卡推算補血算式。所有路徑必須加上保守的現況風險提示。`;

        const compactContext = buildCompactAIDiagnosisContext(aiPayload, mode);
        const requestPayload = assembleAIPayload(engineLogic, compactContext, globalSchema, specificSchema, mode);

        // 5. 呼叫 API 與錯誤分級處理
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
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

        // 6. 白名單縮限與資料清洗 (含保守語氣二次過濾)
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

                <h6 class="fw-bold tdc-mb-3 px-1 mt-4" style="color:#6d28d9;"><svg class="lucide me-1"><use href="#icon-target"/></svg>高價值理論候選目的地</h6>
                <div class="mb-4">
                    ${(res.candidate_routes || []).map(r => `
                        <div class="card-box p-3 tdc-mb-3 border border-primary border-opacity-25 shadow-sm" style="background:#f8fafc; border-radius:16px;">
                            <div class="fw-bold text-dark fs-6 tdc-mb-2" style="line-height:1.4;">${formatMD(r.route_name)}</div>

                            <div class="small p-2 rounded-3 tdc-mb-2 bg-warning bg-opacity-10 text-dark border border-warning border-opacity-25">
                                <span class="fw-bold">⚠️ 狀態：</span>${formatMD(r.current_verification_status)}
                            </div>

                            <div class="small text-secondary tdc-mb-2" style="line-height:1.6;">${formatMD(r.theoretical_value)}</div>
                            ${r.is_positioning_required ? `<div class="small bg-warning bg-opacity-10 border border-warning rounded-3 p-2 tdc-mb-2 text-dark"><b class="text-danger">⚠️ 需外站出發</b><br>${formatMD(r.positioning_strategy)}</div>` : ''}
                            <div class="tdc-flex flex-wrap gap-2 tdc-mb-2 border-top pt-2 mt-2">
                                <span class="ai-tag tag-tax">稅費: ${formatMD(r.est_tax_burden)}</span>
                            </div>
                            <div class="small text-danger fw-bold mt-1 bg-white p-2 rounded-3 border">🚨 風險提示：${formatMD(r.risk_note)}</div>
                            <div class="small text-primary-dark fw-bold mt-2 bg-light p-2 rounded-3 border">✨ 建議定位：${formatMD(r.recommendation_level)}</div>
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

                <h6 class="fw-bold tdc-mb-3 px-1 mt-4" style="color:#2563eb;"><svg class="lucide me-1"><use href="#icon-map"/></svg>四核心理論戰略推演</h6>
                <div class="mb-4">
                    ${['direct_flight', 'low_tax', 'alliance_sweetspot', 'open_jaw_backup'].map(key => {
                        const strat = (res.theoretical_paths || {})[key];
                        if (!strat) return '';
                        let title = ''; let icon = '';
                        if(key==='direct_flight') { title='路徑探討：兩點一線直飛'; icon='✈️'; }
                        else if(key==='low_tax') { title='路徑探討：低稅金航線'; icon='💰'; }
                        else if(key==='alliance_sweetspot') { title='路徑探討：同聯盟高CP'; icon='🤝'; }
                        else if(key==='open_jaw_backup') { title='路徑探討：開口備選'; icon='🗺️'; }

                        return `
                        <div class="card-box p-3 tdc-mb-3 border-0 shadow-sm" style="background:#ffffff; border: 1px solid #e2e8f0; border-radius:16px;">
                            <div class="fw-bold fs-6 tdc-mb-2 text-primary-dark">${icon} ${title}</div>
                            <div class="small text-dark fw-bold tdc-mb-2 pb-2 border-bottom">${formatMD(strat.route_details)}</div>
                            <div class="small text-warning-dark fw-bold mt-2 mb-1">⚠️ ${formatMD(strat.current_verification_status)}</div>
                            <div class="small text-danger mt-1 mb-2">🚨 風險: ${formatMD(strat.risk_note)}</div>
                            <div class="small text-secondary m-0" style="line-height:1.6;">稅金備註: ${formatMD(strat.tax_note)}</div>
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
