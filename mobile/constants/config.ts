/**
 * 앱 전역 설정
 *
 * 백엔드 URL:
 *   - iOS 시뮬레이터:  http://localhost:8000
 *   - Android 에뮬레이터: http://10.0.2.2:8000
 *   - 실제 기기:       http://<로컬IP>:8000  (예: http://192.168.0.10:8000)
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export const COLORS = {
  bg: '#0f172a',         // 메인 배경 (다크 네이비)
  surface: '#1e293b',    // 카드 배경
  border: '#334155',     // 구분선
  primary: '#3b82f6',    // 파란색 (포인트)
  success: '#22c55e',    // 초록 (수익)
  danger: '#ef4444',     // 빨강 (손실 / 경보)
  warning: '#f59e0b',    // 노랑 (주의)
  text: '#f1f5f9',       // 기본 텍스트
  muted: '#94a3b8',      // 보조 텍스트
  up: '#ef4444',         // 주가 상승 (한국식 빨강)
  down: '#3b82f6',       // 주가 하락 (한국식 파랑)
};
