// src/App.tsx
import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';       // 👈 HomePage 임포트 확인
import LoginPage from './pages/LoginPage';     // 👈 LoginPage 임포트 확인
import SignUpPage from './pages/SignUpPage';   // 👈 SignUpPage 임포트 확인
import MyPage from './pages/MyPage';
import PasswordChangePage from './pages/PasswordChangePage';
import AdminPage from './pages/admin/AdminPage';

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

      {/* 5. 마이페이지 경로 */}
      <Route path="/mypage" element={<MyPage />} />

      {/* 6. 비밀번호 변경 경로 */}
      <Route path="/password-change" element={<PasswordChangePage />} />

      {/* 7. 어드민페이지 */}
      <Route path="/admin" element={<AdminPage />} /> {/* [⭐ 추가] */}
      
    </Routes>
  );
}

export default App;