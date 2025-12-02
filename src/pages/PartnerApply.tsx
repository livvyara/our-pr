import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/common/Header';
import SubNav from '../components/common/SubNav';
import MobileMenu from '../components/common/MobileMenu';
import Footer from '../components/common/Footer';
import RoleHeader from '../components/common/RoleHeader';
import './partnerApply.css'; 

// 이미지 에셋
const IMG_DASHBOARD = "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop";
const IMG_SCHEDULE = "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?q=80&w=800&auto=format&fit=crop";
const IMG_MOBILE = "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?q=80&w=800&auto=format&fit=crop";

const PartnerApply: React.FC = () => {
  const navigate = useNavigate();
  const [selectedMenu, setSelectedMenu] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      const isCurrentlyMobile = window.innerWidth < 768;
      setIsMobile(isCurrentlyMobile);
      if (!isCurrentlyMobile) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="pa-page-container">
      {!isMobile && <RoleHeader />}
      <Header onMenuSelected={setSelectedMenu} isMobile={isMobile} onHamburgerPressed={() => setIsMobileMenuOpen(true)} />
      {!isMobile && <SubNav selectedMenuKey={selectedMenu} />}

      <div className="pa-main-wrapper">
        <div className="pa-container">
          
          {/* Header Section */}
          <div className="pa-header-section">
            <h1 className="pa-title">파트너 프로그램</h1>
            <div className="pa-divider-long"></div> {/* CSS에서 제어 */}
            <p className="pa-desc">성공적인 비즈니스를 위한 최적의 솔루션</p>
          </div>

          {/* Features Grid */}
          <div className="pa-grid-wrapper">
            <div className="pa-feature-card">
              <div className="pa-card-img">
                <img src={IMG_DASHBOARD} alt="Dashboard" />
              </div>
              <div className="pa-card-body">
                <div className="pa-card-header">
                  <span className="pa-badge">MANAGEMENT</span>
                  <h3>통합 대시보드</h3>
                </div>
                <p className="pa-card-desc">
                  흩어져 있던 현장 데이터를 한곳에 모았습니다.<br/>
                  매출, 일정, 고객 요청사항을 한눈에 파악하고 데이터 기반의 의사결정을 내리세요.
                </p>
              </div>
            </div>

            <div className="pa-feature-card">
              <div className="pa-card-img">
                <img src={IMG_SCHEDULE} alt="Schedule" />
              </div>
              <div className="pa-card-body">
                <div className="pa-card-header">
                  <span className="pa-badge">FINANCE</span>
                  <h3>정산 & 계약 관리</h3>
                </div>
                <p className="pa-card-desc">
                  복잡한 세금계산서 발행과 정산 업무를 자동화했습니다.<br/>
                  불필요한 행정 업무를 줄이고, 오직 시공과 디자인 본질에만 집중하세요.
                </p>
              </div>
            </div>

            <div className="pa-feature-card">
              <div className="pa-card-img">
                <img src={IMG_MOBILE} alt="Mobile" />
              </div>
              <div className="pa-card-body">
                <div className="pa-card-header">
                  <span className="pa-badge">NETWORK</span>
                  <h3>성장하는 네트워크</h3>
                </div>
                <p className="pa-card-desc">
                  검증된 시공팀, 자재 업체와의 네트워킹을 지원합니다.<br/>
                  신뢰할 수 있는 파트너들과 연결되어 비즈니스의 영역을 무한히 확장하세요.
                </p>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="pa-cta-box">
            <div className="pa-cta-content">
              <h2>지금 바로 합류하세요</h2>
              <p>아워프로젝트의 검증된 파트너가 되어 더 큰 성공을 만들어가세요.</p>
            </div>
            <button className="pa-btn-apply" onClick={() => navigate('/apply/partner')}>
              파트너 신청하기
            </button>
          </div>

        </div>
      </div>

      <Footer />
      {isMobileMenuOpen && isMobile && <MobileMenu onClose={() => setIsMobileMenuOpen(false)} />}
    </div>
  );
};

export default PartnerApply;