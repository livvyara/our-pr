// src/App.tsx
import { Routes, Route } from 'react-router-dom';
import HomePage from './HomePage';       
import LoginPage from './LoginPage';     
import SignUpPage from './SignUpPage';   
import MyPage from './MyPage';
import PasswordChangePage from './PasswordChangePage';
import AdminPage from './admin/AdminPage';
import PartnerApply from './PartnerApply';
import PartnerApplyForm from './PartnerApplyForm';
import CommunityBoardPage from '../pages/community/CommunityBoardPage';
import AuthActionPage from '../pages/AuthActionPage';
import GuideMainPC from '../pages/guide/GuideMainPC';
import GuideWritePage from '../pages/admin/GuideWritePage';


// [⭐ 1. 추가] 파트너 전산 메인 페이지 임포트
import PartnerProgramPage from './program/PartnerProgramPage';

// [⭐ 1. 추가] MenuProvider 임포트
import { MenuProvider } from '../contexts/MenuContext';

// [⭐ 1. 추가] 초대 수락 페이지 임포트
import JoinCompanyPage from '../pages/JoinCompanyPage'; 
import JoinSitePage from '../pages/JoinSitePage';

function App() {
  return (
    // (MenuProvider가 Routes를 감싸고 있다고 가정)
    <MenuProvider>
      <Routes>
        {/* 1. 기본 경로 */}
        <Route path="/" element={<HomePage />} /> 
        
        {/* 2. 로그인 경로 */}
        <Route path="/login" element={<LoginPage />} />
        
        {/* 3. 회원가입 경로 */}
        <Route path="/signup" element={<SignUpPage />} />
        
        {/* 4. 비밀번호 재설정 */}
        <Route path="/reset-password" element={<div>비밀번호 재설정 페이지</div>} />

        {/* 5. 마이페이지 경로 */}
        <Route path="/mypage" element={<MyPage />} />

        {/* 6. 비밀번호 변경 경로 */}
        <Route path="/password-change" element={<PasswordChangePage />} />

        {/* 7. 파트너 신청 */}
        <Route path="/guide/apply" element={<PartnerApply />} />
        <Route path="/apply/partner" element={<PartnerApplyForm />} />

        {/* 8. 어드민페이지 */}
        <Route path="/admin" element={<AdminPage />} /> 

        {/* [⭐ 2. 수정] 파트너 전산 메인 경로
            /program/main -> /program/* 로 변경
            /program 으로 접속 시 /program/dashboard 로 자동 이동됩니다.
        */}
        <Route path="/program/*" element={<PartnerProgramPage />} />
        
        {/* [⭐ 2. 추가] 초대 수락 라우트 */}
        <Route path="/join-company/:inviteId" element={<JoinCompanyPage />} />

        {/* [⭐ 추가] 도급인 현장 초대 수락 페이지 */}
        <Route path="/join-site/:inviteId" element={<JoinSitePage />} />
        
        {/* 1. 공지사항 */}
        <Route 
          path="/community/notice" 
          element={<CommunityBoardPage category="notice" />} 
        />
  
        {/* 2. 업데이트 */}
        <Route 
          path="/community/update" 
          element={<CommunityBoardPage category="update" />} 
        />

        {/* 3. 기능 제안 (추가됨) */}
        <Route 
          path="/community/suggestion" 
          element={<CommunityBoardPage category="suggestion" />} 
        />
        <Route 
          path="/community/inquiry" 
          element={<CommunityBoardPage category="inquiry" />} 
        />

        {/* [⭐ 추가] 비밀번호 재설정 등 인증 액션 페이지 */}
        <Route path="/auth/action" element={<AuthActionPage />} />

        {/* 이용안내 (유저용) */}
        <Route path="/guide/mainpc" element={<GuideMainPC />} />

        {/* 이용안내 글쓰기 (관리자용) */}
        <Route path="/admin/guide/write" element={<GuideWritePage />} />
  
      </Routes>
        
    </MenuProvider>
  );
}

export default App;