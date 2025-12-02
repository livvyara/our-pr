import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer: React.FC = () => {
  return (
    <footer className="ft-container">
      <div className="ft-inner">
        
        {/* 상단: 정책 링크 */}
        <div className="ft-top-row">
          <div className="ft-links">
            <Link to="/terms">이용약관</Link>
            <span className="ft-divider-vertical">|</span>
            <Link to="/privacy" className="ft-highlight">개인정보처리방침</Link>
          </div>
        </div>

        <div className="ft-divider-horizontal"></div>

        {/* 하단: 기업 정보 및 카피라이트 */}
        <div className="ft-bottom-row">
          <div className="ft-company-info">
            {/* 슬로건 추가 */}
            <p className="ft-slogan">서로 믿을 수 있는 인테리어 시장 문화를 위해</p>

            
            <div className="ft-info-grid">
              <span className="ft-label">상호명</span>
              <span className="ft-value">(주) 730디자인그룹</span>
              <span className="ft-label">사업자등록번호</span>
              <span className="ft-value">250-86-03528</span>
              
              <span className="ft-label">주소</span>
              <span className="ft-value">광주광역시 광산구 장덕동 1639번지 센터빌딩 4층</span>
              
              <span className="ft-label">Beta 개발 담당</span>
              <span className="ft-value">백진교 이사 (010-8173-0730)</span>
            </div>
          </div>
          
          <div className="ft-copyright">
            Copyright © 2025 Our Project. All Rights Reserved.
          </div>
        </div>

      </div>
    </footer>
  );
};

export default Footer;