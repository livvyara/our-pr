import React, { useState, useEffect, useMemo } from 'react';
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, query, orderBy, where } from 'firebase/firestore';
import { auth } from '../../firebase-config';
import './OrderRequestPage.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  siteName: string;
  partnerUid: string;
  userName: string;
}

interface CategoryOption { name: string; subCategories: string[]; }

const OrderRequestModal: React.FC<Props> = ({ isOpen, onClose, siteId, siteName, partnerUid, userName }) => {
  const db = getFirestore();
  
  const [requestType, setRequestType] = useState<'tax_invoice' | 'online'>('tax_invoice');
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [category1, setCategory1] = useState('');
  const [category2, setCategory2] = useState('');
  
  // Form states
  const [vendorName, setVendorName] = useState('');
  const [itemDetails, setItemDetails] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountOwner, setAccountOwner] = useState('');
  const [qty, setQty] = useState<number>(1);
  const [link, setLink] = useState('');
  const [memo, setMemo] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // [NEW] 과거 내역 리스트 상태
  const [historyList, setHistoryList] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && partnerUid) {
        fetchCategories();
        fetchHistory(); // 내역 불러오기
    }
  }, [isOpen, partnerUid, siteId]);

  const fetchCategories = async () => {
      try {
          const q = query(collection(db, 'users', partnerUid, 'EXPENSE_CATEGORIES_SITE'), orderBy('order', 'asc'));
          const snap = await getDocs(q);
          const list: CategoryOption[] = snap.docs.map(d => ({ name: d.data().name, subCategories: d.data().subCategories || [] }));
          setCategoryOptions(list);
      } catch (e) {}
  };

  // [NEW] 해당 현장의 요청 내역 불러오기
  const fetchHistory = async () => {
      try {
          const q = query(
              collection(db, 'users', partnerUid, 'ORDER_REQUESTS'),
              where('siteId', '==', siteId),
              orderBy('createdAt', 'desc')
          );
          const snap = await getDocs(q);
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setHistoryList(list);
      } catch (e) { console.error("내역 로딩 실패", e); }
  };

  const currentSubOptions = useMemo(() => {
      const target = categoryOptions.find(c => c.name === category1);
      return target ? target.subCategories : [];
  }, [categoryOptions, category1]);

  const handleSubmit = async () => {
    if (!category1) return alert("공종(1차 분류)을 선택해주세요.");
    if (requestType === 'tax_invoice') {
        if (!vendorName || amount <= 0 || !bankName || !accountNumber || !accountOwner) return alert("필수 정보를 입력해주세요.");
    } else {
        if (!link && !memo) return alert("링크 또는 메모를 입력해주세요.");
    }

    setIsSubmitting(true);
    try {
        const commonData = {
            siteId, siteName,
            requesterUid: auth.currentUser?.uid,
            requesterName: userName,
            type: requestType,
            status: 'pending', 
            category1, category2,
            createdAt: serverTimestamp(),
            isPaid: false
        };
        const specificData = requestType === 'tax_invoice' 
            ? { vendorName, itemDetails, amount, bankName, accountNumber, accountOwner }
            : { quantity: qty, link, memo };

        await addDoc(collection(db, 'users', partnerUid, 'ORDER_REQUESTS'), { ...commonData, ...specificData });
        await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), {
            text: `[발주요청] ${userName}님이 ${siteName} 현장에 발주를 요청했습니다.`,
            createdAt: serverTimestamp(), type: 'order_request'
        });

        alert("요청되었습니다.");
        fetchHistory(); // 리스트 갱신
        // 폼 초기화 (편의상 생략하거나 필요시 추가)
    } catch (e) { alert("오류 발생"); } finally { setIsSubmitting(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="ord-modal-overlay">
      <div className="ord-modal-content" style={{maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column'}}>
        <div className="ord-header">
          <h3>발주 요청 ({siteName})</h3>
          <button className="ord-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="ord-body" style={{overflowY:'auto', flex:1}}>
            {/* 입력 폼 영역 */}
            <div className="ord-type-tabs">
                <button className={`ord-tab ${requestType === 'tax_invoice' ? 'active' : ''}`} onClick={() => setRequestType('tax_invoice')}>📄 세금계산서 결제 요청</button>
                <button className={`ord-tab ${requestType === 'online' ? 'active' : ''}`} onClick={() => setRequestType('online')}>🛒 인터넷 구매 요청</button>
            </div>

            <div className="ord-row">
                <div className="ord-group"><label>공종명 (1차)</label><select value={category1} onChange={e => { setCategory1(e.target.value); setCategory2(''); }}><option value="">선택하세요</option>{categoryOptions.map((opt, i) => <option key={i} value={opt.name}>{opt.name}</option>)}</select></div>
                <div className="ord-group"><label>상세 (2차)</label><select value={category2} onChange={e => setCategory2(e.target.value)} disabled={!category1}><option value="">선택하세요</option>{currentSubOptions.map((sub, i) => <option key={i} value={sub}>{sub}</option>)}</select></div>
            </div>

            {requestType === 'tax_invoice' ? (
                <>
                    <div className="ord-row">
                        <div className="ord-group"><label>업체명 <span className="req">*</span></label><input type="text" value={vendorName} onChange={e => setVendorName(e.target.value)} /></div>
                        <div className="ord-group"><label>금액 (VAT포함) <span className="req">*</span></label><input type="number" value={amount || ''} onChange={e => setAmount(Number(e.target.value))} /></div>
                    </div>
                    <div className="ord-group"><label>발주 내역 (품목)</label><input type="text" value={itemDetails} onChange={e => setItemDetails(e.target.value)} /></div>
                    <div className="ord-bg-box">
                        <label style={{fontWeight:'bold', display:'block', marginBottom:'5px'}}>결제 계좌</label>
                        <div className="ord-row">
                            <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="은행명" style={{flex:1}} />
                            <input type="text" value={accountOwner} onChange={e => setAccountOwner(e.target.value)} placeholder="예금주" style={{flex:1}} />
                        </div>
                        <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="계좌번호" style={{width:'100%', marginTop:'5px'}} />
                    </div>
                </>
            ) : (
                <>
                    <div className="ord-row">
                        <div className="ord-group" style={{flex:1}}><label>수량</label><input type="number" value={qty} onChange={e => setQty(Number(e.target.value))} /></div>
                        <div className="ord-group" style={{flex:3}}><label>메모</label><input type="text" value={memo} onChange={e => setMemo(e.target.value)} /></div>
                    </div>
                    <div className="ord-group"><label>링크</label><input type="url" value={link} onChange={e => setLink(e.target.value)} /></div>
                </>
            )}
            
            <div style={{textAlign:'right', marginTop:'10px'}}>
                <button className="ord-btn-save" onClick={handleSubmit} disabled={isSubmitting} style={{width:'100%'}}>{isSubmitting?'처리중...':'요청 등록하기'}</button>
            </div>

            <hr style={{margin:'20px 0', border:'0', borderTop:'1px solid #eee'}} />
            
            {/* [NEW] 과거 요청 내역 리스트 */}
            <h4 style={{fontSize:'14px', color:'#333', marginBottom:'10px'}}>📋 요청 내역 ({historyList.length})</h4>
            <div className="ord-history-list">
                {historyList.length === 0 ? <p className="no-data">요청 내역이 없습니다.</p> : 
                 historyList.map((item) => (
                     <div key={item.id} className="ord-history-item">
                         <div className="hist-header">
                             <span className={`status-badge ${item.status}`}>
                                 {item.status==='pending'?'대기':item.status==='approved'?'승인':'부결'}
                             </span>
                             <span className="hist-date">{item.createdAt?.toDate().toLocaleDateString()}</span>
                             <span className="hist-user">{item.requesterName}</span>
                         </div>
                         <div className="hist-content">
                             {item.type==='tax_invoice' ? 
                                 `${item.vendorName} / ${Number(item.amount).toLocaleString()}원` : 
                                 `${item.memo || '메모없음'} (${item.quantity}개)`}
                         </div>
                         {/* [NEW] 부결 사유 표시 */}
                         {item.status === 'rejected' && item.rejectReason && (
                             <div className="hist-reject-reason">
                                 🚫 부결 사유: {item.rejectReason}
                             </div>
                         )}
                     </div>
                 ))
                }
            </div>
        </div>
      </div>
    </div>
  );
};

export default OrderRequestModal;