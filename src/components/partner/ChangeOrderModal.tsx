import React, { useState, useEffect, useMemo } from 'react';
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { auth } from '../../firebase-config';
import { sendSystemMessage } from '../../utils/chatService'; 
import './ChangeOrderModal.css'; 

// --- [High-End Icons] ---
const Icons = {
  Close: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  List: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  Plus: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Trash: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  Check: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>,
  ArrowLeft: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>,
  CreditCard: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>,
  Refresh: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
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

  // [History API] 모바일 뒤로가기 제어
  useEffect(() => {
    window.history.pushState({ modal: 'ChangeOrderModal' }, '', window.location.href);
    const handlePopState = () => onClose();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onClose]);

  const handleManualClose = () => window.history.back();

  // [Memo] 목록 화면용 통합 합계 계산 (전체 / 결제완료 / 미결제 분리)
  const listSummaries = useMemo(() => {
      const initial = { supply: 0, tax: 0, total: 0 };
      const createInit = () => ({ ...initial });

      return orders.reduce((acc, order) => {
          const orderSupply = order.items.reduce((s, i) => s + i.supplyPrice, 0);
          const orderTax = order.items.reduce((s, i) => s + i.tax, 0);
          const orderTotal = order.totalAmount;

          // 1. 전체 합계 누적
          acc.total.supply += orderSupply;
          acc.total.tax += orderTax;
          acc.total.total += orderTotal;

          // 2. 상태별 누적 (paid vs others)
          const target = order.status === 'paid' ? 'paid' : 'unpaid';
          acc[target].supply += orderSupply;
          acc[target].tax += orderTax;
          acc[target].total += orderTotal;

          return acc;
      }, { total: createInit(), paid: createInit(), unpaid: createInit() });
  }, [orders]);

  // [Memo] 입력 폼용 실시간 합계
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
          case 'pending_partner': return <span className="ppm-status pending">대표승인 대기</span>;
          case 'pending_customer': return <span className="ppm-status waiting">고객승인 대기</span>;
          case 'approved': return <span className="ppm-status approved">최종승인 완료</span>;
          case 'paid': return <span className="ppm-status paid">결제 완료</span>;
          default: return <span>-</span>;
      }
  };

  return (
    <div className="ppm-overlay">
      <div className="ppm-container">
        
        {/* Header */}
        <div className="ppm-header">
          <div className="ppm-title-group">
            {activeTab !== 'list' && (
                <button className="ppm-back-btn" onClick={() => setActiveTab('list')}><Icons.ArrowLeft /></button>
            )}
            <div>
                <h3>추가/변경 견적 협의</h3>
                <span className="ppm-site-name">{siteName}</span>
            </div>
          </div>
          <button className="ppm-close-btn" onClick={handleManualClose}><Icons.Close /></button>
        </div>

        <div className="ppm-body">
            {activeTab === 'list' && (
                <>
                    {/* 대시보드형 합계 패널 */}
                    <div className="ppm-dashboard-summary">
                        <div className="summary-grid">
                            <div className="grid-head label">구분</div>
                            <div className="grid-head value">공급가액</div>
                            <div className="grid-head value">부가세</div>
                            <div className="grid-head value">합계</div>

                            {/* Total Row */}
                            <div className="grid-row total">
                                <div className="cell label">총 견적</div>
                                <div className="cell value">{listSummaries.total.supply.toLocaleString()}</div>
                                <div className="cell value">{listSummaries.total.tax.toLocaleString()}</div>
                                <div className="cell value bold">{listSummaries.total.total.toLocaleString()}</div>
                            </div>

                            {/* Paid Row */}
                            <div className="grid-row paid">
                                <div className="cell label">결제 완료</div>
                                <div className="cell value">{listSummaries.paid.supply.toLocaleString()}</div>
                                <div className="cell value">{listSummaries.paid.tax.toLocaleString()}</div>
                                <div className="cell value bold">{listSummaries.paid.total.toLocaleString()}</div>
                            </div>

                            {/* Unpaid Row */}
                            <div className="grid-row unpaid">
                                <div className="cell label">미결제</div>
                                <div className="cell value">{listSummaries.unpaid.supply.toLocaleString()}</div>
                                <div className="cell value">{listSummaries.unpaid.tax.toLocaleString()}</div>
                                <div className="cell value bold">{listSummaries.unpaid.total.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>

                    <div className="ppm-list-toolbar" style={{marginTop:'12px'}}>
                        <div style={{flex:1}}></div> 
                        {userRole !== 'customer' && (
                            <button className="ppm-btn-primary small" onClick={() => setActiveTab('form')}>
                                <Icons.Plus /> 신규 등록
                            </button>
                        )}
                    </div>
                    
                    <div className="ppm-list">
                        {orders.length === 0 ? <div className="ppm-empty-state"><Icons.List /><p>등록된 내역이 없습니다.</p></div> : 
                        orders.map(order => (
                            <div key={order.id} className={`ppm-card ${order.status === 'paid' ? 'is-paid' : ''}`} onClick={() => { setSelectedOrder(order); setActiveTab('detail'); }}>
                                <div className="ppm-card-top">
                                    {getStatusBadge(order.status)}
                                    <span className="ppm-card-date">{order.createdAt?.toDate().toLocaleDateString()}</span>
                                </div>
                                <h4 className="ppm-card-title">{order.title}</h4>
                                <div className="ppm-card-bottom">
                                    <span className="ppm-card-author">작성자: {order.authorName}</span>
                                    <strong className="ppm-card-amount">{order.totalAmount.toLocaleString()} 원</strong>
                                </div>
                            </div>
                        ))
                        }
                    </div>
                </>
            )}

            {activeTab === 'form' && (
                <div className="ppm-form-container">
                    <div className="ppm-input-group">
                        <label>제목 (변경 사유) <span className="req">*</span></label>
                        <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 거실 조명 추가 요청건" className="ppm-input" autoFocus />
                    </div>
                    
                    <div className="ppm-items-area">
                        {items.map((item, idx) => (
                            <div key={idx} className="ppm-item-card-edit">
                                <div className="ppm-item-header">
                                    <span className="ppm-item-idx">#{idx + 1}</span>
                                    {items.length > 1 && (
                                        <button onClick={() => removeItemRow(idx)} className="ppm-btn-icon-del"><Icons.Trash /></button>
                                    )}
                                </div>
                                <div className="ppm-grid-inputs">
                                    <div className="ppm-input-wrapper name">
                                        <input type="text" value={item.name} onChange={e => handleItemChange(idx, 'name', e.target.value)} placeholder="품명" />
                                    </div>
                                    <div className="ppm-input-row-half">
                                        <input type="text" value={item.unit} onChange={e => handleItemChange(idx, 'unit', e.target.value)} placeholder="단위" className="center" />
                                        <input type="text" value={item.quantity} onChange={e => handleItemChange(idx, 'quantity', e.target.value)} placeholder="수량" className="right" />
                                    </div>
                                    <div className="ppm-input-wrapper">
                                        <input type="text" value={item.unitPrice} onChange={e => handleItemChange(idx, 'unitPrice', e.target.value)} placeholder="단가 (원)" className="right" />
                                    </div>
                                    <div className="ppm-readonly-row">
                                        <span>공급가: {item.supplyPrice.toLocaleString()}</span>
                                        <span>세액: {item.tax.toLocaleString()}</span>
                                    </div>
                                    <div className="ppm-input-wrapper">
                                        <input type="text" value={item.note} onChange={e => handleItemChange(idx, 'note', e.target.value)} placeholder="비고 (선택)" />
                                    </div>
                                    <div className="ppm-item-total">
                                        합계: <strong>{item.totalPrice.toLocaleString()} 원</strong>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <button className="ppm-btn-dashed" onClick={addItemRow}><Icons.Plus /> 품목 추가</button>
                </div>
            )}

            {activeTab === 'detail' && selectedOrder && (
                <div className="ppm-detail-container">
                    <div className="ppm-detail-header">
                        <h4>{selectedOrder.title}</h4>
                        {getStatusBadge(selectedOrder.status)}
                    </div>
                    <div className="ppm-detail-meta">
                        <span>작성일: {selectedOrder.createdAt?.toDate().toLocaleDateString()}</span>
                        <span>작성자: {selectedOrder.authorName}</span>
                    </div>

                    <div className="ppm-detail-items">
                        {selectedOrder.items.map((item, i) => (
                            <div key={i} className="ppm-item-card-view">
                                <div className="ppm-view-row main">
                                    <span className="ppm-view-name">{item.name}</span>
                                    <span className="ppm-view-total">{item.totalPrice.toLocaleString()} 원</span>
                                </div>
                                <div className="ppm-view-row sub">
                                    <span>{item.quantity}{item.unit} x {item.unitPrice}원</span>
                                    <span className="ppm-view-tax">(VAT {item.tax.toLocaleString()})</span>
                                </div>
                                {item.note && <div className="ppm-view-note">Note: {item.note}</div>}
                            </div>
                        ))}
                    </div>

                    <div className="ppm-total-summary-card">
                        <div className="row"><span>공급가액</span><span>{(selectedOrder.totalAmount - selectedOrder.items.reduce((s,i)=>s+i.tax,0)).toLocaleString()} 원</span></div>
                        <div className="row"><span>부가세</span><span>{selectedOrder.items.reduce((s,i)=>s+i.tax,0).toLocaleString()} 원</span></div>
                        <div className="divider"></div>
                        <div className="row total"><span>최종 합계</span><span>{selectedOrder.totalAmount.toLocaleString()} 원</span></div>
                    </div>
                </div>
            )}
        </div>

        <div className="ppm-footer">
            {activeTab === 'form' ? (
                <div className="ppm-footer-form">
                    <div className="ppm-live-summary">
                        <div className="summary-item"><span>공급가</span> <strong>{currentFormSummary.supply.toLocaleString()}</strong></div>
                        <div className="summary-item"><span>부가세</span> <strong>{currentFormSummary.tax.toLocaleString()}</strong></div>
                        <div className="summary-item total"><span>합계</span> <strong>{currentFormSummary.total.toLocaleString()}</strong></div>
                    </div>
                    <div className="ppm-footer-btns">
                        <button className="ppm-btn-secondary" onClick={() => setActiveTab('list')}>취소</button>
                        <button className="ppm-btn-primary" onClick={handleSubmit} disabled={isSubmitting}>등록하기</button>
                    </div>
                </div>
            ) : activeTab === 'detail' ? (
                <div className="ppm-footer-detail">
                    {userRole === 'partner' && selectedOrder?.status === 'pending_partner' && (
                        <button className="ppm-btn-primary full" onClick={() => handleApprove(selectedOrder)}>승인 (고객 전송)</button>
                    )}
                    {userRole === 'customer' && selectedOrder?.status === 'pending_customer' && (
                        <button className="ppm-btn-primary full" onClick={() => handleApprove(selectedOrder!)}>최종 승인</button>
                    )}
                    
                    {userRole === 'partner' && (
                        <>
                            {selectedOrder?.status === 'approved' && (
                                <button className="ppm-btn-primary full" onClick={() => handlePaymentToggle(selectedOrder, 'paid')}>
                                    <Icons.CreditCard /> 결제 완료 처리
                                </button>
                            )}
                            {selectedOrder?.status === 'paid' && (
                                <button className="ppm-btn-secondary full" onClick={() => handlePaymentToggle(selectedOrder, 'approved')}>
                                    <Icons.Refresh /> 결제 완료 되돌리기
                                </button>
                            )}
                        </>
                    )}

                    {(!((userRole === 'partner' && selectedOrder?.status === 'pending_partner') || (userRole === 'customer' && selectedOrder?.status === 'pending_customer') || (userRole === 'partner' && (selectedOrder?.status === 'approved' || selectedOrder?.status === 'paid')))) && (
                         <button className="ppm-btn-secondary full" onClick={() => setActiveTab('list')}>목록으로</button>
                    )}
                </div>
            ) : (
                <button className="ppm-btn-secondary" onClick={handleManualClose}>닫기</button>
            )}
        </div>

      </div>
    </div>
  );
};

export default ChangeOrderModal;