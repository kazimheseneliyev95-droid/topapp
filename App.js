import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// iOS sistem renkleri — topa her dokununca bunlardan biri seçilir
const COLORS = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#00C7BE', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55',
];
const BALL = 92; // topun çapı (px)

export default function App() {
  const [user, setUser] = useState(null);

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }
  return <BallScreen user={user} onLogout={() => setUser(null)} />;
}

// ---------------- LOGIN EKRANI ----------------
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleLogin() {
    if (!username.trim() || !password.trim()) {
      setError('Kullanıcı adı ve şifre boş olamaz');
      return;
    }
    setError('');
    onLogin(username.trim());
  }

  return (
    <KeyboardAvoidingView
      style={styles.loginRoot}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <View style={styles.loginCard}>
        <Text style={styles.logo}>⚽</Text>
        <Text style={styles.title}>Top Oyunu</Text>
        <Text style={styles.subtitle}>Devam etmek için giriş yap</Text>

        <TextInput
          style={styles.input}
          placeholder="Kullanıcı adı"
          placeholderTextColor="#64748B"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          placeholder="Şifre"
          placeholderTextColor="#64748B"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.button} onPress={handleLogin} activeOpacity={0.85}>
          <Text style={styles.buttonText}>Giriş Yap</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>Test için herhangi bir kullanıcı adı/şifre yazabilirsin</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------- TOP EKRANI ----------------
function BallScreen({ user, onLogout }) {
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const placed = useRef(false);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [taps, setTaps] = useState(0);
  const [color, setColor] = useState(COLORS[0]);

  function onAreaLayout(e) {
    const { width, height } = e.nativeEvent.layout;
    setArea({ width, height });
    if (!placed.current && width > 0 && height > 0) {
      placed.current = true;
      // topu oyun alanının ortasına yerleştir
      pan.setValue({ x: (width - BALL) / 2, y: (height - BALL) / 2 });
    }
  }

  function moveBall() {
    const maxX = Math.max(0, area.width - BALL);
    const maxY = Math.max(0, area.height - BALL);
    const x = Math.random() * maxX;
    const y = Math.random() * maxY;

    // küçük "zıplama" efekti
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.82, duration: 90, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();

    // yeni konuma yumuşak geçiş
    Animated.spring(pan, {
      toValue: { x, y },
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();

    setTaps((t) => t + 1);
    setColor((c) => {
      let next = c;
      while (next === c) next = COLORS[Math.floor(Math.random() * COLORS.length)];
      return next;
    });
  }

  return (
    <View style={styles.ballRoot}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Hoş geldin 👋</Text>
          <Text style={styles.username}>{user}</Text>
        </View>
        <TouchableOpacity style={styles.logout} onPress={onLogout}>
          <Text style={styles.logoutText}>Çıkış</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>Dokunma sayısı: {taps}</Text>
      </View>

      <View style={styles.playArea} onLayout={onAreaLayout}>
        {area.width > 0 && (
          <Animated.View
            style={[
              styles.ballWrap,
              { transform: [...pan.getTranslateTransform(), { scale }] },
            ]}
          >
            <Pressable onPress={moveBall} hitSlop={12}>
              <View style={[styles.ball, { backgroundColor: color }]}>
                <Text style={styles.ballText}>{taps}</Text>
              </View>
            </Pressable>
          </Animated.View>
        )}
      </View>

      <Text style={styles.footer}>Topa dokun, zıplasın! 🎯</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Login
  loginRoot: {
    flex: 1,
    backgroundColor: '#0B1220',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loginCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#111A2E',
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  logo: { fontSize: 56, textAlign: 'center' },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 22,
  },
  input: {
    backgroundColor: '#1E293B',
    color: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    marginTop: 12,
  },
  button: {
    backgroundColor: '#0EA5E9',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  error: { color: '#F87171', marginTop: 12, textAlign: 'center' },
  hint: { color: '#64748B', fontSize: 12, textAlign: 'center', marginTop: 16 },

  // Ball screen
  ballRoot: { flex: 1, backgroundColor: '#0B1220' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  hello: { color: '#94A3B8', fontSize: 14 },
  username: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  logout: {
    backgroundColor: '#1E293B',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  logoutText: { color: '#F87171', fontWeight: '600' },
  statsBar: { paddingHorizontal: 20, paddingVertical: 10 },
  statsText: { color: '#E2E8F0', fontSize: 16, fontWeight: '600' },
  playArea: {
    flex: 1,
    margin: 16,
    borderRadius: 24,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    overflow: 'hidden',
  },
  ballWrap: { position: 'absolute', top: 0, left: 0 },
  ball: {
    width: BALL,
    height: BALL,
    borderRadius: BALL / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  ballText: { color: 'rgba(255,255,255,0.9)', fontSize: 28, fontWeight: '800' },
  footer: { color: '#64748B', textAlign: 'center', paddingBottom: 28, paddingTop: 4 },
});
