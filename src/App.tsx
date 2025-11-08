// src/App.tsx
import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';       // 👈 HomePage 임포트 확인
import LoginPage from './pages/LoginPage';     // 👈 LoginPage 임포트 확인
import SignUpPage from './pages/SignUpPage';   // 👈 SignUpPage 임포트 확인

function App() {
  return (
    <Routes>
      {/* 1. 기본 경로 */}
      <Route path="/" element={<HomePage />} /> 
      
      {/* 2. 로그인 경로 */}
      <Route path="/login" element={<LoginPage />} />
      
      {/* 3. 회원가입 경로 */}
      <Route path="/signup" element={<SignUpPage />} />
      
      {/* 4. 비밀번호 재설정 (LoginPage에서 사용됨) */}
      <Route path="/reset-password" element={<div>비밀번호 재설정 페이지</div>} />
      
    </Routes>
  );
}

export default App;