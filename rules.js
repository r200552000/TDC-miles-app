/* ==========================================
   動態規章同步引擎 (遠端 rules.json 管理)
   ========================================== */

function validateRulesPayload(data) {
    if (typeof data !== 'object' || data === null) return false;
    if (!Array.isArray(data.ui_categories)) return false;
    for (const item of data.ui_categories) {
        if (typeof item.id !== 'string' || typeof item.label !== 'string') return false;
    }
    if (data.version !== undefined && typeof data.version !== 'string') return false;
    if (data.last_updated !== undefined && typeof data.last_updated !== 'string') return false;
    if (data.auto_assets !== undefined && (typeof data.auto_assets !== 'object' || data.auto_assets === null || Array.isArray(data.auto_assets))) return false;
    if (data.transfer_partners !== undefined && (typeof data.transfer_partners !== 'object' || data.transfer_partners === null || Array.isArray(data.transfer_partners))) return false;
    if (data.keywords !== undefined && (typeof data.keywords !== 'object' || data.keywords === null || Array.isArray(data.keywords))) return false;
    if (data.blocklists !== undefined && (typeof data.blocklists !== 'object' || data.blocklists === null || Array.isArray(data.blocklists))) return false;
    if (data.rule_flags !== undefined && (typeof data.rule_flags !== 'object' || data.rule_flags === null || Array.isArray(data.rule_flags))) return false;
    return true;
}

function getKeywordsConfig() {
    const remote = (RULES_DB && RULES_DB.keywords) ? RULES_DB.keywords : {};
    const liveRemote = remote.live || {};
    return {
        live: {
            dining: Array.isArray(liveRemote.dining) ? liveRemote.dining : DEFAULT_KEYWORDS.live.dining,
            shop: Array.isArray(liveRemote.shop) ? liveRemote.shop : DEFAULT_KEYWORDS.live.shop,
            entertainment: Array.isArray(liveRemote.entertainment) ? liveRemote.entertainment : DEFAULT_KEYWORDS.live.entertainment
        },
        asia_7: Array.isArray(remote.asia_7) ? remote.asia_7 : DEFAULT_KEYWORDS.asia_7,
        eu_uk: Array.isArray(remote.eu_uk) ? remote.eu_uk : DEFAULT_KEYWORDS.eu_uk
    };
}

function getBlocklistsConfig() {
    const remote = (RULES_DB && RULES_DB.blocklists) ? RULES_DB.blocklists : {};
    return {
        ctbc: Array.isArray(remote.ctbc) ? remote.ctbc : DEFAULT_BLOCKLISTS.ctbc,
        hsbc_base: Array.isArray(remote.hsbc_base) ? remote.hsbc_base : DEFAULT_BLOCKLISTS.hsbc_base,
        hsbc_live: Array.isArray(remote.hsbc_live) ? remote.hsbc_live : DEFAULT_BLOCKLISTS.hsbc_live,
        taishin: Array.isArray(remote.taishin) ? remote.taishin : DEFAULT_BLOCKLISTS.taishin
    };
}

function getRuleFlagsConfig() {
    const remote = (RULES_DB && RULES_DB.rule_flags) ? RULES_DB.rule_flags : {};
    return {
        strict_online: Array.isArray(remote.strict_online) ? remote.strict_online : DEFAULT_RULE_FLAGS.strict_online
    };
}

function loadRulesCache() {
    try {
        const raw = safeGetItem('RULES_CACHE_V1');
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!validateRulesPayload(data)) throw new Error("Invalid cache format");
        return data;
    } catch (e) {
        console.warn("[Sync] Cache read failed or corrupted, clearing cache.", e);
        clearRulesCache();
        return null;
    }
}

function saveRulesCache(data) {
    try {
        safeSetItem('RULES_CACHE_V1', JSON.stringify(data));
        safeSetItem('RULES_CACHE_META_V1', Date.now().toString());
    } catch (e) {
        console.warn("[Sync] Failed to save rules cache.", e);
    }
}

function clearRulesCache() {
    safeRemoveItem('RULES_CACHE_V1');
    safeRemoveItem('RULES_CACHE_META_V1');
}

async function fetchRules() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(PRIMARY_RULES_URL, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error("Network response was not ok");
        const data = await res.json();

        if (!validateRulesPayload(data)) throw new Error("Invalid remote rules format");

        RULES_DB = data;
        saveRulesCache(data);
        console.log("[Sync] Rules updated from remote.");
        return { ok: true, mode: "remote" };
    } catch (e) {
        console.warn("[Sync] Remote fetch failed. Error:", e.message);

        const cachedData = loadRulesCache();
        if (cachedData) {
            RULES_DB = cachedData;
            console.log("[Sync] Using cached rules.");
            return { ok: true, mode: "cache" };
        }

        console.warn("[Sync] No valid cache found. Using local fallback rules.");
        RULES_DB = JSON.parse(JSON.stringify(DEFAULT_RULES));
        return { ok: false, mode: "fallback" };
    }
}

function getAutoAssetsConfig() {
    if (RULES_DB && RULES_DB.auto_assets && typeof RULES_DB.auto_assets === 'object' && !Array.isArray(RULES_DB.auto_assets)) {
        return RULES_DB.auto_assets;
    }
    return DEFAULT_AUTO_ASSETS;
}

function getTransferPartnersConfig() {
    if (RULES_DB && RULES_DB.transfer_partners && typeof RULES_DB.transfer_partners === 'object' && !Array.isArray(RULES_DB.transfer_partners)) {
        return RULES_DB.transfer_partners;
    }
    return DEFAULT_TRANSFER_PARTNERS;
}

function renderCategorySelect() {
    const catSelect = document.getElementById('category');
    if (!catSelect || !RULES_DB || !RULES_DB.ui_categories) return;

    const currentVal = catSelect.value;
    catSelect.innerHTML = '';

    RULES_DB.ui_categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.label;
        catSelect.appendChild(opt);
    });

    if (currentVal && Array.from(catSelect.options).some(opt => opt.value === currentVal)) {
        catSelect.value = currentVal;
    }
    updateKeywordPlaceholder();
}

function mapCategoryGroup(cat) {
    if (['dining_general', 'dining_street', 'dining_chain', 'dining_department_foodcourt'].includes(cat)) return 'dining';
    if (['department_store', 'shopping_online'].includes(cat)) return 'shopping';
    if (cat === 'entertainment') return 'entertainment';
    if (cat === 'travel') return 'travel';
    if (['flight_ci', 'flight_cx', 'flight_other'].includes(cat)) return 'flight';
    return 'general';
}

function isCategoryGroup(ctx, group) {
    if (group === 'flight') return ctx.group === 'flight' || ctx.cat.startsWith('flight');
    return ctx.group === group;
}
