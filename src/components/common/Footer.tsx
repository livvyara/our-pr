import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

// --- [High-End SVG Icons] ---
const Icons = {
  // 브랜드의 신뢰감을 주는 심플한 로고 마크 (슬로건 옆 장식용)
  BrandMark: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  ),
  ArrowRight: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  )
};

const Footer: React.FC = () => {
  return (
    <footer className="ft-container">
      <div className="ft-content-wrapper">
        
        {/* Top Section: Links & Slogan */}
        <div className="ft-top-section">
          <div className="ft-brand-group">
            <div className="ft-slogan-wrap">
              <span className="ft-icon-box"><Icons.BrandMark /></span>
              <p className="ft-slogan">서로 믿을 수 있는 인테리어 시장 문화를 위해</p>
            </div>
          </div>

          <div className="ft-policy-links">
            <Link to="/terms" className="ft-link-item">이용약관</Link>
            <Link to="/privacy" className="ft-link-item highlight">개인정보처리방침</Link>
          </div>
        </div>

        <div className="ft-divider"></div>

        {/* Bottom Section: Business Info */}
        <div className="ft-bottom-section">
          <div className="ft-biz-info">
            <h3 className="ft-company-name">(주) 730디자인그룹</h3>
            
            {/* Semantic Definition List for Info */}
            <dl className="ft-info-list">
              <div className="ft-info-item">
                <dt>대표이사</dt>
                <dd>홍길동</dd>
              </div>
              <div className="ft-info-item">
                <dt>사업자등록번호</dt>
                <dd>000-00-00000</dd>
              </div>
              <div className="ft-info-item full-width">
                <dt>주소</dt>
                <dd>서울특별시 강남구 00000000</dd>
              </div>
              <div className="ft-info-item full-width">
                <dt>Beta 개발 담당</dt>
                <dd className="ft-contact-value">000-0000-0000</dd>
              </div>
            </dl>
          </div>

          <div className="ft-copyright-area">
            <span className="ft-copy-text">Copyright © 2025 Our Project. All Rights Reserved.</span>
          </div>
        </div>

      </div>
    </footer>
  );
};

export default Footer;