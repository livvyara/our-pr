// src/pages/LoginPage.tsx

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

// SnsIcon 컴포넌트
interface SnsIconProps {
  color: string;
  text: string;
  onClick: () => void;
  textColor?: string;
  iconSrc?: string; // 이미지 아이콘 지원을 위해 추가 가능
}

const SnsIcon: React.FC<SnsIconProps> = ({ color, text, onClick, textColor = 'white' }) => {
  return (
    <button 
      className="sns-icon-btn"
      onClick={onClick}
      style={{ backgroundColor: color, color: textColor }}
      type="button"
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

              // [⭐ 핵심 로직] 로그인 후 이동 경로 처리
              const returnUrl = localStorage.getItem('returnTo');
              if (returnUrl) {
                  // 초대 페이지 등으로 이동 (삭제는 이동한 페이지에서 처리하거나 여기서 처리)
                  // JoinSitePage에서 로그인 상태 체크 후 삭제하므로 바로 이동만 하면 됨
                  navigate(returnUrl);
              } else {
                  navigate('/'); // 기본 메인 페이지
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
    <div className="login-page-bg">
      <div className="login-page-container">
        {/* {!isMobile && <RoleHeader />}  디자인상 깔끔함을 위해 헤더 제거 또는 조건부 렌더링 */}

        <div className="login-box-card">
          <form onSubmit={handleLogin} className="login-form">
            
            <div className="login-logo-area">
                <Link to="/"> 
                <img 
                    src={logoImage} 
                    alt="Logo" 
                    className="login-page-logo"
                />
                </Link>
                <p className="login-greeting">다시 만나서 반가워요!</p>
            </div>

            <div className="login-input-group">
                <input 
                    type="email" 
                    placeholder="이메일" 
                    className="login-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required 
                />
                <input 
                    type="password" 
                    placeholder="비밀번호" 
                    className="login-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required 
                />
            </div>
            
            <div className="login-options-row">
              <div className="checkbox-group">
                <label className="custom-checkbox">
                  <input 
                    type="checkbox" 
                    checked={saveId} 
                    onChange={(e) => setSaveId(e.target.checked)} 
                  />
                  <span className="checkmark"></span>
                  아이디 저장
                </label>
                <label className="custom-checkbox">
                  <input 
                    type="checkbox" 
                    checked={autoLogin} 
                    onChange={(e) => setAutoLogin(e.target.checked)} 
                  />
                   <span className="checkmark"></span>
                  자동로그인
                </label>
              </div>
            </div>

            <button 
              type="submit"
              className="login-submit-btn"
              style={{ backgroundColor: K_BRAND_COLOR }}
              disabled={isLoading}
            >
              {isLoading ? '로그인 중...' : '로그인'}
            </button>

            <div className="login-links-row">
              <button type="button" onClick={() => handleNavigation('/find-id')}>아이디 찾기</button>
              <span className="divider">|</span>
              <button type="button" onClick={() => handleNavigation('/reset-password')}>비밀번호 재설정</button>
              <span className="divider">|</span>
              <button type="button" onClick={() => handleNavigation('/signup')} className="highlight-link">회원가입</button>
            </div>

            <div className="login-divider-with-text">
                <span>SNS 계정으로 시작하기</span>
            </div>

            <div className="login-sns-row">
              <SnsIcon color="#EA4335" text="G" onClick={() => console.log('Google')} />
              <SnsIcon color="#03C75A" text="N" onClick={() => console.log('Naver')} />
              <SnsIcon color="#FFE812" text="K" onClick={() => console.log('Kakao')} textColor="#3b1e1e" /> 
            </div>

            <button 
              type="button"
              className="login-problem-link"
              onClick={() => console.log('Help')}
            >
              로그인에 문제가 있으신가요?
            </button>

          </form>
        </div>
        <div className="login-footer">
            © 2025 OurProject. All rights reserved.
        </div>
      </div>
    </div>
  );
};

export default LoginPage;