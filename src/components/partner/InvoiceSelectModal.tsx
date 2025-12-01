import React, { useState, useEffect } from 'react';
import { getFirestore, collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { app } from '../../firebase-config';
import './OrderRequestPage.css';

interface Props {
    partnerUid: string;
    targetAmount: number; // 요청된 금액
    onClose: () => void;
    onSelect: (invoiceId: string) => void;
}

const InvoiceSelectModal: React.FC<Props> = ({ partnerUid, targetAmount, onClose, onSelect }) => {
    const db = getFirestore(app);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchInvoices = async () => {
            try {
                // 매입 세금계산서 (TAX_PURCHASE) 중 금액이 일치하는 것 조회
                // (정확한 일치를 위해 == 사용하지만, 부동소수점 주의 필요하면 범위 검색)
                const q = query(
                    collection(db, 'users', partnerUid, 'TAX_PURCHASE'),
                    where('totalAmount', '==', targetAmount), 
                    orderBy('writeDate', 'desc')
                );
                const snap = await getDocs(q);
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setInvoices(list);
            } catch (e) { console.error(e); } finally { setLoading(false); }
        };
        fetchInvoices();
    }, [partnerUid, targetAmount]);

    return (
        <div className="ord-modal-overlay" style={{zIndex:3000}}>
            <div className="ord-modal-content" style={{width:'600px'}}>
                <div className="ord-header">
                    <h3>세금계산서 연결 (금액: {targetAmount.toLocaleString()}원)</h3>
                    <button className="ord-close-btn" onClick={onClose}>×</button>
                </div>
                <div className="ord-body">
                    <p style={{fontSize:'13px', color:'#666', marginBottom:'10px'}}>
                        요청 금액과 일치하는 매입 세금계산서 목록입니다.<br/>
                        연결할 내역을 선택해주세요.
                    </p>
                    <div className="invoice-select-list">
                        {loading ? <p>검색 중...</p> : invoices.length === 0 ? <p className="no-data">일치하는 세금계산서가 없습니다.</p> :
                         invoices.map(inv => (
                             <div key={inv.id} className="invoice-item" onClick={() => onSelect(inv.id)}>
                                 <div className="inv-date">{inv.writeDate}</div>
                                 <div className="inv-vendor">{inv.vendorName}</div>
                                 <div className="inv-amt">{inv.totalAmount.toLocaleString()}원</div>
                                 <button className="btn-select">선택</button>
                             </div>
                         ))
                        }
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InvoiceSelectModal;