/**
 * Expo 푸시 알람 훅
 *
 * 담당:
 * 1. 알람 권한 요청
 * 2. Expo Push Token 발급
 * 3. 백엔드에 토큰 등록 (POST /alerts/register-token)
 * 4. 포그라운드 알람 수신 핸들러
 * 5. 알람 탭 → 화면 이동 핸들러
 *
 * 사용:
 *   const { expoPushToken } = usePushNotifications();
 *   // → app/_layout.tsx 에서 한 번만 호출
 */
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { alertApi } from '@/services/api';
import { API_BASE_URL } from '@/constants/config';

// 포그라운드에서 알람 수신 시 배너 + 소리 표시
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  useEffect(() => {
    _registerForPushNotifications().then((token) => {
      if (token) {
        setExpoPushToken(token);
        _registerTokenToBackend(token);
      }
    });

    // 포그라운드 알람 수신 (배너만 표시, 별도 처리 없음)
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('[push] 포그라운드 알람 수신:', notification.request.content.title);
      },
    );

    // 알람 탭 → 관련 화면으로 이동
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as {
          type?: string;
          stock_id?: number;
        };
        _handleNotificationTap(data);
      },
    );

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return { expoPushToken, permissionGranted };
}

// ────────────────────────────────────────────
// 내부 함수
// ────────────────────────────────────────────

async function _registerForPushNotifications(): Promise<string | null> {
  // 실제 기기에서만 동작 (시뮬레이터 push 토큰 불가)
  if (!Device.isDevice) {
    console.warn('[push] 실제 기기에서만 푸시 알람을 사용할 수 있습니다.');
    return null;
  }

  // Android 알람 채널 설정
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'AI 투자 알람',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3b82f6',
      sound: 'default',
    });
  }

  // 권한 요청
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[push] 알람 권한이 거부되었습니다.');
    return null;
  }

  // Expo Push Token 발급
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: undefined, // app.json의 extra.eas.projectId 자동 참조
    });
    return tokenData.data;
  } catch (e) {
    console.error('[push] 토큰 발급 실패:', e);
    return null;
  }
}

async function _registerTokenToBackend(token: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE_URL}/alerts/register-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      console.log('[push] 백엔드 토큰 등록 완료:', token);
    } else {
      console.warn('[push] 백엔드 토큰 등록 실패:', res.status);
    }
  } catch (e) {
    console.error('[push] 백엔드 토큰 등록 오류:', e);
  }
}

function _handleNotificationTap(data: { type?: string; stock_id?: number }) {
  // AI 예측 알람 → 브리핑 탭
  if (data.type === 'AI_PREDICTION') {
    router.push('/(tabs)/briefing');
    return;
  }
  // 시세 알람 → 설정 탭 (알람 이력)
  if (data.type === 'PRICE_REACHED') {
    router.push('/(tabs)/settings');
    return;
  }
  // 기본 → 내 주식 탭
  router.push('/(tabs)/portfolio');
}
