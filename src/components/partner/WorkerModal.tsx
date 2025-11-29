import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, collection, addDoc, updateDoc, doc, serverTimestamp, getDoc, setDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import './WorkerModal.css'; 

// [API Key]
const GOOGLE_VISION_API_KEY = 'AIzaSyAeCLXtsGEqo67bKXPZtzDvLry1cF9ce2I'; 

interface WorkerData {
  id?: string; workerName: string; companyName: string; trade: string; phoneNumber: string;
  workerType: 'agency' | 'freelance'; residentNumber: string; bankName: string; accountNumber: string; accountOwner: string;
  idCardUrl?: string; delegationUrl?: string; appliedTaxRate: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  partnerUid: string;
  targetWorker: WorkerData | null;
  tradeOptions: string[];
  userName: string; // [NEW] 로그용 사용자 이름
}

const WorkerModal: React.FC<Props> = ({ isOpen, onClose, partnerUid, targetWorker, tradeOptions, userName }) => {
  const db = getFirestore();
  const storage = getStorage();
  const modalRef = useRef<HTMLDivElement>(null);

  // States
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [trade, setTrade] = useState('미지정');
  const [phone, setPhone] = useState('');
  const [workerType, setWorkerType] = useState<'agency' | 'freelance'>('freelance');
  const [residentNumber, setResidentNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountOwner, setAccountOwner] = useState('');
  
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [idCardPreview, setIdCardPreview] = useState<string | null>(null);
  const [delegationFile, setDelegationFile] = useState<File | null>(null);
  const [delegationPreview, setDelegationPreview] = useState<string | null>(null);

  const [isTaxSettingOpen, setIsTaxSettingOpen] = useState(false);
  // [수정] 세금 설정 초기값 (확장된 구조)
  const [taxRates, setTaxRates] = useState({ 
      freelance: 3.3, 
      agency: 10.0 // 기본값 (상세 설정은 별도 로직이나 단순화)
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  // [Helper] 주민번호 마스킹 함수
  const maskRrn = (rrn: string) => {
      if (!rrn || rrn.length < 8) return rrn;
      return rrn.substring(0, 8) + '******';
  };

  useEffect(() => {
    if (isOpen && partnerUid) {
        loadTaxRates();
        if (targetWorker) {
            setName(targetWorker.workerName); setCompany(targetWorker.companyName); setTrade(targetWorker.trade); setPhone(targetWorker.phoneNumber);
            setWorkerType(targetWorker.workerType || 'freelance'); 
            // 불러올 때 마스킹 처리
            setResidentNumber(maskRrn(targetWorker.residentNumber || ''));
            setBankName(targetWorker.bankName || ''); setAccountNumber(targetWorker.accountNumber || ''); setAccountOwner(targetWorker.accountOwner || '');
            setIdCardPreview(targetWorker.idCardUrl || null); setDelegationPreview(targetWorker.delegationUrl || null);
        } else {
            resetForm();
        }
        if (modalRef.current) modalRef.current.focus();
    }
  }, [isOpen, targetWorker, partnerUid]);

  const resetForm = () => {
      setName(''); setCompany(''); setTrade('미지정'); setPhone(''); setWorkerType('freelance'); setResidentNumber('');
      setBankName(''); setAccountNumber(''); setAccountOwner(''); setIdCardFile(null); setIdCardPreview(null); setDelegationFile(null); setDelegationPreview(null);
  }

  const loadTaxRates = async () => {
      try {
          const snap = await getDoc(doc(db, 'users', partnerUid, 'settings', 'taxRates'));
          if (snap.exists()) {
              const data = snap.data();
              // 호환성 처리 (단순 구조일 경우)
              if (typeof data.agency === 'number') {
                  setTaxRates({ freelance: data.freelance, agency: data.agency });
              }
          }
      } catch (e) { console.error("세금요율 로드 실패", e); }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value.replace(/[^0-9]/g, '').slice(0, 11);
      if (val.length > 7) val = `${val.slice(0, 3)}-${val.slice(3, 7)}-${val.slice(7)}`;
      else if (val.length > 3) val = `${val.slice(0, 3)}-${val.slice(3)}`;
      setPhone(val);
  };

  const handleResidentNumChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // 수정 시에는 마스킹 해제되고 숫자 입력
      let val = e.target.value.replace(/[^0-9]/g, '').slice(0, 13);
      if (val.length > 6) val = `${val.slice(0, 6)}-${val.slice(6)}`;
      setResidentNumber(val);
  };

  const performOCR = async (file: File) => {
      if (!GOOGLE_VISION_API_KEY) return;
      setIsOcrLoading(true);
      try {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onloadend = async () => {
              const base64Img = reader.result?.toString().split(',')[1];
              const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`, {
                  method: 'POST',
                  body: JSON.stringify({
                      requests: [{
                          image: { content: base64Img },
                          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                          imageContext: { languageHints: ["ko"] }
                      }]
                  })
              });
              const data = await response.json();
              if (data.error) return;

              const text = data.responses[0]?.fullTextAnnotation?.text || '';
              const lines = text.split('\n').map((line: string) => line.trim()).filter((line: string) => line.length > 0);
              
              const EXCLUDE_WORDS = ['자동차운전면허증', '주민등록증', '운전면허증', '적성검사', '기간', '면허증', '경찰청장', '발급', '조건', '주소', '행정안전부장관', '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '특별시', '광역시', '특별자치시', '도', '특별자치도', '시', '군', '구', '읍', '면', '동', '리', '로', '길', '대로', '가', '번지', '호', '층', '아파트', '빌라', '맨션', '타운', '마을', '단지', '주택', '오피스텔'];

              let extractedName = "";
              let extractedRRN = "";
              const rrnRegex = /(\d{6})\s*[-]?\s*([1-4]\d{6})/;

              for (let i = 0; i < lines.length; i++) {
                  const line = lines[i];
                  const rrnMatch = line.match(rrnRegex);
                  if (rrnMatch) {
                      extractedRRN = `${rrnMatch[1]}-${rrnMatch[2]}`;
                      if (i > 0) {
                          const prevLine = lines[i - 1];
                          const nameMatch = prevLine.replace(/\s/g, '').match(/[가-힣]{2,4}/);
                          if (nameMatch && !EXCLUDE_WORDS.some(word => prevLine.includes(word))) {
                              extractedName = nameMatch[0];
                          }
                      }
                      break; 
                  }
              }

              if (!extractedName) {
                  for (const line of lines) {
                      if (line.includes("성명") || line.includes("이름")) {
                          const namePart = line.replace(/성명|이름|:| /g, ""); 
                          const match = namePart.match(/[가-힣]{2,4}/);
                          if (match) { extractedName = match[0]; break; }
                      }
                      const hanjaMatch = line.match(/([가-힣]{2,4})\s*\(/);
                      if (hanjaMatch) { extractedName = hanjaMatch[1]; break; }
                  }
              }

              if (extractedRRN) setResidentNumber(extractedRRN);
              if (extractedName) setName(extractedName);
          };
      } catch (e) { console.error(e); } 
      finally { setIsOcrLoading(false); }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'idCard' | 'delegation') => {
      const file = e.target.files?.[0]; if (!file) return;
      try {
          const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920 });
          const preview = await imageCompression.getDataUrlFromFile(compressed);
          if (type === 'idCard') {
              setIdCardFile(compressed); setIdCardPreview(preview);
              performOCR(compressed);
          } else {
              setDelegationFile(compressed); setDelegationPreview(preview);
          }
      } catch (e) { alert("이미지 처리 실패"); }
  };

  // 실제 저장될 주민번호 (마스킹 상태면 원본 유지)
  const getRealResidentNumber = () => {
      if (residentNumber.includes('*')) return targetWorker?.residentNumber || '';
      return residentNumber;
  };

  const validateForm = () => {
      const realRrn = getRealResidentNumber();
      if (!name.trim()) return "이름을 입력해주세요.";
      if (!realRrn.includes('-') || realRrn.length !== 14) return "주민등록번호를 올바르게 입력해주세요.";
      if (!company.trim()) return "소속(업체명)을 입력해주세요.";
      if (trade === '미지정') return "공종을 선택해주세요.";
      if (!bankName.trim() || !accountNumber.trim() || !accountOwner.trim()) return "계좌 정보를 모두 입력해주세요.";
      return null;
  };

  const handleSave = async () => {
    const errorMsg = validateForm();
    if (errorMsg) return alert(errorMsg);
    if (!partnerUid) return;

    setIsSubmitting(true);
    try {
      let finalIdCardUrl = targetWorker?.idCardUrl || '';
      let finalDelegationUrl = targetWorker?.delegationUrl || '';
      
      if (idCardFile) {
          const storageRef = ref(storage, `users/${partnerUid}/workers/docs/${Date.now()}_idCard_${idCardFile.name}`);
          await uploadBytes(storageRef, idCardFile); finalIdCardUrl = await getDownloadURL(storageRef);
      }
      if (!idCardPreview) finalIdCardUrl = '';

      if (delegationFile && workerType === 'agency') {
          const storageRef = ref(storage, `users/${partnerUid}/workers/docs/${Date.now()}_delegation_${delegationFile.name}`);
          await uploadBytes(storageRef, delegationFile); finalDelegationUrl = await getDownloadURL(storageRef);
      }
      if (!delegationPreview) finalDelegationUrl = '';

      const realRrn = getRealResidentNumber();

      const workerData = {
          workerName: name, companyName: company, trade, phoneNumber: phone, workerType, 
          residentNumber: realRrn,
          bankName, accountNumber, accountOwner, idCardUrl: finalIdCardUrl, delegationUrl: workerType === 'agency' ? finalDelegationUrl : '',
          appliedTaxRate: workerType === 'agency' ? taxRates.agency : taxRates.freelance, updatedAt: serverTimestamp()
      };
      const colRef = collection(db, 'users', partnerUid, 'workers');
      
      if (targetWorker && targetWorker.id) {
        await updateDoc(doc(colRef, targetWorker.id), workerData);
        
        // [LOG] 상세 수정 로그
        const changes: string[] = [];
        if (targetWorker.workerName !== name) changes.push(`이름(${targetWorker.workerName}→${name})`);
        if (targetWorker.companyName !== company) changes.push(`소속(${targetWorker.companyName}→${company})`);
        if (targetWorker.trade !== trade) changes.push(`공종(${targetWorker.trade}→${trade})`);
        if (targetWorker.workerType !== workerType) changes.push(`유형(${targetWorker.workerType==='agency'?'인력':'프리'}→${workerType==='agency'?'인력':'프리'})`);
        
        const changeLog = changes.length > 0 ? ` [변경: ${changes.join(', ')}]` : '';
        await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), {
            text: `[작업자수정] ${userName}님이 작업자 ${name}의 정보를 수정했습니다.${changeLog}`,
            createdAt: serverTimestamp(), type: 'worker_update'
        });

      } else {
        await addDoc(colRef, { ...workerData, createdAt: serverTimestamp() });
        // [LOG] 등록 로그
        await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), {
            text: `[작업자등록] ${userName}님이 새로운 작업자 ${name}(${company})를 등록했습니다.`,
            createdAt: serverTimestamp(), type: 'worker_add'
        });
      }
      onClose();
    } catch (e) { console.error(e); alert("저장 중 오류"); } finally { setIsSubmitting(false); }
  };
  
  const saveTaxRates = async () => {
      try { await setDoc(doc(db, 'users', partnerUid, 'settings', 'taxRates'), taxRates); setIsTaxSettingOpen(false); } catch(e) { alert("저장 실패"); }
  };

  const openPreview = (url: string) => {
      setEnlargedImage(url);
  };

  if (!isOpen) return null;

  return (
    <div className="worker-modal-wrapper">
      <div className="wm-overlay" onClick={onClose}>
        <div className="wm-content" onClick={e => e.stopPropagation()} ref={modalRef} tabIndex={-1}>
          <div className="wm-header">
            <h3>{targetWorker ? '작업자 정보 수정' : '새 작업자 등록'}</h3>
            <button className="wm-close-btn" onClick={onClose}>×</button>
          </div>

          <div className="wm-body wm-scroll">
            <div className="wm-file-group" style={{marginBottom:'20px'}}>
                <label style={{marginBottom:'10px', display:'block'}}>신분증 사본 {isOcrLoading && <span className="ocr-loading"> (OCR 인식 중...)</span>}</label>
                <div className="wm-file-box">
                    {!idCardPreview ? (
                        <input type="file" accept="image/*" onChange={e => handleFileChange(e, 'idCard')} />
                    ) : (
                        <div className="wm-preview-container">
                            <div className="wm-preview" onClick={() => openPreview(idCardPreview)} title="클릭하여 확대보기">
                                <img src={idCardPreview} alt="신분증 미리보기" />
                            </div>
                            <button className="wm-btn-del-file" onClick={() => { setIdCardFile(null); setIdCardPreview(null); }}>삭제</button>
                        </div>
                    )}
                </div>
            </div>

            <div className="wm-section-title">근로 형태</div>
            <div className="wm-form-group wm-radio-group">
                <label className={`wm-radio-label ${workerType === 'freelance' ? 'selected' : ''}`}>
                    <input type="radio" checked={workerType === 'freelance'} onChange={() => setWorkerType('freelance')} /> 프리랜서 ({taxRates.freelance}%)
                </label>
                <label className={`wm-radio-label ${workerType === 'agency' ? 'selected' : ''}`}>
                    <input type="radio" checked={workerType === 'agency'} onChange={() => setWorkerType('agency')} /> 인력소 (계산서)
                </label>
            </div>

            <div className="wm-section-title">기본 정보 <span className="wm-req-info">(*필수 입력)</span></div>
            <div className="wm-grid-row">
              <div className="wm-form-group">
                  <label>이름 <span className="wm-req">*</span></label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="성명" />
              </div>
              <div className="wm-form-group">
                  <label>주민등록번호 <span className="wm-req">*</span></label>
                  <input type="text" value={residentNumber} onChange={handleResidentNumChange} placeholder="000000-0000000" maxLength={14}/>
              </div>
            </div>
            <div className="wm-grid-row">
              <div className="wm-form-group">
                  <label>소속(업체) <span className="wm-req">*</span></label>
                  <input type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="업체명" />
              </div>
              <div className="wm-form-group">
                  <label>공종 <span className="wm-req">*</span></label>
                  <select value={trade} onChange={e => setTrade(e.target.value)}>
                     <option value="미지정">미지정</option>
                     {tradeOptions.filter(t => t !== '전체').map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
              </div>
            </div>
            <div className="wm-form-group">
              <label>연락처</label>
              <input type="text" value={phone} onChange={handlePhoneChange} placeholder="010-0000-0000" maxLength={13} />
            </div>

            <div className="wm-section-title">계좌 정보 <span className="wm-req">*</span></div>
            <div className="wm-account-layout">
                <div className="wm-grid-row">
                    <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="은행명" className="wm-input-half" />
                    <input type="text" value={accountOwner} onChange={e => setAccountOwner(e.target.value)} placeholder="예금주" className="wm-input-half" />
                </div>
                <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="계좌번호 (하이픈 없이 숫자만)" className="wm-input-full" />
            </div>

            {workerType === 'agency' && (
                <div className="wm-file-group" style={{marginTop:'20px'}}>
                    <label style={{display:'block', marginBottom:'5px', fontWeight:'bold', color:'#555'}}>위임장</label>
                    <div className="wm-file-box">
                        {!delegationPreview ? (
                            <input type="file" accept="image/*" onChange={e => handleFileChange(e, 'delegation')} />
                        ) : (
                            <div className="wm-preview-container">
                                <div className="wm-preview" onClick={() => openPreview(delegationPreview)} title="클릭하여 확대보기">
                                    <img src={delegationPreview} alt="위임장 미리보기" />
                                </div>
                                <button className="wm-btn-del-file" onClick={() => { setDelegationFile(null); setDelegationPreview(null); }}>삭제</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
          </div>

          <div className="wm-footer">
            <button className="wm-btn-tax" onClick={() => setIsTaxSettingOpen(true)}>⚙️ 세금요율 설정</button>
            <div className="wm-right-btns">
                <button className="wm-btn-cancel" onClick={onClose}>취소</button>
                <button className="wm-btn-save" onClick={handleSave} disabled={isSubmitting}>저장</button>
            </div>
          </div>
        </div>

        {isTaxSettingOpen && (
            <div className="wm-inner-overlay">
                <div className="wm-inner-modal">
                    <h4>세금요율 설정 (%)</h4>
                    <div className="wm-form-group"><label>프리랜서 (기본 3.3)</label><input type="number" step="0.1" value={taxRates.freelance} onChange={e => setTaxRates({...taxRates, freelance: parseFloat(e.target.value)||0})} /></div>
                    <div className="wm-form-group"><label>인력소 (기본 10.0)</label><input type="number" step="0.1" value={taxRates.agency} onChange={e => setTaxRates({...taxRates, agency: parseFloat(e.target.value)||0})} /></div>
                    <div className="wm-inner-footer"><button className="wm-btn-cancel" onClick={() => setIsTaxSettingOpen(false)}>취소</button><button className="wm-btn-save" onClick={saveTaxRates}>저장</button></div>
                </div>
            </div>
        )}

        {enlargedImage && (
            <div className="wm-image-viewer" onClick={() => setEnlargedImage(null)}>
                <div className="wm-image-box" onClick={e => e.stopPropagation()}>
                    <img src={enlargedImage} alt="확대 보기" />
                    <button className="wm-close-viewer" onClick={() => setEnlargedImage(null)}>×</button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
export default WorkerModal;