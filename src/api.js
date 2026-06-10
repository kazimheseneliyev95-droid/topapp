// XERCLEM — online backend client (VDS).
// Tətbiq artıq lokal AsyncStorage-da DEYİL, serverdə (Postgres) saxlanır.
// Yalnız JWT token lokal saxlanılır (sessiyanı qorumaq üçün).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeState } from './finance';

export const API_BASE = 'https://xerclem.80-240-17-26.sslip.io';
const TOKEN_KEY = 'xerclem_token';
const CREDS_KEY = 'xerclem_creds'; // ilk daxil olunan user/parol — auto-fill üçün
const STATE_CACHE_KEY = 'xerclem_state_cache'; // lokal təhlükəsizlik backup-ı (server əsasdır)

let _token = null;
let _prev = null; // serverlə son sinxron state (silinənləri tapmaq üçün)

export async function getToken() {
  if (_token) return _token;
  try { _token = await AsyncStorage.getItem(TOKEN_KEY); } catch (e) {}
  return _token;
}
export async function setToken(t) {
  _token = t || null;
  try {
    if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
    else await AsyncStorage.removeItem(TOKEN_KEY);
  } catch (e) {}
}

// İlk daxil olunan user/parolu yadda saxla → növbəti dəfə login avtomatik dolsun.
export async function loadCreds() {
  try { const raw = await AsyncStorage.getItem(CREDS_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
async function saveCreds(email) {
  // Yalnız email saxlanır — parol heç vaxt cihazda saxlanmır (təhlükəsizlik).
  try { await AsyncStorage.setItem(CREDS_KEY, JSON.stringify({ email })); } catch (e) {}
}

// --- Lokal təhlükəsizlik backup-ı (server ƏSAS mənbədir; bu yalnız save uğursuz
// olanda data itməsin deyə saxlanan ehtiyat nüsxədir) ---
export async function cacheState(state) {
  try { await AsyncStorage.setItem(STATE_CACHE_KEY, JSON.stringify(state)); } catch (e) {}
}
async function loadCachedState() {
  try { const raw = await AsyncStorage.getItem(STATE_CACHE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
const ARR_KINDS = ['transactions', 'incomes', 'debts', 'futureExpenses'];
// Lokal (cache) + server-i birləşdir: server qalibdir (scalar + eyni id), serverdə
// OLMAYAN lokal elementlər (serverə çatmamış əlavələr) qorunur.
function mergeStates(local, server) {
  const merged = { ...local, ...server };
  for (const k of ARR_KINDS) {
    const sArr = Array.isArray(server[k]) ? server[k] : [];
    const lArr = Array.isArray(local[k]) ? local[k] : [];
    const sIds = new Set(sArr.map((x) => x && x.id).filter(Boolean));
    merged[k] = [...sArr, ...lArr.filter((x) => x && x.id && !sIds.has(x.id))];
  }
  merged.categories = { ...(local.categories || {}), ...(server.categories || {}) };
  return merged;
}

async function apiFetch(path, opts = {}) {
  const token = await getToken();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000); // 15san timeout — asılı qalmasın
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    const isAbort = e && e.name === 'AbortError';
    const err = new Error(isAbort ? 'Server vaxtında cavab vermədi (timeout)' : 'Şəbəkə xətası — internet/server əlçatan deyil');
    err.code = isAbort ? 'timeout' : 'network';
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) {
    await setToken(null);
    const e = new Error('Sessiya bitib — yenidən daxil ol');
    e.code = 401;
    throw e;
  }
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const e = new Error((data && data.error) || ('Server xətası (' + res.status + ')'));
    e.code = res.status;
    throw e;
  }
  return data || {};
}

export async function signin(email, password) {
  const d = await apiFetch('/api/auth/signin', { method: 'POST', body: { email, password } });
  await setToken(d.token);
  await saveCreds(email);
  return d.user;
}
export async function signup(email, password) {
  const d = await apiFetch('/api/auth/signup', { method: 'POST', body: { email, password } });
  await setToken(d.token);
  await saveCreds(email);
  return d.user;
}

// Serverdən tam state-i çək + lokal backup ilə birləşdir (serverə çatmamış əlavələr
// itməsin). Server əsasdır; lokal-only elementlər varsa serverə geri itələnir.
export async function loadOnline() {
  const d = await apiFetch('/api/state');
  const server = normalizeState(d.state || {});
  const local = await loadCachedState();
  let merged = server;
  if (local) merged = normalizeState(mergeStates(local, server));
  _prev = server; // delete-diff serverin vəziyyətinə görə hesablanır
  await cacheState(merged);
  // lokal-only (serverdə olmayan) element varsa → serverə sinxronla (itki olmasın)
  const hasLocalOnly = ARR_KINDS.some((k) => (merged[k] || []).length > (server[k] || []).length);
  if (hasLocalOnly) { try { await saveOnline(merged); } catch (e) {} }
  return merged;
}

// State-i serverə yaz. ƏVVƏL lokal backup (şəbəkə uğursuz olsa belə data qalsın),
// sonra silinənləri /api/state/delete + qalanını merge-PUT ilə göndər.
export async function saveOnline(state) {
  await cacheState(state); // lokal ehtiyat — şəbəkə uğursuz olsa belə itməsin
  if (_prev) {
    for (const k of ARR_KINDS) {
      const nowIds = new Set((state[k] || []).map((x) => x && x.id).filter(Boolean));
      const removed = (_prev[k] || []).map((x) => x && x.id).filter((id) => id && !nowIds.has(id));
      if (removed.length) {
        await apiFetch('/api/state/delete', { method: 'POST', body: { kind: k, ids: removed } });
      }
    }
  }
  await apiFetch('/api/state', { method: 'PUT', body: { state } });
  _prev = state;
}
