// src/pages/HomePage.tsx

import React, { useState, useEffect } from 'react';
import Header from '../components/common/Header';
import SubNav from '../components/common/SubNav';
import MobileMenu from '../components/common/MobileMenu'; 
// import Footer from '../components/common/Footer'; // 푸터 컴포넌트가 있다면 주석을 해제하세요.

const HomePage: React.FC = () => {
  // 1. 선택된 메인 메뉴 상태 (SubNav 연결용, 초기값은 'menu1'로 설정)
  const [selectedMenu, setSelectedMenu] = useState('menu1'); 
  
  // 2. 모바일 메뉴(Drawer) 상태 관리
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // 3. 반응형 상태 (768px 미만을 모바일로 간주)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768); 

  // --- 반응형 및 상태 관리 로직 ---
  useEffect(() => {
    // 윈도우 크기 변경 이벤트 핸들러
    const handleResize = () => {
      // 너비 768px을 기준으로 모바일/데스크톱 구분
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile);
      
      // 데스크톱으로 전환되면 모바일 메뉴는 자동으로 닫습니다.
      if (!isCurrentlyMobile) {
          setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMenuSelect = (key: string) => {
    // Header에서 메뉴 클릭 시 호출됩니다.
    setSelectedMenu(key);
  };

  const handleHamburgerPressed = () => {
    // Header의 햄버거 버튼 클릭 시 호출됩니다.
    setIsMobileMenuOpen(true);
  };
  
  const handleMenuClose = () => {
    // MobileMenu 내부에서 닫기 요청 시 호출됩니다.
    setIsMobileMenuOpen(false);
  };

  return (
    <div>
      {/* 1. 메인 상단바 (CommonAppBar1) */}
      <Header
        onMenuSelected={handleMenuSelect}
        isMobile={isMobile}
        onHamburgerPressed={handleHamburgerPressed}
      />

      {/* 2. 서브 내비게이션 바 (CommonAppBar2) */}
      {/* 모바일이 아닐 때만 표시 */}
      {!isMobile && <SubNav selectedMenuKey={selectedMenu} />}

      <main style={{ padding: isMobile ? '16px' : '32px 0', minHeight: '80vh' }}>
        {/* 콘텐츠 영역 (maxWidth는 Header/SubNav의 1160px과 일치시키기 위해 임의로 설정) */}
        <h2 style={{ maxWidth: 1160, margin: '0 auto', padding: '0 20px' }}>
            현재 선택된 메뉴: {selectedMenu}
        </h2>
        
        {/* 메인 콘텐츠가 표시될 영역 */}
        <div style={{ maxWidth: 1160, margin: '20px auto', padding: '0 20px', border: '1px dashed #ccc', minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            홈페이지 메인 콘텐츠가 표시될 영역입니다.
        </div>
      </main>

      {/* 3. 모바일 햄버거 메뉴 (CommonDrawer) */}
      {/* 모바일일 때, 메뉴가 열렸을 때만 표시 */}
      {isMobileMenuOpen && isMobile && (
        <MobileMenu 
            onClose={handleMenuClose}
        />
      )}
      
      {/* 4. 푸터 영역 */}
      {/* Footer 컴포넌트가 있다면 아래 주석을 해제하고 isMobile prop을 전달합니다. */}
      {/* <Footer isMobile={isMobile} /> */}
    </div>
  );
};

export default HomePage;