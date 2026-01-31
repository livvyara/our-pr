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

// --- [Premium SVG Icons] ---
const Icons = {
  Check: () => (
    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
      <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Google: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M23.52 12.29C23.52 11.43 23.44 10.61 23.3 9.81H12V14.42H18.47C18.18 15.91 17.32 17.18 16.03 18.03V21.05H19.93C22.19 18.96 23.52 15.89 23.52 12.29Z" fill="#4285F4"/>
      <path d="M12 24C15.24 24 17.96 22.92 19.93 21.05L16.03 18.03C14.95 18.75 13.58 19.18 12 19.18C8.87 19.18 6.22 17.07 5.27 14.22H1.24V17.34C3.21 21.26 7.27 24 12 24Z" fill="#34A853"/>
      <path d="M5.27 14.22C5.03 13.48 4.89 12.69 4.89 11.88C4.89 11.07 5.03 10.28 5.27 9.54V6.42H1.24C0.45 8.01 0 9.88 0 11.88C0 13.88 0.45 15.75 1.24 17.34L5.27 14.22Z" fill="#FBBC05"/>
      <path d="M12 4.58C13.76 4.58 15.34 5.19 16.59 6.38L19.99 2.98C17.96 1.09 15.24 0 12 0C7.27 0 3.21 2.74 1.24 6.66L5.27 9.78C6.22 6.93 8.87 4.58 12 4.58Z" fill="#EA4335"/>
    </svg>
  ),
  Naver: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" d="M16.2733 12.8453L7.38203 0H0V24H7.72695V11.1547L16.618 24H24V0H16.2733V12.8453Z" fill="white"/>
    </svg>
  ),
  Kakao: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 3C6.48 3 2 6.36 2 10.5C2 13.08 3.65 15.38 6.18 16.69L5.34 19.8C5.25 20.13 5.61 20.39 5.89 20.21L10.02 17.46C10.66 17.54 11.32 17.58 12 17.58C17.52 17.58 22 14.22 22 10.08C22 5.94 17.52 3 12 3Z" fill="#3C1E1E"/>
    </svg>
  )
};

// SNS 아이콘 컴포넌트 (디자인 개선)
interface SnsIconProps {
  icon: React.ReactNode;
  onClick: () => void;
  label: string;
  bgColor?: string;
  borderColor?: string;
}

const SnsButton: React.FC<SnsIconProps> = ({ icon, onClick, label, bgColor = '#fff', borderColor = 'transparent' }) => {
  return (
    <button 
      className="lp-sns-btn"
      onClick={onClick}
      style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}` }}
      type="button"
      aria-label={`${label} 로그인`}
    >
      {icon}
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
          <p className="lp-subtitle">730디자인그룹에 오신 것을 환영합니다.</p>
        </div>

        {/* Form Section */}
        <form onSubmit={handleLogin} className="lp-form">
          <div className="lp-input-group">
            <label htmlFor="email">이메일</label>
            <div className="lp-input-field">
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
          </div>
          <div className="lp-input-group">
            <label htmlFor="password">비밀번호</label>
            <div className="lp-input-field">
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
          </div>
          
          <div className="lp-options">
            <label className="lp-checkbox-container">
                <input 
                  type="checkbox" 
                  checked={saveId} 
                  onChange={(e) => setSaveId(e.target.checked)} 
                />
                <div className="lp-checkmark">
                    <Icons.Check />
                </div>
                <span className="lp-checkbox-label">아이디 저장</span>
            </label>
            <label className="lp-checkbox-container">
                <input 
                  type="checkbox" 
                  checked={autoLogin} 
                  onChange={(e) => setAutoLogin(e.target.checked)} 
                />
                <div className="lp-checkmark">
                    <Icons.Check />
                </div>
                <span className="lp-checkbox-label">자동 로그인</span>
            </label>
          </div>

          <button 
            type="submit"
            className="lp-submit-btn"
            disabled={isLoading}
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>

          <div className="lp-links">
            <button type="button" onClick={() => handleNavigation('/find-id')}>아이디 찾기</button>
            <span className="divider"></span>
            <button type="button" onClick={() => handleNavigation('/reset-password')}>비밀번호 재설정</button>
            <span className="divider"></span>
            <button type="button" onClick={() => handleNavigation('/signup')} className="highlight">회원가입</button>
          </div>

          <div className="lp-sns-section">
            <div className="lp-sns-divider">
                <span>SNS 계정으로 시작하기</span>
            </div>
            <div className="lp-sns-buttons">
              <SnsButton 
                icon={<Icons.Google />} 
                label="Google" 
                onClick={() => console.log('Google')} 
                borderColor="#E5E8EB"
              />
              <SnsButton 
                icon={<Icons.Naver />} 
                label="Naver" 
                bgColor="#03C75A"
                onClick={() => console.log('Naver')} 
              />
              <SnsButton 
                icon={<Icons.Kakao />} 
                label="Kakao" 
                bgColor="#FEE500"
                onClick={() => console.log('Kakao')} 
              /> 
            </div>
          </div>

        </form>
      </div>
      <div className="lp-footer">
          © 730디자인그룹. All rights reserved.
      </div>
    </div>
  );
};

export default LoginPage;