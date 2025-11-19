// src/pages/HomePage.tsx

import React, { useState, useEffect } from 'react';
import Header from '../components/common/Header';
import SubNav from '../components/common/SubNav';
import MobileMenu from '../components/common/MobileMenu'; 
import Footer from '../components/common/Footer';
import RoleHeader from '../components/common/RoleHeader';
import { useMenu } from '../contexts/MenuContext';
import './HomePage.css'; 

const HomePage: React.FC = () => {
  const { mainMenus, isLoading } = useMenu();
  const [selectedMenu, setSelectedMenu] = useState(''); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768); 

  useEffect(() => {
    if (!isLoading && mainMenus.length > 0 && selectedMenu === '') {
      setSelectedMenu(mainMenus[0].key);
    }
  }, [isLoading, mainMenus, selectedMenu]);

  useEffect(() => {
    const handleResize = () => {
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile);
      if (!isCurrentlyMobile) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // [⭐ 핵심 수정] 메뉴 클릭 시 페이지 이동 없이 상태값만 변경
  const handleMenuSelect = (key: string) => {
    // navigate('/some-path'); << 이 코드가 있다면 반드시 삭제하세요!
    setSelectedMenu(key); // 오직 상태만 변경 -> SubNav가 리렌더링됨
  };

  return (
    <div className="page-container">
      {!isMobile && <RoleHeader />}
      
      <Header
        onMenuSelected={handleMenuSelect}
        isMobile={isMobile}
        onHamburgerPressed={() => setIsMobileMenuOpen(true)}
      />

      {/* selectedMenu 상태에 따라 SubNav 내용만 바뀝니다 */}
      {!isMobile && selectedMenu && (
        <SubNav selectedMenuKey={selectedMenu} />
      )}

      <main className="main-content" style={{ padding: isMobile ? '16px' : '32px 0' }}>
        <h2 style={{ maxWidth: 1160, margin: '0 auto', padding: '0 20px' }}>
          {isLoading ? '로딩 중...' : selectedMenu ? `선택된 메뉴: ${mainMenus.find(m=>m.key===selectedMenu)?.title}` : ''}
        </h2>
        
        <div style={{ maxWidth: 1160, margin: '20px auto', padding: '0 20px', border: '1px dashed #ccc', minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            홈페이지 메인 콘텐츠가 표시될 영역입니다.
        </div>
      </main>

      <Footer /> 
      {isMobileMenuOpen && isMobile && <MobileMenu onClose={() => setIsMobileMenuOpen(false)} />}
    </div>
  );
};

export default HomePage;