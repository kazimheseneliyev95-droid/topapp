import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, Dimensions, KeyboardAvoidingView, LayoutAnimation, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, UIManager, View,
} from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import {
  DEBT_PAYMENT_CAT, KINDS, EMOJI_SET, COLOR_SET, STATE_VERSION,
  emptyState, loadState, saveState, uid, ymd, todayYmd, parseYmd, addDays,
  dateLabel, shortDate, azn, parseAmount, catMeta, kindOf, catUsage,
  currentCash, overview, buildAlerts, systemMessage,
  daysInMonth, MONTHS_AZ, WEEKDAYS_AZ, rangeBounds, statsFor, normalizeState,
} from './src/finance';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as api from './src/api';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);
const animate = () => { try { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); } catch (e) {} };
const stop = (e) => { if (e && e.stopPropagation) e.stopPropagation(); };

async function doExport(state) {
  try {
    const d = new Date();
    const stamp = `${todayYmd()}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    const payload = { app: 'XERCLEM', version: STATE_VERSION, exportedAt: d.toISOString(), data: state };
    const json = JSON.stringify(payload, null, 2);
    const name = `xerclem-yedek-${stamp}.json`;
    if (Platform.OS === 'web') {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); return;
    }
    const uri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + name;
    await FileSystem.writeAsStringAsync(uri, json);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'XƏRCLƏM yedəyi', UTI: 'public.json' });
    else Alert.alert('Paylaşım yoxdur', `Fayl saxlanıldı:\n${uri}`);
  } catch (e) { Alert.alert('Xəta', 'Yedək alınmadı: ' + (e && e.message)); }
}
async function doImport(onRestore) {
  try {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (res.canceled || !res.assets || !res.assets[0]) return;
    let json;
    if (Platform.OS === 'web') { const r = await fetch(res.assets[0].uri); json = await r.text(); } else json = await FileSystem.readAsStringAsync(res.assets[0].uri);
    const parsed = JSON.parse(json);
    // Yeni format {app,version,data} həm də köhnə düz state — hər ikisini qəbul et
    const data = (parsed && parsed.app === 'XERCLEM' && parsed.data) ? parsed.data : parsed;
    if (!data || typeof data !== 'object' || !Array.isArray(data.transactions)) { Alert.alert('Yararsız fayl', 'Bu XƏRCLƏM yedəyi deyil.'); return; }
    const n = data.transactions.length;
    Alert.alert('Bərpa et?', `Yedəkdə ${n} əməliyyat var.\nMövcud BÜTÜN məlumatların əvəzlənəcək (geri alına bilməz).`, [
      { text: 'İmtina', style: 'cancel' },
      { text: 'Bərpa et', style: 'destructive', onPress: () => { onRestore(data); Alert.alert('Bərpa olundu ✅', `${n} əməliyyat geri yükləndi.`); } },
    ]);
  } catch (e) { Alert.alert('Xəta', 'Bərpa alınmadı: ' + (e && e.message)); }
}

const TINT = {
  green: { bg: '#ecfdf5', fg: '#16a34a', bd: '#bbf7d0' },
  blue: { bg: '#eff6ff', fg: '#2563eb', bd: '#bfdbfe' },
  red: { bg: '#fef2f2', fg: '#dc2626', bd: '#fecaca' },
  yellow: { bg: '#fefce8', fg: '#ca8a04', bd: '#fde68a' },
  orange: { bg: '#fff7ed', fg: '#ea580c', bd: '#fed7aa' },
  purple: { bg: '#f5f3ff', fg: '#7c3aed', bd: '#ddd6fe' },
  slate: { bg: '#f8fafc', fg: '#475569', bd: '#e2e8f0' },
};
const RANGES = [{ k: '7', l: 'Son 7 gün' }, { k: '15', l: 'Son 15 gün' }, { k: 'month', l: 'Bu ay' }, { k: 'lastmonth', l: 'Keçən ay' }, { k: 'all', l: 'Hamısı' }];

export default function App() {
  const [booting, setBooting] = useState(true);   // token yoxlanır
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);  // serverdən state yüklənir
  const [state, setState] = useState(emptyState());
  const stateRef = useRef(state);
  stateRef.current = state;

  // Serverdən tam state-i çək
  async function pullFromServer() {
    setLoading(true);
    try { setState(await api.loadOnline()); setAuthed(true); }
    catch (e) {
      if (e && e.code === 401) setAuthed(false);
      else Alert.alert('Bağlantı xətası', (e && e.message) || 'Serverə qoşulmaq olmadı');
      throw e;
    } finally { setLoading(false); }
  }

  // İlk açılış: saxlanmış token varsa avtomatik yüklə
  useEffect(() => { (async () => {
    const t = await api.getToken();
    if (t) { try { await pullFromServer(); } catch (e) {} }
    setBooting(false);
  })(); }, []);

  // Online saxlama (debounce) — yalnız daxil olduqdan və yükləndikdən sonra
  useEffect(() => {
    if (!authed || loading) return;
    const t = setTimeout(() => { api.saveOnline(state).catch((e) => { if (e && e.code === 401) setAuthed(false); }); }, 600);
    return () => clearTimeout(t);
  }, [state, authed, loading]);

  // Arxa plana keçəndə dərhal saxla
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st !== 'active' && authed) api.saveOnline(stateRef.current).catch(() => {}); });
    return () => sub.remove();
  }, [authed]);

  const mutate = (fn) => setState((prev) => fn(prev));
  async function handleLogout() { await api.setToken(null); setState(emptyState()); setAuthed(false); }

  if (booting) return <View style={[styles.root, styles.center]}><StatusBar style="dark" /><ActivityIndicator color="#0EA5E9" size="large" /></View>;
  if (!authed) return <LoginScreen onDone={pullFromServer} />;
  if (loading) return <View style={[styles.root, styles.center]}><StatusBar style="dark" /><ActivityIndicator color="#0EA5E9" size="large" /></View>;
  return <Dashboard state={state} mutate={mutate} onLogout={handleLogout} />;
}

function LoginScreen({ onDone }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    if (busy) return;
    const e1 = (email || '').trim();
    if (!e1 || !password) { setErr('Mail və parol lazımdır'); return; }
    setErr(''); setBusy(true);
    try {
      if (mode === 'signin') await api.signin(e1, password);
      else await api.signup(e1, password);
      await onDone();
    } catch (e) { setErr((e && e.message) || 'Xəta baş verdi'); setBusy(false); }
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 36, fontWeight: '800', color: '#0f172a', textAlign: 'center' }}>Xerclem</Text>
        <Text style={{ fontSize: 15, color: '#64748b', textAlign: 'center', marginTop: 6, marginBottom: 28 }}>
          {mode === 'signin' ? 'Hesabına daxil ol' : 'Yeni hesab yarat'}
        </Text>
        <TextInput value={email} onChangeText={setEmail} placeholder="E-poçt" placeholderTextColor="#94a3b8"
          autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, fontSize: 16, marginBottom: 12, color: '#0f172a' }} />
        <TextInput value={password} onChangeText={setPassword} placeholder="Parol" placeholderTextColor="#94a3b8"
          secureTextEntry autoCapitalize="none"
          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, fontSize: 16, color: '#0f172a' }} />
        {err ? <Text style={{ color: '#dc2626', marginTop: 14, textAlign: 'center', fontSize: 14 }}>{err}</Text> : null}
        <TouchableOpacity onPress={submit} disabled={busy}
          style={{ backgroundColor: '#0EA5E9', borderRadius: 14, paddingVertical: 17, marginTop: 20, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{mode === 'signin' ? 'Daxil ol' : 'Qeydiyyatdan keç'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setErr(''); setMode(mode === 'signin' ? 'signup' : 'signin'); }} style={{ marginTop: 20, alignItems: 'center' }}>
          <Text style={{ color: '#0EA5E9', fontSize: 14 }}>{mode === 'signin' ? 'Hesabın yoxdur? Qeydiyyat' : 'Hesabın var? Daxil ol'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Dashboard({ state, mutate, onLogout }) {
  const [sheet, setSheet] = useState(null);
  const [formTx, setFormTx] = useState(null);

  const ov = useMemo(() => overview(state), [state]);
  const mstats = useMemo(() => statsFor(state, 'month'), [state]);
  const alerts = useMemo(() => buildAlerts(state), [state]);
  const sysMsg = useMemo(() => systemMessage(ov, mstats), [ov, mstats]);

  const saveTx = (t) => { animate(); mutate((s) => ({ ...s, transactions: s.transactions.some((x) => x.id === t.id) ? s.transactions.map((x) => x.id === t.id ? t : x) : [t, ...s.transactions] })); setFormTx(null); };
  const delTx = (id) => { animate(); mutate((s) => ({ ...s, transactions: s.transactions.filter((x) => x.id !== id) })); setFormTx(null); };
  const addIncome = (i) => mutate((s) => ({ ...s, incomes: [i, ...s.incomes] }));
  const delIncome = (id) => mutate((s) => ({ ...s, incomes: s.incomes.filter((x) => x.id !== id) }));
  const toggleIncome = (id) => mutate((s) => ({ ...s, incomes: s.incomes.map((x) => x.id === id ? { ...x, isReceived: !x.isReceived } : x) }));
  const addDebt = (d) => mutate((s) => ({ ...s, debts: [d, ...s.debts] }));
  const delDebt = (id) => mutate((s) => ({ ...s, debts: s.debts.filter((x) => x.id !== id) }));
  const payDebt = (d) => mutate((s) => {
    const amt = d.amount - (d.paid || 0); if (amt <= 0) return s;
    if (currentCash(s) < amt) { Alert.alert('Nağd çatmır', 'Bu borcu ödəmək üçün nağdın yetərli deyil.'); return s; }
    const tx = { id: uid(), amount: amt, category: DEBT_PAYMENT_CAT, subCategory: '', note: `Borc ödənildi: ${d.title}`, isEssential: true, relatedDebtId: d.id, date: todayYmd(), createdAt: Date.now() };
    return { ...s, transactions: [tx, ...s.transactions], debts: s.debts.map((x) => x.id === d.id ? { ...x, paid: x.amount } : x) };
  });
  const addFuture = (f) => mutate((s) => ({ ...s, futureExpenses: [f, ...s.futureExpenses] }));
  const delFuture = (id) => mutate((s) => ({ ...s, futureExpenses: s.futureExpenses.filter((x) => x.id !== id) }));
  const setCash = (target) => mutate((s) => { const inc = s.incomes.filter((i) => i.isReceived).reduce((a, i) => a + (Number(i.amount) || 0), 0); const exp = s.transactions.reduce((a, t) => a + (Number(t.amount) || 0), 0); return { ...s, startingBalance: target - inc + exp }; });
  const resetAll = () => mutate(() => emptyState());
  const restore = (data) => mutate(() => normalizeState(data));
  const clearCats = () => { animate(); mutate((s) => ({ ...s, categories: {} })); };
  const setRange = (r) => mutate((s) => ({ ...s, defaultRange: r }));
  const addCategory = (name, icon, color) => { const n = (name || '').trim(); if (!n || state.categories[n]) return false; mutate((s) => ({ ...s, categories: { ...s.categories, [n]: { icon: icon || '🏷️', color: color || '#64748b', subs: [] } } })); return true; };
  const addSub = (cat, sub) => { const c = state.categories[cat]; const sn = (sub || '').trim(); if (!c || !sn || (c.subs || []).includes(sn)) return false; mutate((s) => { const cc = s.categories[cat]; if (!cc) return s; return { ...s, categories: { ...s.categories, [cat]: { ...cc, subs: [...(cc.subs || []), sn] } } }; }); return true; };
  const delCategory = (name) => mutate((s) => { const c = { ...s.categories }; delete c[name]; return { ...s, categories: c }; });
  const delSub = (cat, sub) => mutate((s) => { const c = s.categories[cat]; if (!c) return s; return { ...s, categories: { ...s.categories, [cat]: { ...c, subs: (c.subs || []).filter((x) => x !== sub) } } }; });
  const editCategory = (oldName, newName, icon, color) => {
    const nn = (newName || '').trim(); const meta = state.categories[oldName];
    if (!nn || !meta || (nn !== oldName && state.categories[nn])) return false;
    mutate((s) => {
      const cats = { ...s.categories }; const m = cats[oldName]; if (!m) return s;
      if (nn !== oldName) { delete cats[oldName]; cats[nn] = { ...m, icon: icon || m.icon, color: color || m.color }; return { ...s, categories: cats, transactions: s.transactions.map((t) => t.category === oldName ? { ...t, category: nn } : t) }; }
      cats[oldName] = { ...m, icon: icon || m.icon, color: color || m.color }; return { ...s, categories: cats };
    });
    return true;
  };

  const range = state.defaultRange || 'month';
  const rb = useMemo(() => rangeBounds(range), [range]);
  const rs = useMemo(() => statsFor(state, range), [state, range]);
  const sections = useMemo(() => {
    const inRange = state.transactions.filter((e) => e.date && e.date >= rb.start && e.date <= rb.end);
    const byDate = {};
    for (const e of inRange) (byDate[e.date] = byDate[e.date] || []).push(e);
    return Object.keys(byDate).sort((a, b) => b.localeCompare(a)).map((date) => ({ date, total: byDate[date].reduce((a, t) => a + (Number(t.amount) || 0), 0), items: byDate[date].slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) }));
  }, [state.transactions, rb]);
  const rangeCount = sections.reduce((a, s) => a + s.items.length, 0);

  const heroColor = ov.cash > 0 ? '#16a34a' : '#dc2626';
  const catApi = { addCategory, addSub, editCategory };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View><Text style={styles.appTitle}>Finansal Kontrol</Text><Text style={styles.appSub}>SİSTEM HAZIR</Text></View>
          <View style={styles.iconRow}>
            <HIcon icon="💳" tint="red" onPress={() => setSheet('debt')} />
            <HIcon icon="📊" tint="orange" onPress={() => setSheet('stats')} />
            <HIcon icon="📅" tint="blue" onPress={() => setSheet('future')} />
            <HIcon icon="📈" tint="green" onPress={() => setSheet('income')} />
            <HIcon icon="⚙️" tint="slate" onPress={() => setSheet('settings')} />
          </View>
        </View>

        <View style={styles.sysMsg}>
          <View style={styles.sysIcon}><Text style={{ fontSize: 15 }}>📈</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.sysLabel}>SİSTEM MESAJI</Text><Text style={styles.sysText}>{sysMsg}</Text></View>
        </View>

        {alerts.map((a, i) => (
          <View key={i} style={[styles.alert, { borderColor: a.kind === 'debt' ? '#fecaca' : '#bbf7d0', backgroundColor: a.kind === 'debt' ? '#fef2f2' : '#ecfdf5' }]}>
            <Text>{a.kind === 'debt' ? '⏰' : '💰'}</Text>
            <Text style={styles.alertText}>{a.kind === 'debt' ? 'Borc yaxınlaşır: ' : 'Gözlənilən gəlir: '}<Text style={{ fontWeight: '800' }}>{a.title}</Text> · {azn(a.amount)} · {shortDate(a.date)}</Text>
          </View>
        ))}

        <View style={[styles.hero, { backgroundColor: heroColor }]}>
          <Text style={styles.heroTop}>👛  İNDİKİ PUL</Text>
          <Text style={styles.heroAmount}>{azn(ov.cash)}</Text>
          <View style={styles.heroRow}>
            <View style={styles.heroChip}><Text style={styles.heroChipL}>{rb.label} xərc</Text><Text style={styles.heroChipV}>{azn(rs.total)}</Text></View>
            <View style={styles.heroChip}><Text style={styles.heroChipL}>Günlük güvənli limit</Text><Text style={styles.heroChipV}>{azn(ov.dailySafeLimit)}</Text></View>
          </View>
        </View>

        <View style={styles.gridPad}>
          <View style={styles.row2}>
            <StatCard icon="📅" label="GÜNDƏLİK ORTA" value={azn(rs.avgDaily)} sub={`${rs.count} əməliyyat`} tint="blue" flex />
            <StatCard icon="💰" label="GƏLİR (dövr)" value={azn(rs.incomeTotal || 0)} sub={`net ${azn((rs.incomeTotal || 0) - rs.total)}`} tint="green" flex />
          </View>
          <View style={styles.row3}>
            <StatCard icon="🛡️" label="VACIB" value={azn(rs.essential)} sub={`${rs.total ? Math.round(rs.essential / rs.total * 100) : 0}%`} tint="red" flex small />
            <StatCard icon="🛒" label="STANDART" value={azn(rs.standard)} sub={`${rs.total ? Math.round(rs.standard / rs.total * 100) : 0}%`} tint="yellow" flex small />
            <StatCard icon="🔥" label="İSRAF" value={azn(rs.wasteful)} sub={`${rs.total ? Math.round(rs.wasteful / rs.total * 100) : 0}%`} tint="orange" flex small />
          </View>
          <View style={styles.row2}>
            <StatCard icon="📈" label="AY SONUNA" value={azn(ov.projectedMonthEnd)} sub="bu ay proyeksiya" tint={ov.projectedMonthEnd < 0 ? 'red' : 'green'} flex />
            <StatCard icon="🛡️" label="VACIB TƏMINAT" value={`${ov.essentialCoverage.toFixed(0)}%`} sub={ov.essentialNeeded > 0 ? `lazım ${azn(ov.essentialNeeded)}` : 'öhdəlik yox'} tint={ov.essentialCoverage >= 100 ? 'green' : 'yellow'} flex />
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
          <TouchableOpacity style={styles.addBtn} onPress={() => setFormTx({})} activeOpacity={0.85}><Text style={styles.addBtnText}>＋  Xərc Əlavə Et</Text></TouchableOpacity>
        </View>

        <Text style={styles.listHeading}>{rb.label} — hərəkətlər ({rangeCount})</Text>

        {sections.length === 0 ? <Text style={styles.emptyText}>Bu aralıqda xərc yoxdur.</Text> : sections.map((sec) => (
          <View key={sec.date}>
            <View style={styles.secHeader}><Text style={styles.secDate}>{dateLabel(sec.date)}</Text><Text style={styles.secTotal}>{azn(sec.total)}</Text></View>
            {sec.items.map((item) => <Row key={item.id} state={state} item={item} onPress={() => item.category !== DEBT_PAYMENT_CAT && setFormTx(item)} />)}
          </View>
        ))}
      </ScrollView>

      <ExpenseSheet visible={!!formTx} state={state} initial={formTx && formTx.id ? formTx : null} catApi={catApi} onClose={() => setFormTx(null)} onSave={saveTx} onDelete={delTx} />
      <DebtSheet visible={sheet === 'debt'} state={state} onClose={() => setSheet(null)} onAdd={addDebt} onDelete={delDebt} onPay={payDebt} />
      <FutureSheet visible={sheet === 'future'} state={state} onClose={() => setSheet(null)} onAdd={addFuture} onDelete={delFuture} />
      <IncomeSheet visible={sheet === 'income'} state={state} onClose={() => setSheet(null)} onAdd={addIncome} onDelete={delIncome} onToggle={toggleIncome} />
      <StatsSheet visible={sheet === 'stats'} state={state} onClose={() => setSheet(null)} />
      <SettingsSheet visible={sheet === 'settings'} state={state} range={range} onSetRange={setRange} onClose={() => setSheet(null)} onSetCash={setCash} onReset={resetAll} onOpenCats={() => setSheet('cats')} onRestore={restore} onLogout={onLogout} />
      <CategorySheet visible={sheet === 'cats'} state={state} onClose={() => setSheet('settings')} catApi={catApi} onDelCat={delCategory} onDelSub={delSub} onClearAll={clearCats} />
    </View>
  );
}

function HIcon({ icon, tint, onPress }) { const t = TINT[tint]; return <TouchableOpacity style={[styles.hIcon, { backgroundColor: t.bg }]} onPress={onPress} activeOpacity={0.7}><Text style={{ fontSize: 17 }}>{icon}</Text></TouchableOpacity>; }
function StatCard({ icon, label, value, sub, tint, flex, small }) {
  const t = TINT[tint] || TINT.slate;
  return (
    <View style={[styles.statCard, { backgroundColor: t.bg, borderColor: t.bd }, flex && { flex: 1 }]}>
      <View style={styles.statHead}><Text style={{ fontSize: 12 }}>{icon}</Text><Text style={[styles.statLabel, { color: t.fg }]}>{label}</Text></View>
      <Text style={[styles.statValue, small && { fontSize: 15 }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}
function Row({ state, item, onPress }) {
  const c = catMeta(state, item.category); const k = KINDS[kindOf(item)]; const isDebt = item.category === DEBT_PAYMENT_CAT;
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.rowIcon, { backgroundColor: (isDebt ? '#f43f5e' : c.color) + '22' }]}><Text style={{ fontSize: 17 }}>{isDebt ? '💳' : c.icon}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{item.category}{item.subCategory ? ` · ${item.subCategory}` : ''}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          {!isDebt ? <Text style={[styles.kindBadge, { color: k.color }]}>{k.icon} {k.label}</Text> : null}
          {item.note ? <Text style={styles.rowNote} numberOfLines={1}>{item.note}</Text> : null}
        </View>
      </View>
      <Text style={styles.rowAmount}>{azn(item.amount)}</Text>
    </TouchableOpacity>
  );
}

function ExpenseSheet({ visible, state, initial, catApi, onClose, onSave, onDelete }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalRoot} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kavWrap}>
          <Pressable style={styles.sheet} onPress={stop}>
            <View style={styles.sheetHandle} />
            {visible ? <ExpenseForm state={state} initial={initial} catApi={catApi} onCancel={onClose} onSave={onSave} onDelete={onDelete} /> : null}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
function ExpenseForm({ state, initial, catApi, onCancel, onSave, onDelete }) {
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [cat, setCat] = useState(initial ? initial.category : '');
  const [sub, setSub] = useState(initial ? (initial.subCategory || '') : '');
  const [kind, setKind] = useState(initial ? kindOf(initial) : 'standard');
  const [date, setDate] = useState(initial ? parseYmd(initial.date) : new Date());
  const [note, setNote] = useState(initial ? (initial.note || '') : '');
  const [catPicker, setCatPicker] = useState(false);
  const [subPicker, setSubPicker] = useState(false);
  const valid = parseAmount(amount) > 0 && cat;
  function bump(d) { setAmount(String(Math.max(0, Math.round((parseAmount(amount) + d) * 100) / 100))); }
  function save() {
    if (!valid) { Alert.alert('Əskik', 'Məbləğ və kateqoriya lazımdır.'); return; }
    onSave({ id: initial ? initial.id : uid(), amount: parseAmount(amount), category: cat, subCategory: sub, note: note.trim(), isEssential: kind === 'essential', isWasteful: kind === 'wasteful', date: ymd(date), createdAt: initial ? initial.createdAt : Date.now() });
  }
  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.formHead}>
        <Text style={styles.formTitle}>{initial ? 'Xərci Düzəlt' : 'Yeni Xərc'}</Text>
        <TouchableOpacity onPress={onCancel}><Text style={styles.cancelLink}>Ləğv et</Text></TouchableOpacity>
      </View>
      <View style={styles.amountBox}>
        <Text style={styles.amountCur}>₼</Text>
        <TextInput style={styles.amountInput} placeholder="0.00" placeholderTextColor="#cbd5e1" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <View><TouchableOpacity style={styles.stepper} onPress={() => bump(1)}><Text style={styles.stepperT}>▲</Text></TouchableOpacity><TouchableOpacity style={styles.stepper} onPress={() => bump(-1)}><Text style={styles.stepperT}>▼</Text></TouchableOpacity></View>
      </View>

      <Text style={styles.fLabel}>KATEQORIYA</Text>
      <TouchableOpacity style={styles.dropdown} onPress={() => setCatPicker(true)} activeOpacity={0.7}>
        <Text style={styles.ddIcon}>{cat ? catMeta(state, cat).icon : '🗂️'}</Text>
        <Text style={[styles.ddText, !cat && { color: '#94a3b8' }]}>{cat || 'Seçin...'}</Text>
        <Text style={styles.ddChevron}>▾</Text>
      </TouchableOpacity>

      {cat ? (
        <>
          <Text style={styles.fLabel}>ALT KATEQORIYA</Text>
          <TouchableOpacity style={styles.dropdown} onPress={() => setSubPicker(true)} activeOpacity={0.7}>
            <Text style={[styles.ddText, !sub && { color: '#64748b' }]}>{sub || 'Ümumi (Seçilməyib)'}</Text>
            <Text style={styles.ddChevron}>▾</Text>
          </TouchableOpacity>
        </>
      ) : null}

      <Text style={styles.fLabel}>XƏRC NÖVÜ</Text>
      <View style={styles.kindRow}>
        {[KINDS.standard, KINDS.essential, KINDS.wasteful].map((k) => {
          const subL = k.key === 'standard' ? 'adi gündəlik' : k.key === 'essential' ? 'məcburi' : 'xərcləməyə bilərdik';
          const active = kind === k.key;
          return (
            <TouchableOpacity key={k.key} onPress={() => setKind(k.key)} style={[styles.kindBtn, active && { borderColor: k.color, backgroundColor: k.color + '14' }]}>
              <Text style={[styles.kindMain, active && { color: k.color }]}>{k.label}</Text><Text style={styles.kindSub}>{subL}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.fLabel}>TARİX</Text>
      <DateStepper date={date} setDate={setDate} maxToday />

      <Text style={styles.fLabel}>QEYD (İSTƏYƏ BAĞLI)</Text>
      <TextInput style={styles.noteInput} placeholder="Məs: Dostlarla nahar..." placeholderTextColor="#94a3b8" value={note} onChangeText={setNote} />

      <TouchableOpacity style={[styles.confirmBtn, !valid && { backgroundColor: '#cbd5e1' }]} onPress={save} disabled={!valid} activeOpacity={0.85}><Text style={styles.confirmText}>{initial ? 'Yadda saxla' : 'Xərci Təsdiqlə'}</Text></TouchableOpacity>
      {initial && onDelete ? <TouchableOpacity style={styles.delLink} onPress={() => Alert.alert('Sil?', 'Bu xərc silinsin?', [{ text: 'İmtina', style: 'cancel' }, { text: 'Sil', style: 'destructive', onPress: () => onDelete(initial.id) }])}><Text style={styles.delLinkText}>Xərci sil</Text></TouchableOpacity> : null}

      <CategoryPickerModal visible={catPicker} state={state} catApi={catApi} onClose={() => setCatPicker(false)} onPick={(c) => { setCat(c); setSub(''); setCatPicker(false); }} />
      {cat ? <SubPickerModal visible={subPicker} state={state} cat={cat} catApi={catApi} onClose={() => setSubPicker(false)} onPick={(s) => { setSub(s); setSubPicker(false); }} /> : null}
      <View style={{ height: 8 }} />
    </ScrollView>
  );
}

// Yalnız kateqoriya seçici (ara + yarat)
function CategoryPickerModal({ visible, state, catApi, onClose, onPick }) {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [nName, setNName] = useState(''); const [nIcon, setNIcon] = useState(EMOJI_SET[0]); const [nColor, setNColor] = useState(COLOR_SET[0]);
  const cats = Object.keys(state.categories || {}).filter((c) => c.toLowerCase().includes(q.toLowerCase()));
  function createCat() { if (!nName.trim()) { Alert.alert('Ad lazımdır'); return; } if (catApi.addCategory(nName, nIcon, nColor)) { const name = nName.trim(); setCreating(false); setNName(''); onPick(name); } else Alert.alert('Bu ad artıq var'); }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.centerBackdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <Pressable style={styles.pickerCard} onPress={stop}>
            <View style={styles.formHead}><Text style={styles.pickerTitle}>Kateqoriya</Text><TouchableOpacity onPress={onClose}><Text style={styles.cancelLink}>Bağla</Text></TouchableOpacity></View>
            {creating ? (
              <View>
                <TextInput style={styles.input2} placeholder="Kateqoriya adı" placeholderTextColor="#94a3b8" value={nName} onChangeText={setNName} autoFocus />
                <Text style={styles.miniLabel}>Emoji</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>{EMOJI_SET.map((e) => <TouchableOpacity key={e} onPress={() => setNIcon(e)} style={[styles.emojiBtn, nIcon === e && { borderColor: '#0EA5E9', backgroundColor: '#eff6ff' }]}><Text style={{ fontSize: 19 }}>{e}</Text></TouchableOpacity>)}</ScrollView>
                <Text style={styles.miniLabel}>Rəng</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>{COLOR_SET.map((c) => <TouchableOpacity key={c} onPress={() => setNColor(c)} style={[styles.colorBtn, { backgroundColor: c }, nColor === c && styles.colorActive]} />)}</ScrollView>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <TouchableOpacity style={[styles.confirmBtn, { flex: 1, backgroundColor: '#e2e8f0', marginTop: 0 }]} onPress={() => setCreating(false)}><Text style={[styles.confirmText, { color: '#334155' }]}>Geri</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.confirmBtn, { flex: 2, marginTop: 0 }]} onPress={createCat}><Text style={styles.confirmText}>Yarat & seç</Text></TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <TextInput style={styles.search} placeholder="🔍 Axtar..." placeholderTextColor="#94a3b8" value={q} onChangeText={setQ} />
                <TouchableOpacity style={styles.createRow} onPress={() => setCreating(true)}><Text style={styles.createRowText}>➕  Yeni kateqoriya yarat</Text></TouchableOpacity>
                <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
                  {cats.map((c) => { const meta = state.categories[c]; return (
                    <TouchableOpacity key={c} style={styles.pickerRow} onPress={() => onPick(c)}>
                      <View style={[styles.catDot, { backgroundColor: meta.color + '22' }]}><Text style={{ fontSize: 15 }}>{meta.icon}</Text></View>
                      <Text style={styles.pickerLabel}>{c}</Text>
                      <Text style={styles.pickerChevron}>{(meta.subs || []).length} alt</Text>
                    </TouchableOpacity>
                  ); })}
                  {cats.length === 0 ? <Text style={styles.emptyMini}>Tapılmadı — yuxarıdan yarat</Text> : null}
                </ScrollView>
              </>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// Alt kateqoriya seçici (Ümumi + var olanlar + yarat)
function SubPickerModal({ visible, state, cat, catApi, onClose, onPick }) {
  const [newSub, setNewSub] = useState('');
  const subs = ((state.categories[cat] || { subs: [] }).subs) || [];
  // əlavə et və BAĞLAMA — yeni alt kateqoriya aşağıdakı siyahıda dərhal görünür
  function createSub() { if (catApi.addSub(cat, newSub)) setNewSub(''); else Alert.alert('Yararsız və ya təkrar alt kateqoriya'); }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.centerBackdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <Pressable style={styles.pickerCard} onPress={stop}>
            <View style={styles.formHead}><Text style={styles.pickerTitle}>Alt kateqoriya</Text><TouchableOpacity onPress={onClose}><Text style={styles.cancelLink}>Bağla</Text></TouchableOpacity></View>
            <View style={styles.addSubRow}>
              <TextInput style={styles.addSubInput} placeholder="Yeni alt kateqoriya yaz..." placeholderTextColor="#94a3b8" value={newSub} onChangeText={setNewSub} onSubmitEditing={createSub} returnKeyType="done" />
              <TouchableOpacity style={styles.addSubBtn} onPress={createSub}><Text style={{ color: '#fff', fontWeight: '800' }}>＋</Text></TouchableOpacity>
            </View>
            <Text style={styles.miniLabel}>{subs.length} alt kateqoriya — birini seç</Text>
            <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
              <TouchableOpacity style={styles.pickerRow} onPress={() => onPick('')}><Text style={[styles.pickerLabel, { color: '#64748b' }]}>Ümumi (Seçilməyib)</Text></TouchableOpacity>
              {subs.map((sName) => <TouchableOpacity key={sName} style={styles.pickerRow} onPress={() => onPick(sName)}><Text style={styles.pickerLabel}>{sName}</Text><Text style={styles.pickerChevron}>seç ›</Text></TouchableOpacity>)}
              {subs.length === 0 ? <Text style={styles.emptyMini}>Hələ alt kateqoriya yoxdur — yuxarıdan yarat</Text> : null}
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function Sheet({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalRoot} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kavWrap}>
          <Pressable style={styles.sheet} onPress={stop}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHead}><Text style={styles.sheetTitle}>{title}</Text><TouchableOpacity onPress={onClose} hitSlop={10}><Text style={styles.sheetClose}>✕</Text></TouchableOpacity></View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
function DateStepper({ date, setDate, maxToday }) {
  const [cal, setCal] = useState(false);
  const canFwd = !maxToday || ymd(date) < todayYmd();
  return (
    <View style={styles.dateRow}>
      <TouchableOpacity style={styles.dateArrow} onPress={() => setDate(addDays(date, -1))}><Text style={styles.dateArrowT}>◀</Text></TouchableOpacity>
      <TouchableOpacity style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }} onPress={() => setCal(true)} activeOpacity={0.7}><Text style={styles.dateVal}>{dateLabel(ymd(date))}  📅</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.dateArrow, !canFwd && { opacity: 0.3 }]} disabled={!canFwd} onPress={() => setDate(addDays(date, 1))}><Text style={styles.dateArrowT}>▶</Text></TouchableOpacity>
      <CalendarModal visible={cal} value={date} maxToday={maxToday} onClose={() => setCal(false)} onPick={(d) => { setDate(d); setCal(false); }} />
    </View>
  );
}
function CalendarModal({ visible, value, maxToday, onClose, onPick }) {
  const [view, setView] = useState(value || new Date());
  useEffect(() => { if (visible) setView(value || new Date()); }, [visible]);
  const y = view.getFullYear(), m = view.getMonth();
  const startWeekday = (new Date(y, m, 1).getDay() + 6) % 7;
  const dim = daysInMonth(y, m);
  const today = todayYmd();
  const selY = value ? ymd(value) : null;
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.centerBackdrop} onPress={onClose}>
        <Pressable style={styles.calCard} onPress={stop}>
          <View style={styles.calHead}>
            <TouchableOpacity style={styles.calNavBtn} onPress={() => setView(new Date(y, m - 1, 1))}><Text style={styles.calNav}>‹</Text></TouchableOpacity>
            <Text style={styles.calTitle}>{MONTHS_AZ[m]} {y}</Text>
            <TouchableOpacity style={styles.calNavBtn} onPress={() => setView(new Date(y, m + 1, 1))}><Text style={styles.calNav}>›</Text></TouchableOpacity>
          </View>
          <View style={styles.calWeek}>{WEEKDAYS_AZ.map((w) => <Text key={w} style={styles.calWeekT}>{w}</Text>)}</View>
          <View style={styles.calGrid}>
            {cells.map((d, i) => {
              if (d === null) return <View key={'e' + i} style={styles.calCell} />;
              const ds = ymd(new Date(y, m, d));
              const isToday = ds === today, isSel = ds === selY, disabled = maxToday && ds > today;
              return (
                <TouchableOpacity key={i} style={styles.calCell} disabled={disabled} onPress={() => onPick(new Date(y, m, d))} activeOpacity={0.7}>
                  <View style={[styles.calDay, isToday && !isSel && styles.calDayToday, isSel && styles.calDaySel]}>
                    <Text style={[styles.calDayT, isSel && { color: '#fff', fontWeight: '800' }, disabled && { color: '#cbd5e1' }]}>{d}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={styles.calTodayBtn} onPress={() => onPick(new Date())}><Text style={styles.calTodayBtnT}>Bu günə qayıt</Text></TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
function Bar({ label, value, max, color, onPress, right }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  const Comp = onPress ? TouchableOpacity : View;
  return (
    <Comp style={{ marginBottom: 10 }} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}><Text style={styles.barLabel}>{label}</Text><Text style={styles.barVal}>{right || azn(value)}</Text></View>
      <View style={styles.barTrack}><View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} /></View>
    </Comp>
  );
}
const CHART_W = Dimensions.get('window').width - 64;
function Donut({ data, size = 150, stroke = 24 }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r; let offset = 0;
  return (
    <Svg width={size} height={size}>
      <G rotation="-90" originX={size / 2} originY={size / 2}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#eef2f7" strokeWidth={stroke} fill="none" />
        {total > 0 ? data.map((d, i) => {
          const dash = (d.value / total) * c;
          const el = <Circle key={i} cx={size / 2} cy={size / 2} r={r} stroke={d.color} strokeWidth={stroke} fill="none" strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset} />;
          offset += dash; return el;
        }) : null}
      </G>
    </Svg>
  );
}
function LineChart({ values, width, height, color }) {
  const n = values.length; if (!n) return <View style={{ height }} />;
  const max = Math.max(1, ...values);
  const stepX = n > 1 ? width / (n - 1) : 0;
  const pts = values.map((v, i) => [n > 1 ? i * stepX : width / 2, height - 4 - (v / max) * (height - 10)]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = n > 1 ? `${line} L ${pts[n - 1][0].toFixed(1)} ${height} L ${pts[0][0].toFixed(1)} ${height} Z` : '';
  return (
    <Svg width={width} height={height}>
      {area ? <Path d={area} fill={color + '22'} /> : null}
      <Path d={line} stroke={color} strokeWidth={2.5} fill="none" />
    </Svg>
  );
}
function WeekdayBars({ data }) {
  const max = Math.max(1, ...data), maxV = Math.max(...data);
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
      {data.map((v, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ width: 16, height: Math.max(3, (v / max) * 64), borderRadius: 4, backgroundColor: v === maxV && v > 0 ? '#f43f5e' : '#0EA5E9' }} />
          <Text style={{ fontSize: 9, color: '#64748b', marginTop: 5 }}>{WEEKDAYS_AZ[i]}</Text>
        </View>
      ))}
    </View>
  );
}

function IncomeSheet({ visible, state, onClose, onAdd, onDelete, onToggle }) {
  const [title, setTitle] = useState(''); const [amount, setAmount] = useState(''); const [date, setDate] = useState(new Date()); const [received, setReceived] = useState(true);
  function add() { const amt = parseAmount(amount); if (!title.trim() || amt <= 0) { Alert.alert('Əskik', 'Başlıq və məbləğ lazımdır.'); return; } onAdd({ id: uid(), title: title.trim(), amount: amt, date: ymd(date), isReceived: received }); setTitle(''); setAmount(''); setDate(new Date()); setReceived(true); }
  return (
    <Sheet visible={visible} onClose={onClose} title="📈 Gəlir">
      <View style={styles.formCard}>
        <TextInput style={styles.input2} placeholder="Başlıq (məs. Maaş)" placeholderTextColor="#94a3b8" value={title} onChangeText={setTitle} />
        <TextInput style={styles.input2} placeholder="Məbləğ" placeholderTextColor="#94a3b8" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <DateStepper date={date} setDate={setDate} />
        <View style={styles.switchRow}><Text style={styles.switchLabel}>{received ? 'Alındı ✅' : 'Gözləyir ⏳'}</Text><Switch value={received} onValueChange={setReceived} trackColor={{ true: '#16a34a' }} /></View>
        <TouchableOpacity style={styles.confirmBtn} onPress={add}><Text style={styles.confirmText}>Əlavə et</Text></TouchableOpacity>
      </View>
      {(state.incomes || []).map((i) => (
        <View key={i.id} style={styles.li}><View style={{ flex: 1 }}><Text style={styles.liTitle}>{i.title}</Text><Text style={styles.liSub}>{shortDate(i.date)} · {i.isReceived ? 'Alındı' : 'Gözləyir'}</Text></View><TouchableOpacity onPress={() => onToggle(i.id)} style={[styles.miniBtn, { backgroundColor: i.isReceived ? '#ecfdf5' : '#fefce8' }]}><Text style={{ color: i.isReceived ? '#16a34a' : '#ca8a04', fontWeight: '700' }}>{i.isReceived ? '✓' : '⏳'}</Text></TouchableOpacity><Text style={[styles.liAmount, { color: '#16a34a' }]}>+{azn(i.amount)}</Text><TouchableOpacity onPress={() => onDelete(i.id)} hitSlop={8}><Text>🗑️</Text></TouchableOpacity></View>
      ))}
      {(!state.incomes || !state.incomes.length) ? <Text style={styles.emptyMini}>Hələ gəlir yoxdur</Text> : null}
    </Sheet>
  );
}
function DebtSheet({ visible, state, onClose, onAdd, onDelete, onPay }) {
  const [title, setTitle] = useState(''); const [amount, setAmount] = useState(''); const [type, setType] = useState('AcilDegil'); const [due, setDue] = useState(new Date());
  function add() { const amt = parseAmount(amount); if (!title.trim() || amt <= 0) { Alert.alert('Əskik', 'Başlıq və məbləğ lazımdır.'); return; } onAdd({ id: uid(), title: title.trim(), amount: amt, type, paid: 0, dueDate: ymd(due) }); setTitle(''); setAmount(''); setType('AcilDegil'); setDue(new Date()); }
  return (
    <Sheet visible={visible} onClose={onClose} title="💳 Borclar">
      <View style={styles.formCard}>
        <TextInput style={styles.input2} placeholder="Başlıq (məs. Banka kredit)" placeholderTextColor="#94a3b8" value={title} onChangeText={setTitle} />
        <TextInput style={styles.input2} placeholder="Məbləğ" placeholderTextColor="#94a3b8" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <View style={styles.kindRow}>
          <TouchableOpacity onPress={() => setType('Acil')} style={[styles.kindBtn, type === 'Acil' && { borderColor: '#dc2626', backgroundColor: '#fef2f2' }]}><Text style={[styles.kindMain, type === 'Acil' && { color: '#dc2626' }]}>🔴 Acil</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setType('AcilDegil')} style={[styles.kindBtn, type === 'AcilDegil' && { borderColor: '#2563eb', backgroundColor: '#eff6ff' }]}><Text style={[styles.kindMain, type === 'AcilDegil' && { color: '#2563eb' }]}>🔵 Acil deyil</Text></TouchableOpacity>
        </View>
        <Text style={styles.fLabel}>SON TARİX</Text>
        <DateStepper date={due} setDate={setDue} />
        <TouchableOpacity style={styles.confirmBtn} onPress={add}><Text style={styles.confirmText}>Əlavə et</Text></TouchableOpacity>
      </View>
      {(state.debts || []).map((d) => { const rem = d.amount - (d.paid || 0); const paid = rem <= 0; return (
        <View key={d.id} style={styles.li}><View style={{ flex: 1 }}><Text style={styles.liTitle}>{d.type === 'Acil' ? '🔴 ' : ''}{d.title}</Text><Text style={styles.liSub}>{paid ? 'Ödənildi ✅' : `Qalıq ${azn(rem)}`}{d.dueDate ? ` · ${shortDate(d.dueDate)}` : ''}</Text></View>{!paid ? <TouchableOpacity onPress={() => onPay(d)} style={[styles.miniBtn, { backgroundColor: '#0EA5E9' }]}><Text style={{ color: '#fff', fontWeight: '700' }}>Ödə</Text></TouchableOpacity> : null}<Text style={styles.liAmount}>{azn(d.amount)}</Text><TouchableOpacity onPress={() => onDelete(d.id)} hitSlop={8}><Text>🗑️</Text></TouchableOpacity></View>
      ); })}
      {(!state.debts || !state.debts.length) ? <Text style={styles.emptyMini}>Hələ borc yoxdur</Text> : null}
    </Sheet>
  );
}
function FutureSheet({ visible, state, onClose, onAdd, onDelete }) {
  const [title, setTitle] = useState(''); const [amount, setAmount] = useState(''); const [date, setDate] = useState(new Date()); const [ess, setEss] = useState(false);
  function add() { const amt = parseAmount(amount); if (!title.trim() || amt <= 0) { Alert.alert('Əskik', 'Başlıq və məbləğ lazımdır.'); return; } onAdd({ id: uid(), title: title.trim(), amount: amt, date: ymd(date), isEssential: ess }); setTitle(''); setAmount(''); setDate(new Date()); setEss(false); }
  return (
    <Sheet visible={visible} onClose={onClose} title="📅 Gələcək Xərclər">
      <View style={styles.formCard}>
        <TextInput style={styles.input2} placeholder="Başlıq (məs. İcarə)" placeholderTextColor="#94a3b8" value={title} onChangeText={setTitle} />
        <TextInput style={styles.input2} placeholder="Məbləğ" placeholderTextColor="#94a3b8" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <Text style={styles.fLabel}>TARİX</Text>
        <DateStepper date={date} setDate={setDate} />
        <View style={styles.switchRow}><Text style={styles.switchLabel}>{ess ? '🛡️ Vacib' : 'Adi'}</Text><Switch value={ess} onValueChange={setEss} trackColor={{ true: '#16a34a' }} /></View>
        <TouchableOpacity style={styles.confirmBtn} onPress={add}><Text style={styles.confirmText}>Əlavə et</Text></TouchableOpacity>
      </View>
      {(state.futureExpenses || []).map((f) => <View key={f.id} style={styles.li}><View style={{ flex: 1 }}><Text style={styles.liTitle}>{f.isEssential ? '🛡️ ' : ''}{f.title}</Text><Text style={styles.liSub}>{shortDate(f.date)}</Text></View><Text style={styles.liAmount}>{azn(f.amount)}</Text><TouchableOpacity onPress={() => onDelete(f.id)} hitSlop={8}><Text>🗑️</Text></TouchableOpacity></View>)}
      {(!state.futureExpenses || !state.futureExpenses.length) ? <Text style={styles.emptyMini}>Hələ planlı xərc yoxdur</Text> : null}
    </Sheet>
  );
}

function StatsSheet({ visible, state, onClose }) {
  const [period, setPeriod] = useState('month');
  const [drillCat, setDrillCat] = useState(null);
  const [drillSub, setDrillSub] = useState(null);
  const ps = useMemo(() => statsFor(state, period), [state, period]);
  const pc = (v) => ps.total ? Math.round((v / ps.total) * 100) : 0;
  const catE = Object.entries(ps.categoryBreakdown).sort((a, b) => b[1] - a[1]);
  const maxC = Math.max(1, ...catE.map((e) => e[1]));
  const donutData = catE.map(([n, v]) => ({ value: v, color: catMeta(state, n).color }));
  const lineVals = useMemo(() => {
    const realEnd = period === 'all' ? todayYmd() : ps.end;
    const cap = ymd(addDays(parseYmd(realEnd), -30));
    const from = (ps.start < cap) ? cap : ps.start;
    const arr = []; let cur = parseYmd(from); let guard = 0;
    while (ymd(cur) <= realEnd && guard < 95) { arr.push(ps.dailyMap[ymd(cur)] || 0); cur = addDays(cur, 1); guard++; }
    return arr;
  }, [ps, period]);
  const kinds = [{ l: '🛡️ Vacib', v: ps.essential, c: '#16a34a' }, { l: '🛒 Standart', v: ps.standard, c: '#ca8a04' }, { l: '🔥 İsraf', v: ps.wasteful, c: '#ea580c' }];
  const maxK = Math.max(1, ...kinds.map((k) => k.v));
  function reset() { setDrillCat(null); setDrillSub(null); }
  return (
    <Sheet visible={visible} onClose={() => { reset(); onClose(); }} title="📊 Statistika">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>{RANGES.map((p) => <TouchableOpacity key={p.k} onPress={() => { setPeriod(p.k); reset(); }} style={[styles.rangeChip, period === p.k && styles.rangeChipA]}><Text style={[styles.rangeChipT, period === p.k && styles.rangeChipTA]}>{p.l}</Text></TouchableOpacity>)}</ScrollView>
      <View style={styles.sumRow}>
        <View style={styles.sumCard}><Text style={styles.sumLabel}>Xərc</Text><Text style={[styles.sumVal, { color: '#dc2626' }]}>{azn(ps.total)}</Text></View>
        <View style={styles.sumCard}><Text style={styles.sumLabel}>Gəlir</Text><Text style={[styles.sumVal, { color: '#16a34a' }]}>{azn(ps.incomeTotal)}</Text></View>
        <View style={styles.sumCard}><Text style={styles.sumLabel}>Net</Text><Text style={[styles.sumVal, { color: ps.incomeTotal - ps.total >= 0 ? '#16a34a' : '#dc2626' }]}>{azn(ps.incomeTotal - ps.total)}</Text></View>
      </View>
      <Text style={styles.miniNote}>{ps.count} əməliyyat · orta {azn(ps.avg)}</Text>

      {!drillCat ? (
        <>
          {ps.total > 0 ? (
            <>
              <Text style={styles.statH}>Kateqoriya payları</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 4 }}>
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <Donut data={donutData} />
                  <View style={{ position: 'absolute', alignItems: 'center' }}><Text style={{ fontSize: 10, color: '#94a3b8' }}>Cəmi</Text><Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a' }}>{azn(ps.total)}</Text></View>
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  {catE.slice(0, 6).map(([n, v]) => (
                    <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: catMeta(state, n).color }} />
                      <Text style={{ flex: 1, color: '#334155', fontSize: 12 }} numberOfLines={1}>{n}</Text>
                      <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '700' }}>{pc(v)}%</Text>
                    </View>
                  ))}
                  {catE.length > 6 ? <Text style={{ color: '#94a3b8', fontSize: 11 }}>+{catE.length - 6} daha…</Text> : null}
                </View>
              </View>

              <Text style={styles.statH}>Günlük trend</Text>
              <View style={styles.chartCard}><LineChart values={lineVals} width={CHART_W} height={70} color="#0EA5E9" /></View>

              <Text style={styles.statH}>Həftə günü üzrə  <Text style={styles.tapHint}>(ən çox xərc qırmızı)</Text></Text>
              <View style={styles.chartCard}><WeekdayBars data={ps.weekday} /></View>
            </>
          ) : null}

          <Text style={styles.statH}>Növə görə</Text>
          {kinds.map((k) => <Bar key={k.l} label={k.l} value={k.v} max={maxK} color={k.c} right={`${pc(k.v)}%  ·  ${azn(k.v)}`} />)}
          <Text style={styles.statH}>Kateqoriya üzrə  <Text style={styles.tapHint}>(detay üçün toxun)</Text></Text>
          {catE.length === 0 ? <Text style={styles.emptyMini}>Bu dövrdə xərc yoxdur</Text> : catE.map(([n, v]) => <Bar key={n} label={`${catMeta(state, n).icon} ${n}`} value={v} max={maxC} color={catMeta(state, n).color} right={`${pc(v)}%  ·  ${azn(v)}`} onPress={() => { animate(); setDrillCat(n); }} />)}
        </>
      ) : !drillSub ? (
        <>
          <TouchableOpacity style={styles.crumb} onPress={() => { animate(); setDrillCat(null); }}><Text style={styles.crumbText}>‹ Geri · {catMeta(state, drillCat).icon} {drillCat}</Text></TouchableOpacity>
          <Text style={styles.statH}>Alt kateqoriyalar</Text>
          {(() => { const subs = Object.entries(ps.subBreakdown[drillCat] || {}).sort((a, b) => b[1] - a[1]); const maxS = Math.max(1, ...subs.map((e) => e[1])); return subs.map(([sn, sv]) => <Bar key={sn} label={sn} value={sv} max={maxS} color={catMeta(state, drillCat).color} right={`${pc(sv)}%  ·  ${azn(sv)}`} onPress={() => { animate(); setDrillSub(sn); }} />); })()}
        </>
      ) : (
        <>
          <TouchableOpacity style={styles.crumb} onPress={() => { animate(); setDrillSub(null); }}><Text style={styles.crumbText}>‹ Geri · {drillCat} · {drillSub}</Text></TouchableOpacity>
          <Text style={styles.statH}>Əməliyyatlar</Text>
          {ps.txs.filter((t) => t.category === drillCat && (t.subCategory || '(altsız)') === drillSub).sort((a, b) => b.amount - a.amount).map((t) => (
            <View key={t.id} style={styles.topRow}><Text style={{ flex: 1, color: '#0f172a' }} numberOfLines={1}>{shortDate(t.date)} {t.note ? '· ' + t.note : ''}</Text><Text style={{ color: '#0f172a', fontWeight: '700' }}>{azn(t.amount)}</Text></View>
          ))}
        </>
      )}
      <View style={{ height: 16 }} />
    </Sheet>
  );
}

function CategorySheet({ visible, state, onClose, catApi, onDelCat, onDelSub, onClearAll }) {
  const [q, setQ] = useState(''); const [open, setOpen] = useState(null); const [newSub, setNewSub] = useState('');
  const [creating, setCreating] = useState(false); const [editingName, setEditingName] = useState(null);
  const [nName, setNName] = useState(''); const [nIcon, setNIcon] = useState(EMOJI_SET[0]); const [nColor, setNColor] = useState(COLOR_SET[0]);
  const cats = Object.keys(state.categories).filter((c) => c.toLowerCase().includes(q.toLowerCase()));
  function startCreate() { setEditingName(null); setNName(''); setNIcon(EMOJI_SET[0]); setNColor(COLOR_SET[0]); setCreating(true); }
  function startEdit(c) { const m = state.categories[c]; setEditingName(c); setNName(c); setNIcon(m.icon); setNColor(m.color); setCreating(true); }
  function cancelForm() { setCreating(false); setEditingName(null); setNName(''); }
  function saveCat() {
    if (!nName.trim()) { Alert.alert('Ad lazımdır'); return; }
    const ok = editingName ? catApi.editCategory(editingName, nName, nIcon, nColor) : catApi.addCategory(nName, nIcon, nColor);
    if (ok) cancelForm(); else Alert.alert('Bu ad artıq var');
  }
  function tryDelCat(c) { const u = catUsage(state, c); Alert.alert('Kateqoriyanı sil?', u > 0 ? `${c} — ${u} əməliyyatda var. Silinsin? (əməliyyatlar qalacaq)` : `${c} silinsin?`, [{ text: 'İmtina', style: 'cancel' }, { text: 'Sil', style: 'destructive', onPress: () => { animate(); onDelCat(c); } }]); }
  return (
    <Sheet visible={visible} onClose={onClose} title="🗂️ Kateqoriyalar">
      {creating ? (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{editingName ? 'Kateqoriyanı düzəlt' : 'Yeni kateqoriya'}</Text>
          <TextInput style={[styles.input2, { marginTop: 10 }]} placeholder="Kateqoriya adı" placeholderTextColor="#94a3b8" value={nName} onChangeText={setNName} autoFocus />
          <Text style={styles.miniLabel}>Emoji (şəkil)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>{EMOJI_SET.map((e) => <TouchableOpacity key={e} onPress={() => setNIcon(e)} style={[styles.emojiBtn, nIcon === e && { borderColor: '#0EA5E9', backgroundColor: '#eff6ff' }]}><Text style={{ fontSize: 19 }}>{e}</Text></TouchableOpacity>)}</ScrollView>
          <Text style={styles.miniLabel}>Rəng</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>{COLOR_SET.map((c) => <TouchableOpacity key={c} onPress={() => setNColor(c)} style={[styles.colorBtn, { backgroundColor: c }, nColor === c && styles.colorActive]} />)}</ScrollView>
          {editingName ? <Text style={styles.hintTxt}>Adı dəyişsən, bu kateqoriyadakı bütün xərclər avtomatik yenilənir.</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity style={[styles.confirmBtn, { flex: 1, backgroundColor: '#e2e8f0', marginTop: 0 }]} onPress={cancelForm}><Text style={[styles.confirmText, { color: '#334155' }]}>Geri</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.confirmBtn, { flex: 2, marginTop: 0 }]} onPress={saveCat}><Text style={styles.confirmText}>{editingName ? 'Yadda saxla' : 'Yarat'}</Text></TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <TextInput style={styles.search} placeholder="🔍 Axtar..." placeholderTextColor="#94a3b8" value={q} onChangeText={setQ} />
          <TouchableOpacity style={styles.createRow} onPress={startCreate}><Text style={styles.createRowText}>➕  Yeni kateqoriya yarat</Text></TouchableOpacity>
          {Object.keys(state.categories).length > 0 ? <TouchableOpacity style={styles.clearAllRow} onPress={() => Alert.alert('Bütün kateqoriyaları sil?', 'Hamısı silinəcək (əməliyyatlar qalacaq).', [{ text: 'İmtina', style: 'cancel' }, { text: 'Hamısını sil', style: 'destructive', onPress: onClearAll }])}><Text style={styles.clearAllText}>🗑️  Bütün kateqoriyaları sil</Text></TouchableOpacity> : null}
          {cats.length === 0 ? <Text style={styles.emptyMini}>Kateqoriya yoxdur — yuxarıdan yarat</Text> : null}
          {cats.map((c) => { const meta = state.categories[c]; const isOpen = open === c; const subs = meta.subs || []; return (
            <View key={c} style={styles.catCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => { animate(); setOpen(isOpen ? null : c); }}>
                  <View style={[styles.catDot, { backgroundColor: meta.color + '22' }]}><Text style={{ fontSize: 15 }}>{meta.icon}</Text></View>
                  <View style={{ flex: 1 }}><Text style={styles.liTitle}>{c}</Text><Text style={styles.liSub}>{subs.length} alt · {catUsage(state, c)} əməliyyat</Text></View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => startEdit(c)} hitSlop={8}><Text style={{ fontSize: 16 }}>✏️</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => tryDelCat(c)} hitSlop={8}><Text style={{ fontSize: 16 }}>🗑️</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => { animate(); setOpen(isOpen ? null : c); }} hitSlop={6}><Text style={styles.pickerChevron}>{isOpen ? '▾' : '▸'}</Text></TouchableOpacity>
              </View>
              {isOpen && (
                <View style={{ marginTop: 8 }}>
                  {subs.map((sc) => <View key={sc} style={styles.subManageRow}><Text style={styles.subRowText}>{sc}</Text><TouchableOpacity onPress={() => { animate(); onDelSub(c, sc); }} hitSlop={8}><Text style={{ fontSize: 13 }}>✕</Text></TouchableOpacity></View>)}
                  <View style={styles.addSubRow}><TextInput style={styles.addSubInput} placeholder="Yeni alt..." placeholderTextColor="#94a3b8" value={open === c ? newSub : ''} onChangeText={setNewSub} /><TouchableOpacity style={styles.addSubBtn} onPress={() => { if (catApi.addSub(c, newSub)) setNewSub(''); }}><Text style={{ color: '#fff', fontWeight: '800' }}>＋</Text></TouchableOpacity></View>
                </View>
              )}
            </View>
          ); })}
        </>
      )}
      <View style={{ height: 12 }} />
    </Sheet>
  );
}

function SettingsSheet({ visible, state, range, onSetRange, onClose, onSetCash, onReset, onOpenCats, onRestore, onLogout }) {
  const [cash, setCash] = useState('');
  function apply() { const amt = parseAmount(cash); onSetCash(amt); setCash(''); Alert.alert('Tamam', `İndiki pul ${azn(amt)} olaraq təyin edildi.`); }
  return (
    <Sheet visible={visible} onClose={onClose} title="⚙️ Tənzimləmələr">
      <View style={styles.formCard}>
        <Text style={styles.fLabel}>ƏSAS EKRAN DÖVRÜ</Text>
        <Text style={styles.hintTxt}>Ana ekran seçilmiş dövrə görə göstərilir (yadda saxlanılır).</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {RANGES.map((r) => <TouchableOpacity key={r.k} onPress={() => onSetRange(r.k)} style={[styles.rangeChip, range === r.k && styles.rangeChipA]}><Text style={[styles.rangeChipT, range === r.k && styles.rangeChipTA]}>{r.l}</Text></TouchableOpacity>)}
        </View>
      </View>
      <TouchableOpacity style={styles.navRow} onPress={onOpenCats}><Text style={styles.navIcon}>🗂️</Text><Text style={styles.navText}>Kateqoriyaları idarə et</Text><Text style={styles.pickerChevron}>›</Text></TouchableOpacity>
      <View style={styles.formCard}>
        <Text style={styles.fLabel}>YEDƏK (BACKUP)</Text>
        <Text style={styles.hintTxt}>Bütün məlumatları .json fayl kimi saxla və ya geri yüklə.</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity style={[styles.confirmBtn, { flex: 1, marginTop: 0, backgroundColor: '#16a34a' }]} onPress={() => doExport(state)}><Text style={styles.confirmText}>⬆️ Export</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.confirmBtn, { flex: 1, marginTop: 0, backgroundColor: '#2563eb' }]} onPress={() => doImport(onRestore)}><Text style={styles.confirmText}>⬇️ Import</Text></TouchableOpacity>
        </View>
      </View>
      <View style={styles.formCard}>
        <Text style={styles.fLabel}>İNDİKİ PUL (düzəliş)</Text>
        <Text style={styles.hintTxt}>Hazırkı: {azn(currentCash(state))}. Real nağdını yaz, sistem başlanğıcı buna uyğunlaşdıracaq.</Text>
        <TextInput style={styles.input2} placeholder="məs. 500" placeholderTextColor="#94a3b8" keyboardType="decimal-pad" value={cash} onChangeText={setCash} />
        <TouchableOpacity style={styles.confirmBtn} onPress={apply}><Text style={styles.confirmText}>Təyin et</Text></TouchableOpacity>
      </View>
      <View style={styles.formCard}>
        <Text style={styles.fLabel}>HESAB</Text>
        <Text style={styles.hintTxt}>Məlumatların online serverdə saxlanılır. Çıxış etsən başqa hesabla daxil ola bilərsən (məlumatlar serverdə qalır).</Text>
        <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: '#475569' }]} onPress={() => Alert.alert('Çıxış?', 'Hesabdan çıxmaq istəyirsən?', [{ text: 'İmtina', style: 'cancel' }, { text: 'Çıxış', style: 'destructive', onPress: onLogout }])}><Text style={styles.confirmText}>🚪 Çıxış</Text></TouchableOpacity>
      </View>
      <View style={[styles.formCard, { borderColor: '#fecaca' }]}>
        <Text style={styles.fLabel}>TƏHLÜKƏLİ</Text>
        <Text style={styles.hintTxt}>Bütün xərc, gəlir, borc və planları silər.</Text>
        <TouchableOpacity style={styles.dangerBtn} onPress={() => Alert.alert('Hər şeyi sıfırla?', 'Geri alına bilməz.', [{ text: 'İmtina', style: 'cancel' }, { text: 'Sıfırla', style: 'destructive', onPress: onReset }])}><Text style={styles.dangerText}>Hər şeyi sıfırla</Text></TouchableOpacity>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 58, paddingHorizontal: 18, paddingBottom: 4 },
  appTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  appSub: { color: '#94a3b8', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  iconRow: { flexDirection: 'row', gap: 6 },
  filterBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  filterLabel: { color: '#0f172a', fontSize: 13, fontWeight: '800' },
  hIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sysMsg: { flexDirection: 'row', alignItems: 'center', gap: 11, margin: 16, marginBottom: 8, backgroundColor: '#fff', borderRadius: 16, padding: 13, borderWidth: 1, borderColor: '#e2e8f0' },
  sysIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center' },
  sysLabel: { color: '#7c3aed', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  sysText: { color: '#334155', fontSize: 13, marginTop: 2 },
  sectionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 6 },
  sectionTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  sectionSub: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ecfdf5', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5 },
  liveDot: { color: '#16a34a', fontSize: 8 },
  liveText: { color: '#16a34a', fontSize: 11, fontWeight: '700' },
  hero: { margin: 16, marginBottom: 12, borderRadius: 22, padding: 20 },
  heroTop: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  heroAmount: { color: '#fff', fontSize: 34, fontWeight: '900', marginTop: 6 },
  heroBottom: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '600', marginTop: 8 },
  heroRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  heroChip: { flex: 1, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 13, padding: 11 },
  heroChipL: { color: 'rgba(255,255,255,0.85)', fontSize: 11 },
  heroChipV: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 2 },
  listHeading: { color: '#0f172a', fontSize: 14, fontWeight: '800', marginHorizontal: 20, marginTop: 18, marginBottom: 2 },
  gridPad: { paddingHorizontal: 14, gap: 10 },
  row2: { flexDirection: 'row', gap: 10 },
  row3: { flexDirection: 'row', gap: 10 },
  statCard: { backgroundColor: '#fff', borderRadius: 16, padding: 13, borderWidth: 1 },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  statValue: { color: '#0f172a', fontSize: 18, fontWeight: '800', marginTop: 5 },
  statSub: { color: '#94a3b8', fontSize: 10, marginTop: 3 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
  alertText: { color: '#334155', fontSize: 13, flex: 1 },
  addBtn: { backgroundColor: '#0f172a', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 6 },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  emptyText: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 18, paddingHorizontal: 30 },
  secHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 },
  secDate: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  secTotal: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginVertical: 4, padding: 11, borderRadius: 15, borderWidth: 1, borderColor: '#e2e8f0' },
  rowIcon: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  rowTitle: { color: '#0f172a', fontSize: 14, fontWeight: '600' },
  kindBadge: { fontSize: 11, fontWeight: '700' },
  rowNote: { color: '#94a3b8', fontSize: 12, flex: 1 },
  rowAmount: { color: '#0f172a', fontSize: 15, fontWeight: '700' },

  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  kavWrap: { width: '100%' },
  sheet: { backgroundColor: '#f1f5f9', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 24, maxHeight: '92%' },
  sheetHandle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#cbd5e1', marginBottom: 12 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  sheetClose: { color: '#64748b', fontSize: 19, fontWeight: '700' },

  formHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  formTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800' },
  cancelLink: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  amountBox: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: '#0EA5E9', paddingBottom: 8 },
  amountCur: { color: '#64748b', fontSize: 24, fontWeight: '700', marginRight: 8 },
  amountInput: { flex: 1, color: '#0f172a', fontSize: 30, fontWeight: '800', padding: 0 },
  stepper: { width: 28, height: 20, alignItems: 'center', justifyContent: 'center' },
  stepperT: { color: '#94a3b8', fontSize: 11 },
  fLabel: { color: '#64748b', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  dropdown: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 13, paddingVertical: 13, paddingHorizontal: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  ddIcon: { fontSize: 15 },
  ddText: { flex: 1, color: '#0f172a', fontSize: 14, fontWeight: '600' },
  ddChevron: { color: '#94a3b8', fontSize: 13 },
  kindRow: { flexDirection: 'row', gap: 8 },
  kindBtn: { flex: 1, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 13, paddingVertical: 11 },
  kindMain: { color: '#334155', fontSize: 13, fontWeight: '700' },
  kindSub: { color: '#94a3b8', fontSize: 9, marginTop: 2 },
  noteInput: { backgroundColor: '#fff', color: '#0f172a', borderRadius: 13, paddingVertical: 13, paddingHorizontal: 14, fontSize: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  confirmBtn: { backgroundColor: '#0EA5E9', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  delLink: { alignItems: 'center', paddingVertical: 13 },
  delLinkText: { color: '#dc2626', fontSize: 14, fontWeight: '700' },

  centerBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 22 },
  pickerCard: { backgroundColor: '#fff', borderRadius: 20, padding: 15, maxHeight: '80%' },
  pickerTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800' },
  search: { backgroundColor: '#f1f5f9', borderRadius: 11, paddingVertical: 10, paddingHorizontal: 13, fontSize: 14, color: '#0f172a', marginBottom: 10 },
  createRow: { backgroundColor: '#eff6ff', borderRadius: 11, paddingVertical: 12, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#bfdbfe' },
  createRowText: { color: '#2563eb', fontSize: 13, fontWeight: '800' },
  clearAllRow: { backgroundColor: '#fef2f2', borderRadius: 11, paddingVertical: 11, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#fecaca' },
  clearAllText: { color: '#dc2626', fontSize: 12, fontWeight: '800' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  catDot: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  pickerLabel: { flex: 1, color: '#0f172a', fontSize: 15, fontWeight: '600' },
  pickerChevron: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  subRowText: { color: '#475569', fontSize: 14 },
  addSubRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  addSubInput: { flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, fontSize: 14, borderWidth: 1, borderColor: '#e2e8f0', color: '#0f172a' },
  addSubBtn: { width: 40, height: 38, borderRadius: 10, backgroundColor: '#0EA5E9', alignItems: 'center', justifyContent: 'center' },
  miniLabel: { color: '#64748b', fontSize: 11, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  emojiBtn: { width: 42, height: 42, borderRadius: 11, borderWidth: 1.5, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  colorBtn: { width: 32, height: 32, borderRadius: 16 },
  colorActive: { borderWidth: 3, borderColor: '#0f172a' },

  input2: { backgroundColor: '#fff', color: '#0f172a', borderRadius: 11, paddingVertical: 12, paddingHorizontal: 13, fontSize: 15, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 10 },
  formCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, marginBottom: 6 },
  switchLabel: { color: '#334155', fontSize: 14, fontWeight: '600' },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 13, padding: 7, borderWidth: 1, borderColor: '#e2e8f0' },
  dateArrow: { width: 44, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' },
  dateArrowT: { color: '#334155', fontSize: 14 },
  dateVal: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  rangeWrap: { marginTop: 14 },
  rangeChip: { backgroundColor: '#fff', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 15, borderWidth: 1, borderColor: '#e2e8f0' },
  rangeChipA: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  rangeChipT: { color: '#64748b', fontSize: 13, fontWeight: '700' },
  rangeChipTA: { color: '#fff' },
  rangeSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 12, marginBottom: 2 },
  rangeSumLabel: { color: '#0f172a', fontSize: 15, fontWeight: '800' },
  rangeSumVal: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  calCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16 },
  calHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  calNavBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  calNav: { color: '#0f172a', fontSize: 20, fontWeight: '800' },
  calTitle: { color: '#0f172a', fontSize: 16, fontWeight: '800' },
  calWeek: { flexDirection: 'row' },
  calWeekT: { width: '14.2857%', textAlign: 'center', color: '#94a3b8', fontSize: 11, fontWeight: '700', paddingBottom: 6 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: '14.2857%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  calDay: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  calDayToday: { borderWidth: 1.5, borderColor: '#0EA5E9' },
  calDaySel: { backgroundColor: '#0EA5E9' },
  calDayT: { color: '#0f172a', fontSize: 14, fontWeight: '600' },
  calTodayBtn: { marginTop: 10, backgroundColor: '#f1f5f9', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  calTodayBtnT: { color: '#0EA5E9', fontSize: 14, fontWeight: '800' },
  li: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 13, padding: 11, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  liTitle: { color: '#0f172a', fontSize: 14, fontWeight: '600' },
  liSub: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  liAmount: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  miniBtn: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9 },
  emptyMini: { color: '#94a3b8', fontSize: 13, textAlign: 'center', paddingVertical: 16 },

  segment: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 11, padding: 4, marginBottom: 12 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segActive: { backgroundColor: '#fff' },
  segText: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  segTextA: { color: '#0f172a' },
  sumRow: { flexDirection: 'row', gap: 10 },
  sumCard: { flex: 1, backgroundColor: '#fff', borderRadius: 13, padding: 11, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  sumLabel: { color: '#94a3b8', fontSize: 11 },
  sumVal: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  miniNote: { color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 8 },
  statH: { color: '#0EA5E9', fontSize: 13, fontWeight: '800', marginTop: 16, marginBottom: 12 },
  tapHint: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  crumb: { paddingVertical: 8 },
  crumbText: { color: '#2563eb', fontSize: 13, fontWeight: '700' },
  barLabel: { color: '#334155', fontSize: 13, fontWeight: '600' },
  barVal: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  barTrack: { height: 9, borderRadius: 5, backgroundColor: '#e2e8f0', overflow: 'hidden' },
  barFill: { height: 9, borderRadius: 5 },
  chartCard: { backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  catCard: { backgroundColor: '#fff', borderRadius: 13, padding: 11, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  subManageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, paddingLeft: 42, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 13, padding: 15, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  navIcon: { fontSize: 19 },
  navText: { flex: 1, color: '#0f172a', fontSize: 14, fontWeight: '600' },
  hintTxt: { color: '#94a3b8', fontSize: 12, marginBottom: 10, lineHeight: 17 },
  dangerBtn: { backgroundColor: '#fef2f2', borderRadius: 13, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#fecaca' },
  dangerText: { color: '#dc2626', fontSize: 14, fontWeight: '800' },
});
