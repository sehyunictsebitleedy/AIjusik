import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { COLORS } from '@/constants/config';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export default function RootLayout() {
  // 앱 시작 시 푸시 권한 요청 + 토큰 발급 + 백엔드 등록
  usePushNotifications();

  return (
    // Victory Native / react-native-gesture-handler 필수 래퍼
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" backgroundColor={COLORS.bg} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.bg },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: COLORS.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="stock/[ticker]"
          options={{
            title: '종목 상세',
            headerBackTitle: '뒤로',
          }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
