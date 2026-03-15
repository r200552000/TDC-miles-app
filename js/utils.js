/* ==========================================
   共用工具函數 (所有檔案共用)
   ========================================== */

// ==========================================
// localStorage 安全包裝
// ==========================================
function safeGetItem(key) {
    try { return localStorage.getItem(key); } catch(e) { console.warn('[Storage] read failed:', key, e); return null; }
}
function safeSetItem(key, val) {
    try { localStorage.setItem(key, val); } catch(e) { console.warn('[Storage] write failed:', key, e); }
}
function safeRemoveItem(key) {
    try { localStorage.removeItem(key); } catch(e) { console.warn('[Storage] remove failed:', key, e); }
}

// ==========================================
// 系統資料庫與基礎操作 (強型別防禦版)
// ==========================================
function loadDB() {
    let raw = safeGetItem(DB_KEY);
    const defaultBuiltins = BUILTIN_DEFS.filter(c => c.default).map(c => c.id);
    const defaultDB = { settings: { enabledBuiltins: defaultBuiltins, billingDays: { ...DEFAULT_BILLING }, hsbc_autopay: true }, customCards: [], records: {}, limits: {}, warehouse: [] };

    if(!raw) {
        const oldRaw = safeGetItem('MILES_APP_V14_9');
        if(oldRaw) {
            raw = oldRaw;
            safeSetItem(DB_KEY, raw);
        } else {
            return defaultDB;
        }
    }

    try {
        const db = JSON.parse(raw);
        if(!db.records || typeof db.records !== 'object' || Array.isArray(db.records)) db.records = {};
        if(!db.limits || typeof db.limits !== 'object' || Array.isArray(db.limits)) db.limits = {};
        if(!Array.isArray(db.warehouse)) db.warehouse = [];
        if(!Array.isArray(db.customCards)) db.customCards = [];

        if(!db.settings || typeof db.settings !== 'object' || Array.isArray(db.settings)) {
            db.settings = defaultDB.settings;
        } else {
            if (!Array.isArray(db.settings.enabledBuiltins)) db.settings.enabledBuiltins = [...defaultDB.settings.enabledBuiltins];
            if (typeof db.settings.hsbc_autopay !== 'boolean') db.settings.hsbc_autopay = true;

            if (typeof db.settings.billingDays === 'object' && db.settings.billingDays !== null && !Array.isArray(db.settings.billingDays)) {
                db.settings.billingDays = { ...defaultDB.settings.billingDays, ...db.settings.billingDays };
            } else {
                db.settings.billingDays = { ...DEFAULT_BILLING };
            }
        }

        // --- Phase 1: 插入 Lazy Migration 攔截點 ---
        // 提醒：請先確認 saveDB 只是單純儲存，無反向呼叫 loadDB 或其他副作用
        if (_migrateWarehouseToV2(db)) {
            saveDB(db);
        }
        // -------------------------------------------

        return db;
    } catch (e) {
        console.error("資料庫解析失敗，已重置為預設狀態", e);
        return defaultDB;
    }
}
function saveDB(data) { try { safeSetItem(DB_KEY, JSON.stringify(data)); } catch(e) { console.error('[DB] saveDB failed:', e); } }

// ==========================================
// HTML / Markdown 安全處理
// ==========================================
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const formatMD = (str) => {
    let safeStr = escapeHTML(str);
    return safeStr.replace(/\*\*(.*?)\*\*/g, '<strong class="text-primary-dark">$1</strong>').replace(/\n/g, '<br>');
};

// ==========================================
// Bootstrap Modal 簡化操作
// ==========================================
function showModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const inst = bootstrap.Modal.getInstance(el) || new bootstrap.Modal(el);
    inst.show();
}
function hideModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const inst = bootstrap.Modal.getInstance(el);
    if (inst) inst.hide();
}

// ==========================================
// 通用提示框
// ==========================================
function showCustomAlert(msg) {
    document.getElementById('alert-msg').innerText = msg;
    showModal('customAlertModal');
}

// ==========================================
// 航司正規化 (合併所有別名)
// ==========================================
function normalizeAirlineCode(name) {
    if (!name || typeof name !== 'string') return 'UNKNOWN';
    const n = name.trim().toUpperCase();
    if (n.includes('華航') || n.includes('中華航空') || n === 'CI') return 'CI';
    if (n.includes('長榮') || n.includes('長榮航空') || n.includes('EVA') || n === 'BR') return 'BR';
    if (n.includes('國泰') || n.includes('亞萬') || n.includes('亞洲萬里通') || n.includes('CATHAY') || n === 'CX' || n === 'AM') return 'CX';
    if (n.includes('新航') || n.includes('新加坡航空') || n.includes('SINGAPORE AIRLINES') || n === 'SQ') return 'SQ';
    if (n.includes('日航') || n.includes('日本航空') || n === 'JAL' || n === 'JL') return 'JL';
    if (n.includes('全日空') || n.includes('ANA') || n === 'NH') return 'NH';
    if (n.includes('聯合航空') || n.includes('UNITED') || n === 'UA') return 'UA';
    return 'UNKNOWN';
}

// ==========================================
// 字串正規化 (去空白轉小寫)
// ==========================================
function normalizeStr(str) {
    return typeof str === 'string' ? str.replace(/\s+/g, '').toLowerCase() : '';
}

// ==========================================
// 內部私有函式：資料庫 Schema V2 惰性升級 (Lazy Migration)
// ==========================================
function _migrateWarehouseToV2(db) {
    if (!db || !Array.isArray(db.warehouse)) return false;

    let needsSave = false;
    const migrationTimestamp = Date.now();

    db.warehouse.forEach((asset, idx) => {
        if (!asset || typeof asset !== 'object') return;

        const currentVal = Number(asset.current) || 0;
        const hasValidBatchesArray = Array.isArray(asset.batches);
        const hasExistingBatches = hasValidBatchesArray && asset.batches.length > 0;

        // 只有在：
        // 1. schema_version >= 2
        // 2. batches 是陣列
        // 3. 若 current !== 0，batches 不能是空陣列
        // 才視為健康 V2
        const isHealthyV2 =
            asset.schema_version >= 2 &&
            hasValidBatchesArray &&
            !(currentVal !== 0 && asset.batches.length === 0);

        if (isHealthyV2) return;

        needsSave = true;

        // 補齊版本標記
        asset.schema_version = 2;
        if (!asset.migrated_at) {
            asset.migrated_at = migrationTimestamp;
        }

        // 若 batches 不是陣列，初始化為空陣列；若已存在則保留
        if (!hasValidBatchesArray) {
            asset.batches = [];
        }

        // 只有在原本沒有 batches 或為空陣列時，才允許根據 current 補 migration batch
        const canCreateMigrationBatch = !hasExistingBatches;

        if (canCreateMigrationBatch) {
            const hasMigrationBatch = asset.batches.some(
                b => b && typeof b === 'object' && b.source_type === 'system_migration'
            );

            if (currentVal !== 0 && !hasMigrationBatch) {
                let rawName = String(asset.name || asset.targetAirline || 'UNK');
                let nameSnippet = rawName
                    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '')
                    .substring(0, 3);

                if (!nameSnippet) nameSnippet = 'UNK';

                const batchId = `mig_${migrationTimestamp}_${idx}_${nameSnippet}`;
                const direction = currentVal > 0 ? 'in' : 'out';

                asset.batches.push({
                    batch_id: batchId,
                    direction: direction,
                    amount: Math.abs(currentVal),
                    created_at: migrationTimestamp,
                    source_type: 'system_migration',
                    ref_id: null,
                    note: '舊版系統餘額結轉'
                });
            }
        }
    });

    return needsSave;
}
