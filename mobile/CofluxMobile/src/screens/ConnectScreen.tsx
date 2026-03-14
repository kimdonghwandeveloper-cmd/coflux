import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
  type Code,
} from 'react-native-vision-camera';
import { useCameraPermission } from 'react-native-vision-camera';
import QRCode from 'react-native-qrcode-svg';
import { webRTCService } from '../services/WebRTCService';
import { useConnectionStore } from '../store/connectionStore';
import { SignalingPayloadSchema, type SignalingPayload } from '../types/bridge';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Connect'>;
};

type Mode = 'idle' | 'camera' | 'manual' | 'answer';

export function ConnectScreen({ navigation }: Props) {
  const [mode, setMode] = useState<Mode>('idle');
  const [manualSdp, setManualSdp] = useState('');
  const [answerSdp, setAnswerSdp] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const setConnectionState = useConnectionStore(s => s.setConnectionState);
  const setError = useConnectionStore(s => s.setError);
  const connectionState = useConnectionStore(s => s.connectionState);

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const processingRef = useRef(false);

  // ─── QR 스캔 핸들러 ─────────────────────────────────────────────────────

  const handleQRCode = useCallback(async (codes: Code[]) => {
    if (processingRef.current || codes.length === 0) return;
    const raw = codes[0]?.value;
    if (!raw) return;
    processingRef.current = true;
    await processOffer(raw);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: handleQRCode,
  });

  // ─── SDP 처리 ────────────────────────────────────────────────────────────

  async function processOffer(raw: string) {
    let payload: SignalingPayload;
    try {
      const json = JSON.parse(raw);
      payload = SignalingPayloadSchema.parse(json);
    } catch {
      // 구형 호스트 호환: 순수 SDP 문자열 (JSON 래핑 없음)
      try {
        const json = JSON.parse(raw);
        payload = { sdp: json.sdp ?? raw, type: 'offer', version: 1 };
      } catch {
        payload = { sdp: raw, type: 'offer', version: 1 };
      }
    }

    setIsConnecting(true);
    setMode('answer');
    try {
      const answer = await webRTCService.connectFromOffer(payload);
      setAnswerSdp(answer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      Alert.alert('연결 실패', msg);
      setMode('idle');
      processingRef.current = false;
    } finally {
      setIsConnecting(false);
    }
  }

  // ─── 카메라 권한 요청 ────────────────────────────────────────────────────

  async function openCamera() {
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert('카메라 권한 필요', 'QR 코드 스캔을 위해 카메라 권한이 필요합니다.');
        return;
      }
    }
    processingRef.current = false;
    setMode('camera');
  }

  // ─── 연결 완료 후 대시보드로 이동 ────────────────────────────────────────

  React.useEffect(() => {
    if (connectionState === 'connected') {
      navigation.replace('Main');
    }
  }, [connectionState, navigation]);

  // ─── 렌더링 ──────────────────────────────────────────────────────────────

  if (mode === 'camera') {
    if (!device) {
      return (
        <View style={styles.center}>
          <Text style={styles.errorText}>카메라를 사용할 수 없습니다.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => setMode('idle')}>
            <Text style={styles.btnText}>돌아가기</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.fill}>
        <Camera
          style={styles.fill}
          device={device}
          isActive={true}
          codeScanner={codeScanner}
        />
        <View style={styles.cameraOverlay}>
          <View style={styles.qrFrame} />
          <Text style={styles.cameraHint}>호스트 PC의 QR 코드에 카메라를 맞춰주세요</Text>
          <TouchableOpacity
            style={[styles.btn, styles.cancelBtn]}
            onPress={() => setMode('idle')}>
            <Text style={styles.btnText}>취소</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (mode === 'answer') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Answer SDP</Text>
        {isConnecting ? (
          <>
            <ActivityIndicator color={COLORS.accent} size="large" />
            <Text style={styles.subtitle}>Answer 생성 중...</Text>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              아래 텍스트를 호스트 PC의 "Paste Remote SDP" 입력창에 붙여넣으세요.
            </Text>
            <View style={styles.sdpBox}>
              <Text style={styles.sdpText} selectable>
                {answerSdp}
              </Text>
            </View>
            {/* QR 코드로도 표시 (호스트가 카메라로 스캔 시) */}
            {answerSdp ? (
              <View style={styles.qrContainer}>
                <QRCode value={answerSdp} size={180} />
                <Text style={styles.hint}>또는 이 QR을 호스트가 스캔</Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.btn}
              onPress={() => setMode('idle')}>
              <Text style={styles.btnText}>처음으로</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    );
  }

  if (mode === 'manual') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>SDP 직접 입력</Text>
        <Text style={styles.subtitle}>
          호스트 PC에서 복사한 Offer SDP를 붙여넣으세요.
        </Text>
        <TextInput
          style={styles.textInput}
          multiline
          placeholder="Offer SDP를 붙여넣으세요..."
          placeholderTextColor={COLORS.textDim}
          value={manualSdp}
          onChangeText={setManualSdp}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={[styles.btn, styles.primaryBtn, !manualSdp && styles.btnDisabled]}
          onPress={() => manualSdp && processOffer(manualSdp)}
          disabled={!manualSdp}>
          <Text style={styles.btnText}>연결</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={() => setMode('idle')}>
          <Text style={styles.btnText}>취소</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // idle
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>coflux</Text>
        <Text style={styles.tagline}>P2P · 프라이버시 우선</Text>
      </View>

      <Text style={styles.title}>호스트 PC 연결</Text>
      <Text style={styles.subtitle}>
        호스트 PC의 Coflux 앱에서{'\n'}"Generate Offer" 후 QR 코드를 스캔하세요.
      </Text>

      <TouchableOpacity style={[styles.btn, styles.primaryBtn]} onPress={openCamera}>
        <Text style={styles.btnText}>QR 코드 스캔</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btn} onPress={() => setMode('manual')}>
        <Text style={styles.btnText}>SDP 직접 입력</Text>
      </TouchableOpacity>

      {Platform.OS === 'android' && (
        <Text style={styles.hint}>
          Android · 로컬 P2P 연결만 사용됩니다.
        </Text>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const COLORS = {
  bg: '#111113',
  surface: '#1c1c1e',
  accent: '#6b8afd',
  text: '#e8e8ea',
  textDim: '#6b6b70',
  border: '#2c2c2e',
  error: '#ff4d4f',
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
    gap: 16,
  },
  container: {
    flexGrow: 1,
    backgroundColor: COLORS.bg,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  header: { alignItems: 'center', marginBottom: 8 },
  logo: { fontSize: 32, fontWeight: '700', color: COLORS.accent, letterSpacing: 1 },
  tagline: { fontSize: 12, color: COLORS.textDim, marginTop: 4 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textDim,
    textAlign: 'center',
    lineHeight: 20,
  },
  btn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  cancelBtn: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderColor: COLORS.border,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12, color: COLORS.textDim, textAlign: 'center' },
  errorText: { color: COLORS.error, fontSize: 14 },
  textInput: {
    width: '100%',
    minHeight: 120,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    color: COLORS.text,
    fontFamily: 'monospace',
    fontSize: 11,
  },
  sdpBox: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 12,
    maxHeight: 160,
  },
  sdpText: { color: COLORS.textDim, fontSize: 10, fontFamily: 'monospace' },
  qrContainer: { alignItems: 'center', gap: 8 },
  // 카메라 오버레이
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  qrFrame: {
    width: 220,
    height: 220,
    borderWidth: 2,
    borderColor: COLORS.accent,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  cameraHint: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
});
