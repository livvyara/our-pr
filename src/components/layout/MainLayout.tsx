import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMenu } from '../../contexts/MenuContext'; 

import Header from '../common/Header';
import SubNav from '../common/SubNav';
import MobileMenu from '../common/MobileMenu';
import Footer from '../common/Footer';
import RoleHeader from '../common/RoleHeader';

const MainLayout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [activeMenuKey, setActiveMenuKey] = useState('');
  
  // 헤더 전체 높이 (본문 밀어내기 용)
  const [headerTotalHeight, setHeaderTotalHeight] = useState(0);
  const headerWrapperRef = useRef<HTMLDivElement>(null);

  const location = useLocation();
  const navigate = useNavigate(); 
  const { mainMenus } = useMenu();

  // 높이 계산 및 리사이즈 감지
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setIsMobileMenuOpen(false);
      
      if (headerWrapperRef.current) {
        setHeaderTotalHeight(headerWrapperRef.current.offsetHeight);
      }
    };

    window.addEventListener('resize', handleResize);
    const timer = setTimeout(handleResize, 100); // 렌더링 후 높이 측정 보정

    const observer = new MutationObserver(() => {
      if (headerWrapperRef.current) {
        setHeaderTotalHeight(headerWrapperRef.current.offsetHeight);
      }
    });

    if (headerWrapperRef.current) {
      observer.observe(headerWrapperRef.current, { childList: true, subtree: true, attributes: true });
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [activeMenuKey, location.pathname]);

  const handleMenuSelect = (key: string) => {
    const selectedMenu = mainMenus.find(menu => menu.key === key);

    if (selectedMenu && selectedMenu.path && selectedMenu.path.trim() !== '') {
      navigate(selectedMenu.path);
      setActiveMenuKey(''); 
    } else {
      setActiveMenuKey(prev => (prev === key ? '' : key));
    }
  };

  return (
    <div className="page-layout-wrapper">
      
      {/* [헤더 그룹 전체] 
         - Flex Column: 자식 요소들을 세로로 배치
         - Fixed: 화면 상단 고정
      */}
      <div 
        id="sticky-header-wrapper"
        ref={headerWrapperRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          zIndex: 99999,
          display: 'flex',       /* [중요] 세로 배치 */
          flexDirection: 'column', /* [중요] 세로 배치 */
          backgroundColor: '#fff', 
          boxShadow: '0 2px 10px rgba(0,0,0,0.05)'
        }}
      >
        {/* 1. 롤 헤더 (맨 위) */}
        <div style={{ position: 'relative', zIndex: 103, flexShrink: 0 }}>
           <RoleHeader />
        </div>
        
        {/* 2. 메인 헤더 (중간) */}
        <div style={{ position: 'relative', zIndex: 102, flexShrink: 0 }}>
          <Header 
            onMenuSelected={handleMenuSelect} 
            isMobile={isMobile} 
            onHamburgerPressed={() => setIsMobileMenuOpen(true)} 
          />
        </div>

        {/* 3. 서브 메뉴 (맨 아래) */}
        {!isMobile && activeMenuKey && (
          <div 
            className="submenu-wrapper"
            style={{ 
              position: 'relative', /* [중요] absolute가 아닌 relative */
              zIndex: 101,          /* 헤더보다 낮아야 자연스러움 */
              backgroundColor: '#fff',
              width: '100%',
              flexShrink: 0
            }}
          >
            <SubNav selectedMenuKey={activeMenuKey} />
          </div>
        )}
      </div>

      {/* [본문 영역] 헤더 그룹 높이만큼 자동 패딩 */}
      <main 
        style={{ 
          paddingTop: headerTotalHeight > 0 ? `${headerTotalHeight}px` : (isMobile ? '56px' : '90px'),
          minHeight: '100vh',
          transition: 'padding-top 0.2s ease-out'
        }}
      >
        <Outlet />
      </main>

      <Footer />
      {isMobileMenuOpen && isMobile && <MobileMenu onClose={() => setIsMobileMenuOpen(false)} />}
    </div>
  );
};

export default MainLayout;