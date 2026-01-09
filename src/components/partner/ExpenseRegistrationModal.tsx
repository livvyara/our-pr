import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, query, orderBy } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { app } from '../../firebase-config';
import './ExpenseRegistrationModal.css';

// [Security Note] 실제 프로덕션에서는 이 키를 백엔드(Cloud Functions)에서 호출하는 것이 안전합니다.
const GOOGLE_VISION_API_KEY = 'AIzaSyAeCLXtsGEqo67bKXPZtzDvLry1cF9ce2I';

// --- [Premium SVG Icons] ---
const Icons = {
  Close: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  UploadCloud: () => <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{color:'#3182F6'}}><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>,
  Camera: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>,
  Trash: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>,
  Calendar: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>,
  Check: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>,
  Scan: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  siteName: string;
  partnerUid: string;
  userName: string;
}

interface CategoryOption { name: string; subCategories: string[]; }

const ExpenseRegistrationModal: React.FC<Props> = ({ isOpen, onClose, siteId, siteName, partnerUid, userName }) => {
  const db = getFirestore(app);
  const storage = getStorage(app);
  
  const [useDate, setUseDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<number>(0);
  const [vendorName, setVendorName] = useState('');
  const [memo, setMemo] = useState('');

  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [category1, setCategory1] = useState('');
  const [category2, setCategory2] = useState('');

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && partnerUid) {
        fetchCategories();
    }
  }, [isOpen, partnerUid]);

  const fetchCategories = async () => {
      try {
          const q = query(collection(db, 'users', partnerUid, 'EXPENSE_CATEGORIES_SITE'), orderBy('order', 'asc'));
          const snap = await getDocs(q);
          const list: CategoryOption[] = snap.docs.map(d => ({
              name: d.data().name,
              subCategories: d.data().subCategories || []
          }));
          setCategoryOptions(list);
      } catch (e) { console.error("공종 로드 실패", e); }
  };

  const currentSubOptions = useMemo(() => {
      const target = categoryOptions.find(c => c.name === category1);
      return target ? target.subCategories : [];
  }, [categoryOptions, category1]);

  const handleCategory1Change = (e: React.ChangeEvent<HTMLSelectElement>) => {
      setCategory1(e.target.value);
      setCategory2('');
  };

  const parseReceiptData = (fullText: string) => {
    const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let detectedAmount = 0;
    let detectedDate = '';
    let detectedVendor = '';

    const amountKeywords = ['합계', '총액', '결제금액', '승인금액', '받을금액', '합계금액', '신용승인'];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].replace(/,/g, '');
        const hasKeyword = amountKeywords.some(kw => line.includes(kw));
        if (hasKeyword) {
            const nums = line.match(/(\d+)/g);
            if (nums) {
                const val = parseInt(nums[nums.length - 1], 10);
                if (val > 100 && !line.startsWith('0') && val < 100000000) {
                    detectedAmount = val;
                    break; 
                }
            }
            if (i + 1 < lines.length) {
                const nextLine = lines[i+1].replace(/,/g, '');
                const nextNums = nextLine.match(/(\d+)/g);
                if (nextNums) {
                    const val = parseInt(nextNums[0], 10);
                    if (val > 100 && !nextLine.startsWith('0')) {
                        detectedAmount = val;
                        break;
                    }
                }
            }
        }
    }
    if (detectedAmount === 0) {
        const potentialAmounts: number[] = [];
        lines.forEach(line => {
             const cleanLine = line.replace(/,/g, '');
             const match = cleanLine.match(/(\d+)원?/);
             if (match) {
                 const val = parseInt(match[1], 10);
                 if (val > 500 && val < 50000000 && !line.includes('-')) {
                     potentialAmounts.push(val);
                 }
             }
        });
        if (potentialAmounts.length > 0) {
            detectedAmount = Math.max(...potentialAmounts);
        }
    }

    const datePatterns = [
        /(\d{4})[-.\/년\s](\d{1,2})[-.\/월\s](\d{1,2})/,
        /20(\d{2})[-.\/](\d{1,2})[-.\/](\d{1,2})/
    ];
    for (const line of lines) {
        for (const regex of datePatterns) {
            const match = line.match(regex);
            if (match) {
                const year = match[1].length === 2 ? `20${match[1]}` : match[1];
                const month = match[2].padStart(2, '0');
                const day = match[3].padStart(2, '0');
                const validDate = `${year}-${month}-${day}`;
                const dObj = new Date(validDate);
                const now = new Date();
                if (dObj.getFullYear() >= 2020 && dObj <= now) {
                    detectedDate = validDate;
                    break;
                }
            }
        }
        if (detectedDate) break;
    }

    const vendorExcludeList = ['신용카드', '매출전표', '영수증', '고객용', '가맹점', '회원용', '전표', 'POS', 'TEL', 'FAX', '사업자', '대표', '주소', 'CARD', 'RECEIPT'];
    const vendorPrefixes = ['상호', '가맹점명', '점포명', '매장명'];
    for (const line of lines) {
        for (const prefix of vendorPrefixes) {
            if (line.includes(prefix)) {
                const extracted = line.replace(prefix, '').replace(/[:\s]/g, '').trim();
                if (extracted.length > 1) {
                    detectedVendor = extracted;
                    break;
                }
            }
        }
        if (detectedVendor) break;
    }
    if (!detectedVendor) {
        for (let i = 0; i < Math.min(lines.length, 5); i++) {
            const line = lines[i];
            if (line.length >= 2 && !vendorExcludeList.some(ex => line.includes(ex)) && !/^\d+$/.test(line.replace(/[-.\s]/g,''))) {
                detectedVendor = line;
                break;
            }
        }
    }
    return { detectedAmount, detectedDate, detectedVendor };
  };

  const performOCR = async (file: File) => {
      if (!GOOGLE_VISION_API_KEY) return;
      setIsOcrLoading(true);
      try {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onloadend = async () => {
              const base64Img = reader.result?.toString().split(',')[1];
              if (!base64Img) return;
              const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      requests: [{
                          image: { content: base64Img },
                          features: [{ type: 'TEXT_DETECTION' }],
                          imageContext: { languageHints: ["ko", "en"] }
                      }]
                  })
              });
              const data = await response.json();
              if (data.error) throw new Error(data.error.message);
              const fullText = data.responses[0]?.fullTextAnnotation?.text;
              if (fullText) {
                  const result = parseReceiptData(fullText);
                  if (result.detectedAmount > 0) setAmount(result.detectedAmount);
                  if (result.detectedDate) setUseDate(result.detectedDate);
                  if (result.detectedVendor && !vendorName) setVendorName(result.detectedVendor);
              }
          };
      } catch (e) { 
          console.error("OCR Error:", e);
          alert("영수증 인식에 실패했습니다. 직접 입력해주세요.");
      } finally { setIsOcrLoading(false); }
  };

  const processFile = async (file: File) => {
    if (!file) return;
    try {
        // [Server Cost & Storage Optimization]
        // 텍스트 판독이 중요한 영수증 특성에 맞춘 황금 비율 압축 설정입니다.
        // 기존 2MB 타겟을 0.4MB로 대폭 낮춰 유지비용을 약 80% 절감합니다.
        const options = {
            maxSizeMB: 0.4,          // 최대 400KB로 압축 (유지비 절감 핵심)
            maxWidthOrHeight: 1600,  // OCR 인식률과 선명도를 보장하는 최적 해상도
            useWebWorker: true,
            initialQuality: 0.8      // 원본의 선명도를 유지하며 용량만 축소
        };

        const compressed = await imageCompression(file, options);
        const preview = await imageCompression.getDataUrlFromFile(compressed);
        
        setReceiptFile(compressed);
        setReceiptPreview(preview);
        
        // 압축된 파일로 OCR 실행 (전송량 감소 및 속도 향상)
        performOCR(compressed);

    } catch (e) { 
        console.error("Image Compression Error:", e);
        alert("이미지 처리 중 오류가 발생했습니다."); 
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragActive(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragActive(false);
      if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const handleSave = async () => {
    if (amount === 0) return alert("금액을 입력해주세요.");
    if (!vendorName) return alert("사용처를 입력해주세요.");
    if (!category1) return alert("1차 분류를 선택해주세요.");
    
    setIsSubmitting(true);
    try {
      let finalImageUrl = '';
      if (receiptFile) {
          const storagePath = `users/${partnerUid}/expenses/${siteId}/${Date.now()}_${receiptFile.name}`;
          const sRef = ref(storage, storagePath);
          await uploadBytes(sRef, receiptFile);
          finalImageUrl = await getDownloadURL(sRef);
      }

      await addDoc(collection(db, 'users', partnerUid, 'expenses'), {
        siteId, siteName, useDate, amount,
        category: category1, subCategory: category2,
        cardName: userName, 
        vendorName, memo,
        imageUrl: finalImageUrl, createdAt: serverTimestamp()
      });

      await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), {
        text: `[지출등록] ${siteName} 현장에 ${amount.toLocaleString()}원(${category1}) 지출을 등록했습니다.`,
        createdAt: serverTimestamp(), type: 'expense_add'
      });

      alert("등록되었습니다.");
      onClose();
    } catch (e) { console.error(e); alert("오류가 발생했습니다."); } 
    finally { setIsSubmitting(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="erm-overlay">
      <div className="erm-container">
        <div className="erm-header">
          <div className="erm-title-group">
            <h3>카드 지출 등록</h3>
            <span className="erm-site-badge">{siteName}</span>
          </div>
          <button className="erm-close-btn" onClick={onClose}><Icons.Close /></button>
        </div>
        
        <div className="erm-body">
            <div className="erm-section">
                <label className="erm-label">사용 일자</label>
                <div className="erm-input-wrapper">
                    <input type="date" value={useDate} onChange={e => setUseDate(e.target.value)} className="erm-input" />
                    <div className="erm-icon-absolute"><Icons.Calendar /></div>
                </div>
            </div>

            <div className="erm-section">
                <label className="erm-label">
                    영수증 첨부 
                    {isOcrLoading && <span className="erm-ocr-status"><Icons.Scan /> AI 정밀 분석중...</span>}
                </label>
                {!receiptPreview ? (
                    <div className={`erm-dropzone ${isDragActive ? 'active' : ''}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
                        <div className="erm-drop-content">
                            <Icons.UploadCloud />
                            <p><strong>클릭 또는 드래그</strong>하여 영수증 업로드</p>
                            <span>JPG, PNG 지원 (서버 최적화 압축 적용)</span>
                        </div>
                        <button className="erm-mobile-cam-btn" onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}>
                            <Icons.Camera /> 카메라 촬영
                        </button>
                    </div>
                ) : (
                    <div className="erm-preview-card">
                        <div className="erm-preview-img-box" onClick={() => setEnlargedImage(receiptPreview)}>
                            <img src={receiptPreview} alt="Receipt" />
                            <div className="erm-preview-overlay">확대보기</div>
                        </div>
                        <div style={{flex:1, marginLeft:'12px', fontSize:'13px', color:'#666'}}>
                            {isOcrLoading ? (
                                <div style={{color:'#3182F6', fontWeight:'bold'}}>AI가 영수증 내용을 분석하고 있습니다...</div>
                            ) : (
                                <div>분석 완료! 내용이 맞는지 확인해주세요.</div>
                            )}
                        </div>
                        <button className="erm-preview-del-btn" onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}>
                            <Icons.Trash /> 삭제
                        </button>
                    </div>
                )}
                <input type="file" accept="image/*" ref={fileInputRef} hidden onChange={handleFileChange} />
                <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} hidden onChange={handleFileChange} />
            </div>

            <div className="erm-grid-row">
                <div className="erm-section">
                    <label className="erm-label">1차 분류 (공종) <span className="req">*</span></label>
                    <div className="erm-select-wrapper">
                        <select value={category1} onChange={handleCategory1Change} className="erm-select">
                            <option value="">선택하세요</option>
                            {categoryOptions.map((opt, idx) => (
                                <option key={idx} value={opt.name}>{opt.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="erm-section">
                    <label className="erm-label">2차 분류 (상세)</label>
                    <div className="erm-select-wrapper">
                        <select value={category2} onChange={e => setCategory2(e.target.value)} disabled={!category1} className="erm-select">
                            <option value="">선택하세요</option>
                            {currentSubOptions.map((sub, idx) => (
                                <option key={idx} value={sub}>{sub}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="erm-grid-row">
                <div className="erm-section">
                    <label className="erm-label">금액 <span className="req">*</span></label>
                    <input type="number" value={amount || ''} onChange={e => setAmount(Number(e.target.value))} placeholder="0" className="erm-input text-right" />
                </div>
                <div className="erm-section">
                    <label className="erm-label">카드 사용자</label>
                    <input type="text" value={userName} disabled className="erm-input disabled" />
                </div>
            </div>

            <div className="erm-section">
                <label className="erm-label">사용처 (가맹점) <span className="req">*</span></label>
                <input type="text" value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="예: 스타벅스, 다이소 (자동 입력됨)" className="erm-input" />
            </div>

            <div className="erm-section">
                <label className="erm-label">메모</label>
                <input type="text" value={memo} onChange={e => setMemo(e.target.value)} placeholder="지출 관련 특이사항 입력" className="erm-input" />
            </div>
        </div>

        <div className="erm-footer">
            <button className="erm-btn-cancel" onClick={onClose}>취소</button>
            <button className="erm-btn-save" onClick={handleSave} disabled={isSubmitting}>
                {isSubmitting ? '처리중...' : <><Icons.Check /> 등록하기</>}
            </button>
        </div>

        {enlargedImage && (
            <div className="erm-viewer-overlay" onClick={() => setEnlargedImage(null)}>
                <img src={enlargedImage} alt="Enlarged" onClick={e => e.stopPropagation()} />
                <button className="erm-viewer-close" onClick={() => setEnlargedImage(null)}><Icons.Close /></button>
            </div>
        )}
      </div>
    </div>
  );
};

export default ExpenseRegistrationModal;