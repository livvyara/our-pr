// src/components/common/Header.tsx

import React from 'react';
import { useNavigate } from 'react-router-dom'; // GoRouter 대신 useNavigate 사용
import { kAppMenus } from '../../types/menuData'; 
import { CONTENT_MAX_WIDTH, K_BRAND_COLOR } from '../../constants';
import './Header.css'; // 스타일링을 위한 CSS 파일 임포트

// Props 타입 정의: Flutter의 CommonAppBar1 생성자 인수와 동일
interface HeaderProps {
  onMenuSelected: (key: string) => void;
  isMobile: boolean; // 반응형 처리를 부모에서 받아옴
  onHamburgerPressed: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  onMenuSelected, 
  isMobile, 
  onHamburgerPressed 
}) => {
  const navigate = useNavigate(); // GoRouter.goNamed 대신 React Router의 navigate 사용

  // ----------------------------------------------------
  // 모바일 뷰 (_buildMobileAppBar)
  // ----------------------------------------------------
  if (isMobile) {
    return (
      <header className="mobile-header">
        <button className="menu-icon" onClick={onHamburgerPressed}>
          ☰ {/* Icons.menu 대신 유니코드 문자 또는 SVG 사용 */}
        </button>
        <div className="logo">
          My WebApp Logo
        </div>
        {/* actions: SizedBox(width: 56.0) 역할 (여백 유지) */}
        <div style={{ width: '56px' }}></div> 
      </header>
    );
  }

  // ----------------------------------------------------
  // 데스크톱 뷰 (_buildDesktopAppBar)
  // ----------------------------------------------------
  return (
    <header className="desktop-header">
      <div className="desktop-header-content" style={{ maxWidth: CONTENT_MAX_WIDTH }}>
        
        {/* 로고 */}
        <div className="logo">
          My WebApp Logo
        </div>
        
        {/* 메뉴 */}
        <nav className="main-nav">
          {kAppMenus.map((menu) => (
            <button
              key={menu.key}
              className="menu-button"
              onClick={() => onMenuSelected(menu.key)}
            >
              {menu.title}
            </button>
          ))}
        </nav>

        {/* 검색창, 로그인/회원가입 */}
        <div className="actions">
          {/* 검색창 */}
          <div className="search-container">
            <input type="text" placeholder="검색..." />
          </div>

          {/* 로그인 버튼 */}
          <button 
            className="login-button"
            onClick={() => navigate('/login')} // GoRouter.goNamed('login') 대신 경로 사용
          >
            로그인
          </button>
          
          {/* 회원가입 버튼 (배경색 버튼: radius 5 적용) */}
          <button 
            className="signup-button"
            style={{ backgroundColor: K_BRAND_COLOR, borderRadius: '5px' }} // 저장된 요청 반영
            onClick={() => navigate('/signup')} // GoRouter.goNamed('signup') 대신 경로 사용
          >
            회원가입
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;