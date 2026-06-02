// ================= XERCLEM — yerel finans motoru =================
// XERCLEMAPP algoritmasinin mobil/yerel (AsyncStorage) uyarlamasi.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const CURRENCY = '₼';
export const STORAGE_KEY = 'xerclem_finance_v2';
export const DEBT_PAYMENT_CAT = 'Borc Ödənişi'; // istatistige sayilmaz

// Kategoriler (XERCLEMAPP'ten — emoji + renk + alt kategoriler)
export const DEFAULT_CATEGORIES = {
  'Yemək': { icon: '🍔', color: '#f97316', subs: ['Market', 'Restoran', 'Fast Food', 'Sifariş', 'İş yerində'] },
  'Nəqliyyat': { icon: '🚗', color: '#3b82f6', subs: ['Taksi', 'Avtobus/Metro', 'Yanacaq', 'Təmir', 'Parkinq'] },
  'Alış-veriş': { icon: '🛍️', color: '#ec4899', subs: ['Geyim', 'Elektronika', 'Ev Əşyası', 'Kosmetika', 'Hədiyyə'] },
  'Ev & Kommunal': { icon: '🏠', color: '#14b8a6', subs: ['İcarə', 'İşıq/Qaz/Su', 'İnternet', 'Təmizlik', 'Təmir'] },
  'Əyləncə': { icon: '🎮', color: '#8b5cf6', subs: ['Kino', 'Oyun', 'Hobbi', 'Səyahət', 'Abunəliklər'] },
  'Sağlamlıq': { icon: '💊', color: '#06b6d4', subs: ['Aptek', 'Həkim', 'Analiz', 'İdman'] },
  'Borc': { icon: '💳', color: '#f43f5e', subs: ['Dost', 'Bank', 'Kredit Kartı'] },
  'Digər': { icon: '🏷️', color: '#64748b', subs: ['Sədəqə', 'İtgi', 'Naməlum'] },
};

// 3 seviyeli harcama sinifi
export const KINDS = {
  essential: { key: 'essential', label: 'Vacib', icon: '🛡️', color: '#22c55e' },
  standard: { key: 'standard', label: 'Standart', icon: '🔵', color: '#3b82f6' },
  wasteful: { key: 'wasteful', label: 'İsraf', icon: '🔥', color: '#f43f5e' },
};

// Yeni kateqoriya yaradarkən emoji/rəng seçimi
export const EMOJI_SET = ['🍔', '🛒', '🚗', '🏠', '🎮', '💊', '💳', '🏷️', '✈️', '🎁', '👕', '📱', '💡', '🐶', '📚', '☕', '🍺', '💅', '⚽', '🎬', '🧾', '💰', '🛠️', '🚌', '⛽', '🏥', '🎓', '💼', '🏦', '🌐', '🎵', '🍕', '🚬', '🌸', '👶', '🧹'];
export const COLOR_SET = ['#f97316', '#3b82f6', '#ec4899', '#14b8a6', '#8b5cf6', '#06b6d4', '#f43f5e', '#64748b', '#22c55e', '#eab308', '#6366f1', '#ef4444', '#0ea5e9', '#d946ef'];

export function catUsage(state, name) { return (state.transactions || []).filter((t) => t.category === name).length; }
export function subUsage(state, name, sub) { return (state.transactions || []).filter((t) => t.category === name && t.subCategory === sub).length; }
export const STATE_VERSION = 2;

export function emptyState() {
  return {
    version: STATE_VERSION,
    startingBalance: 0,
    transactions: [],
    incomes: [],
    debts: [],
    futureExpenses: [],
    categories: {},
    user: null,
  };
}

// ---- depolama ----
export async function loadState() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        ...emptyState(),
        ...s,
        categories: s.categories || {},
      };
    }
  } catch (e) {}
  return emptyState();
}
export async function saveState(s) {
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
}

// ---- id / tarih / para ----
export function uid() { return String(Date.now()) + Math.random().toString(36).slice(2, 7); }
export function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function todayYmd() { return ymd(new Date()); }
export function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

const MONTHS_AZ = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];
export function dateLabel(s) {
  if (!s) return '';
  const t = todayYmd();
  const y = ymd(addDays(new Date(), -1));
  if (s === t) return 'Bu gün';
  if (s === y) return 'Dünən';
  const d = parseYmd(s);
  return `${d.getDate()} ${MONTHS_AZ[d.getMonth()]} ${d.getFullYear()}`;
}
export function shortDate(s) {
  if (!s) return '';
  const d = parseYmd(s);
  return `${d.getDate()} ${MONTHS_AZ[d.getMonth()].slice(0, 3)}`;
}
// Azerice/Turkce para: 1.234,56
export function money(n) {
  const f = Math.abs(Number(n) || 0).toFixed(2);
  const [i, d] = f.split('.');
  const sep = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sep},${d}`;
}
export function parseAmount(s) { const n = parseFloat(String(s).replace(',', '.')); return isNaN(n) ? 0 : n; }
// XERCLEMAPP formatı: maks 1 onluq, minlik ayırıcı; "AZN ..." prefiksi
export function fmt(n) {
  let v = Number(n) || 0;
  const neg = v < 0; v = Math.abs(v);
  let str = v.toFixed(1);
  if (str.endsWith('.0')) str = str.slice(0, -2);
  const [int, dec] = str.split('.');
  const sep = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + sep + (dec ? ',' + dec : '');
}
export function azn(n) { return 'AZN ' + fmt(n); }
// Sistem mesajı (XERCLEMAPP-dakı AI feedback yerine kontekstual mesaj)
export function systemMessage(ov, stats) {
  if (ov.cash <= 0) return 'Pulun bitib. Gəlir əlavə et və ya xərcləri dayandır.';
  if (ov.projectedMonthEnd < 0) return 'Bu ayın öhdəliklərindən sonra balansın mənfiyə düşür — ehtiyatlı ol.';
  if (stats.wastefulTotal > 0 && stats.wastefulTotal >= stats.essentialTotal) return 'İsraf xərclərin vacibdən çoxdur — qənaət şansı var.';
  if (ov.cashRunway < 999 && ov.cashRunway <= 7) return `Diqqət: nağdın təxminən ${ov.cashRunway} gün davam edəcək.`;
  return `Gündəlik təhlükəsiz limitin ${azn(ov.dailySafeLimit)}. Yaxşı gedirsən!`;
}
export function catMeta(state, name) {
  const c = (state.categories || DEFAULT_CATEGORIES)[name];
  return c || { icon: '🏷️', color: '#64748b', subs: [] };
}
export function kindOf(t) { if (t.isEssential) return 'essential'; if (t.isWasteful) return 'wasteful'; return 'standard'; }

// ================= ALGORITMA =================

// Nakit (tek dogruluk kaynagi): baslangic + alinan gelirler - tum harcamalar
export function currentCash(s) {
  const inc = (s.incomes || []).filter((i) => i && i.isReceived).reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const exp = (s.transactions || []).reduce((a, t) => a + (Number(t && t.amount) || 0), 0);
  return (Number(s.startingBalance) || 0) + inc - exp;
}

// Donem istatistikleri
export function calculateStats(s) {
  const txs = (s.transactions || []).filter((t) => t.category !== DEBT_PAYMENT_CAT);
  const today = todayYmd();
  const yest = ymd(addDays(new Date(), -1));
  const now = new Date();
  const monthPrefix = today.slice(0, 7);
  const lastMonthPrefix = ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7);

  const onDay = (d) => txs.filter((t) => t.date === d).reduce((a, t) => a + t.amount, 0);
  const inMonth = (p) => txs.filter((t) => t.date && t.date.startsWith(p));
  const sum = (arr) => arr.reduce((a, t) => a + t.amount, 0);

  const thisMonthTx = inMonth(monthPrefix);
  const categoryBreakdown = {};
  for (const t of thisMonthTx) categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + t.amount;

  return {
    today: onDay(today),
    yesterday: onDay(yest),
    thisMonth: sum(thisMonthTx),
    lastMonth: sum(inMonth(lastMonthPrefix)),
    categoryBreakdown,
    essentialTotal: sum(thisMonthTx.filter((t) => t.isEssential)),
    wastefulTotal: sum(thisMonthTx.filter((t) => t.isWasteful)),
    standardTotal: sum(thisMonthTx.filter((t) => !t.isEssential && !t.isWasteful)),
    topExpenses: thisMonthTx.slice().sort((a, b) => b.amount - a.amount).slice(0, 5),
    trendDelta: (() => {
      const lm = sum(inMonth(lastMonthPrefix));
      const tm = sum(thisMonthTx);
      return lm > 0 ? ((tm - lm) / lm) * 100 : 0;
    })(),
  };
}

// Dövr üzrə qabaqcıl statistika (gün/həftə/ay/hamısı + alt kateqoriya)
export function periodRange(period) {
  const today = todayYmd();
  const now = new Date();
  if (period === 'today') return { start: today, end: today };
  if (period === 'week') return { start: ymd(addDays(now, -6)), end: today };
  if (period === 'month') return { start: today.slice(0, 7) + '-01', end: today };
  return { start: '0000-00-00', end: '9999-99-99' };
}
export function periodStats(state, period) {
  const { start, end } = periodRange(period);
  const txs = (state.transactions || []).filter((t) => t.category !== DEBT_PAYMENT_CAT && t.date >= start && t.date <= end);
  const total = txs.reduce((a, t) => a + t.amount, 0);
  const categoryBreakdown = {};
  const subBreakdown = {};
  for (const t of txs) {
    categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + t.amount;
    const key = t.subCategory || '(altsız)';
    subBreakdown[t.category] = subBreakdown[t.category] || {};
    subBreakdown[t.category][key] = (subBreakdown[t.category][key] || 0) + t.amount;
  }
  const essential = txs.filter((t) => t.isEssential).reduce((a, t) => a + t.amount, 0);
  const wasteful = txs.filter((t) => t.isWasteful).reduce((a, t) => a + t.amount, 0);
  const standard = total - essential - wasteful;
  const incomeTotal = (state.incomes || []).filter((i) => i.isReceived && i.date >= start && i.date <= end).reduce((a, i) => a + i.amount, 0);
  const top = txs.slice().sort((a, b) => b.amount - a.amount).slice(0, 6);
  return { total, count: txs.length, avg: txs.length ? total / txs.length : 0, categoryBreakdown, subBreakdown, essential, standard, wasteful, incomeTotal, top, txs };
}

// Finansal projeksiyon + uyarilar
export function overview(s) {
  const cash = currentCash(s);
  const now = new Date();
  const today = todayYmd();
  const y = now.getFullYear(), m = now.getMonth();
  const dim = daysInMonth(y, m);
  const monthEnd = ymd(new Date(y, m, dim));
  const daysRemaining = Math.max(1, dim - now.getDate() + 1);
  const dailySafeLimit = Math.floor(cash / daysRemaining);

  // 30 gunluk yuvarlanan pencere (borc odemeleri haric)
  const txs = (s.transactions || []).filter((t) => t.category !== DEBT_PAYMENT_CAT);
  let firstDate = today;
  for (const t of txs) if (t.date && t.date < firstDate) firstDate = t.date;
  const daysSinceFirst = Math.max(1, Math.round((parseYmd(today) - parseYmd(firstDate)) / 86400000) + 1);
  const windowDays = Math.min(30, daysSinceFirst);
  const windowStart = ymd(addDays(new Date(), -(windowDays - 1)));
  const windowTx = txs.filter((t) => t.date >= windowStart);
  const wsum = (f) => windowTx.filter(f).reduce((a, t) => a + t.amount, 0);
  const avgDaily = wsum(() => true) / windowDays;
  const avgEssential = wsum((t) => t.isEssential) / windowDays;
  const avgWasteful = wsum((t) => t.isWasteful) / windowDays;
  const avgStandard = wsum((t) => !t.isEssential && !t.isWasteful) / windowDays;

  // Bu ayki yukumlulukler
  const unpaidDebts = (s.debts || []).filter((d) => (d.paid || 0) < d.amount);
  const debtsDue = unpaidDebts.filter((d) => d.type === 'Acil' || (d.dueDate && d.dueDate <= monthEnd));
  const debtsDueTotal = debtsDue.reduce((a, d) => a + (d.amount - (d.paid || 0)), 0);
  const futureDue = (s.futureExpenses || []).filter((f) => f.date && f.date <= monthEnd);
  const futureDueTotal = futureDue.reduce((a, f) => a + f.amount, 0);
  const obligations = debtsDueTotal + futureDueTotal;
  const projectedMonthEnd = cash - obligations;

  // Acil ihtiyac karsilama
  const essentialNeeded =
    debtsDue.filter((d) => d.type === 'Acil').reduce((a, d) => a + (d.amount - (d.paid || 0)), 0) +
    futureDue.filter((f) => f.isEssential).reduce((a, f) => a + f.amount, 0);
  const essentialCoverage = essentialNeeded > 0 ? Math.min(100, (cash / essentialNeeded) * 100) : 100;

  // Nakit omru (gun)
  const cashRunway = cash <= 0 ? 0 : (avgDaily > 0 ? Math.floor(cash / avgDaily) : 999);

  return {
    cash, daysRemaining, dailySafeLimit, avgDaily, avgEssential, avgWasteful, avgStandard,
    obligations, projectedMonthEnd, essentialNeeded, essentialCoverage, cashRunway, windowDays,
  };
}

// Uyarilar: gecikmis bekleyen gelir + yaklasan borc (-5..+1 gun)
export function buildAlerts(s) {
  const today = todayYmd();
  const out = [];
  for (const i of (s.incomes || [])) {
    if (!i.isReceived && i.date && i.date <= today) out.push({ kind: 'income', title: i.title, amount: i.amount, date: i.date });
  }
  const lo = ymd(addDays(new Date(), -5)), hi = ymd(addDays(new Date(), 1));
  for (const d of (s.debts || [])) {
    if ((d.paid || 0) < d.amount && d.dueDate && d.dueDate >= lo && d.dueDate <= hi) {
      out.push({ kind: 'debt', title: d.title, amount: d.amount - (d.paid || 0), date: d.dueDate });
    }
  }
  return out;
}
