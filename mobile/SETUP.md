# Coflux Mobile — Android 설정 가이드 (M1)

## 1. 사전 준비

- Node.js 18+
- JDK 17
- Android Studio + Android SDK (API 33+)
- Android 기기 or 에뮬레이터 (USB 디버깅 활성화)

## 2. React Native 프로젝트 초기화

```bash
# coflux/ 루트에서 실행 (mobile/ 디렉토리를 대상으로)
cd mobile
npx @react-native-community/cli@latest init CofluxMobile --skip-install
# 생성된 파일 중 src/, App.tsx, index.js, app.json 은 이미 작성된 파일로 교체
# android/app/src/main/AndroidManifest.xml 은 기존 생성 파일에 병합
```

## 3. 의존성 설치

```bash
cd mobile
npm install

# react-native-webrtc Android 추가 설정
# android/app/build.gradle 에 아래 추가:
# android { defaultConfig { minSdkVersion 24 } }
```

## 4. react-native-vision-camera 설정

`android/gradle.properties` 에 추가:
```
VisionCamera_enableCodeScanner=true
```

## 5. 실행

```bash
# Metro 서버
npm start

# 별도 터미널에서
npm run android
```

## 6. 연결 테스트 흐름

1. 데스크톱 Coflux 앱 실행 → P2P Connection 패널 → "Generate Offer" 클릭
2. QR 코드가 화면에 표시됨
3. Android 앱 → "QR 코드 스캔" → 카메라로 QR 스캔
4. 앱이 Answer SDP를 생성하여 텍스트로 표시
5. 해당 텍스트를 데스크톱의 "Paste Remote SDP" 입력창에 붙여넣기
6. "Apply Pasted SDP" 클릭 → P2P 연결 수립
