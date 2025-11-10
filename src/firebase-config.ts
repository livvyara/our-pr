// src/firebase-config.ts

import { initializeApp } from "firebase/app";
import { getFunctions } from "firebase/functions";
import { getAuth } from "firebase/auth";

// ⚠️ YOUR_... 부분을 실제 Firebase 프로젝트 값으로 교체하세요.
const firebaseConfig = {
  apiKey: "AIzaSyB-hJa-krvZBJjzPMUbwGZ26xWvw5_Xo2E",
  authDomain: "our-pr.firebaseapp.com",
  projectId: "our-pr",
  storageBucket: "our-pr.firebasestorage.app",
  messagingSenderId: "27718032709",
  appId: "1:27718032709:web:f087bdc34d0128df5cf22c"
};

// 1. Firebase 앱 초기화
const app = initializeApp(firebaseConfig);

// 2. Cloud Functions 초기화 (리전은 asia-northeast3로 설정되어 있습니다.)
// 이 값은 여러분의 Firebase Functions 배포 리전과 일치해야 합니다.
export const functions = getFunctions(app, 'asia-northeast3');
export const auth = getAuth(app);