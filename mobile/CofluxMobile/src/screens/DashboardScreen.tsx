import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useConnectionStore } from '../store/connectionStore';
import { webRTCService } from '../services/WebRTCService';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Main'>;
};

const SEVERITY_COLOR = {
  info: '#6b8afd',
  warning: '#f59e0b',
  critical: '#ef4444',
} as const;

export function DashboardScreen({ navigation }: Props) {
  const connectionState = useConnectionStore(s => s.connectionState);
  const hostInfo = useConnectionStore(s => s.hostInfo);
  const notifications = useConnectionStore(s => s.notifications);
  const pendingApprovals = useConnectionStore(s => s.pendingApprovals);
  const clearNotification = useConnectionStore(s => s.clearNotification);
  const dismissApproval = useConnectionStore(s => s.dismissApproval);

  function handleDisconnect() {
    Alert.alert('연결 해제', '호스트와의 연결을 끊겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '연결 해제',
        style: 'destructive',
        onPress: () => {
          webRTCService.disconnect();
          navigation.replace('Connect');
        },
      },
    ]);
  }

  function handleApproval(requestId: string, approved: boolean) {
    webRTCService.send('control', {
      type: 'approval_response',
      channel: 'control',
      payload: { requestId, approved },
    });
    dismissApproval(requestId);
  }

  const stateLabel: Record<typeof connectionState, string> = {
    idle: '대기 중',
    connecting: '연결 중...',
    connected: '연결됨',
    disconnected: '연결 끊김',
    reconnecting: '재연결 중...',
  };

  const stateColor: Record<typeof connectionState, string> = {
    idle: COLORS.textDim,
    connecting: COLORS.accent,
    connected: '#22c55e',
    disconnected: COLORS.error,
    reconnecting: '#f59e0b',
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* 연결 상태 카드 */}
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: stateColor[connectionState] }]} />
          <Text style={[styles.stateText, { color: stateColor[connectionState] }]}>
            {stateLabel[connectionState]}
          </Text>
        </View>
        {hostInfo && (
          <>
            <Text style={styles.hostName}>{hostInfo.name}</Text>
            <Text style={styles.meta}>
              세션: {hostInfo.sessionId.slice(0, 8)}… · 피어: {hostInfo.connectedPeers.length}명
            </Text>
          </>
        )}
        <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
          <Text style={styles.disconnectText}>연결 해제</Text>
        </TouchableOpacity>
      </View>

      {/* 승인 대기 */}
      {pendingApprovals.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>승인 대기 ({pendingApprovals.length})</Text>
          {pendingApprovals.map(req => (
            <View key={req.payload.requestId} style={styles.approvalCard}>
              <Text style={styles.approvalAction}>{req.payload.action}</Text>
              <Text style={styles.approvalDesc}>{req.payload.description}</Text>
              <View style={styles.approvalBtns}>
                <TouchableOpacity
                  style={[styles.approvalBtn, styles.approveBtn]}
                  onPress={() => handleApproval(req.payload.requestId, true)}>
                  <Text style={styles.approveBtnText}>승인</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approvalBtn, styles.denyBtn]}
                  onPress={() => handleApproval(req.payload.requestId, false)}>
                  <Text style={styles.denyBtnText}>거부</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 알림 목록 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>알림</Text>
        {notifications.length === 0 ? (
          <Text style={styles.empty}>알림 없음</Text>
        ) : (
          notifications.slice(0, 20).map(n => (
            <TouchableOpacity
              key={n.messageId}
              style={styles.notifCard}
              onPress={() => clearNotification(n.messageId)}>
              <View style={[styles.severityBar, { backgroundColor: SEVERITY_COLOR[n.payload.severity] }]} />
              <View style={styles.notifBody}>
                <Text style={styles.notifTitle}>{n.payload.title}</Text>
                <Text style={styles.notifText}>{n.payload.body}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const COLORS = {
  bg: '#111113',
  surface: '#1c1c1e',
  accent: '#6b8afd',
  text: '#e8e8ea',
  textDim: '#6b6b70',
  border: '#2c2c2e',
  error: '#ef4444',
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 16, gap: 16 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  stateText: { fontSize: 14, fontWeight: '600' },
  hostName: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textDim },
  disconnectBtn: {
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.error,
    alignItems: 'center',
  },
  disconnectText: { color: COLORS.error, fontSize: 13, fontWeight: '600' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: 0.5 },
  approvalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f59e0b44',
    gap: 8,
  },
  approvalAction: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  approvalDesc: { fontSize: 13, color: COLORS.textDim },
  approvalBtns: { flexDirection: 'row', gap: 10 },
  approvalBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  approveBtn: { backgroundColor: '#22c55e22', borderWidth: 1, borderColor: '#22c55e' },
  denyBtn: { backgroundColor: '#ef444422', borderWidth: 1, borderColor: COLORS.error },
  approveBtnText: { color: '#22c55e', fontWeight: '700' },
  denyBtnText: { color: COLORS.error, fontWeight: '700' },
  notifCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  severityBar: { width: 4 },
  notifBody: { flex: 1, padding: 12, gap: 4 },
  notifTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  notifText: { fontSize: 12, color: COLORS.textDim },
  empty: { fontSize: 13, color: COLORS.textDim, textAlign: 'center', paddingVertical: 16 },
});
