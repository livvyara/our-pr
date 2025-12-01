import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, addDoc, serverTimestamp, getDoc, query, where, orderBy, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import { K_BRAND_COLOR } from '../../constants';
import imageCompression from 'browser-image-compression'; 
import './AccountingManualSalesPage.css'; 

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

interface InvoiceItem {
  date: string; itemName: string; spec: string; qty: number; unitPrice: number; supplyAmount: number; taxAmount: number; remark: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUserUid: string;
  userName: string;
  // 매출/매입 구분 (이 컴포넌트를 공용으로 쓸 경우)
  type: 'sales' | 'purchase'; 
}

const AccountingManualSalesPage: React.FC<Props> = ({ isOpen, onClose, currentUserUid, userName, type }) => {
  const [loading, setLoading] = useState(false);

  // --- [입력 폼 상태] ---
  const [writeDate, setWriteDate] = useState(new Date().toISOString().slice(0, 10));
  
  // 공급자
  const [vendorRegNo, setVendorRegNo] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vendorCeo, setVendorCeo] = useState('');
  const [vendorAddr, setVendorAddr] = useState('');

  // 공급받는자
  const [buyerRegNo, setBuyerRegNo] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerCeo, setBuyerCeo] = useState('');
  const [buyerAddr, setBuyerAddr] = useState('');

  const [items, setItems] = useState<InvoiceItem[]>([
      { date: '', itemName: '', spec: '', qty: 0, unitPrice: 0, supplyAmount: 0, taxAmount: 0, remark: '' },
      { date: '', itemName: '', spec: '', qty: 0, unitPrice: 0, supplyAmount: 0, taxAmount: 0, remark: '' },
      { date: '', itemName: '', spec: '', qty: 0, unitPrice: 0, supplyAmount: 0, taxAmount: 0, remark: '' },
      { date: '', itemName: '', spec: '', qty: 0, unitPrice: 0, supplyAmount: 0, taxAmount: 0, remark: '' }
  ]);
  const [mainRemark, setMainRemark] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalSupply = items.reduce((sum, item) => sum + item.supplyAmount, 0);
  const totalTax = items.reduce((sum, item) => sum + item.taxAmount, 0);
  const grandTotal = totalSupply + totalTax;

  // 초기 데이터 로드 (공급자 정보 등)
  useEffect(() => {
    const fetchUserInfo = async () => {
        if (!currentUserUid) return;
        const userDoc = await getDoc(doc(db, 'users', currentUserUid));
        if (userDoc.exists()) {
            const d = userDoc.data();
            const info = d.partnerInfo || {};
            
            // [매출]인 경우 '공급자'에 내 정보, [매입]인 경우 '공급받는자'에 내 정보
            const myRegNo = info.businessNumber || d.businessNumber || '';
            const myName = info.companyName || d.companyName || '';
            const myCeo = info.ceoName || d.name || '';
            const addrParts = [info.city, info.district, info.addressDetail].filter(Boolean);
            const myAddr = addrParts.length > 0 ? addrParts.join(' ') : (d.address || '');

            if (type === 'sales') {
                setVendorRegNo(myRegNo); setVendorName(myName); setVendorCeo(myCeo); setVendorAddr(myAddr);
            } else {
                setBuyerRegNo(myRegNo); setBuyerName(myName); setBuyerCeo(myCeo); setBuyerAddr(myAddr);
            }
        }
    };
    if (isOpen) fetchUserInfo();
  }, [isOpen, currentUserUid, type]);

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: string) => {
      const newItems = [...items];
      const item = { ...newItems[index] };
      if (['qty', 'unitPrice', 'supplyAmount', 'taxAmount'].includes(field)) {
          const numVal = Number(value.replace(/[^0-9]/g, "")) || 0;
          (item as any)[field] = numVal;
          if (field === 'qty' || field === 'unitPrice') {
              const qty = field === 'qty' ? numVal : item.qty;
              const price = field === 'unitPrice' ? numVal : item.unitPrice;
              if (qty > 0 && price > 0) {
                  item.supplyAmount = qty * price;
                  item.taxAmount = Math.floor(item.supplyAmount * 0.1);
              }
          } else if (field === 'supplyAmount') {
              item.taxAmount = Math.floor(numVal * 0.1);
          }
      } else {
          (item as any)[field] = value;
      }
      newItems[index] = item;
      setItems(newItems);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
          const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920 });
          setImageFile(compressed);
          const reader = new FileReader();
          reader.readAsDataURL(compressed);
          reader.onloadend = () => setPreviewUrl(reader.result as string);
      } catch (error) { alert("이미지 처리 오류"); }
  };

  const handleSave = async () => {
      if (!currentUserUid) return;
      if (!vendorName || !buyerName) return alert("상호는 필수입니다.");
      if (!imageFile) return alert("사진을 첨부해주세요.");
      if (totalSupply === 0) return alert("공급가액을 입력해주세요.");
      
      setLoading(true);
      try {
          const storageRef = ref(storage, `users/${currentUserUid}/paper_invoices/${Date.now()}_${imageFile.name}`);
          await uploadBytes(storageRef, imageFile);
          const downloadUrl = await getDownloadURL(storageRef);

          const collectionName = type === 'sales' ? 'TAX_SALES' : 'TAX_PURCHASE';
          const inOutText = type === 'sales' ? '매출' : '매입';

          const validItems = items.filter(it => it.itemName || it.supplyAmount > 0);
          await addDoc(collection(db, 'users', currentUserUid, collectionName), {
              writeDate, type: '종이세금계산서', inOut: inOutText, issueType: '수기',
              vendorRegNo, vendorName, vendorCeo, vendorAddr,
              buyerRegNo, buyerName, buyerCeo, buyerAddr,
              supplyAmount: totalSupply, taxAmount: totalTax, totalAmount: grandTotal,
              remark: mainRemark, items: validItems, imageUrl: downloadUrl,
              createdAt: serverTimestamp(), createdBy: userName, isPaper: true,
              approvalNo: `PAPER-${Date.now()}`
          });
          
          await addDoc(collection(db, 'users', currentUserUid, 'ACTIVITY_LOGS'), {
            text: `[수기등록] ${userName}님이 ${type==='sales'?buyerName:vendorName}건 종이 세금계산서(${inOutText})를 등록했습니다.`,
            createdAt: serverTimestamp(), type: 'tax_invoice_manual'
          });

          alert("등록되었습니다.");
          onClose();
      } catch (e) { console.error(e); alert("오류 발생"); } finally { setLoading(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="invoice-modal-backdrop" onClick={onClose} style={{zIndex: 3100}}>
        <div className="invoice-paper" onClick={e => e.stopPropagation()} style={{width:'95vw', maxWidth:'1200px', height:'90vh', display:'flex', flexDirection:'column'}}>
            <div className="page-header">
                <h2>{type === 'sales' ? '매출' : '매입'}자료 등록 (수기)</h2>
                <button className="modal-close-btn" onClick={onClose} style={{float:'right', fontSize:'24px', border:'none', background:'none', cursor:'pointer'}}>×</button>
            </div>

            <div className="content-grid" style={{flex:1, overflowY:'auto'}}>
                <div className="image-section">
                    <div className="image-preview-box" onClick={() => fileInputRef.current?.click()} style={{ backgroundImage: previewUrl ? `url(${previewUrl})` : 'none' }}>
                        {!previewUrl && (<div className="placeholder-text"><span>📸</span><p>사진 첨부</p></div>)}
                    </div>
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageChange} style={{display:'none'}} />
                </div>

                <div className="form-section">
                    <div className="form-row date-row"><label>작성일자</label><input type="date" value={writeDate} onChange={e => setWriteDate(e.target.value)} /></div>
                    <div className="tax-bill-box">
                        {/* 공급자 */}
                        <div className="bill-part vendor">
                            <div className={`part-header ${type==='sales'?'red':'gray'}`}>공급자 {type==='sales'?'(나)':'(상대방)'}</div>
                            <div className="part-body">
                                <div className="input-group"><label>등록번호</label><input type="text" value={vendorRegNo} onChange={e => setVendorRegNo(e.target.value)} disabled={type==='sales'} /></div>
                                <div className="input-group"><label>상호</label><input type="text" value={vendorName} onChange={e => setVendorName(e.target.value)} disabled={type==='sales'} /></div>
                                <div className="input-group"><label>대표자</label><input type="text" value={vendorCeo} onChange={e => setVendorCeo(e.target.value)} disabled={type==='sales'} /></div>
                            </div>
                        </div>
                        {/* 공급받는자 */}
                        <div className="bill-part buyer">
                            <div className={`part-header ${type==='purchase'?'blue':'gray'}`}>공급받는자 {type==='purchase'?'(나)':'(상대방)'}</div>
                            <div className="part-body">
                                <div className="input-group"><label>등록번호</label><input type="text" value={buyerRegNo} onChange={e => setBuyerRegNo(e.target.value)} disabled={type==='purchase'} /></div>
                                <div className="input-group"><label>상호</label><input type="text" value={buyerName} onChange={e => setBuyerName(e.target.value)} disabled={type==='purchase'} /></div>
                                <div className="input-group"><label>대표자</label><input type="text" value={buyerCeo} onChange={e => setBuyerCeo(e.target.value)} disabled={type==='purchase'} /></div>
                            </div>
                        </div>
                    </div>

                    <div className="items-section">
                         <table className="items-table-input">
                            <thead><tr><th>품목</th><th>수량</th><th>단가</th><th>공급가액</th><th>세액</th></tr></thead>
                            <tbody>
                                {items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td><input type="text" value={item.itemName} onChange={e => handleItemChange(idx, 'itemName', e.target.value)} /></td>
                                        <td><input type="text" value={item.qty} onChange={e => handleItemChange(idx, 'qty', e.target.value)} className="right" /></td>
                                        <td><input type="text" value={item.unitPrice} onChange={e => handleItemChange(idx, 'unitPrice', e.target.value)} className="right" /></td>
                                        <td><input type="text" value={item.supplyAmount} onChange={e => handleItemChange(idx, 'supplyAmount', e.target.value)} className="right" /></td>
                                        <td><input type="text" value={item.taxAmount} onChange={e => handleItemChange(idx, 'taxAmount', e.target.value)} className="right" /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="total-summary-box">
                        <span>합계: {grandTotal.toLocaleString()}원</span>
                    </div>
                </div>
            </div>

            <div className="action-buttons" style={{marginTop:'20px'}}>
                <button className="btn-cancel" onClick={onClose}>취소</button>
                <button className="btn-save-manual" onClick={handleSave} disabled={loading} style={{background: K_BRAND_COLOR}}>저장하기</button>
            </div>
        </div>
    </div>
  );
};

export default AccountingManualSalesPage;