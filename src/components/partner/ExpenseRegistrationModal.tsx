import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, query, orderBy } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';

// [수정] firebase-config에서 app을 직접 가져옴
import { app } from '../../firebase-config'; 

import './WorkerModal.css'; 
import './ExpenseRegistrationModal.css';

const GOOGLE_VISION_API_KEY = 'AIzaSyAeCLXtsGEqo67bKXPZtzDvLry1cF9ce2I';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  siteName: string;
  partnerUid: string;
  userName: string;
}

interface CategoryOption {
  name: string;
  subCategories: string[];
}

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
                          features: [{ type: 'TEXT_DETECTION' }],
                          imageContext: { languageHints: ["ko"] }
                      }]
                  })
              });
              const data = await response.json();
              if (data.error) {
                  alert("OCR 인식 실패: " + data.error.message);
                  return;
              }

              const text = data.responses[0]?.fullTextAnnotation?.text || '';
              // [수정] line 타입 명시
              const lines = text.split('\n').map((line: string) => line.trim()).filter((l: string) => l.length > 0);
              
              let foundAmount = 0;
              let foundDate = '';
              let foundVendor = '';

              // 1. 금액 찾기 (키워드 우선)
              const amountKeywords = ["합계", "총액", "결제금액", "승인금액", "받을금액"];
              for (let i = 0; i < lines.length; i++) {
                  const line = lines[i];
                  if (amountKeywords.some(kw => line.includes(kw))) {
                      let num = parseInt(line.replace(/[^0-9]/g, ''), 10);
                      if (!isNaN(num) && num > 0) { foundAmount = num; break; }
                      
                      if (i + 1 < lines.length) {
                          num = parseInt(lines[i+1].replace(/[^0-9]/g, ''), 10);
                          if (!isNaN(num) && num > 0) { foundAmount = num; break; }
                      }
                  }
              }

              // 키워드로 못 찾았다면 가장 큰 숫자 선택 (보완책)
              if (foundAmount === 0) {
                  // [수정] l: string 타입 명시하여 오류 해결
                  const allNumbers = lines.map((l: string) => parseInt(l.replace(/[^0-9]/g, ''), 10)).filter((n: number) => !isNaN(n));
                  if (allNumbers.length > 0) foundAmount = Math.max(...allNumbers);
              }

              // 2. 사용처(가맹점) 찾기
              const vendorKeywords = ["가맹점", "상호", "매장명", "점포명"];
              for (const line of lines) {
                  for (const kw of vendorKeywords) {
                      if (line.includes(kw)) {
                          const extracted = line.replace(kw, '').replace(/[:\s]/g, '').trim();
                          if (extracted.length > 1) {
                              foundVendor = extracted;
                              break;
                          }
                      }
                  }
                  if (foundVendor) break;
              }
              if (!foundVendor) {
                   const EXCLUDE_HEADER = ['신용카드', '매출전표', '영수증', '전표', '고객용', '환영합니다'];
                   for (let i=0; i<Math.min(3, lines.length); i++) {
                       const line = lines[i];
                       if (line.length > 2 && !EXCLUDE_HEADER.some(ex => line.includes(ex))) {
                           foundVendor = line;
                           break;
                       }
                   }
              }

              // 3. 날짜 찾기
              const dateRegex = /(\d{4})[-./](\d{2})[-./](\d{2})/;
              for (const line of lines) {
                  const match = line.match(dateRegex);
                  if (match) {
                      foundDate = `${match[1]}-${match[2]}-${match[3]}`;
                      break;
                  }
              }

              if (foundAmount > 0) setAmount(foundAmount);
              if (foundDate) setUseDate(foundDate);
              if (foundVendor && !vendorName) setVendorName(foundVendor);

              alert(`영수증 분석 완료!\n사용처: ${foundVendor}\n금액: ${foundAmount.toLocaleString()}원\n날짜: ${foundDate}`);
          };
      } catch (e) { console.error(e); alert("OCR 오류 발생"); } 
      finally { setIsOcrLoading(false); }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920 });
      const preview = await imageCompression.getDataUrlFromFile(compressed);
      setReceiptFile(compressed);
      setReceiptPreview(preview);
      performOCR(compressed);
    } catch (e) { alert("이미지 처리 실패"); }
  };

  const handleSave = async () => {
    if (amount === 0) return alert("금액을 입력해주세요.");
    if (!vendorName) return alert("사용처를 입력해주세요.");
    if (!category1) return alert("1차 분류를 선택해주세요.");
    
    setIsSubmitting(true);
    try {
      let finalImageUrl = '';
      if (receiptFile) {
          const storageRef = ref(storage, `users/${partnerUid}/expenses/${siteId}/${Date.now()}_${receiptFile.name}`);
          await uploadBytes(storageRef, receiptFile);
          finalImageUrl = await getDownloadURL(storageRef);
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
    <div className="worker-modal-wrapper">
      <div className="wm-overlay" onClick={onClose}>
        <div className="wm-content" onClick={e => e.stopPropagation()} style={{height:'auto', maxHeight:'95vh'}}>
          <div className="wm-header">
            <h3>카드 지출 등록 ({siteName})</h3>
            <button className="wm-close-btn" onClick={onClose}>×</button>
          </div>
          
          <div className="wm-body wm-scroll">
            <div className="wm-form-group">
                <label>사용 일자 & 영수증 {isOcrLoading && <span className="ocr-loading">(분석중...)</span>}</label>
                <div className="expense-date-row">
                    <input 
                        type="date" 
                        value={useDate} 
                        onChange={e => setUseDate(e.target.value)} 
                        className="pretty-date-input"
                    />
                    
                    <input type="file" accept="image/*" ref={fileInputRef} style={{display:'none'}} onChange={handleFileChange} />
                    <button className="wm-btn-upload" onClick={() => fileInputRef.current?.click()}>📁 파일선택</button>

                    <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} style={{display:'none'}} onChange={handleFileChange} />
                    <button className="wm-btn-camera" onClick={() => cameraInputRef.current?.click()}>📷 촬영</button>
                </div>
                
                {receiptPreview && (
                    <div className="wm-preview-container" style={{marginTop:'10px'}}>
                         <div className="wm-preview" onClick={() => setEnlargedImage(receiptPreview)} title="확대보기">
                            <img src={receiptPreview} alt="영수증" />
                        </div>
                        <button className="wm-btn-del-file" onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}>삭제</button>
                    </div>
                )}
            </div>

            <div className="wm-grid-row">
                <div className="wm-form-group">
                    <label>1차 분류 (공종) <span className="wm-req">*</span></label>
                    <select value={category1} onChange={handleCategory1Change}>
                        <option value="">선택하세요</option>
                        {categoryOptions.map((opt, idx) => (
                            <option key={idx} value={opt.name}>{opt.name}</option>
                        ))}
                    </select>
                </div>
                <div className="wm-form-group">
                    <label>2차 분류 (상세)</label>
                    <select value={category2} onChange={e => setCategory2(e.target.value)} disabled={!category1}>
                        <option value="">선택하세요</option>
                        {currentSubOptions.map((sub, idx) => (
                            <option key={idx} value={sub}>{sub}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="wm-grid-row">
                <div className="wm-form-group">
                    <label>금액 <span className="wm-req">*</span></label>
                    <input type="number" value={amount || ''} onChange={e => setAmount(Number(e.target.value))} placeholder="금액 입력" />
                </div>
                <div className="wm-form-group">
                    <label>카드명/사용자</label>
                    <input type="text" value={userName} disabled className="input-disabled" />
                </div>
            </div>

            <div className="wm-form-group">
                <label>사용처 (가맹점) <span className="wm-req">*</span></label>
                <input type="text" value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="예: 00식당, 00철물" />
            </div>

            <div className="wm-form-group">
                <label>메모</label>
                <input type="text" value={memo} onChange={e => setMemo(e.target.value)} placeholder="특이사항 입력" />
            </div>
          </div>

          <div className="wm-footer">
            <div className="wm-right-btns" style={{width:'100%', justifyContent:'flex-end'}}>
                <button className="wm-btn-cancel" onClick={onClose}>취소</button>
                <button className="wm-btn-save" onClick={handleSave} disabled={isSubmitting}>등록하기</button>
            </div>
          </div>
        </div>

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

export default ExpenseRegistrationModal;