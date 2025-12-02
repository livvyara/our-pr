import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { K_BRAND_COLOR } from '../../constants';
import './MobileMenu.css'; 

import { auth } from '../../firebase-config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { useMenu } from '../../contexts/MenuContext';
import logoSrc from '../../assets/logo.png';

interface MobileMenuProps {
  onClose: () => void;
}

const MobileMenu: React.FC<MobileMenuProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const { mainMenus, subMenus: subMenusMap } = useMenu();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      onClose();
      navigate('/');
    } catch (error) {
      console.error("로그아웃 중 오류 발생:", error);
    }
  };

  const handleMenuClick = (key: string) => {
    setOpenMenuKey(openMenuKey === key ? null : key);
  };
  
  const handleNavigation = (path: string) => {
    navigate(path);
    onClose(); 
  };

  return (
    <div className="mobile-menu-overlay" onClick={onClose}>
      <div className="mobile-menu-drawer" onClick={(e) => e.stopPropagation()}>
        
        {/* 헤더 */}
        <div className="drawer-header">
          <div className="mobile-menu-logo-container" onClick={() => handleNavigation('/')}>
              <img src={logoSrc} alt="Logo" className="mobile-menu-logo" />
          </div>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>
        
        {/* 메뉴 리스트 (위치를 Auth 위로 올릴 수도 있지만, 요청하신 디자인 흐름상 Auth가 상단에 있는 경우가 많아 유지하거나 조정 가능합니다. 여기서는 기존 흐름 유지하되 디자인만 개선) */}
        
        {/* 인증 영역 */}
        <div className="auth-area">
          {currentUser ? (
            <>
              <button className="auth-button login-btn" onClick={handleLogout}>
                로그아웃
              </button>
              <button 
                className="auth-button signup-btn"
                style={{ backgroundColor: K_BRAND_COLOR, borderRadius: '5px' }} // User Info: Radius 5
                onClick={() => handleNavigation('/mypage')}
              >
                마이페이지
              </button>
            </>
          ) : (
            <>
              <button className="auth-button login-btn" onClick={() => handleNavigation('/login')}>
                로그인
              </button>
              <button 
                className="auth-button signup-btn"
                style={{ backgroundColor: K_BRAND_COLOR, borderRadius: '5px' }} // User Info: Radius 5
                onClick={() => handleNavigation('/signup')} 
              >
                회원가입
              </button>
            </>
          )}
        </div>

        <div className="menu-list">
          {mainMenus.map((menu) => {
            const subMenus = subMenusMap.get(menu.key) || [];
            const isOpen = openMenuKey === menu.key;
            
            return (
              <div key={menu.key} className="menu-item">
                <button 
                  className="menu-title-button" 
                  onClick={() => handleMenuClick(menu.key)}
                >
                  <span>{menu.title}</span>
                  {/* [변경] 텍스트 화살표 대신 CSS 화살표 적용 */}
                  {subMenus.length > 0 && (
                    <span className={`menu-arrow ${isOpen ? 'open' : ''}`}></span>
                  )}
                </button>

                {isOpen && subMenus.length > 0 && (
                  <div className="sub-menu-list">
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
          
          <div className="menu-item single-item" onClick={() => handleNavigation('/mypage')}>
            마이페이지
          </div>
        </div>

      </div>
    </div>
  );
};

export default MobileMenu;