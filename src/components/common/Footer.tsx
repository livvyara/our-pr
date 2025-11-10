import React from 'react';
import './Footer.css'; // 푸터 전용 CSS를 임포트합니다.

const Footer: React.FC = () => {
  return (
    <footer className="footer-container">
      <div className="footer-content">
        <div className="footer-info">
          <span>(주) 아워프로젝트 | 대표: 홍길동 | 사업자등록번호: 123-45-67890</span>
          <span>주소: 개발중인 플랫폼 입니다.</span>
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