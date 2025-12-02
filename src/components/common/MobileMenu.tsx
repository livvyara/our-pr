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
      console.error("Logout Error:", error);
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
    <div className="mm-overlay" onClick={onClose}>
      <div className="mm-drawer" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="mm-header">
          <div className="mm-logo-container" onClick={() => handleNavigation('/')}>
              <img src={logoSrc} alt="Logo" className="mm-logo" />
          </div>
          <button className="mm-close-btn" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        {/* Auth Area */}
        <div className="mm-auth-area">
          {currentUser ? (
            <>
              <button className="mm-auth-btn login" onClick={handleLogout}>
                로그아웃
              </button>
              <button 
                className="mm-auth-btn signup"
                style={{ backgroundColor: K_BRAND_COLOR }}
                onClick={() => handleNavigation('/mypage')}
              >
                마이페이지
              </button>
            </>
          ) : (
            <>
              <button className="mm-auth-btn login" onClick={() => handleNavigation('/login')}>
                로그인
              </button>
              <button 
                className="mm-auth-btn signup"
                style={{ backgroundColor: K_BRAND_COLOR }}
                onClick={() => handleNavigation('/signup')} 
              >
                회원가입
              </button>
            </>
          )}
        </div>

        {/* Menu List */}
        <div className="mm-list">
          {mainMenus.map((menu) => {
            const subMenus = subMenusMap.get(menu.key) || [];
            const isOpen = openMenuKey === menu.key;
            
            return (
              <div key={menu.key} className="mm-item">
                <button 
                  className={`mm-title-btn ${isOpen ? 'open' : ''}`}
                  onClick={() => handleMenuClick(menu.key)}
                >
                  <span>{menu.title}</span>
                  {subMenus.length > 0 && (
                    <span className={`mm-arrow ${isOpen ? 'open' : ''}`}></span>
                  )}
                </button>

                {isOpen && subMenus.length > 0 && (
                  <div className="mm-sub-list">
                    {subMenus.map((subMenu, index) => (
                      <div 
                        key={index} 
                        className="mm-sub-item"
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
          
          <hr className="mm-divider" />
          
          <div className="mm-item single" onClick={() => handleNavigation('/mypage')}>
            마이페이지
          </div>
        </div>

      </div>
    </div>
  );
};

export default MobileMenu;