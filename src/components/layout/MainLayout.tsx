import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from '../common/Header';
import SubNav from '../common/SubNav';
import MobileMenu from '../common/MobileMenu';
import Footer from '../common/Footer';
import RoleHeader from '../common/RoleHeader';

const MainLayout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // [핵심 수정] 새로고침 시 초기화되도록 초기값을 빈 문자열('')로 설정
  // URL 감지 useEffect를 삭제하여 자동으로 열리지 않게 함
  const [activeMenuKey, setActiveMenuKey] = useState('');

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // [수동 제어] 헤더에서 메뉴 클릭 시에만 실행됨
  const handleMenuSelect = (key: string) => {
    setActiveMenuKey(key);
  };

  return (
    <div className="page-layout-wrapper">
      {!isMobile && <RoleHeader />}
      
      <Header 
        onMenuSelected={handleMenuSelect} 
        isMobile={isMobile} 
        onHamburgerPressed={() => setIsMobileMenuOpen(true)} 
      />
      
      {/* activeMenuKey가 있을 때만 서브메뉴 노출 */}
      {!isMobile && activeMenuKey && (
        <SubNav selectedMenuKey={activeMenuKey} />
      )}

      <main 
        style={{ 
          paddingTop: isMobile ? '60px' : (activeMenuKey ? '90px' : '40px'), 
          minHeight: '100vh',
          transition: 'padding-top 0.2s ease' 
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