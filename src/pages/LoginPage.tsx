// src/pages/LoginPage.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { K_BRAND_COLOR } from '../constants'; 
import './LoginPage.css';

// ... (Firebase G imports) ...
import { 
  signInWithEmailAndPassword, 
  setPersistence, 
  browserLocalPersistence, 
  browserSessionPersistence 
} from 'firebase/auth'; 
import { auth } from '../firebase-config';
import logoImage from '../assets/logo.png';
import RoleHeader from '../components/common/RoleHeader';

// ... (SnsIcon 컴포넌트) ...
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saveId, setSaveId] = useState(false);
  const [autoLogin, setAutoLogin] = useState(false);
  const [isLoading, setIsLoading] = useState(false); 

  // [⭐ 1. 추가] isMobile 상태 (HomePage.tsx와 동일)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // [⭐ 2. 추가] 반응형 및 저장된 이메일 로드 useEffect
  useEffect(() => {
    // 2-1. 저장된 이메일 불러오기
    const savedEmail = localStorage.getItem('savedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setSaveId(true);
    }

    // 2-2. 윈도우 크기 변경 이벤트 핸들러 (isMobile 상태 관리)
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    // 컴포넌트 언마운트 시 리스너 제거
    return () => window.removeEventListener('resize', handleResize);

  }, []); // 빈 배열: 마운트 시 1회만 실행

  // ... (handleLogin, handleNavigation 함수는 동일) ...
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    if (!email || !password) {
        alert('이메일과 비밀번호를 입력해주세요.');
        setIsLoading(false);
        return;
    }

    try {
      const persistence = autoLogin 
        ? browserLocalPersistence
        : browserSessionPersistence; 

      await setPersistence(auth, persistence);
      
      await signInWithEmailAndPassword(auth, email, password);
        
      if (saveId) {
        localStorage.setItem('savedEmail', email);
      } else {
        localStorage.removeItem('savedEmail');
      }

      navigate('/');
        
    } catch (error: any) {
        let message = '로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.';
        
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            message = '존재하지 않는 이메일이거나 비밀번호가 일치하지 않습니다.';
        } else if (error.code === 'auth/invalid-email') {
            message = '유효하지 않은 이메일 형식입니다.';
        }
        
        alert(message);
        console.error(error); 
        
    } finally {
        setIsLoading(false);
    }
  };

  const handleNavigation = (path: string) => {
      navigate(path);
  };

  return (
    <div className="login-page-container">
      {/* [수정] RoleHeader를 폼 바깥으로 이동 (페이지 상단 고정) */}
      {!isMobile && <RoleHeader />}

      <div className="login-box-wrapper">
        <form onSubmit={handleLogin} className="login-form">
          
          {/* [수정] RoleHeader를 폼 내부에서 제거 */}

          {/* 1. 로고 */}
          <Link to="/"> 
            <img src={logoImage} alt="My WebApp Logo" className="logo-image" />
          </Link>
          <div style={{ height: '48px' }}></div>

          {/* ... (이하 나머지 JSX 코드는 모두 동일) ... */}
          <input 
            type="email" 
            placeholder="이메일" 
            className="login-input" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required 
          />
          <div style={{ height: '16px' }}></div>
          <input 
            type="password" 
            placeholder="비밀번호" 
            className="login-input" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required 
          />
          
          <div style={{ height: '12px' }}></div>
          <div className="login-options">
            <label>
              <input 
                type="checkbox" 
                checked={saveId} 
                onChange={(e) => setSaveId(e.target.checked)} 
              />
              아이디 저장
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={autoLogin} 
                onChange={(e) => setAutoLogin(e.target.checked)} 
              />
              자동로그인
            </label>
          </div>
          <div style={{ height: '24px' }}></div>

          <button 
            type="submit"
            className="login-submit-btn"
            style={{ backgroundColor: K_BRAND_COLOR, borderRadius: '5px' }}
            disabled={isLoading}
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
          <div style={{ height: '16px' }}></div>

          <div className="link-row">
            <button 
              type="button"
              className="link-button" 
              onClick={() => handleNavigation('/find-id')}
            >
              아이디 찾기
            </button>
            <span className="divider-text">|</span>
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
              onClick={() => handleNavigation('/signup')} 
            >
              회원가입
            </button>
          </div>
          <div style={{ height: '32px' }}></div>

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