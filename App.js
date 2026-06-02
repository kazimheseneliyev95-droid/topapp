import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---- Ayarlar ----
const CURRENCY = '₼'; // para birimi (kolayca degistirilebilir: ₺ $ € vb.)
const EXPENSES_KEY = 'harcamalar_v1';
const USER_KEY = 'kullanici_v1';

const CATEGORIES = [
  { key: 'yemek', label: 'Yemek', icon: '🍔', color: '#FF9500' },
  { key: 'market', label: 'Market', icon: '🛒', color: '#34C759' },
  { key: 'ulasim', label: 'Ulaşım', icon: '🚗', color: '#007AFF' },
  { key: 'fatura', label: 'Fatura', icon: '🧾', color: '#FF3B30' },
  { key: 'eglence', label: 'Eğlence', icon: '🎮', color: '#AF52DE' },
  { key: 'saglik', label: 'Sağlık', icon: '💊', color: '#00C7BE' },
  { key: 'alisveris', label: 'Alışveriş', icon: '🛍️', color: '#FF2D55' },
  { key: 'diger', label: 'Diğer', icon: '📦', color: '#8E8E93' },
];
const catOf = (k) => CATEGORIES.find((c) => c.key === k) || CATEGORIES[CATEGORIES.length - 1];

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// ---- Tarih yardimcilari ----
function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function todayYmd() { return ymd(new Date()); }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function dateLabel(s) {
  const t = todayYmd();
  const y = ymd(addDays(new Date(), -1));
  if (s === t) return 'Bugün';
  if (s === y) return 'Dün';
  const d = parseYmd(s);
  return `${d.getDate()} ${MONTHS_TR[d.getMonth()]} ${d.getFullYear()}`;
}
// Turkce para formati: 1.234,56
function money(n) {
  const fixed = Math.abs(n).toFixed(2);
  const [int, dec] = fixed.split('.');
  const sep = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sep},${dec}`;
}
function parseAmount(s) {
  const n = parseFloat(String(s).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [expenses, setExpenses] = useState([]);

  // Ilk acilista kayitli kullanici + harcamalari yukle
  useEffect(() => {
    (async () => {
      try {
        const [u, e] = await Promise.all([
          AsyncStorage.getItem(USER_KEY),
          AsyncStorage.getItem(EXPENSES_KEY),
        ]);
        if (u) setUser(u);
        if (e) setExpenses(JSON.parse(e));
      } catch (err) {
        // sessizce gec
      }
      setLoading(false);
    })();
  }, []);

  async function login(name) {
    setUser(name);
    try { await AsyncStorage.setItem(USER_KEY, name); } catch {}
  }
  async function logout() {
    setUser(null);
    try { await AsyncStorage.removeItem(USER_KEY); } catch {}
  }
  async function persist(next) {
    setExpenses(next);
    try { await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify(next)); } catch {}
  }
  function addExpense(e) { persist([e, ...expenses]); }
  function deleteExpense(id) { persist(expenses.filter((x) => x.id !== id)); }

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <StatusBar style="light" />
        <ActivityIndicator color="#0EA5E9" size="large" />
      </View>
    );
  }
  if (!user) return <LoginScreen onLogin={login} />;
  return (
    <HomeScreen
      user={user}
      expenses={expenses}
      onAdd={addExpense}
      onDelete={deleteExpense}
      onLogout={logout}
    />
  );
}

// ---------------- LOGIN ----------------
function LoginScreen({ onLogin }) {
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');

  function submit() {
    if (!name.trim() || !pass.trim()) { setErr('Ad ve şifre boş olamaz'); return; }
    setErr('');
    onLogin(name.trim());
  }

  return (
    <KeyboardAvoidingView style={[styles.root, styles.center, { padding: 24 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <View style={styles.card}>
        <Text style={styles.logo}>💰</Text>
        <Text style={styles.title}>Harcamalarım</Text>
        <Text style={styles.subtitle}>Giriş yap ve harcamalarını takip et</Text>

        <TextInput style={styles.input} placeholder="Kullanıcı adı" placeholderTextColor="#64748B"
          autoCapitalize="none" autoCorrect={false} value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Şifre" placeholderTextColor="#64748B"
          secureTextEntry value={pass} onChangeText={setPass} />

        {err ? <Text style={styles.err}>{err}</Text> : null}

        <TouchableOpacity style={styles.primaryBtn} onPress={submit} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Giriş Yap</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>Test için herhangi bir ad/şifre yazabilirsin</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------- ANA EKRAN ----------------
function HomeScreen({ user, expenses, onAdd, onDelete, onLogout }) {
  const [modal, setModal] = useState(false);

  const sections = useMemo(() => {
    const byDate = {};
    for (const e of expenses) (byDate[e.date] = byDate[e.date] || []).push(e);
    return Object.keys(byDate).sort((a, b) => b.localeCompare(a)).map((date) => {
      const data = byDate[date].slice().sort((a, b) => b.createdAt - a.createdAt);
      const total = data.reduce((s, x) => s + x.amount, 0);
      return { date, total, data };
    });
  }, [expenses]);

  const today = todayYmd();
  const monthPrefix = today.slice(0, 7);
  const monthTotal = expenses.filter((e) => e.date.startsWith(monthPrefix)).reduce((s, e) => s + e.amount, 0);
  const todayTotal = expenses.filter((e) => e.date === today).reduce((s, e) => s + e.amount, 0);

  function confirmDelete(item) {
    const c = catOf(item.category);
    Alert.alert('Harcamayı sil?', `${c.label} • ${CURRENCY}${money(item.amount)}`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => onDelete(item.id) },
    ]);
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListHeaderComponent={
          <View>
            <View style={styles.topBar}>
              <View>
                <Text style={styles.hello}>Merhaba 👋</Text>
                <Text style={styles.username}>{user}</Text>
              </View>
              <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
                <Text style={styles.logoutText}>Çıkış</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.summary}>
              <Text style={styles.summaryLabel}>Bu Ay Toplam Harcama</Text>
              <Text style={styles.summaryAmount}>{CURRENCY}{money(monthTotal)}</Text>
              <View style={styles.statRow}>
                <View style={styles.statChip}>
                  <Text style={styles.statChipLabel}>Bugün</Text>
                  <Text style={styles.statChipValue}>{CURRENCY}{money(todayTotal)}</Text>
                </View>
                <View style={styles.statChip}>
                  <Text style={styles.statChipLabel}>İşlem</Text>
                  <Text style={styles.statChipValue}>{expenses.length}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.listTitle}>Geçmiş</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionDate}>{dateLabel(section.date)}</Text>
            <Text style={styles.sectionTotal}>{CURRENCY}{money(section.total)}</Text>
          </View>
        )}
        renderItem={({ item }) => <ExpenseRow item={item} onLongPress={() => confirmDelete(item)} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🧾</Text>
            <Text style={styles.emptyText}>Henüz harcama yok</Text>
            <Text style={styles.emptySub}>Sağ alttaki + ile ilk harcamanı ekle</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModal(true)} activeOpacity={0.85}>
        <Text style={styles.fabPlus}>＋</Text>
      </TouchableOpacity>

      <AddModal visible={modal} onClose={() => setModal(false)} onSave={onAdd} />
    </View>
  );
}

function ExpenseRow({ item, onLongPress }) {
  const c = catOf(item.category);
  return (
    <TouchableOpacity style={styles.row} onLongPress={onLongPress} delayLongPress={280} activeOpacity={0.7}>
      <View style={[styles.rowIcon, { backgroundColor: c.color + '22' }]}>
        <Text style={{ fontSize: 20 }}>{c.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{c.label}</Text>
        {item.note ? <Text style={styles.rowNote} numberOfLines={1}>{item.note}</Text> : null}
      </View>
      <Text style={styles.rowAmount}>{CURRENCY}{money(item.amount)}</Text>
    </TouchableOpacity>
  );
}

// ---------------- HARCAMA EKLE ----------------
function AddModal({ visible, onClose, onSave }) {
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState('yemek');
  const [date, setDate] = useState(new Date());
  const [note, setNote] = useState('');

  function reset() { setAmount(''); setCat('yemek'); setDate(new Date()); setNote(''); }
  function close() { reset(); onClose(); }
  function save() {
    const amt = parseAmount(amount);
    if (amt <= 0) { Alert.alert('Geçersiz tutar', 'Lütfen 0’dan büyük bir tutar gir.'); return; }
    onSave({
      id: String(Date.now()) + Math.random().toString(36).slice(2, 7),
      amount: amt,
      category: cat,
      note: note.trim(),
      date: ymd(date),
      createdAt: Date.now(),
    });
    reset();
    onClose();
  }

  const canForward = ymd(date) < todayYmd();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Yeni Harcama</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Tutar */}
            <View style={styles.amountBox}>
              <Text style={styles.amountCurrency}>{CURRENCY}</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0,00"
                placeholderTextColor="#475569"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                autoFocus
              />
            </View>

            {/* Kategori */}
            <Text style={styles.fieldLabel}>Kategori</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 2, paddingRight: 8 }}>
              {CATEGORIES.map((c) => {
                const active = cat === c.key;
                return (
                  <TouchableOpacity key={c.key} onPress={() => setCat(c.key)} activeOpacity={0.8}
                    style={[styles.chip, active && { borderColor: c.color, backgroundColor: c.color + '22' }]}>
                    <Text style={{ fontSize: 18 }}>{c.icon}</Text>
                    <Text style={[styles.chipLabel, active && { color: '#fff' }]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Tarih */}
            <Text style={styles.fieldLabel}>Tarih</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity style={styles.dateArrow} onPress={() => setDate((d) => addDays(d, -1))}>
                <Text style={styles.dateArrowText}>◀</Text>
              </TouchableOpacity>
              <Text style={styles.dateValue}>{dateLabel(ymd(date))}</Text>
              <TouchableOpacity style={[styles.dateArrow, !canForward && { opacity: 0.3 }]}
                disabled={!canForward} onPress={() => setDate((d) => addDays(d, 1))}>
                <Text style={styles.dateArrowText}>▶</Text>
              </TouchableOpacity>
            </View>

            {/* Not */}
            <Text style={styles.fieldLabel}>Not (isteğe bağlı)</Text>
            <TextInput style={styles.noteInput} placeholder="örn. öğle yemeği"
              placeholderTextColor="#475569" value={note} onChangeText={setNote} />
          </ScrollView>

          <View style={styles.sheetBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={close}>
              <Text style={styles.cancelBtnText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={save} activeOpacity={0.85}>
              <Text style={styles.saveBtnText}>Kaydet</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B1220' },
  center: { alignItems: 'center', justifyContent: 'center' },

  // Login
  card: { width: '100%', maxWidth: 420, backgroundColor: '#111A2E', borderRadius: 24, padding: 28, borderWidth: 1, borderColor: '#1E293B' },
  logo: { fontSize: 56, textAlign: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', textAlign: 'center', marginTop: 8 },
  subtitle: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 6, marginBottom: 22 },
  input: { backgroundColor: '#1E293B', color: '#fff', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, fontSize: 16, marginTop: 12 },
  primaryBtn: { backgroundColor: '#0EA5E9', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  err: { color: '#F87171', marginTop: 12, textAlign: 'center' },
  hint: { color: '#64748B', fontSize: 12, textAlign: 'center', marginTop: 16 },

  // Top bar
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 },
  hello: { color: '#94A3B8', fontSize: 14 },
  username: { color: '#fff', fontSize: 20, fontWeight: '700' },
  logoutBtn: { backgroundColor: '#1E293B', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10 },
  logoutText: { color: '#F87171', fontWeight: '600' },

  // Summary
  summary: { margin: 20, marginBottom: 8, backgroundColor: '#0EA5E9', borderRadius: 24, padding: 22 },
  summaryLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  summaryAmount: { color: '#fff', fontSize: 40, fontWeight: '800', marginTop: 6 },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  statChip: { flex: 1, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, padding: 12 },
  statChipLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  statChipValue: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 2 },

  listTitle: { color: '#94A3B8', fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 4, marginHorizontal: 20, textTransform: 'uppercase', letterSpacing: 1 },

  // Section
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 },
  sectionDate: { color: '#E2E8F0', fontSize: 15, fontWeight: '700' },
  sectionTotal: { color: '#64748B', fontSize: 14, fontWeight: '600' },

  // Row
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111A2E', marginHorizontal: 16, marginVertical: 4, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#1E293B' },
  rowIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  rowNote: { color: '#94A3B8', fontSize: 13, marginTop: 2 },
  rowAmount: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Empty
  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 30 },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: '#E2E8F0', fontSize: 18, fontWeight: '700', marginTop: 12 },
  emptySub: { color: '#64748B', fontSize: 14, marginTop: 6, textAlign: 'center' },

  // FAB
  fab: { position: 'absolute', right: 22, bottom: 36, width: 62, height: 62, borderRadius: 31, backgroundColor: '#0EA5E9', alignItems: 'center', justifyContent: 'center', shadowColor: '#0EA5E9', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  fabPlus: { color: '#fff', fontSize: 34, fontWeight: '300', marginTop: -2 },

  // Modal / sheet
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: '#0F172A', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 28, maxHeight: '88%', borderTopWidth: 1, borderColor: '#1E293B' },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#334155', marginBottom: 14 },
  sheetTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 16 },

  amountBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111A2E', borderRadius: 18, paddingVertical: 18, borderWidth: 1, borderColor: '#1E293B' },
  amountCurrency: { color: '#0EA5E9', fontSize: 30, fontWeight: '700', marginRight: 6 },
  amountInput: { color: '#fff', fontSize: 40, fontWeight: '800', minWidth: 120, textAlign: 'center', padding: 0 },

  fieldLabel: { color: '#94A3B8', fontSize: 13, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#111A2E', borderWidth: 1.5, borderColor: '#1E293B', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  chipLabel: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },

  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#111A2E', borderRadius: 14, padding: 8, borderWidth: 1, borderColor: '#1E293B' },
  dateArrow: { width: 44, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E293B' },
  dateArrowText: { color: '#E2E8F0', fontSize: 16 },
  dateValue: { color: '#fff', fontSize: 16, fontWeight: '700' },

  noteInput: { backgroundColor: '#111A2E', color: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, fontSize: 16, borderWidth: 1, borderColor: '#1E293B' },

  sheetBtns: { flexDirection: 'row', gap: 12, marginTop: 18 },
  cancelBtn: { flex: 1, backgroundColor: '#1E293B', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  cancelBtnText: { color: '#E2E8F0', fontSize: 16, fontWeight: '700' },
  saveBtn: { flex: 2, backgroundColor: '#0EA5E9', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
