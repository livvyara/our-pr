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

const DOMAIN_LIST = ['naver.com', 'gmail.com', 'daum.net', 'hanmail.net', '직접입력'];
const MAX_ATTEMPTS = 3; 

// [구조적 타이틀 컴포넌트]
interface SectionTitleProps { num: string; title: string; desc?: string; }
const SectionTitle: React.FC<SectionTitleProps> = ({ num, title, desc }) => (
    <div className="sp-section-header">
        <span className="sp-section-num">{num}</span>
        <div className="sp-section-text">
            <h3>{title}</h3>
            {desc && <p>{desc}</p>}
        </div>
    </div>
);

// 약관 모달
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

const SignUpPage: React.FC = () => {
    const navigate = useNavigate();
    
    // Refs
    const formRef = useRef<HTMLFormElement>(null); 
    const passwordRef = useRef<HTMLInputElement>(null);
    const passwordConfirmRef = useRef<HTMLInputElement>(null);
    const codeRef = useRef<HTMLInputElement>(null);
    const domainDirectRef = useRef<HTMLInputElement>(null); 
    const nameRef = useRef<HTMLInputElement>(null); 
    // birthRef 제거 -> state로 제어
    
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
    
    // [수정] 포맷팅된 값 저장을 위한 State
    const [phoneNumberInput, setPhoneNumberInput] = useState('');
    const [birthInput, setBirthInput] = useState('');

    // 010-0000-0000 (13자리)
    const isPhoneValid = phoneNumberInput.length === 13; 

    // 약관 동의 State
    const [agreeAll, setAgreeAll] = useState(false);
    const [agreeAge, setAgreeAge] = useState(false); 
    const [agreeTerms, setAgreeTerms] = useState(false); 
    const [agreeMarketing, setAgreeMarketing] = useState(false); 
    const [agreeNotifications, setAgreeNotifications] = useState(false); 
    
    const [showTermsModal, setShowTermsModal] = useState(false);
    const [showMarketingModal, setShowMarketingModal] = useState(false);

    // --- Logic Implementation ---
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

    const handleEmailIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g, '');
        setEmailId(value);
    };

    const checkNicknameAvailability = useCallback(async (nickname: string) => {
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
        await new Promise(resolve => setTimeout(resolve, 800)); 
        
        const isDuplicate = ['testuser', 'admin'].includes(trimmedNickname.toLowerCase());
        setIsCheckingNickname(false);
        if (isDuplicate) {
            setNicknameMessage('이미 사용 중인 닉네임입니다.');
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

    // [수정] 휴대폰 번호 자동 하이픈 (010-0000-0000)
    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/[^0-9]/g, '');
        let formatted = raw;
        if (raw.length > 3 && raw.length <= 7) {
            formatted = `${raw.slice(0, 3)}-${raw.slice(3)}`;
        } else if (raw.length > 7) {
            formatted = `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 11)}`;
        }
        setPhoneNumberInput(formatted);
    };

    // [추가] 생년월일 자동 하이픈 (YYYY-MM-DD)
    const handleBirthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/[^0-9]/g, '');
        let formatted = raw;
        if (raw.length > 4 && raw.length <= 6) {
            formatted = `${raw.slice(0, 4)}-${raw.slice(4)}`;
        } else if (raw.length > 6) {
            formatted = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
        }
        setBirthInput(formatted);
    };

    const getFullEmail = (): string | null => {
        let domain = '';
        if (isDirectInput) { domain = domainDirectRef.current?.value || ''; } 
        else if (selectedDomain && selectedDomain !== '도메인선택') { domain = selectedDomain; }
        if (emailId && domain && domain !== '직접입력') { return `${emailId}@${domain}`; }
        return null;
    };

    const requestVerificationCode = async () => {
        // 하이픈 제거 후 전송
        const phoneNumber = phoneNumberInput.replace(/-/g, ''); 
        if (phoneNumber.length !== 11) { alert('휴대폰 번호를 올바르게 입력해주세요.'); return; } 
        if (verificationAttempts >= MAX_ATTEMPTS) { alert('인증 요청 횟수를 초과했습니다.'); return; }
        if (canRequestCodeAt && new Date() < canRequestCodeAt) { alert('24시간 후 다시 시도해주세요.'); return; }
        
        setIsLoadingSend(true);
        try {
            const sendCode = httpsCallable(functions, 'sendVerificationCode');
            const result: any = await sendCode({ phoneNumber: phoneNumber });
            if (result.data && result.data.success) {
                setVerificationAttempts(prev => prev + 1);
                startTimer();
                alert('인증번호가 발송되었습니다.');
            } else { alert(result.data.message || '실패'); }
        } catch (error: any) { alert(`오류: ${error.message}`); } 
        finally { 
            setIsLoadingSend(false); 
            if (verificationAttempts + 1 >= MAX_ATTEMPTS) setCanRequestCodeAt(new Date(Date.now() + 86400000));
        }
    };

    const checkVerificationCode = async () => {
        const phoneNumber = phoneNumberInput.replace(/-/g, '');
        const code = codeRef.current?.value || '';
        if (!phoneNumber || !code) { alert('인증번호를 입력해주세요.'); return; }
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

    const finalSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        const password = passwordRef.current?.value || '';
        const passwordConfirm = passwordConfirmRef.current?.value || '';
        const name = nameRef.current?.value || '';
        // 하이픈 제거 후 저장
        const birth = birthInput.replace(/-/g, ''); 

        if (!isNicknameChecked || !isPhoneVerified || !name || !birth || password !== passwordConfirm || !agreeAge || !agreeTerms) {
            alert('필수 정보를 입력하거나 약관에 동의해주세요.'); return;
        }
        if (birth.length !== 8) { alert('생년월일을 올바르게 입력해주세요.'); return; }

        const fullEmail = getFullEmail();
        if (!fullEmail) { alert('이메일을 확인해주세요.'); return; }

        setIsLoadingSignUp(true);
        
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, fullEmail, password);
            const user = userCredential.user;

            await setDoc(doc(db, "users", user.uid), {
                email: fullEmail,
                nickname: nicknameInput,
                name: name, 
                birth: birth, 
                phone: phoneNumberInput.replace(/-/g, ''),
                role: 'customer', 
                createdAt: new Date(),
                agreedMarketing: agreeMarketing,
                agreedNotifications: agreeNotifications,
            });

            alert('회원가입이 완료되었습니다.');
            const returnUrl = localStorage.getItem('returnTo');
            if (returnUrl) navigate(returnUrl);
            else navigate('/login');
            
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
        <div className="sp-container">
            <div className="sp-wrapper">
                <div className="sp-header">
                    <Link to="/"><img src={logoImage} alt="Logo" className="sp-logo" /></Link>
                    <h1>회원가입</h1>
                    <p>아워프로젝트 멤버십을 시작하세요.</p>
                </div>

                <form ref={formRef} onSubmit={finalSignUp} className="sp-form">
                    
                    {/* 01. 계정 정보 */}
                    <div className="sp-section">
                        <SectionTitle num="01" title="계정 정보" />
                        
                        <div className="sp-input-group">
                            <label>이메일</label>
                            <div className="sp-email-row">
                                <input type="text" placeholder="아이디" value={emailId} onChange={handleEmailIdChange} required />
                                <span className="at">@</span>
                                {isDirectInput ? (
                                    <input type="text" placeholder="직접 입력" ref={domainDirectRef} required className="sp-email-domain-input" />
                                ) : (
                                    <div className="sp-select-box">
                                        <select value={selectedDomain} onChange={(e) => {
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

                        <div className="sp-input-group">
                            <label>비밀번호</label>
                            <input type="password" placeholder="8~16자, 영문/숫자/특수문자 2가지 이상" ref={passwordRef} required />
                            <input type="password" placeholder="비밀번호 확인" ref={passwordConfirmRef} className="mt-2" required />
                        </div>

                        <div className="sp-input-group">
                            <label>닉네임</label>
                            <input 
                                type="text" placeholder="2~8자 (한글/영문/숫자)" 
                                value={nicknameInput} onChange={e => {setNicknameInput(e.target.value); setIsNicknameChecked(false);}} 
                                maxLength={8} required 
                            />
                            {isCheckingNickname && <span className="sp-msg checking">확인 중...</span>}
                            {!isCheckingNickname && nicknameMessage && <span className={`sp-msg ${isNicknameChecked ? 'success' : 'error'}`}>{nicknameMessage}</span>}
                        </div>
                    </div>

                    <div className="sp-divider"></div>

                    {/* 02. 개인 정보 */}
                    <div className="sp-section">
                        <SectionTitle num="02" title="개인 정보" />
                        
                        <div className="sp-grid-row">
                            <div className="sp-input-group">
                                <label>이름</label>
                                <input type="text" placeholder="실명" ref={nameRef} required />
                            </div>
                            <div className="sp-input-group">
                                <label>생년월일</label>
                                {/* [수정] 생년월일 자동 하이픈 */}
                                <input 
                                    type="tel" 
                                    placeholder="YYYY-MM-DD" 
                                    value={birthInput} 
                                    onChange={handleBirthChange} 
                                    maxLength={10} 
                                    required 
                                />
                            </div>
                        </div>

                        <div className="sp-input-group">
                            <label>휴대폰 인증</label>
                            <div className="sp-phone-box">
                                {/* [수정] 휴대폰 번호 자동 하이픈 */}
                                <input 
                                    type="tel" 
                                    placeholder="010-0000-0000" 
                                    value={phoneNumberInput} 
                                    onChange={handlePhoneChange} 
                                    maxLength={13} 
                                    readOnly={isPhoneVerified} 
                                    required 
                                />
                                <button type="button" className="sp-btn-outline" onClick={requestVerificationCode} disabled={isLoadingSend || isPhoneVerified || !isPhoneValid}>
                                    {isLoadingSend ? '...' : '인증요청'}
                                </button>
                            </div>
                            
                            {(isCodeSent || isPhoneVerified) && (
                                <div className="sp-phone-box mt-2">
                                    <div className="code-wrap">
                                        <input type="text" placeholder="인증번호" ref={codeRef} maxLength={6} readOnly={isPhoneVerified} />
                                        <span className={`timer ${isPhoneVerified ? 'done' : ''}`}>{isPhoneVerified ? '완료' : formatTimer(timer)}</span>
                                    </div>
                                    <button type="button" className="sp-btn-black" onClick={checkVerificationCode} disabled={isLoadingCheck || isPhoneVerified}>
                                        확인
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="sp-divider"></div>

                    {/* 03. 약관 동의 (정렬 수정) */}
                    <div className="sp-section">
                        <SectionTitle num="03" title="약관 동의" />
                        
                        <div className="sp-agree-box">
                            <label className="agree-row all">
                                <input type="checkbox" checked={agreeAll} onChange={handleAgreeAllChange} />
                                <span>전체 약관에 동의합니다</span>
                            </label>
                            <div className="agree-line"></div>
                            
                            {/* [수정] 좌측 정렬을 위해 div로 감싸고 space-between 사용 */}
                            <div className="agree-row-container">
                                <label className="agree-label">
                                    <input type="checkbox" checked={agreeAge} onChange={e => handleCheckboxChange(setAgreeAge, e)} />
                                    <span>[필수] 만 14세 이상입니다</span>
                                </label>
                            </div>

                            <div className="agree-row-container">
                                <label className="agree-label">
                                    <input type="checkbox" checked={agreeTerms} onChange={e => handleCheckboxChange(setAgreeTerms, e)} />
                                    <span>[필수] 이용약관 동의</span>
                                </label>
                                <button type="button" onClick={() => setShowTermsModal(true)}>보기</button>
                            </div>

                            <div className="agree-row-container">
                                <label className="agree-label">
                                    <input type="checkbox" checked={agreeMarketing} onChange={e => handleCheckboxChange(setAgreeMarketing, e)} />
                                    <span>[선택] 마케팅 활용 동의</span>
                                </label>
                                <button type="button" onClick={() => setShowMarketingModal(true)}>보기</button>
                            </div>

                            <div className="agree-row-container">
                                <label className="agree-label">
                                    <input type="checkbox" checked={agreeNotifications} onChange={e => handleCheckboxChange(setAgreeNotifications, e)} />
                                    <span>[선택] 알림 수신 동의</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="sp-action-area">
                        <button 
                            type="submit" 
                            className="sp-submit-btn" 
                            disabled={isLoadingSignUp || !isPhoneVerified || !isNicknameChecked || !agreeAge || !agreeTerms}
                        >
                            {isLoadingSignUp ? '가입 중...' : '회원가입 완료'}
                        </button>
                        <p className="login-link">
                            이미 계정이 있으신가요? <span onClick={() => navigate('/login')}>로그인</span>
                        </p>
                    </div>

                </form>
            </div>

            {/* Modals */}
            {showTermsModal && <AgreementModal title="이용약관" content="약관 내용..." onClose={() => setShowTermsModal(false)} />}
            {showMarketingModal && <AgreementModal title="마케팅 동의" content="마케팅 내용..." onClose={() => setShowMarketingModal(false)} />}
        </div>
    );
};

export default SignUpPage;