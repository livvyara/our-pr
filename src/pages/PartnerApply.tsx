// src/pages/PartnerApply.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// 공통 컴포넌트
import Header from '../components/common/Header';
import SubNav from '../components/common/SubNav';
import MobileMenu from '../components/common/MobileMenu'; 
import Footer from '../components/common/Footer';
import RoleHeader from '../components/common/RoleHeader';
import { K_BRAND_COLOR, CONTENT_MAX_WIDTH } from '../constants'; 

// CSS
import './HomePage.css'; // 스티키 푸터 레이아웃 (필수)
import './partnerApply.css'; // 탭 전용 CSS

// ----------------------------------------------------
// 탭 콘텐츠 데이터 정의
// ----------------------------------------------------
const tabsData = [
  {
    key: 'partner',
    title: '파트너 신청하기',
    contentTitle: '인테리어 업체이신가요?',
    // [수정] <p> 태그 대신 React Fragment(<>)를 사용합니다.
    description: <>아워프로젝트가 제공하는 강력한 기능으로 <br />고객 관리 및 포트폴리오를 관리해보세요.</>,
    buttonText: '파트너 신청하기'
  },
]
// ----------------------------------------------------


const PartnerApply: React.FC = () => {
    const navigate = useNavigate();
  // --- 1. HomePage의 반응형/메뉴 상태 로직 ---
  const [selectedMenu, setSelectedMenu] = useState('menu3'); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768); 

  useEffect(() => {
    const handleResize = () => {
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile);
      if (!isCurrentlyMobile) {
          setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMenuSelect = (key: string) => { setSelectedMenu(key); };
  const handleHamburgerPressed = () => { setIsMobileMenuOpen(true); };
  const handleMenuClose = () => { setIsMobileMenuOpen(false); };

  // --- 2. [신규] 탭 상태 관리 ---
  const [activeTab, setActiveTab] = useState('partner'); // 기본 탭
  
  // 현재 활성화된 탭의 콘텐츠 데이터 찾기
  const currentTabData = tabsData.find(tab => tab.key === activeTab) || tabsData[0];

  return (
    <div className="page-container">
      
      {!isMobile && <RoleHeader />}

      <Header
        onMenuSelected={handleMenuSelect}
        isMobile={isMobile}
        onHamburgerPressed={handleHamburgerPressed}
      />
      
      {!isMobile && <SubNav selectedMenuKey={selectedMenu} />}

      {/* --- 3. [수정] <main> 영역에 래퍼 추가 --- */}
      <main className="main-content" style={{ padding: isMobile ? '16px' : '32px 20px' }}>
        
        {/* [ ⭐⭐ 1. 여기를 수정하세요 ⭐⭐ ] */}
        {/* className을 "partner-apply"로 변경 */}
        {/* 불필요한 인라인 style 제거 */}
        <div className="partner-apply">

          {/* 3-1. 탭 네비게이션 */}
          <div className="tab-nav-container">
            {tabsData.map(tab => (
              <button
                key={tab.key}
                className={`tab-nav-button ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.title}
              </button>
            ))}
          </div>

          {/* 3-2. 탭 콘텐츠 */}
          <div className="tab-content-area">
            <h3 className="tab-content-title">{currentTabData.contentTitle}</h3>
            
            <p className="tab-content-description">{currentTabData.description}</p>
            
            {/* 사용자가 수정한 이미지 갤러리 (그대로 유지) */}
            <div className="tab-image-gallery">
              <div className="image-placeholder">이미지 1</div>
              <h3 className="tab-content-title" style={{ fontSize: '20px', marginTop: '20px' }} 
              >그림1 설명 </h3>
            <p className="tab-content-description" style={{ fontSize: '15px' }} >
                그림1 설명
            </p>
              <div className="image-placeholder">이미지 2</div>
              <h3 className="tab-content-title" style={{ fontSize: '20px', marginTop: '20px' }} 
              >그림2 설명 </h3>
            <p className="tab-content-description" style={{ fontSize: '15px' }} >
                그림2 설명
            </p>
              <div className="image-placeholder">이미지 3</div>
              <h3 className="tab-content-title" style={{ fontSize: '20px', marginTop: '20px' }} 
              >그림3 설명 </h3>
            <p className="tab-content-description" style={{ fontSize: '15px' }} >
                그림3 설명
            </p>
            </div>

            {/* [⭐ 수정] 여기가 오류가 발생한 버튼입니다. */}
            <button
              className="apply-button"
              style={{ 
                backgroundColor: K_BRAND_COLOR, 
                borderRadius: '5px'
              }}
              onClick={() => { 
                if (activeTab === 'partner') {
                  navigate('/apply/partner'); // 파트너 폼으로 이동
                } else if (activeTab === 'seller') {
                  // navigate('/apply/seller'); // (셀러 폼 경로)
                } else if (activeTab === 'contract') {
                  // navigate('/apply/contract'); // (협력사 폼 경로)
                }
              }}
            >
              {currentTabData.buttonText}
            </button> 
            {/* [⭐ 수정] 닫는 태그가 </button> 인지 확인 */}
            
          </div>
        </div> {/* 래퍼 닫기 */}
      </main>

      <Footer /> 
      
      {/* 모바일 메뉴 오버레이 */}
      {isMobileMenuOpen && isMobile && (
        <MobileMenu onClose={handleMenuClose} />
      )}
    </div>
  );
};

export default PartnerApply;