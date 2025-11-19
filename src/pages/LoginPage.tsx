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
  signOut // [⭐ 1. 추가] signOut (강제 로그아웃용)
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

  
  // [⭐ 2. 수정] handleLogin 함수 (Custom Claim 확인 로직 추가)
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
      
      // 1. Firebase Auth 로그인 (백엔드는 이제 오류를 던지지 않음)
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      if (userCredential.user) {
          // [⭐ 3. 추가] 토큰을 강제 새로고침하여 Cloud Function이 설정한 custom claim을 가져옴
          await userCredential.user.getIdToken(true); 
          const idTokenResult = await userCredential.user.getIdTokenResult();

          // [⭐ 4. 추가] custom claim에 'bannedUntil' (낙인)이 있는지 확인
          if (idTokenResult.claims.bannedUntil) {
              
              // 금지 메시지 (Cloud Function에서 설정한 값)
              const banMessage = idTokenResult.claims.bannedUntil as string;
              
              // 팝업으로 금지 메시지 표시
              alert(banMessage);
              
              // [⭐ 5. 추가] 사용자를 즉시 강제 로그아웃시킴
              await signOut(auth);
              
          } else {
              // [⭐ 6. 수정] 정상 로그인 (금지되지 않음)
              if (saveId) {
                localStorage.setItem('savedEmail', email);
              } else {
                localStorage.removeItem('savedEmail');
              }
              navigate('/'); // 메인 페이지로 이동
          }
      } else {
          throw new Error("사용자 정보를 가져오지 못했습니다.");
      }
        
    } catch (error: any) {
        // [⭐ 7. 수정] 로그인 실패 (아이디/비번 틀림, 함수 오류 등)
        console.error("로그인 오류:", error.code, error.message);
        let message = '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.';
        
        if (error.code === 'auth/invalid-credential') { 
            message = '이메일 또는 비밀번호가 올바르지 않습니다.';
        } else if (error.code === 'auth/invalid-email') {
            message = '유효하지 않은 이메일 형식입니다.';
        } else if (error.code === 'auth/internal-error') {
            // (Cloud Function이 실행에 실패한 경우)
            message = '로그인 처리 중 서버 오류가 발생했습니다.';
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
    <div className="login-page-container">
      {!isMobile && <RoleHeader />}

      <div className="login-box-wrapper">
        <form onSubmit={handleLogin} className="login-form">
          
          <Link to="/"> 
            <img src={logoImage} alt="My WebApp Logo" className="logo-image" />
          </Link>
          <div style={{ height: '48px' }}></div>

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