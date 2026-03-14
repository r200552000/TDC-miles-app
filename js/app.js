/* ==========================================
   系統初始化入口
   ========================================== */

// 還原按鈕事件綁定
document.getElementById('confirm-restore-btn').addEventListener('click', () => {
    hideConfirmModal();
    setTimeout(() => {
        const code = prompt("請貼上您的還原代碼 (Base64)：");
        if(code) {
            try {
                const decoded = decodeURIComponent(escape(atob(code.trim()))); JSON.parse(decoded); safeSetItem(DB_KEY, decoded);
                alert("🎉 資料還原成功！系統即將重新整理。"); location.reload();
            } catch(e) { showCustomAlert("❌ 無效的還原代碼！請確認您有完整複製。"); }
        }
    }, 400);
});

// 🚀 系統初始化
window.onload = async function() {
    const db = loadDB();
    const pendingCount = Object.keys(db.records[`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`] || {}).length;
    document.getElementById('nav-badge-list').innerText = pendingCount;
    document.getElementById('nav-badge-list').style.display = pendingCount > 0 ? 'inline-block' : 'none';

    db.warehouse.forEach((item, idx) => {
        if (!item || typeof item !== 'object') return;
        const safeType = ['raw', 'airline', 'transfer'].includes(item.type) ? item.type : 'raw';
        if (safeType !== 'raw') plannerSelectedAssets.add(idx);
    });

    // [維護者註解] window.onload 初始化流程：
    // 為了避免遠端抓取延遲導致畫面卡頓，採用「兩階段載入」：
    // 1. 快速載入快取或 Fallback，讓畫面立即渲染。
    const cachedData = loadRulesCache();
    const ind = document.getElementById('sync-indicator');
    const adapterBadge = document.getElementById('hsbc-adapter-status');

    if (cachedData) {
        RULES_DB = cachedData;
        if (ind) ind.className = 'sync-dot sync-green me-2';
        if (adapterBadge) {
            adapterBadge.innerText = 'Rules: Cached';
            adapterBadge.className = 'badge bg-primary text-white ms-2';
        }
    } else {
        RULES_DB = JSON.parse(JSON.stringify(DEFAULT_RULES));
        if (ind) ind.className = 'sync-dot sync-red me-2';
        if (adapterBadge) {
            adapterBadge.innerText = 'Rules: Fallback';
            adapterBadge.className = 'badge bg-secondary text-white ms-2';
        }
    }

    renderCategorySelect(); // 第一階段渲染
    switchPage('calc', document.querySelector('.nav-item'));
    runPlannerCalc();

    // 2. 背景非同步抓取遠端最新規則 (不使用 await 阻塞後續畫面與操作)
    triggerSync();
};
