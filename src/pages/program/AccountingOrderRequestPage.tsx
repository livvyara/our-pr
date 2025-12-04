import React, { useEffect, useState, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, getDocs, doc, updateDoc, getDoc, deleteDoc,
  query, orderBy, serverTimestamp, addDoc
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import './AccountingOrderRequestPage.css'; 
import OrderPermissionModal from '../../components/partner/OrderPermissionModal';
import InvoiceSelectModal from '../../components/partner/InvoiceSelectModal';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

interface OrderRequest {
  id: string;
  siteId: string;
  siteName: string;
  requesterName: string;
  type: 'tax_invoice' | 'online';
  status: 'pending' | 'pending_payment' | 'approved' | 'rejected';
  category1: string;
  category2: string;
  createdAt: any;
  amount?: number;
  linkedInvoiceId?: string;
  rejectReason?: string;
  vendorName?: string;
  itemDetails?: string;
  bankName?: string;
  accountNumber?: string;
  accountOwner?: string;
  quantity?: number;
  memo?: string;
  link?: string;
}

const AccountingOrderRequestPage: React.FC = () => {
  const [requests, setRequests] = useState<OrderRequest[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [myUid, setMyUid] = useState('');
  const [myName, setMyName] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [authorizedUids, setAuthorizedUids] = useState<string[]>([]);
  
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [linkTargetRequest, setLinkTargetRequest] = useState<OrderRequest | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // 관리 권한 (대표 + 권한 받은 직원)
  const canManage = useMemo(() => isOwner || authorizedUids.includes(myUid), [isOwner, authorizedUids, myUid]);

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
                setMyName(d.nickname || d.name || '사용자');

                if (d.role === 'sub_partner' && d.partnerInfo?.ownerUid) {
                    targetUid = d.partnerInfo.ownerUid;
                    isUserOwner = false;
                }
                setCurrentUid(targetUid);
                setIsOwner(isUserOwner);
                fetchPermissions(targetUid);
                fetchRequests(targetUid);
            }
        } catch (e) { console.error(e); }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading && requests.length > 0) {
      setTimeout(() => {
        observerRef.current = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) entry.target.classList.add('or-active');
          });
        }, { threshold: 0.1 });

        const targets = document.querySelectorAll('.or-fade-up');
        targets.forEach(el => observerRef.current?.observe(el));
      }, 100);
    }
    return () => observerRef.current?.disconnect();
  }, [loading, requests]);

  const fetchPermissions = async (uid: string) => {
      try {
          const docSnap = await getDoc(doc(db, 'users', uid, 'settings', 'order_permissions'));
          if (docSnap.exists()) {
              setAuthorizedUids(docSnap.data().uids || []);
          } else {
              setAuthorizedUids([]);
          }
      } catch (e) { console.error(e); }
  };

  const fetchRequests = async (uid: string) => {
      setLoading(true);
      try {
          const q = query(collection(db, 'users', uid, 'ORDER_REQUESTS'), orderBy('createdAt', 'desc'));
          const snap = await getDocs(q);
          setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as OrderRequest)));
      } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleReject = async (req: OrderRequest) => {
      if (!canManage) return alert("권한이 없습니다.");
      const reason = prompt("부결 사유를 입력해주세요 (필수):");
      if (!reason) return;

      try {
          await updateDoc(doc(db, 'users', currentUid!, 'ORDER_REQUESTS', req.id), {
              status: 'rejected',
              rejectReason: reason
          });
          alert("부결 처리되었습니다.");
          fetchRequests(currentUid!);
      } catch(e) { alert("오류 발생"); }
  };

  // [수정] 초기화는 오직 대표자(isOwner)만 가능
  const handleReset = async (req: OrderRequest) => {
      if (!isOwner) return alert("대표자만 상태를 초기화할 수 있습니다.");
      
      if (!confirm("상태를 '승인대기'로 초기화하시겠습니까?\n(연결된 세금계산서 정보는 유지됩니다)")) return;

      try {
          await updateDoc(doc(db, 'users', currentUid!, 'ORDER_REQUESTS', req.id), {
              status: 'pending',
              rejectReason: null 
          });
          alert("상태가 초기화되었습니다.");
          fetchRequests(currentUid!);
      } catch(e) { alert("오류 발생"); }
  };

  const handleDelete = async (req: OrderRequest) => {
      if (!canManage) return alert("권한이 없습니다.");
      if (!confirm("정말 삭제하시겠습니까? (복구 불가)")) return;

      try {
          await deleteDoc(doc(db, 'users', currentUid!, 'ORDER_REQUESTS', req.id));
          await addDoc(collection(db, 'users', currentUid!, 'activityLogs'), {
              text: `[발주삭제] ${myName}님이 ${req.siteName} 현장의 발주 건을 삭제했습니다.`,
              createdAt: serverTimestamp(),
              type: 'order_delete'
          });
          alert("삭제되었습니다.");
          fetchRequests(currentUid!);
      } catch(e) { console.error(e); alert("오류 발생"); }
  };

  const handleApprove = async (req: OrderRequest) => {
      if (!currentUid) return;

      if (req.status === 'pending') {
          if (!canManage) return alert("관리 권한이 없습니다.");
          if (!confirm("1차 승인 하시겠습니까?\n(직원에게 결제 정보가 공개됩니다)")) return;

          try {
              await updateDoc(doc(db, 'users', currentUid, 'ORDER_REQUESTS', req.id), {
                  status: 'pending_payment'
              });
              alert("1차 승인 완료. 결제 대기 상태로 변경되었습니다.");
              fetchRequests(currentUid);
          } catch(e) { console.error(e); alert("오류 발생"); }
      } 
      
      else if (req.status === 'pending_payment') {
          if (req.type === 'tax_invoice' && !req.linkedInvoiceId) {
              return alert("세금계산서를 먼저 연결해주세요.");
          }
          if (!confirm("최종 완료 처리 하시겠습니까?")) return;

          try {
              await updateDoc(doc(db, 'users', currentUid, 'ORDER_REQUESTS', req.id), {
                  status: 'approved'
              });

              if (req.type === 'tax_invoice' && req.linkedInvoiceId) {
                  const invoiceRef = doc(db, 'users', currentUid, 'TAX_PURCHASE', req.linkedInvoiceId);
                  await updateDoc(invoiceRef, {
                      siteId: req.siteId,
                      category1: req.category1,
                      category2: req.category2,
                  });
              }
              
              await addDoc(collection(db, 'users', currentUid, 'activityLogs'), {
                  text: `[발주완료] ${myName}님이 ${req.siteName} 발주 건을 최종 완료 처리했습니다.`,
                  createdAt: serverTimestamp(),
                  type: 'order_approve'
              });

              alert("최종 완료되었습니다.");
              fetchRequests(currentUid);
          } catch(e) { console.error(e); alert("오류 발생"); }
      }
  };

  const handleLinkComplete = async (invoiceId: string) => {
      if (!linkTargetRequest || !currentUid) return;
      try {
          await updateDoc(doc(db, 'users', currentUid, 'ORDER_REQUESTS', linkTargetRequest.id), {
              linkedInvoiceId: invoiceId
          });
          alert("세금계산서가 연결되었습니다.");
          setLinkTargetRequest(null);
          fetchRequests(currentUid);
      } catch(e) { alert("연결 실패"); }
  };

  const renderSecretCell = (req: OrderRequest, content: React.ReactNode) => {
      if (canManage) return content;
      if (req.status === 'pending_payment' || req.status === 'approved') {
          return content;
      }
      return <span className="or-secret-mask">🔒 승인 대기 (비공개)</span>;
  };

  const getStatusText = (status: string) => {
      switch(status) {
          case 'pending': return '승인대기';
          case 'pending_payment': return '결제대기';
          case 'approved': return '완료됨';
          case 'rejected': return '부결';
          default: return status;
      }
  };

  return (
    <div className="or-page-container">
        <div className="or-header">
            <div className="or-header-left">
               <h2 className="or-title">현장별 발주 요청 관리</h2>
               <p className="or-desc">승인 프로세스: 승인대기(비공개) → 1차승인(결제대기) → 최종완료</p>
            </div>
            <div className="or-header-right">
                {isOwner && <button className="btn-perm" onClick={() => setIsPermissionModalOpen(true)}>🔐 권한 설정</button>}
                <button className="btn-refresh" onClick={() => currentUid && fetchRequests(currentUid)}>🔄 새로고침</button>
            </div>
        </div>

        <div className="or-content-wrapper">
            {loading ? <div className="or-loading">데이터를 불러오는 중입니다...</div> :
             requests.length === 0 ? <div className="or-empty">요청 내역이 없습니다.</div> :
             (
                 <div className="or-table-container" ref={listRef}>
                     <table className="or-table">
                         <thead>
                             <tr>
                                 <th className="th-status">상태</th>
                                 <th className="th-date">요청일</th>
                                 <th className="th-site">현장명</th>
                                 <th className="th-user">요청자</th>
                                 <th className="th-type">구분</th>
                                 <th className="th-detail">내역 상세</th>
                                 <th className="th-amount">금액/수량</th>
                                 <th className="th-action">관리</th>
                             </tr>
                         </thead>
                         <tbody>
                             {requests.map((req, index) => (
                                 <tr 
                                    key={req.id} 
                                    className={`or-fade-up ${req.status}`}
                                    style={{ transitionDelay: `${index * 0.05}s` }}
                                 >
                                     <td data-label="상태">
                                         <span className={`or-status-badge ${req.status}`}>{getStatusText(req.status)}</span>
                                     </td>
                                     <td data-label="요청일" className="td-date">
                                         {req.createdAt?.toDate ? req.createdAt.toDate().toLocaleDateString() : '-'}
                                     </td>
                                     <td data-label="현장명" className="td-site">
                                         {req.siteName}
                                     </td>
                                     <td data-label="요청자" className="td-user">
                                         {req.requesterName}
                                     </td>
                                     <td data-label="구분" className="td-type">
                                         <span className="or-type-tag">{req.type === 'tax_invoice' ? '세금계산서' : '인터넷구매'}</span>
                                     </td>
                                     
                                     <td data-label="내역 상세" className="td-detail">
                                         <div className="or-detail-box">
                                             <div className="or-category">{req.category1} &gt; {req.category2}</div>
                                             <div className="or-detail-content">
                                                 {renderSecretCell(req, (
                                                     req.type === 'tax_invoice' ? (
                                                         <>
                                                             <div className="or-vendor">{req.vendorName}</div>
                                                             <div className="or-item-name">{req.itemDetails}</div>
                                                         </>
                                                     ) : (
                                                         <>
                                                             <div className="or-item-name">{req.memo}</div>
                                                             {req.link && <a href={req.link} target="_blank" rel="noreferrer" className="or-link">🔗 상품 링크</a>}
                                                         </>
                                                     )
                                                 ))}
                                             </div>
                                             {req.rejectReason && <div className="or-reject-reason">🚫 사유: {req.rejectReason}</div>}
                                         </div>
                                     </td>

                                     <td data-label="금액/수량" className="td-amount">
                                         {renderSecretCell(req, (
                                             req.type === 'tax_invoice' ? (
                                                 <>
                                                     <strong className="or-amount-val">{req.amount?.toLocaleString()} 원</strong>
                                                     <div className="or-bank-info">{req.bankName} {req.accountNumber}</div>
                                                 </>
                                             ) : (
                                                 <strong className="or-amount-val">{req.quantity} 개</strong>
                                             )
                                         ))}
                                     </td>

                                     <td data-label="관리" className="td-action">
                                         <div className="or-action-btns">
                                            {/* 1. 승인 대기 상태 (대표/권한자 승인/부결) */}
                                            {req.status === 'pending' && canManage && (
                                                <>
                                                    <button className="btn-mini reject" onClick={() => handleReject(req)}>부결</button>
                                                    <button className="btn-mini approve" onClick={() => handleApprove(req)}>1차 승인</button>
                                                </>
                                            )}

                                            {/* 2. 결제 대기 상태 (직원/대표 모두 처리 가능) */}
                                            {req.status === 'pending_payment' && (
                                                <>
                                                    {req.type === 'tax_invoice' && (
                                                        <button 
                                                            className={`btn-mini link ${req.linkedInvoiceId ? 'active' : ''}`}
                                                            onClick={() => setLinkTargetRequest(req)}
                                                        >
                                                            {req.linkedInvoiceId ? '연결됨' : '연결'}
                                                        </button>
                                                    )}
                                                    <button className="btn-mini complete" onClick={() => handleApprove(req)}>최종 완료</button>
                                                </>
                                            )}

                                            {/* 3. 완료 또는 부결 상태 (초기화 가능 - 오직 대표자 isOwner만) */}
                                            {(req.status === 'approved' || req.status === 'rejected') && isOwner && (
                                                <button className="btn-mini reset" onClick={() => handleReset(req)}>↺ 초기화</button>
                                            )}

                                            {/* 삭제 버튼 (권한자에게 항상 표시) */}
                                            {canManage && (
                                                <button className="btn-icon-del" onClick={() => handleDelete(req)} title="삭제">🗑️</button>
                                            )}
                                         </div>
                                     </td>
                                 </tr>
                             ))}
                         </tbody>
                     </table>
                 </div>
             )
            }
        </div>

        {linkTargetRequest && currentUid && (
            <InvoiceSelectModal 
                partnerUid={currentUid} 
                targetAmount={linkTargetRequest.amount || 0} 
                onClose={() => setLinkTargetRequest(null)} 
                onSelect={handleLinkComplete} 
            />
        )}
        
        {isPermissionModalOpen && currentUid && <OrderPermissionModal partnerUid={currentUid} onClose={() => setIsPermissionModalOpen(false)} />}
    </div>
  );
};
export default AccountingOrderRequestPage;