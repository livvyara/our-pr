// src/pages/PasswordChangePage.tsx

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// 레이아웃 및 스타일
import Header from '../components/common/Header';
import SubNav from '../components/common/SubNav';
import MobileMenu from '../components/common/MobileMenu'; 
import Footer from '../components/common/Footer';

// [⭐ 추가] RoleHeader 임포트
import RoleHeader from '../components/common/RoleHeader';

import { K_BRAND_COLOR } from '../constants'; 
import './HomePage.css'; // 스티키 푸터 레이아웃 (필수)
import './PasswordChangePage.css'; // 비밀번호 변경 페이지 전용 CSS

// Firebase 인증 모듈
import { auth } from '../firebase-config';
import { onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword, type User } from 'firebase/auth';

// ----------------------------------------------------
// (헬퍼 컴포넌트)
// ----------------------------------------------------
interface TitleDescProps { title: string; description?: string; }
const TitleWithDescription: React.FC<TitleDescProps> = ({ title, description }) => (
  <div className="title-desc-wrapper">
    <p className="field-title">{title}</p>
    {description && (
      <p className="field-description">{description}</p>
    )}
  </div>
);
// ----------------------------------------------------

const PasswordChangePage: React.FC = () => {
  const navigate = useNavigate();

  // --- 1. MyPage의 반응형/메뉴 상태 로직 (그대로 사용) ---
  const [selectedMenu, setSelectedMenu] = useState('menu1');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768); 

  useEffect(() => {
    const handleResize = () => {
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile);
      if (!isCurrentlyMobile) {
          setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMenuSelect = (key: string) => { setSelectedMenu(key); };
  const handleHamburgerPressed = () => { setIsMobileMenuOpen(true); };
  const handleMenuClose = () => { setIsMobileMenuOpen(false); };

  // --- 2. 비밀번호 변경 로직 (변경 없음) ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        alert("로그인이 필요합니다.");
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const validatePassword = (password: string): boolean => {
    let types = 0;
    if (/[A-Za-z]/.test(password)) types++; // 영문
    if (/\d/.test(password)) types++; // 숫자
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(password)) types++; // 특수문자
    
    return password.length >= 8 && password.length <= 16 && types >= 2;
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !currentUser.email) {
      alert("사용자 정보가 없습니다. 다시 로그인해주세요.");
      return;
    }

    const currentPass = currentPasswordRef.current?.value || '';
    const newPass = newPasswordRef.current?.value || '';
    const confirmPass = confirmPasswordRef.current?.value || '';

    if (!currentPass || !newPass || !confirmPass) {
      alert("모든 필드를 입력해주세요.");
      return;
    }
    if (newPass !== confirmPass) {
      alert("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    if (!validatePassword(newPass)) {
      alert('새 비밀번호는 8~16자, 영문/숫자/특수문자 중 2가지 이상을 조합해야 합니다.');
      return;
    }

    setIsLoading(true);

    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPass);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPass);

      alert("비밀번호가 성공적으로 변경되었습니다. 다시 로그인해주세요.");
      await auth.signOut();
      navigate('/login');

    } catch (error: any) {
      console.error("비밀번호 변경 오류:", error);
      if (error.code === 'auth/wrong-password') {
        alert('현재 비밀번호가 일치하지 않습니다.');
      } else if (error.code === 'auth/weak-password') {
        alert('새 비밀번호가 너무 약합니다. (Firebase 기준)');
      } else {
        alert(`오류가 발생했습니다: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };


  return (
    // 'page-container' (HomePage.css) : 스티키 푸터 레이아웃
    <div className="page-container">
      
      {/* [⭐ 추가] 
          모바일이 아닐 때만 RoleHeader를 렌더링합니다. 
      */}
      {!isMobile && <RoleHeader />}

      {/* 1. 헤더 */}
      <Header
        onMenuSelected={handleMenuSelect}
        isMobile={isMobile}
        onHamburgerPressed={handleHamburgerPressed}
      />

      {/* 2. 서브메뉴 (데스크톱 전용) */}
      {!isMobile && <SubNav selectedMenuKey={selectedMenu} />}

      {/* 3. 메인 콘텐츠 */}
      {/* 'main-content' (HomePage.css) : 스티키 푸터 레이아웃 */}
      <main className="main-content">
        
        {/* 'signup-page-container' (PasswordChangePage.css) : 폼 레이아웃 */}
        <div className="signup-page-container">
          <div className="signup-box-wrapper">
            
            {/* 'signup-form' (PasswordChangePage.css) : 폼 스타일 */}
            <form className="signup-form" onSubmit={handleChangePassword}>
              
              <div style={{ height: '30px' }}></div> {/* (임시 상단 간격) */}

              {/* --- 1. 현재 비밀번호 --- */}
              <TitleWithDescription title="현재 비밀번호" />
              <input 
                type="password" 
                placeholder="현재 비밀번호" 
                ref={currentPasswordRef} 
                className="signup-input" // (CSS 적용)
                required 
              />
              <div className="spacing-narrow"></div>

              {/* --- 2. 새 비밀번호 --- */}
              <TitleWithDescription 
                title="새 비밀번호" 
                description="8~16자, 영문/숫자/특수문자 중 2가지 이상을 조합해주세요." 
              />
              <input 
                type="password" 
                placeholder="새 비밀번호" 
                ref={newPasswordRef} 
                className="signup-input" // (CSS 적용)
                required 
              />
              <div className="spacing-narrow"></div>

              {/* --- 3. 새 비밀번호 확인 --- */}
              <TitleWithDescription title="새 비밀번호 확인" />
              <input 
                type="password" 
                placeholder="새 비밀번호 재확인" 
                ref={confirmPasswordRef} 
                className="signup-input" // (CSS 적용)
                required 
              />
              <div className="spacing-medium"></div>
              
              <div style={{ height: '30px' }}></div> 

              {/* --- 최종 변경 버튼 --- */}
              <button
                type="submit"
                className="final-signup-button" // (CSS 적용)
                style={{ backgroundColor: K_BRAND_COLOR, borderRadius: '5px' }}
                disabled={isLoading}
              >
                {isLoading ? '변경 중...' : '비밀번호 변경'}
              </button>
              
              <div className="spacing-medium"></div>

              {/* --- 마이페이지로 돌아가기 --- */}
              <button
                type="button"
                className="back-to-login-btn" // (CSS 적용)
                onClick={() => navigate('/mypage')} 
              >
                마이페이지로 돌아가기
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* 4. 푸터 */}
      <Footer /> 

      {/* 5. 모바일 메뉴 (오버레이) */}
      {isMobileMenuOpen && isMobile && (
        <MobileMenu 
            onClose={handleMenuClose}
        />
      )}
    </div>
  );
};

export default PasswordChangePage;