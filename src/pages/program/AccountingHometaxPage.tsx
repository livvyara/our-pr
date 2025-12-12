import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app'; 
import { 
  getFirestore, doc, getDoc, setDoc, serverTimestamp, 
  collection, onSnapshot, addDoc, updateDoc 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions, firebaseConfig } from '../../firebase-config'; 
import * as forge from 'node-forge'; 
import './AccountingHometaxPage.css';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app); 

// --- [Icons] ---
const Icons = {
  Lock: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Check: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  Upload: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Hometax: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Refresh: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
};

interface CertInfo { owner: string; issuer: string; usage: string; expireDate: string; }
interface Props { partnerUid: string | null; }

// --- [Helper Functions] ---
const readFileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
  });
};

const parseCertFile = (file: File): Promise<CertInfo> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = () => {
            try {
                const buffer = reader.result as ArrayBuffer;
                const binary = new Uint8Array(buffer).reduce((acc, byte) => acc + String.fromCharCode(byte), '');
                const asn1 = forge.asn1.fromDer(binary);
                const cert = forge.pki.certificateFromAsn1(asn1);
                
                const safeDecode = (str: string) => { try { return forge.util.decodeUtf8(str); } catch { return str; } };
                const owner = safeDecode(String(cert.subject.getField('CN')?.value || 'Unknown'));
                const issuer = safeDecode(String(cert.issuer.getField('O')?.value || 'Unknown'));
                const expiry = cert.validity.notAfter;
                const expireDate = `${expiry.getFullYear()}-${String(expiry.getMonth()+1).padStart(2,'0')}-${String(expiry.getDate()).padStart(2,'0')}`;
                
                const usage = owner.includes('주식회사') || owner.includes('(주)') ? "법인/사업자용" : "개인/범용";
                resolve({ owner, issuer, usage, expireDate });
            } catch (e) { reject(e); }
        };
        reader.onerror = (e) => reject(e);
    });
};

const AccountingHometaxPage: React.FC<Props> = ({ partnerUid }) => {
  const [targetUid, setTargetUid] = useState<string | null>(null);
  const [isCertRegistered, setIsCertRegistered] = useState(false);
  const [certInfo, setCertInfo] = useState<CertInfo | null>(null);
  const [fullCertData, setFullCertData] = useState<{der: string, key: string, password: string} | null>(null);
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  
  const [isScraping, setIsScraping] = useState(false);
  const [scrapingStep, setScrapingStep] = useState('');
  const [keypadRequest, setKeypadRequest] = useState<any>(null);
  const [isKeypadModalOpen, setIsKeypadModalOpen] = useState(false);
  
  const [scrapeType, setScrapeType] = useState<'tax_invoice' | 'cash_receipt'>('tax_invoice');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 7) + '-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [currentUserInfo, setCurrentUserInfo] = useState<{uid: string, name: string}>({uid:'', name:''});

  useEffect(() => {
    if (!partnerUid) return;
    const init = async () => {
      const snap = await getDoc(doc(db, 'users', partnerUid));
      if (snap.exists()) {
          const d = snap.data();
          setCurrentUserInfo({ uid: partnerUid, name: d.nickname || d.email || '사용자' });
          let ownerUid = partnerUid;
          if (d.role === 'sub_partner' && d.partnerInfo?.ownerUid) ownerUid = d.partnerInfo.ownerUid;
          setTargetUid(ownerUid);
      }
    };
    init();
  }, [partnerUid]);

  useEffect(() => {
      if (!targetUid) return;
      const loadCert = async () => {
          const snap = await getDoc(doc(db, 'users', targetUid, 'config', 'hometax_cert'));
          if (snap.exists()) {
              const d = snap.data();
              if (d.der && d.key && d.password) {
                  setIsCertRegistered(true);
                  setCertInfo(d.certInfo || null);
                  setFullCertData({ der: d.der, key: d.key, password: d.password });
              }
          } else { setIsCertRegistered(false); setCertInfo(null); setFullCertData(null); }
      };
      loadCert();
  }, [targetUid]);

  useEffect(() => {
    if (!isScraping || !targetUid || !currentSessionId) return;
    const unsub = onSnapshot(doc(db, 'scraping_requests', currentSessionId), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.status === 'WAITING_FOR_INPUT') {
            setKeypadRequest({ id: currentSessionId, ...d });
            setIsKeypadModalOpen(true);
            setScrapingStep(d.mode === 'INPUT' ? "보안 키패드 입력 대기 중..." : "관리자 설정 모드...");
        } else if (d.status === 'SESSION_COMPLETED') {
            setIsKeypadModalOpen(false);
            setScrapingStep("로그인 성공! 데이터 수집 중...");
        }
      }
    });
    return () => unsub();
  }, [isScraping, targetUid, currentSessionId]);

  const addLog = async (msg: string) => {
      if (!targetUid) return;
      try { await addDoc(collection(db, 'users', targetUid, 'ACTIVITY_LOGS'), { text: `${currentUserInfo.name}님이 ${msg}`, createdAt: serverTimestamp(), type: 'hometax_scraping' }); } catch(e){}
  };

  const handleStartScraping = async () => {
    if (!targetUid || !isCertRegistered || !fullCertData || isScraping) return;
    
    const newSessionId = `${targetUid}_${Date.now()}`;
    setCurrentSessionId(newSessionId);
    setIsScraping(true); setKeypadRequest(null); setCompletionMessage(null);
    setScrapingStep("보안 서버 연결 및 브라우저 실행 중...");

    try {
      const scrapFunc = httpsCallable(functions, 'scrapHometaxData', { timeout: 300000 });
      const payload: any = {
          certFileDer: fullCertData.der, certFileKey: fullCertData.key, certPassword: fullCertData.password,
          partnerUid: targetUid, sessionId: newSessionId, scrapeType
      };
      if (scrapeType === 'tax_invoice') {
          payload.startDate = startDate.replace(/-/g, ''); payload.endDate = endDate.replace(/-/g, '');
      } else payload.targetYear = selectedYear;

      const result: any = await scrapFunc(payload);
      setScrapingStep("완료");
      
      if (result.data.success) {
          setCompletionMessage("수집 요청이 완료되었습니다.\n잠시 후 해당 메뉴에서 내역을 확인해주세요.");
          await addLog(scrapeType === 'tax_invoice' ? "세금계산서 수집 요청" : "현금영수증 수집 요청");
      } else throw new Error(result.data.message || "수집 실패");

    } catch (e: any) {
      console.error(e);
      if (e.code === 'deadline-exceeded') setCompletionMessage("수집 요청이 서버에 전달되었습니다.\n잠시 후 결과를 확인해주세요.");
      else alert("오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsScraping(false); setScrapingStep(''); setIsKeypadModalOpen(false); setCurrentSessionId(null);
    }
  };

  return (
    <div className="ht-page">
      <div className="ht-container">
        
        {/* Header */}
        <div className="ht-header">
            <div className="ht-title-group">
                <div className="ht-icon-box"><Icons.Hometax /></div>
                <div>
                    <h2>홈택스 자동 수집</h2>
                    <p>복잡한 세무 자료를 클릭 한 번으로 간편하게 가져오세요.</p>
                </div>
            </div>
        </div>

        {/* Top Section: Cert & Action */}
        <div className="ht-grid">
            {/* 1. Certificate Card */}
            <div className={`ht-card cert ${isCertRegistered ? 'active' : ''}`}>
                <div className="card-head">
                    <span className="card-label">STEP 1</span>
                    <h3>공동인증서 연동</h3>
                </div>
                
                <div className="cert-status-area">
                    {isCertRegistered && certInfo ? (
                        <div className="cert-info-box">
                            <div className="cert-row">
                                <span className="lbl">소유자</span>
                                <span className="val">{certInfo.owner}</span>
                            </div>
                            <div className="cert-row">
                                <span className="lbl">발급기관</span>
                                <span className="val">{certInfo.issuer}</span>
                            </div>
                            <div className="cert-row">
                                <span className="lbl">만료일</span>
                                <span className="val highlight">{certInfo.expireDate}</span>
                            </div>
                            <div className="cert-badge">
                                <Icons.Check /> 연동 완료
                            </div>
                        </div>
                    ) : (
                        <div className="cert-empty-state">
                            <div className="lock-icon"><Icons.Lock /></div>
                            <p>홈택스 로그인을 위해<br/>공동인증서를 등록해주세요.</p>
                        </div>
                    )}
                </div>

                <button className="ht-btn secondary" onClick={() => setIsCertModalOpen(true)}>
                    {isCertRegistered ? '인증서 변경 / 갱신' : '인증서 등록하기'}
                </button>
            </div>

            {/* 2. Scraping Action Card */}
            <div className="ht-card scrape">
                <div className="card-head">
                    <span className="card-label">STEP 2</span>
                    <h3>자료 수집 실행</h3>
                </div>

                <div className="scrape-options">
                    <div className="radio-group">
                        <label className={`radio-btn ${scrapeType === 'tax_invoice' ? 'selected' : ''}`}>
                            <input type="radio" checked={scrapeType === 'tax_invoice'} onChange={() => setScrapeType('tax_invoice')} disabled={isScraping} />
                            세금계산서
                        </label>
                        <label className={`radio-btn ${scrapeType === 'cash_receipt' ? 'selected' : ''}`}>
                            <input type="radio" checked={scrapeType === 'cash_receipt'} onChange={() => setScrapeType('cash_receipt')} disabled={isScraping} />
                            현금영수증
                        </label>
                    </div>

                    {scrapeType === 'tax_invoice' ? (
                        <div className="date-picker-row">
                            <div className="date-field">
                                <label>시작일</label>
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={isScraping} />
                            </div>
                            <span className="tilde">~</span>
                            <div className="date-field">
                                <label>종료일</label>
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} disabled={isScraping} />
                            </div>
                        </div>
                    ) : (
                        <div className="year-select-row">
                            <label>수집 연도</label>
                            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} disabled={isScraping}>
                                {[0, 1, 2].map(i => <option key={i} value={new Date().getFullYear() - i}>{new Date().getFullYear() - i}년</option>)}
                            </select>
                        </div>
                    )}
                </div>

                {/* [수정됨] 인라인 스타일 제거, className으로 스타일 제어 */}
                <button 
                    className="ht-btn primary" 
                    onClick={handleStartScraping} 
                    disabled={isScraping || !isCertRegistered}
                >
                    {isScraping ? '수집 진행 중...' : '자료 가져오기'}
                </button>
            </div>
        </div>

        {/* Progress & Result Overlay */}
        {isScraping && (
            <div className="scraping-overlay">
                <div className="loading-box">
                    <div className="spinner"></div>
                    <p className="loading-text">{scrapingStep}</p>
                    {isKeypadModalOpen && <span className="keypad-alert">보안 키패드 입력 대기 중...</span>}
                </div>
            </div>
        )}

        {completionMessage && (
            <div className="success-banner">
                <div className="icon"><Icons.Check /></div>
                <div className="msg">{completionMessage}</div>
                <button onClick={() => setCompletionMessage(null)}>확인</button>
            </div>
        )}

        {/* Modals */}
        {isCertModalOpen && targetUid && (
            <CertificateModal partnerUid={targetUid} onClose={() => setIsCertModalOpen(false)} onSuccess={() => addLog("인증서 갱신")} />
        )}

        {isKeypadModalOpen && keypadRequest && (
            <KeypadInputModal 
                imageUrl={`data:image/png;base64,${keypadRequest.image}`} 
                docId={keypadRequest.id} 
                currentRound={keypadRequest.round} 
                serverMode={keypadRequest.mode || 'INPUT'} 
                zonesConfig={keypadRequest.zones} 
                onClose={() => setIsKeypadModalOpen(false)} 
            />
        )}
      </div>
    </div>
  );
};

// --- [Cert Modal] ---
const CertificateModal: React.FC<any> = ({ partnerUid, onClose, onSuccess }) => {
    const [fileDer, setFileDer] = useState<File | null>(null);
    const [fileKey, setFileKey] = useState<File | null>(null);
    const [password, setPassword] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!fileDer || !fileKey || !password) return alert("모든 정보를 입력해주세요.");
        setIsSaving(true);
        try {
            const der = await readFileToBase64(fileDer);
            const key = await readFileToBase64(fileKey);
            const info = await parseCertFile(fileDer);
            
            await setDoc(doc(db, 'users', partnerUid, 'config', 'hometax_cert'), { der, key, password, certInfo: info, updatedAt: serverTimestamp() });
            await setDoc(doc(db, 'users', partnerUid), { hometaxCertRegistered: true }, { merge: true });
            
            alert("인증서가 등록되었습니다.");
            onSuccess(info); onClose();
        } catch(e) { alert("오류가 발생했습니다."); } finally { setIsSaving(false); }
    };

    return (
        <div className="ht-modal-backdrop" onClick={onClose}>
            <div className="ht-modal" onClick={e => e.stopPropagation()}>
                <h3>공동인증서 등록</h3>
                <div className="cert-drop-area" onClick={() => document.getElementById('derInput')?.click()}>
                    <Icons.Upload />
                    <p>{fileDer ? fileDer.name : "인증서 파일 (.der) 선택"}</p>
                    <input id="derInput" type="file" accept=".der" hidden onChange={e => setFileDer(e.target.files?.[0] || null)} />
                </div>
                <div className="cert-drop-area" onClick={() => document.getElementById('keyInput')?.click()}>
                    <Icons.Upload />
                    <p>{fileKey ? fileKey.name : "개인키 파일 (.key) 선택"}</p>
                    <input id="keyInput" type="file" accept=".key" hidden onChange={e => setFileKey(e.target.files?.[0] || null)} />
                </div>
                <input className="ht-input" type="password" placeholder="인증서 비밀번호" value={password} onChange={e => setPassword(e.target.value)} />
                <div className="modal-actions">
                    <button className="ht-btn secondary" onClick={onClose}>취소</button>
                    <button className="ht-btn primary" onClick={handleSave} disabled={isSaving}>{isSaving ? '저장 중...' : '등록 완료'}</button>
                </div>
            </div>
        </div>
    );
};

// --- [Keypad Modal] (Fixes Applied) ---
const KeypadInputModal: React.FC<any> = ({ imageUrl, docId, currentRound, serverMode, zonesConfig, onClose }) => {
    const imgRef = useRef<HTMLImageElement>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [passwordDisplay, setPasswordDisplay] = useState(""); 
    const [clickPoints, setClickPoints] = useState<{x:number, y:number}[]>([]); 

    useEffect(() => { 
        setIsProcessing(false); 
    }, [imageUrl]);

    useEffect(() => {
        setPasswordDisplay("");
    }, [docId]);

    const getActualCoords = (e: React.MouseEvent) => {
        if (!imgRef.current) return { x:0, y:0 };
        const rect = imgRef.current.getBoundingClientRect();
        const scaleX = imgRef.current.naturalWidth / rect.width;
        const scaleY = imgRef.current.naturalHeight / rect.height;
        return { 
            x: Math.round(e.nativeEvent.offsetX * scaleX), 
            y: Math.round(e.nativeEvent.offsetY * scaleY) 
        };
    };

    const checkZone = (x: number, y: number, zones: any) => {
        if (!zones) return 'NORMAL';
        for (const [key, rect] of Object.entries(zones)) {
            const r = rect as any;
            if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
                if (key.includes('enter')) return 'ENTER';
                if (key.includes('shift') || key.includes('refresh')) return 'SHIFT';
                if (key.includes('back') || key.includes('del')) return 'BACK';
                if (key.includes('space')) return 'SPACE';
                return key.toUpperCase(); 
            }
        }
        return 'NORMAL'; 
    };

    const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
        e.stopPropagation();
        if (isProcessing) return;

        const { x, y } = getActualCoords(e);
        
        setClickPoints(prev => [...prev, { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }]);

        const zoneType = checkZone(x, y, zonesConfig);
        let actionType = 'click'; 
        let shouldBlockUI = false;

        if (zoneType === 'SHIFT') {
            actionType = 'refresh_click';
            shouldBlockUI = true;
        } else if (zoneType === 'ENTER') {
            actionType = 'submit';
            shouldBlockUI = true;
        } else if (zoneType === 'BACK') {
            setPasswordDisplay(prev => prev.slice(0, -1));
        } else {
            setPasswordDisplay(prev => prev + "*"); 
        }

        if (shouldBlockUI) setIsProcessing(true);
        try {
            await updateDoc(doc(db, 'scraping_requests', docId), {
                status: 'INPUT_RECEIVED',
                action: actionType,
                coordinate: { x, y },
                round: currentRound
            });
        } catch (error) {
            console.error(error);
            if(shouldBlockUI) setIsProcessing(false);
        }
    };

    return (
        <div className="ht-modal-backdrop" style={{zIndex: 9999}}>
             <div className="ht-modal keypad">
                 <h3>보안 키패드 입력</h3>
                 <p className="keypad-desc">마우스로 비밀번호를 입력해주세요.</p>
                 
                 <div className="password-display-box">
                    {passwordDisplay || <span className="placeholder">비밀번호 입력 대기</span>}
                 </div>

                 <div className="keypad-img-wrap">
                     <img 
                        ref={imgRef} 
                        src={imageUrl} 
                        alt="Keypad" 
                        onClick={handleImageClick}
                        className={isProcessing ? 'blur-effect' : ''}
                     />
                     
                     {isProcessing && (
                         <div className="keypad-loading-overlay">
                             <div className="spinner-white"></div>
                             <p>보안 처리 중...</p>
                         </div>
                     )}

                     {clickPoints.map((pt, i) => (
                         <span key={i} className="click-effect" style={{left: pt.x, top: pt.y}} />
                     ))}
                 </div>
                 
                 <div className="keypad-actions">
                    <button className="ht-btn secondary full" onClick={onClose}>취소 / 닫기</button>
                 </div>
             </div>
        </div>
    );
};

export default AccountingHometaxPage;