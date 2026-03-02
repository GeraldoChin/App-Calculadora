import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  StatusBar,
  Dimensions,
  ScrollView,
  Modal,
  Animated,
  Clipboard,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');
const GAP = 7;
const BTN = (width - 40 - GAP * 3) / 4;

// ─── CORES DE ACENTO ────────────────────────────────────────────────────────
const ACCENTS = {
  laranja: '#F5A623',
  azul:    '#3B82F6',
  verde:   '#22C55E',
  roxo:    '#A855F7',
  rosa:    '#EC4899',
  vermelho:'#EF4444',
};

// ─── FÁBRICA DE TEMAS ────────────────────────────────────────────────────────
const makeTheme = (mode, accentKey) => {
  const accent = ACCENTS[accentKey] || ACCENTS.laranja;
  const accentActive = accent + 'CC';
  if (mode === 'dark') return {
    bg: '#1C2333', exprColor: 'rgba(255,255,255,0.35)', resultColor: '#FFFFFF',
    numBg: '#2A3650', numColor: '#FFFFFF',
    spBg: '#37445E', spColor: '#C8D0E0',
    opBg: accent, opBgActive: accentActive, opColor: '#FFFFFF',
    icon: '#C8D0E0', shadow: '#000000',
    histBg: '#151E2E', histItem: '#1F2D45',
    histText: '#FFFFFF', histSub: 'rgba(255,255,255,0.4)',
    divider: 'rgba(255,255,255,0.07)', memColor: accent, statusBar: 'light-content',
    accentKey, accent,
  };
  return {
    bg: '#ECEEF7', exprColor: 'rgba(28,35,51,0.38)', resultColor: '#1C2333',
    numBg: '#FFFFFF', numColor: '#1C2333',
    spBg: '#D8DCF0', spColor: '#3A4A6B',
    opBg: accent, opBgActive: accentActive, opColor: '#FFFFFF',
    icon: '#3A4A6B', shadow: '#9AA4C0',
    histBg: '#DDE0EF', histItem: '#FFFFFF',
    histText: '#1C2333', histSub: 'rgba(28,35,51,0.45)',
    divider: 'rgba(0,0,0,0.07)', memColor: accent, statusBar: 'dark-content',
    accentKey, accent,
  };
};

// ─── CONVERSOR DE UNIDADES ───────────────────────────────────────────────────
const CONVERTERS = {
  'Comprimento': {
    units: ['km', 'mi', 'm', 'ft', 'cm', 'in'],
    toBase: { km: 1000, mi: 1609.344, m: 1, ft: 0.3048, cm: 0.01, in: 0.0254 },
  },
  'Peso': {
    units: ['kg', 'lb', 'g', 'oz'],
    toBase: { kg: 1, lb: 0.453592, g: 0.001, oz: 0.028349 },
  },
  'Temperatura': {
    units: ['°C', '°F', 'K'],
    toBase: null, // tratamento especial
  },
  'Velocidade': {
    units: ['km/h', 'mph', 'm/s'],
    toBase: { 'km/h': 1/3.6, mph: 0.44704, 'm/s': 1 },
  },
};

const convertTemp = (val, from, to) => {
  let celsius;
  if (from === '°C') celsius = val;
  else if (from === '°F') celsius = (val - 32) * 5/9;
  else celsius = val - 273.15;
  if (to === '°C') return celsius;
  if (to === '°F') return celsius * 9/5 + 32;
  return celsius + 273.15;
};

const convertUnit = (val, from, to, category) => {
  if (category === 'Temperatura') return convertTemp(val, from, to);
  const { toBase } = CONVERTERS[category];
  return (val * toBase[from]) / toBase[to];
};

// ─── UTILS ──────────────────────────────────────────────────────────────────
const fmt = (val) => {
  if (val === 'Erro') return 'Erro';
  const s = String(val);
  const [int, dec] = s.split('.');
  const n = parseInt(int, 10);
  if (isNaN(n)) return s;
  const f = n.toLocaleString('fr-FR').replace(/,/g, ' ');
  return dec !== undefined ? `${f},${dec}` : f;
};

const compute = (a, b, op) => {
  const A = parseFloat(String(a).replace(',', '.'));
  const B = parseFloat(String(b).replace(',', '.'));
  if (isNaN(A) || isNaN(B)) return 'Erro';
  if (op === '+') return A + B;
  if (op === '-') return A - B;
  if (op === '×') return A * B;
  if (op === '÷') return B !== 0 ? A / B : 'DIVZERO';
  return B;
};

const SYM = { '+': '+', '-': '−', '×': '×', '÷': '÷' };
const STORAGE_KEY = '@calc_history';

// ─── BOTÃO CIRCULAR ──────────────────────────────────────────────────────────
function CalcBtn({ onPress, type = 'num', wide = false, active = false, T, children }) {
  const anim = useRef(new Animated.Value(1)).current;
  const isDark = T.statusBar === 'light-content';

  const bg =
    type === 'op' ? (active ? T.opBgActive : T.opBg) :
    type === 'sp' ? T.spBg : T.numBg;

  const onIn  = () => {
    Haptics.impactAsync(
      type === 'op' ? Haptics.ImpactFeedbackStyle.Medium :
      type === 'sp' ? Haptics.ImpactFeedbackStyle.Light :
      Haptics.ImpactFeedbackStyle.Light
    );
    Animated.timing(anim, { toValue: 0.88, duration: 80, useNativeDriver: true }).start();
  };
  const onOut = () =>
    Animated.timing(anim, { toValue: 1, duration: 120, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ transform: [{ scale: anim }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={onIn}
        onPressOut={onOut}
        activeOpacity={1}
        style={{
          width: wide ? BTN * 2 + GAP : BTN,
          height: BTN,
          borderRadius: BTN / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: T.shadow,
          shadowOffset: isDark ? { width: 0, height: 6 } : { width: 4, height: 4 },
          shadowOpacity: isDark ? 0.5 : 0.28,
          shadowRadius: isDark ? 10 : 8,
          elevation: isDark ? 10 : 6,
        }}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── BOTÃO CIENTÍFICO ────────────────────────────────────────────────────────
function SciBtn({ label, onPress, T }) {
  return (
    <TouchableOpacity
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={{
        flex: 1, height: 38, borderRadius: 11, backgroundColor: T.spBg,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: T.shadow, shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2, shadowRadius: 4, elevation: 3,
      }}
    >
      <Text style={{ color: T.spColor, fontSize: 13, fontWeight: '500' }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── APP ────────────────────────────────────────────────────────────────────
export default function Calculator() {
  const [mode,         setMode]         = useState('dark');
  const [accentKey,    setAccentKey]    = useState('laranja');
  const [result,       setResult]       = useState('0');
  const [expression,   setExpression]   = useState('');
  const [currentInput, setCurrentInput] = useState('');
  const [firstOperand, setFirstOperand] = useState('');
  const [operator,     setOperator]     = useState('');
  const [activeOp,     setActiveOp]     = useState('');
  const [waiting,      setWaiting]      = useState(false);
  const [evaluated,    setEvaluated]    = useState(false);
  const [memory,       setMemory]       = useState(null);
  const [showSci,      setShowSci]      = useState(false);
  const [showHistory,  setShowHistory]  = useState(false);
  const [showConverter,setShowConverter]= useState(false);
  const [showTheme,    setShowTheme]    = useState(false);
  const [history,      setHistory]      = useState([]);

  // Conversor
  const [convCategory, setConvCategory] = useState('Comprimento');
  const [convFrom,     setConvFrom]     = useState('km');
  const [convTo,       setConvTo]       = useState('mi');
  const [convInput,    setConvInput]    = useState('');
  const [convResult,   setConvResult]   = useState('');

  const T = makeTheme(mode, accentKey);

  // Animações
  const scaleAnim   = useRef(new Animated.Value(1)).current;
  const flashAnim   = useRef(new Animated.Value(0)).current;   // 0=normal, 1=vermelho
  const slideAnim   = useRef(new Animated.Value(0)).current;   // entrada do resultado

  // ── Carregar histórico do AsyncStorage ──
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(data => {
      if (data) setHistory(JSON.parse(data));
    }).catch(() => {});
  }, []);

  // ── Salvar histórico ──
  const saveHistory = useCallback((newHistory) => {
    setHistory(newHistory);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory)).catch(() => {});
  }, []);

  // ── Animação de bounce no display ──
  const bounce = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.94, duration: 70, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1.04, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();
  };

  // ── Animação de slide do resultado ──
  const slideIn = () => {
    slideAnim.setValue(30);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 120, friction: 8 }).start();
  };

  // ── Flash vermelho ──
  const flashRed = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 80,  useNativeDriver: false }),
      Animated.timing(flashAnim, { toValue: 0, duration: 500, useNativeDriver: false }),
    ]).start();
  };

  const displayBg = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [T.bg, '#EF444420'],
  });

  const getVal = () => currentInput || result.replace(/\s/g, '').replace(',', '.');

  // ── Copiar resultado (toque longo) ──
  const copyResult = () => {
    const val = result.replace(/\s/g, '').replace(',', '.');
    Clipboard.setString(val);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copiado!', `${val} copiado para a área de transferência`);
  };

  // ── Porcentagem inteligente ──
  // Se houver firstOperand e op +/-, aplica % sobre o firstOperand
  const smartPercent = () => {
    const cur = parseFloat(getVal());
    if (isNaN(cur)) return;
    let res;
    if (firstOperand !== '' && (operator === '+' || operator === '-')) {
      const base = parseFloat(firstOperand);
      res = (base * cur) / 100;
    } else {
      res = cur / 100;
    }
    const s = String(parseFloat(res.toFixed(10)));
    setCurrentInput(s);
    setResult(fmt(s));
    if (waiting) setWaiting(false);
  };

  // ── Número ──
  const pressNum = (n) => {
    if (evaluated) {
      setCurrentInput(n); setResult(fmt(n));
      setExpression(''); setEvaluated(false); setActiveOp('');
      return;
    }
    const next = waiting ? n : (currentInput === '' ? n : currentInput + n);
    setCurrentInput(next);
    setResult(fmt(next));
    if (waiting) setWaiting(false);
  };

  const pressComma = () => {
    const cur = currentInput || '0';
    if (cur.includes(',')) return;
    const next = cur + ',';
    setCurrentInput(next); setResult(next);
  };

  // ── Operador ──
  const pressOp = (op) => {
    setActiveOp(op);
    const cur = getVal();
    if (firstOperand !== '' && !waiting && currentInput !== '') {
      const res = String(compute(firstOperand, cur, operator));
      setFirstOperand(res);
      setExpression(`${fmt(res)} ${SYM[op]}`);
      setResult(fmt(res));
      setCurrentInput('');
    } else {
      setFirstOperand(cur);
      setExpression(`${fmt(cur)} ${SYM[op]}`);
    }
    setOperator(op);
    setWaiting(true);
    setEvaluated(false);
  };

  // ── Igual ──
  const pressEqual = () => {
    if (!operator || firstOperand === '') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const second = currentInput !== '' ? currentInput : getVal();
    const expr   = `${fmt(firstOperand)} ${SYM[operator]} ${fmt(second)}`;
    const res    = compute(firstOperand, second, operator);

    if (res === 'DIVZERO') {
      setResult('Erro'); setExpression('Divisão por zero');
      flashRed(); return;
    }

    const resStr = String(res);
    bounce();
    slideIn();
    setExpression(expr);
    setResult(fmt(resStr));
    setCurrentInput(resStr);
    setFirstOperand(''); setOperator(''); setActiveOp('');
    setWaiting(false); setEvaluated(true);

    const newHistory = [{ id: Date.now(), expr, result: fmt(resStr) }, ...history.slice(0, 49)];
    saveHistory(newHistory);
  };

  const pressAC = () => {
    setCurrentInput(''); setFirstOperand(''); setOperator('');
    setActiveOp(''); setWaiting(false); setEvaluated(false);
    setExpression(''); setResult('0');
  };

  const pressPM = () => {
    const v = parseFloat(getVal());
    if (isNaN(v)) return;
    const next = String(-v);
    setCurrentInput(next); setResult(fmt(next));
  };

  const pressBack = () => {
    if (evaluated) { pressAC(); return; }
    if (currentInput.length > 0) {
      const next = currentInput.slice(0, -1);
      setCurrentInput(next);
      setResult(next === '' ? '0' : fmt(next));
    }
  };

  // ── Científico ──
  const pressSci = (fn) => {
    const v = parseFloat(getVal());
    let res;
    switch (fn) {
      case 'sin':  res = Math.sin(v * Math.PI / 180); break;
      case 'cos':  res = Math.cos(v * Math.PI / 180); break;
      case 'tan':  res = Math.tan(v * Math.PI / 180); break;
      case 'sqrt': res = v >= 0 ? Math.sqrt(v) : 'Erro'; break;
      case 'x2':   res = v * v; break;
      case '1/x':  res = v !== 0 ? 1 / v : 'Erro'; break;
      case 'log':  res = v > 0 ? Math.log10(v) : 'Erro'; break;
      case 'ln':   res = v > 0 ? Math.log(v) : 'Erro'; break;
      case 'pi':   res = Math.PI; break;
      case 'abs':  res = Math.abs(v); break;
      default: return;
    }
    const s = typeof res === 'number' ? String(parseFloat(res.toFixed(10))) : res;
    setCurrentInput(s); setResult(fmt(s));
    setExpression(`${fn}(${fmt(String(v))})`);
    setEvaluated(true); bounce(); slideIn();
  };

  // ── Memória ──
  const pressMem = (action) => {
    const v = parseFloat(getVal());
    if (action === 'MC') { setMemory(null); return; }
    if (action === 'MR' && memory !== null) {
      setCurrentInput(String(memory)); setResult(fmt(String(memory))); return;
    }
    if (action === 'MS') { setMemory(v); return; }
    if (action === 'M+') { setMemory(m => (m || 0) + v); return; }
    if (action === 'M-') { setMemory(m => (m || 0) - v); return; }
  };

  const loadHistory = (item) => {
    const v = item.result.replace(/\s/g, '').replace(',', '.');
    setCurrentInput(v); setResult(item.result);
    setExpression(item.expr); setEvaluated(true);
    setShowHistory(false);
  };

  // ── Conversor ──
  const runConverter = (input, from, to, cat) => {
    const val = parseFloat(input.replace(',', '.'));
    if (isNaN(val)) { setConvResult(''); return; }
    const res = convertUnit(val, from, to, cat);
    setConvResult(fmt(String(parseFloat(res.toFixed(8)))));
  };

  const onConvInput = (txt) => {
    setConvInput(txt);
    runConverter(txt, convFrom, convTo, convCategory);
  };
  const onConvFrom = (u) => { setConvFrom(u); runConverter(convInput, u, convTo, convCategory); };
  const onConvTo   = (u) => { setConvTo(u);   runConverter(convInput, convFrom, u, convCategory); };
  const onConvCat  = (c) => {
    const units = CONVERTERS[c].units;
    setConvCategory(c); setConvFrom(units[0]); setConvTo(units[1]);
    setConvInput(''); setConvResult('');
  };

  const useConvResult = () => {
    if (!convResult) return;
    const v = convResult.replace(/\s/g, '').replace(',', '.');
    setCurrentInput(v); setResult(convResult);
    setEvaluated(true); setShowConverter(false);
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: T.bg }]}>
      <StatusBar barStyle={T.statusBar} backgroundColor={T.bg} />

      {/* HEADER */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => setShowHistory(true)} style={[s.hBtn, { backgroundColor: T.spBg }]}>
          <Ionicons name="time-outline" size={22} color={T.icon} />
          {history.length > 0 && (
            <View style={[s.badge, { backgroundColor: T.accent }]}>
              <Text style={s.badgeTxt}>{history.length > 99 ? '99+' : history.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={s.headerCenter}>
          {/* Toggle dark/light */}
          <View style={[s.toggle, { backgroundColor: T.spBg }]}>
            <TouchableOpacity
              onPress={() => setMode('dark')}
              style={[s.toggleBtn, { backgroundColor: mode === 'dark' ? T.opBg : 'transparent' }]}
            >
              <Ionicons name="moon" size={17} color={mode === 'dark' ? '#FFF' : T.icon} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMode('light')}
              style={[s.toggleBtn, { backgroundColor: mode === 'light' ? T.opBg : 'transparent' }]}
            >
              <Ionicons name="sunny" size={17} color={mode === 'light' ? '#FFF' : T.icon} />
            </TouchableOpacity>
          </View>

          {/* Tema/cor */}
          <TouchableOpacity onPress={() => setShowTheme(true)} style={[s.hBtn, { backgroundColor: T.spBg }]}>
            <Ionicons name="color-palette-outline" size={22} color={T.icon} />
          </TouchableOpacity>
        </View>

        <View style={s.headerRight}>
          {/* Conversor */}
          <TouchableOpacity onPress={() => setShowConverter(true)} style={[s.hBtn, { backgroundColor: T.spBg }]}>
            <Ionicons name="swap-horizontal-outline" size={22} color={T.icon} />
          </TouchableOpacity>
          {/* Científico */}
          <TouchableOpacity
            onPress={() => setShowSci(v => !v)}
            style={[s.hBtn, { backgroundColor: showSci ? T.opBg : T.spBg }]}
          >
            <Ionicons name="calculator-outline" size={22} color={showSci ? '#FFF' : T.icon} />
          </TouchableOpacity>
        </View>
      </View>

      {/* DISPLAY */}
      <Animated.View style={[s.display, { backgroundColor: displayBg }]}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }], alignItems: 'flex-end', width: '100%' }}>
          {memory !== null && (
            <Text style={[s.memLabel, { color: T.memColor }]}>M = {fmt(String(memory))}</Text>
          )}
          <Text style={[s.expr, { color: T.exprColor }]} numberOfLines={1} ellipsizeMode="head">
            {expression || ' '}
          </Text>
          <TouchableWithoutFeedback onLongPress={copyResult}>
            <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
              <Text
                style={[s.result, { color: result === 'Erro' ? '#EF4444' : T.resultColor }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.35}
              >
                {result}
              </Text>
            </Animated.View>
          </TouchableWithoutFeedback>
          <Text style={[s.copyHint, { color: T.exprColor }]}>toque longo para copiar</Text>
        </Animated.View>
      </Animated.View>

      {/* PAINEL CIENTÍFICO */}
      {showSci && (
        <View style={s.sciPanel}>
          <View style={s.sciRow}>
            {['MC','MR','MS','M+','M-'].map(fn => (
              <SciBtn key={fn} label={fn} onPress={() => pressMem(fn)} T={T} />
            ))}
          </View>
          <View style={s.sciRow}>
            {[{l:'sin',fn:'sin'},{l:'cos',fn:'cos'},{l:'tan',fn:'tan'},{l:'√x',fn:'sqrt'},{l:'x²',fn:'x2'}].map(i => (
              <SciBtn key={i.fn} label={i.l} onPress={() => pressSci(i.fn)} T={T} />
            ))}
          </View>
          <View style={s.sciRow}>
            {[{l:'log',fn:'log'},{l:'ln',fn:'ln'},{l:'1/x',fn:'1/x'},{l:'π',fn:'pi'},{l:'|x|',fn:'abs'}].map(i => (
              <SciBtn key={i.fn} label={i.l} onPress={() => pressSci(i.fn)} T={T} />
            ))}
          </View>
        </View>
      )}

      {/* TECLADO */}
      <View style={s.pad}>
        {/* Linha 1 */}
        <View style={s.row}>
          <CalcBtn type="sp" T={T} onPress={pressAC}>
            <Text style={{ color: T.spColor, fontSize: 19, fontWeight: '500' }}>AC</Text>
          </CalcBtn>
          <CalcBtn type="sp" T={T} onPress={pressPM}>
            <Text style={{ color: T.spColor, fontSize: 22, fontWeight: '300' }}>⁺∕₋</Text>
          </CalcBtn>
          <CalcBtn type="sp" T={T} onPress={smartPercent}>
            <Text style={{ color: T.spColor, fontSize: 22, fontWeight: '300' }}>%</Text>
          </CalcBtn>
          <CalcBtn type="op" T={T} active={activeOp === '÷'} onPress={() => pressOp('÷')}>
            <Text style={{ color: T.opColor, fontSize: 26, fontWeight: '300' }}>÷</Text>
          </CalcBtn>
        </View>

        {/* Linha 2 */}
        <View style={s.row}>
          {['7','8','9'].map(n => (
            <CalcBtn key={n} T={T} onPress={() => pressNum(n)}>
              <Text style={[s.btnTxt, { color: T.numColor }]}>{n}</Text>
            </CalcBtn>
          ))}
          <CalcBtn type="op" T={T} active={activeOp === '×'} onPress={() => pressOp('×')}>
            <Ionicons name="close-outline" size={28} color={T.opColor} />
          </CalcBtn>
        </View>

        {/* Linha 3 */}
        <View style={s.row}>
          {['4','5','6'].map(n => (
            <CalcBtn key={n} T={T} onPress={() => pressNum(n)}>
              <Text style={[s.btnTxt, { color: T.numColor }]}>{n}</Text>
            </CalcBtn>
          ))}
          <CalcBtn type="op" T={T} active={activeOp === '-'} onPress={() => pressOp('-')}>
            <Ionicons name="remove-outline" size={28} color={T.opColor} />
          </CalcBtn>
        </View>

        {/* Linha 4 */}
        <View style={s.row}>
          {['1','2','3'].map(n => (
            <CalcBtn key={n} T={T} onPress={() => pressNum(n)}>
              <Text style={[s.btnTxt, { color: T.numColor }]}>{n}</Text>
            </CalcBtn>
          ))}
          <CalcBtn type="op" T={T} active={activeOp === '+'} onPress={() => pressOp('+')}>
            <Ionicons name="add-outline" size={28} color={T.opColor} />
          </CalcBtn>
        </View>

        {/* Linha 5 */}
        <View style={s.row}>
          <CalcBtn wide T={T} onPress={() => pressNum('0')}>
            <Text style={[s.btnTxt, { color: T.numColor }]}>0</Text>
          </CalcBtn>
          <CalcBtn T={T} onPress={pressComma}>
            <Text style={[s.btnTxt, { color: T.numColor }]}>,</Text>
          </CalcBtn>
          <CalcBtn type="op" T={T} onPress={pressEqual}>
            <Text style={{ color: T.opColor, fontSize: 28, fontWeight: '300' }}>=</Text>
          </CalcBtn>
        </View>

        {/* Backspace extra */}
        <TouchableOpacity onPress={pressBack} style={[s.backRow, { backgroundColor: T.spBg }]}>
          <Ionicons name="backspace-outline" size={22} color={T.spColor} />
          <Text style={{ color: T.spColor, fontSize: 13, marginLeft: 6 }}>apagar</Text>
        </TouchableOpacity>
      </View>

      {/* ═══ MODAL HISTÓRICO ═══ */}
      <Modal visible={showHistory} animationType="slide" transparent onRequestClose={() => setShowHistory(false)}>
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: T.histBg }]}>
            <View style={[s.sheetHeader, { borderBottomColor: T.divider }]}>
              <Text style={[s.sheetTitle, { color: T.histText }]}>Histórico</Text>
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                {history.length > 0 && (
                  <TouchableOpacity onPress={() => saveHistory([])}>
                    <Ionicons name="trash-outline" size={22} color={T.opBg} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowHistory(false)}>
                  <Ionicons name="close-outline" size={28} color={T.icon} />
                </TouchableOpacity>
              </View>
            </View>
            {history.length === 0 ? (
              <View style={s.emptyBox}>
                <Ionicons name="time-outline" size={56} color={T.histSub} />
                <Text style={[s.emptyTxt, { color: T.histSub }]}>Sem histórico ainda</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
                {history.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => loadHistory(item)}
                    style={[s.histItem, { backgroundColor: T.histItem, shadowColor: T.shadow,
                      shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 }]}
                  >
                    <Text style={[s.histExpr,   { color: T.histSub  }]}>{item.expr}</Text>
                    <Text style={[s.histResult, { color: T.histText }]}>= {item.result}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ═══ MODAL CONVERSOR ═══ */}
      <Modal visible={showConverter} animationType="slide" transparent onRequestClose={() => setShowConverter(false)}>
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: T.histBg }]}>
            <View style={[s.sheetHeader, { borderBottomColor: T.divider }]}>
              <Text style={[s.sheetTitle, { color: T.histText }]}>Conversor</Text>
              <TouchableOpacity onPress={() => setShowConverter(false)}>
                <Ionicons name="close-outline" size={28} color={T.icon} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              {/* Categorias */}
              <Text style={[s.convLabel, { color: T.histSub }]}>Categoria</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {Object.keys(CONVERTERS).map(cat => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => onConvCat(cat)}
                    style={[s.catBtn, {
                      backgroundColor: convCategory === cat ? T.opBg : T.spBg,
                      marginRight: 8,
                    }]}
                  >
                    <Text style={{ color: convCategory === cat ? '#FFF' : T.spColor, fontSize: 13, fontWeight: '500' }}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* De / Para */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.convLabel, { color: T.histSub }]}>De</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {CONVERTERS[convCategory].units.map(u => (
                      <TouchableOpacity
                        key={u}
                        onPress={() => onConvFrom(u)}
                        style={[s.unitBtn, { backgroundColor: convFrom === u ? T.opBg : T.spBg, marginRight: 6 }]}
                      >
                        <Text style={{ color: convFrom === u ? '#FFF' : T.spColor, fontSize: 13 }}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.convLabel, { color: T.histSub }]}>Para</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {CONVERTERS[convCategory].units.map(u => (
                      <TouchableOpacity
                        key={u}
                        onPress={() => onConvTo(u)}
                        style={[s.unitBtn, { backgroundColor: convTo === u ? T.opBg : T.spBg, marginRight: 6 }]}
                      >
                        <Text style={{ color: convTo === u ? '#FFF' : T.spColor, fontSize: 13 }}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              {/* Input numérico do conversor */}
              <Text style={[s.convLabel, { color: T.histSub }]}>Valor</Text>
              <View style={[s.convInputRow, { backgroundColor: T.spBg }]}>
                {['7','8','9','4','5','6','1','2','3','0',',','⌫'].map(k => (
                  <TouchableOpacity
                    key={k}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (k === '⌫') {
                        const next = convInput.slice(0, -1);
                        setConvInput(next); runConverter(next, convFrom, convTo, convCategory);
                      } else if (k === ',' && !convInput.includes(',')) {
                        const next = (convInput || '0') + ',';
                        setConvInput(next); runConverter(next, convFrom, convTo, convCategory);
                      } else if (k !== ',') {
                        const next = convInput + k;
                        setConvInput(next); runConverter(next, convFrom, convTo, convCategory);
                      }
                    }}
                    style={[s.convKey, { backgroundColor: k === '⌫' ? T.opBg + '33' : T.numBg }]}
                  >
                    <Text style={{ color: T.numColor, fontSize: 18, fontWeight: '400' }}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Resultado */}
              <View style={[s.convResultBox, { backgroundColor: T.histItem }]}>
                <Text style={[s.convResultLabel, { color: T.histSub }]}>
                  {convInput || '0'} {convFrom} =
                </Text>
                <Text style={[s.convResultVal, { color: T.histText }]}>
                  {convResult || '0'} {convTo}
                </Text>
                {convResult !== '' && (
                  <TouchableOpacity
                    onPress={useConvResult}
                    style={[s.useResultBtn, { backgroundColor: T.opBg }]}
                  >
                    <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 14 }}>
                      Usar este valor →
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══ MODAL TEMA ═══ */}
      <Modal visible={showTheme} animationType="fade" transparent onRequestClose={() => setShowTheme(false)}>
        <TouchableWithoutFeedback onPress={() => setShowTheme(false)}>
          <View style={s.overlay}>
            <TouchableWithoutFeedback>
              <View style={[s.themeModal, { backgroundColor: T.histBg }]}>
                <Text style={[s.sheetTitle, { color: T.histText, marginBottom: 16 }]}>Cor do tema</Text>
                <View style={s.accentGrid}>
                  {Object.entries(ACCENTS).map(([key, color]) => (
                    <TouchableOpacity
                      key={key}
                      onPress={() => { setAccentKey(key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                      style={[s.accentDot, { backgroundColor: color,
                        borderWidth: accentKey === key ? 3 : 0,
                        borderColor: '#FFF',
                        transform: [{ scale: accentKey === key ? 1.2 : 1 }],
                      }]}
                    >
                      {accentKey === key && <Ionicons name="checkmark" size={18} color="#FFF" />}
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[s.accentName, { color: T.histSub }]}>
                  {accentKey.charAt(0).toUpperCase() + accentKey.slice(1)}
                </Text>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </SafeAreaView>
  );
}

// ─── ESTILOS ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4,
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: 0, right: 0,
    borderRadius: 9, minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  toggle: { flexDirection: 'row', borderRadius: 26, padding: 5, gap: 4 },
  toggleBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  display: {
    flex: 1, justifyContent: 'flex-end', alignItems: 'flex-end',
    paddingHorizontal: 24, paddingBottom: 12, minHeight: 120,
  },
  memLabel: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  expr:     { fontSize: 16, fontWeight: '300', letterSpacing: 0.3, marginBottom: 4, textAlign: 'right' },
  result:   { fontSize: 68, fontWeight: '200', letterSpacing: 1, textAlign: 'right' },
  copyHint: { fontSize: 10, marginTop: 2, opacity: 0.6 },
  sciPanel: { paddingHorizontal: 20, paddingBottom: 8, gap: 7 },
  sciRow:   { flexDirection: 'row', gap: 6 },
  pad:      { paddingHorizontal: 20, paddingBottom: 16, gap: GAP },
  row:      { flexDirection: 'row', gap: GAP },
  btnTxt:   { fontSize: 22, fontWeight: '400' },
  backRow:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, paddingVertical: 10, marginTop: 2,
  },
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:    { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: height * 0.85, paddingTop: 6 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: 20, fontWeight: '600' },
  emptyBox:   { alignItems: 'center', paddingVertical: 60, gap: 14 },
  emptyTxt:   { fontSize: 16, fontWeight: '300' },
  histItem:   { borderRadius: 16, padding: 16, marginBottom: 10 },
  histExpr:   { fontSize: 14, fontWeight: '300', marginBottom: 4 },
  histResult: { fontSize: 26, fontWeight: '300', letterSpacing: 0.4 },
  // Conversor
  convLabel:     { fontSize: 12, fontWeight: '500', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  catBtn:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  unitBtn:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  convInputRow:  { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 16, padding: 8, marginBottom: 16, gap: 6 },
  convKey:       { width: (width - 80) / 3, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  convResultBox: { borderRadius: 20, padding: 20, alignItems: 'center', gap: 6 },
  convResultLabel: { fontSize: 15, fontWeight: '300' },
  convResultVal:   { fontSize: 32, fontWeight: '200', letterSpacing: 0.5 },
  useResultBtn:    { marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  // Tema
  themeModal: { margin: 40, borderRadius: 24, padding: 24, alignItems: 'center' },
  accentGrid: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 12 },
  accentDot:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  accentName: { fontSize: 14, fontWeight: '400' },
});