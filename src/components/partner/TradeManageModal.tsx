import React, { useState, useEffect } from 'react';
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, updateDoc } from 'firebase/firestore';
import './WorkerModal.css'; // 스타일 공유

interface Props {
  onClose: () => void;
  partnerUid: string;
  onUpdate: () => void; // 데이터 변경 시 부모 갱신
}

const TradeManageModal: React.FC<Props> = ({ onClose, partnerUid, onUpdate }) => {
  const db = getFirestore();
  const [trades, setTrades] = useState<{id: string, name: string}[]>([]);
  const [newTrade, setNewTrade] = useState('');

  useEffect(() => {
    fetchTrades();
  }, []);

  const fetchTrades = async () => {
    const q = query(collection(db, 'users', partnerUid, 'EXPENSE_CATEGORIES_SITE'), orderBy('order', 'asc'));
    const snap = await getDocs(q);
    setTrades(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
  };

  const handleAdd = async () => {
    if (!newTrade.trim()) return;
    await addDoc(collection(db, 'users', partnerUid, 'EXPENSE_CATEGORIES_SITE'), {
        name: newTrade, subCategories: [], order: trades.length
    });
    setNewTrade('');
    fetchTrades();
    onUpdate(); // 부모에게 알림
  };

  const handleDelete = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, 'users', partnerUid, 'EXPENSE_CATEGORIES_SITE', id));
    fetchTrades();
    onUpdate();
  };

  return (
    <div className="worker-modal-wrapper">
      <div className="wm-overlay" onClick={onClose}>
        <div className="wm-content" onClick={e => e.stopPropagation()} style={{height: 'auto', minHeight:'400px'}}>
            <div className="wm-header"><h3>공종(지출품목) 관리</h3><button className="wm-close-btn" onClick={onClose}>×</button></div>
            <div className="wm-body">
                <div className="wm-form-group" style={{display:'flex', gap:'10px'}}>
                    <input type="text" value={newTrade} onChange={e => setNewTrade(e.target.value)} placeholder="새 공종 입력" />
                    <button className="wm-btn-save" onClick={handleAdd}>추가</button>
                </div>
                <ul style={{listStyle:'none', padding:0, maxHeight:'300px', overflowY:'auto'}}>
                    {trades.map(t => (
                        <li key={t.id} style={{display:'flex', justifyContent:'space-between', padding:'10px', borderBottom:'1px solid #eee'}}>
                            <span>{t.name}</span>
                            <button onClick={() => handleDelete(t.id)} style={{color:'red', background:'none', border:'none', cursor:'pointer'}}>삭제</button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
      </div>
    </div>
  );
};
export default TradeManageModal;