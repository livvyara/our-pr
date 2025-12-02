import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, collection, query, orderBy, getDocs, doc, updateDoc } from 'firebase/firestore';
import { sendSystemMessage } from '../../utils/chatService'; 
import './CustomerChangeOrderModal.css';

interface ChangeOrderItem {
  name: string;
  unit: string;
  quantity: string; 
  unitPrice: string; 
  supplyPrice: number;
  tax: number;
  totalPrice: number;
  note: string;
}

interface ChangeOrderDoc {
  id: string;
  title: string;
  items: ChangeOrderItem[];
  totalAmount: number;
  status: 'pending_partner' | 'pending_customer' | 'approved'; 
  createdAt: any;
  authorName: string;
  partnerUid: string;
}

interface Props {
  siteId: string;
  partnerUid: string;
  onClose: () => void;
}

const CustomerChangeOrderModal: React.FC<Props> = ({ siteId, partnerUid, onClose }) => {
  const db = getFirestore();
  const [orders, setOrders] = useState<ChangeOrderDoc[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ChangeOrderDoc | null>(null);
  const [loading, setLoading] = useState(true);

  // 애니메이션 Refs
  const listRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'users', partnerUid, 'sites', siteId, 'changeOrders'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChangeOrderDoc));
        setOrders(list);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchOrders();
  }, [siteId, partnerUid, db]);

  useEffect(() => {
    if (!loading) {
      setTimeout(() => {
        const headers = document.querySelectorAll('.co-header-anim');
        headers.forEach(el => el.classList.add('co-active'));

        observerRef.current = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) entry.target.classList.add('co-active');
          });
        }, { threshold: 0.1 });

        const targets = document.querySelectorAll('.co-fade-up');
        targets.forEach(el => observerRef.current?.observe(el));
      }, 100);
    }
    return () => observerRef.current?.disconnect();
  }, [loading, selectedOrder]);

  const handleApprove = async () => {
    if (!selectedOrder) return;
    if (!confirm("최종 승인 하시겠습니까?\n승인 후에는 되돌릴 수 없습니다.")) return;
    
    try {
      const ref = doc(db, 'users', partnerUid, 'sites', siteId, 'changeOrders', selectedOrder.id);
      await updateDoc(ref, { status: 'approved' });
      await sendSystemMessage(siteId, "고객님이 추가/변경 견적을 최종 승인하셨습니다.");
      
      alert("승인되었습니다.");
      setSelectedOrder({ ...selectedOrder, status: 'approved' });
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, status: 'approved' } : o));
    } catch (e) { console.error(e); alert("오류가 발생했습니다."); }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
        case 'pending_partner': return <span className="co-status pending">작성중</span>;
        case 'pending_customer': return <span className="co-status waiting">승인 대기</span>;
        case 'approved': return <span className="co-status approved">승인 완료</span>;
        default: return <span>-</span>;
    }
  };

  // [추가] 합계 계산 함수
  const calculateTotals = (items: ChangeOrderItem[]) => {
      const supply = items.reduce((acc, item) => acc + item.supplyPrice, 0);
      const tax = items.reduce((acc, item) => acc + item.tax, 0);
      const total = items.reduce((acc, item) => acc + item.totalPrice, 0);
      return { supply, tax, total };
  };

  return (
    <div className="co-modal-overlay" onClick={onClose}>
      <div className="co-modal-container wide" onClick={e => e.stopPropagation()}>
        
        <div className="co-modal-header">
          <div className="co-reveal-mask">
             <h2 className="co-modal-title co-header-anim">추가/변경 견적서</h2>
          </div>
          <button className="btn-close" onClick={onClose}>&times;</button>
        </div>

        <div className="co-modal-body" ref={listRef}>
            {loading ? <div className="co-loading">불러오는 중...</div> : 
             
             // --- 상세 보기 (인보이스 스타일) ---
             selectedOrder ? (
                 <div className="co-detail-wrapper">
                     <button onClick={() => setSelectedOrder(null)} className="btn-back co-fade-up">← 목록으로</button>
                     
                     <div className="invoice-paper co-fade-up" style={{transitionDelay:'0.1s'}}>
                         <div className="invoice-header">
                             <div className="invoice-title-row">
                                 <h3>{selectedOrder.title}</h3>
                                 {getStatusBadge(selectedOrder.status)}
                             </div>
                             <div className="invoice-meta">
                                 <span>작성일: {selectedOrder.createdAt?.toDate().toLocaleDateString()}</span>
                                 <span>작성자: {selectedOrder.authorName}</span>
                             </div>
                         </div>

                         <div className="invoice-table-wrapper">
                             <table className="invoice-table">
                                 <thead>
                                     <tr>
                                         <th className="th-name">품명</th>
                                         <th className="th-center">규격/수량</th>
                                         <th className="th-right">단가</th>
                                         <th className="th-right">공급가액</th>
                                         <th className="th-right">세액</th>
                                         <th className="th-right">합계</th>
                                     </tr>
                                 </thead>
                                 <tbody>
                                     {selectedOrder.items.map((item, i) => (
                                         <tr key={i}>
                                             <td className="td-name" data-label="품명">
                                                 <div className="item-name">{item.name}</div>
                                                 {item.note && <div className="item-note">{item.note}</div>}
                                             </td>
                                             <td className="td-center" data-label="규격/수량">{item.quantity}{item.unit}</td>
                                             <td className="td-right" data-label="단가">{item.unitPrice}</td>
                                             <td className="td-right" data-label="공급가액">{item.supplyPrice.toLocaleString()}</td>
                                             <td className="td-right" data-label="세액">{item.tax.toLocaleString()}</td>
                                             <td className="td-right font-bold" data-label="합계">{item.totalPrice.toLocaleString()}</td>
                                         </tr>
                                     ))}
                                 </tbody>
                             </table>
                         </div>

                         {/* [수정] 합계 영역 분리 */}
                         <div className="invoice-footer">
                             <div className="invoice-summary-row">
                                 <span>공급가액 합계</span>
                                 <strong>{calculateTotals(selectedOrder.items).supply.toLocaleString()} 원</strong>
                             </div>
                             <div className="invoice-summary-row">
                                 <span>부가세(VAT)</span>
                                 <strong>{calculateTotals(selectedOrder.items).tax.toLocaleString()} 원</strong>
                             </div>
                             <div className="invoice-total-row">
                                 <span className="total-label">총 합계</span>
                                 <strong className="total-amount">{selectedOrder.totalAmount.toLocaleString()} 원</strong>
                             </div>
                         </div>

                         {selectedOrder.status === 'pending_customer' && (
                             <div className="invoice-actions">
                                 <p className="approve-desc">위 내용을 확인하였으며, 이에 동의하여 승인합니다.</p>
                                 <button className="btn-approve" onClick={handleApprove}>최종 승인하기</button>
                             </div>
                         )}
                     </div>
                 </div>
             ) : 
             
             // --- 리스트 모드 (카드 디자인 강화) ---
             orders.length === 0 ? <div className="co-empty co-fade-up">등록된 견적서가 없습니다.</div> :
             (
                 <div className="co-list-container">
                     {orders.map((order, index) => (
                         <div 
                            key={order.id} 
                            onClick={() => setSelectedOrder(order)} 
                            className="co-list-card co-fade-up"
                            style={{ transitionDelay: `${index * 0.05}s` }}
                         >
                             <div className="co-card-main">
                                <div className="co-card-header-row">
                                    <span className="co-card-date">{order.createdAt?.toDate().toLocaleDateString()}</span>
                                    {getStatusBadge(order.status)}
                                </div>
                                <h4 className="co-card-title">{order.title}</h4>
                             </div>
                             <div className="co-card-divider"></div>
                             <div className="co-card-footer">
                                <span>총 견적금액</span>
                                <span className="co-card-amount">{order.totalAmount.toLocaleString()} 원</span>
                             </div>
                         </div>
                     ))}
                 </div>
             )
            }
        </div>
      </div>
    </div>
  );
};

export default CustomerChangeOrderModal;