// src/pages/HomePage.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/common/Header';
import SubNav from '../components/common/SubNav';
import MobileMenu from '../components/common/MobileMenu'; 
import Footer from '../components/common/Footer';
import RoleHeader from '../components/common/RoleHeader';
import { useMenu } from '../contexts/MenuContext';
import './HomePage.css'; 

// [이미지 에셋 - 실제 프로젝트 경로에 맞게 수정 필요]
// 없는 경우 public 폴더나 assets에 임시 이미지를 넣거나, placeholder 사용
const HERO_BG = "https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=1600&auto=format&fit=crop"; // 임시 배경
const ICON_1 = "https://cdn-icons-png.flaticon.com/512/1040/1040225.png"; // 견적 아이콘
const ICON_2 = "https://cdn-icons-png.flaticon.com/512/2666/2666505.png"; // 일정 아이콘
const ICON_3 = "https://cdn-icons-png.flaticon.com/512/1584/1584892.png"; // 파트너 아이콘

const HomePage: React.FC = () => {
  const navigate = useNavigate();
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

  const handleMenuSelect = (key: string) => {
    setSelectedMenu(key); 
  };

  return (
    <div className="page-container">
      {!isMobile && <RoleHeader />}
      
      <Header
        onMenuSelected={handleMenuSelect}
        isMobile={isMobile}
        onHamburgerPressed={() => setIsMobileMenuOpen(true)}
      />

      {!isMobile && selectedMenu && (
        <SubNav selectedMenuKey={selectedMenu} />
      )}

      {/* [메인 콘텐츠 영역] */}
      <main className="home-content">
        
        {/* 1. 히어로 섹션 (메인 배너) */}
        <section className="hero-section" style={{ backgroundImage: `url(${HERO_BG})` }}>
          <div className="hero-overlay">
            <div className="hero-text-box">
              <h1>인테리어의 모든 과정,<br /><span>아워프로젝트</span> 하나로 해결하세요</h1>
              <p>견적부터 시공, 현장 관리까지. 투명하고 안전한 인테리어 문화를 만들어갑니다.</p>
              <div className="hero-buttons">
                <button className="btn-primary-hero" onClick={() => navigate('/guide/apply')}>파트너 신청하기</button>
                <button className="btn-secondary-hero" onClick={() => navigate('/community/inquiry')}>이용 문의</button>
              </div>
            </div>
          </div>
        </section>

        {/* 2. 핵심 서비스 소개 (카드형) */}
        <section className="features-section">
          <div className="section-title">
            <h2>Why Our Project?</h2>
            <p>복잡한 인테리어 공사, 이제 스마트하게 관리하세요</p>
          </div>
          
          <div className="features-grid">
            <div className="feature-card">
              <div className="icon-wrapper"><img src={ICON_1} alt="견적 관리" /></div>
              <h3>투명한 견적 관리</h3>
              <p>복잡한 엑셀 없이 체계적인 견적서를 작성하고 고객에게 바로 공유하세요.</p>
            </div>
            <div className="feature-card">
              <div className="icon-wrapper"><img src={ICON_2} alt="일정 관리" /></div>
              <h3>스마트한 일정표</h3>
              <p>공사 일정을 한눈에 파악하고, 변경 사항을 실시간으로 고객과 공유합니다.</p>
            </div>
            <div className="feature-card">
              <div className="icon-wrapper"><img src={ICON_3} alt="파트너" /></div>
              <h3>검증된 파트너</h3>
              <p>엄격한 심사를 통과한 전문 파트너들이 안전한 시공을 약속합니다.</p>
            </div>
          </div>
        </section>

        {/* 3. 통계/신뢰 섹션 */}
        <section className="stats-section">
          <div className="stat-item">
            <strong>1,200+</strong>
            <span>누적 현장 수</span>
          </div>
          <div className="stat-item">
            <strong>98%</strong>
            <span>고객 만족도</span>
          </div>
          <div className="stat-item">
            <strong>0건</strong>
            <span>안전 사고</span>
          </div>
          <div className="stat-item">
            <strong>24h</strong>
            <span>빠른 응답</span>
          </div>
        </section>

        {/* 4. 이용 방법 (프로세스) */}
        <section className="process-section">
          <div className="section-title">
            <h2>이용 프로세스</h2>
            <p>아워프로젝트와 함께하는 성공적인 인테리어</p>
          </div>
          <div className="process-steps">
            <div className="step-item">
              <span className="step-num">01</span>
              <h4>회원가입/파트너신청</h4>
              <p>간단한 정보 입력으로<br/>서비스를 시작하세요.</p>
            </div>
            <div className="step-arrow">→</div>
            <div className="step-item">
              <span className="step-num">02</span>
              <h4>현장 등록 & 초대</h4>
              <p>현장을 개설하고<br/>고객(도급인)을 초대하세요.</p>
            </div>
            <div className="step-arrow">→</div>
            <div className="step-item">
              <span className="step-num">03</span>
              <h4>일정/공정 관리</h4>
              <p>작업 일지와 공정을<br/>투명하게 공유하세요.</p>
            </div>
            <div className="step-arrow">→</div>
            <div className="step-item">
              <span className="step-num">04</span>
              <h4>안전한 공사 완료</h4>
              <p>체계적인 관리로<br/>성공적인 마무리를 돕습니다.</p>
            </div>
          </div>
        </section>

        {/* 5. 하단 배너 (CTA) */}
        <section className="cta-section">
          <h2>지금 바로 시작해보세요!</h2>
          <p>인테리어 전문가와 고객을 잇는 가장 확실한 방법</p>
          <button onClick={() => navigate('/login')}>무료로 시작하기</button>
        </section>

      </main>

      <Footer /> 
      {isMobileMenuOpen && isMobile && <MobileMenu onClose={() => setIsMobileMenuOpen(false)} />}
    </div>
  );
};

export default HomePage;