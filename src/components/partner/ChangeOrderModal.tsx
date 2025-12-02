import React, { useState, useEffect } from 'react';
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { auth } from '../../firebase-config';
import { sendSystemMessage } from '../../utils/chatService'; // [NEW] 채팅 알림
import './ChangeOrderModal.css'; 

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
  siteName: string;
  partnerUid: string;
  userRole: string;
  onClose: () => void;
}

const ChangeOrderModal: React.FC<Props> = ({ siteId, siteName, partnerUid, userRole, onClose }) => {
  const db = getFirestore();
  const [activeTab, setActiveTab] = useState<'list' | 'form' | 'detail'>('list');
  
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<ChangeOrderItem[]>([
      { name: '', unit: '', quantity: '', unitPrice: '', supplyPrice: 0, tax: 0, totalPrice: 0, note: '' },
      { name: '', unit: '', quantity: '', unitPrice: '', supplyPrice: 0, tax: 0, totalPrice: 0, note: '' },
      { name: '', unit: '', quantity: '', unitPrice: '', supplyPrice: 0, tax: 0, totalPrice: 0, note: '' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [orders, setOrders] = useState<ChangeOrderDoc[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ChangeOrderDoc | null>(null);

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
          
          // [NEW] 등록 알림
          await sendSystemMessage(siteId, "추가/변경 견적 협의가 등록되었습니다.");

          alert("등록되었습니다.");
          setActiveTab('list');
          setTitle('');
          setItems([
            { name: '', unit: '', quantity: '', unitPrice: '', supplyPrice: 0, tax: 0, totalPrice: 0, note: '' },
            { name: '', unit: '', quantity: '', unitPrice: '', supplyPrice: 0, tax: 0, totalPrice: 0, note: '' },
            { name: '', unit: '', quantity: '', unitPrice: '', supplyPrice: 0, tax: 0, totalPrice: 0, note: '' },
          ]);

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
            
            // [NEW] 승인 알림
            if (message) await sendSystemMessage(siteId, message);

            alert("승인되었습니다.");
            if (activeTab === 'detail') setSelectedOrder({ ...order, status: nextStatus } as any);
            fetchOrders();
          }
      } catch (e) { console.error(e); alert("오류 발생"); }
  };

  const getStatusBadge = (status: string) => {
      switch(status) {
          case 'pending_partner': return <span className="badge pending">대표승인 대기</span>;
          case 'pending_customer': return <span className="badge customer">고객승인 대기</span>;
          case 'approved': return <span className="badge approved">최종승인 완료</span>;
          default: return <span>-</span>;
      }
  };

  return (
    <div className="co-modal-overlay">
      <div className="co-modal-content">
        <div className="co-header">
          <h3>추가/변경 견적 협의</h3>
          <button className="co-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="co-body">
            {activeTab === 'list' && (
                <>
                    <div style={{marginBottom:'15px', display:'flex', justifyContent:'flex-end'}}>
                        {userRole !== 'customer' && (
                            <button className="btn-new" onClick={() => setActiveTab('form')}>+ 신규 등록</button>
                        )}
                    </div>
                    <div className="co-list">
                        {orders.length === 0 ? <p className="no-data">등록된 내역이 없습니다.</p> : 
                        orders.map(order => (
                            <div key={order.id} className="co-item" onClick={() => { setSelectedOrder(order); setActiveTab('detail'); }}>
                                <div className="co-item-header">
                                    <span className="co-date">{order.createdAt?.toDate().toLocaleDateString()}</span>
                                    {getStatusBadge(order.status)}
                                </div>
                                <div className="co-item-title">{order.title}</div>
                                <div className="co-item-amount">합계: {order.totalAmount.toLocaleString()} 원</div>
                                <div className="co-item-author">작성자: {order.authorName}</div>
                            </div>
                        ))
                        }
                    </div>
                </>
            )}

            {activeTab === 'form' && (
                <div className="co-form">
                    <div className="form-group">
                        <label>제목 (변경 사유)</label>
                        <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 거실 조명 추가 요청건" />
                    </div>
                    
                    <div className="co-table-wrapper">
                        <table className="co-input-table">
                            <thead>
                                <tr>
                                    <th className="col-name">품명</th>
                                    <th className="col-unit">단위</th>
                                    <th className="col-qty">수량</th>
                                    <th className="col-price">단가</th>
                                    <th className="col-supply">공급가액</th>
                                    <th className="col-tax">세액</th>
                                    <th className="col-total">합계</th>
                                    <th className="col-note">비고</th>
                                    <th className="col-del"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td><input type="text" value={item.name} onChange={e => handleItemChange(idx, 'name', e.target.value)} placeholder="품명" /></td>
                                        <td><input type="text" value={item.unit} onChange={e => handleItemChange(idx, 'unit', e.target.value)} className="text-center" /></td>
                                        <td><input type="text" value={item.quantity} onChange={e => handleItemChange(idx, 'quantity', e.target.value)} placeholder="0" className="text-right" /></td>
                                        <td><input type="text" value={item.unitPrice} onChange={e => handleItemChange(idx, 'unitPrice', e.target.value)} placeholder="0" className="text-right" /></td>
                                        <td className="text-right">{item.supplyPrice.toLocaleString()}</td>
                                        <td className="text-right">{item.tax.toLocaleString()}</td>
                                        <td className="text-right bg-light">{item.totalPrice.toLocaleString()}</td>
                                        <td><input type="text" value={item.note} onChange={e => handleItemChange(idx, 'note', e.target.value)} /></td>
                                        <td><button onClick={() => removeItemRow(idx)} className="btn-del-row">×</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <button className="btn-add-row" onClick={addItemRow}>+ 행 추가</button>

                    <div className="co-total-box">
                        총 합계: <strong>{getTotalAmount().toLocaleString()} 원</strong>
                    </div>

                    <div className="co-actions">
                        <button className="btn-cancel" onClick={() => setActiveTab('list')}>취소</button>
                        <button className="btn-save" onClick={handleSubmit} disabled={isSubmitting}>등록하기</button>
                    </div>
                </div>
            )}

            {activeTab === 'detail' && selectedOrder && (
                <div className="co-detail">
                    <div className="co-detail-header">
                        <h4>{selectedOrder.title}</h4>
                        {getStatusBadge(selectedOrder.status)}
                    </div>
                    <p className="co-detail-meta">작성일: {selectedOrder.createdAt?.toDate().toLocaleDateString()} | 작성자: {selectedOrder.authorName}</p>

                    <table className="co-view-table">
                        <thead>
                            <tr><th>품명</th><th>단위</th><th>수량</th><th>단가</th><th>공급가액</th><th>세액</th><th>합계</th><th>비고</th></tr>
                        </thead>
                        <tbody>
                            {selectedOrder.items.map((item, i) => (
                                <tr key={i}>
                                    <td className="text-left">{item.name}</td>
                                    <td className="text-center">{item.unit}</td>
                                    <td className="text-center">{item.quantity}</td>
                                    <td className="text-right">{item.unitPrice}</td>
                                    <td className="text-right">{item.supplyPrice.toLocaleString()}</td>
                                    <td className="text-right">{item.tax.toLocaleString()}</td>
                                    <td className="text-right font-bold">{item.totalPrice.toLocaleString()}</td>
                                    <td>{item.note}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="co-total-box">
                        최종 합계: <strong>{selectedOrder.totalAmount.toLocaleString()} 원</strong>
                    </div>

                    <div className="co-actions">
                        <button className="btn-back" onClick={() => setActiveTab('list')}>목록으로</button>
                        {userRole === 'partner' && selectedOrder.status === 'pending_partner' && (
                            <button className="btn-approve" onClick={() => handleApprove(selectedOrder)}>승인 (고객에게 전송)</button>
                        )}
                        {userRole === 'customer' && selectedOrder.status === 'pending_customer' && (
                            <button className="btn-approve" onClick={() => handleApprove(selectedOrder)}>최종 승인</button>
                        )}
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default ChangeOrderModal;