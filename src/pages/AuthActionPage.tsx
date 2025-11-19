// src/pages/AuthActionPage.tsx

import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '../firebase-config';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import MobileMenu from '../components/common/MobileMenu';
import RoleHeader from '../components/common/RoleHeader';
import './AuthActionPage.css';
import { K_BRAND_COLOR } from '../constants';

const AuthActionPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const mode = searchParams.get('mode'); 
  const oobCode = searchParams.get('oobCode'); 

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'loading' | 'input' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const checkCode = async () => {
      if (!oobCode) {
        setStatus('error');
        setErrorMsg('잘못된 접근입니다. (코드가 없습니다)');
        return;
      }

      try {
        if (mode === 'resetPassword') {
          await verifyPasswordResetCode(auth, oobCode);
          setStatus('input');
        } else {
          setStatus('error');
          setErrorMsg('지원하지 않는 기능입니다.');
        }
      } catch (error: any) {
        setStatus('error');
        setErrorMsg('유효하지 않거나 만료된 링크입니다. 다시 시도해주세요.');
      }
    };

    checkCode();
  }, [mode, oobCode]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) return alert('비밀번호는 6자 이상이어야 합니다.');
    if (newPassword !== confirmPassword) return alert('비밀번호가 일치하지 않습니다.');
    if (!oobCode) return;

    setIsSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setStatus('success');
    } catch (error: any) {
      alert('비밀번호 변경에 실패했습니다: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      {!isMobile && <RoleHeader />}
      <Header 
        onMenuSelected={() => {}} 
        isMobile={isMobile} 
        onHamburgerPressed={() => setIsMobileMenuOpen(true)} 
      />

      <div className="auth-action-container">
        <div className="auth-card">
          
          {status === 'loading' && <div className="loading-msg">요청을 확인하는 중입니다...</div>}

          {status === 'error' && (
            <div className="error-view">
              <h3>오류 발생</h3>
              <p>{errorMsg}</p>
              <button onClick={() => navigate('/')}>홈으로 이동</button>
            </div>
          )}

          {status === 'input' && (
            <div className="input-view">
              <h2>새 비밀번호 설정</h2>
              <p>계정의 새로운 비밀번호를 입력해 주세요.</p>
              
              <form onSubmit={handleResetPassword}>
                <div className="form-group">
                  <label>새 비밀번호</label>
                  <input 
                    type="password" 
                    value={newPassword} 
                    onChange={(e) => setNewPassword(e.target.value)} 
                    placeholder="6자 이상 입력"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>비밀번호 확인</label>
                  <input 
                    type="password" 
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)} 
                    placeholder="한 번 더 입력"
                    required
                  />
                </div>
                
                <button 
                  type="submit" 
                  className="btn-submit"
                  style={{ backgroundColor: K_BRAND_COLOR }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? '변경 중...' : '비밀번호 변경'}
                </button>
              </form>
            </div>
          )}

          {status === 'success' && (
            <div className="success-view">
              <h2 style={{color:'#28a745'}}>비밀번호 변경 완료</h2>
              <p>비밀번호가 성공적으로 변경되었습니다.<br/>새로운 비밀번호로 로그인해 주세요.</p>
              <button 
                className="btn-login" 
                style={{ backgroundColor: K_BRAND_COLOR }}
                onClick={() => navigate('/login')}
              >
                로그인 하러가기
              </button>
            </div>
          )}

        </div>
      </div>

      <Footer />
      {isMobileMenuOpen && isMobile && <MobileMenu onClose={() => setIsMobileMenuOpen(false)} />}
    </div>
  );
};

export default AuthActionPage;