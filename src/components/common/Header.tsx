// src/components/common/Header.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { CONTENT_MAX_WIDTH, K_BRAND_COLOR } from '../../constants';
import './Header.css';
import logoSrc from '../../assets/logo.png';

import { auth } from '../../firebase-config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { useMenu } from '../../contexts/MenuContext'; 

interface HeaderProps {
  onMenuSelected: (key: string) => void;
  isMobile: boolean;
  onHamburgerPressed: () => void;
}

const Header: React.FC<HeaderProps> = ({
  onMenuSelected,
  isMobile,
  onHamburgerPressed
}) => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const { isLoading: isLoadingMenus, mainMenus } = useMenu();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error("로그아웃 중 오류 발생:", error);
    }
  };

  if (isMobile) {
    return (
      <header className="mobile-header">
        <button className="menu-icon" onClick={onHamburgerPressed}>☰</button>
        <Link to="/" className="logo">
          <img src={logoSrc} alt="Logo" className="logo-image" />
        </Link>
        <div style={{ width: '56px' }}></div>
      </header>
    );
  }

  return (
    <header className="desktop-header">
      <div className="desktop-header-content" style={{ maxWidth: CONTENT_MAX_WIDTH }}>
        
        <Link to="/" className="logo">
          <img src={logoSrc} alt="Logo" className="logo-image" />
        </Link>

        <nav className="main-nav">
          {!isLoadingMenus && mainMenus.map((menu) => (
            // [⭐ 핵심 수정] Link 태그를 사용하지 않고 button만 사용합니다.
            // 페이지 이동 없이 onMenuSelected만 호출하여 상위 컴포넌트의 상태만 바꿉니다.
            <button
              key={menu.key}
              className="menu-button"
              onClick={() => onMenuSelected(menu.key)}
            >
              {menu.title}
            </button>
          ))}
          {isLoadingMenus && <div className="menu-button" style={{color: '#999'}}>로딩중...</div>}
        </nav>

        <div className="actions">
          <div className="search-container">
            <input type="text" placeholder="검색..." />
          </div>

          <button
            className="login-button"
            onClick={currentUser ? handleLogout : () => navigate('/login')}
          >
            {currentUser ? '로그아웃' : '로그인'}
          </button>

          <button
            className="signup-button"
            style={{ backgroundColor: K_BRAND_COLOR, borderRadius: '5px' }}
            onClick={currentUser ? () => navigate('/mypage') : () => navigate('/signup')}
          >
            {currentUser ? '마이페이지' : '회원가입'}
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;