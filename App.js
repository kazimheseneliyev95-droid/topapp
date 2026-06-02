import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import {
  CURRENCY, DEFAULT_CATEGORIES, DEBT_PAYMENT_CAT, KINDS,
  emptyState, loadState, saveState, uid, ymd, todayYmd, parseYmd, addDays,
  dateLabel, shortDate, money, parseAmount, catMeta, kindOf,
  currentCash, calculateStats, overview, buildAlerts,
} from './src/finance';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState(emptyState());

  useEffect(() => { (async () => { setState(await loadState()); setLoading(false); })(); }, []);

  function commit(next) { setState(next); saveState(next); }
  const update = (patch) => commit({ ...state, ...patch });

  if (loading) {
    return <View style={[styles.root, styles.center]}><StatusBar style="light" /><ActivityIndicator color="#0EA5E9" size="large" /></View>;
  }
  if (!state.user) return <Login onLogin={(name) => update({ user: name })} />;
  return <Dashboard state={state} commit={commit} update={update} />;
}

// ==================== LOGIN ====================
function Login({ onLogin }) {
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  function submit() {
    if (!name.trim() || !pass.trim()) { setErr('Ad və şifrə boş ola bilməz'); return; }
    onLogin(name.trim());
  }
  return (
    <KeyboardAvoidingView style={[styles.root, styles.center, { padding: 24 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <View style={styles.card}>
        <Text style={styles.logo}>💸</Text>
        <Text style={styles.title}>XƏRCLƏM</Text>
        <Text style={styles.subtitle}>Xərclərini ağıllı idarə et</Text>
        <TextInput style={styles.input} placeholder="İstifadəçi adı" placeholderTextColor="#64748B" autoCapitalize="none" value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Şifrə" placeholderTextColor="#64748B" secureTextEntry value={pass} onChangeText={setPass} />
        {err ? <Text style={styles.err}>{err}</Text> : null}
        <TouchableOpacity style={styles.primaryBtn} onPress={submit} activeOpacity={0.85}><Text style={styles.primaryBtnText}>Daxil ol</Text></TouchableOpacity>
        <Text style={styles.hint}>Test üçün istənilən ad/şifrə yaz</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

// ==================== DASHBOARD ====================
function Dashboard({ state, commit, update }) {
  const [sheet, setSheet] = useState(null); // 'expense'|'income'|'debt'|'future'|'stats'|'settings'

  const ov = useMemo(() => overview(state), [state]);
  const stats = useMemo(() => calculateStats(state), [state]);
  const alerts = useMemo(() => buildAlerts(state), [state]);

  // --- mutasyonlar ---
  const addTx = (t) => update({ transactions: [t, ...state.transactions] });
  const delTx = (id) => update({ transactions: state.transactions.filter((x) => x.id !== id) });
  const addIncome = (i) => update({ incomes: [i, ...state.incomes] });
  const delIncome = (id) => update({ incomes: state.incomes.filter((x) => x.id !== id) });
  const toggleIncome = (id) => update({ incomes: state.incomes.map((x) => x.id === id ? { ...x, isReceived: !x.isReceived } : x) });
  const addDebt = (d) => update({ debts: [d, ...state.debts] });
  const delDebt = (id) => update({ debts: state.debts.filter((x) => x.id !== id) });
  const payDebt = (d) => {
    const amt = d.amount - (d.paid || 0);
    if (amt <= 0) return;
    if (currentCash(state) < amt) { Alert.alert('Kifayət qədər nağd yoxdur', 'Bu borcu ödəmək üçün nağdın çatmır.'); return; }
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
  const resetAll = () => commit({ ...emptyState(), user: state.user });
  const logout = () => update({ user: null });

  // tarih grupli liste
  const sections = useMemo(() => {
    const byDate = {};
    for (const e of state.transactions) (byDate[e.date] = byDate[e.date] || []).push(e);
    return Object.keys(byDate).sort((a, b) => b.localeCompare(a)).map((date) => ({
      date,
      total: byDate[date].reduce((a, t) => a + t.amount, 0),
      items: byDate[date].slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    }));
  }, [state.transactions]);

  const projNeg = ov.projectedMonthEnd < 0;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.hello}>Salam 👋</Text>
            <Text style={styles.username}>{state.user}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setSheet('settings')}><Text style={styles.iconBtnTxt}>⚙️</Text></TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={logout}><Text style={styles.iconBtnTxt}>🚪</Text></TouchableOpacity>
          </View>
        </View>

        {/* Hero: Nağd */}
        <View style={[styles.hero, ov.cash < 0 && { backgroundColor: '#dc2626' }]}>
          <Text style={styles.heroLabel}>Əlində Nağd</Text>
          <Text style={styles.heroAmount}>{CURRENCY}{money(ov.cash)}</Text>
          <View style={styles.heroRow}>
            <View style={styles.heroChip}><Text style={styles.heroChipLabel}>Günlük güvənli limit</Text><Text style={styles.heroChipValue}>{CURRENCY}{money(ov.dailySafeLimit)}</Text></View>
            <View style={styles.heroChip}><Text style={styles.heroChipLabel}>Nağd ömrü</Text><Text style={styles.heroChipValue}>{ov.cashRunway >= 999 ? '∞' : ov.cashRunway + ' gün'}</Text></View>
          </View>
        </View>

        {/* Uyarilar */}
        {alerts.map((a, idx) => (
          <View key={idx} style={[styles.alert, a.kind === 'debt' ? styles.alertDebt : styles.alertIncome]}>
            <Text style={styles.alertIcon}>{a.kind === 'debt' ? '⏰' : '💰'}</Text>
            <Text style={styles.alertText}>
              {a.kind === 'debt' ? 'Borc yaxınlaşır: ' : 'Gözlənilən gəlir: '}
              <Text style={{ fontWeight: '800' }}>{a.title}</Text> · {CURRENCY}{money(a.amount)} · {shortDate(a.date)}
            </Text>
          </View>
        ))}

        {/* Metrikler */}
        <View style={styles.metricGrid}>
          <Metric label="Bu ay xərc" value={`${CURRENCY}${money(stats.thisMonth)}`} sub={stats.trendDelta ? `${stats.trendDelta > 0 ? '▲' : '▼'} ${Math.abs(stats.trendDelta).toFixed(0)}%` : 'keçən aya bənzər'} subColor={stats.trendDelta > 0 ? '#f87171' : '#34d399'} />
          <Metric label="Bu gün" value={`${CURRENCY}${money(stats.today)}`} sub={`30g ort. ${CURRENCY}${money(ov.avgDaily)}/gün`} />
          <Metric label="Ay sonu proqnoz" value={`${CURRENCY}${money(ov.projectedMonthEnd)}`} valueColor={projNeg ? '#f87171' : '#34d399'} sub={`öhdəlik ${CURRENCY}${money(ov.obligations)}`} />
          <Metric label="Vacib ehtiyat" value={`${ov.essentialCoverage.toFixed(0)}%`} valueColor={ov.essentialCoverage >= 100 ? '#34d399' : '#fbbf24'} sub={ov.essentialNeeded > 0 ? `lazım ${CURRENCY}${money(ov.essentialNeeded)}` : 'öhdəlik yox'} />
        </View>

        {projNeg && (
          <View style={styles.warning}>
            <Text style={styles.warningText}>⚠️ Diqqət: bu ayki öhdəliklərdən sonra nağdın mənfiyə düşür. Xərcləri azalt və ya gəlir əlavə et.</Text>
          </View>
        )}

        {/* Hizli erisim */}
        <View style={styles.quickRow}>
          <Quick icon="💰" label="Gəlir" onPress={() => setSheet('income')} />
          <Quick icon="💳" label="Borc" onPress={() => setSheet('debt')} />
          <Quick icon="📅" label="Gələcək" onPress={() => setSheet('future')} />
          <Quick icon="📊" label="Statistika" onPress={() => setSheet('stats')} />
        </View>

        {/* Son hareketler */}
        <Text style={styles.listTitle}>Son hərəkətlər</Text>
        {sections.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🧾</Text>
            <Text style={styles.emptyText}>Hələ xərc yoxdur</Text>
            <Text style={styles.emptySub}>Aşağıdakı + ilə ilk xərcini əlavə et</Text>
          </View>
        ) : sections.map((sec) => (
          <View key={sec.date}>
            <View style={styles.secHeader}>
              <Text style={styles.secDate}>{dateLabel(sec.date)}</Text>
              <Text style={styles.secTotal}>{CURRENCY}{money(sec.total)}</Text>
            </View>
            {sec.items.map((item) => <ExpenseRow key={item.id} state={state} item={item} onLong={() => {
              Alert.alert('Sil?', `${item.category}${item.subCategory ? ' · ' + item.subCategory : ''} · ${CURRENCY}${money(item.amount)}`, [
                { text: 'İmtina', style: 'cancel' }, { text: 'Sil', style: 'destructive', onPress: () => delTx(item.id) },
              ]);
            }} />)}
          </View>
        ))}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setSheet('expense')} activeOpacity={0.85}><Text style={styles.fabPlus}>＋</Text></TouchableOpacity>

      {/* Sheets */}
      <AddExpenseSheet visible={sheet === 'expense'} state={state} onClose={() => setSheet(null)} onSave={addTx} />
      <IncomeSheet visible={sheet === 'income'} state={state} onClose={() => setSheet(null)} onAdd={addIncome} onDelete={delIncome} onToggle={toggleIncome} />
      <DebtSheet visible={sheet === 'debt'} state={state} onClose={() => setSheet(null)} onAdd={addDebt} onDelete={delDebt} onPay={payDebt} />
      <FutureSheet visible={sheet === 'future'} state={state} onClose={() => setSheet(null)} onAdd={addFuture} onDelete={delFuture} />
      <StatsSheet visible={sheet === 'stats'} state={state} stats={stats} ov={ov} onClose={() => setSheet(null)} />
      <SettingsSheet visible={sheet === 'settings'} state={state} onClose={() => setSheet(null)} onSetCash={setCash} onReset={resetAll} />
    </View>
  );
}

function Metric({ label, value, sub, valueColor, subColor }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, valueColor && { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={[styles.metricSub, subColor && { color: subColor }]}>{sub}</Text> : null}
    </View>
  );
}
function Quick({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={styles.quick} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.quickIcon}>{icon}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}
function ExpenseRow({ state, item, onLong }) {
  const c = catMeta(state, item.category);
  const k = KINDS[kindOf(item)];
  const isDebt = item.category === DEBT_PAYMENT_CAT;
  return (
    <TouchableOpacity style={styles.row} onLongPress={onLong} delayLongPress={280} activeOpacity={0.7}>
      <View style={[styles.rowIcon, { backgroundColor: (isDebt ? '#f43f5e' : c.color) + '22' }]}><Text style={{ fontSize: 20 }}>{isDebt ? '💳' : c.icon}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{item.category}{item.subCategory ? ` · ${item.subCategory}` : ''}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          {!isDebt ? <Text style={[styles.kindBadge, { color: k.color }]}>{k.icon} {k.label}</Text> : null}
          {item.note ? <Text style={styles.rowNote} numberOfLines={1}>{item.note}</Text> : null}
        </View>
      </View>
      <Text style={styles.rowAmount}>{CURRENCY}{money(item.amount)}</Text>
    </TouchableOpacity>
  );
}

// ==================== SHEET WRAPPER ====================
function Sheet({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><Text style={styles.sheetClose}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
function DateStepper({ date, setDate, maxToday }) {
  const canFwd = !maxToday || ymd(date) < todayYmd();
  return (
    <View style={styles.dateRow}>
      <TouchableOpacity style={styles.dateArrow} onPress={() => setDate(addDays(date, -1))}><Text style={styles.dateArrowText}>◀</Text></TouchableOpacity>
      <Text style={styles.dateValue}>{dateLabel(ymd(date))}</Text>
      <TouchableOpacity style={[styles.dateArrow, !canFwd && { opacity: 0.3 }]} disabled={!canFwd} onPress={() => setDate(addDays(date, 1))}><Text style={styles.dateArrowText}>▶</Text></TouchableOpacity>
    </View>
  );
}

// ==================== ADD EXPENSE ====================
function AddExpenseSheet({ visible, state, onClose, onSave }) {
  const cats = Object.keys(state.categories || DEFAULT_CATEGORIES);
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState(cats[0]);
  const [sub, setSub] = useState('');
  const [kind, setKind] = useState('standard');
  const [date, setDate] = useState(new Date());
  const [note, setNote] = useState('');

  const subs = (state.categories[cat] || { subs: [] }).subs || [];

  function reset() { setAmount(''); setCat(cats[0]); setSub(''); setKind('standard'); setDate(new Date()); setNote(''); }
  function save() {
    const amt = parseAmount(amount);
    if (amt <= 0) { Alert.alert('Yanlış məbləğ', '0-dan böyük məbləğ yaz.'); return; }
    onSave({
      id: uid(), amount: amt, category: cat, subCategory: sub, note: note.trim(),
      isEssential: kind === 'essential', isWasteful: kind === 'wasteful',
      date: ymd(date), createdAt: Date.now(),
    });
    reset(); onClose();
  }

  return (
    <Sheet visible={visible} onClose={() => { reset(); onClose(); }} title="Yeni Xərc">
      <View style={styles.amountBox}>
        <Text style={styles.amountCur}>{CURRENCY}</Text>
        <TextInput style={styles.amountInput} placeholder="0,00" placeholderTextColor="#475569" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} autoFocus />
      </View>

      <Text style={styles.fieldLabel}>Kateqoriya</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {cats.map((c) => {
          const meta = state.categories[c]; const active = cat === c;
          return (
            <TouchableOpacity key={c} onPress={() => { setCat(c); setSub(''); }} activeOpacity={0.8} style={[styles.chip, active && { borderColor: meta.color, backgroundColor: meta.color + '22' }]}>
              <Text style={{ fontSize: 16 }}>{meta.icon}</Text><Text style={[styles.chipLabel, active && { color: '#fff' }]}>{c}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {subs.length > 0 && (
        <>
          <Text style={styles.fieldLabel}>Alt kateqoriya</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {subs.map((sc) => (
              <TouchableOpacity key={sc} onPress={() => setSub(sub === sc ? '' : sc)} activeOpacity={0.8} style={[styles.subChip, sub === sc && { backgroundColor: '#0EA5E9', borderColor: '#0EA5E9' }]}>
                <Text style={[styles.subChipLabel, sub === sc && { color: '#fff' }]}>{sc}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      <Text style={styles.fieldLabel}>Növ</Text>
      <View style={styles.kindRow}>
        {Object.values(KINDS).map((k) => (
          <TouchableOpacity key={k.key} onPress={() => setKind(k.key)} activeOpacity={0.8} style={[styles.kindBtn, kind === k.key && { borderColor: k.color, backgroundColor: k.color + '22' }]}>
            <Text style={{ fontSize: 16 }}>{k.icon}</Text>
            <Text style={[styles.kindLabel, kind === k.key && { color: '#fff' }]}>{k.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Tarix</Text>
      <DateStepper date={date} setDate={setDate} maxToday />

      <Text style={styles.fieldLabel}>Qeyd (istəyə bağlı)</Text>
      <TextInput style={styles.noteInput} placeholder="məs. nahar" placeholderTextColor="#475569" value={note} onChangeText={setNote} />

      <TouchableOpacity style={[styles.saveBtn, { marginTop: 18 }]} onPress={save} activeOpacity={0.85}><Text style={styles.saveBtnText}>Yadda saxla</Text></TouchableOpacity>
    </Sheet>
  );
}

// ==================== INCOME ====================
function IncomeSheet({ visible, state, onClose, onAdd, onDelete, onToggle }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date());
  const [received, setReceived] = useState(true);
  function add() {
    const amt = parseAmount(amount);
    if (!title.trim() || amt <= 0) { Alert.alert('Eksik', 'Başlıq və məbləğ lazımdır.'); return; }
    onAdd({ id: uid(), title: title.trim(), amount: amt, date: ymd(date), isReceived: received });
    setTitle(''); setAmount(''); setDate(new Date()); setReceived(true);
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="💰 Gəlir">
      <View style={styles.formCard}>
        <TextInput style={styles.input2} placeholder="Başlıq (məs. Maaş)" placeholderTextColor="#475569" value={title} onChangeText={setTitle} />
        <TextInput style={styles.input2} placeholder="Məbləğ" placeholderTextColor="#475569" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <DateStepper date={date} setDate={setDate} />
        <View style={styles.switchRow}><Text style={styles.switchLabel}>{received ? 'Alındı ✅' : 'Gözləyir ⏳'}</Text><Switch value={received} onValueChange={setReceived} trackColor={{ true: '#22c55e' }} /></View>
        <TouchableOpacity style={styles.saveBtn} onPress={add}><Text style={styles.saveBtnText}>Əlavə et</Text></TouchableOpacity>
      </View>
      {(state.incomes || []).map((i) => (
        <View key={i.id} style={styles.listItem}>
          <View style={{ flex: 1 }}>
            <Text style={styles.liTitle}>{i.title}</Text>
            <Text style={styles.liSub}>{shortDate(i.date)} · {i.isReceived ? 'Alındı' : 'Gözləyir'}</Text>
          </View>
          <TouchableOpacity onPress={() => onToggle(i.id)} style={[styles.miniBtn, { backgroundColor: i.isReceived ? '#16331f' : '#3a2e12' }]}><Text style={{ color: i.isReceived ? '#34d399' : '#fbbf24', fontWeight: '700' }}>{i.isReceived ? '✓' : '⏳'}</Text></TouchableOpacity>
          <Text style={[styles.liAmount, { color: '#34d399' }]}>+{CURRENCY}{money(i.amount)}</Text>
          <TouchableOpacity onPress={() => onDelete(i.id)} hitSlop={8}><Text style={styles.del}>🗑️</Text></TouchableOpacity>
        </View>
      ))}
      {(!state.incomes || state.incomes.length === 0) ? <Text style={styles.emptyMini}>Hələ gəlir yoxdur</Text> : null}
    </Sheet>
  );
}

// ==================== DEBT ====================
function DebtSheet({ visible, state, onClose, onAdd, onDelete, onPay }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('AcilDegil');
  const [due, setDue] = useState(new Date());
  function add() {
    const amt = parseAmount(amount);
    if (!title.trim() || amt <= 0) { Alert.alert('Eksik', 'Başlıq və məbləğ lazımdır.'); return; }
    onAdd({ id: uid(), title: title.trim(), amount: amt, type, paid: 0, dueDate: ymd(due) });
    setTitle(''); setAmount(''); setType('AcilDegil'); setDue(new Date());
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="💳 Borclar">
      <View style={styles.formCard}>
        <TextInput style={styles.input2} placeholder="Başlıq (məs. Banka kredit)" placeholderTextColor="#475569" value={title} onChangeText={setTitle} />
        <TextInput style={styles.input2} placeholder="Məbləğ" placeholderTextColor="#475569" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <View style={styles.kindRow}>
          <TouchableOpacity onPress={() => setType('Acil')} style={[styles.kindBtn, type === 'Acil' && { borderColor: '#f43f5e', backgroundColor: '#f43f5e22' }]}><Text style={[styles.kindLabel, type === 'Acil' && { color: '#fff' }]}>🔴 Acil</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setType('AcilDegil')} style={[styles.kindBtn, type === 'AcilDegil' && { borderColor: '#3b82f6', backgroundColor: '#3b82f622' }]}><Text style={[styles.kindLabel, type === 'AcilDegil' && { color: '#fff' }]}>🔵 Acil deyil</Text></TouchableOpacity>
        </View>
        <Text style={styles.fieldLabel}>Son tarix</Text>
        <DateStepper date={due} setDate={setDue} />
        <TouchableOpacity style={styles.saveBtn} onPress={add}><Text style={styles.saveBtnText}>Əlavə et</Text></TouchableOpacity>
      </View>
      {(state.debts || []).map((d) => {
        const remaining = d.amount - (d.paid || 0); const paid = remaining <= 0;
        return (
          <View key={d.id} style={styles.listItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.liTitle}>{d.type === 'Acil' ? '🔴 ' : ''}{d.title}</Text>
              <Text style={styles.liSub}>{paid ? 'Ödənildi ✅' : `Qalıq ${CURRENCY}${money(remaining)}`}{d.dueDate ? ` · ${shortDate(d.dueDate)}` : ''}</Text>
            </View>
            {!paid ? <TouchableOpacity onPress={() => onPay(d)} style={[styles.miniBtn, { backgroundColor: '#0EA5E9' }]}><Text style={{ color: '#fff', fontWeight: '700' }}>Ödə</Text></TouchableOpacity> : null}
            <Text style={styles.liAmount}>{CURRENCY}{money(d.amount)}</Text>
            <TouchableOpacity onPress={() => onDelete(d.id)} hitSlop={8}><Text style={styles.del}>🗑️</Text></TouchableOpacity>
          </View>
        );
      })}
      {(!state.debts || state.debts.length === 0) ? <Text style={styles.emptyMini}>Hələ borc yoxdur</Text> : null}
    </Sheet>
  );
}

// ==================== FUTURE ====================
function FutureSheet({ visible, state, onClose, onAdd, onDelete }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date());
  const [essential, setEssential] = useState(false);
  function add() {
    const amt = parseAmount(amount);
    if (!title.trim() || amt <= 0) { Alert.alert('Eksik', 'Başlıq və məbləğ lazımdır.'); return; }
    onAdd({ id: uid(), title: title.trim(), amount: amt, date: ymd(date), isEssential: essential });
    setTitle(''); setAmount(''); setDate(new Date()); setEssential(false);
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="📅 Gələcək Xərclər">
      <View style={styles.formCard}>
        <TextInput style={styles.input2} placeholder="Başlıq (məs. İcarə)" placeholderTextColor="#475569" value={title} onChangeText={setTitle} />
        <TextInput style={styles.input2} placeholder="Məbləğ" placeholderTextColor="#475569" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <Text style={styles.fieldLabel}>Tarix</Text>
        <DateStepper date={date} setDate={setDate} />
        <View style={styles.switchRow}><Text style={styles.switchLabel}>{essential ? '🛡️ Vacib' : 'Adi'}</Text><Switch value={essential} onValueChange={setEssential} trackColor={{ true: '#22c55e' }} /></View>
        <TouchableOpacity style={styles.saveBtn} onPress={add}><Text style={styles.saveBtnText}>Əlavə et</Text></TouchableOpacity>
      </View>
      {(state.futureExpenses || []).map((f) => (
        <View key={f.id} style={styles.listItem}>
          <View style={{ flex: 1 }}><Text style={styles.liTitle}>{f.isEssential ? '🛡️ ' : ''}{f.title}</Text><Text style={styles.liSub}>{shortDate(f.date)}</Text></View>
          <Text style={styles.liAmount}>{CURRENCY}{money(f.amount)}</Text>
          <TouchableOpacity onPress={() => onDelete(f.id)} hitSlop={8}><Text style={styles.del}>🗑️</Text></TouchableOpacity>
        </View>
      ))}
      {(!state.futureExpenses || state.futureExpenses.length === 0) ? <Text style={styles.emptyMini}>Hələ planlı xərc yoxdur</Text> : null}
    </Sheet>
  );
}

// ==================== STATS ====================
function Bar({ label, value, max, color }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={styles.barLabel}>{label}</Text><Text style={styles.barValue}>{CURRENCY}{money(value)}</Text>
      </View>
      <View style={styles.barTrack}><View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} /></View>
    </View>
  );
}
function StatsSheet({ visible, state, stats, ov, onClose }) {
  const periods = [
    { label: 'Bu gün', value: stats.today, color: '#0EA5E9' },
    { label: 'Dünən', value: stats.yesterday, color: '#6366f1' },
    { label: 'Bu ay', value: stats.thisMonth, color: '#8b5cf6' },
    { label: 'Keçən ay', value: stats.lastMonth, color: '#64748b' },
  ];
  const maxP = Math.max(1, ...periods.map((p) => p.value));
  const catEntries = Object.entries(stats.categoryBreakdown).sort((a, b) => b[1] - a[1]);
  const maxC = Math.max(1, ...catEntries.map((e) => e[1]));
  const kindData = [
    { label: '🛡️ Vacib', value: stats.essentialTotal, color: KINDS.essential.color },
    { label: '🔵 Standart', value: stats.standardTotal, color: KINDS.standard.color },
    { label: '🔥 İsraf', value: stats.wastefulTotal, color: KINDS.wasteful.color },
  ];
  const maxK = Math.max(1, ...kindData.map((k) => k.value));
  return (
    <Sheet visible={visible} onClose={onClose} title="📊 Statistika">
      <Text style={styles.statH}>Dövrlər</Text>
      {periods.map((p) => <Bar key={p.label} {...p} max={maxP} />)}

      <Text style={styles.statH}>Bu ay — növə görə</Text>
      {kindData.map((k) => <Bar key={k.label} {...k} max={maxK} />)}

      <Text style={styles.statH}>Bu ay — kateqoriya</Text>
      {catEntries.length === 0 ? <Text style={styles.emptyMini}>Bu ay xərc yoxdur</Text> :
        catEntries.map(([name, val]) => <Bar key={name} label={`${catMeta(state, name).icon} ${name}`} value={val} max={maxC} color={catMeta(state, name).color} />)}

      <Text style={styles.statH}>Ən böyük 5 xərc (bu ay)</Text>
      {stats.topExpenses.length === 0 ? <Text style={styles.emptyMini}>—</Text> :
        stats.topExpenses.map((t, i) => (
          <View key={t.id} style={styles.topRow}>
            <Text style={styles.topRank}>{i + 1}</Text>
            <Text style={{ flex: 1, color: '#E2E8F0' }} numberOfLines={1}>{catMeta(state, t.category).icon} {t.category}{t.subCategory ? ' · ' + t.subCategory : ''}</Text>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{CURRENCY}{money(t.amount)}</Text>
          </View>
        ))}
      <View style={{ height: 10 }} />
    </Sheet>
  );
}

// ==================== SETTINGS ====================
function SettingsSheet({ visible, state, onClose, onSetCash, onReset }) {
  const [cash, setCash] = useState('');
  function apply() {
    const amt = parseAmount(cash);
    onSetCash(amt);
    setCash('');
    Alert.alert('Tamam', `Əlində nağd ${CURRENCY}${money(amt)} olaraq təyin edildi.`);
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="⚙️ Tənzimləmələr">
      <View style={styles.formCard}>
        <Text style={styles.fieldLabel}>Əlində Nağd (düzəliş)</Text>
        <Text style={styles.settingHint}>Hazırkı: {CURRENCY}{money(currentCash(state))}. Real nağdını yaz, sistem başlanğıcı buna görə tənzimləyəcək.</Text>
        <TextInput style={styles.input2} placeholder="məs. 500" placeholderTextColor="#475569" keyboardType="decimal-pad" value={cash} onChangeText={setCash} />
        <TouchableOpacity style={styles.saveBtn} onPress={apply}><Text style={styles.saveBtnText}>Təyin et</Text></TouchableOpacity>
      </View>
      <View style={[styles.formCard, { borderColor: '#7f1d1d' }]}>
        <Text style={styles.fieldLabel}>Təhlükəli</Text>
        <Text style={styles.settingHint}>Bütün xərc, gəlir, borc və planları silər.</Text>
        <TouchableOpacity style={styles.dangerBtn} onPress={() => Alert.alert('Hər şeyi sıfırla?', 'Bu geri alına bilməz.', [{ text: 'İmtina', style: 'cancel' }, { text: 'Sıfırla', style: 'destructive', onPress: onReset }])}>
          <Text style={styles.dangerBtnText}>Hər şeyi sıfırla</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B1220' },
  center: { alignItems: 'center', justifyContent: 'center' },

  card: { width: '100%', maxWidth: 420, backgroundColor: '#111A2E', borderRadius: 24, padding: 28, borderWidth: 1, borderColor: '#1E293B' },
  logo: { fontSize: 56, textAlign: 'center' },
  title: { fontSize: 30, fontWeight: '900', color: '#fff', textAlign: 'center', marginTop: 8, letterSpacing: 2 },
  subtitle: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 6, marginBottom: 22 },
  input: { backgroundColor: '#1E293B', color: '#fff', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, fontSize: 16, marginTop: 12 },
  primaryBtn: { backgroundColor: '#0EA5E9', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  err: { color: '#F87171', marginTop: 12, textAlign: 'center' },
  hint: { color: '#64748B', fontSize: 12, textAlign: 'center', marginTop: 16 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 },
  hello: { color: '#94A3B8', fontSize: 14 },
  username: { color: '#fff', fontSize: 20, fontWeight: '700' },
  iconBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center' },
  iconBtnTxt: { fontSize: 18 },

  hero: { margin: 20, marginBottom: 10, backgroundColor: '#0EA5E9', borderRadius: 26, padding: 22 },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  heroAmount: { color: '#fff', fontSize: 42, fontWeight: '900', marginTop: 4 },
  heroRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  heroChip: { flex: 1, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, padding: 12 },
  heroChipLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11 },
  heroChipValue: { color: '#fff', fontSize: 17, fontWeight: '800', marginTop: 2 },

  alert: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 8, padding: 12, borderRadius: 14, borderWidth: 1 },
  alertDebt: { backgroundColor: '#3a1212', borderColor: '#7f1d1d' },
  alertIncome: { backgroundColor: '#0e2a1a', borderColor: '#14532d' },
  alertIcon: { fontSize: 18 },
  alertText: { color: '#E2E8F0', fontSize: 13, flex: 1 },

  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 12, marginTop: 4 },
  metric: { width: '46%', flexGrow: 1, backgroundColor: '#111A2E', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#1E293B' },
  metricLabel: { color: '#94A3B8', fontSize: 12 },
  metricValue: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 4 },
  metricSub: { color: '#64748B', fontSize: 11, marginTop: 3 },

  warning: { marginHorizontal: 20, marginTop: 12, backgroundColor: '#3a1212', borderColor: '#7f1d1d', borderWidth: 1, borderRadius: 14, padding: 12 },
  warningText: { color: '#fecaca', fontSize: 13 },

  quickRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 18, gap: 10 },
  quick: { flex: 1, backgroundColor: '#111A2E', borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#1E293B' },
  quickIcon: { fontSize: 22 },
  quickLabel: { color: '#94A3B8', fontSize: 11, marginTop: 5, fontWeight: '600' },

  listTitle: { color: '#94A3B8', fontSize: 13, fontWeight: '700', marginTop: 22, marginBottom: 4, marginHorizontal: 20, textTransform: 'uppercase', letterSpacing: 1 },
  secHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  secDate: { color: '#E2E8F0', fontSize: 15, fontWeight: '700' },
  secTotal: { color: '#64748B', fontSize: 14, fontWeight: '600' },

  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111A2E', marginHorizontal: 16, marginVertical: 4, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#1E293B' },
  rowIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  kindBadge: { fontSize: 11, fontWeight: '700' },
  rowNote: { color: '#94A3B8', fontSize: 12, flex: 1 },
  rowAmount: { color: '#fff', fontSize: 16, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 30, paddingHorizontal: 30 },
  emptyIcon: { fontSize: 46 },
  emptyText: { color: '#E2E8F0', fontSize: 17, fontWeight: '700', marginTop: 10 },
  emptySub: { color: '#64748B', fontSize: 13, marginTop: 6, textAlign: 'center' },
  emptyMini: { color: '#64748B', fontSize: 13, textAlign: 'center', paddingVertical: 16 },

  fab: { position: 'absolute', right: 22, bottom: 32, width: 62, height: 62, borderRadius: 31, backgroundColor: '#0EA5E9', alignItems: 'center', justifyContent: 'center', shadowColor: '#0EA5E9', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  fabPlus: { color: '#fff', fontSize: 34, fontWeight: '300', marginTop: -2 },

  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: '#0F172A', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 28, maxHeight: '90%', borderTopWidth: 1, borderColor: '#1E293B' },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#334155', marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  sheetClose: { color: '#94A3B8', fontSize: 20, fontWeight: '700' },

  amountBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111A2E', borderRadius: 18, paddingVertical: 16, borderWidth: 1, borderColor: '#1E293B' },
  amountCur: { color: '#0EA5E9', fontSize: 28, fontWeight: '700', marginRight: 6 },
  amountInput: { color: '#fff', fontSize: 38, fontWeight: '800', minWidth: 120, textAlign: 'center', padding: 0 },

  fieldLabel: { color: '#94A3B8', fontSize: 13, fontWeight: '700', marginTop: 18, marginBottom: 10 },
  chipRow: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#111A2E', borderWidth: 1.5, borderColor: '#1E293B', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 13 },
  chipLabel: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  subChip: { backgroundColor: '#111A2E', borderWidth: 1, borderColor: '#1E293B', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 13 },
  subChipLabel: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },

  kindRow: { flexDirection: 'row', gap: 8 },
  kindBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, backgroundColor: '#111A2E', borderWidth: 1.5, borderColor: '#1E293B', borderRadius: 14, paddingVertical: 12 },
  kindLabel: { color: '#94A3B8', fontSize: 13, fontWeight: '700' },

  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#111A2E', borderRadius: 14, padding: 8, borderWidth: 1, borderColor: '#1E293B' },
  dateArrow: { width: 46, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E293B' },
  dateArrowText: { color: '#E2E8F0', fontSize: 16 },
  dateValue: { color: '#fff', fontSize: 16, fontWeight: '700' },

  noteInput: { backgroundColor: '#111A2E', color: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, fontSize: 16, borderWidth: 1, borderColor: '#1E293B' },
  input2: { backgroundColor: '#0B1220', color: '#fff', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, fontSize: 16, borderWidth: 1, borderColor: '#1E293B', marginBottom: 10 },
  formCard: { backgroundColor: '#111A2E', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#1E293B', marginBottom: 16 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, marginBottom: 6 },
  switchLabel: { color: '#E2E8F0', fontSize: 15, fontWeight: '600' },

  saveBtn: { backgroundColor: '#0EA5E9', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  listItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111A2E', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#1E293B' },
  liTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  liSub: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  liAmount: { color: '#fff', fontSize: 15, fontWeight: '700' },
  miniBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  del: { fontSize: 16 },

  statH: { color: '#0EA5E9', fontSize: 14, fontWeight: '800', marginTop: 18, marginBottom: 12 },
  barLabel: { color: '#E2E8F0', fontSize: 13, fontWeight: '600' },
  barValue: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  barTrack: { height: 10, borderRadius: 6, backgroundColor: '#1E293B', overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  topRank: { color: '#64748B', fontSize: 14, fontWeight: '800', width: 18 },

  settingHint: { color: '#64748B', fontSize: 12, marginBottom: 10, lineHeight: 17 },
  dangerBtn: { backgroundColor: '#7f1d1d', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  dangerBtnText: { color: '#fecaca', fontSize: 15, fontWeight: '800' },
});
