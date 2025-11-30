import React from 'react';
import './Footer.css'; // 푸터 전용 CSS를 임포트합니다.

const Footer: React.FC = () => {
  return (
    <footer className="footer-container">
      <div className="footer-content">
        <div className="footer-info">
          <span>(주) 730디자인그룹 | 사업자등록번호: 250-86-03528</span>
          <span>주소: 광주광역시 광산구 장덕동 1639번지 센터빌딩 4층</span>
          <span>&copy; 2025 Our Project. All Rights Reserved.</span>
        </div>
        <div className="footer-links">
          <a href="/terms">이용약관</a>
          <a href="/privacy">개인정보처리방침</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;