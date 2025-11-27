import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, addDoc, serverTimestamp, getDoc, query, where, orderBy, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import { K_BRAND_COLOR } from '../../constants';
import imageCompression from 'browser-image-compression'; 
import './AccountingManualPurchasePage.css'; 

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// [Interface]
interface InvoiceItem {
  date: string; itemName: string; spec: string; qty: number; unitPrice: number; supplyAmount: number; taxAmount: number; remark: string;
}
// DB 저장된 데이터 타입
interface ManualInvoiceData {
    id: string; writeDate: string; vendorName: string; vendorRegNo: string; vendorCeo: string; vendorAddr: string;
    buyerName: string; buyerRegNo: string; buyerCeo: string; buyerAddr: string;
    supplyAmount: number; taxAmount: number; totalAmount: number; remark: string;
    items: InvoiceItem[]; imageUrl: string; issueType: string;
}

const AccountingManualPurchasePage: React.FC = () => {
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [currentUserInfo, setCurrentUserInfo] = useState<{uid: string, name: string}>({uid:'', name:''});
  const [loading, setLoading] = useState(false);

  // [리스트 & 모달 상태]
  const [manualList, setManualList] = useState<ManualInvoiceData[]>([]);
  const [editTarget, setEditTarget] = useState<ManualInvoiceData | null>(null);

  // --- [입력 폼 상태] ---
  const [writeDate, setWriteDate] = useState(new Date().toISOString().slice(0, 10));
  
  // 공급자 (상대방 - 수기 입력 대상)
  const [vendorRegNo, setVendorRegNo] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vendorCeo, setVendorCeo] = useState('');
  const [vendorAddr, setVendorAddr] = useState('');

  // 공급받는자 (나 - 자동 입력 대상)
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

  // [Helpers]
  const formatBizNum = (num: string) => {
      if (!num) return '';
      const nums = num.replace(/[^0-9]/g, "").slice(0, 10);
      if (nums.length <= 3) return nums;
      if (nums.length <= 5) return `${nums.slice(0, 3)}-${nums.slice(3)}`;
      return `${nums.slice(0, 3)}-${nums.slice(3, 5)}-${nums.slice(5)}`;
  };
  const handleBizNumChange = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<string>>) => {
      setter(formatBizNum(e.target.value));
  };
  const parseNumber = (val: string) => Number(val.replace(/[^0-9]/g, "")) || 0;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUid(user.uid);
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if(userDoc.exists()) {
            const d = userDoc.data();
            setCurrentUserInfo({ uid: user.uid, name: d.nickname || d.email || '사용자' });
            
            // [매입 페이지] 나의 정보를 '공급받는자(Buyer)' 칸에 자동 입력
            const info = d.partnerInfo || {};
            
            const bizNum = info.businessNumber || d.businessNumber || '';
            setBuyerRegNo(formatBizNum(bizNum));
            setBuyerName(info.companyName || d.companyName || '');
            setBuyerCeo(info.ceoName || d.name || '');

            const addrParts = [info.city, info.district, info.addressDetail].filter(Boolean);
            if (addrParts.length > 0) setBuyerAddr(addrParts.join(' '));
            else setBuyerAddr(d.address || '');
        }
        fetchManualList(user.uid); 
      }
    });
    return () => unsubscribe();
  }, []);

  // [수집 대상 컬렉션: TAX_PURCHASE]
  const fetchManualList = async (uid: string) => {
      try {
          const q = query(
              collection(db, 'users', uid, 'TAX_PURCHASE'),
              where('issueType', '==', '수기'), 
              orderBy('writeDate', 'desc')
          );
          const snap = await getDocs(q);
          const list: ManualInvoiceData[] = [];
          snap.forEach(d => list.push({ id: d.id, ...d.data() } as ManualInvoiceData));
          setManualList(list);
      } catch (e) { console.error("리스트 로드 실패 (인덱스 확인 필요):", e); }
  };

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: string) => {
      const newItems = [...items];
      const item = { ...newItems[index] };
      if (['qty', 'unitPrice', 'supplyAmount', 'taxAmount'].includes(field)) {
          const numVal = parseNumber(value);
          (item as any)[field] = numVal;
          if (field === 'qty' || field === 'unitPrice') {
              const qty = field === 'qty' ? numVal : item.qty;
              const price = field === 'unitPrice' ? numVal : item.unitPrice;
              if (qty > 0 && price > 0) {
                  item.supplyAmount = qty * price;
                  item.taxAmount = Math.floor(item.supplyAmount * 0.1);
              }
          } else if (field === 'supplyAmount') item.taxAmount = Math.floor(numVal * 0.1);
      } else (item as any)[field] = value;
      newItems[index] = item;
      setItems(newItems);
  };
  const addItemRow = () => setItems([...items, { date: '', itemName: '', spec: '', qty: 0, unitPrice: 0, supplyAmount: 0, taxAmount: 0, remark: '' }]);
  const removeItemRow = (index: number) => { if (items.length > 1) setItems(items.filter((_, i) => i !== index)); };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
          const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true });
          setImageFile(compressed);
          const reader = new FileReader();
          reader.readAsDataURL(compressed);
          reader.onloadend = () => setPreviewUrl(reader.result as string);
      } catch (error) { alert("이미지 처리 오류"); }
  };

  const handleSave = async () => {
      if (!currentUid) return;
      if (!vendorName || !buyerName) return alert("상호는 필수입니다.");
      if (!imageFile) return alert("종이 세금계산서 사진을 첨부해주세요.");
      if (totalSupply === 0) return alert("공급가액을 입력해주세요.");
      if (!confirm("매입 자료를 등록하시겠습니까?")) return;

      setLoading(true);
      try {
          const storageRef = ref(storage, `users/${currentUid}/paper_invoices/${Date.now()}_${imageFile.name}`);
          await uploadBytes(storageRef, imageFile);
          const downloadUrl = await getDownloadURL(storageRef);

          const validItems = items.filter(it => it.itemName || it.supplyAmount > 0);
          
          // [매입 저장]
          await addDoc(collection(db, 'users', currentUid, 'TAX_PURCHASE'), {
              writeDate, type: '종이세금계산서', inOut: '매입', issueType: '수기',
              vendorRegNo, vendorName, vendorCeo, vendorAddr,
              buyerRegNo, buyerName, buyerCeo, buyerAddr,
              supplyAmount: totalSupply, taxAmount: totalTax, totalAmount: grandTotal,
              remark: mainRemark, items: validItems, imageUrl: downloadUrl,
              createdAt: serverTimestamp(), createdBy: currentUserInfo.name, isPaper: true,
              approvalNo: `PAPER-${Date.now()}`
          });
          
          await addDoc(collection(db, 'users', currentUid, 'ACTIVITY_LOGS'), {
            text: `[매입등록] ${currentUserInfo.name}님이 ${vendorName}건 종이 세금계산서를 수기 등록했습니다.`,
            createdAt: serverTimestamp(), type: 'tax_invoice_manual'
          });

          alert("등록되었습니다.");
          fetchManualList(currentUid); 
          
          // 초기화 (내 정보인 Buyer는 유지)
          setItems([{ date: '', itemName: '', spec: '', qty: 0, unitPrice: 0, supplyAmount: 0, taxAmount: 0, remark: '' }, { date: '', itemName: '', spec: '', qty: 0, unitPrice: 0, supplyAmount: 0, taxAmount: 0, remark: '' }, { date: '', itemName: '', spec: '', qty: 0, unitPrice: 0, supplyAmount: 0, taxAmount: 0, remark: '' }, { date: '', itemName: '', spec: '', qty: 0, unitPrice: 0, supplyAmount: 0, taxAmount: 0, remark: '' }]);
          setVendorName(''); setVendorRegNo(''); setVendorCeo(''); setVendorAddr(''); setMainRemark('');
          setImageFile(null); setPreviewUrl(null);

      } catch (e) { console.error(e); alert("오류 발생"); } finally { setLoading(false); }
  };

  return (
    <div className="manual-purchase-page-container">
        <div className="page-header">
            <h2>매입자료 등록 (수기)</h2>
            <p>종이 세금계산서(매입) 내역을 입력하고 사진을 첨부하여 등록합니다.</p>
        </div>

        <div className="content-grid">
            <div className="image-section">
                <div className="image-preview-box" onClick={() => fileInputRef.current?.click()} style={{ backgroundImage: previewUrl ? `url(${previewUrl})` : 'none' }}>
                    {!previewUrl && (<div className="placeholder-text"><span>📸</span><p>사진 첨부</p></div>)}
                </div>
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageChange} style={{display:'none'}} />
                {previewUrl && <button className="btn-remove-img" onClick={() => { setPreviewUrl(null); setImageFile(null); }}>삭제</button>}
            </div>

            <div className="form-section">
                <div className="form-row date-row"><label>작성일자</label><input type="date" value={writeDate} onChange={e => setWriteDate(e.target.value)} /></div>
                <div className="tax-bill-box">
                    <div className="bill-part vendor">
                        <div className="part-header red">공급자 (입력필요)</div>
                        <div className="part-body">
                            <div className="input-group"><label>등록번호</label><input type="text" value={vendorRegNo} onChange={e => handleBizNumChange(e, setVendorRegNo)} placeholder="000-00-00000" maxLength={12} /></div>
                            <div className="input-group"><label>상호</label><input type="text" value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="상대방 상호" /></div>
                            <div className="input-group"><label>성명</label><input type="text" value={vendorCeo} onChange={e => setVendorCeo(e.target.value)} /></div>
                            <div className="input-group full"><label>주소</label><input type="text" value={vendorAddr} onChange={e => setVendorAddr(e.target.value)} /></div>
                        </div>
                    </div>
                    {/* 매입에서는 내가 '공급받는자'이므로 파란색 & 수정 불가(자동입력) */}
                    <div className="bill-part buyer">
                        <div className="part-header blue">공급받는자 (수정불가)</div>
                        <div className="part-body">
                            <div className="input-group"><label>등록번호</label><input type="text" value={buyerRegNo} disabled /></div>
                            <div className="input-group"><label>상호</label><input type="text" value={buyerName} disabled /></div>
                            <div className="input-group"><label>성명</label><input type="text" value={buyerCeo} disabled /></div>
                            <div className="input-group full"><label>주소</label><input type="text" value={buyerAddr} disabled /></div>
                        </div>
                    </div>
                </div>

                <div className="items-section">
                    <table className="items-table-input">
                        <thead><tr><th style={{width:'50px'}}>월/일</th><th>품목</th><th style={{width:'80px'}}>규격</th><th style={{width:'70px'}}>수량</th><th style={{width:'100px'}}>단가</th><th style={{width:'120px'}}>공급가액</th><th style={{width:'100px'}}>세액</th><th style={{width:'80px'}}>비고</th><th style={{width:'40px'}}></th></tr></thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr key={idx}>
                                    <td><input type="text" value={item.date} onChange={e => handleItemChange(idx, 'date', e.target.value)} placeholder="MM-DD" className="center" /></td>
                                    <td><input type="text" value={item.itemName} onChange={e => handleItemChange(idx, 'itemName', e.target.value)} /></td>
                                    <td><input type="text" value={item.spec} onChange={e => handleItemChange(idx, 'spec', e.target.value)} className="center" /></td>
                                    <td><input type="text" value={item.qty>0?item.qty.toLocaleString():''} onChange={e => handleItemChange(idx, 'qty', e.target.value)} className="right" placeholder="0" /></td>
                                    <td><input type="text" value={item.unitPrice>0?item.unitPrice.toLocaleString():''} onChange={e => handleItemChange(idx, 'unitPrice', e.target.value)} className="right" placeholder="0" /></td>
                                    <td><input type="text" value={item.supplyAmount>0?item.supplyAmount.toLocaleString():''} onChange={e => handleItemChange(idx, 'supplyAmount', e.target.value)} className="right bg-read" placeholder="0" /></td>
                                    <td><input type="text" value={item.taxAmount>0?item.taxAmount.toLocaleString():''} onChange={e => handleItemChange(idx, 'taxAmount', e.target.value)} className="right bg-read" placeholder="0" /></td>
                                    <td><input type="text" value={item.remark} onChange={e => handleItemChange(idx, 'remark', e.target.value)} /></td>
                                    <td><button className="btn-del-row" onClick={() => removeItemRow(idx)}>×</button></td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot><tr><td colSpan={9}><button className="btn-add-row" onClick={addItemRow}>+ 품목 추가</button></td></tr></tfoot>
                    </table>
                </div>

                <div className="total-summary-box">
                    <div className="summary-row"><span>합계금액</span><span className="amount-text blue">{grandTotal.toLocaleString()} 원</span></div>
                    <div className="summary-sub">( 공급가액 {totalSupply.toLocaleString()} + 세액 {totalTax.toLocaleString()} )</div>
                    <div className="main-remark-row"><label>비고</label><input type="text" value={mainRemark} onChange={e => setMainRemark(e.target.value)} placeholder="전체 비고" /></div>
                </div>

                <div className="action-buttons">
                    <button className="btn-cancel" onClick={() => window.history.back()}>취소</button>
                    <button className="btn-save-manual" onClick={handleSave} disabled={loading} style={{background: K_BRAND_COLOR}}>
                        {loading ? '저장 중...' : '등록하기'}
                    </button>
                </div>
            </div>
        </div>

        <div className="manual-list-section">
            <h3>📋 기존 수기 등록 내역 (매입)</h3>
            <table className="hometax-table">
                <thead>
                    <tr><th>작성일자</th><th>공급자(상호)</th><th>공급가액</th><th>세액</th><th>합계금액</th><th>관리</th></tr>
                </thead>
                <tbody>
                    {manualList.length === 0 ? <tr><td colSpan={6} style={{textAlign:'center', padding:'20px'}}>등록된 내역이 없습니다. (인덱스 확인 필요)</td></tr> :
                    manualList.map(item => (
                        <tr key={item.id}>
                            <td style={{textAlign:'center'}}>{item.writeDate}</td>
                            <td className="vendor-name-cell" onClick={() => setEditTarget(item)} style={{textAlign:'center'}}>{item.vendorName}</td>
                            <td style={{textAlign:'right'}}>{item.supplyAmount.toLocaleString()}</td>
                            <td style={{textAlign:'right'}}>{item.taxAmount.toLocaleString()}</td>
                            <td style={{textAlign:'right', fontWeight:'bold'}}>{item.totalAmount.toLocaleString()}</td>
                            <td style={{textAlign:'center'}}>
                                <button onClick={() => setEditTarget(item)} className="btn-edit-mini">수정/삭제</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        {/* 수정 모달 */}
        {editTarget && (
            <ManualEditModal 
                data={editTarget} 
                currentUserUid={currentUid || ''}
                userName={currentUserInfo.name}
                onClose={() => setEditTarget(null)} 
                onRefresh={() => currentUid && fetchManualList(currentUid)} 
            />
        )}
    </div>
  );
};

// [Sub Component] ManualEditModal
const ManualEditModal: React.FC<{ 
    data: ManualInvoiceData, currentUserUid: string, userName: string, onClose: () => void, onRefresh: () => void 
}> = ({ data, currentUserUid, userName, onClose, onRefresh }) => {
    
    const [writeDate, setWriteDate] = useState(data.writeDate);
    // 매입이므로 '공급자(Vendor)'를 수정 가능하게 함
    const [vendorRegNo, setVendorRegNo] = useState(data.vendorRegNo);
    const [vendorName, setVendorName] = useState(data.vendorName);
    const [vendorCeo, setVendorCeo] = useState(data.vendorCeo);
    const [vendorAddr, setVendorAddr] = useState(data.vendorAddr);
    const [mainRemark, setMainRemark] = useState(data.remark);
    
    const [items, setItems] = useState<InvoiceItem[]>(data.items && data.items.length > 0 ? data.items : [{ date: '', itemName: '', spec: '', qty: 0, unitPrice: 0, supplyAmount: 0, taxAmount: 0, remark: '' }]);
    
    const [previewUrl, setPreviewUrl] = useState(data.imageUrl || null);
    const [newImageFile, setNewImageFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isLoading, setIsLoading] = useState(false);

    const totalSupply = items.reduce((sum, item) => sum + item.supplyAmount, 0);
    const totalTax = items.reduce((sum, item) => sum + item.taxAmount, 0);
    const grandTotal = totalSupply + totalTax;

    const formatBizNum = (num: string) => {
        const nums = num.replace(/[^0-9]/g, "").slice(0, 10);
        if (nums.length <= 3) return nums;
        if (nums.length <= 5) return `${nums.slice(0, 3)}-${nums.slice(3)}`;
        return `${nums.slice(0, 3)}-${nums.slice(3, 5)}-${nums.slice(5)}`;
    };
    const handleBizNumChange = (e: React.ChangeEvent<HTMLInputElement>) => setVendorRegNo(formatBizNum(e.target.value));
    const parseNumber = (val: string) => Number(val.replace(/[^0-9]/g, "")) || 0;

    const handleItemChange = (index: number, field: keyof InvoiceItem, value: string) => {
        const newItems = [...items];
        const item = { ...newItems[index] };
        if (['qty', 'unitPrice', 'supplyAmount', 'taxAmount'].includes(field)) {
            const numVal = parseNumber(value);
            (item as any)[field] = numVal;
            if (field === 'qty' || field === 'unitPrice') {
                const qty = field === 'qty' ? numVal : item.qty;
                const price = field === 'unitPrice' ? numVal : item.unitPrice;
                if (qty > 0 && price > 0) { item.supplyAmount = qty * price; item.taxAmount = Math.floor(item.supplyAmount * 0.1); }
            } else if (field === 'supplyAmount') item.taxAmount = Math.floor(numVal * 0.1);
        } else (item as any)[field] = value;
        newItems[index] = item;
        setItems(newItems);
    };
    const addItemRow = () => setItems([...items, { date: '', itemName: '', spec: '', qty: 0, unitPrice: 0, supplyAmount: 0, taxAmount: 0, remark: '' }]);
    const removeItemRow = (index: number) => { if (items.length > 1) setItems(items.filter((_, i) => i !== index)); };

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true });
            setNewImageFile(compressed);
            const reader = new FileReader();
            reader.readAsDataURL(compressed);
            reader.onloadend = () => setPreviewUrl(reader.result as string);
        } catch (error) { alert("이미지 오류"); }
    };

    const handleUpdate = async () => {
        if (!confirm("수정하시겠습니까?")) return;
        setIsLoading(true);
        try {
            let imageUrl = data.imageUrl;
            if (newImageFile) {
                const storageRef = ref(storage, `users/${currentUserUid}/paper_invoices/${Date.now()}_${newImageFile.name}`);
                await uploadBytes(storageRef, newImageFile);
                imageUrl = await getDownloadURL(storageRef);
            }

            // 변경 내역 로그
            const changes: string[] = [];
            if (data.writeDate !== writeDate) changes.push(`작성일자(${data.writeDate}→${writeDate})`);
            if (data.vendorName !== vendorName) changes.push(`공급자상호(${data.vendorName}→${vendorName})`);
            if (data.totalAmount !== grandTotal) changes.push(`합계금액(${data.totalAmount.toLocaleString()}→${grandTotal.toLocaleString()})`);
            if (newImageFile) changes.push(`이미지 교체`);
            const changeLog = changes.length > 0 ? ` [${changes.join(', ')}]` : '';

            await updateDoc(doc(db, 'users', currentUserUid, 'TAX_PURCHASE', data.id), {
                writeDate, vendorRegNo, vendorName, vendorCeo, vendorAddr,
                supplyAmount: totalSupply, taxAmount: totalTax, totalAmount: grandTotal,
                remark: mainRemark, items, imageUrl
            });

            await addDoc(collection(db, 'users', currentUserUid, 'ACTIVITY_LOGS'), {
                text: `[매입수정] ${userName}님이 ${data.vendorName}건 내용을 수정했습니다.${changeLog}`,
                createdAt: serverTimestamp(), type: 'tax_invoice_manual'
            });

            alert("수정되었습니다.");
            onRefresh();
            onClose();
        } catch(e) { console.error(e); alert("오류 발생"); } finally { setIsLoading(false); }
    };

    const handleDelete = async () => {
        if (!confirm("정말 삭제하시겠습니까?")) return;
        setIsLoading(true);
        try {
            await deleteDoc(doc(db, 'users', currentUserUid, 'TAX_PURCHASE', data.id));
            await addDoc(collection(db, 'users', currentUserUid, 'ACTIVITY_LOGS'), {
                text: `[매입삭제] ${userName}님이 ${data.vendorName}건 수기 세금계산서를 삭제했습니다.`,
                createdAt: serverTimestamp(), type: 'tax_invoice_update'
            });
            alert("삭제되었습니다.");
            onRefresh();
            onClose();
        } catch(e) { console.error(e); alert("삭제 오류"); } finally { setIsLoading(false); }
    };

    return (
        <div className="invoice-modal-backdrop" onClick={onClose} style={{zIndex: 3000}}>
            <div className="invoice-paper" onClick={e => e.stopPropagation()} style={{width:'95vw', maxWidth:'1200px', height:'90vh', display:'flex', flexDirection:'column'}}>
                <div className="page-header"><h2>수기 매입자료 수정/삭제</h2><p>등록된 내용을 수정하거나 삭제할 수 있습니다.</p></div>
                <div className="content-grid" style={{flex:1, overflowY:'auto'}}>
                    <div className="image-section">
                        <div className="image-preview-box" onClick={() => fileInputRef.current?.click()} style={{ backgroundImage: previewUrl ? `url(${previewUrl})` : 'none' }}>
                            {!previewUrl && (<div className="placeholder-text"><p>사진 없음</p></div>)}
                        </div>
                        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageChange} style={{display:'none'}} />
                        {previewUrl && <button className="btn-remove-img" onClick={() => { setPreviewUrl(null); setNewImageFile(null); }}>사진 변경/삭제</button>}
                    </div>
                    <div className="form-section">
                        <div className="form-row date-row"><label>작성일자</label><input type="date" value={writeDate} onChange={e => setWriteDate(e.target.value)} /></div>
                        <div className="tax-bill-box">
                            <div className="bill-part vendor"><div className="part-header red">공급자 (입력필요)</div><div className="part-body">
                                <div className="input-group"><label>등록번호</label><input type="text" value={vendorRegNo} onChange={e => setVendorRegNo(e.target.value)} maxLength={12} /></div>
                                <div className="input-group"><label>상호</label><input type="text" value={vendorName} onChange={e => setVendorName(e.target.value)} /></div>
                                <div className="input-group"><label>대표자</label><input type="text" value={vendorCeo} onChange={e => setVendorCeo(e.target.value)} /></div>
                                <div className="input-group full"><label>주소</label><input type="text" value={vendorAddr} onChange={e => setVendorAddr(e.target.value)} /></div>
                            </div></div>
                            <div className="bill-part buyer"><div className="part-header blue">공급받는자 (수정불가)</div><div className="part-body"><div className="input-group"><label>상호</label><input type="text" value={data.buyerName} disabled /></div></div></div>
                        </div>
                        <div className="items-section">
                           {/* (품목 테이블 로직은 위와 동일하여 간략화하지만, 실제론 동일하게 구현됨) */}
                            <table className="items-table-input">
                                <thead><tr><th>월/일</th><th>품목</th><th>규격</th><th>수량</th><th>단가</th><th>공급가액</th><th>세액</th><th>비고</th><th></th></tr></thead>
                                <tbody>
                                    {items.map((item, idx) => (
                                        <tr key={idx}>
                                            <td><input type="text" value={item.date} onChange={e => handleItemChange(idx, 'date', e.target.value)} className="center" /></td>
                                            <td><input type="text" value={item.itemName} onChange={e => handleItemChange(idx, 'itemName', e.target.value)} /></td>
                                            <td><input type="text" value={item.spec} onChange={e => handleItemChange(idx, 'spec', e.target.value)} className="center" /></td>
                                            <td><input type="text" value={item.qty>0?item.qty.toLocaleString():''} onChange={e => handleItemChange(idx, 'qty', e.target.value)} className="right" /></td>
                                            <td><input type="text" value={item.unitPrice>0?item.unitPrice.toLocaleString():''} onChange={e => handleItemChange(idx, 'unitPrice', e.target.value)} className="right" /></td>
                                            <td><input type="text" value={item.supplyAmount>0?item.supplyAmount.toLocaleString():''} onChange={e => handleItemChange(idx, 'supplyAmount', e.target.value)} className="right bg-read" /></td>
                                            <td><input type="text" value={item.taxAmount>0?item.taxAmount.toLocaleString():''} onChange={e => handleItemChange(idx, 'taxAmount', e.target.value)} className="right bg-read" /></td>
                                            <td><input type="text" value={item.remark} onChange={e => handleItemChange(idx, 'remark', e.target.value)} /></td>
                                            <td><button className="btn-del-row" onClick={() => removeItemRow(idx)}>×</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot><tr><td colSpan={9}><button className="btn-add-row" onClick={addItemRow}>+ 품목 추가</button></td></tr></tfoot>
                            </table>
                        </div>
                        <div className="total-summary-box"><div className="summary-row"><span>합계금액</span><span className="amount-text blue">{grandTotal.toLocaleString()} 원</span></div></div>
                    </div>
                </div>
                <div className="action-buttons" style={{borderTop:'1px solid #eee', paddingTop:'15px'}}>
                    <button className="btn-cancel" onClick={onClose}>취소</button>
                    <button className="btn-delete" onClick={handleDelete} disabled={isLoading} style={{background:'#d63031', color:'#fff', border:'none', padding:'10px 20px', borderRadius:'5px', fontWeight:'bold', marginRight:'auto'}}>삭제하기</button>
                    <button className="btn-save-manual" onClick={handleUpdate} disabled={isLoading} style={{background: K_BRAND_COLOR}}>수정 저장</button>
                </div>
            </div>
        </div>
    );
};

export default AccountingManualPurchasePage;