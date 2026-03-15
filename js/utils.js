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

        // --- Phase 1: Lazy Migration ---
        let needsSave = false;

        if (_migrateWarehouseToV2(db)) {
            needsSave = true;
        }

        // --- Phase 1.5: 資料驗證與自動修復 ---
        if (_repairWarehouseData(db)) {
            needsSave = true;
        }

        if (needsSave) {
            saveDB(db);
        }

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
// 共用 helper：依 batches 重新計算 current
// ==========================================
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

        const isHealthyV2 =
            asset.schema_version >= 2 &&
            hasValidBatchesArray &&
            !(currentVal !== 0 && asset.batches.length === 0);

        if (isHealthyV2) return;

        needsSave = true;

        asset.schema_version = 2;
        if (!asset.migrated_at) {
            asset.migrated_at = migrationTimestamp;
        }

        if (!hasValidBatchesArray) {
            asset.batches = [];
        }

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

// ==========================================
// 內部私有函式：倉庫資料驗證與自動修復 v1
// 目標：補正 batches 結構、清理髒 batch、重算 current
// ==========================================
function _repairWarehouseData(db) {
    if (!db || !Array.isArray(db.warehouse)) return false;

    let needsSave = false;

    db.warehouse.forEach((asset, idx) => {
        if (!asset || typeof asset !== 'object') return;

        // 1. batches 必須是陣列
        if (!Array.isArray(asset.batches)) {
            asset.batches = [];
            needsSave = true;
        }

        // 2. 清理髒 batch：只保留有效 object
        const originalLen = asset.batches.length;
        asset.batches = asset.batches.filter(batch => batch && typeof batch === 'object');
        if (asset.batches.length !== originalLen) {
            needsSave = true;
        }

        // 3. 補 batch 基本欄位，清理非法值
        asset.batches.forEach((batch, batchIdx) => {
            let batchChanged = false;

            if (batch.direction !== 'in' && batch.direction !== 'out') {
                batch.direction = 'in';
                batchChanged = true;
            }

            let amt = Number(batch.amount);
            if (isNaN(amt)) {
                batch.amount = 0;
                batchChanged = true;
            } else if (amt < 0) {
                batch.amount = Math.abs(amt);
                batchChanged = true;
            }

            if (!batch.batch_id) {
                const rawName = String(asset.name || asset.targetAirline || 'UNK')
                    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '')
                    .substring(0, 3) || 'UNK';
                batch.batch_id = `repair_${Date.now()}_${idx}_${batchIdx}_${rawName}`;
                batchChanged = true;
            }

            if (!batch.created_at || isNaN(Number(batch.created_at))) {
                batch.created_at = Date.now();
                batchChanged = true;
            }

            if (!batch.source_type) {
                batch.source_type = 'unknown_repaired';
                batchChanged = true;
            }

            if (!('ref_id' in batch)) {
                batch.ref_id = null;
                batchChanged = true;
            }

            if (!('note' in batch)) {
                batch.note = '';
                batchChanged = true;
            }

            if (batchChanged) needsSave = true;
        });

        // 4. 重算 current，若與原值不同則覆寫
        const oldCurrent = Number(asset.current) || 0;
        recomputeAssetCurrent(asset);
        const newCurrent = Number(asset.current) || 0;

        if (oldCurrent !== newCurrent) {
            needsSave = true;
        }

        // 5. 若缺基本欄位，補最保守預設
        if (!asset.schema_version || asset.schema_version < 2) {
            asset.schema_version = 2;
            needsSave = true;
        }

        if (!asset.name && asset.targetAirline) {
            asset.name = asset.targetAirline;
            needsSave = true;
        }

        if (!asset.targetAirline && asset.name) {
            asset.targetAirline = asset.name;
            needsSave = true;
        }
    });

    return needsSave;
}
