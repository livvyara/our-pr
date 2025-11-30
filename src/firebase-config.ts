// src/firebase-config.ts

import { initializeApp } from "firebase/app";
import { getFunctions } from "firebase/functions";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";

// ⚠️ YOUR_... 부분을 실제 Firebase 프로젝트 값으로 교체하세요.
export const firebaseConfig = {
  apiKey: "AIzaSyB-hJa-krvZBJjzPMUbwGZ26xWvw5_Xo2E",
  authDomain: "our-pr.firebaseapp.com",
  projectId: "our-pr",
  storageBucket: "our-pr.firebasestorage.app",
  messagingSenderId: "27718032709",
  appId: "1:27718032709:web:f087bdc34d0128df5cf22c"
};

// 1. Firebase 앱 초기화
export const app = initializeApp(firebaseConfig);

// 2. Cloud Functions 초기화 (리전은 asia-northeast3로 설정되어 있습니다.)
// 이 값은 여러분의 Firebase Functions 배포 리전과 일치해야 합니다.
export const functions = getFunctions(app, 'asia-northeast3');

// 3. Auth 초기화 및 지속성 설정 (로그인 유지 핵심)
export const auth = getAuth(app);

// [수정됨] 인증 상태를 'LOCAL'로 설정하여 새 탭이나 브라우저 재시작 후에도 로그인이 유지되도록 함
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    // 설정 성공 시 콘솔에 로그 (개발 확인용, 배포 시 제거 가능)
    console.log("Firebase Auth Persistence set to LOCAL");
  })
  .catch((error) => {
    console.error("Firebase Auth Persistence Error:", error);
  });