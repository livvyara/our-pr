// src/pages/SignUpPage.tsx

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { K_BRAND_COLOR } from '../constants'; 
import './SignUpPage.css';

// Firebase Modules
import { httpsCallable } from "firebase/functions";
import { functions, auth } from '../firebase-config';
import { createUserWithEmailAndPassword } from 'firebase/auth'; 
import { doc, setDoc, getFirestore } from 'firebase/firestore'; 
import logoImage from '../assets/logo.png';

const db = getFirestore(auth.app);

// ... (DOMAIN_LIST, constants 등 기존과 동일) ...
const DOMAIN_LIST = ['naver.com', 'gmail.com', 'daum.net', 'hanmail.net', '직접입력'];
const MAX_ATTEMPTS = 3; 

interface TitleDescProps { title: string; description?: string; required?: boolean; }
const TitleWithDescription: React.FC<TitleDescProps> = ({ title, description, required }) => (
    <div className="title-desc-wrapper">
        <p className="field-title">
            {title} {required && <span className="required-dot">•</span>}
        </p>
        {description && (
            <p className="field-description">{description}</p>
        )}
    </div>
);

// ... (AgreementModal, termsContent, marketingContentHTML 등 기존 코드 유지) ...
const AgreementModal: React.FC<{ title: string; content: string; onClose: () => void }> = ({ title, content, onClose }) => (
    <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
                <h3>{title}</h3>
                <button type="button" className="modal-close-btn" onClick={onClose}>&times;</button>
            </div>
            <div className="modal-body" dangerouslySetInnerHTML={{ __html: content }} />
        </div>
    </div>
);
const termsContent = `...`; // (기존 약관 내용 생략)
const marketingContentHTML = `...`; // (기존 내용 생략)

const SignUpPage: React.FC = () => {
    const navigate = useNavigate();
    
    // Refs
    const formRef = useRef<HTMLFormElement>(null); 
    const passwordRef = useRef<HTMLInputElement>(null);
    const passwordConfirmRef = useRef<HTMLInputElement>(null);
    const phoneRef = useRef<HTMLInputElement>(null);
    const codeRef = useRef<HTMLInputElement>(null);
    const domainDirectRef = useRef<HTMLInputElement>(null); 
    const nameRef = useRef<HTMLInputElement>(null); 
    const birthRef = useRef<HTMLInputElement>(null); 
    
    // States
    const [selectedDomain, setSelectedDomain] = useState<string>(DOMAIN_LIST[0]);
    const [isDirectInput, setIsDirectInput] = useState(false); 
    const [isLoadingSend, setIsLoadingSend] = useState(false);
    const [isLoadingCheck, setIsLoadingCheck] = useState(false);
    const [isLoadingSignUp, setIsLoadingSignUp] = useState(false);
    const [isPhoneVerified, setIsPhoneVerified] = useState(false);
    const [isCodeSent, setIsCodeSent] = useState(false);
    const [verificationAttempts, setVerificationAttempts] = useState(0); 
    const [canRequestCodeAt, setCanRequestCodeAt] = useState<Date | null>(null);
    const [timer, setTimer] = useState(180); 
    const timerRef = useRef<number | null>(null); 
    const debounceTimerRef = useRef<number | null>(null); 

    const [nicknameInput, setNicknameInput] = useState('');
    const [isNicknameChecked, setIsNicknameChecked] = useState(false);
    const [nicknameMessage, setNicknameMessage] = useState<string | null>(null);
    const [isCheckingNickname, setIsCheckingNickname] = useState(false);
    const [emailId, setEmailId] = useState('');
    const [phoneNumberInput, setPhoneNumberInput] = useState('');
    const isPhoneValid = phoneNumberInput.length === 11;

    // 약관 동의 State
    const [agreeAll, setAgreeAll] = useState(false);
    const [agreeAge, setAgreeAge] = useState(false); 
    const [agreeTerms, setAgreeTerms] = useState(false); 
    const [agreeMarketing, setAgreeMarketing] = useState(false); 
    const [agreeNotifications, setAgreeNotifications] = useState(false); 
    
    const [showTermsModal, setShowTermsModal] = useState(false);
    const [showMarketingModal, setShowMarketingModal] = useState(false);

    // ... (startTimer, checkNicknameAvailability, handlers 등 기존 로직 유지) ...
    const startTimer = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        setTimer(180);
        setIsCodeSent(true);
        timerRef.current = window.setInterval(() => {
            setTimer(prevTime => {
                if (prevTime === 1) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    setIsCodeSent(false);
                    return 0;
                }
                return prevTime - 1;
            });
        }, 1000);
    }, []);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, []);

    // ... (이메일 ID, 닉네임 체크, 휴대폰 입력 핸들러 등 - 기존 코드와 동일) ...
    const handleEmailIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g, '');
        setEmailId(value);
    };

    const checkNicknameAvailability = useCallback(async (nickname: string) => {
        // (기존 로직 동일)
        const trimmedNickname = nickname.trim();
        if (!trimmedNickname) { setNicknameMessage(null); setIsNicknameChecked(false); return; }
        const nicknameRegExp = /^[a-zA-Z0-9가-힣]{2,8}$/;
        if (!nicknameRegExp.test(trimmedNickname)) {
            setNicknameMessage('2~8자, 한글/영문/숫자만 입력 가능합니다.');
            setIsNicknameChecked(false);
            return;
        }
        setIsCheckingNickname(true);
        setNicknameMessage('확인 중...');
        await new Promise(resolve => setTimeout(resolve, 800)); // Delay
        
        // Mock check
        const isDuplicate = ['testuser', 'admin'].includes(trimmedNickname.toLowerCase());
        setIsCheckingNickname(false);
        if (isDuplicate) {
            setNicknameMessage('중복된 닉네임입니다.');
            setIsNicknameChecked(false);
        } else {
            setNicknameMessage('사용 가능한 닉네임입니다.');
            setIsNicknameChecked(true);
        }
    }, []);

    useEffect(() => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        if (!nicknameInput.trim()) { setNicknameMessage(null); setIsNicknameChecked(false); return; }
        debounceTimerRef.current = window.setTimeout(() => { checkNicknameAvailability(nicknameInput); }, 500);
        return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
    }, [nicknameInput, checkNicknameAvailability]);

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/[^0-9]/g, ''); 
        setPhoneNumberInput(value.slice(0, 11));
    };

    const getFullEmail = (): string | null => {
        let domain = '';
        if (isDirectInput) { domain = domainDirectRef.current?.value || ''; } 
        else if (selectedDomain && selectedDomain !== '도메인선택') { domain = selectedDomain; }
        if (emailId && domain && domain !== '직접입력') { return `${emailId}@${domain}`; }
        return null;
    };

    const requestVerificationCode = async () => {
        // (기존 로직 동일)
        const phoneNumber = phoneNumberInput; 
        if (!isPhoneValid) { alert('휴대폰 번호 11자리를 입력해주세요.'); return; } 
        if (verificationAttempts >= MAX_ATTEMPTS) { alert('인증번호 요청 횟수 초과.'); return; }
        if (canRequestCodeAt && new Date() < canRequestCodeAt) { alert('24시간 후 다시 시도해주세요.'); return; }
        
        setIsLoadingSend(true);
        try {
            const sendCode = httpsCallable(functions, 'sendVerificationCode');
            const result: any = await sendCode({ phoneNumber: phoneNumber });
            if (result.data && result.data.success) {
                setVerificationAttempts(prev => prev + 1);
                startTimer();
                alert(result.data.message || '인증번호가 발송되었습니다.');
            } else { alert(result.data.message || '실패'); }
        } catch (error: any) { alert(`오류: ${error.message}`); } 
        finally { 
            setIsLoadingSend(false); 
            if (verificationAttempts + 1 >= MAX_ATTEMPTS) setCanRequestCodeAt(new Date(Date.now() + 86400000));
        }
    };

    const checkVerificationCode = async () => {
        // (기존 로직 동일)
        const phoneNumber = phoneNumberInput;
        const code = codeRef.current?.value || '';
        if (!phoneNumber || !code) { alert('입력해주세요.'); return; }
        setIsLoadingCheck(true);
        try {
            const checkCode = httpsCallable(functions, 'checkVerificationCodeForSignup');
            const result: any = await checkCode({ phoneNumber, code });
            if (result.data && result.data.success) {
                if (timerRef.current) clearInterval(timerRef.current);
                alert('인증되었습니다.');
                setIsPhoneVerified(true);
                setIsCodeSent(false);
            } else { alert(result.data.message || '실패'); }
        } catch (error: any) { alert(`오류: ${error.message}`); setIsPhoneVerified(false); } 
        finally { setIsLoadingCheck(false); }
    };

    // [⭐ 10. 최종 회원가입 및 이동 처리]
    const finalSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        const password = passwordRef.current?.value || '';
        const passwordConfirm = passwordConfirmRef.current?.value || '';
        const name = nameRef.current?.value || '';
        const birth = birthRef.current?.value || '';

        // 유효성 검사 (기존 동일)
        if (!isNicknameChecked || !isPhoneVerified || !name || !birth || password !== passwordConfirm || !agreeAge || !agreeTerms) {
            alert('입력 정보를 확인하거나 필수 약관에 동의해주세요.'); return;
        }

        const fullEmail = getFullEmail();
        if (!fullEmail) { alert('이메일을 확인해주세요.'); return; }

        setIsLoadingSignUp(true);
        
        try {
            // 1. Firebase Auth 생성 (자동 로그인됨)
            const userCredential = await createUserWithEmailAndPassword(auth, fullEmail, password);
            const user = userCredential.user;

            // 2. Firestore 저장
            await setDoc(doc(db, "users", user.uid), {
                email: fullEmail,
                nickname: nicknameInput,
                name: name, 
                birth: birth, 
                phone: phoneNumberInput,
                role: 'customer', 
                createdAt: new Date(),
                agreedMarketing: agreeMarketing,
                agreedNotifications: agreeNotifications,
            });

            alert('회원가입이 완료되었습니다!');

            // [⭐ 핵심 수정] 초대 코드(returnTo)가 있으면 거기로 이동
            const returnUrl = localStorage.getItem('returnTo');
            if (returnUrl) {
                navigate(returnUrl);
            } else {
                navigate('/login'); // 혹은 '/'
            }
            
        } catch (error: any) {
            console.error("회원가입 오류:", error); 
            let message = '회원가입 실패';
            if (error.code === 'auth/email-already-in-use') message = '이미 사용 중인 이메일입니다.';
            else if (error.code === 'auth/weak-password') message = '비밀번호가 너무 약합니다.';
            alert(message);
        } finally {
            setIsLoadingSignUp(false);
        }
    };

    const formatTimer = (seconds: number) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const handleAgreeAllChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        setAgreeAll(isChecked);
        setAgreeAge(isChecked);
        setAgreeTerms(isChecked);
        setAgreeMarketing(isChecked);
        setAgreeNotifications(isChecked);
    };

    const handleCheckboxChange = (setter: React.Dispatch<React.SetStateAction<boolean>>, e: React.ChangeEvent<HTMLInputElement>) => {
        setter(e.target.checked);
    };

    useEffect(() => {
        if (agreeAge && agreeTerms && agreeMarketing && agreeNotifications) setAgreeAll(true);
        else setAgreeAll(false);
    }, [agreeAge, agreeTerms, agreeMarketing, agreeNotifications]);

    return (
        <div className="signup-page-bg">
            <div className="signup-page-container">
                <div className="signup-box-card">
                    <form ref={formRef} onSubmit={finalSignUp} className="signup-form">
                        
                        <div className="signup-logo-area">
                            <Link to="/"> 
                                <img src={logoImage} alt="Logo" className="signup-logo" />
                            </Link>
                        </div>

                        {/* 이메일 */}
                        <div className="form-section">
                            <TitleWithDescription title="이메일" required />
                            <div className="email-row-group">
                                <input type="text" placeholder="아이디" value={emailId} onChange={handleEmailIdChange} className="signup-input email-id" required />
                                <span className="at-symbol">@</span>
                                {isDirectInput ? (
                                    <input type="text" placeholder="도메인 입력" ref={domainDirectRef} className="signup-input domain-input" required />
                                ) : (
                                    <div className="select-wrapper">
                                        <select className="signup-input domain-select" value={selectedDomain} onChange={(e) => {
                                            setSelectedDomain(e.target.value);
                                            setIsDirectInput(e.target.value === '직접입력');
                                        }}>
                                            <option value="도메인선택" disabled>선택</option>
                                            {DOMAIN_LIST.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 비밀번호 */}
                        <div className="form-section">
                            <TitleWithDescription title="비밀번호" description="8~16자, 영문/숫자/특수문자 2가지 이상" required />
                            <input type="password" placeholder="비밀번호" ref={passwordRef} className="signup-input" required />
                            <div className="spacing-small"></div>
                            <input type="password" placeholder="비밀번호 재확인" ref={passwordConfirmRef} className="signup-input" required />
                        </div>

                        {/* 닉네임 */}
                        <div className="form-section">
                            <TitleWithDescription title="닉네임" required />
                            <input 
                                type="text" placeholder="닉네임 (2~8자)" 
                                value={nicknameInput} onChange={e => {setNicknameInput(e.target.value); setIsNicknameChecked(false);}} 
                                className="signup-input" maxLength={8} required 
                            />
                            <div className="msg-area">
                                {isCheckingNickname && <span className="msg checking">확인 중...</span>}
                                {!isCheckingNickname && nicknameMessage && <span className={`msg ${isNicknameChecked ? 'success' : 'error'}`}>{nicknameMessage}</span>}
                            </div>
                        </div>

                        {/* 이름 & 생년월일 */}
                        <div className="form-row-2col">
                            <div className="form-section">
                                <TitleWithDescription title="이름" required />
                                <input type="text" placeholder="실명 입력" ref={nameRef} className="signup-input" required />
                            </div>
                            <div className="form-section">
                                <TitleWithDescription title="생년월일" required />
                                <input type="tel" placeholder="8자리 (19900101)" ref={birthRef} className="signup-input" maxLength={8} required />
                            </div>
                        </div>

                        {/* 휴대폰 인증 */}
                        <div className="form-section">
                            <TitleWithDescription title="휴대폰 번호" required />
                            <div className="phone-auth-group">
                                <div className="input-with-btn">
                                    <input type="tel" placeholder="숫자만 입력" value={phoneNumberInput} onChange={handlePhoneChange} className="signup-input" maxLength={11} readOnly={isPhoneVerified} required />
                                    <button type="button" className="auth-btn" onClick={requestVerificationCode} disabled={isLoadingSend || isPhoneVerified || !isPhoneValid}>
                                        {isLoadingSend ? '...' : '인증요청'}
                                    </button>
                                </div>
                                
                                {(isCodeSent || isPhoneVerified) && (
                                    <div className="input-with-btn mt-2">
                                        <div className="input-timer-wrapper">
                                            <input type="text" placeholder="인증번호" ref={codeRef} className="signup-input" maxLength={6} readOnly={isPhoneVerified} />
                                            <span className={`timer ${timer < 30 ? 'warn' : ''} ${isPhoneVerified ? 'done' : ''}`}>
                                                {isPhoneVerified ? '완료' : formatTimer(timer)}
                                            </span>
                                        </div>
                                        <button type="button" className="auth-btn dark" onClick={checkVerificationCode} disabled={isLoadingCheck || isPhoneVerified}>
                                            확인
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 약관 동의 */}
                        <div className="agreement-card">
                            <div className="agree-row all">
                                <label>
                                    <input type="checkbox" checked={agreeAll} onChange={handleAgreeAllChange} />
                                    <span>약관 전체 동의</span>
                                </label>
                            </div>
                            <hr />
                            <div className="agree-row">
                                <label>
                                    <input type="checkbox" checked={agreeAge} onChange={e => handleCheckboxChange(setAgreeAge, e)} />
                                    <span>[필수] 만 14세 이상입니다.</span>
                                </label>
                            </div>
                            <div className="agree-row">
                                <label>
                                    <input type="checkbox" checked={agreeTerms} onChange={e => handleCheckboxChange(setAgreeTerms, e)} />
                                    <span>[필수] 이용약관 동의</span>
                                </label>
                                <button type="button" className="view-btn" onClick={() => setShowTermsModal(true)}>보기</button>
                            </div>
                            <div className="agree-row">
                                <label>
                                    <input type="checkbox" checked={agreeMarketing} onChange={e => handleCheckboxChange(setAgreeMarketing, e)} />
                                    <span>[선택] 마케팅 활용 동의</span>
                                </label>
                                <button type="button" className="view-btn" onClick={() => setShowMarketingModal(true)}>보기</button>
                            </div>
                            <div className="agree-row">
                                <label>
                                    <input type="checkbox" checked={agreeNotifications} onChange={e => handleCheckboxChange(setAgreeNotifications, e)} />
                                    <span>[선택] 알림 수신 동의</span>
                                </label>
                            </div>
                        </div>

                        <div className="spacing-medium"></div>

                        <button 
                            type="submit" 
                            className="signup-submit-btn" 
                            style={{backgroundColor: K_BRAND_COLOR}}
                            disabled={isLoadingSignUp || !isPhoneVerified || !isNicknameChecked || !agreeAge || !agreeTerms}
                        >
                            {isLoadingSignUp ? '가입 중...' : '회원가입 완료'}
                        </button>

                        <button type="button" className="back-link" onClick={() => navigate('/login')}>
                            이미 계정이 있으신가요? <b>로그인</b>
                        </button>
                    </form>
                </div>
            </div>

            {/* Modals */}
            {showTermsModal && <AgreementModal title="이용약관" content={termsContent.replace(/\n/g, '<br />')} onClose={() => setShowTermsModal(false)} />}
            {showMarketingModal && <AgreementModal title="마케팅 활용 동의" content={marketingContentHTML} onClose={() => setShowMarketingModal(false)} />}
        </div>
    );
};

export default SignUpPage;