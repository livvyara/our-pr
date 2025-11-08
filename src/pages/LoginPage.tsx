// src/pages/LoginPage.tsx

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { K_BRAND_COLOR } from '../constants'; 
import './LoginPage.css';

// SNS 아이콘 컴포넌트는 생략하고, 로직에 필요한 부분만 표시합니다.
// ----------------------------------------------------
interface SnsIconProps {
  color: string;
  text: string;
  onClick: () => void;
  textColor?: string;
}

const SnsIcon: React.FC<SnsIconProps> = ({ color, text, onClick, textColor = 'white' }) => {
  return (
    <div 
      className="sns-icon-wrapper"
      onClick={onClick}
      style={{
        backgroundColor: color,
        color: textColor,
        width: '44px', 
        height: '44px',
        borderRadius: '50%',
      }}
    >
      <div className="sns-icon-text">
        {text}
      </div>
    </div>
  );
};
// ----------------------------------------------------

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false); 

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // ... 로그인 로직
    
    setTimeout(() => {
        setIsLoading(false);
    }, 1500);
  };
  
  // GoRouter.context.push() 역할
  const handleNavigation = (path: string) => {
      navigate(path);
  };

  return (
    <div className="login-page-container">
      <div className="login-box-wrapper">
        <form onSubmit={handleLogin} className="login-form">
          
          {/* 1. 로고 */}
          <h1 className="logo-text">My WebApp Logo</h1>
          <div style={{ height: '48px' }}></div>

          {/* 2 & 3. 입력 필드 */}
          <input type="email" placeholder="이메일" ref={emailRef} className="login-input" required />
          <div style={{ height: '16px' }}></div>
          <input type="password" placeholder="비밀번호" ref={passwordRef} className="login-input" required />
          <div style={{ height: '24px' }}></div>

          {/* 4. 로그인 버튼 */}
          <button 
            type="submit"
            className="login-submit-btn"
            style={{ backgroundColor: K_BRAND_COLOR, borderRadius: '5px' }}
            disabled={isLoading}
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
          <div style={{ height: '16px' }}></div>

          {/* 5. 비밀번호 재설정 / 회원가입 */}
          <div className="link-row">
            <button 
              type="button"
              className="link-button" 
              onClick={() => handleNavigation('/reset-password')}
            >
              비밀번호 재설정
            </button>
            <span className="divider-text">|</span>
            <button 
              type="button"
              className="link-button" 
              // ⭐ 회원가입 페이지로 연결
              onClick={() => handleNavigation('/signup')} 
            >
              회원가입
            </button>
          </div>
          <div style={{ height: '32px' }}></div>

          {/* 6 & 7. SNS 아이콘 */}
          <p className="sns-text">SNS계정으로 로그인/회원가입</p>
          <div style={{ height: '16px' }}></div>
          <div className="sns-icons-row">
            <SnsIcon color="#EA4335" text="G" onClick={() => console.log('Google Login')} />
            <div style={{ width: '24px' }}></div>
            <SnsIcon color="#03C75A" text="N" onClick={() => console.log('Naver Login')} />
            <div style={{ width: '24px' }}></div>
            <SnsIcon color="#FFE812" text="K" onClick={() => console.log('Kakao Login')} textColor="rgba(0,0,0,0.87)" /> 
          </div>
          <div style={{ height: '32px' }}></div>
          
          {/* 8. 로그인 문제 */}
          <button 
            type="button"
            className="link-button problem-link" 
            onClick={() => console.log('로그인 문제 해결 페이지')}
          >
            로그인에 문제가 있으세요?
          </button>

        </form>
      </div>
    </div>
  );
};

export default LoginPage;