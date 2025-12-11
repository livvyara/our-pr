import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, collection, query, orderBy, getDocs, doc, updateDoc } from 'firebase/firestore';
import { sendSystemMessage } from '../../utils/chatService'; 
import './CustomerChangeOrderModal.css';

// --- [High-End Icons] ---
const Icons = {
  Close: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  Back: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  Check: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Bill: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
};

interface ChangeOrderItem {
  name: string; unit: string; quantity: string; unitPrice: string; 
  supplyPrice: number; tax: number; totalPrice: number; note: string;
}
interface ChangeOrderDoc {
  id: string; title: string; items: ChangeOrderItem[]; totalAmount: number;
  status: 'pending_partner' | 'pending_customer' | 'approved'; 
  createdAt: any; authorName: string; partnerUid: string;
}
interface Props { siteId: string; partnerUid: string; onClose: () => void; }

const CustomerChangeOrderModal: React.FC<Props> = ({ siteId, partnerUid, onClose }) => {
  const db = getFirestore();
  const [orders, setOrders] = useState<ChangeOrderDoc[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ChangeOrderDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'auto'; };
  }, []);

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'users', partnerUid, 'sites', siteId, 'changeOrders'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChangeOrderDoc)));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchOrders();
  }, [siteId, partnerUid, db]);

  const handleApprove = async () => {
    if (!selectedOrder || !confirm("최종 승인 하시겠습니까?\n승인 후에는 되돌릴 수 없습니다.")) return;
    try {
      await updateDoc(doc(db, 'users', partnerUid, 'sites', siteId, 'changeOrders', selectedOrder.id), { status: 'approved' });
      await sendSystemMessage(siteId, "고객님이 추가/변경 견적을 최종 승인하셨습니다.");
      alert("승인되었습니다.");
      
      const updated = { ...selectedOrder, status: 'approved' as const };
      setSelectedOrder(updated);
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? updated : o));
    } catch (e) { console.error(e); alert("오류가 발생했습니다."); }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
        case 'pending_partner': return <span className="co-badge pending">작성중</span>;
        case 'pending_customer': return <span className="co-badge waiting">승인 대기</span>;
        case 'approved': return <span className="co-badge approved"><Icons.Check /> 승인 완료</span>;
        default: return null;
    }
  };

  const calculateTotals = (items: ChangeOrderItem[]) => {
      const supply = items.reduce((acc, item) => acc + item.supplyPrice, 0);
      const tax = items.reduce((acc, item) => acc + item.tax, 0);
      return { supply, tax };
  };

  return (
    <div className="co-overlay" onClick={onClose}>
      <div className="co-container" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="co-header">
          {selectedOrder ? (
              <button className="co-back-btn" onClick={() => setSelectedOrder(null)}>
                  <Icons.Back /> <span className="back-text">목록으로</span>
              </button>
          ) : (
              <div className="co-title-group">
                  <h2 className="co-title">Change Orders</h2>
                  <span className="co-subtitle">추가/변경 견적 내역</span>
              </div>
          )}
          <button className="co-close-btn" onClick={onClose} aria-label="닫기"><Icons.Close /></button>
        </div>

        {/* Body */}
        <div className="co-body" ref={listRef}>
            {loading ? (
                <div className="co-loading"><div className="spinner"></div></div>
            ) : selectedOrder ? (
                // --- 상세 보기 (Invoice Style) ---
                <div className="co-detail-view fade-in">
                    <div className="invoice-card">
                        <div className="invoice-head">
                            <div className="head-info">
                                <span className="invoice-date">{selectedOrder.createdAt?.toDate().toLocaleDateString()}</span>
                                <h3 className="invoice-title">{selectedOrder.title}</h3>
                                <span className="invoice-author">작성자: {selectedOrder.authorName}</span>
                            </div>
                            <div className="head-status">
                                {getStatusBadge(selectedOrder.status)}
                            </div>
                        </div>

                        <div className="invoice-table-wrap">
                            <table className="invoice-table">
                                <thead>
                                    <tr>
                                        <th className="th-item">품명</th>
                                        <th className="th-spec">규격/수량</th>
                                        <th className="th-price">단가</th>
                                        <th className="th-total">합계</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedOrder.items.map((item, i) => (
                                        <tr key={i}>
                                            <td className="td-item" data-label="품명">
                                                <div className="item-name">{item.name}</div>
                                                {item.note && <div className="item-note">{item.note}</div>}
                                            </td>
                                            <td className="td-spec" data-label="규격/수량">
                                                {item.quantity} {item.unit}
                                            </td>
                                            <td className="td-price" data-label="단가">
                                                {Number(item.unitPrice).toLocaleString()}
                                            </td>
                                            <td className="td-total" data-label="합계">
                                                {item.totalPrice.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="invoice-summary">
                            <div className="summary-row">
                                <span>공급가액</span>
                                <strong>{calculateTotals(selectedOrder.items).supply.toLocaleString()} 원</strong>
                            </div>
                            <div className="summary-row">
                                <span>부가세(VAT)</span>
                                <strong>{calculateTotals(selectedOrder.items).tax.toLocaleString()} 원</strong>
                            </div>
                            <div className="summary-row total">
                                <span>총 합계</span>
                                <strong className="total-text">{selectedOrder.totalAmount.toLocaleString()} 원</strong>
                            </div>
                        </div>

                        {selectedOrder.status === 'pending_customer' && (
                            <div className="invoice-actions">
                                <p className="action-guide">위 내용을 확인하였으며, 이에 동의하여 승인합니다.</p>
                                <button className="co-btn-approve" onClick={handleApprove}>최종 승인하기</button>
                            </div>
                        )}
                    </div>
                </div>
            ) : orders.length === 0 ? (
                <div className="co-empty">
                    <div className="icon-box"><Icons.Bill /></div>
                    <p>등록된 견적서가 없습니다.</p>
                </div>
            ) : (
                // --- 리스트 보기 (List Style) ---
                <div className="co-list-view">
                    {orders.map((order, index) => (
                        <div 
                            key={order.id} 
                            className="co-card" 
                            onClick={() => setSelectedOrder(order)}
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            <div className="co-card-top">
                                <span className="co-date">{order.createdAt?.toDate().toLocaleDateString()}</span>
                                {getStatusBadge(order.status)}
                            </div>
                            <h4 className="co-card-title">{order.title}</h4>
                            <div className="co-card-bottom">
                                <span className="co-label">총 견적금액</span>
                                <span className="co-amount">{order.totalAmount.toLocaleString()} 원</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default CustomerChangeOrderModal;