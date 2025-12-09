import React, { useState, useEffect } from 'react';
import { 
    getFirestore, collection, query, orderBy, getDocs, doc, updateDoc, deleteDoc, getDoc, serverTimestamp 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase-config';
import GiroReceiptUploadModal from '../../components/partner/GiroReceiptUploadModal';
import './GiroReceiptExpensePage.css';

export interface GiroRequest {
    id: string;
    requesterName: string;
    siteName: string;
    usage: string;
    amount: number;
    bankName: string;
    accountNumber: string;
    accountOwner: string;
    imageUrl: string;
    status: 'pending' | 'approved' | 'completed';
    createdAt: any;
    approvedAt?: any;
}

const GiroReceiptExpensePage: React.FC = () => {
    const db = getFirestore();
    const [requests, setRequests] = useState<GiroRequest[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [currentUid, setCurrentUid] = useState<string | null>(null);
    const [myUid, setMyUid] = useState('');
    const [isOwner, setIsOwner] = useState(false);
    
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setMyUid(user.uid);
                try {
                    const userDoc = await getDoc(doc(db, 'users', user.uid));
                    if(userDoc.exists()) {
                        const d = userDoc.data();
                        let targetUid = user.uid;
                        let isUserOwner = true;

                        if (d.role === 'sub_partner' && d.partnerInfo?.ownerUid) {
                            targetUid = d.partnerInfo.ownerUid;
                            isUserOwner = false;
                        }
                        
                        setCurrentUid(targetUid);
                        setIsOwner(isUserOwner);
                        fetchRequests(targetUid);
                    }
                } catch (e) { console.error(e); }
            }
        });
        return () => unsubscribe();
    }, []);

    const fetchRequests = async (uid: string) => {
        setLoading(true);
        try {
            const q = query(
                collection(db, 'users', uid, 'GIRO_REQUESTS'),
                orderBy('createdAt', 'desc')
            );
            const snap = await getDocs(q);
            setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as GiroRequest)));
        } catch (e) { console.error(e); } 
        finally { setLoading(false); }
    };

    const handleApprove = async (req: GiroRequest) => {
        if (!isOwner) return alert("대표자만 승인할 수 있습니다.");
        if (!confirm("결제를 승인하시겠습니까?\n(직원이 확인 후 이체하게 됩니다)")) return;

        try {
            await updateDoc(doc(db, 'users', currentUid!, 'GIRO_REQUESTS', req.id), {
                status: 'approved',
                approvedAt: serverTimestamp()
            });
            alert("승인 처리되었습니다.");
            fetchRequests(currentUid!);
        } catch (e) { alert("처리 중 오류 발생"); }
    };

    const handleComplete = async (req: GiroRequest) => {
        if (!confirm("이체를 완료하였습니까?\n상태를 '지급완료'로 변경합니다.")) return;
        try {
            await updateDoc(doc(db, 'users', currentUid!, 'GIRO_REQUESTS', req.id), {
                status: 'completed'
            });
            fetchRequests(currentUid!);
        } catch (e) { alert("오류 발생"); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("삭제하시겠습니까?")) return;
        try {
            await deleteDoc(doc(db, 'users', currentUid!, 'GIRO_REQUESTS', id));
            fetchRequests(currentUid!);
        } catch (e) { alert("삭제 실패"); }
    };

    const getStatusBadge = (status: string) => {
        switch(status) {
            case 'pending': return <span className="gr-badge pending">승인대기</span>;
            case 'approved': return <span className="gr-badge approved">결제승인</span>;
            case 'completed': return <span className="gr-badge completed">지급완료</span>;
            default: return <span>{status}</span>;
        }
    };

    return (
        // [중요] 네임스페이싱을 위한 최상위 클래스명 변경
        <div className="giro-expense-page-container">
            <div className="gr-header">
                <div className="gr-header-left">
                    <h2 className="gr-title">지로 / 영수증 지출 등록</h2>
                    <p className="gr-desc">영수증이나 지로 용지를 촬영하여 등록하고 결제 승인을 요청합니다.</p>
                </div>
                <div className="gr-header-right">
                    <button className="btn-register" onClick={() => setIsUploadModalOpen(true)}>
                        + 지출 등록
                    </button>
                    <button className="btn-refresh" onClick={() => currentUid && fetchRequests(currentUid)}>
                        🔄 새로고침
                    </button>
                </div>
            </div>

            <div className="gr-content">
                {loading ? <div className="gr-loading">로딩 중...</div> : 
                 requests.length === 0 ? <div className="gr-empty">등록된 지출 내역이 없습니다.</div> : (
                    <table className="gr-table">
                        <thead>
                            <tr>
                                <th>상태</th>
                                <th>등록일</th>
                                <th>요청자</th>
                                <th>현장/용도</th>
                                <th>증빙자료</th>
                                <th>금액</th>
                                <th>입금계좌</th>
                                <th style={{width:'250px'}}>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map(req => (
                                <tr key={req.id}>
                                    <td className="center">{getStatusBadge(req.status)}</td>
                                    <td className="center">{req.createdAt?.toDate().toLocaleDateString()}</td>
                                    <td className="center">{req.requesterName}</td>
                                    <td>
                                        <div className="gr-site-info">
                                            <strong>{req.siteName || '(현장없음)'}</strong>
                                            <span>{req.usage}</span>
                                        </div>
                                    </td>
                                    <td className="center">
                                        {req.imageUrl ? (
                                            <button className="btn-view-img" onClick={() => setPreviewImage(req.imageUrl)}>
                                                사진보기
                                            </button>
                                        ) : <span className="text-gray">없음</span>}
                                    </td>
                                    <td className="right bold">{req.amount.toLocaleString()} 원</td>
                                    <td>
                                        <div className="gr-bank-info">
                                            <span>{req.bankName}</span>
                                            <span>{req.accountNumber}</span>
                                            <span className="owner">({req.accountOwner})</span>
                                        </div>
                                    </td>
                                    <td className="center">
                                        <div className="gr-actions">
                                            {req.status === 'pending' && (
                                                <div className="warning-text">승인되지 않은 건 입니다.<br/>결제하시면 안됩니다.</div>
                                            )}

                                            {isOwner && req.status === 'pending' && (
                                                <button className="btn-action approve" onClick={() => handleApprove(req)}>승인</button>
                                            )}
                                            
                                            {req.status === 'approved' && (
                                                <button className="btn-action complete" onClick={() => handleComplete(req)}>지급처리</button>
                                            )}
                                            
                                            <button className="btn-icon-del" onClick={() => handleDelete(req.id)}>🗑️</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 )}
            </div>

            {isUploadModalOpen && currentUid && (
                <GiroReceiptUploadModal 
                    partnerUid={currentUid}
                    onClose={() => setIsUploadModalOpen(false)}
                    onSuccess={() => {
                        setIsUploadModalOpen(false);
                        fetchRequests(currentUid);
                    }}
                />
            )}

            {previewImage && (
                <div className="gr-img-viewer" onClick={() => setPreviewImage(null)}>
                    <img src={previewImage} alt="영수증" onClick={e => e.stopPropagation()} />
                    <button onClick={() => setPreviewImage(null)}>×</button>
                </div>
            )}
        </div>
    );
};

export default GiroReceiptExpensePage;