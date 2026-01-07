import React, { useState, useEffect } from 'react';
import { 
  getFirestore, collection, query, orderBy, getDocs, doc, updateDoc, deleteDoc, getDoc, serverTimestamp 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase-config';
import GiroReceiptUploadModal from '../../components/partner/GiroReceiptUploadModal';
import './GiroReceiptExpensePage.css';
import { 
  RefreshCw, Plus, Trash2, CheckCircle, Image as ImageIcon,
  CreditCard, Calendar, X, ZoomIn, ZoomOut, RotateCcw
} from 'lucide-react';
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

  return (
    <div className="gre-container">
      {/* Header Area */}
      <div className="gre-header">
        <div className="gre-title-area">
          <h2>지로 / 영수증 지출 관리</h2>
          <p>현장 지출 내역을 등록하고 간편하게 결제 승인을 요청하세요.</p>
        </div>
        <div className="gre-header-actions">
          <button className="gre-btn gre-btn-secondary" onClick={() => currentUid && fetchRequests(currentUid)}>
            <RefreshCw size={18} /> 새로고침
          </button>
          <button className="gre-btn gre-btn-primary" onClick={() => setIsUploadModalOpen(true)}>
            <Plus size={18} /> 지출 등록하기
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="gre-content">
        {loading ? <div className="gre-loading"><div className="spinner"></div><p>데이터를 불러오는 중...</p></div> : 
         requests.length === 0 ? <div className="gre-empty">등록된 지출 내역이 없습니다.</div> : (
          <>
            {/* 1. Desktop Table View */}
            <div className="gre-desktop-view">
              <div className="gre-table-container">
                <div className="gre-table-wrapper">
                  <table className="gre-table">
                    <thead>
                      <tr>
                        <th className="col-status text-center">상태</th>
                        <th className="col-date text-center">등록일</th>
                        <th className="col-req text-center">요청자</th>
                        <th className="col-site">현장/용도</th>
                        <th className="col-img text-center">증빙</th>
                        <th className="col-amount text-right">금액</th>
                        <th className="col-bank">입금 정보</th>
                        <th className="col-manage text-center">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map(req => (
                        <tr key={req.id}>
                          <td className="text-center">{getStatusBadge(req.status)}</td>
                          <td className="text-center text-secondary">{req.createdAt?.toDate().toLocaleDateString()}</td>
                          <td className="text-center font-bold">{req.requesterName}</td>
                          <td>
                            <div className="gre-info-cell">
                              <strong className="site-name">{req.siteName || '(현장없음)'}</strong>
                              <span className="usage-text">{req.usage}</span>
                            </div>
                          </td>
                          <td className="text-center">
                            {req.imageUrl ? (
                              <button className="gre-btn-mini secondary" onClick={() => setPreviewImage(req.imageUrl)}>
                                <ImageIcon size={14} /> 확인
                              </button>
                            ) : <span className="text-tertiary">-</span>}
                          </td>
                          <td className="text-right font-bold text-primary" style={{fontSize:'15px'}}>
                            {req.amount.toLocaleString()}원
                          </td>
                          <td>
                            <div className="gre-bank-cell">
                              <span className="bank-account">{req.bankName} {req.accountNumber}</span>
                              <span className="bank-owner">예금주: {req.accountOwner}</span>
                            </div>
                          </td>
                          <td className="text-center">
                            <div className="gre-action-btns">
                              {isOwner && req.status === 'pending' && (
                                <button className="gre-btn-mini success" onClick={() => handleApprove(req)}>
                                  <CheckCircle size={14} /> 승인
                                </button>
                              )}
                              {req.status === 'approved' && (
                                <button className="gre-btn-mini primary" onClick={() => handleComplete(req)}>
                                  <CreditCard size={14} /> 지급
                                </button>
                              )}
                              <button className="gre-btn-icon-del" onClick={() => handleDelete(req.id)}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 2. Mobile Card List View */}
            <div className="gre-mobile-view">
              <div className="gre-mobile-list">
                {requests.map(req => (
                  <div key={req.id} className={`gre-card status-${req.status}`}>
                    <div className="gre-card-header">
                      <div className="header-left">
                        {getStatusBadge(req.status)}
                        <span className="date">
                          <Calendar size={12} /> {req.createdAt?.toDate().toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="gre-card-body">
                      <div className="gre-card-title">{req.siteName || '현장 미지정'}</div>
                      <div className="gre-info-row">
                        <span className="label">용도</span>
                        <span className="value">{req.usage}</span>
                      </div>
                      <div className="gre-info-row">
                        <span className="label">요청자</span>
                        <span className="value">{req.requesterName}</span>
                      </div>
                      <div className="gre-info-row amount-row">
                        <span className="label">금액</span>
                        <span className="value amount">{req.amount.toLocaleString()}원</span>
                      </div>
                      
                      <div className="gre-bank-box">
                        <div className="bank-row">
                          <span className="bank-name">{req.bankName}</span>
                          <span className="account-num">{req.accountNumber}</span>
                        </div>
                        <span className="account-owner">예금주: {req.accountOwner}</span>
                      </div>
                    </div>
                    
                    <div className="gre-card-footer">
                      {req.imageUrl && (
                        <button className="gre-btn-card secondary" onClick={() => setPreviewImage(req.imageUrl)}>
                          <ImageIcon size={16} /> 증빙사진
                        </button>
                      )}
                      
                      <div className="action-row">
                        {isOwner && req.status === 'pending' && (
                          <button className="gre-btn-card success" onClick={() => handleApprove(req)}>
                            <CheckCircle size={16} /> 승인 처리
                          </button>
                        )}
                        {req.status === 'approved' && (
                          <button className="gre-btn-card primary" onClick={() => handleComplete(req)}>
                            <CreditCard size={16} /> 지급 완료
                          </button>
                        )}
                        <button className="gre-btn-card danger" onClick={() => handleDelete(req.id)}>
                          <Trash2 size={16} /> 삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

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
                    <button className="gre-control-btn" onClick={() => zoomIn()}><ZoomIn size={20} /></button>
                    <button className="gre-control-btn" onClick={() => zoomOut()}><ZoomOut size={20} /></button>
                    <button className="gre-control-btn" onClick={() => resetTransform()}><RotateCcw size={20} /></button>
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