// src/components/common/Header.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { kAppMenus } from '../../types/menuData';
import { CONTENT_MAX_WIDTH, K_BRAND_COLOR } from '../../constants';
import './Header.css';
import logoSrc from '../../assets/logo.png';

// Firebase 인증 관련 모듈 추가
import { auth } from '../../firebase-config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth'; // 'User' 타입을 분리해서 임포트

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
      navigate('/'); // 로그아웃 후 홈으로 이동
    } catch (error) {
      console.error("로그아웃 중 오류 발생:", error);
    }
  };

  // --- 모바일 뷰 ---
  if (isMobile) {
    return (
      <header className="mobile-header">
        <button className="menu-icon" onClick={onHamburgerPressed}>
          ☰
        </button>
        
        {/* [수정] div.logo를 Link to="/"로 변경 */}
        <Link to="/" className="logo">
          <img src={logoSrc} alt="My WebApp Logo" className="logo-image" />
        </Link>

        <div style={{ width: '56px' }}></div>
      </header>
    );
  }

  // --- 데스크톱 뷰 ---
  return (
    <header className="desktop-header">
      <div className="desktop-header-content" style={{ maxWidth: CONTENT_MAX_WIDTH }}>

        {/* [수정] div.logo를 Link to="/"로 변경 */}
        <Link to="/" className="logo">
          <img src={logoSrc} alt="My WebApp Logo" className="logo-image" />
        </Link>

        {/* 메뉴 (수정 없음) */}
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

        {/* ⭐ [수정된 부분] ⭐ */}
        <div className="actions">
          {/* 검색창 (수정 없음) */}
          <div className="search-container">
            <input type="text" placeholder="검색..." />
          </div>

          {/* 1. 첫 번째 버튼 (텍스트 버튼) */}
          <button
            className="login-button"
            onClick={
              currentUser 
                ? handleLogout // 로그인 시: 로그아웃
                : () => navigate('/login') // 로그아웃 시: 로그인
            }
          >
            {/* 텍스트만 변경 */}
            {currentUser ? '로그아웃' : '로그인'}
          </button>

          {/* 2. 두 번째 버튼 (브랜드 색상 버튼) */}
          <button
            className="signup-button"
            style={{ backgroundColor: K_BRAND_COLOR, borderRadius: '5px' }}
            onClick={
              currentUser
                ? () => navigate('/mypage') // 로그인 시: 마이페이지
                : () => navigate('/signup') // 로그아웃 시: 회원가입
            }
          >
            {/* 텍스트만 변경 (요청사항 반영: 회원가입 -> 마이페이지) */}
            {currentUser ? '마이페이지' : '회원가입'}
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;