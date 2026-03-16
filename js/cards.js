/* ==========================================
   卡片規則定義 & 上限管家
   ========================================== */

// ==========================================
// 上限管家與防護系統
// ==========================================
function getLimitKey(db, id, dateObj) {
    if (['taishin_cx', 'ctbc_ci', 'ctbc_ci_inf'].includes(id)) return `${dateObj.getFullYear()}-${id}`;
    if (id.startsWith('custom_')) {
        const c = db.customCards.find(x => x && typeof x === 'object' && x.id === id);
        if (c && c.isAnnual) return `${dateObj.getFullYear()}-${id}`;
        let day = (c && c.billingDay) ? c.billingDay : 1;
        const offset = dateObj.getDate() > day ? 1 : 0;
        const d = new Date(dateObj.getFullYear(), dateObj.getMonth() + offset, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${id}`;
    }
    let day = db.settings?.billingDays?.[id] || db.settings?.billingDays?.[id.split('_')[0]] || 1;
    const offset = dateObj.getDate() > day ? 1 : 0;
    const d = new Date(dateObj.getFullYear(), dateObj.getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${id}`;
}

function getLimitVal(id) {
    if (id === 'hsbc_live') return 29600;
    if (id === 'hsbc_inf') return 999999999;
    if (id === 'ctbc_ci_inf') return 600000;
    if (id === 'taishin_cx') return 1000000;
    if (id === 'ctbc_ci') return 1440000;
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
                return { miles: 0, note: '<span class="text-danger">🚫 非回饋項目</span>', consumedQuota: 0 };
            }

            const isOnline = flags.strict_online.includes(ctx.cat) || ctx.pay === 'online';
            const isTruePhysical = !isOnline && (ctx.pay === 'physical' || ctx.pay === 'apple_pay');
            const isTravelOTA = ['agoda', 'booking', 'trip'].some(w => ctx.kwKey.includes(w));

            let div = 20;
            let isBonus = false;
            let noteBase = '';

            if (ctx.isBirthday && ctx.isForeign && isTruePhysical) {
                div = 6.6;
                isBonus = true;
                noteBase = '🎂 生日海外實體 $6.6';
            } else if (ctx.cat === 'flight_ci') {
                div = 10;
                isBonus = true;
                noteBase = '✈️ 華航官網 $10';
            } else if (ctx.isForeign && isTravelOTA) {
                div = 10;
                isBonus = true;
                noteBase = '🏨 國外訂房平台 $10';
            } else if (ctx.isForeign) {
                div = 10;
                isBonus = true;
                noteBase = '🌍 海外消費 $10';
            }

            if (isBonus) {
                let limit = getLimitVal('ctbc_ci_inf');
                let used = ctx.db.limits[getLimitKey(ctx.db, 'ctbc_ci_inf', new Date())]?.spend || 0;
                let remaining = Math.max(0, limit - used);

                if (ctx.twdBase <= remaining) {
                    return {
                        miles: Math.trunc(ctx.twdBase / div),
                        note: noteBase,
                        consumedQuota: ctx.twdBase
                    };
                } else {
                    let bonusMiles = Math.trunc(remaining / div);
                    let baseMiles = Math.trunc((ctx.twdBase - remaining) / 20);
                    let note = remaining === 0
                        ? `<span class="text-danger fw-bold d-block mt-1">⚠️ 年度額度已滿，降為一般回饋 ($20/哩)</span>`
                        : `<span class="text-danger fw-bold d-block mt-1">⚠️ 單筆爆額度上限，超額部分享一般回饋</span>`;
                    return {
                        miles: bonusMiles + baseMiles,
                        note: noteBase + note,
                        consumedQuota: remaining,
                        isWarning: true
                    };
                }
            }

            return {
                miles: Math.trunc(ctx.twdBase / 20),
                note: '一般消費 $20',
                consumedQuota: 0
            };
        }
    },

    'hsbc_live': {
        name: '匯豐 Live+',
        ai_meta: { bestRate: 34, bestScenario: "一般消費", baseRate: 34, isUnlimitedLike: false },
        calc: (ctx) => {
            if (ctx.isEUR) return { miles: 0, note: '<span class="text-danger">🚫 歐盟/英國實體店不回饋</span>', consumedQuota: 0 };
            const blk = getBlocklistsConfig();
            const kw = getKeywordsConfig();
            if (blk.hsbc_live.some(w => ctx.kwKey.includes(w))) return { miles: 0, note: '<span class="text-danger">🚫 非回饋項目</span>', consumedQuota: 0 };
            if (['apple_pay', 'line_pay'].includes(ctx.pay)) return { miles: 0, note: '🚫 綁定行動支付無加碼', consumedQuota: 0 };

            let isAsian7Code = ctx.isForeign && ctx.currencyCode && ['JPY', 'SGD', 'MYR', 'VND', 'PHP', 'INR', 'LKR'].includes(ctx.currencyCode);
            let isAsian7 = isAsian7Code || (ctx.isForeign && kw.asia_7.some(w => ctx.kwKey.includes(w)));
            let displayType = '一般 0.88%';
            let basePts = ctx.twdBase * 0.0088;
            let bonusPts = 0;

            let limitKey = getLimitKey(ctx.db, 'hsbc_live', new Date());
            let usedSpend = ctx.db.limits[limitKey]?.spend || 0;
            let selectedRemaining = Math.max(0, 29600 - usedSpend);
            let taskRemaining = Math.max(0, 20000 - usedSpend);

            let noteHtml = '';
            let actualQuotaConsumed = 0;
            let isWarning = false;

            if (ctx.isLiveSelect) {
                displayType = '精選';
                let eligibleSelectedSpend = Math.min(ctx.twdBase, selectedRemaining);
                bonusPts += eligibleSelectedSpend * 0.03;
                actualQuotaConsumed = Math.max(actualQuotaConsumed, eligibleSelectedSpend);

                if (ctx.twdBase > selectedRemaining) {
                    isWarning = true;
                    noteHtml += `<span class="text-danger fw-bold d-block mt-1">⚠️ 單筆爆精選上限，超額僅 0.88% 基礎回饋</span>`;
                }

                if (ctx.db.settings?.hsbc_autopay) {
                    let eligibleTaskSpend = Math.min(ctx.twdBase, taskRemaining);
                    bonusPts += eligibleTaskSpend * 0.01;
                    actualQuotaConsumed = Math.max(actualQuotaConsumed, eligibleTaskSpend);
                    displayType += '+自動扣繳';
                    if (ctx.twdBase > taskRemaining && !isWarning) {
                        isWarning = true;
                        noteHtml += `<span class="text-danger fw-bold d-block mt-1">⚠️ 單筆爆任務上限，超額僅 0.88% 基礎回饋</span>`;
                    }
                }

                if (isAsian7) {
                    let eligibleAsiaSpend = Math.min(ctx.twdBase, taskRemaining);
                    bonusPts += eligibleAsiaSpend * 0.01;
                    actualQuotaConsumed = Math.max(actualQuotaConsumed, eligibleAsiaSpend);
                    displayType = '亞洲七國 5.88%';
                }
            } else if (ctx.db.settings?.hsbc_autopay) {
                let eligibleTaskSpend = Math.min(ctx.twdBase, taskRemaining);
                bonusPts += eligibleTaskSpend * 0.01;
                actualQuotaConsumed = Math.max(actualQuotaConsumed, eligibleTaskSpend);
                displayType = '一般+任務';
                if (ctx.twdBase > taskRemaining) {
                    isWarning = true;
                    noteHtml += `<span class="text-danger fw-bold d-block mt-1">⚠️ 單筆爆任務上限，超額僅 0.88% 基礎回饋</span>`;
                }
            }

            let totalMiles = Math.trunc(basePts + bonusPts) * 2;
            let finalNote = `${displayType} <small>1點=2哩</small>` + noteHtml;

            return { miles: totalMiles, note: finalNote, consumedQuota: actualQuotaConsumed, isWarning: isWarning };
        }
    },

    'taishin_cx': {
        name: '台新 國泰世界',
        ai_meta: { bestRate: 5, bestScenario: "越飛有哩/國泰官網", baseRate: 22, isUnlimitedLike: false },
        calc: (ctx) => {
            const blk = getBlocklistsConfig();
            if (blk.taishin.some(w => ctx.kwKey.includes(w))) {
                return { miles: 0, note: '<span class="text-danger">🚫 非回饋項目</span>', consumedQuota: 0 };
            }

            let baseDiv = ctx.isForeign ? 15 : 22;
            let isMobilePay = (ctx.pay === 'apple_pay' || ctx.pay === 'line_pay');
            let isBonus = false;

            if (ctx.isFlyMode && ctx.cat === 'flight_cx' && !isMobilePay && !ctx.isForeign) {
                isBonus = true;
            } else if (
                ctx.isFlyMode &&
                ctx.cat !== 'flight_ci' &&
                ctx.cat !== 'flight_cx' &&
                !isMobilePay &&
                (
                    ['agoda', 'booking', 'klook'].some(w => ctx.kwKey.includes(w)) ||
                    (ctx.isForeign && ctx.pay === 'physical')
                )
            ) {
                isBonus = true;
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

                let finalNote = (isBonus ? '越飛有哩 $5' : (ctx.isForeign ? '海外 $15' : '國內 $22')) + noteHtml;
                return { miles: miles, note: finalNote, consumedQuota: validSpend, isWarning: true };
            }

            if (isBonus) {
                return { miles: Math.trunc(ctx.twdBase / 5), note: '越飛有哩 $5', consumedQuota: ctx.twdBase };
            }

            return {
                miles: Math.trunc(ctx.twdBase / baseDiv),
                note: (ctx.isForeign ? '海外 $15' : '國內 $22'),
                consumedQuota: ctx.twdBase
            };
        }
    },

    'hsbc_inf': {
        name: '匯豐 旅人無限',
        ai_meta: { bestRate: 10, bestScenario: "海外消費", baseRate: 18, isUnlimitedLike: true },
        calc: (ctx) => {
            const blk = getBlocklistsConfig();
            if (['麥當勞', ...blk.hsbc_base].some(w => ctx.kwKey.includes(w))) {
                return { miles: 0, note: '🚫 非回饋', consumedQuota: 0 };
            }

            let div = ctx.isForeign ? 10 : 18;

            return {
                miles: Math.trunc(ctx.twdBase / div),
                note: ctx.isForeign ? '$10元/哩 (海外消費)' : '$18元/哩 (國內消費)',
                consumedQuota: ctx.twdBase
            };
        }
    },

    'ctbc_ci': {
        name: '中信 華航鼎尊',
        ai_meta: { bestRate: 6, bestScenario: "生日海外實體", baseRate: 18, isUnlimitedLike: false },
        calc: (ctx) => {
            const blk = getBlocklistsConfig();
            const flags = getRuleFlagsConfig();
            if (blk.ctbc.some(w => ctx.kwKey.includes(w))) return { miles: 0, note: '🚫 非回饋', consumedQuota: 0 };

            const isOnline = flags.strict_online.includes(ctx.cat) || ctx.pay === 'online';
            const isTruePhysical = !isOnline && (ctx.pay === 'physical' || ctx.pay === 'apple_pay');
            const isTravelOTA = ['agoda', 'booking', 'trip'].some(w => ctx.kwKey.includes(w));
            
            let isBonus = false, div = 18, noteBase = '';

            if (ctx.cat === 'flight_ci') {
                div = 9;
                isBonus = true;
                noteBase = '華航官網 $9';
            } else if (ctx.isForeign && isTravelOTA) {
                div = 9;
                isBonus = true;
                noteBase = '🏨 國外訂房平台 $9';
            } else if (ctx.isForeign && isTruePhysical) {
                if (ctx.isBirthday) {
                    div = 6;
                    isBonus = true;
                    noteBase = '🎂 生日實體 $6';
                } else {
                    div = 9;
                    isBonus = true;
                    noteBase = '海外實體 $9';
                }
            }

            if (isBonus) {
                let limit = getLimitVal('ctbc_ci');
                let used = ctx.db.limits[getLimitKey(ctx.db, 'ctbc_ci', new Date())]?.spend || 0;
                let remaining = Math.max(0, limit - used);

                if (ctx.twdBase <= remaining) {
                    return { miles: Math.trunc(ctx.twdBase / div), note: noteBase, consumedQuota: ctx.twdBase };
                }

                let bonusMiles = Math.trunc(remaining / div);
                let baseMiles = Math.trunc((ctx.twdBase - remaining) / 18);
                let note = remaining === 0
                    ? `<span class="text-danger fw-bold d-block mt-1">⚠️ 年度額度已滿，降為一般回饋 ($18/哩)</span>`
                    : `<span class="text-danger fw-bold d-block mt-1">⚠️ 單筆爆額度上限，超額部分享一般回饋</span>`;

                return {
                    miles: bonusMiles + baseMiles,
                    note: noteBase + note,
                    consumedQuota: remaining,
                    isWarning: true
                };
            }

            return {
                miles: Math.trunc(ctx.twdBase / 18),
                note: (ctx.isForeign ? '海外網購 $18' : '一般消費 $18'),
                consumedQuota: 0
            };
        }
    }
};
