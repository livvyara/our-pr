import React, { useState, useEffect, useMemo } from 'react';
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { auth } from '../../firebase-config';
import { sendSystemMessage } from '../../utils/chatService';
import './ChangeOrderModal.css';

// --- [Premium Icon System] ---
// 선의 굵기와 라운드 값을 조정하여 고급스러운 느낌을 줍니다.
const Icons = {
  Close: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  List: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  Plus: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Trash: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>,
  Check: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  ArrowLeft: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  CreditCard: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  Refresh: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>,
  Document: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
};

interface ChangeOrderItem {
  name: string; unit: string; quantity: string; unitPrice: string; 
  supplyPrice: number; tax: number; totalPrice: number; note: string;
}

interface ChangeOrderDoc {
  id: string; title: string; items: ChangeOrderItem[]; totalAmount: number;
  status: 'pending_partner' | 'pending_customer' | 'approved' | 'paid'; 
  createdAt: any; authorName: string; partnerUid: string;
}

interface Props {
  siteId: string; siteName: string; partnerUid: string; userRole: string; onClose: () => void;
}

const ChangeOrderModal: React.FC<Props> = ({ siteId, siteName, partnerUid, userRole, onClose }) => {
  const db = getFirestore();
  const [activeTab, setActiveTab] = useState<'list' | 'form' | 'detail'>('list');
  
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<ChangeOrderItem[]>([
      { name: '', unit: '', quantity: '', unitPrice: '', supplyPrice: 0, tax: 0, totalPrice: 0, note: '' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [orders, setOrders] = useState<ChangeOrderDoc[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ChangeOrderDoc | null>(null);

  useEffect(() => {
    window.history.pushState({ modal: 'ChangeOrderModal' }, '', window.location.href);
    const handlePopState = () => onClose();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onClose]);

  const handleManualClose = () => window.history.back();

  const listSummaries = useMemo(() => {
      const initial = { supply: 0, tax: 0, total: 0 };
      const createInit = () => ({ ...initial });

      return orders.reduce((acc, order) => {
          const orderSupply = order.items.reduce((s, i) => s + i.supplyPrice, 0);
          const orderTax = order.items.reduce((s, i) => s + i.tax, 0);
          const orderTotal = order.totalAmount;

          acc.total.supply += orderSupply;
          acc.total.tax += orderTax;
          acc.total.total += orderTotal;

          const target = order.status === 'paid' ? 'paid' : 'unpaid';
          acc[target].supply += orderSupply;
          acc[target].tax += orderTax;
          acc[target].total += orderTotal;

          return acc;
      }, { total: createInit(), paid: createInit(), unpaid: createInit() });
  }, [orders]);

  const currentFormSummary = useMemo(() => {
      const supply = items.reduce((sum, i) => sum + i.supplyPrice, 0);
      const tax = items.reduce((sum, i) => sum + i.tax, 0);
      const total = items.reduce((sum, i) => sum + i.totalPrice, 0);
      return { supply, tax, total };
  }, [items]);

  useEffect(() => {
      if (activeTab === 'list') fetchOrders();
  }, [activeTab]);

  const fetchOrders = async () => {
      try {
          const q = query(collection(db, 'users', partnerUid, 'sites', siteId, 'changeOrders'), orderBy('createdAt', 'desc'));
          const snap = await getDocs(q);
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChangeOrderDoc));
          setOrders(list);
      } catch (e) { console.error(e); }
  };

  const calculateItem = (item: ChangeOrderItem) => {
      const qty = parseInt(item.quantity.replace(/,/g, '') || '0', 10);
      const price = parseInt(item.unitPrice.replace(/,/g, '') || '0', 10);
      const supply = qty * price;
      const tax = Math.floor(supply * 0.1); 
      return { ...item, supplyPrice: supply, tax, totalPrice: supply + tax };
  };

  const handleItemChange = (index: number, field: keyof ChangeOrderItem, value: string) => {
      const newItems = [...items];
      if (field === 'quantity' || field === 'unitPrice') {
          const numericValue = value.replace(/[^\d-]/g, '');
          if (numericValue === '' || numericValue === '-') {
              newItems[index] = { ...newItems[index], [field]: numericValue };
          } else {
              const num = parseInt(numericValue, 10);
              if (!isNaN(num)) {
                  newItems[index] = { ...newItems[index], [field]: num.toLocaleString('ko-KR') };
              }
          }
          newItems[index] = calculateItem(newItems[index]);
      } else {
          newItems[index] = { ...newItems[index], [field]: value };
      }
      setItems(newItems);
  };

  const addItemRow = () => {
      setItems([...items, { name: '', unit: '', quantity: '', unitPrice: '', supplyPrice: 0, tax: 0, totalPrice: 0, note: '' }]);
  };

  const removeItemRow = (index: number) => {
      if (items.length <= 1) return;
      setItems(items.filter((_, i) => i !== index));
  };

  const getTotalAmount = () => items.reduce((sum, item) => sum + item.totalPrice, 0);

  const handleSubmit = async () => {
      if (!title.trim()) return alert("제목을 입력해주세요.");
      const validItems = items.filter(i => i.name.trim() !== '');
      if (validItems.length === 0) return alert("최소 1개 이상의 품목을 입력해주세요.");

      setIsSubmitting(true);
      try {
          let authorName = '직원';
          if (auth.currentUser) {
              const uSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
              if(uSnap.exists()) authorName = uSnap.data().name || uSnap.data().nickname || '직원';
          }

          const newDoc: any = {
              title,
              items: validItems, 
              totalAmount: getTotalAmount(),
              status: 'pending_partner',
              createdAt: serverTimestamp(),
              authorName,
              partnerUid
          };

          await addDoc(collection(db, 'users', partnerUid, 'sites', siteId, 'changeOrders'), newDoc);
          await sendSystemMessage(siteId, "추가/변경 견적 협의가 등록되었습니다. \n 파트너(대표)가 승인하면 고객님께 전달 됩니다.");

          alert("등록되었습니다.");
          setActiveTab('list');
          setTitle('');
          setItems([{ name: '', unit: '', quantity: '', unitPrice: '', supplyPrice: 0, tax: 0, totalPrice: 0, note: '' }]);

      } catch (e) { console.error(e); alert("오류 발생"); }
      finally { setIsSubmitting(false); }
  };

  const handleApprove = async (order: ChangeOrderDoc) => {
      if (!confirm("승인 하시겠습니까?")) return;
      try {
          const ref = doc(db, 'users', partnerUid, 'sites', siteId, 'changeOrders', order.id);
          let nextStatus = '';
          let message = '';

          if (order.status === 'pending_partner') {
              if (userRole !== 'partner') return alert("대표자만 승인할 수 있습니다.");
              nextStatus = 'pending_customer';
              message = "추가/변경 견적 협의건이 고객님께 전달 됐습니다.";
          } else if (order.status === 'pending_customer') {
              nextStatus = 'approved';
              message = "추가/변경 견적 협의건을 고객님이 승인하셨습니다.";
          }

          if (nextStatus) {
            await updateDoc(ref, { status: nextStatus });
            if (message) await sendSystemMessage(siteId, message);
            alert("승인되었습니다.");
            if (activeTab === 'detail') setSelectedOrder({ ...order, status: nextStatus } as any);
            fetchOrders();
          }
      } catch (e) { console.error(e); alert("오류 발생"); }
  };

  const handlePaymentToggle = async (order: ChangeOrderDoc, targetStatus: 'paid' | 'approved') => {
      const actionName = targetStatus === 'paid' ? "결제 완료" : "결제 완료 취소";
      if (!confirm(`${actionName} 처리하시겠습니까?`)) return;

      try {
          const ref = doc(db, 'users', partnerUid, 'sites', siteId, 'changeOrders', order.id);
          await updateDoc(ref, { status: targetStatus });
          alert(`${actionName} 처리되었습니다.`);
          
          if (activeTab === 'detail') setSelectedOrder({ ...order, status: targetStatus });
          fetchOrders();
      } catch(e) {
          console.error(e); alert("처리 중 오류가 발생했습니다.");
      }
  };

  const getStatusBadge = (status: string) => {
      switch(status) {
          case 'pending_partner': return <span className="ppm-badge pending">대표승인 대기</span>;
          case 'pending_customer': return <span className="ppm-badge waiting">고객승인 대기</span>;
          case 'approved': return <span className="ppm-badge approved">최종승인 완료</span>;
          case 'paid': return <span className="ppm-badge paid">결제 완료</span>;
          default: return <span>-</span>;
      }
  };

  return (
    <div className="ppm-overlay">
      <div className="ppm-container">
        {/* Header */}
        <div className="ppm-header">
          <div className="ppm-header-left">
            {activeTab !== 'list' && (
                <button className="ppm-icon-btn" onClick={() => setActiveTab('list')} aria-label="뒤로">
                    <Icons.ArrowLeft />
                </button>
            )}
            <div className="ppm-header-text">
                <h3>변경 견적서</h3>
                <span className="ppm-subtitle">{siteName}</span>
            </div>
          </div>
          <button className="ppm-icon-btn" onClick={handleManualClose} aria-label="닫기">
              <Icons.Close />
          </button>
        </div>

        {/* Content Body */}
        <div className="ppm-body">
            {/* --- LIST TAB --- */}
            {activeTab === 'list' && (
    <div className="ppm-view-list fade-in">
        {/* [수정됨] Dashboard Summary : 심플 카드 + 상세 텍스트 추가 */}
        <div className="ppm-dashboard">
            {/* 1. 총 합계 (가장 강조) */}
            <div className="dashboard-main-row">
                <span className="label">총 견적 합계</span>
                <div className="value-group">
                    <span className="value total">{listSummaries.total.total.toLocaleString()}원</span>
                    <span className="sub-text">
                        (공급 {listSummaries.total.supply.toLocaleString()} / 세액 {listSummaries.total.tax.toLocaleString()})
                    </span>
                </div>
            </div>

            <div className="dashboard-divider"></div>

            {/* 2. 결제 완료 & 미결제 (좌우 배치) */}
            <div className="dashboard-sub-row">
                {/* 결제 완료 */}
                <div className="dashboard-item">
                    <div className="item-header">
                        <span className="dot paid"></span>
                        <span className="label">결제 완료</span>
                    </div>
                    <span className="value paid">{listSummaries.paid.total.toLocaleString()}원</span>
                    <span className="sub-text">
                        공급 {listSummaries.paid.supply.toLocaleString()}
                    </span>
                    <span className="sub-text">
                        세액 {listSummaries.paid.tax.toLocaleString()}
                    </span>
                </div>

                {/* 미결제 */}
                <div className="dashboard-item">
                    <div className="item-header">
                        <span className="dot unpaid"></span>
                        <span className="label">미결제</span>
                    </div>
                    <span className="value unpaid">{listSummaries.unpaid.total.toLocaleString()}원</span>
                    <span className="sub-text">
                        공급 {listSummaries.unpaid.supply.toLocaleString()}
                    </span>
                    <span className="sub-text">
                        세액 {listSummaries.unpaid.tax.toLocaleString()}
                    </span>
                </div>
            </div>
        </div>

        <div className="ppm-list-header-action">
                        <span className="list-count">총 {orders.length}건</span>
                        {userRole !== 'customer' && (
                            <button className="ppm-btn-text-primary" onClick={() => setActiveTab('form')}>
                                <Icons.Plus /> 신규 등록
                            </button>
                        )}
                    </div>
                    
                    <div className="ppm-order-list">
                        {orders.length === 0 ? (
                            <div className="ppm-empty-state">
                                <div className="empty-icon"><Icons.Document /></div>
                                <p>등록된 변경 견적서가 없습니다.</p>
                            </div>
                        ) : (
                            orders.map(order => (
                                <div key={order.id} className="ppm-card order-item" onClick={() => { setSelectedOrder(order); setActiveTab('detail'); }}>
                                    <div className="order-item-top">
                                        {getStatusBadge(order.status)}
                                        <span className="date">{order.createdAt?.toDate().toLocaleDateString()}</span>
                                    </div>
                                    <h4 className="order-title">{order.title}</h4>
                                    <div className="order-item-bottom">
                                        <span className="author">{order.authorName}</span>
                                        <strong className="amount">{order.totalAmount.toLocaleString()}원</strong>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* --- FORM TAB --- */}
            {activeTab === 'form' && (
                <div className="ppm-view-form fade-in">
                    <div className="ppm-input-group">
                        <label>제목(변경 사유)</label>
                        <input type="text" className="ppm-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 자재 변경으로 인한 증액" autoFocus />
                    </div>
                    
                    <div className="ppm-items-wrapper">
                        {items.map((item, idx) => (
                            <div key={idx} className="ppm-card item-card">
                                <div className="item-card-header">
                                    <span className="item-idx">#{idx + 1}</span>
                                    {items.length > 1 && (
                                        <button onClick={() => removeItemRow(idx)} className="ppm-icon-btn-sm danger"><Icons.Trash /></button>
                                    )}
                                </div>
                                <div className="item-card-body">
                                    <div className="ppm-input-group">
                                        <input type="text" className="ppm-input bold" value={item.name} onChange={e => handleItemChange(idx, 'name', e.target.value)} placeholder="품명 입력" />
                                    </div>
                                    <div className="ppm-grid-3">
                                        <input type="text" className="ppm-input center" value={item.unit} onChange={e => handleItemChange(idx, 'unit', e.target.value)} placeholder="단위" />
                                        <input type="text" className="ppm-input right" value={item.quantity} onChange={e => handleItemChange(idx, 'quantity', e.target.value)} placeholder="수량" inputMode="numeric" />
                                        <input type="text" className="ppm-input right" value={item.unitPrice} onChange={e => handleItemChange(idx, 'unitPrice', e.target.value)} placeholder="단가" inputMode="numeric" />
                                    </div>
                                    <div className="ppm-input-group">
                                        <input type="text" className="ppm-input" value={item.note} onChange={e => handleItemChange(idx, 'note', e.target.value)} placeholder="비고 (선택)" />
                                    </div>
                                    <div className="item-total-row">
                                        <span className="label">합계 (VAT포함)</span>
                                        <span className="value">{item.totalPrice.toLocaleString()}원</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <button className="ppm-dashed-btn" onClick={addItemRow}>
                        <Icons.Plus /> 품목 추가
                    </button>
                </div>
            )}

            {/* --- DETAIL TAB --- */}
            {activeTab === 'detail' && selectedOrder && (
                <div className="ppm-view-detail fade-in">
                    <div className="detail-status-bar">
                        {getStatusBadge(selectedOrder.status)}
                        <span className="date">{selectedOrder.createdAt?.toDate().toLocaleString()}</span>
                    </div>
                    
                    <h2 className="detail-title">{selectedOrder.title}</h2>
                    
                    <div className="detail-author-info">
                        <div className="avatar-placeholder">{selectedOrder.authorName[0]}</div>
                        <div className="info-text">
                            <span className="name">{selectedOrder.authorName}</span>
                            <span className="role">작성자</span>
                        </div>
                    </div>

                    <div className="ppm-divider"></div>

                    <div className="detail-items">
                        {selectedOrder.items.map((item, i) => (
                            <div key={i} className="detail-item-row">
                                <div className="row-main">
                                    <span className="name">{item.name}</span>
                                    <span className="price">{item.totalPrice.toLocaleString()}원</span>
                                </div>
                                <div className="row-sub">
                                    {item.quantity}{item.unit} x {item.unitPrice}원
                                    <span className="vat-hint">(공급 {item.supplyPrice.toLocaleString()} / 세액 {item.tax.toLocaleString()})</span>
                                </div>
                                {item.note && <div className="row-note">{item.note}</div>}
                            </div>
                        ))}
                    </div>

                    <div className="detail-summary-card">
                        <div className="summary-line">
                            <span>공급가액</span>
                            <span>{(selectedOrder.totalAmount - selectedOrder.items.reduce((s,i)=>s+i.tax,0)).toLocaleString()}원</span>
                        </div>
                        <div className="summary-line">
                            <span>부가세</span>
                            <span>{selectedOrder.items.reduce((s,i)=>s+i.tax,0).toLocaleString()}원</span>
                        </div>
                        <div className="summary-divider"></div>
                        <div className="summary-line total">
                            <span>최종 합계</span>
                            <span className="total-val">{selectedOrder.totalAmount.toLocaleString()}원</span>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Footer Actions */}
        <div className="ppm-footer">
            {activeTab === 'form' ? (
                <div className="ppm-footer-row">
                    <div className="live-total">
                        <span className="label">총 합계</span>
                        <strong className="value">{currentFormSummary.total.toLocaleString()}원</strong>
                    </div>
                    <button className="ppm-btn primary" onClick={handleSubmit} disabled={isSubmitting}>
                        작성 완료
                    </button>
                </div>
            ) : activeTab === 'detail' ? (
                <div className="ppm-footer-column">
                    {userRole === 'partner' && selectedOrder?.status === 'pending_partner' && (
                        <button className="ppm-btn primary" onClick={() => handleApprove(selectedOrder)}>고객에게 전송 (승인)</button>
                    )}
                    {userRole === 'customer' && selectedOrder?.status === 'pending_customer' && (
                        <button className="ppm-btn primary" onClick={() => handleApprove(selectedOrder!)}>최종 승인하기</button>
                    )}
                    {userRole === 'partner' && selectedOrder?.status === 'approved' && (
                        <button className="ppm-btn primary" onClick={() => handlePaymentToggle(selectedOrder!, 'paid')}>
                            <Icons.CreditCard /> 결제 완료 처리
                        </button>
                    )}
                    {userRole === 'partner' && selectedOrder?.status === 'paid' && (
                        <button className="ppm-btn outline" onClick={() => handlePaymentToggle(selectedOrder!, 'approved')}>
                            <Icons.Refresh /> 결제 상태 되돌리기
                        </button>
                    )}
                    {/* 조건에 맞지 않을 때 기본 목록 버튼 */}
                    {(!((userRole === 'partner' && selectedOrder?.status === 'pending_partner') || (userRole === 'customer' && selectedOrder?.status === 'pending_customer') || (userRole === 'partner' && (selectedOrder?.status === 'approved' || selectedOrder?.status === 'paid')))) && (
                         <button className="ppm-btn secondary" onClick={() => setActiveTab('list')}>목록으로</button>
                    )}
                </div>
            ) : (
                <button className="ppm-btn secondary" onClick={handleManualClose}>닫기</button>
            )}
        </div>
      </div>
    </div>
  );
};

export default ChangeOrderModal;