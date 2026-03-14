import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ConnectScreen } from '../screens/ConnectScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { webRTCService } from '../services/WebRTCService';
import { useConnectionStore } from '../store/connectionStore';

export type RootStackParamList = {
  Connect: undefined;
  Main: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const DARK_THEME = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: '#111113',
    card: '#1c1c1e',
    text: '#e8e8ea',
    border: '#2c2c2e',
    primary: '#6b8afd',
    notification: '#ef4444',
  },
};

export function AppNavigator() {
  const setConnectionState = useConnectionStore(s => s.setConnectionState);
  const setError = useConnectionStore(s => s.setError);
  const handleIncomingMessage = useConnectionStore(s => s.handleIncomingMessage);

  // WebRTCService 콜백을 앱 수명 주기에 한 번만 등록
  useEffect(() => {
    webRTCService.init({
      onConnectionStateChange: setConnectionState,
      onMessage: handleIncomingMessage,
      onError: setError,
    });
  }, [setConnectionState, handleIncomingMessage, setError]);

  return (
    <NavigationContainer theme={DARK_THEME}>
      <Stack.Navigator
        initialRouteName="Connect"
        screenOptions={{
          headerStyle: { backgroundColor: '#1c1c1e' },
          headerTintColor: '#e8e8ea',
          headerTitleStyle: { fontWeight: '700' },
        }}>
        <Stack.Screen
          name="Connect"
          component={ConnectScreen}
          options={{ title: 'Coflux', headerShown: true }}
        />
        <Stack.Screen
          name="Main"
          component={DashboardScreen}
          options={{ title: '대시보드', headerBackVisible: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
