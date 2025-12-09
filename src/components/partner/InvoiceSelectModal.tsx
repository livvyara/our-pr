import React, { useState, useEffect } from 'react';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { app } from '../../firebase-config';
import './InvoiceSelectModal.css';

interface Invoice {
    id: string;
    writeDate: string; // 작성일자 (필드명 확인 필요: issueDate 또는 writeDate)
    vendorName: string; // 공급자 상호
    itemName: string; // 품목명
    totalAmount: number; // 합계금액
    
    // 이미 매칭된 경우 값이 있음
    siteId?: string;
    category1?: string;
}

interface Props {
    partnerUid: string;
    targetAmount: number; // 요청된 금액
    onClose: () => void;
    onSelect: (invoiceId: string) => void;
}

const InvoiceSelectModal: React.FC<Props> = ({ partnerUid, targetAmount, onClose, onSelect }) => {
    const db = getFirestore(app);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchInvoices = async () => {
            try {
                // [수정] 금액 조건 없이 전체 미분류 내역 조회 (유연성 확보)
                // 복합 인덱스 문제 회피를 위해 클라이언트 필터링 사용
                const q = query(
                    collection(db, 'users', partnerUid, 'TAX_PURCHASE'),
                    orderBy('writeDate', 'desc') // 날짜순 정렬
                );
                const snap = await getDocs(q);
                
                const list = snap.docs
                    .map(d => ({ id: d.id, ...d.data() } as Invoice))
                    .filter(inv => {
                        // [핵심 안전장치] 이미 분류가 끝난 건(category1 있음) 또는 현장이 지정된 건(siteId 있음) 제외
                        // 즉, '미분류' 상태인 것만 목록에 표시
                        return !inv.category1 && !inv.siteId;
                    });
                
                setInvoices(list);
            } catch (e) {
                console.error("세금계산서 로딩 실패:", e);
            } finally {
                setLoading(false);
            }
        };
        fetchInvoices();
    }, [partnerUid]);

    // 검색 필터링 (상호명, 품목명)
    const filteredInvoices = invoices.filter(inv => 
        (inv.vendorName?.includes(searchTerm) || inv.itemName?.includes(searchTerm))
    );

    // 금액 일치 여부 확인 (강조 표시용)
    const isAmountMatch = (amount: number) => Math.abs(amount - targetAmount) < 10;

    return (
        <div className="ord-modal-overlay" style={{zIndex:3000}}>
            <div className="ord-modal-content" style={{width:'800px', maxHeight:'80vh', display:'flex', flexDirection:'column'}}>
                <div className="ord-header">
                    <h3>세금계산서 연결 (목표금액: {targetAmount.toLocaleString()}원)</h3>
                    <button className="ord-close-btn" onClick={onClose}>×</button>
                </div>
                
                {/* 검색바 추가 */}
                <div style={{padding:'15px', borderBottom:'1px solid #eee', background:'#f9f9f9'}}>
                    <input 
                        type="text" 
                        placeholder="공급자명 또는 품목명 검색..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{width:'100%', padding:'10px', border:'1px solid #ddd', borderRadius:'4px'}}
                    />
                </div>

                <div className="ord-body" style={{flex:1, overflowY:'auto', padding:'0'}}>
                    <div className="invoice-select-list">
                        {loading ? <p style={{padding:'20px', textAlign:'center'}}>로딩 중...</p> : 
                         filteredInvoices.length === 0 ? <p className="no-data" style={{padding:'20px', textAlign:'center', color:'#999'}}>연결 가능한 미분류 세금계산서가 없습니다.</p> :
                         (
                            <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px'}}>
                                <thead style={{position:'sticky', top:0, background:'#eee'}}>
                                    <tr>
                                        <th style={{padding:'10px', borderBottom:'1px solid #ddd'}}>작성일자</th>
                                        <th style={{padding:'10px', borderBottom:'1px solid #ddd'}}>공급자</th>
                                        <th style={{padding:'10px', borderBottom:'1px solid #ddd'}}>품목</th>
                                        <th style={{padding:'10px', borderBottom:'1px solid #ddd'}}>합계금액</th>
                                        <th style={{padding:'10px', borderBottom:'1px solid #ddd'}}>선택</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredInvoices.map(inv => (
                                        <tr key={inv.id} style={{
                                            backgroundColor: isAmountMatch(inv.totalAmount) ? '#e3f2fd' : 'white', // 금액 일치 시 강조
                                            borderBottom:'1px solid #f0f0f0'
                                        }}>
                                            <td style={{padding:'10px', textAlign:'center'}}>{inv.writeDate}</td>
                                            <td style={{padding:'10px', textAlign:'center'}}>{inv.vendorName}</td>
                                            <td style={{padding:'10px'}}>{inv.itemName}</td>
                                            <td style={{padding:'10px', textAlign:'right', fontWeight:'bold', color: isAmountMatch(inv.totalAmount) ? '#1976d2' : '#333'}}>
                                                {inv.totalAmount.toLocaleString()}원
                                            </td>
                                            <td style={{padding:'10px', textAlign:'center'}}>
                                                <button 
                                                    className="btn-select" 
                                                    onClick={() => onSelect(inv.id)}
                                                    style={{
                                                        padding:'6px 12px', background:'#333', color:'white', 
                                                        border:'none', borderRadius:'4px', cursor:'pointer'
                                                    }}
                                                >
                                                    선택
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                         )
                        }
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InvoiceSelectModal;