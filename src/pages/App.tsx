import React, { useEffect } from 'react'; 
import { Routes, Route } from 'react-router-dom';

import HomePage from '../pages/HomePage';       
import LoginPage from '../pages/LoginPage';     
import SignUpPage from '../pages/SignUpPage';   
import MyPage from '../pages/MyPage';
import PasswordChangePage from '../pages/PasswordChangePage';
import AdminPage from '../pages/admin/AdminPage';
import PartnerApply from '../pages/PartnerApply';
import PartnerApplyForm from '../pages/PartnerApplyForm';
import AuthActionPage from '../pages/AuthActionPage';
import GuideWritePage from '../pages/admin/GuideWritePage';

import MainLayout from '../components/layout/MainLayout';

// [권한 체크용 컴포넌트]
import ProtectedRoute from '../components/common/ProtectedRoute'; 

// [쇼핑몰/고객용 페이지]
import SampleSelectionPage from '../pages/customer/SampleSelectionPage';
import CartPage from '../pages/customer/CartPage';

// 파트너 전산 메인 페이지
import PartnerProgramPage from '../pages/program/PartnerProgramPage';

// Context
import { MenuProvider } from '../contexts/MenuContext';

// 초대 수락 페이지
import JoinCompanyPage from '../pages/JoinCompanyPage'; 
import JoinSitePage from '../pages/JoinSitePage';
import MyProjectPage from '../pages/customer/MyProjectPage';

function App() {

  // [React Native 앱 통신 로직 유지]
  useEffect(() => {
    const handleAppMessage = (event: any) => {
      try {
        if (typeof event.data === 'string') {
          const data = JSON.parse(event.data);
          if (data.type === 'FCM_TOKEN') {
            console.log('App으로부터 토큰 수신:', data.token);
            localStorage.setItem('fcm_token', data.token);
          }
        }
      } catch (error) {
        // 무시
      }
    };

    window.addEventListener('message', handleAppMessage);
    document.addEventListener('message', handleAppMessage);

    return () => {
      window.removeEventListener('message', handleAppMessage);
      document.removeEventListener('message', handleAppMessage);
    };
  }, []);

  return (
    <MenuProvider>
      <Routes>
        {/* 모든 페이지를 MainLayout 내부로 이동시켰습니다. */}
        <Route element={<MainLayout />}>
          
          {/* 1. 기본 경로 */}
          <Route path="/" element={<HomePage />} /> 
        
          {/* 2. 로그인/회원가입 (MainLayout 안으로 이동됨) */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />

          {/* 4. 비밀번호 재설정 */}
          <Route path="/reset-password" element={<div>비밀번호 재설정 페이지</div>} />

          {/* 5. 마이페이지 (로그인 필요) */}
          <Route path="/mypage" element={<ProtectedRoute><MyPage /></ProtectedRoute>} />

          {/* 6. 비밀번호 변경 */}
          <Route path="/password-change" element={<PasswordChangePage />} />

          {/* 7. 파트너 신청 */}
          <Route path="/guide/apply" element={<PartnerApply />} />
          <Route path="/apply/partner" element={<PartnerApplyForm />} />

          {/* 8. 어드민페이지 */}
          <Route path="/admin" element={<AdminPage />} /> 

          {/* 파트너 전산 메인 */}
          <Route path="/program/*" element={<PartnerProgramPage />} />
          
          {/* 초대 수락 */}
          <Route path="/join-company/:inviteId" element={<JoinCompanyPage />} />
          <Route path="/join-site/:inviteId" element={<JoinSitePage />} />
          
          {/* 인증 액션 */}
          <Route path="/auth/action" element={<AuthActionPage />} />

          <Route path="/myproject" element={<MyProjectPage />} />

          {/* [쇼핑몰] 샘플 고르기 */}
          <Route path="/customer/sample-selection" element={<SampleSelectionPage />} />
          
          {/* [쇼핑몰] 장바구니 (로그인 필수) */}
          <Route path="/customer/cart" element={
            <ProtectedRoute>
              <CartPage />
            </ProtectedRoute>
          } />

          {/* 이용안내 글쓰기 */}
          <Route path="/admin/guide/write" element={<GuideWritePage />} />

        </Route>
      </Routes>
    </MenuProvider>
  );
}

export default App;