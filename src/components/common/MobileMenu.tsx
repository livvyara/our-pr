// src/components/common/MobileMenu.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
// [⭐ 1. 삭제] kAppMenus 임포트 삭제
// import { kAppMenus } from '../../types/menuData'; 
import { K_BRAND_COLOR } from '../../constants';
import './MobileMenu.css'; // 스타일링을 위한 CSS 파일 임포트

// Firebase 인증 관련 모듈 임포트
import { auth } from '../../firebase-config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth'; // 'User' 타입을 분리해서 임포트

// [⭐ 2. 추가] useMenu 컨텍스트 임포트
import { useMenu } from '../../contexts/MenuContext';

// Props 타입 정의: 닫기 함수를 필수로 받습니다.
interface MobileMenuProps {
  onClose: () => void;
}

const MobileMenu: React.FC<MobileMenuProps> = ({ onClose }) => {
  const navigate = useNavigate();
  // 확장된 메뉴의 키를 저장하는 상태
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  
  // 현재 사용자 정보 State
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // [⭐ 3. 추가] 컨텍스트에서 동적 메뉴 데이터 가져오기
  const { mainMenus, subMenus: subMenusMap } = useMenu();

  // Firebase 인증 상태 실시간 감지
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []); // 마운트 시 1회만 실행

  // 로그아웃 함수
  const handleLogout = async () => {
    try {
      await signOut(auth);
      onClose(); // 로그아웃 후 메뉴 닫기
      navigate('/'); // 홈으로 이동
    } catch (error) {
      console.error("로그아웃 중 오류 발생:", error);
    }
  };

  // 메뉴 타이틀 클릭 핸들러
  const handleMenuClick = (key: string) => {
    setOpenMenuKey(openMenuKey === key ? null : key);
  };
  
  // 라우팅 및 메뉴 닫기 핸들러
  const handleNavigation = (path: string) => {
    navigate(path);
    onClose(); 
  };

  return (
    // 오버레이 및 Drawer 배경 역할
    <div className="mobile-menu-overlay" onClick={onClose}>
      {/* Drawer 내부 컨텐츠 */}
      <div className="mobile-menu-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="logo-text">My WebApp Logo</div>
          <button className="close-button" onClick={onClose}>
            X
          </button>
        </div>
        
        {/* --- 인증 영역 (로그인 상태에 따라 분기) --- */}
        <div className="auth-area">
          {currentUser ? (
            // --- 1. 로그인 상태일 때 (로그아웃 / 마이페이지) ---
            <>
              <button 
                className="auth-button login-btn"
                onClick={handleLogout} // 로그아웃 실행
              >
                로그아웃
              </button>
              <button 
                className="auth-button signup-btn"
                style={{ 
                  backgroundColor: K_BRAND_COLOR, 
                  borderRadius: '5px', 
                  color: 'black',
                }}
                onClick={() => handleNavigation('/mypage')} // 마이페이지 이동
              >
                마이페이지
              </button>
            </>
          ) : (
            // --- 2. 로그아웃 상태일 때 (로그인 / 회원가입) ---
            <>
              <button 
                className="auth-button login-btn"
                onClick={() => handleNavigation('/login')} 
              >
                로그인
              </button>
              <button 
                className="auth-button signup-btn"
                style={{ 
                  backgroundColor: K_BRAND_COLOR, 
                  borderRadius: '5px', 
                  color: 'black',
                }}
                onClick={() => handleNavigation('/signup')} 
              >
                회원가입
              </button>
            </>
          )}
        </div>

        <div className="menu-list">
          {/* [⭐ 4. 수정] kAppMenus -> mainMenus */}
          {mainMenus.map((menu) => {
            // [⭐ 4. 추가] 현재 메인메뉴의 서브메뉴 목록 가져오기
            const subMenus = subMenusMap.get(menu.key) || [];
            
            return (
              <div key={menu.key} className="menu-item">
                {/* ExpansionTile의 타이틀 부분 */}
                <button 
                  className="menu-title-button" 
                  onClick={() => handleMenuClick(menu.key)}
                >
                  <span>{menu.title}</span>
                  {/* [⭐ 4. 수정] subMenus.length로 변경 */}
                  {subMenus.length > 0 && <span>{openMenuKey === menu.key ? '▲' : '▼'}</span>}
                </button>

                {/* ExpansionTile의 Children 부분 */}
                {openMenuKey === menu.key && subMenus.length > 0 && (
                  <div className="sub-menu-list">
                    {/* [⭐ 5. 수정] subMenu 객체 사용 */}
                    {subMenus.map((subMenu, index) => (
                      <div 
                        key={index} 
                        className="sub-menu-item"
                        onClick={() => handleNavigation(subMenu.path)}
                      >
                        {subMenu.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          
          <hr className="divider" />
          
          {/* 마이페이지 ListTile 역할 */}
          <div 
            className="menu-item single-item"
            onClick={() => handleNavigation('/mypage')}
          >
            마이페이지
          </div>
        </div>

      </div>
    </div>
  );
};

export default MobileMenu;