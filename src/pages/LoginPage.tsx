import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { K_BRAND_COLOR } from '../constants'; 
import './LoginPage.css';

import { 
  signInWithEmailAndPassword, 
  setPersistence, 
  browserLocalPersistence, 
  browserSessionPersistence,
  signOut 
} from 'firebase/auth'; 
import { auth } from '../firebase-config';
import logoImage from '../assets/logo.png';
import RoleHeader from '../components/common/RoleHeader';

// SNS 아이콘 컴포넌트 (미니멀 스타일로 변경)
interface SnsIconProps {
  color: string;
  text: string;
  onClick: () => void;
  textColor?: string;
  label: string; // 접근성 및 툴팁용
}

const SnsIcon: React.FC<SnsIconProps> = ({ color, text, onClick, textColor = 'white', label }) => {
  return (
    <button 
      className="lp-sns-btn"
      onClick={onClick}
      style={{ backgroundColor: color, color: textColor }}
      type="button"
      aria-label={label}
    >
      {text}
    </button>
  );
};

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saveId, setSaveId] = useState(false);
  const [autoLogin, setAutoLogin] = useState(false);
  const [isLoading, setIsLoading] = useState(false); 
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const savedEmail = localStorage.getItem('savedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setSaveId(true);
    }
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []); 

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    if (!email || !password) {
        alert('이메일과 비밀번호를 입력해주세요.');
        setIsLoading(false);
        return;
    }

    try {
      const persistence = autoLogin ? browserLocalPersistence : browserSessionPersistence; 
      await setPersistence(auth, persistence);
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      if (userCredential.user) {
          // Custom Claim 확인
          await userCredential.user.getIdToken(true); 
          const idTokenResult = await userCredential.user.getIdTokenResult();

          if (idTokenResult.claims.bannedUntil) {
              const banMessage = idTokenResult.claims.bannedUntil as string;
              alert(banMessage);
              await signOut(auth);
          } else {
              // 아이디 저장 처리
              if (saveId) {
                localStorage.setItem('savedEmail', email);
              } else {
                localStorage.removeItem('savedEmail');
              }

              // 로그인 후 이동 경로 처리
              const returnUrl = localStorage.getItem('returnTo');
              if (returnUrl) {
                  navigate(returnUrl);
              } else {
                  navigate('/');
              }
          }
      } else {
          throw new Error("사용자 정보를 가져오지 못했습니다.");
      }
        
    } catch (error: any) {
        console.error("로그인 오류:", error.code, error.message);
        let message = '로그인에 실패했습니다. 정보를 확인해주세요.';
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') { 
            message = '이메일 또는 비밀번호가 올바르지 않습니다.';
        } else if (error.code === 'auth/invalid-email') {
            message = '유효하지 않은 이메일 형식입니다.';
        }
        alert(message);
    } finally {
        setIsLoading(false);
    }
  };

  const handleNavigation = (path: string) => {
      navigate(path);
  };

  return (
    <div className="lp-container">
      <div className="lp-wrapper">
        
        {/* Header Section */}
        <div className="lp-header">
          <Link to="/" className="lp-logo-link">
            <img src={logoImage} alt="Logo" className="lp-logo" />
          </Link>
          <h1 className="lp-title">로그인</h1>
          <p className="lp-subtitle">아워프로젝트에 오신 것을 환영합니다.</p>
        </div>

        {/* Form Section */}
        <form onSubmit={handleLogin} className="lp-form">
          <div className="lp-input-group">
            <label htmlFor="email">이메일</label>
            <input 
                id="email"
                type="email" 
                placeholder="example@email.com" 
                className="lp-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
            />
          </div>
          <div className="lp-input-group">
            <label htmlFor="password">비밀번호</label>
            <input 
                id="password"
                type="password" 
                placeholder="비밀번호 입력" 
                className="lp-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
            />
          </div>
          
          <div className="lp-options">
            <div className="lp-checkbox-group">
              <label className="lp-checkbox">
                <input 
                  type="checkbox" 
                  checked={saveId} 
                  onChange={(e) => setSaveId(e.target.checked)} 
                />
                <span className="checkmark"></span>
                아이디 저장
              </label>
              <label className="lp-checkbox">
                <input 
                  type="checkbox" 
                  checked={autoLogin} 
                  onChange={(e) => setAutoLogin(e.target.checked)} 
                />
                 <span className="checkmark"></span>
                자동 로그인
              </label>
            </div>
          </div>

          <button 
            type="submit"
            className="lp-submit-btn"
            disabled={isLoading}
          >
            {isLoading ? '처리 중...' : '로그인'}
          </button>

          <div className="lp-links">
            <button type="button" onClick={() => handleNavigation('/find-id')}>아이디 찾기</button>
            <span className="divider">/</span>
            <button type="button" onClick={() => handleNavigation('/reset-password')}>비밀번호 재설정</button>
            <span className="divider">/</span>
            <button type="button" onClick={() => handleNavigation('/signup')} className="highlight">회원가입</button>
          </div>

          <div className="lp-sns-section">
            <p className="lp-sns-label">SNS 계정으로 시작하기</p>
            <div className="lp-sns-buttons">
              <SnsIcon color="#000000" text="G" label="Google" onClick={() => console.log('Google')} />
              <SnsIcon color="#03C75A" text="N" label="Naver" onClick={() => console.log('Naver')} />
              <SnsIcon color="#FEE500" text="K" label="Kakao" textColor="#000000" onClick={() => console.log('Kakao')} /> 
            </div>
          </div>

        </form>
      </div>
      <div className="lp-footer">
          © OurProject. All rights reserved.
      </div>
    </div>
  );
};

export default LoginPage;