import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, LayoutAnimation, Modal, Platform,
  ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, UIManager, View,
} from 'react-native';
import {
  DEFAULT_CATEGORIES, DEBT_PAYMENT_CAT, KINDS, EMOJI_SET, COLOR_SET,
  emptyState, loadState, saveState, uid, ymd, todayYmd, parseYmd, addDays,
  dateLabel, shortDate, fmt, azn, parseAmount, catMeta, kindOf, catUsage, subUsage,
  currentCash, calculateStats, overview, buildAlerts, systemMessage, periodStats,
} from './src/finance';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);
const animate = () => { try { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); } catch (e) {} };

// ---- Yedək: export (.json fayl) / import (bərpa) ----
async function doExport(state) {
  try {
    const json = JSON.stringify(state, null, 2);
    const name = `xerclem-yedek-${todayYmd()}.json`;
    if (Platform.OS === 'web') {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const uri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + name;
    await FileSystem.writeAsStringAsync(uri, json);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'XƏRCLƏM yedəyi' });
    else Alert.alert('Paylaşım yoxdur', `Fayl saxlanıldı:\n${uri}`);
  } catch (e) { Alert.alert('Xəta', 'Yedək alınmadı: ' + (e && e.message)); }
}
async function doImport(onRestore) {
  try {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (res.canceled || !res.assets || !res.assets[0]) return;
    let json;
    if (Platform.OS === 'web') { const r = await fetch(res.assets[0].uri); json = await r.text(); }
    else json = await FileSystem.readAsStringAsync(res.assets[0].uri);
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object' || !Array.isArray(data.transactions)) { Alert.alert('Yararsız fayl', 'Bu XƏRCLƏM yedəyi deyil.'); return; }
    onRestore(data);
    Alert.alert('Bərpa olundu ✅', 'Məlumatlar geri yükləndi.');
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

export default function App() {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState(emptyState());
  useEffect(() => { (async () => { setState(await loadState()); setLoading(false); })(); }, []);
  function commit(next) { setState(next); saveState(next); }
  const update = (patch) => commit({ ...state, ...patch });
  if (loading) return <View style={[styles.root, styles.center]}><StatusBar style="dark" /><ActivityIndicator color="#0EA5E9" size="large" /></View>;
  return <Dashboard state={state} commit={commit} update={update} />;
}

function Dashboard({ state, commit, update }) {
  const [sheet, setSheet] = useState(null);
  const [formTx, setFormTx] = useState(null); // null | {} (yeni) | tx (düzəliş)

  const ov = useMemo(() => overview(state), [state]);
  const stats = useMemo(() => calculateStats(state), [state]);
  const alerts = useMemo(() => buildAlerts(state), [state]);
  const sysMsg = useMemo(() => systemMessage(ov, stats), [ov, stats]);

  const saveTx = (t) => {
    animate();
    const exists = state.transactions.some((x) => x.id === t.id);
    update({ transactions: exists ? state.transactions.map((x) => x.id === t.id ? t : x) : [t, ...state.transactions] });
    setFormTx(null);
  };
  const delTx = (id) => { animate(); update({ transactions: state.transactions.filter((x) => x.id !== id) }); setFormTx(null); };
  const addIncome = (i) => update({ incomes: [i, ...state.incomes] });
  const delIncome = (id) => update({ incomes: state.incomes.filter((x) => x.id !== id) });
  const toggleIncome = (id) => update({ incomes: state.incomes.map((x) => x.id === id ? { ...x, isReceived: !x.isReceived } : x) });
  const addDebt = (d) => update({ debts: [d, ...state.debts] });
  const delDebt = (id) => update({ debts: state.debts.filter((x) => x.id !== id) });
  const payDebt = (d) => {
    const amt = d.amount - (d.paid || 0); if (amt <= 0) return;
    if (currentCash(state) < amt) { Alert.alert('Nağd çatmır', 'Bu borcu ödəmək üçün nağdın yetərli deyil.'); return; }
    const tx = { id: uid(), amount: amt, category: DEBT_PAYMENT_CAT, subCategory: '', note: `Borc ödənildi: ${d.title}`, isEssential: true, relatedDebtId: d.id, date: todayYmd(), createdAt: Date.now() };
    commit({ ...state, transactions: [tx, ...state.transactions], debts: state.debts.map((x) => x.id === d.id ? { ...x, paid: x.amount } : x) });
  };
  const addFuture = (f) => update({ futureExpenses: [f, ...state.futureExpenses] });
  const delFuture = (id) => update({ futureExpenses: state.futureExpenses.filter((x) => x.id !== id) });
  const setCash = (target) => {
    const inc = state.incomes.filter((i) => i.isReceived).reduce((a, i) => a + i.amount, 0);
    const exp = state.transactions.reduce((a, t) => a + t.amount, 0);
    update({ startingBalance: target - inc + exp });
  };
  const resetAll = () => commit(emptyState());
  const restore = (data) => commit({ ...emptyState(), ...data });
  const clearCats = () => { animate(); update({ categories: {} }); };
  // Kateqoriya idarəetməsi
  const addCategory = (name, icon, color) => {
    const n = name.trim(); if (!n || state.categories[n]) return false;
    update({ categories: { ...state.categories, [n]: { icon: icon || '🏷️', color: color || '#64748b', subs: [] } } }); return true;
  };
  const addSub = (cat, sub) => {
    const c = state.categories[cat]; const s = sub.trim(); if (!c || !s || (c.subs || []).includes(s)) return false;
    update({ categories: { ...state.categories, [cat]: { ...c, subs: [...(c.subs || []), s] } } }); return true;
  };
  const delCategory = (name) => { const c = { ...state.categories }; delete c[name]; update({ categories: c }); };
  const delSub = (cat, sub) => { const c = state.categories[cat]; if (!c) return; update({ categories: { ...state.categories, [cat]: { ...c, subs: c.subs.filter((s) => s !== sub) } } }); };

  const sections = useMemo(() => {
    const byDate = {};
    for (const e of state.transactions) (byDate[e.date] = byDate[e.date] || []).push(e);
    return Object.keys(byDate).sort((a, b) => b.localeCompare(a)).map((date) => ({
      date, total: byDate[date].reduce((a, t) => a + t.amount, 0),
      items: byDate[date].slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    }));
  }, [state.transactions]);

  const heroColor = ov.cash > 0 ? '#16a34a' : '#dc2626';
  const catApi = { addCategory, addSub };

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
          <View style={styles.sysIcon}><Text style={{ fontSize: 16 }}>📈</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.sysLabel}>SİSTEM MESAJI</Text><Text style={styles.sysText}>{sysMsg}</Text></View>
        </View>

        <View style={styles.sectionTop}>
          <View><Text style={styles.sectionTitle}>Maliyyə İcmalı</Text><Text style={styles.sectionSub}>Bu ay üçün ümumi vəziyyət</Text></View>
          <View style={styles.liveBadge}><Text style={styles.liveDot}>●</Text><Text style={styles.liveText}>Canlı</Text></View>
        </View>

        <View style={[styles.hero, { backgroundColor: heroColor }]}>
          <Text style={styles.heroTop}>👛  İNDİKİ PUL</Text>
          <Text style={styles.heroAmount}>{azn(ov.cash)}</Text>
          <Text style={styles.heroBottom}>{ov.cash <= 0 ? '⏳  Pul bitib — gəlir əlavə et' : `⏳  ${ov.cashRunway >= 999 ? 'uzun müddət' : ov.cashRunway + ' gün'} davam edəcək`}</Text>
        </View>

        <View style={styles.gridPad}>
          <View style={styles.row2}>
            <StatCard icon="📈" label="AY SONUNA" value={azn(ov.projectedMonthEnd)} sub="proyeksiya" tint={ov.projectedMonthEnd < 0 ? 'red' : 'green'} flex />
            <StatCard icon="📅" label="GÜNDƏLİK ORTA" value={azn(ov.avgDaily)} sub="son 30 günün ortası" tint="blue" flex />
          </View>
          <View style={styles.row3}>
            <StatCard icon="🛡️" label="VACIB" value={azn(stats.essentialTotal)} sub="məcburi" tint="red" flex small />
            <StatCard icon="🛒" label="STANDART" value={azn(stats.standardTotal)} sub="adi gündəlik" tint="yellow" flex small />
            <StatCard icon="🔥" label="İSRAF" value={azn(stats.wastefulTotal)} sub="qənaət şansı" tint="orange" flex small />
          </View>
          <StatCard icon="🛡️" label="VACIB TƏMINAT" value={`${ov.essentialCoverage.toFixed(0)}%`} sub={ov.essentialNeeded > 0 ? `lazım ${azn(ov.essentialNeeded)}` : 'Vacib ödəniş yoxdur'} tint={ov.essentialCoverage >= 100 ? 'green' : 'yellow'} />
          <View style={styles.row3}>
            <StatCard icon="🎯" label="GÜNLÜK LIMIT" value={azn(ov.dailySafeLimit)} tint="purple" flex small />
            <StatCard icon="📆" label="BU GÜN" value={azn(stats.today)} tint="yellow" flex small />
            <StatCard icon="👛" label="İNDIYƏ QƏDƏR" value={azn(stats.thisMonth)} tint="slate" flex small />
          </View>
        </View>

        {alerts.map((a, i) => (
          <View key={i} style={[styles.alert, { borderColor: a.kind === 'debt' ? '#fecaca' : '#bbf7d0', backgroundColor: a.kind === 'debt' ? '#fef2f2' : '#ecfdf5' }]}>
            <Text>{a.kind === 'debt' ? '⏰' : '💰'}</Text>
            <Text style={styles.alertText}>{a.kind === 'debt' ? 'Borc yaxınlaşır: ' : 'Gözlənilən gəlir: '}<Text style={{ fontWeight: '800' }}>{a.title}</Text> · {azn(a.amount)} · {shortDate(a.date)}</Text>
          </View>
        ))}

        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
          <TouchableOpacity style={styles.addBtn} onPress={() => setFormTx({})} activeOpacity={0.85}><Text style={styles.addBtnText}>＋  Xərc Əlavə Et</Text></TouchableOpacity>
        </View>

        {sections.length === 0 ? <Text style={styles.emptyText}>Hələ xərc yoxdur. Yuxarıdakı düymə ilə əlavə et.</Text> : sections.map((sec) => (
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
      <SettingsSheet visible={sheet === 'settings'} state={state} onClose={() => setSheet(null)} onSetCash={setCash} onReset={resetAll} onOpenCats={() => setSheet('cats')} onRestore={restore} />
      <CategorySheet visible={sheet === 'cats'} state={state} onClose={() => setSheet('settings')} catApi={catApi} onDelCat={delCategory} onDelSub={delSub} onClearAll={clearCats} />
    </View>
  );
}

function HIcon({ icon, tint, onPress }) {
  const t = TINT[tint];
  return <TouchableOpacity style={[styles.hIcon, { backgroundColor: t.bg }]} onPress={onPress} activeOpacity={0.7}><Text style={{ fontSize: 18 }}>{icon}</Text></TouchableOpacity>;
}
function StatCard({ icon, label, value, sub, tint, flex, small }) {
  const t = TINT[tint] || TINT.slate;
  return (
    <View style={[styles.statCard, { backgroundColor: t.bg, borderColor: t.bd }, flex && { flex: 1 }]}>
      <View style={styles.statHead}><Text style={{ fontSize: 13 }}>{icon}</Text><Text style={[styles.statLabel, { color: t.fg }]}>{label}</Text></View>
      <Text style={[styles.statValue, small && { fontSize: 16 }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}
function Row({ state, item, onPress }) {
  const c = catMeta(state, item.category); const k = KINDS[kindOf(item)]; const isDebt = item.category === DEBT_PAYMENT_CAT;
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.rowIcon, { backgroundColor: (isDebt ? '#f43f5e' : c.color) + '22' }]}><Text style={{ fontSize: 18 }}>{isDebt ? '💳' : c.icon}</Text></View>
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

// ===== Xərc forması (əlavə + düzəliş) =====
function ExpenseSheet({ visible, state, initial, catApi, onClose, onSave, onDelete }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          {visible ? <ExpenseForm state={state} initial={initial} catApi={catApi} onCancel={onClose} onSave={onSave} onDelete={onDelete} /> : null}
        </View>
      </KeyboardAvoidingView>
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
  const [picker, setPicker] = useState(false);
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
        <TextInput style={styles.amountInput} placeholder="0.00" placeholderTextColor="#cbd5e1" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} autoFocus={!initial} />
        <View><TouchableOpacity style={styles.stepper} onPress={() => bump(1)}><Text style={styles.stepperT}>▲</Text></TouchableOpacity><TouchableOpacity style={styles.stepper} onPress={() => bump(-1)}><Text style={styles.stepperT}>▼</Text></TouchableOpacity></View>
      </View>

      <Text style={styles.fLabel}>KATEQORIYA</Text>
      <TouchableOpacity style={styles.dropdown} onPress={() => setPicker(true)}>
        <Text style={styles.ddIcon}>{cat ? catMeta(state, cat).icon : '🗂️'}</Text>
        <Text style={[styles.ddText, !cat && { color: '#94a3b8' }]}>{cat ? `${cat}${sub ? ' · ' + sub : ''}` : 'Seç və ya yarat...'}</Text>
        <Text style={styles.ddChevron}>▾</Text>
      </TouchableOpacity>

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

      <SmartCategoryPicker visible={picker} state={state} catApi={catApi} onClose={() => setPicker(false)} onPick={(c, s) => { setCat(c); setSub(s); setPicker(false); }} />
      <View style={{ height: 8 }} />
    </ScrollView>
  );
}

// ===== Ağıllı kateqoriya seçici (ara / seç / yarat) =====
function SmartCategoryPicker({ visible, state, catApi, onClose, onPick }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(false);
  const [nName, setNName] = useState(''); const [nIcon, setNIcon] = useState(EMOJI_SET[0]); const [nColor, setNColor] = useState(COLOR_SET[0]);
  const [newSub, setNewSub] = useState('');
  const cats = Object.keys(state.categories || DEFAULT_CATEGORIES).filter((c) => c.toLowerCase().includes(q.toLowerCase()));
  function createCat() {
    if (!nName.trim()) { Alert.alert('Ad lazımdır'); return; }
    if (catApi.addCategory(nName, nIcon, nColor)) { const name = nName.trim(); setCreating(false); setNName(''); onPick(name, ''); }
    else Alert.alert('Bu ad artıq var');
  }
  function createSub(c) {
    if (catApi.addSub(c, newSub)) { const s = newSub.trim(); setNewSub(''); onPick(c, s); }
    else Alert.alert('Yararsız və ya təkrar alt kateqoriya');
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.pickerBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.pickerCard}>
          <View style={styles.formHead}><Text style={styles.pickerTitle}>Kateqoriya</Text><TouchableOpacity onPress={onClose}><Text style={styles.cancelLink}>Bağla</Text></TouchableOpacity></View>

          {creating ? (
            <View>
              <TextInput style={styles.input2} placeholder="Kateqoriya adı" placeholderTextColor="#94a3b8" value={nName} onChangeText={setNName} autoFocus />
              <Text style={styles.miniLabel}>Emoji</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
                {EMOJI_SET.map((e) => <TouchableOpacity key={e} onPress={() => setNIcon(e)} style={[styles.emojiBtn, nIcon === e && { borderColor: '#0EA5E9', backgroundColor: '#eff6ff' }]}><Text style={{ fontSize: 20 }}>{e}</Text></TouchableOpacity>)}
              </ScrollView>
              <Text style={styles.miniLabel}>Rəng</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                {COLOR_SET.map((c) => <TouchableOpacity key={c} onPress={() => setNColor(c)} style={[styles.colorBtn, { backgroundColor: c }, nColor === c && styles.colorActive]} />)}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity style={[styles.confirmBtn, { flex: 1, backgroundColor: '#e2e8f0', marginTop: 0 }]} onPress={() => setCreating(false)}><Text style={[styles.confirmText, { color: '#334155' }]}>Geri</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.confirmBtn, { flex: 2, marginTop: 0 }]} onPress={createCat}><Text style={styles.confirmText}>Yarat & seç</Text></TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <TextInput style={styles.search} placeholder="🔍 Axtar..." placeholderTextColor="#94a3b8" value={q} onChangeText={setQ} />
              <TouchableOpacity style={styles.createRow} onPress={() => setCreating(true)}><Text style={styles.createRowText}>➕  Yeni kateqoriya yarat</Text></TouchableOpacity>
              <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                {cats.map((c) => {
                  const meta = state.categories[c]; const isOpen = open === c; const subs = meta.subs || [];
                  return (
                    <View key={c}>
                      <TouchableOpacity style={styles.pickerRow} onPress={() => { animate(); subs.length ? setOpen(isOpen ? null : c) : onPick(c, ''); }}>
                        <View style={[styles.catDot, { backgroundColor: meta.color + '22' }]}><Text style={{ fontSize: 16 }}>{meta.icon}</Text></View>
                        <Text style={styles.pickerLabel}>{c}</Text>
                        {subs.length ? <Text style={styles.pickerChevron}>{isOpen ? '▾' : `${subs.length} ▸`}</Text> : <Text style={styles.pickerChevron}>seç</Text>}
                      </TouchableOpacity>
                      {isOpen && (
                        <View style={styles.subWrap}>
                          <TouchableOpacity style={styles.subRow} onPress={() => onPick(c, '')}><Text style={[styles.subRowText, { color: meta.color, fontWeight: '700' }]}>• Yalnız {c}</Text></TouchableOpacity>
                          {subs.map((sc) => <TouchableOpacity key={sc} style={styles.subRow} onPress={() => onPick(c, sc)}><Text style={styles.subRowText}>{sc}</Text></TouchableOpacity>)}
                          <View style={styles.addSubRow}>
                            <TextInput style={styles.addSubInput} placeholder="Yeni alt kateqoriya..." placeholderTextColor="#94a3b8" value={open === c ? newSub : ''} onChangeText={setNewSub} />
                            <TouchableOpacity style={styles.addSubBtn} onPress={() => createSub(c)}><Text style={{ color: '#fff', fontWeight: '800' }}>＋</Text></TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
                {cats.length === 0 ? <Text style={styles.emptyMini}>Tapılmadı — yuxarıdan yenisini yarat</Text> : null}
              </ScrollView>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ===== Ortak =====
function Sheet({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}><Text style={styles.sheetTitle}>{title}</Text><TouchableOpacity onPress={onClose} hitSlop={10}><Text style={styles.sheetClose}>✕</Text></TouchableOpacity></View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
function DateStepper({ date, setDate, maxToday }) {
  const canFwd = !maxToday || ymd(date) < todayYmd();
  return (
    <View style={styles.dateRow}>
      <TouchableOpacity style={styles.dateArrow} onPress={() => setDate(addDays(date, -1))}><Text style={styles.dateArrowT}>◀</Text></TouchableOpacity>
      <Text style={styles.dateVal}>{dateLabel(ymd(date))}</Text>
      <TouchableOpacity style={[styles.dateArrow, !canFwd && { opacity: 0.3 }]} disabled={!canFwd} onPress={() => setDate(addDays(date, 1))}><Text style={styles.dateArrowT}>▶</Text></TouchableOpacity>
    </View>
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

// ===== Qabaqcıl statistika (dövr + drill-down) =====
const PERIODS = [{ k: 'today', l: 'Bu gün' }, { k: 'week', l: 'Həftə' }, { k: 'month', l: 'Bu ay' }, { k: 'all', l: 'Hamısı' }];
function StatsSheet({ visible, state, onClose }) {
  const [period, setPeriod] = useState('month');
  const [drillCat, setDrillCat] = useState(null);
  const [drillSub, setDrillSub] = useState(null);
  const ps = useMemo(() => periodStats(state, period), [state, period]);

  const catE = Object.entries(ps.categoryBreakdown).sort((a, b) => b[1] - a[1]);
  const maxC = Math.max(1, ...catE.map((e) => e[1]));
  const kinds = [{ l: '🛡️ Vacib', v: ps.essential, c: '#16a34a' }, { l: '🛒 Standart', v: ps.standard, c: '#ca8a04' }, { l: '🔥 İsraf', v: ps.wasteful, c: '#ea580c' }];
  const maxK = Math.max(1, ...kinds.map((k) => k.v));

  function reset() { setDrillCat(null); setDrillSub(null); }

  return (
    <Sheet visible={visible} onClose={() => { reset(); onClose(); }} title="📊 Statistika">
      <View style={styles.segment}>
        {PERIODS.map((p) => <TouchableOpacity key={p.k} onPress={() => { setPeriod(p.k); reset(); }} style={[styles.segBtn, period === p.k && styles.segActive]}><Text style={[styles.segText, period === p.k && styles.segTextA]}>{p.l}</Text></TouchableOpacity>)}
      </View>

      <View style={styles.sumRow}>
        <View style={styles.sumCard}><Text style={styles.sumLabel}>Xərc</Text><Text style={[styles.sumVal, { color: '#dc2626' }]}>{azn(ps.total)}</Text></View>
        <View style={styles.sumCard}><Text style={styles.sumLabel}>Gəlir</Text><Text style={[styles.sumVal, { color: '#16a34a' }]}>{azn(ps.incomeTotal)}</Text></View>
        <View style={styles.sumCard}><Text style={styles.sumLabel}>Net</Text><Text style={[styles.sumVal, { color: ps.incomeTotal - ps.total >= 0 ? '#16a34a' : '#dc2626' }]}>{azn(ps.incomeTotal - ps.total)}</Text></View>
      </View>
      <Text style={styles.miniNote}>{ps.count} əməliyyat · orta {azn(ps.avg)}</Text>

      {!drillCat ? (
        <>
          <Text style={styles.statH}>Növə görə</Text>
          {kinds.map((k) => <Bar key={k.l} label={k.l} value={k.v} max={maxK} color={k.c} right={`${ps.total ? Math.round((k.v / ps.total) * 100) : 0}% · ${azn(k.v)}`} />)}
          <Text style={styles.statH}>Kateqoriya üzrə  <Text style={styles.tapHint}>(detay üçün toxun)</Text></Text>
          {catE.length === 0 ? <Text style={styles.emptyMini}>Bu dövrdə xərc yoxdur</Text> : catE.map(([n, v]) => <Bar key={n} label={`${catMeta(state, n).icon} ${n}`} value={v} max={maxC} color={catMeta(state, n).color} right={`${Math.round((v / ps.total) * 100)}%`} onPress={() => { animate(); setDrillCat(n); }} />)}
        </>
      ) : !drillSub ? (
        <>
          <TouchableOpacity style={styles.crumb} onPress={() => { animate(); setDrillCat(null); }}><Text style={styles.crumbText}>‹ Geri · {catMeta(state, drillCat).icon} {drillCat}</Text></TouchableOpacity>
          <Text style={styles.statH}>Alt kateqoriyalar</Text>
          {(() => {
            const subs = Object.entries(ps.subBreakdown[drillCat] || {}).sort((a, b) => b[1] - a[1]);
            const maxS = Math.max(1, ...subs.map((e) => e[1]));
            return subs.map(([sn, sv]) => <Bar key={sn} label={sn} value={sv} max={maxS} color={catMeta(state, drillCat).color} onPress={() => { animate(); setDrillSub(sn); }} />);
          })()}
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

// ===== Kateqoriya idarəçisi =====
function CategorySheet({ visible, state, onClose, catApi, onDelCat, onDelSub, onClearAll }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [newSub, setNewSub] = useState('');
  const [creating, setCreating] = useState(false);
  const [nName, setNName] = useState(''); const [nIcon, setNIcon] = useState(EMOJI_SET[0]); const [nColor, setNColor] = useState(COLOR_SET[0]);
  const cats = Object.keys(state.categories).filter((c) => c.toLowerCase().includes(q.toLowerCase()));
  function createCat() { if (!nName.trim()) { Alert.alert('Ad lazımdır'); return; } if (catApi.addCategory(nName, nIcon, nColor)) { setCreating(false); setNName(''); } else Alert.alert('Bu ad artıq var'); }
  function tryDelCat(c) { const u = catUsage(state, c); Alert.alert('Kateqoriyanı sil?', u > 0 ? `${c} — ${u} əməliyyatda istifadə olunur. Yenə də silinsin? (əməliyyatlar qalacaq)` : `${c} silinsin?`, [{ text: 'İmtina', style: 'cancel' }, { text: 'Sil', style: 'destructive', onPress: () => { animate(); onDelCat(c); } }]); }
  return (
    <Sheet visible={visible} onClose={onClose} title="🗂️ Kateqoriyalar">
      {creating ? (
        <View style={styles.formCard}>
          <TextInput style={styles.input2} placeholder="Kateqoriya adı" placeholderTextColor="#94a3b8" value={nName} onChangeText={setNName} autoFocus />
          <Text style={styles.miniLabel}>Emoji</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>{EMOJI_SET.map((e) => <TouchableOpacity key={e} onPress={() => setNIcon(e)} style={[styles.emojiBtn, nIcon === e && { borderColor: '#0EA5E9', backgroundColor: '#eff6ff' }]}><Text style={{ fontSize: 20 }}>{e}</Text></TouchableOpacity>)}</ScrollView>
          <Text style={styles.miniLabel}>Rəng</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>{COLOR_SET.map((c) => <TouchableOpacity key={c} onPress={() => setNColor(c)} style={[styles.colorBtn, { backgroundColor: c }, nColor === c && styles.colorActive]} />)}</ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity style={[styles.confirmBtn, { flex: 1, backgroundColor: '#e2e8f0', marginTop: 0 }]} onPress={() => setCreating(false)}><Text style={[styles.confirmText, { color: '#334155' }]}>Geri</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.confirmBtn, { flex: 2, marginTop: 0 }]} onPress={createCat}><Text style={styles.confirmText}>Yarat</Text></TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <TextInput style={styles.search} placeholder="🔍 Axtar..." placeholderTextColor="#94a3b8" value={q} onChangeText={setQ} />
          <TouchableOpacity style={styles.createRow} onPress={() => setCreating(true)}><Text style={styles.createRowText}>➕  Yeni kateqoriya yarat</Text></TouchableOpacity>
          {Object.keys(state.categories).length > 0 ? (
            <TouchableOpacity style={styles.clearAllRow} onPress={() => Alert.alert('Bütün kateqoriyaları sil?', 'Hamısı silinəcək (əməliyyatlar qalacaq).', [{ text: 'İmtina', style: 'cancel' }, { text: 'Hamısını sil', style: 'destructive', onPress: onClearAll }])}>
              <Text style={styles.clearAllText}>🗑️  Bütün kateqoriyaları sil</Text>
            </TouchableOpacity>
          ) : null}
          {cats.length === 0 ? <Text style={styles.emptyMini}>Kateqoriya yoxdur — yuxarıdan yarat</Text> : null}
          {cats.map((c) => {
            const meta = state.categories[c]; const isOpen = open === c; const subs = meta.subs || [];
            return (
              <View key={c} style={styles.catCard}>
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => { animate(); setOpen(isOpen ? null : c); }}>
                  <View style={[styles.catDot, { backgroundColor: meta.color + '22' }]}><Text style={{ fontSize: 16 }}>{meta.icon}</Text></View>
                  <View style={{ flex: 1 }}><Text style={styles.liTitle}>{c}</Text><Text style={styles.liSub}>{subs.length} alt · {catUsage(state, c)} əməliyyat</Text></View>
                  <TouchableOpacity onPress={() => tryDelCat(c)} hitSlop={8}><Text>🗑️</Text></TouchableOpacity>
                  <Text style={styles.pickerChevron}>{isOpen ? '▾' : '▸'}</Text>
                </TouchableOpacity>
                {isOpen && (
                  <View style={{ marginTop: 8 }}>
                    {subs.map((sc) => <View key={sc} style={styles.subManageRow}><Text style={styles.subRowText}>{sc}</Text><TouchableOpacity onPress={() => { animate(); onDelSub(c, sc); }} hitSlop={8}><Text style={{ fontSize: 13 }}>✕</Text></TouchableOpacity></View>)}
                    <View style={styles.addSubRow}>
                      <TextInput style={styles.addSubInput} placeholder="Yeni alt..." placeholderTextColor="#94a3b8" value={open === c ? newSub : ''} onChangeText={setNewSub} />
                      <TouchableOpacity style={styles.addSubBtn} onPress={() => { if (catApi.addSub(c, newSub)) setNewSub(''); }}><Text style={{ color: '#fff', fontWeight: '800' }}>＋</Text></TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}
      <View style={{ height: 12 }} />
    </Sheet>
  );
}

function SettingsSheet({ visible, state, onClose, onSetCash, onReset, onOpenCats, onRestore }) {
  const [cash, setCash] = useState('');
  function apply() { const amt = parseAmount(cash); onSetCash(amt); setCash(''); Alert.alert('Tamam', `İndiki pul ${azn(amt)} olaraq təyin edildi.`); }
  return (
    <Sheet visible={visible} onClose={onClose} title="⚙️ Tənzimləmələr">
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 60, paddingHorizontal: 18, paddingBottom: 4 },
  appTitle: { color: '#0f172a', fontSize: 20, fontWeight: '800' },
  appSub: { color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  iconRow: { flexDirection: 'row', gap: 6 },
  hIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  sysMsg: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 18, marginBottom: 10, backgroundColor: '#fff', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  sysIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center' },
  sysLabel: { color: '#7c3aed', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  sysText: { color: '#334155', fontSize: 14, marginTop: 2 },
  sectionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 6 },
  sectionTitle: { color: '#0f172a', fontSize: 22, fontWeight: '800' },
  sectionSub: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ecfdf5', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  liveDot: { color: '#16a34a', fontSize: 9 },
  liveText: { color: '#16a34a', fontSize: 12, fontWeight: '700' },
  hero: { margin: 18, marginBottom: 12, borderRadius: 24, padding: 22 },
  heroTop: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  heroAmount: { color: '#fff', fontSize: 40, fontWeight: '900', marginTop: 6 },
  heroBottom: { color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: '600', marginTop: 8 },
  gridPad: { paddingHorizontal: 14, gap: 10 },
  row2: { flexDirection: 'row', gap: 10 },
  row3: { flexDirection: 'row', gap: 10 },
  statCard: { backgroundColor: '#fff', borderRadius: 18, padding: 14, borderWidth: 1 },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  statValue: { color: '#0f172a', fontSize: 22, fontWeight: '800', marginTop: 6 },
  statSub: { color: '#94a3b8', fontSize: 11, marginTop: 3 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 18, marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
  alertText: { color: '#334155', fontSize: 13, flex: 1 },
  addBtn: { backgroundColor: '#0f172a', borderRadius: 18, paddingVertical: 18, alignItems: 'center', marginTop: 6 },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  emptyText: { color: '#94a3b8', fontSize: 14, textAlign: 'center', marginTop: 20, paddingHorizontal: 30 },
  secHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 },
  secDate: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  secTotal: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginVertical: 4, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  rowIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowTitle: { color: '#0f172a', fontSize: 15, fontWeight: '600' },
  kindBadge: { fontSize: 11, fontWeight: '700' },
  rowNote: { color: '#94a3b8', fontSize: 12, flex: 1 },
  rowAmount: { color: '#0f172a', fontSize: 16, fontWeight: '700' },

  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: '#f1f5f9', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, paddingBottom: 26, maxHeight: '92%' },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#cbd5e1', marginBottom: 12 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { color: '#0f172a', fontSize: 20, fontWeight: '800' },
  sheetClose: { color: '#64748b', fontSize: 20, fontWeight: '700' },

  formHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  formTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  cancelLink: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  amountBox: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: '#0EA5E9', paddingBottom: 8 },
  amountCur: { color: '#64748b', fontSize: 26, fontWeight: '700', marginRight: 8 },
  amountInput: { flex: 1, color: '#0f172a', fontSize: 34, fontWeight: '800', padding: 0 },
  stepper: { width: 28, height: 20, alignItems: 'center', justifyContent: 'center' },
  stepperT: { color: '#94a3b8', fontSize: 11 },
  fLabel: { color: '#64748b', fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  dropdown: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  ddIcon: { fontSize: 16 },
  ddText: { flex: 1, color: '#0f172a', fontSize: 15, fontWeight: '600' },
  ddChevron: { color: '#94a3b8', fontSize: 14 },
  kindRow: { flexDirection: 'row', gap: 8 },
  kindBtn: { flex: 1, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingVertical: 12 },
  kindMain: { color: '#334155', fontSize: 14, fontWeight: '700' },
  kindSub: { color: '#94a3b8', fontSize: 10, marginTop: 2 },
  noteInput: { backgroundColor: '#fff', color: '#0f172a', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14, fontSize: 15, borderWidth: 1, borderColor: '#e2e8f0' },
  confirmBtn: { backgroundColor: '#0EA5E9', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 18 },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  delLink: { alignItems: 'center', paddingVertical: 14 },
  delLinkText: { color: '#dc2626', fontSize: 14, fontWeight: '700' },

  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 22 },
  pickerCard: { backgroundColor: '#fff', borderRadius: 22, padding: 16, maxHeight: '82%' },
  pickerTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  search: { backgroundColor: '#f1f5f9', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: '#0f172a', marginBottom: 10 },
  createRow: { backgroundColor: '#eff6ff', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#bfdbfe' },
  createRowText: { color: '#2563eb', fontSize: 14, fontWeight: '800' },
  clearAllRow: { backgroundColor: '#fef2f2', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#fecaca' },
  clearAllText: { color: '#dc2626', fontSize: 13, fontWeight: '800' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  catDot: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pickerLabel: { flex: 1, color: '#0f172a', fontSize: 16, fontWeight: '600' },
  pickerChevron: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  subWrap: { paddingLeft: 16, paddingBottom: 8, backgroundColor: '#f8fafc' },
  subRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  subRowText: { color: '#475569', fontSize: 15 },
  addSubRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  addSubInput: { flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, fontSize: 14, borderWidth: 1, borderColor: '#e2e8f0', color: '#0f172a' },
  addSubBtn: { width: 40, height: 38, borderRadius: 10, backgroundColor: '#0EA5E9', alignItems: 'center', justifyContent: 'center' },
  miniLabel: { color: '#64748b', fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  emojiBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  colorBtn: { width: 34, height: 34, borderRadius: 17 },
  colorActive: { borderWidth: 3, borderColor: '#0f172a' },

  input2: { backgroundColor: '#fff', color: '#0f172a', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, fontSize: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 10 },
  formCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 14 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, marginBottom: 6 },
  switchLabel: { color: '#334155', fontSize: 15, fontWeight: '600' },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 14, padding: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  dateArrow: { width: 46, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' },
  dateArrowT: { color: '#334155', fontSize: 15 },
  dateVal: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  li: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  liTitle: { color: '#0f172a', fontSize: 15, fontWeight: '600' },
  liSub: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  liAmount: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  miniBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  emptyMini: { color: '#94a3b8', fontSize: 13, textAlign: 'center', paddingVertical: 16 },

  segment: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 12, padding: 4, marginBottom: 14 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segActive: { backgroundColor: '#fff' },
  segText: { color: '#64748b', fontSize: 13, fontWeight: '700' },
  segTextA: { color: '#0f172a' },
  sumRow: { flexDirection: 'row', gap: 10 },
  sumCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  sumLabel: { color: '#94a3b8', fontSize: 12 },
  sumVal: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  miniNote: { color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 8 },
  statH: { color: '#0EA5E9', fontSize: 14, fontWeight: '800', marginTop: 18, marginBottom: 12 },
  tapHint: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  crumb: { paddingVertical: 8 },
  crumbText: { color: '#2563eb', fontSize: 14, fontWeight: '700' },
  barLabel: { color: '#334155', fontSize: 13, fontWeight: '600' },
  barVal: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  barTrack: { height: 10, borderRadius: 6, backgroundColor: '#e2e8f0', overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },

  catCard: { backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  subManageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, paddingLeft: 44, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  navIcon: { fontSize: 20 },
  navText: { flex: 1, color: '#0f172a', fontSize: 15, fontWeight: '600' },
  hintTxt: { color: '#94a3b8', fontSize: 12, marginBottom: 10, lineHeight: 17 },
  dangerBtn: { backgroundColor: '#fef2f2', borderRadius: 14, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: '#fecaca' },
  dangerText: { color: '#dc2626', fontSize: 15, fontWeight: '800' },
});
