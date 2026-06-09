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
    defaultRange: 'month',
    user: null,
  };
}

// ---- depolama ----
// Bozuk/yarım veriye karşı normalleştirme (loadState + import üçün)
export function normalizeState(s) {
  const base = emptyState();
  if (!s || typeof s !== 'object') return base;
  return {
    ...base,
    ...s,
    categories: (s.categories && typeof s.categories === 'object') ? s.categories : {},
    transactions: Array.isArray(s.transactions) ? s.transactions : [],
    incomes: Array.isArray(s.incomes) ? s.incomes : [],
    debts: Array.isArray(s.debts) ? s.debts : [],
    futureExpenses: Array.isArray(s.futureExpenses) ? s.futureExpenses : [],
  };
}
export async function loadState() {
  let raw = null;
  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch (e) {
    console.warn('XERCLEM loadState (bozuk məlumat):', e && e.message);
    // Bozuk veriyi ayrı açara qoru — üzərinə yazma, sonra bərpa oluna bilər
    if (raw) { try { await AsyncStorage.setItem(STORAGE_KEY + '_corrupt', raw); } catch (e2) {} }
  }
  return emptyState();
}
export async function saveState(s) {
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  catch (e) { console.warn('XERCLEM saveState:', e && e.message); }
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

export const MONTHS_AZ = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];
export const WEEKDAYS_AZ = ['B.e', 'Ç.a', 'Çər', 'C.a', 'Cüm', 'Şən', 'Baz'];

// Ana ekran tarix aralığı
export function rangeBounds(range) {
  const today = todayYmd();
  const now = new Date();
  if (range === '7') return { start: ymd(addDays(now, -6)), end: today, label: 'Son 7 gün' };
  if (range === '15') return { start: ymd(addDays(now, -14)), end: today, label: 'Son 15 gün' };
  if (range === 'lastmonth') {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { start: ymd(lm), end: ymd(new Date(now.getFullYear(), now.getMonth(), 0)), label: 'Keçən ay' };
  }
  if (range === 'all') return { start: '0000-00-00', end: '9999-99-99', label: 'Bütün zaman' };
  return { start: today.slice(0, 7) + '-01', end: today, label: 'Bu ay' };
}
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
export function systemMessage(ov, m) {
  if (ov.cash <= 0) return 'Pulun bitib — xərcləri azalt və ya başlanğıc balansı ⚙️-dən yenilə.';
  if (ov.projectedMonthEnd < 0) return 'Bu ayın öhdəliklərindən sonra balansın mənfiyə düşür — ehtiyatlı ol.';
  if (m.wasteful > 0 && m.wasteful >= m.essential) return 'İsraf xərclərin vacibdən çoxdur — qənaət şansı var.';
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
  // Gəlir sistemdən çıxarıldı — nağd = başlanğıc balans − bütün xərclər.
  const exp = (s.transactions || []).reduce((a, t) => a + (Number(t && t.amount) || 0), 0);
  return (Number(s.startingBalance) || 0) - exp;
}

// ===== Vahid statistika: seçilmiş dövr üçün HƏR ŞEY (həm dashboard, həm statistika ekranı) =====
export function statsFor(state, range) {
  const { start, end, label } = rangeBounds(range);
  const today = todayYmd();
  const txs = (state.transactions || []).filter((t) => t.category !== DEBT_PAYMENT_CAT && t.date && t.date >= start && t.date <= end);
  let total = 0, essential = 0, wasteful = 0;
  const categoryBreakdown = {}, subBreakdown = {}, dailyMap = {};
  const weekday = [0, 0, 0, 0, 0, 0, 0]; // B.e..Baz (Bazar ertəsi = 0)
  for (const t of txs) {
    const amt = Number(t.amount) || 0;
    total += amt;
    if (t.isEssential) essential += amt; else if (t.isWasteful) wasteful += amt;
    categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + amt;
    const k = t.subCategory || '(altsız)';
    subBreakdown[t.category] = subBreakdown[t.category] || {};
    subBreakdown[t.category][k] = (subBreakdown[t.category][k] || 0) + amt;
    weekday[(parseYmd(t.date).getDay() + 6) % 7] += amt;
    dailyMap[t.date] = (dailyMap[t.date] || 0) + amt;
  }
  const standard = total - essential - wasteful;
  // gün sayısı (avgDaily üçün): 'all' yalnız ilk əməliyyatdan BUGÜNƏ qədər sayılır
  const effEnd = range === 'all' ? today : end;
  let s = range === 'all' ? today : start;
  if (range === 'all') for (const t of txs) if (t.date < s) s = t.date;
  const days = Math.max(1, Math.round((parseYmd(effEnd) - parseYmd(s)) / 86400000) + 1);
  const incomeTotal = (state.incomes || []).filter((i) => i.isReceived && i.date && i.date >= start && i.date <= end).reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const top = txs.slice().sort((a, b) => b.amount - a.amount).slice(0, 6);
  return { label, start, end, total, essential, standard, wasteful, count: txs.length, avg: txs.length ? total / txs.length : 0, avgDaily: total / days, days, categoryBreakdown, subBreakdown, weekday, dailyMap, incomeTotal, top, txs };
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
  const essentialCoverage = essentialNeeded > 0 ? Math.max(0, Math.min(100, (cash / essentialNeeded) * 100)) : 100;

  // Nakit omru (gun)
  const cashRunway = cash <= 0 ? 0 : (avgDaily > 0 ? Math.floor(cash / avgDaily) : 999);

  return {
    cash, daysRemaining, dailySafeLimit, avgDaily, avgEssential, avgWasteful, avgStandard,
    obligations, projectedMonthEnd, essentialNeeded, essentialCoverage, cashRunway, windowDays,
  };
}

// Uyarilar: gecikmis bekleyen gelir + yaklasan borc (-5..+1 gun)
export function buildAlerts(s) {
  // Gəlir xəbərdarlıqları çıxarıldı — yalnız yaxınlaşan borclar.
  const out = [];
  const lo = ymd(addDays(new Date(), -5)), hi = ymd(addDays(new Date(), 1));
  for (const d of (s.debts || [])) {
    if ((d.paid || 0) < d.amount && d.dueDate && d.dueDate >= lo && d.dueDate <= hi) {
      out.push({ kind: 'debt', title: d.title, amount: d.amount - (d.paid || 0), date: d.dueDate });
    }
  }
  return out;
}
