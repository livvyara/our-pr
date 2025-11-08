// src/components/common/MobileMenu.tsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { kAppMenus } from '../../types/menuData'; 
import { K_BRAND_COLOR } from '../../constants';
import './MobileMenu.css'; // 스타일링을 위한 CSS 파일 임포트

// Props 타입 정의: 닫기 함수를 필수로 받습니다.
interface MobileMenuProps {
  onClose: () => void;
}

const MobileMenu: React.FC<MobileMenuProps> = ({ onClose }) => {
  const navigate = useNavigate();
  // 확장된 메뉴의 키를 저장하는 상태 (Flutter의 ExpansionTile 역할)
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  // 메뉴 타이틀 클릭 핸들러 (서브 메뉴 토글)
  const handleMenuClick = (key: string) => {
    setOpenMenuKey(openMenuKey === key ? null : key);
  };
  
  // 라우팅 및 메뉴 닫기 핸들러 (GoRouter goNamed 역할)
  const handleNavigation = (path: string) => {
    navigate(path);
    onClose(); // Flutter의 Navigator.pop(context) 역할
  };

  return (
    // 오버레이 및 Drawer 배경 역할
    <div className="mobile-menu-overlay" onClick={onClose}>
      {/* Drawer 내부 컨텐츠 (오버레이 클릭 시 닫히지 않도록 이벤트 전파 막음) */}
      <div className="mobile-menu-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="logo-text">My WebApp Logo</div>
          <button className="close-button" onClick={onClose}>
            X
          </button>
        </div>
        
        <div className="auth-area">
          {/* 1. 로그인 버튼 */}
          <button 
            className="auth-button login-btn"
            onClick={() => handleNavigation('/login')} 
          >
            로그인
          </button>

          {/* 2. 회원가입 버튼 (kBrandColor 및 래디우스 5 적용) */}
          <button 
            className="auth-button signup-btn"
            style={{ 
              backgroundColor: K_BRAND_COLOR, 
              borderRadius: '5px', // 저장된 요청 반영
              color: 'black',
            }}
            onClick={() => handleNavigation('/signup')} 
          >
            회원가입
          </button>
        </div>

        <div className="menu-list">
          {kAppMenus.map((menu) => (
            <div key={menu.key} className="menu-item">
              {/* ExpansionTile의 타이틀 부분 */}
              <button 
                className="menu-title-button" 
                onClick={() => handleMenuClick(menu.key)}
              >
                <span>{menu.title}</span>
                {/* trailing 역할: 서브 메뉴가 있으면 아이콘 표시 */}
                {menu.subMenus.length > 0 && <span>{openMenuKey === menu.key ? '▲' : '▼'}</span>}
              </button>

              {/* ExpansionTile의 Children 부분 */}
              {openMenuKey === menu.key && menu.subMenus.length > 0 && (
                <div className="sub-menu-list">
                  {menu.subMenus.map((subMenuTitle, index) => (
                    <div 
                      key={index} 
                      className="sub-menu-item"
                      onClick={() => { /* 서브 메뉴 이동 로직 */ onClose(); }}
                    >
                      {subMenuTitle}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          
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