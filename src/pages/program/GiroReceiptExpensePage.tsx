import React, { useState, useEffect } from 'react';
import { 
    getFirestore, collection, query, orderBy, getDocs, doc, updateDoc, deleteDoc, getDoc, serverTimestamp 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase-config';
import GiroReceiptUploadModal from '../../components/partner/GiroReceiptUploadModal';
import './GiroReceiptExpensePage.css';
import { 
    RefreshCw, Plus, Trash2, CheckCircle, ExternalLink, Image as ImageIcon,
    CreditCard, Calendar, User, Building, X, ZoomIn, ZoomOut, RotateCcw
} from 'lucide-react';
// [추가] 이미지 확대/축소 라이브러리
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

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
            case 'pending': return <span className="gre-badge pending">승인대기</span>;
            case 'approved': return <span className="gre-badge approved">결제승인</span>;
            case 'completed': return <span className="gre-badge completed">지급완료</span>;
            default: return <span>{status}</span>;
        }
    };

    // --- Render Logic ---
    return (
        <div className="giro-expense-page-container">
            {/* Header Area */}
            <div className="gre-header">
                <div className="gre-title-group">
                    <h2>지로 / 영수증 지출 관리</h2>
                    <p>현장 지출 내역을 등록하고 간편하게 결제 승인을 요청하세요.</p>
                </div>
                <div className="gre-header-actions">
                    <button className="gre-btn gre-btn-secondary" onClick={() => currentUid && fetchRequests(currentUid)}>
                        <RefreshCw size={18} /> 새로고침
                    </button>
                    <button className="gre-btn gre-btn-primary gre-upload-trigger" onClick={() => setIsUploadModalOpen(true)}>
                        <Plus size={18} /> 지출 등록하기
                    </button>
                </div>
            </div>

            {/* Content Area */}
            {loading ? <div className="gre-loading">데이터를 불러오는 중입니다...</div> : 
             requests.length === 0 ? <div className="gre-empty">등록된 지출 내역이 없습니다.</div> : (
                <>
                    {/* 1. Desktop Table View */}
                    <div className="gre-desktop-view">
                        <table className="gre-table">
                            <thead>
                                <tr>
                                    <th className="col-status">상태</th>
                                    <th className="col-date">등록일</th>
                                    <th className="col-req">요청자</th>
                                    <th className="col-site">현장/용도</th>
                                    <th className="col-img" style={{textAlign:'center'}}>증빙</th>
                                    <th className="col-amount">금액</th>
                                    <th className="col-bank">입금 정보</th>
                                    <th className="col-manage" style={{textAlign:'center'}}>관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {requests.map(req => (
                                    <tr key={req.id}>
                                        <td>{getStatusBadge(req.status)}</td>
                                        <td style={{color:'#666'}}>{req.createdAt?.toDate().toLocaleDateString()}</td>
                                        <td style={{fontWeight:600}}>{req.requesterName}</td>
                                        <td>
                                            <div style={{display:'flex', flexDirection:'column'}}>
                                                <strong style={{color:'#333', fontSize:'15px'}}>{req.siteName || '(현장없음)'}</strong>
                                                <span style={{color:'#888', fontSize:'13px'}}>{req.usage}</span>
                                            </div>
                                        </td>
                                        <td style={{textAlign:'center'}}>
                                            {req.imageUrl ? (
                                                <button className="gre-btn-sm" onClick={() => setPreviewImage(req.imageUrl)}>
                                                    <ImageIcon size={14} /> 확인
                                                </button>
                                            ) : <span style={{color:'#ddd'}}>-</span>}
                                        </td>
                                        <td style={{textAlign:'right', fontWeight:700, fontSize:'15px'}}>
                                            {req.amount.toLocaleString()}원
                                        </td>
                                        <td>
                                            <div className="gre-bank-info">
                                                <strong>{req.bankName} {req.accountNumber}</strong>
                                                <span>예금주: {req.accountOwner}</span>
                                            </div>
                                        </td>
                                        <td style={{textAlign:'center'}}>
                                            <div style={{display:'flex', gap:'6px', justifyContent:'center'}}>
                                                {isOwner && req.status === 'pending' && (
                                                    <button className="gre-btn-sm" style={{color:'#219653', borderColor:'#219653'}} onClick={() => handleApprove(req)}>
                                                        <CheckCircle size={14} /> 승인
                                                    </button>
                                                )}
                                                {req.status === 'approved' && (
                                                    <button className="gre-btn-sm" style={{color:'#3182f6', borderColor:'#3182f6'}} onClick={() => handleComplete(req)}>
                                                        <CreditCard size={14} /> 지급
                                                    </button>
                                                )}
                                                <button className="gre-btn-sm" style={{color:'#e94e58', borderColor:'#e94e58'}} onClick={() => handleDelete(req.id)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* 2. Mobile Card List View */}
                    <div className="gre-mobile-view">
                        {requests.map(req => (
                            <div key={req.id} className={`gre-card status-${req.status}`}>
                                <div className="gre-card-header">
                                    {getStatusBadge(req.status)}
                                    <span className="gre-card-date">
                                        <Calendar size={12} style={{marginRight:'4px', verticalAlign:'middle'}}/>
                                        {req.createdAt?.toDate().toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="gre-card-body">
                                    <div className="gre-card-title">{req.siteName || '현장 미지정'}</div>
                                    <div className="gre-card-row">
                                        <span className="gre-label">용도</span>
                                        <span className="gre-value">{req.usage}</span>
                                    </div>
                                    <div className="gre-card-row">
                                        <span className="gre-label">요청자</span>
                                        <span className="gre-value">{req.requesterName}</span>
                                    </div>
                                    <div className="gre-card-row">
                                        <span className="gre-label">금액</span>
                                        <span className="gre-value amount">{req.amount.toLocaleString()}원</span>
                                    </div>
                                    <div className="gre-card-row" style={{background:'#f9fafb', padding:'10px', borderRadius:'8px', marginTop:'4px'}}>
                                        <span className="gre-label">입금</span>
                                        <span className="gre-value" style={{fontSize:'13px', textAlign:'right'}}>
                                            {req.bankName} {req.accountNumber}<br/>
                                            (예금주: {req.accountOwner})
                                        </span>
                                    </div>
                                </div>
                                <div className="gre-card-footer">
                                    {req.imageUrl && (
                                        <button className="gre-btn gre-btn-secondary" onClick={() => setPreviewImage(req.imageUrl)}>
                                            <ImageIcon size={16} /> 증빙사진 확인
                                        </button>
                                    )}
                                    <div style={{display:'flex', gap:'8px'}}>
                                        {isOwner && req.status === 'pending' && (
                                            <button className="gre-btn gre-btn-primary" style={{flex:1, backgroundColor:'#219653'}} onClick={() => handleApprove(req)}>
                                                승인 처리
                                            </button>
                                        )}
                                        {req.status === 'approved' && (
                                            <button className="gre-btn gre-btn-primary" style={{flex:1}} onClick={() => handleComplete(req)}>
                                                지급 완료 처리
                                            </button>
                                        )}
                                        <button className="gre-btn gre-btn-danger" style={{width:'52px'}} onClick={() => handleDelete(req.id)}>
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Upload Modal */}
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

            {/* Image Viewer (Zoom & Pan Enabled) */}
            {previewImage && (
                <div className="gre-viewer-overlay" onClick={() => setPreviewImage(null)}>
                    <div className="gre-viewer-content" onClick={e => e.stopPropagation()}>
                        <button className="gre-viewer-close" onClick={() => setPreviewImage(null)}>
                            <X size={24} />
                        </button>
                        
                        <TransformWrapper
                            initialScale={1}
                            minScale={0.5}
                            maxScale={4}
                            centerOnInit
                        >
                            {({ zoomIn, zoomOut, resetTransform }) => (
                                <React.Fragment>
                                    <div className="gre-viewer-controls">
                                        <button className="gre-control-btn" onClick={() => zoomIn()}>
                                            <ZoomIn size={20} />
                                        </button>
                                        <button className="gre-control-btn" onClick={() => zoomOut()}>
                                            <ZoomOut size={20} />
                                        </button>
                                        <button className="gre-control-btn" onClick={() => resetTransform()}>
                                            <RotateCcw size={20} />
                                        </button>
                                    </div>
                                    <TransformComponent wrapperStyle={{width: "100%", height: "100%"}}>
                                        <img src={previewImage} alt="증빙자료" className="gre-viewer-img" />
                                    </TransformComponent>
                                </React.Fragment>
                            )}
                        </TransformWrapper>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GiroReceiptExpensePage;