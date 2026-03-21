/* ==========================================
   卡片規則定義 & 上限管家
   ========================================== */

// ==========================================
// 上限管家與防護系統
// ==========================================
function getLimitKey(db, id, dateObj) {
    if (['taishin_cx'].includes(id)) return `${dateObj.getFullYear()}-${id}`;
    if (id.startsWith('custom_')) {
        const c = db.customCards.find(x => x && typeof x === 'object' && x.id === id);
        if (c && c.isAnnual) return `${dateObj.getFullYear()}-${id}`;
        let day = (c && c.billingDay) ? c.billingDay : 1;
        const offset = dateObj.getDate() > day ? 1 : 0;
        const d = new Date(dateObj.getFullYear(), dateObj.getMonth() + offset, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${id}`;
    }

    let billingId = id;
    if (['hsbc_live_selected', 'hsbc_live_asia', 'hsbc_live_task'].includes(id)) {
        billingId = 'hsbc_live';
    }

    let day = db.settings?.billingDays?.[billingId] || db.settings?.billingDays?.[billingId.split('_')[0]] || 1;
    const offset = dateObj.getDate() > day ? 1 : 0;
    const d = new Date(dateObj.getFullYear(), dateObj.getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${id}`;
}

function getLimitVal(id) {
    if (id === 'hsbc_live_selected') return 29600;
    if (id === 'hsbc_live_asia') return 20000;
    if (id === 'hsbc_live_task') return 20000;
    if (id === 'hsbc_live') return 29600;
    if (id === 'hsbc_inf') return 999999999;
    if (id === 'ctbc_ci_inf') return 60000;
    if (id === 'taishin_cx') return 1000000;
    if (id === 'ctbc_ci') return 80000;
    return 999999999;
}

// ==========================================
// 卡片運算規則定義
// ==========================================
const CARD_RULES = {
    'ctbc_ci_inf': {
        name: '中信 華航璀璨',
        ai_meta: { bestRate: 6.6, bestScenario: "生日海外實體", baseRate: 20, isUnlimitedLike: false },
        calc: (ctx) => {
            const blk = getBlocklistsConfig();
            const flags = getRuleFlagsConfig();

            if (blk.ctbc.some(w => ctx.kwKey.includes(w))) {
                return { miles: 0, note: '<span class="text-danger">🚫 非回饋項目</span>', consumedQuota: 0, consumedBonusMiles: 0, baseMiles: 0, bonusMilesGranted: 0, isWarning: false, warningType: 'none' };
            }

            const catStr = (ctx.cat || '').toLowerCase();
            const isExplicitOnlineCategory = ['online', 'ecom', 'ecommerce', 'shopping_online', 'online_shopping', '網購', '線上', '電商'].some(w => catStr.includes(w));

            const isMobileWallet = ctx.pay === 'apple_pay';
            const isThirdPartyPay = ctx.pay === 'line_pay';
            const isOnline = flags.strict_online.includes(ctx.cat) || ctx.pay === 'online' || isExplicitOnlineCategory;
            const isForeignPhysicalEligible = ctx.isForeign && !isOnline && !isThirdPartyPay && (ctx.pay === 'physical' || isMobileWallet);
            
            const isTravelOTA = ['agoda', 'airbnb', 'booking', 'booking.com', 'expedia', 'hotels', 'hotels.com', 'trip', 'trip.com'].some(w => ctx.kwKey.includes(w));
            const isMandarinAir = ['華信', 'mandarin', 'mandarin airlines'].some(w => ctx.kwKey.includes(w));
            const isCiEMall = ['emall', 'e mall', '華航emall', '華航 emall'].some(w => ctx.kwKey.includes(w));
            const isCiSkyBoutique = ['sky boutique', 'skyboutique', '華航sky boutique', '華航 sky boutique'].some(w => ctx.kwKey.includes(w));
            const isCiDutyFree = ['華航免稅', '機上免稅', 'duty free', 'inflight duty free'].some(w => ctx.kwKey.includes(w));

            let baseMiles = Math.trunc(ctx.twdBase / 20);
            let expectedBonusMiles = 0;
            let isBonus = false;
            let noteBase = '';

            // 第一層：生日 X3 (必須是生日月且為國外實體商店交易)
            if (ctx.isBirthday && isForeignPhysicalEligible) {
                expectedBonusMiles = baseMiles * 2;
                isBonus = true;
                noteBase = '🎂 生日海外實體 $6.6';
            } 
            // 第二層：一般 X2
            else if (
                isForeignPhysicalEligible || 
                ctx.cat === 'flight_ci' || 
                isMandarinAir || 
                isCiEMall || 
                isCiSkyBoutique || 
                isCiDutyFree || 
                (ctx.isForeign && isTravelOTA)
            ) {
                expectedBonusMiles = baseMiles * 1;
                isBonus = true;
                
                if (ctx.cat === 'flight_ci') {
                    noteBase = '✈️ 華航官網 $10';
                } else if (isForeignPhysicalEligible) {
                    noteBase = '🌍 海外實體消費 $10';
                } else if (ctx.isForeign && isTravelOTA) {
                    noteBase = '🏨 國外訂房平台 $10';
                } else {
                    noteBase = '🛍️ 華航相關通路/免稅 $10';
                }
            }

            let bonusMilesGranted = 0;
            let isWarning = false;
            let warningType = 'none';

            if (isBonus) {
                let limit = getLimitVal('ctbc_ci_inf');
                let limitKey = getLimitKey(ctx.db, 'ctbc_ci_inf', new Date());
                let usedBonus = ctx.db.limits[limitKey]?.usedBonusMiles || 0;
                let remainingBonus = Math.max(0, limit - usedBonus);

                bonusMilesGranted = Math.min(expectedBonusMiles, remainingBonus);

                if (expectedBonusMiles > remainingBonus) {
                    isWarning = true;
                    let warningNote = '';
                    if (remainingBonus <= 0) {
                        warningType = 'limit_exhausted';
                        warningNote = `<span class="text-danger fw-bold d-block mt-1">⚠️ 本月加碼額度已滿，後續僅享基本回饋 ($20/哩)</span>`;
                    } else {
                        warningType = 'partial_overflow';
                        warningNote = `<span class="text-danger fw-bold d-block mt-1">⚠️ 本筆超過剩餘加碼額度，僅部分哩程享加碼</span>`;
                    }
                    noteBase += warningNote;
                }
            }

            return {
                miles: baseMiles + bonusMilesGranted,
                note: isBonus ? noteBase : '一般消費 $20',
                consumedQuota: 0,
                consumedBonusMiles: bonusMilesGranted,
                baseMiles: baseMiles,
                bonusMilesGranted: bonusMilesGranted,
                isWarning: isWarning,
                warningType: warningType
            };
        }
    },

    'hsbc_live': {
        name: '匯豐 Live+',
        ai_meta: { bestRate: 34, bestScenario: "一般消費", baseRate: 34, isUnlimitedLike: false },
        calc: (ctx) => {
            let defaultConsumedMap = { hsbc_live_selected: 0, hsbc_live_asia: 0, hsbc_live_task: 0 };
            
            if (ctx.isEUR) return { miles: 0, note: '<span class="text-danger">🚫 歐盟/英國實體店不回饋</span>', consumedQuota: 0, consumedQuotaMap: defaultConsumedMap, isWarning: false, warningType: 'none' };
            const blk = getBlocklistsConfig();
            const kw = getKeywordsConfig();
            if (blk.hsbc_live.some(w => ctx.kwKey.includes(w))) return { miles: 0, note: '<span class="text-danger">🚫 非回饋項目</span>', consumedQuota: 0, consumedQuotaMap: defaultConsumedMap, isWarning: false, warningType: 'none' };
            
            const isMobileOrThirdPartyPay = ['apple_pay', 'line_pay'].includes(ctx.pay);
            let isAsian7Code = ctx.isForeign && ctx.currencyCode && ['JPY', 'SGD', 'MYR', 'VND', 'PHP', 'INR', 'LKR'].includes(ctx.currencyCode);
            let isAsian7 = isAsian7Code || (ctx.isForeign && kw.asia_7.some(w => ctx.kwKey.includes(w)));
            
            let basePts = ctx.twdBase * 0.0088;
            let bonusPts = 0;
            let noteHtml = '';
            let isWarning = false;
            let warningType = 'none';

            let consumedQuotaMap = {
                hsbc_live_selected: 0,
                hsbc_live_asia: 0,
                hsbc_live_task: 0
            };

            if (isMobileOrThirdPartyPay) {
                let finalNote = `行動支付/第三方支付 0.88% <small>1點=2哩</small><span class="text-muted d-block mt-1">綁定行動支付/第三方支付，不適用加碼</span>`;
                return {
                    miles: Math.trunc(basePts) * 2,
                    note: finalNote,
                    consumedQuota: 0,
                    isWarning: false,
                    warningType: 'none',
                    consumedQuotaMap: consumedQuotaMap
                };
            }

            let selectedLimitKey = getLimitKey(ctx.db, 'hsbc_live_selected', new Date());
            let selectedUsed = ctx.db.limits[selectedLimitKey]?.spend || 0;
            let selectedRemaining = Math.max(0, getLimitVal('hsbc_live_selected') - selectedUsed);

            let asiaLimitKey = getLimitKey(ctx.db, 'hsbc_live_asia', new Date());
            let asiaUsed = ctx.db.limits[asiaLimitKey]?.spend || 0;
            let asiaRemaining = Math.max(0, getLimitVal('hsbc_live_asia') - asiaUsed);

            let taskLimitKey = getLimitKey(ctx.db, 'hsbc_live_task', new Date());
            let taskUsed = ctx.db.limits[taskLimitKey]?.spend || 0;
            let taskRemaining = Math.max(0, getLimitVal('hsbc_live_task') - taskUsed);

            let hasSelected = false;
            let hasAsia = false;
            let hasTask = false;

            let hasLimitExhausted = false;
            let hasPartialOverflow = false;

            if (ctx.isLiveSelect) {
                hasSelected = true;
                let eligible = Math.min(ctx.twdBase, selectedRemaining);
                bonusPts += eligible * 0.03;
                consumedQuotaMap.hsbc_live_selected = eligible;
                
                if (ctx.twdBase > selectedRemaining) {
                    isWarning = true;
                    if (selectedRemaining <= 0) hasLimitExhausted = true;
                    else hasPartialOverflow = true;
                }
            }

            if (isAsian7) {
                hasAsia = true;
                let eligible = Math.min(ctx.twdBase, asiaRemaining);
                bonusPts += eligible * 0.01;
                consumedQuotaMap.hsbc_live_asia = eligible;

                if (ctx.twdBase > asiaRemaining) {
                    isWarning = true;
                    if (asiaRemaining <= 0) hasLimitExhausted = true;
                    else hasPartialOverflow = true;
                }
            }

            if (ctx.db.settings?.hsbc_autopay) {
                hasTask = true;
                let eligible = Math.min(ctx.twdBase, taskRemaining);
                bonusPts += eligible * 0.01;
                consumedQuotaMap.hsbc_live_task = eligible;

                if (ctx.twdBase > taskRemaining) {
                    isWarning = true;
                    if (taskRemaining <= 0) hasLimitExhausted = true;
                    else hasPartialOverflow = true;
                }
            }

            if (hasLimitExhausted) {
                warningType = 'limit_exhausted';
                noteHtml += `<span class="text-danger fw-bold d-block mt-1">⚠️ 本期加碼額度已滿，後續僅享 0.88% 基礎回饋</span>`;
            } else if (hasPartialOverflow) {
                warningType = 'partial_overflow';
                noteHtml += `<span class="text-danger fw-bold d-block mt-1">⚠️ 本筆超過剩餘加碼額度，僅部分金額享加碼</span>`;
            }

            let displayType = '一般 0.88%';
            if (hasSelected && hasAsia && hasTask) displayType = '三大通路+亞洲七國餐飲+自動扣繳 5.88%';
            else if (hasSelected && hasAsia) displayType = '三大通路+亞洲七國餐飲 4.88%';
            else if (hasSelected && hasTask) displayType = '三大通路+自動扣繳 4.88%';
            else if (hasAsia && hasTask) displayType = '亞洲七國餐飲+自動扣繳 2.88%';
            else if (hasSelected) displayType = '三大通路 3.88%';
            else if (hasAsia) displayType = '亞洲七國餐飲 1.88%';
            else if (hasTask) displayType = '一般+自動扣繳 1.88%';

            let totalMiles = Math.trunc(basePts + bonusPts) * 2;
            let finalNote = `${displayType} <small>1點=2哩</small>` + noteHtml;
            let actualQuotaConsumed = Math.max(consumedQuotaMap.hsbc_live_selected, consumedQuotaMap.hsbc_live_asia, consumedQuotaMap.hsbc_live_task);

            return { 
                miles: totalMiles, 
                note: finalNote, 
                consumedQuota: actualQuotaConsumed, 
                isWarning: isWarning,
                warningType: warningType,
                consumedQuotaMap: consumedQuotaMap
            };
        }
    },

    'taishin_cx': {
        name: '台新 國泰世界',
        ai_meta: { bestRate: 5, bestScenario: "越飛有哩/國泰官網", baseRate: 22, isUnlimitedLike: false },
        calc: (ctx) => {
            const blk = getBlocklistsConfig();
            if (blk.taishin.some(w => ctx.kwKey.includes(w))) {
                return { miles: 0, note: '<span class="text-danger">🚫 非回饋項目</span>', consumedQuota: 0, isWarning: false, warningType: 'none' };
            }

            let baseDiv = ctx.isForeign ? 15 : 22;
            const hasTaishinAutopay = !!ctx.db.settings?.taishin_autopay;
            
            let isMobileOrThirdPartyPay = (ctx.pay === 'apple_pay' || ctx.pay === 'line_pay');
            let isBonus = false;
            let bonusNote = '';

            if (hasTaishinAutopay && ctx.cat === 'flight_cx' && !isMobileOrThirdPartyPay) {
                isBonus = true;
                bonusNote = '國泰官網/客服購票 $5';
            } else if (
                hasTaishinAutopay &&
                ctx.isFlyMode &&
                ctx.cat !== 'flight_ci' &&
                ctx.cat !== 'flight_cx' &&
                !isMobileOrThirdPartyPay &&
                (
                    ['agoda', 'booking', 'hotels.com', 'hotels', 'expedia', 'klook', 'kkday'].some(w => ctx.kwKey.includes(w)) ||
                    ['昇恆昌', '免稅', '采盟', 'dfs'].some(w => ctx.kwKey.includes(w)) ||
                    ctx.group === 'duty_free' ||
                    (ctx.isForeign && ctx.pay === 'physical')
                )
            ) {
                isBonus = true;
                bonusNote = '越飛有哩 $5';
            }

            let limit1M = getLimitVal('taishin_cx');
            let used1M = ctx.db.limits[getLimitKey(ctx.db, 'taishin_cx', new Date())]?.spend || 0;
            let remaining1M = Math.max(0, limit1M - used1M);
            let noteHtml = '';

            if (ctx.twdBase > remaining1M) {
                noteHtml = `<span class="text-danger fw-bold d-block mt-1">⚠️ 年度百萬額度已滿，超額部分享基礎回饋</span>`;
                let validSpend = remaining1M;
                let exceedSpend = ctx.twdBase - remaining1M;
                let miles = 0;

                if (isBonus) {
                    miles = Math.trunc(validSpend / 5) + Math.trunc(exceedSpend / baseDiv);
                } else {
                    miles = Math.trunc(ctx.twdBase / baseDiv);
                }

                let finalNote = (isBonus ? bonusNote : (ctx.isForeign ? '海外 $15' : '國內 $22')) + noteHtml;
                return { 
                    miles: miles, 
                    note: finalNote, 
                    consumedQuota: validSpend, 
                    isWarning: true, 
                    warningType: remaining1M <= 0 ? 'limit_exhausted' : 'partial_overflow' 
                };
            }

            if (isBonus) {
                return { miles: Math.trunc(ctx.twdBase / 5), note: bonusNote, consumedQuota: ctx.twdBase, isWarning: false, warningType: 'none' };
            }

            return {
                miles: Math.trunc(ctx.twdBase / baseDiv),
                note: (ctx.isForeign ? '海外 $15' : '國內 $22'),
                consumedQuota: ctx.twdBase,
                isWarning: false,
                warningType: 'none'
            };
        }
    },

    'hsbc_inf': {
        name: '匯豐 旅人無限',
        ai_meta: { bestRate: 10, bestScenario: "海外消費", baseRate: 18, isUnlimitedLike: true },
        calc: (ctx) => {
            const blk = getBlocklistsConfig();
            if (['麥當勞', ...blk.hsbc_base].some(w => ctx.kwKey.includes(w))) {
                return { miles: 0, note: '🚫 非回饋', consumedQuota: 0, isWarning: false, warningType: 'none' };
            }

            let div = ctx.isForeign ? 10 : 18;

            return {
                miles: Math.trunc(ctx.twdBase / div),
                note: ctx.isForeign ? '$10元/哩 (海外消費)' : '$18元/哩 (國內消費)',
                consumedQuota: ctx.twdBase,
                isWarning: false,
                warningType: 'none'
            };
        }
    },

    'ctbc_ci': {
        name: '中信 華航鼎尊',
        ai_meta: { bestRate: 6, bestScenario: "生日海外實體", baseRate: 18, isUnlimitedLike: false },
        calc: (ctx) => {
            const blk = getBlocklistsConfig();
            const flags = getRuleFlagsConfig();
            
            if (blk.ctbc.some(w => ctx.kwKey.includes(w))) {
                return { miles: 0, note: '<span class="text-danger">🚫 非回饋項目</span>', consumedQuota: 0, consumedBonusMiles: 0, baseMiles: 0, bonusMilesGranted: 0, isWarning: false, warningType: 'none' };
            }

            const catStr = (ctx.cat || '').toLowerCase();
            const isExplicitOnlineCategory = ['online', 'ecom', 'ecommerce', 'shopping_online', 'online_shopping', '網購', '線上', '電商'].some(w => catStr.includes(w));

            const isMobileWallet = ctx.pay === 'apple_pay'; 
            const isThirdPartyPay = ctx.pay === 'line_pay';
            const isOnline = flags.strict_online.includes(ctx.cat) || ctx.pay === 'online' || isExplicitOnlineCategory;
            const isForeignPhysicalEligible = ctx.isForeign && !isOnline && !isThirdPartyPay && (ctx.pay === 'physical' || isMobileWallet);
            
            const isTravelOTA = ['agoda', 'airbnb', 'booking', 'booking.com', 'expedia', 'hotels', 'hotels.com', 'trip', 'trip.com'].some(w => ctx.kwKey.includes(w));
            const isMandarinAir = ['華信', 'mandarin', 'mandarin airlines'].some(w => ctx.kwKey.includes(w));
            const isCiEMall = ['emall', 'e mall', '華航emall', '華航 emall'].some(w => ctx.kwKey.includes(w));
            const isCiSkyBoutique = ['sky boutique', 'skyboutique', '華航sky boutique', '華航 sky boutique'].some(w => ctx.kwKey.includes(w));
            const isCiDutyFree = ['華航免稅', '機上免稅', 'duty free', 'inflight duty free'].some(w => ctx.kwKey.includes(w));

            let baseMiles = Math.trunc(ctx.twdBase / 18);
            let expectedBonusMiles = 0;
            let isBonus = false;
            let noteBase = '';

            // 第一層：生日 X3 (必須是生日月且為國外實體商店交易)
            if (ctx.isBirthday && isForeignPhysicalEligible) {
                expectedBonusMiles = baseMiles * 2;
                isBonus = true;
                noteBase = '🎂 生日海外實體 $6';
            }
            // 第二層：一般 X2
            else if (
                isForeignPhysicalEligible || 
                ctx.cat === 'flight_ci' || 
                isMandarinAir || 
                isCiEMall || 
                isCiSkyBoutique || 
                isCiDutyFree || 
                (ctx.isForeign && isTravelOTA)
            ) {
                 expectedBonusMiles = baseMiles * 1;
                 isBonus = true;

                 if (ctx.cat === 'flight_ci') {
                    noteBase = '✈️ 華航官網 $9';
                 } else if (isForeignPhysicalEligible) {
                    noteBase = '🌍 海外實體消費 $9';
                 } else if (ctx.isForeign && isTravelOTA) {
                    noteBase = '🏨 國外訂房平台 $9';
                 } else {
                    noteBase = '🛍️ 華航相關通路/免稅 $9';
                 }
            }

            let bonusMilesGranted = 0;
            let isWarning = false;
            let warningType = 'none';

            if (isBonus) {
                let limit = getLimitVal('ctbc_ci');
                let limitKey = getLimitKey(ctx.db, 'ctbc_ci', new Date());
                let usedBonus = ctx.db.limits[limitKey]?.usedBonusMiles || 0;
                let remainingBonus = Math.max(0, limit - usedBonus);

                bonusMilesGranted = Math.min(expectedBonusMiles, remainingBonus);

                if (expectedBonusMiles > remainingBonus) {
                    isWarning = true;
                    let warningNote = '';
                    if (remainingBonus <= 0) {
                        warningType = 'limit_exhausted';
                        warningNote = `<span class="text-danger fw-bold d-block mt-1">⚠️ 本月加碼額度已滿，後續僅享基本回饋 ($18/哩)</span>`;
                    } else {
                        warningType = 'partial_overflow';
                        warningNote = `<span class="text-danger fw-bold d-block mt-1">⚠️ 本筆超過剩餘加碼額度，僅部分哩程享加碼</span>`;
                    }
                    noteBase += warningNote;
                }
            }

            return {
                miles: baseMiles + bonusMilesGranted,
                note: isBonus ? noteBase : '一般消費 $18',
                consumedQuota: 0,
                consumedBonusMiles: bonusMilesGranted,
                baseMiles: baseMiles,
                bonusMilesGranted: bonusMilesGranted,
                isWarning: isWarning,
                warningType: warningType
            };
        }
    }
};
