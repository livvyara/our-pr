import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app'; 
import { 
  getFirestore, doc, getDoc, setDoc, serverTimestamp, 
  collection, query, where, limit, onSnapshot, updateDoc 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions, firebaseConfig } from '../../firebase-config'; 
import { K_BRAND_COLOR } from '../../constants';
import * as forge from 'node-forge'; 
import './AccountingHometaxPage.css';

// Firestore 전역 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app); 

const ICON_CERT = "🔒";
const ICON_HOMETAX = "🏠";

// --- [OID 매핑 테이블] ---
const CERT_POLICY_OID: { [key: string]: string } = {
    "1.2.410.200004.5.2.1.2": "법인(범용)",
    "1.2.410.200004.5.2.1.1": "개인(범용)",
    "1.2.410.200004.5.2.1.501": "전자세금용",
    "1.2.410.200004.5.4.1.2": "법인(범용)",
    "1.2.410.200004.5.4.1.1": "개인(범용)",
    "1.2.410.200004.5.4.1.101": "전자세금용",
    "1.2.410.200005.1.1.5": "법인(범용)",
    "1.2.410.200005.1.1.1": "개인(범용)",
    "1.2.410.200005.1.1.7": "법인(세금용)",
    "1.2.410.200004.5.1.1.7": "법인(범용)",
    "1.2.410.200004.5.1.1.5": "법인(범용)",
    "1.2.410.200004.5.1.1.9": "전자세금용",
    "1.2.410.200004.5.3.1.2": "법인(범용)",
    "1.2.410.200004.5.3.1.1": "개인(범용)",
    "1.2.410.200004.5.3.1.5": "전자세금용",
    "1.2.410.200004.5.5.1.2": "법인(범용)",
    "1.2.410.200004.5.5.1.1": "개인(범용)",
};

interface CertInfo {
    owner: string;   
    issuer: string;  
    usage: string;   
    expireDate: string; 
}

interface Props {
  partnerUid: string | null;
}

interface TaxInvoiceData {
  id: string;
  date: string;
  type: '세금계산서' | '현금영수증' | '신용카드';
  inOut: '매입' | '매출';
  vendorName: string; 
  amount: number; 
  tax: number; 
  total: number; 
  status: string; 
}

// [헬퍼] 파일을 Base64 문자열로 변환
const readFileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1]; 
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

// [헬퍼] 인증서 파일 분석
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

                const safeDecode = (str: string) => {
                    try {
                        return forge.util.decodeUtf8(str);
                    } catch (e) {
                        return str; 
                    }
                };

                const cnField = cert.subject.getField('CN');
                const owner = cnField ? safeDecode(String(cnField.value)) : '알 수 없음';

                const oField = cert.issuer.getField('O');
                const issuer = oField ? safeDecode(String(oField.value)) : '알 수 없음';

                const expiry = cert.validity.notAfter;
                const year = expiry.getFullYear();
                const month = String(expiry.getMonth() + 1).padStart(2, '0');
                const day = String(expiry.getDate()).padStart(2, '0');
                const expireDate = `${year}-${month}-${day}`;

                let usage = '기타(확인불가)';
                const ext = cert.getExtension('certificatePolicies') as any;
                
                if (owner.includes('주식회사') || owner.includes('(주)') || owner.includes(' 유한') || owner.includes(' 사단') || owner.includes('재단')) {
                    usage = "법인/사업자용";
                } else {
                    usage = "개인/범용";
                }

                resolve({ owner, issuer, usage, expireDate } as CertInfo);

            } catch (e) {
                console.error("인증서 파싱 실패:", e);
                reject(e);
            }
        };
        reader.onerror = (e) => reject(e);
    });
};

// =============================================================================
// [Main Component] AccountingHometaxPage
// =============================================================================
const AccountingHometaxPage: React.FC<Props> = ({ partnerUid }) => {
  
  const [isCertRegistered, setIsCertRegistered] = useState(false);
  const [certInfo, setCertInfo] = useState<CertInfo | null>(null); 
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  
  const [isScraping, setIsScraping] = useState(false);
  const [scrapingStep, setScrapingStep] = useState('');
  
  const [keypadRequest, setKeypadRequest] = useState<any>(null);
  const [isKeypadModalOpen, setIsKeypadModalOpen] = useState(false);

  const [dataList, setDataList] = useState<TaxInvoiceData[]>([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 7) + '-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  // debugImage 관련 state 삭제
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);

  // 1. 초기 로드
  useEffect(() => {
    if (!partnerUid) return;
    const checkCert = async () => {
      const docRef = doc(db, 'users', partnerUid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().hometaxCertRegistered) {
        setIsCertRegistered(true);
        
        const localCert = localStorage.getItem(`hometax_cert_${partnerUid}`);
        if (localCert) {
            try {
                const parsed = JSON.parse(localCert);
                if (parsed.certInfo) setCertInfo(parsed.certInfo); 
            } catch(e) {}
        }
      }
    };
    checkCert();
  }, [partnerUid]);

  // 2. 실시간 리스너
  useEffect(() => {
    if (!isScraping || !partnerUid || !currentSessionId) return;

    const docRef = doc(db, 'scraping_requests', currentSessionId);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        if (data.status === 'WAITING_FOR_INPUT') {
            console.log(`🔥 키패드 입력 요청 (Round: ${data.round}, Mode: ${data.mode})`);
            setKeypadRequest({ id: currentSessionId, ...data });
            setIsKeypadModalOpen(true);
            
            if (data.mode === 'INPUT') setScrapingStep("보안 키패드 입력 중...");
            else setScrapingStep("관리자 설정 모드 진행 중...");
        } 
        else if (data.status === 'SESSION_COMPLETED') {
            setIsKeypadModalOpen(false);
            setScrapingStep("로그인 검증 및 데이터 수집 중...");
        }
      }
    });

    return () => unsubscribe();
  }, [isScraping, partnerUid, currentSessionId]); 


  // 3. 수집 시작 핸들러
  const handleStartScraping = async () => {
    if (!partnerUid) return;
    if (!isCertRegistered) return alert("먼저 홈택스 공동인증서를 등록해주세요.");
    if (isScraping) return;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)); 
    if (diffDays > 90) return alert("조회 기간은 최대 90일까지만 설정 가능합니다.");
    if (start > end) return alert("종료일이 시작일보다 앞설 수 없습니다.");

    const certData = localStorage.getItem(`hometax_cert_${partnerUid}`);
    if (!certData) return alert("브라우저에 저장된 인증서 정보가 없습니다. 다시 등록해주세요.");
    
    let certInfo;
    try { certInfo = JSON.parse(certData); } catch (e) { return alert("인증서 정보 손상"); }
    const { der, key, password } = certInfo;

    const newSessionId = `${partnerUid}_${Date.now()}`;
    setCurrentSessionId(newSessionId);

    setIsScraping(true);
    // setDebugImage(null); // 삭제됨
    setKeypadRequest(null);
    setDataList([]); 
    setCompletionMessage(null);

    try {
      setScrapingStep("보안 서버 연결 및 브라우저 실행 중...");
      
      const scrapFunc = httpsCallable(functions, 'scrapHometaxData', { timeout: 300000 });
      
      const result: any = await scrapFunc({
          startDate: startDate.replace(/-/g, ''), 
          endDate: endDate.replace(/-/g, ''),
          certFileDer: der,
          certFileKey: key,
          certPassword: password,
          partnerUid: partnerUid,
          sessionId: newSessionId
      });

      setScrapingStep("완료");
      
      // 스크린샷 로직 삭제됨

      if (result.data.success) {
          setCompletionMessage("서버에서 수집요청한 자료를 정리중입니다.\n잠시 후 [회계관리-세금계산서] 페이지에서 확인해 주세요.");
      } else {
          throw new Error(result.data.message || "수집 실패");
      }

    } catch (e: any) {
      console.error("Scraping Error:", e);
      // 스크린샷 표시 로직 삭제됨

      if (e.code === 'deadline-exceeded' || e.message.includes('timeout')) {
          setCompletionMessage("서버에서 수집요청한 자료를 정리중입니다.\n잠시 후 [회계관리-세금계산서] 페이지에서 확인해 주세요.");
      } else if (e.details && e.details.isWrongPassword) {
          alert("❌ 비밀번호가 일치하지 않습니다.\n다시 시도해주세요.");
      } else {
          setCompletionMessage("수집 요청이 접수되었습니다.\n잠시 후 [회계관리-세금계산서] 페이지에서 확인해 주세요.");
      }

    } finally {
      setIsScraping(false);
      setScrapingStep('');
      setIsKeypadModalOpen(false);
      setCurrentSessionId(null);
    }
  };

  return (
    <div className="hometax-page-container">
      <div className="hometax-header">
        <h2>홈택스 자동 수집</h2>
        <p>세금계산서, 현금영수증, 신용카드 내역을 홈택스에서 자동으로 가져옵니다.</p>
      </div>

      <div className="hometax-top-grid">
        <div className="hometax-card cert-card">
          <div className="card-title"><span className="icon">{ICON_CERT}</span> 공동인증서 관리</div>
          <div className="cert-status-box">
            상태: <span className={`status-badge ${isCertRegistered ? 'registered' : 'unregistered'}`}>{isCertRegistered ? '등록됨' : '미등록'}</span>
          </div>

          {isCertRegistered && certInfo ? (
              <div className="cert-info-display" style={{fontSize:'13px', color:'#555', marginBottom:'15px', lineHeight:'1.6', backgroundColor:'#f8f9fa', padding:'10px', borderRadius:'5px'}}>
                  <div><strong>소유자:</strong> {certInfo.owner}</div>
                  <div><strong>용도:</strong> {certInfo.usage}</div>
                  <div><strong>발급기관:</strong> {certInfo.issuer}</div>
                  <div style={{color:'#d63031', fontWeight:'bold'}}><strong>만료일:</strong> {certInfo.expireDate}</div>
              </div>
          ) : (
              <p className="cert-desc">홈택스 로그인을 위해 공동인증서가 필요합니다.</p>
          )}

          <button className="btn-manage-cert" onClick={() => setIsCertModalOpen(true)}>
            {isCertRegistered ? '인증서 변경 / 갱신' : '인증서 등록하기'}
          </button>
        </div>

        <div className="hometax-card scrape-card">
          <div className="card-title"><span className="icon">{ICON_HOMETAX}</span> 자료 수집 실행</div>
          <div className="date-range-picker">
            <div className="date-input-group">
              <label>시작일</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <span className="tilde">~</span>
            <div className="date-input-group">
              <label>종료일</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <button 
            className="btn-start-scrape" 
            style={{ backgroundColor: K_BRAND_COLOR }}
            onClick={handleStartScraping}
            disabled={isScraping || !isCertRegistered}
          >
            {isScraping ? '수집 진행 중...' : '내역 불러오기'}
          </button>
        </div>
      </div>

      {isScraping && (
        <div className="scraping-progress-bar">
          <div className="spinner"></div>
          <p className="step-text">{scrapingStep}</p>
          {isKeypadModalOpen && <p className="warning-text" style={{color:'#ff4d4f', fontWeight:'bold', animation: 'blink 1s infinite'}}>⚠️ 보안 키패드 입력이 필요합니다!</p>}
        </div>
      )}

      {/* 디버깅 이미지 영역 삭제됨 */}

      {completionMessage && (
          <div className="hometax-result-section" style={{textAlign:'center', padding:'60px 20px', backgroundColor:'#fff', borderRadius:'10px', border:'1px solid #eee', marginTop: '30px'}}>
              <div style={{fontSize:'48px', marginBottom:'20px'}}>✅</div>
              <h3 style={{color:'#333', fontSize:'22px', marginBottom:'15px', fontWeight:'bold'}}>수집 요청 완료</h3>
              <p style={{fontSize:'16px', color:'#555', whiteSpace:'pre-wrap', lineHeight:'1.8'}}>{completionMessage}</p>
          </div>
      )}

      {isCertModalOpen && (
        <CertificateModal 
          partnerUid={partnerUid} 
          onClose={() => setIsCertModalOpen(false)} 
          onSuccess={(info) => {
              setIsCertRegistered(true);
              setCertInfo(info);
          }}
        />
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
  );
};

// =============================================================================
// [Sub Component 1] KeypadInputModal
// =============================================================================
const KeypadInputModal: React.FC<{ 
    imageUrl: string, 
    docId: string, 
    currentRound: number,
    serverMode: string, 
    zonesConfig?: any,   
    onClose: () => void 
}> = ({ imageUrl, docId, currentRound, serverMode, zonesConfig, onClose }) => {
    
    const imgRef = useRef<HTMLImageElement>(null);
    const [isProcessing, setIsProcessing] = useState(false); 
    const [passwordDisplay, setPasswordDisplay] = useState(""); 
    const db = getFirestore();

    const [calibStep, setCalibStep] = useState(0);
    const [tempPoints, setTempPoints] = useState<{x:number, y:number}[]>([]);
    const [tempZones, setTempZones] = useState<any>({});
    
    const zoneSteps = [
        { key: 'shift', label: '쉬프트(Shift)' },
        { key: 'enter_l', label: '엔터(Enter)-좌측' },
        { key: 'enter_r', label: '엔터(Enter)-우측' },
        { key: 'back', label: '지우기(←)' },
        { key: 'space', label: '스페이스바' }
    ];

    useEffect(() => {
        setIsProcessing(false);
    }, [currentRound, imageUrl]);

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
                if (key === 'enter_l' || key === 'enter_r') return 'ENTER';
                return key.toUpperCase(); 
            }
        }
        return 'NORMAL';
    };

    const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
        if (isProcessing) return;
        const { x, y } = getActualCoords(e);

        if (serverMode === 'CALIBR_CROP') {
            const newPoints = [...tempPoints, { x, y }];
            setTempPoints(newPoints);
            if (newPoints.length === 2) {
                setIsProcessing(true);
                const minX = Math.min(newPoints[0].x, newPoints[1].x);
                const minY = Math.min(newPoints[0].y, newPoints[1].y);
                const w = Math.abs(newPoints[1].x - newPoints[0].x);
                const h = Math.abs(newPoints[1].y - newPoints[0].y);
                await updateDoc(doc(db, 'scraping_requests', docId), {
                    status: 'INPUT_RECEIVED', action: 'set_crop', data: { x: minX, y: minY, width: w, height: h }, round: currentRound
                });
                setTempPoints([]);
            }
        }
        else if (serverMode === 'CALIBR_ZONES') {
            const newPoints = [...tempPoints, { x, y }];
            setTempPoints(newPoints);
            if (newPoints.length === 2) {
                const currentKey = zoneSteps[calibStep].key;
                const minX = Math.min(newPoints[0].x, newPoints[1].x);
                const minY = Math.min(newPoints[0].y, newPoints[1].y);
                const w = Math.abs(newPoints[1].x - newPoints[0].x);
                const h = Math.abs(newPoints[1].y - newPoints[0].y);
                const updatedZones = { ...tempZones, [currentKey]: { x: minX, y: minY, width: w, height: h } };
                setTempZones(updatedZones);
                setTempPoints([]);
                if (calibStep < zoneSteps.length - 1) {
                    setCalibStep(calibStep + 1);
                } else {
                    setIsProcessing(true);
                    await updateDoc(doc(db, 'scraping_requests', docId), {
                        status: 'INPUT_RECEIVED', action: 'set_zones', data: updatedZones, round: currentRound
                    });
                }
            }
        }
        else {
            const zoneType = checkZone(x, y, zonesConfig);
            let actionType = 'click'; 
            let shouldBlockUI = false; 

            if (zoneType === 'NORMAL' || zoneType === 'SPACE') {
                setPasswordDisplay(prev => prev + "*");
            } else if (zoneType === 'BACK') {
                setPasswordDisplay(prev => prev.slice(0, -1));
            } else if (zoneType === 'SHIFT') {
                actionType = 'refresh_click'; 
                shouldBlockUI = true; 
            } else if (zoneType === 'ENTER') {
                actionType = 'submit'; 
                shouldBlockUI = true; 
            }

            if (shouldBlockUI) setIsProcessing(true);

            try {
                await updateDoc(doc(db, 'scraping_requests', docId), {
                    status: 'INPUT_RECEIVED',
                    action: actionType,
                    coordinate: { x, y },
                    round: currentRound
                });
            } catch (e) {
                console.error(e);
                if(shouldBlockUI) setIsProcessing(false);
            }
        }
    };

    let headerText = "";
    let subText = "";
    
    if (serverMode === 'CALIBR_CROP') {
        headerText = "📐 초기 설정 (1/2)";
        subText = "키패드 전체의 [좌측 상단]과 [우측 하단]을 클릭하세요.";
    } else if (serverMode === 'CALIBR_ZONES') {
        headerText = `🎹 키 설정 (${calibStep + 1}/${zoneSteps.length})`;
        subText = `${zoneSteps[calibStep].label} 키의 [좌측 상단]과 [우측 하단]을 클릭하세요.`;
    } else {
        headerText = "🔐 보안 키패드 입력";
        subText = "비밀번호를 입력하세요. (Shift: 자동갱신 / Enter: 로그인)";
    }

    return (
        <div className="cert-modal-backdrop" style={{zIndex: 9999}}>
            <div className="cert-modal-content" style={{
                width: 'auto', minWidth: '300px', maxWidth: '95vw', 
                textAlign:'center', padding: '20px', backgroundColor: '#fff',
                borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
            }}>
                <h3 style={{color: '#2d3436', marginBottom:'5px', fontSize: '18px'}}>{headerText}</h3>
                <p style={{fontSize:'13px', color:'#666', marginBottom:'15px'}}>{subText}</p>
                
                {serverMode !== 'CALIBR_CROP' && serverMode !== 'CALIBR_ZONES' && (
                    <div style={{
                        fontSize:'24px', letterSpacing:'5px', fontWeight:'bold', 
                        color: K_BRAND_COLOR, margin:'10px 0', minHeight:'36px',
                        borderBottom: '2px solid #eee'
                    }}>
                        {passwordDisplay || <span style={{color:'#ccc', fontSize:'14px', letterSpacing:'0'}}>입력 대기</span>}
                    </div>
                )}

                <div className="keypad-container" style={{
                    position: 'relative', display: 'inline-block', 
                    border: serverMode.startsWith('CALIBR') ? '4px dashed #d63031' : `3px solid ${K_BRAND_COLOR}`, 
                    borderRadius:'8px', overflow:'hidden'
                }}>
                    <img 
                        ref={imgRef}
                        src={imageUrl} 
                        alt="Keypad" 
                        onClick={handleImageClick}
                        style={{
                            maxWidth: '100%', maxHeight: '60vh', display: 'block',
                            cursor: isProcessing ? 'wait' : 'crosshair',
                            opacity: isProcessing ? 0.5 : 1
                        }} 
                    />
                    
                    {serverMode.startsWith('CALIBR') && tempPoints.map((p, i) => (
                        <div key={i} style={{
                            position:'absolute', 
                            left: p.x / (imgRef.current?.naturalWidth || 1) * (imgRef.current?.width || 1) - 5,
                            top: p.y / (imgRef.current?.naturalHeight || 1) * (imgRef.current?.height || 1) - 5,
                            width:'10px', height:'10px', background:'red', borderRadius:'50%', zIndex:10
                        }} />
                    ))}

                    {isProcessing && (
                        <div style={{
                            position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -50%)',
                            zIndex: 10
                        }}>
                            <div className="spinner" style={{width:'40px', height:'40px', borderTopColor: K_BRAND_COLOR}}></div>
                        </div>
                    )}
                </div>
                
                <div style={{marginTop: '20px'}}>
                    <button className="btn-cancel" onClick={onClose} style={{padding:'8px 20px', border:'none', background:'#f1f2f6', borderRadius:'6px'}}>
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};

// =============================================================================
// [Sub Component 2] CertificateModal
// =============================================================================
const CertificateModal: React.FC<{ partnerUid: string | null, onClose: () => void, onSuccess: (info: CertInfo) => void }> = ({ partnerUid, onClose, onSuccess }) => {
    const [fileDer, setFileDer] = useState<File | null>(null);
    const [fileKey, setFileKey] = useState<File | null>(null);
    const [password, setPassword] = useState('');
    const [extractedInfo, setExtractedInfo] = useState<CertInfo | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (e.target.accept.includes(".der")) {
            setFileDer(file);
            try {
                const info = await parseCertFile(file);
                setExtractedInfo(info); 
            } catch (error) {
                console.error("인증서 분석 실패:", error);
                alert("인증서 파일을 분석할 수 없습니다.");
                setFileDer(null);
            }
        } else if (e.target.accept.includes(".key")) {
            setFileKey(file);
        }
    };

    const handleSaveCert = async () => {
        if (!fileDer || !fileKey || !password) return alert("모든 항목을 입력해주세요.");
        if (!extractedInfo) return alert("인증서 정보가 추출되지 않았습니다.");
        if (!partnerUid) return;

        setIsSaving(true);
        try {
            const derBase64 = await readFileToBase64(fileDer);
            const keyBase64 = await readFileToBase64(fileKey);
            
            localStorage.setItem(`hometax_cert_${partnerUid}`, JSON.stringify({ 
                der: derBase64, 
                key: keyBase64, 
                password: password,
                certInfo: extractedInfo 
            }));
            
            await setDoc(doc(db, 'users', partnerUid), { 
                hometaxCertRegistered: true, 
                hometaxCertUpdatedAt: serverTimestamp() 
            }, { merge: true });

            alert("인증서가 안전하게 등록되었습니다.");
            onSuccess(extractedInfo); 
            onClose();
        } catch (e) {
            console.error(e); alert("저장 중 오류가 발생했습니다.");
        } finally { setIsSaving(false); }
    };

    return (
        <div className="cert-modal-backdrop" onClick={onClose}>
            <div className="cert-modal-content" onClick={e => e.stopPropagation()}>
                <h3>공동인증서 등록</h3>
                
                <p className="cert-notice" style={{backgroundColor: '#fff3e0', border:'1px solid #ffe0b2', color:'#d35400', padding:'10px', borderRadius:'4px', fontSize:'13px'}}>
                    💡 <strong>홈택스에서 로그인에 사용되는 공동인증서</strong>를 등록해주세요.<br/>
                    (signCert.der 파일을 선택하면 정보가 자동 표시됩니다)
                </p>

                <div className="cert-form-group">
                    <label>인증서 파일 (signCert.der)</label>
                    <input type="file" accept=".der" onChange={handleFileChange} />
                </div>
                
                {extractedInfo && (
                    <div style={{fontSize:'12px', background:'#f1f3f5', padding:'10px', borderRadius:'4px', marginBottom:'15px', color:'#495057'}}>
                        <p style={{margin:'0 0 4px 0'}}><strong>소유자:</strong> {extractedInfo.owner}</p>
                        <p style={{margin:'0 0 4px 0'}}><strong>발급기관:</strong> {extractedInfo.issuer}</p>
                        <p style={{margin:'0 0 4px 0'}}><strong>용도:</strong> {extractedInfo.usage}</p>
                        <p style={{margin:0, color:'#d63031'}}><strong>만료일:</strong> {extractedInfo.expireDate}</p>
                    </div>
                )}

                <div className="cert-form-group">
                    <label>개인키 파일 (signPri.key)</label>
                    <input type="file" accept=".key" onChange={handleFileChange} />
                </div>
                <div className="cert-form-group">
                    <label>인증서 비밀번호</label>
                    <input type="password" placeholder="비밀번호 입력" value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                
                <div className="cert-modal-footer">
                    <button className="btn-cancel" onClick={onClose}>취소</button>
                    <button className="btn-save" onClick={handleSaveCert} disabled={isSaving}>{isSaving ? '저장 중...' : '저장하기'}</button>
                </div>
            </div>
        </div>
    );
};

export default AccountingHometaxPage;