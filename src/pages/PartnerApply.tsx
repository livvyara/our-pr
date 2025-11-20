// src/pages/PartnerApply.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/common/Header';
import SubNav from '../components/common/SubNav';
import MobileMenu from '../components/common/MobileMenu'; 
import Footer from '../components/common/Footer';
import RoleHeader from '../components/common/RoleHeader';
import { K_BRAND_COLOR, CONTENT_MAX_WIDTH } from '../constants'; 
import './HomePage.css'; 
import './partnerApply.css'; 

// [⭐ 추가] 이미지 에셋 (실제 경로에 맞게 수정 필요, 없으면 placeholder 사용)
const IMG_DASHBOARD = "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=800&auto=format&fit=crop"; 
const IMG_SCHEDULE = "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?q=80&w=800&auto=format&fit=crop"; 
// [⭐ 여기를 수정하세요] 더 안정적이고 모바일 현장 관리 느낌이 나는 다른 이미지로 교체
const IMG_APP = "https://images.unsplash.com/photo-1581094794329-c8112a89af12?q=80&w=800&auto=format&fit=crop";
// 다른 대안: "https://images.unsplash.com/photo-1579532501657-3f338d35ed56?q=80&w=800&auto=format&fit=crop"
// 다른 대안: "https://images.unsplash.com/photo-1522204523234-8729aa67e2e6?q=80&w=800&auto=format&fit=crop"
const tabsData = [
  {
    key: 'partner',
    title: '인테리어 파트너',
    contentTitle: '성공적인 비즈니스를 위한 최고의 파트너',
    description: (
      <>
        아워프로젝트는 인테리어 사업에 필요한 모든 도구를 제공합니다.<br/>
        고객 관리부터 현장 관리, 정산까지 한 곳에서 해결하세요.
      </>
    ),
    features: [
      { title: '통합 대시보드', desc: '모든 현황을 한눈에 파악하고 관리하세요.', img: IMG_DASHBOARD },
      { title: '스마트 일정관리', desc: '공정표 자동 생성 및 알림으로 일정을 놓치지 마세요.', img: IMG_SCHEDULE },
      { title: '모바일 현장관리', desc: '언제 어디서나 현장 상황을 체크하고 소통하세요.', img: IMG_APP },
    ],
    buttonText: '파트너 입점 신청하기'
  },
  // (추후 판매자, 시공팀 등 탭 추가 가능)
];


const PartnerApply: React.FC = () => {
  const navigate = useNavigate();
  const [selectedMenu, setSelectedMenu] = useState(''); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768); 
  const [activeTab, setActiveTab] = useState('partner');

  useEffect(() => {
    const handleResize = () => {
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile);
      if (!isCurrentlyMobile) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMenuSelect = (key: string) => setSelectedMenu(key);
  
  const currentTabData = tabsData.find(tab => tab.key === activeTab) || tabsData[0];

  return (
    <div className="page-container">
      {!isMobile && <RoleHeader />}
      <Header onMenuSelected={handleMenuSelect} isMobile={isMobile} onHamburgerPressed={() => setIsMobileMenuOpen(true)} />
      {!isMobile && <SubNav selectedMenuKey={selectedMenu} />}

      <main className="main-content partner-apply-wrapper">
        <div className="partner-apply-container">
          
          {/* 1. 헤더 섹션 */}
          <div className="apply-header">
            <h2>파트너 신청</h2>
            <p>아워프로젝트와 함께 성장할 전문가님을 모십니다.</p>
          </div>

          {/* 2. 탭 네비게이션 */}
          <div className="apply-tabs">
            {tabsData.map(tab => (
              <button
                key={tab.key}
                className={`apply-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.title}
              </button>
            ))}
          </div>

          {/* 3. 탭 콘텐츠 */}
          <div className="apply-content">
            <div className="content-intro">
              <h3>{currentTabData.contentTitle}</h3>
              <p className="intro-desc">{currentTabData.description}</p>
            </div>

            {/* 기능 소개 그리드 (이미지 + 텍스트) */}
            <div className="features-grid">
              {currentTabData.features?.map((feature, idx) => (
                <div key={idx} className="feature-item">
                  <div className="feature-img">
                    <img src={feature.img} alt={feature.title} />
                  </div>
                  <h4>{feature.title}</h4>
                  <p>{feature.desc}</p>
                </div>
              ))}
            </div>

            {/* 하단 CTA 버튼 */}
            <div className="apply-cta">
              <button
                className="btn-apply-large"
                style={{ backgroundColor: K_BRAND_COLOR }}
                onClick={() => { 
                  if (activeTab === 'partner') navigate('/apply/partner');
                  // else navigate(...)
                }}
              >
                {currentTabData.buttonText}
              </button>
              <p className="cta-help">
                * 승인까지 영업일 기준 1~3일이 소요될 수 있습니다.
              </p>
            </div>

          </div>

        </div>
      </main>

      <Footer /> 
      {isMobileMenuOpen && isMobile && <MobileMenu onClose={() => setIsMobileMenuOpen(false)} />}
    </div>
  );
};

export default PartnerApply;