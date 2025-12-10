import React, { useState, useEffect, useMemo } from 'react';
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, query, orderBy, where } from 'firebase/firestore';
import { auth } from '../../firebase-config';
import './a_partnerprogrammodal.css'; // [공용 디자인 시스템]

// --- [Premium SVG Icons] ---
const Icons = {
  Close: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  Document: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>,
  Cart: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>,
  Check: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>,
  List: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  CreditCard: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect width="20" height="14" x="2" y="5" rx="2" ry="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
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
  const [historyList, setHistoryList] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && partnerUid) {
        fetchCategories();
        fetchHistory();
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
            // [중요] 최초 등록 시 상태는 'pending_partner' (대표 승인 대기)
            status: 'pending_partner', 
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
        fetchHistory();
        // 폼 초기화
        setVendorName(''); setItemDetails(''); setAmount(0); setQty(1); setLink(''); setMemo('');
    } catch (e) { alert("오류 발생"); } finally { setIsSubmitting(false); }
  };

  // [핵심 수정] 상세한 상태 배지 반환 함수
  const getStatusBadge = (status: string) => {
      switch(status) {
          case 'pending_partner':
          case 'pending': 
              return <span className="ppm-status pending">대표 승인 대기</span>;
          case 'pending_payment':
              return <span className="ppm-status approved" style={{backgroundColor:'#e0f2fe', color:'#0284c7'}}>대표 1차 승인</span>;
          case 'approved':
              return <span className="ppm-status approved">최종 완료</span>;
          case 'rejected':
              return <span className="ppm-status rejected">부결(반려)</span>;
          default:
              return <span className="ppm-status pending">대기 중</span>;
      }
  };

  if (!isOpen) return null;

  return (
    <div className="ppm-overlay">
      <div className="ppm-container">
        
        {/* Header */}
        <div className="ppm-header">
          <div className="ppm-title">
            <h3>발주/결제 요청</h3>
            <span className="ppm-badge">{siteName}</span>
          </div>
          <button className="ppm-close-btn" onClick={onClose}><Icons.Close /></button>
        </div>

        <div className="ppm-body">
            
            {/* Tabs */}
            <div className="ppm-tabs">
                <button 
                    className={`ppm-tab-item ${requestType === 'tax_invoice' ? 'active' : ''}`} 
                    onClick={() => setRequestType('tax_invoice')}
                >
                    <Icons.Document /> 세금계산서 결제
                </button>
                <button 
                    className={`ppm-tab-item ${requestType === 'online' ? 'active' : ''}`} 
                    onClick={() => setRequestType('online')}
                >
                    <Icons.Cart /> 인터넷 구매
                </button>
            </div>

            {/* Category Selection */}
            <div className="ppm-grid-row">
                <div className="ppm-col">
                    <label className="ppm-label">1차 분류 (공종) <span className="ppm-req">*</span></label>
                    <div className="ppm-select-wrapper">
                        <select value={category1} onChange={e => { setCategory1(e.target.value); setCategory2(''); }} className="ppm-select">
                            <option value="">선택하세요</option>
                            {categoryOptions.map((opt, i) => <option key={i} value={opt.name}>{opt.name}</option>)}
                        </select>
                    </div>
                </div>
                <div className="ppm-col">
                    <label className="ppm-label">2차 분류 (상세)</label>
                    <div className="ppm-select-wrapper">
                        <select value={category2} onChange={e => setCategory2(e.target.value)} disabled={!category1} className="ppm-select">
                            <option value="">선택하세요</option>
                            {currentSubOptions.map((sub, i) => <option key={i} value={sub}>{sub}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {requestType === 'tax_invoice' ? (
                <>
                    <div className="ppm-grid-row">
                        <div className="ppm-col">
                            <label className="ppm-label">업체명 <span className="ppm-req">*</span></label>
                            <input type="text" value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="업체명 입력" className="ppm-input" />
                        </div>
                        <div className="ppm-col">
                            <label className="ppm-label">금액 (VAT포함) <span className="ppm-req">*</span></label>
                            <input type="number" value={amount || ''} onChange={e => setAmount(Number(e.target.value))} placeholder="0" className="ppm-input text-right" />
                        </div>
                    </div>
                    
                    <div className="ppm-col">
                        <label className="ppm-label">발주 내역 (품목)</label>
                        <input type="text" value={itemDetails} onChange={e => setItemDetails(e.target.value)} placeholder="품목 상세 입력" className="ppm-input" />
                    </div>
                    
                    {/* Bank Info Box */}
                    <div className="ppm-box">
                        <div className="ppm-box-header">
                            <Icons.CreditCard /> 결제 계좌 정보
                        </div>
                        <div className="ppm-grid-row">
                            <div className="ppm-col">
                                <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} placeholder="은행명" className="ppm-input bg-white" />
                            </div>
                            <div className="ppm-col">
                                <input type="text" value={accountOwner} onChange={e => setAccountOwner(e.target.value)} placeholder="예금주" className="ppm-input bg-white" />
                            </div>
                        </div>
                        <div className="ppm-col ppm-mt-12">
                             <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="계좌번호 (-없이 입력)" className="ppm-input bg-white" />
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <div className="ppm-grid-row">
                        <div className="ppm-col">
                            <label className="ppm-label">수량</label>
                            <input type="number" value={qty} onChange={e => setQty(Number(e.target.value))} className="ppm-input" />
                        </div>
                        <div className="ppm-col ppm-col-3">
                            <label className="ppm-label">메모</label>
                            <input type="text" value={memo} onChange={e => setMemo(e.target.value)} placeholder="색상, 사이즈 등 옵션" className="ppm-input" />
                        </div>
                    </div>
                    <div className="ppm-col">
                        <label className="ppm-label">구매 링크 (URL)</label>
                        <input type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." className="ppm-input" />
                    </div>
                </>
            )}
            
            <div className="ppm-divider" />
            
            {/* History List */}
            <div className="ppm-col">
                <h4 className="ppm-list-title"><Icons.List /> 최근 요청 내역 ({historyList.length})</h4>
                <div className="ppm-list">
                    {historyList.length === 0 ? <p className="ppm-no-data">요청 내역이 없습니다.</p> : 
                     historyList.map((item) => (
                         <div key={item.id} className="ppm-card">
                             <div className="ppm-card-header">
                                 {/* 상세한 상태 배지 표시 */}
                                 {getStatusBadge(item.status)}
                                 <span className="ppm-card-date">{item.createdAt?.toDate().toLocaleDateString()}</span>
                             </div>
                             <div className="ppm-card-main">
                                 {item.type==='tax_invoice' ? item.vendorName : (item.memo || '인터넷 구매')}
                             </div>
                             <div className="ppm-card-sub">
                                 {item.type==='tax_invoice' 
                                    ? `${Number(item.amount).toLocaleString()}원` 
                                    : `${item.quantity}개 / 링크 참조`}
                             </div>
                             {item.status === 'rejected' && item.rejectReason && (
                                 <div className="ppm-text-danger" style={{fontSize:'12px', marginTop:'8px', color:'#ef4444'}}>🚫 사유: {item.rejectReason}</div>
                             )}
                         </div>
                     ))
                    }
                </div>
            </div>
        </div>

        <div className="ppm-footer">
            <button className="ppm-btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? '처리중...' : <><Icons.Check /> 요청 등록하기</>}
            </button>
        </div>

      </div>
    </div>
  );
};

export default OrderRequestModal;