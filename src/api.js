// XERCLEM — online backend client (VDS).
// Tətbiq artıq lokal AsyncStorage-da DEYİL, serverdə (Postgres) saxlanır.
// Yalnız JWT token lokal saxlanılır (sessiyanı qorumaq üçün).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeState } from './finance';

export const API_BASE = 'https://xerclem.80-240-17-26.sslip.io';
const TOKEN_KEY = 'xerclem_token';
const CREDS_KEY = 'xerclem_creds'; // ilk daxil olunan user/parol — auto-fill üçün

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

async function apiFetch(path, opts = {}) {
  const token = await getToken();
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    const err = new Error('Şəbəkə xətası — internet və ya server əlçatan deyil');
    err.code = 'network';
    throw err;
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

// Serverdən tam state-i çək (boşdursa normalize → emptyState forması)
export async function loadOnline() {
  const d = await apiFetch('/api/state');
  const s = normalizeState(d.state || {});
  _prev = s;
  return s;
}

const ARR_KINDS = ['transactions', 'incomes', 'debts', 'futureExpenses'];
// State-i serverə yaz. Backend PUT = MERGE (id-ə görə) olduğu üçün silinənləri
// ayrıca /api/state/delete ilə göndəririk (yoxsa silinmiş qeyd serverdə qalır).
export async function saveOnline(state) {
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
