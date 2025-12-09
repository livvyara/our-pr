import { Routes, Route } from 'react-router-dom';

// [수정] 경로를 '../'로 변경
import HomePage from '../pages/HomePage';       
import LoginPage from '../pages/LoginPage';     
import SignUpPage from '../pages/SignUpPage';   
import MyPage from '../pages/MyPage';
import PasswordChangePage from '../pages/PasswordChangePage';
import AdminPage from '../pages/admin/AdminPage';
import PartnerApply from '../pages/PartnerApply';
import PartnerApplyForm from '../pages/PartnerApplyForm';
import CommunityBoardPage from '../pages/community/CommunityBoardPage';
import AuthActionPage from '../pages/AuthActionPage';
import GuideMainPC from '../pages/guide/GuideMainPC';
import GuideWritePage from '../pages/admin/GuideWritePage';
import ThreeDSimulationPage from '../pages/customer/ThreeDSimulationPage';
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
  return (
    <MenuProvider>
      <Routes>
        <Route element={<MainLayout />}>
          {/* 1. 기본 경로 */}
          <Route path="/" element={<HomePage />} /> 
        
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
          
          {/* 커뮤니티 */}
          <Route path="/community/notice" element={<CommunityBoardPage category="notice" />} />
          <Route path="/community/update" element={<CommunityBoardPage category="update" />} />
          <Route path="/community/suggestion" element={<CommunityBoardPage category="suggestion" />} />
          <Route path="/community/inquiry" element={<CommunityBoardPage category="inquiry" />} />

          {/* 인증 액션 */}
          <Route path="/auth/action" element={<AuthActionPage />} />

          {/* 이용안내 */}
          <Route path="/guide/mainpc" element={<GuideMainPC />} />
          <Route path="/myproject" element={<MyProjectPage />} />
          <Route path="/3dsimul" element={<ThreeDSimulationPage />} />

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
        
        {/* 로그인/회원가입 */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
      </Routes>
    </MenuProvider>
  );
}

export default App;