/* ==========================================
   TDC 航空累哩工具 v15.2 - 設定常數與預設資料
   ========================================== */
const DB_KEY = 'MILES_APP_V15_1';
let currentResults = [];
let plannerSelectedAssets = new Set();

// --- 動態規章神經網路 (第一段) ---
// [維護者註解] RULES_DB 負責承接遠端抓取回來的 rules.json。
// 在啟動時會先以 DEFAULT_RULES 填充，成功 fetch 後才更新。
let RULES_DB = null;
const PRIMARY_RULES_URL = "https://gist.githubusercontent.com/r200552000/bdced9d179ec50a9dde110732601f310/raw/rules.json";

// [維護者註解] 這是最底層的安全網，當網路斷線且無快取時，系統會依賴此物件來維持基本運作，避免白屏。
const DEFAULT_RULES = {
    version: "v15.2.0",
    last_updated: "2026-03-14",
    ui_categories: [
        { id: "general", label: "🛍️ 一般消費" },
        { id: "dining_general", label: "🍽️ 一般餐廳" },
        { id: "dining_department_foodcourt", label: "🍽️ 百貨美食街/百貨餐飲" },
        { id: "dining_hotel", label: "🏨 飯店內餐廳" },
        { id: "delivery", label: "🛵 外送平台" },
        { id: "department_store", label: "🏬 百貨公司/商場" },
        { id: "shopping_online", label: "🛒 網購" },
        { id: "entertainment", label: "🎬 娛樂/影城/樂園" },
        { id: "travel", label: "🏨 旅遊/訂房" },
        { id: "flight_ci", label: "🌸 華航官網" },
        { id: "flight_cx", label: "🌲 國泰官網" },
        { id: "flight_other", label: "✈️ 其他航空" }
    ]
};

// [維護者註解] 控制各卡片記帳後，一鍵進倉時要歸入的資產池名稱與轉點比例。
const DEFAULT_AUTO_ASSETS = {
    'hsbc_live': { target: '匯豐Live+積分', type: 'transfer', ratio: 2, unitPoints: 1, unitMiles: 2 },
    'hsbc_inf': { target: '匯豐 旅人積分', type: 'transfer', ratio: 1, unitPoints: 1, unitMiles: 1 },
    'ctbc_ci': { target: '中華航空', type: 'airline', ratio: 1, unitPoints: 1, unitMiles: 1 },
    'ctbc_ci_inf': { target: '中華航空', type: 'airline', ratio: 1, unitPoints: 1, unitMiles: 1 },
    'taishin_cx': { target: '國泰航空', type: 'airline', ratio: 1, unitPoints: 1, unitMiles: 1 }
};

// [維護者註解] 控制倉庫卡片上顯示的「支援 X 家夥伴」與兌換比例文字，後續可從 rules.json 擴充。
const DEFAULT_TRANSFER_PARTNERS = {
    '匯豐 旅人積分': {
        supported_partners: [
            '中華航空', '長榮航空', '國泰航空(亞洲萬里通)', '新加坡航空', '日本航空(JAL)', '聯合航空(UA)', '卡達航空',
            '法國航空/荷蘭皇家航空', '加拿大航空', '越南航空', '海南航空', '亞洲航空(AirAsia)',
            '洲際酒店集團(IHG)', '雅高酒店集團(ALL Accor)', '萬豪旅享家(Marriott Bonvoy)'
        ],
        ratio_text: '1 點 = 1 哩/積分'
    },
    '匯豐Live+積分': {
        supported_partners: [
            '中華航空', '長榮航空', '國泰航空(亞洲萬里通)', '新加坡航空', '日本航空(JAL)', '聯合航空(UA)', '卡達航空',
            '法國航空/荷蘭皇家航空', '加拿大航空', '越南航空', '海南航空', '亞洲航空(AirAsia)',
            '洲際酒店集團(IHG)', '雅高酒店集團(ALL Accor)', '萬豪旅享家(Marriott Bonvoy)'
        ],
        ratio_text: '1 點 = 2 哩/積分'
    }
};

// [維護者註解] (Step 1 外掛化) 備援用的情境觸發關鍵字。主程式將依賴 getKeywordsConfig() 來獲取。
const DEFAULT_KEYWORDS = {
    live: {
        dining: ['餐廳','吃飯','外送','ubereats','foodpanda','燒肉','火鍋','麻辣','壽司','日式','居酒屋','餐酒館','酒吧','咖啡','甜點','牛排','鐵板燒','拉麵','茶六','屋馬','乾杯','buffet','王品','享鴨','夏慕尼','西堤','石二鍋','陶板屋','青花驕','饗賓','饗饗','開飯','瓦城','鼎泰豐','海底撈','金大鋤','築間','壽司郎','藏壽司','爭鮮','吉兆','明壽司','金色三麥','春大直','貳樓','涓豆腐','hooters','勝田','麥當勞','星巴克','必勝客','達美樂','富王','文公館','教父牛排','山海樓','鹽之華','牡丹','logy','inita','ikea','莫凡彼','貴族世家'],
        shop: ['momo','pchome','蝦皮','shopee','amazon','ebay','露天','friday','gomaji','淘寶','uniqlo','zara','h&m','net','gu','nike','adidas','outlet','台北101','三井','微風','sogo','漢神','華泰','新光','skm','att','美麗華','南紡','統一時代','遠雄','京站','citylink','夢時代','lalaport','高島屋','中友','遠企','麗寶','比漾','大江','巨城','遠東','global mall','環球','義大','台茂','宏匯','義享','noke','大魯閣','明曜','bellavita','寶雅','無印良品','muji','屈臣氏','康是美','松本清','唐吉訶德'],
        entertainment: ['新光影城','威秀','國賓','秀泰','環球影城','迪士尼','吉卜力','樂天世界','legoland','safari','兒童新樂園','x park','小人國','六福村','海洋公園','麗寶樂園','劍湖山','九族','尚順','義大遊樂','巧虎','動物園','海生館','奇美博物館','小叮噹','野柳','埔心','飛牛','頑皮世界','美術館','日月潭','太平山','阿里山','大雪山','墾丁','森林遊樂區']
    },
    asia_7: ['日本', '日幣', '日圓', 'jpy', 'tokyo', 'osaka', '新加坡', 'sgd', '馬來西亞', 'myr', '越南', 'vnd', '菲律賓', 'php', '印度', 'inr', '斯里蘭卡', 'lkr'],
    eu_uk: ['歐洲', '歐盟', '英國', '法國', '德國', '義大利', '西班牙', 'eur', 'gbp', 'london', 'paris']
};

// [維護者註解] (Step 1 外掛化) 備援用的各行不回饋黑名單。主程式將依賴 getBlocklistsConfig() 來獲取。
const DEFAULT_BLOCKLISTS = {
    ctbc: ['全聯','px','全支付','7-11','711','全家','萊爾富','ok超商','繳費','etoro','wise','revolut','麥當勞','肯德基','漢堡王','摩斯'],
    hsbc_base: ['全聯','px','7-11','711','全家','萊爾富','ok超商','繳費','判決書','醫療','掛號','年費','手續費','賭博','麥當勞','肯德基'],
    hsbc_live: ['全聯','px','7-11','711','全家','萊爾富','ok超商','繳費','判決書','醫療','掛號','年費','手續費','賭博'],
    taishin: ['分期','全聯','px','7-11','711','全家','萊爾富','ok超商','繳費','國民年金','etag','三商美邦','麥當勞','肯德基']
};

// [維護者註解] (Step 1 外掛化) 備援用的特定規則判定標籤 (如華航/國泰官網判定)。主程式將依賴 getRuleFlagsConfig() 來獲取。
const DEFAULT_RULE_FLAGS = {
    strict_online: ['flight_ci','flight_cx','flight_other']
};

// --- 內建防禦、卡片定義與轉點字典 ---
const BUILTIN_DEFS = [
  { id: 'hsbc_live', name: '匯豐 Live+', default: true },
  { id: 'ctbc_ci_inf', name: '中信 華航璀璨', default: false },
  { id: 'taishin_cx',name: '台新 國泰世界',default: true },
  { id: 'hsbc_inf',  name: '匯豐 旅人無限',default: true },
  { id: 'ctbc_ci',   name: '中信 華航鼎尊', default: true }
];

const DEFAULT_BILLING = { hsbc:6, ctbc:15, taishin:20, other:1 };
