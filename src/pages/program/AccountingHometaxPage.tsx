import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app'; 
import { 
  getFirestore, doc, getDoc, setDoc, serverTimestamp, 
  collection, query, where, limit, onSnapshot, updateDoc, addDoc 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions, firebaseConfig } from '../../firebase-config'; 
import { K_BRAND_COLOR } from '../../constants';
import * as forge from 'node-forge'; 
import './AccountingHometaxPage.css';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app); 

const ICON_CERT = "🔒";
const ICON_HOMETAX = "🏠";

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
  type: '세금계산서' | '현금영수증' 
  inOut: '매입' | '매출';
  vendorName: string; 
  amount: number; 
  tax: number; 
  total: number; 
  status: string; 
}

// [파일을 Base64 문자열로 변환]
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

// [인증서 파일 파싱 (정보 추출용)]
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
                    try { return forge.util.decodeUtf8(str); } catch (e) { return str; }
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
                if (owner.includes('주식회사') || owner.includes('(주)') || owner.includes(' 유한') || owner.includes(' 사단') || owner.includes('재단')) {
                    usage = "법인/사업자용";
                } else {
                    usage = "개인/범용";
                }
                resolve({ owner, issuer, usage, expireDate } as CertInfo);
            } catch (e) { reject(e); }
        };
        reader.onerror = (e) => reject(e);
    });
};

const AccountingHometaxPage: React.FC<Props> = ({ partnerUid }) => {
  
  // [중요] 실제 데이터를 조회/저장할 대상 UID (대표 UID)
  const [targetUid, setTargetUid] = useState<string | null>(null);
  
  const [isCertRegistered, setIsCertRegistered] = useState(false);
  const [certInfo, setCertInfo] = useState<CertInfo | null>(null); 
  // [NEW] DB에서 불러온 인증서 전체 데이터 (스크래핑용)
  const [fullCertData, setFullCertData] = useState<{der: string, key: string, password: string} | null>(null);

  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  
  const [isScraping, setIsScraping] = useState(false);
  const [scrapingStep, setScrapingStep] = useState('');
  
  const [keypadRequest, setKeypadRequest] = useState<any>(null);
  const [isKeypadModalOpen, setIsKeypadModalOpen] = useState(false);

  const [dataList, setDataList] = useState<TaxInvoiceData[]>([]);
  const [scrapeType, setScrapeType] = useState<'tax_invoice' | 'cash_receipt'>('tax_invoice');

  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 7) + '-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [currentUserInfo, setCurrentUserInfo] = useState<{uid: string, name: string}>({uid:'', name:''});

  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  // [1] 권한 확인 및 Target UID 설정
  useEffect(() => {
    if (!partnerUid) return;
    const checkUserRole = async () => {
      const docRef = doc(db, 'users', partnerUid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
          const d = docSnap.data();
          
          // 내 정보 (로그용)
          setCurrentUserInfo({ 
              uid: partnerUid, 
              name: d.nickname || d.email || '사용자' 
          });

          // [핵심] 직원이면 대표 UID 사용, 아니면 본인 UID 사용
          let ownerUid = partnerUid;
          if (d.role === 'sub_partner' && d.partnerInfo && d.partnerInfo.ownerUid) {
              ownerUid = d.partnerInfo.ownerUid;
          }
          setTargetUid(ownerUid); // -> 이 값이 설정되면 인증서 확인 로직 실행
      }
    };
    checkUserRole();
  }, [partnerUid]);

  // [2] 인증서 정보 확인 (Target UID 기준 - DB에서 로드)
  useEffect(() => {
      if (!targetUid) return;

      const checkCert = async () => {
          // 대표 계정 하위의 보안 config 컬렉션에서 인증서 정보 가져오기
          // 경로: users/{targetUid}/config/hometax_cert
          const certDocRef = doc(db, 'users', targetUid, 'config', 'hometax_cert');
          const certSnap = await getDoc(certDocRef);
          
          if (certSnap.exists()) {
              const data = certSnap.data();
              if (data.der && data.key && data.password) {
                  setIsCertRegistered(true);
                  setCertInfo(data.certInfo || null); // 화면 표시용 정보
                  setFullCertData({ // 스크래핑 실행용 실제 데이터
                      der: data.der,
                      key: data.key,
                      password: data.password
                  });
              }
          } else {
              setIsCertRegistered(false);
              setCertInfo(null);
              setFullCertData(null);
          }
      };
      checkCert();
  }, [targetUid]);

  // [3] 스크래핑 세션 구독 (Target UID 기준)
  useEffect(() => {
    if (!isScraping || !targetUid || !currentSessionId) return;

    const docRef = doc(db, 'scraping_requests', currentSessionId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.status === 'WAITING_FOR_INPUT') {
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
  }, [isScraping, targetUid, currentSessionId]); 

  // [LOG] 로그 저장 함수
  const addLog = async (message: string) => {
      if (!targetUid) return; // 대표 UID 계정에 로그 저장
      try {
        const logRef = collection(db, 'users', targetUid, 'ACTIVITY_LOGS');
        await addDoc(logRef, {
            text: `${currentUserInfo.name}님이 ${message}`,
            createdAt: serverTimestamp(),
            type: 'hometax_scraping'
        });
      } catch (e) { console.error("로그 저장 실패:", e); }
  };

  const handleStartScraping = async () => {
    if (!targetUid) return;
    if (!isCertRegistered || !fullCertData) return alert("먼저 홈택스 공동인증서를 등록해주세요.");
    if (isScraping) return;

    // [수정] DB에서 로드한 fullCertData 사용
    const { der, key, password } = fullCertData;

    if (scrapeType === 'tax_invoice') {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)); 
        if (diffDays > 90) return alert("조회 기간은 최대 90일까지만 설정 가능합니다.");
        if (start > end) return alert("종료일이 시작일보다 앞설 수 없습니다.");
    }

    const newSessionId = `${targetUid}_${Date.now()}`;
    setCurrentSessionId(newSessionId);

    setIsScraping(true);
    setKeypadRequest(null);
    setDataList([]); 
    setCompletionMessage(null);

    try {
      setScrapingStep("보안 서버 연결 및 브라우저 실행 중...");
      
      const scrapFunc = httpsCallable(functions, 'scrapHometaxData', { timeout: 300000 });
      
      const payload: any = {
          certFileDer: der,
          certFileKey: key,
          certPassword: password,
          partnerUid: targetUid, // 대표 UID로 요청
          sessionId: newSessionId,
          scrapeType: scrapeType 
      };

      if (scrapeType === 'tax_invoice') {
          payload.startDate = startDate.replace(/-/g, '');
          payload.endDate = endDate.replace(/-/g, '');
      } else {
          payload.targetYear = selectedYear;
      }

      const result: any = await scrapFunc(payload);

      setScrapingStep("완료");
      
      if (result.data.success) {
          if (scrapeType === 'tax_invoice') {
            setCompletionMessage("서버에서 세금계산서 수집요청한 자료를 정리중입니다.\n잠시 후 [회계관리-세금계산서] 페이지에서 확인해 주세요.");
            await addLog("홈택스 수집 기능을 통해 세금계산서 수집을 요청했습니다.");
          } else {
            setCompletionMessage(`서버에서 ${selectedYear}년도(1~4분기) 현금영수증 자료를 정리중입니다.\n잠시 후 [회계관리-현금영수증] 페이지에서 확인해 주세요.`);
            await addLog("홈택스 수집 기능을 통해 현금영수증 수집을 요청했습니다.");
          }
      } else {
        throw new Error(result.data.message || "수집 실패");
      }

    } catch (e: any) {
      console.error("Scraping Error:", e);
      if (e.code === 'deadline-exceeded' || e.message.includes('timeout')) {
          setCompletionMessage("서버에서 수집요청한 자료를 정리중입니다.\n잠시 후 해당 페이지에서 확인해 주세요.");
          if (scrapeType === 'tax_invoice') await addLog("홈택스 수집 기능을 통해 세금계산서 수집을 요청했습니다.");
          else await addLog("홈택스 수집 기능을 통해 현금영수증 수집을 요청했습니다.");
      } else if (e.details && e.details.isWrongPassword) {
          alert("❌ 비밀번호가 일치하지 않습니다.\n다시 시도해주세요.");
      } else {
          setCompletionMessage("수집 요청이 접수되었습니다.\n잠시 후 해당 페이지에서 확인해 주세요.");
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
        <p>세금계산서, 현금영수증 내역을 홈택스에서 자동으로 가져옵니다.</p>
      </div>

      <div className="hometax-top-grid">
        <div className="hometax-card cert-card">
          <div className="card-title"><span className="icon">{ICON_CERT}</span> 공동인증서 관리</div>
          <div className="cert-status-box">
            상태: <span className={`status-badge ${isCertRegistered ? 'registered' : 'unregistered'}`}>{isCertRegistered ? '등록됨' : '미등록'}</span>
          </div>
          {isCertRegistered ? (
             <div className="cert-info-display" style={{fontSize:'13px', color:'#555', marginBottom:'15px', lineHeight:'1.6', backgroundColor:'#f8f9fa', padding:'10px', borderRadius:'5px'}}>
                 {/* DB에서 불러온 정보가 있으면 보여줌 */}
                 {certInfo ? (
                      <>
                        <div><strong>소유자:</strong> {certInfo.owner}</div>
                        <div><strong>용도:</strong> {certInfo.usage}</div>
                        <div><strong>발급기관:</strong> {certInfo.issuer}</div>
                        <div style={{color:'#d63031', fontWeight:'bold'}}><strong>만료일:</strong> {certInfo.expireDate}</div>
                        <div style={{marginTop: '10px', fontSize: '11px', color: '#888'}}>
                             * 대표자가 등록한 인증서를 사용합니다.
                        </div>
                      </>
                 ) : (
                     <p>인증서 정보 로딩 중...</p>
                 )}
             </div>
          ) : (
             <p className="cert-desc">홈택스 로그인을 위해 공동인증서가 필요합니다.<br/>(대표 계정으로 등록해주세요)</p>
          )}
          <button className="btn-manage-cert" onClick={() => setIsCertModalOpen(true)}>
            {isCertRegistered ? '인증서 변경 / 갱신' : '인증서 등록하기'}
          </button>
        </div>

        <div className="hometax-card scrape-card">
          <div className="card-title"><span className="icon">{ICON_HOMETAX}</span> 자료 수집 실행</div>
          <div className="scrape-type-selector" style={{ marginBottom: '15px', padding: '10px', background: '#f1f3f5', borderRadius: '5px' }}>
              <label style={{ marginRight: '15px', cursor: 'pointer', fontWeight: scrapeType === 'tax_invoice' ? 'bold' : 'normal' }}>
                  <input type="radio" name="scrapeType" checked={scrapeType === 'tax_invoice'} onChange={() => setScrapeType('tax_invoice')} disabled={isScraping} style={{ marginRight: '5px' }} />
                  세금계산서
              </label>
              <label style={{ cursor: 'pointer', fontWeight: scrapeType === 'cash_receipt' ? 'bold' : 'normal' }}>
                  <input type="radio" name="scrapeType" checked={scrapeType === 'cash_receipt'} onChange={() => setScrapeType('cash_receipt')} disabled={isScraping} style={{ marginRight: '5px' }} />
                  현금영수증
              </label>
          </div>

          {scrapeType === 'tax_invoice' && (
              <div className="date-range-picker">
                <div className="date-input-group">
                  <label>시작일</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={isScraping} />
                </div>
                <span className="tilde">~</span>
                <div className="date-input-group">
                  <label>종료일</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} disabled={isScraping} />
                </div>
              </div>
          )}

          {scrapeType === 'cash_receipt' && (
              <div className="year-picker" style={{ marginBottom: '20px' }}>
                  <div className="date-input-group" style={{ width: '100%' }}>
                      <label>수집 연도 (최근 3년)</label>
                      <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} disabled={isScraping} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px', marginTop: '5px' }}>
                          {yearOptions.map(year => (
                              <option key={year} value={year}>{year}년 (1~4분기 전체)</option>
                          ))}
                      </select>
                  </div>
              </div>
          )}

          <button className="btn-start-scrape" style={{ backgroundColor: K_BRAND_COLOR }} onClick={handleStartScraping} disabled={isScraping || !isCertRegistered}>
            {isScraping ? '수집 진행 중...' : (scrapeType === 'tax_invoice' ? '세금계산서 불러오기' : '현금영수증 불러오기')}
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

      {completionMessage && (
        <div className="hometax-result-section" style={{textAlign:'center', padding:'60px 20px', backgroundColor:'#fff', borderRadius:'10px', border:'1px solid #eee', marginTop: '30px'}}>
            <div style={{fontSize:'48px', marginBottom:'20px'}}>✅</div>
            <h3 style={{color:'#333', fontSize:'22px', marginBottom:'15px', fontWeight:'bold'}}>수집 요청 완료</h3>
            <p style={{fontSize:'16px', color:'#555', whiteSpace:'pre-wrap', lineHeight:'1.8'}}>{completionMessage}</p>
        </div>
      )}

      {isCertModalOpen && targetUid && (
        <CertificateModal 
          partnerUid={targetUid} // 대표 UID 전달
          onClose={() => setIsCertModalOpen(false)} 
          onSuccess={async (info) => {
              // 모달 내부에서 이미 DB 저장함. 여기서는 상태만 갱신
              // (CertificateModal 수정 필요)
              await addLog("공동인증서를 등록/갱신 했습니다.");
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

// --- [인증서 등록 모달] - 수정됨 (DB에 저장) ---
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
            try { setExtractedInfo(await parseCertFile(file)); } catch (e) { setFileDer(null); }
        } else if (e.target.accept.includes(".key")) setFileKey(file);
    };

    const handleSaveCert = async () => {
        if (!fileDer || !fileKey || !password) return alert("모든 항목을 입력해주세요.");
        if (!partnerUid) return alert("사용자 정보를 찾을 수 없습니다.");

        setIsSaving(true);
        try {
            const der = await readFileToBase64(fileDer);
            const key = await readFileToBase64(fileKey);
            
            // [수정] LocalStorage가 아닌 Firestore의 하위 컬렉션에 저장 (대표자 계정)
            // 보안을 위해 users/{uid}/config/hometax_cert 경로 사용 (Rules 설정 필수)
            await setDoc(doc(db, 'users', partnerUid, 'config', 'hometax_cert'), {
                der, 
                key, 
                password, 
                certInfo: extractedInfo,
                updatedAt: serverTimestamp()
            });

            // 사용자 정보에 등록 여부 플래그 업데이트
            await setDoc(doc(db, 'users', partnerUid), { hometaxCertRegistered: true }, { merge: true });
            
            alert("인증서가 서버(DB)에 안전하게 등록되었습니다.\n이제 모든 직원이 이 인증서를 사용하여 수집할 수 있습니다.");
            if(extractedInfo) onSuccess(extractedInfo);
            onClose();
        } catch (e) { 
            console.error(e);
            alert("저장 중 오류가 발생했습니다."); 
        } finally { 
            setIsSaving(false); 
        }
    };

    return (
        <div className="cert-modal-backdrop" onClick={onClose}>
            <div className="cert-modal-content" onClick={e => e.stopPropagation()}>
                <h3>공동인증서 등록 (대표)</h3>
                <p style={{fontSize:'12px', color:'#666', marginBottom:'15px'}}>
                    등록된 인증서는 암호화되어 저장되며,<br/>직원들도 홈택스 수집 기능을 사용할 수 있게 됩니다.
                </p>
                <div className="cert-form-group"><label>인증서 파일 (.der)</label><input type="file" accept=".der" onChange={handleFileChange} /></div>
                {extractedInfo && <div style={{fontSize:'12px', background:'#f1f3f5', padding:'10px', marginBottom:'15px'}}><p>소유자: {extractedInfo.owner}</p><p>만료일: {extractedInfo.expireDate}</p></div>}
                <div className="cert-form-group"><label>개인키 파일 (.key)</label><input type="file" accept=".key" onChange={handleFileChange} /></div>
                <div className="cert-form-group"><label>비밀번호</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} /></div>
                <div className="cert-modal-footer"><button className="btn-cancel" onClick={onClose}>취소</button><button className="btn-save" onClick={handleSaveCert} disabled={isSaving}>저장하기</button></div>
            </div>
        </div>
    );
};

// ... (KeypadInputModal은 기존 코드 유지)
const KeypadInputModal: React.FC<{ imageUrl: string, docId: string, currentRound: number, serverMode: string, zonesConfig?: any, onClose: () => void }> = ({ imageUrl, docId, currentRound, serverMode, zonesConfig, onClose }) => {
    // (기존 로직 그대로 사용)
    const imgRef = useRef<HTMLImageElement>(null);
    const [isProcessing, setIsProcessing] = useState(false); 
    const [passwordDisplay, setPasswordDisplay] = useState(""); 
    const [calibStep, setCalibStep] = useState(0);
    const [tempPoints, setTempPoints] = useState<{x:number, y:number}[]>([]);
    const [tempZones, setTempZones] = useState<any>({});
    const zoneSteps = [{key:'shift',label:'쉬프트'},{key:'enter_l',label:'엔터-좌'},{key:'enter_r',label:'엔터-우'},{key:'back',label:'지우기'},{key:'space',label:'스페이스'}];

    useEffect(() => { setIsProcessing(false); }, [currentRound, imageUrl]);
    
    const getActualCoords = (e: React.MouseEvent) => {
        if (!imgRef.current) return { x:0, y:0 };
        const rect = imgRef.current.getBoundingClientRect();
        const scaleX = imgRef.current.naturalWidth / rect.width;
        const scaleY = imgRef.current.naturalHeight / rect.height;
        return { x: Math.round(e.nativeEvent.offsetX * scaleX), y: Math.round(e.nativeEvent.offsetY * scaleY) };
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
        e.stopPropagation();
        if (isProcessing) return;
        const { x, y } = getActualCoords(e);

        if (serverMode.startsWith('CALIBR')) {
             const newPoints = [...tempPoints, { x, y }];
             setTempPoints(newPoints);
             if (newPoints.length === 2) {
                 setIsProcessing(true);
                 const minX = Math.min(newPoints[0].x, newPoints[1].x);
                 const minY = Math.min(newPoints[0].y, newPoints[1].y);
                 const w = Math.abs(newPoints[1].x - newPoints[0].x);
                 const h = Math.abs(newPoints[1].y - newPoints[0].y);
                 const action = serverMode === 'CALIBR_CROP' ? 'set_crop' : 'set_zones';
                 const data = serverMode === 'CALIBR_CROP' ? {x:minX, y:minY, width:w, height:h} : {...tempZones, [zoneSteps[calibStep].key]: {x:minX, y:minY, width:w, height:h}};
                 
                 if(serverMode === 'CALIBR_ZONES' && calibStep < zoneSteps.length - 1) {
                     setTempZones(data); setTempPoints([]); setCalibStep(calibStep+1); setIsProcessing(false);
                 } else {
                     await updateDoc(doc(db, 'scraping_requests', docId), { status: 'INPUT_RECEIVED', action, data, round: currentRound });
                 }
             }
        } else {
            const zoneType = checkZone(x, y, zonesConfig);
            let actionType = 'click'; let shouldBlockUI = false; 
            if (zoneType === 'NORMAL' || zoneType === 'SPACE') setPasswordDisplay(prev => prev + "*");
            else if (zoneType === 'BACK') setPasswordDisplay(prev => prev.slice(0, -1));
            else if (zoneType === 'SHIFT') { actionType = 'refresh_click'; shouldBlockUI = true; }
            else if (zoneType === 'ENTER') { actionType = 'submit'; shouldBlockUI = true; }
            
            if (shouldBlockUI) setIsProcessing(true);
            try { await updateDoc(doc(db, 'scraping_requests', docId), { status: 'INPUT_RECEIVED', action: actionType, coordinate: { x, y }, round: currentRound }); } 
            catch (e) { if(shouldBlockUI) setIsProcessing(false); }
        }
    };

    let headerText = serverMode === 'CALIBR_CROP' ? "📐 초기 설정 (1/2)" : serverMode === 'CALIBR_ZONES' ? `🎹 키 설정` : "🔐 보안 키패드 입력";
    let subText = "비밀번호를 입력하세요. (Shift: 자동갱신 / Enter: 로그인)";

    return (
        <div className="cert-modal-backdrop" style={{zIndex: 9999}} onClick={(e) => { if(e.target === e.currentTarget) onClose(); }}>
            <div className="cert-modal-content" onClick={(e) => e.stopPropagation()} style={{width: 'auto', minWidth: '300px', maxWidth: '95vw', textAlign:'center', padding: '20px', backgroundColor: '#fff', borderRadius: '12px'}}>
                <h3 style={{color: '#2d3436', marginBottom:'5px', fontSize: '18px'}}>{headerText}</h3>
                <p style={{fontSize:'13px', color:'#666', marginBottom:'15px'}}>{subText}</p>
                {serverMode === 'INPUT' && <div style={{fontSize:'24px', fontWeight:'bold', color: K_BRAND_COLOR, margin:'10px 0', borderBottom:'2px solid #eee'}}>{passwordDisplay || <span style={{color:'#ccc', fontSize:'14px'}}>입력 대기</span>}</div>}
                <div className="keypad-container" style={{position:'relative', display:'inline-block', border:`3px solid ${K_BRAND_COLOR}`, borderRadius:'8px', overflow:'hidden'}}>
                    <img ref={imgRef} src={imageUrl} alt="Keypad" onClick={handleImageClick} style={{maxWidth:'100%', maxHeight:'60vh', display:'block', cursor: isProcessing ? 'wait' : 'crosshair', opacity: isProcessing ? 0.5 : 1}} />
                    {isProcessing && <div style={{position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -50%)'}}><div className="spinner"></div></div>}
                </div>
                <div style={{marginTop: '20px'}}><button className="btn-cancel" onClick={onClose}>닫기</button></div>
            </div>
        </div>
    );
};

export default AccountingHometaxPage;