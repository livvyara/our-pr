import React, { useEffect, useState, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, getDocs, doc, updateDoc, getDoc, deleteDoc,
  query, orderBy, where, serverTimestamp, addDoc
} from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from '../../firebase-config';
import '../../components/partner/OrderRequestPage.css';
import OrderPermissionModal from '../../components/partner/OrderPermissionModal';
import InvoiceSelectModal from '../../components/partner/InvoiceSelectModal';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

interface OrderRequest {
  id: string;
  siteId: string; // [중요] 현장 귀속 자동화를 위해 필요
  siteName: string;
  requesterName: string;
  type: 'tax_invoice' | 'online';
  status: 'pending' | 'approved' | 'rejected';
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

  // [삭제 기능 추가]
  const handleDelete = async (req: OrderRequest) => {
      if (!canManage) return alert("권한이 없습니다.");
      if (!confirm("정말 삭제하시겠습니까? (복구 불가)")) return;

      try {
          await deleteDoc(doc(db, 'users', currentUid!, 'ORDER_REQUESTS', req.id));
          
          // 로그 기록
          await addDoc(collection(db, 'users', currentUid!, 'activityLogs'), {
              text: `[발주삭제] ${myName}님이 ${req.siteName} 현장의 발주 건을 삭제했습니다.`,
              createdAt: serverTimestamp(),
              type: 'order_delete'
          });

          alert("삭제되었습니다.");
          fetchRequests(currentUid!);
      } catch(e) { 
          console.error(e);
          alert("삭제 중 오류가 발생했습니다."); 
      }
  };

  const handleApprove = async (req: OrderRequest) => {
      if (!canManage) return alert("권한이 없습니다.");
      
      if (req.type === 'tax_invoice' && !req.linkedInvoiceId) {
          return alert("세금계산서를 먼저 연결해주세요.");
      }

      if (!confirm("승인 하시겠습니까?\n(세금계산서의 현장/분류 정보도 함께 업데이트됩니다)")) return;
      
      try {
          // 1. 발주 승인 처리
          await updateDoc(doc(db, 'users', currentUid!, 'ORDER_REQUESTS', req.id), { status: 'approved' });

          // 2. [자동 설정] 연결된 세금계산서에 현장 및 분류값 업데이트
          if (req.type === 'tax_invoice' && req.linkedInvoiceId) {
              const invoiceRef = doc(db, 'users', currentUid!, 'TAX_PURCHASE', req.linkedInvoiceId);
              await updateDoc(invoiceRef, {
                  siteId: req.siteId,      // 현장 귀속
                  category1: req.category1, // 1차 분류
                  category2: req.category2, // 2차 분류
                  // 필요하다면 비고에 발주 승인 메모 추가 가능
                  // remark2: `발주승인됨(${req.requesterName})` 
              });
          }

          // 3. 로그 기록
          await addDoc(collection(db, 'users', currentUid!, 'activityLogs'), {
            text: `[발주승인] ${myName}님이 ${req.siteName} 현장의 발주 건을 승인했습니다.`,
            createdAt: serverTimestamp(),
            type: 'order_approve'
          });

          alert("승인 및 세금계산서 분류 설정이 완료되었습니다.");
          fetchRequests(currentUid!);
      } catch(e) { 
          console.error(e);
          alert("오류가 발생했습니다."); 
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
      if (req.status === 'approved' || canManage) {
          return content;
      }
      return <span className="secret-mask">🔒 승인 대기 (비공개)</span>;
  };

  const getStatusText = (status: string) => {
      switch(status) {
          case 'pending': return '승인대기';
          case 'approved': return '결제승인';
          case 'rejected': return '부결';
          default: return status;
      }
  };

  return (
    <div className="order-page-container">
        <div className="order-header">
            <h2>현장별 발주 요청 관리</h2>
            <div className="header-right">
                {isOwner && <button className="btn-perm-setting" onClick={() => setIsPermissionModalOpen(true)}>🔐 권한 설정</button>}
                <button className="btn-refresh" onClick={() => currentUid && fetchRequests(currentUid)}>🔄 새로고침</button>
            </div>
        </div>

        <div className="order-table-wrapper">
            <table className="order-table">
                <thead>
                    <tr>
                        <th>상태</th><th>요청일</th><th>현장명</th><th>요청자</th><th>구분</th><th>내역</th><th>금액/수량</th><th>관리</th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? <tr><td colSpan={8} className="loading">로딩 중...</td></tr> :
                    requests.length === 0 ? <tr><td colSpan={8} className="no-data">요청 내역이 없습니다.</td></tr> :
                    requests.map(req => (
                        <tr key={req.id} className={req.status}>
                            <td><span className={`status-badge ${req.status}`}>{getStatusText(req.status)}</span></td>
                            <td>{req.createdAt?.toDate ? req.createdAt.toDate().toLocaleDateString() : '-'}</td>
                            <td>{req.siteName}</td>
                            <td>{req.requesterName}</td>
                            <td>{req.type === 'tax_invoice' ? '세금계산서' : '인터넷구매'}</td>
                            <td className="cell-detail">
                                <div style={{fontSize:'12px', color:'#888'}}>{req.category1} &gt; {req.category2}</div>
                                {renderSecretCell(req, (
                                    req.type === 'tax_invoice' ? (
                                        <div>
                                            <div className="vendor">{req.vendorName}</div>
                                            <div className="item">{req.itemDetails}</div>
                                        </div>
                                    ) : (
                                        <div>
                                            <div>{req.memo}</div>
                                            {req.link && <a href={req.link} target="_blank" rel="noreferrer" className="link-text">🔗 링크</a>}
                                        </div>
                                    )
                                ))}
                                {req.rejectReason && <div style={{color:'#d63031', fontSize:'11px', marginTop:'4px'}}>🚫 사유: {req.rejectReason}</div>}
                            </td>
                            <td className="tar">
                                {renderSecretCell(req, (
                                    req.type === 'tax_invoice' ? (
                                        <>
                                            <strong>{req.amount?.toLocaleString()} 원</strong>
                                            <div style={{fontSize:'11px', color:'#555'}}>{req.bankName} {req.accountNumber}</div>
                                        </>
                                    ) : (
                                        <strong>{req.quantity} 개</strong>
                                    )
                                ))}
                            </td>
                            
                            <td className="tac action-cell">
                                {/* [관리 기능] 권한 있는 사람만 보임 */}
                                {canManage && (
                                    <div style={{display:'flex', gap:'4px', justifyContent:'center', alignItems:'center'}}>
                                        
                                        {/* 대기 상태일 때만 승인/부결/연결 가능 */}
                                        {req.status === 'pending' && (
                                            <>
                                                <button className="btn-reject" onClick={() => handleReject(req)}>부결</button>
                                                
                                                {req.type === 'tax_invoice' && (
                                                    <button 
                                                        className={`btn-link ${req.linkedInvoiceId ? 'linked' : ''}`}
                                                        onClick={() => setLinkTargetRequest(req)}
                                                    >
                                                        {req.linkedInvoiceId ? '연결됨' : '연결'}
                                                    </button>
                                                )}

                                                <button 
                                                    className="btn-approve" 
                                                    onClick={() => handleApprove(req)}
                                                    disabled={req.type === 'tax_invoice' && !req.linkedInvoiceId}
                                                    style={{ opacity: (req.type === 'tax_invoice' && !req.linkedInvoiceId) ? 0.5 : 1 }}
                                                >
                                                    승인
                                                </button>
                                            </>
                                        )}

                                        {/* 완료/부결 상태 텍스트 표시 */}
                                        {req.status === 'approved' && <span className="done-text">완료</span>}
                                        {req.status === 'rejected' && <span style={{color:'#aaa', fontSize:'12px'}}>부결</span>}

                                        {/* [추가] 삭제 버튼 (상태 무관하게 권한자에게 항상 표시 or 대기중에만 표시 등 정책에 따라 조정. 여기선 항상 표시) */}
                                        <button 
                                            className="btn-delete-mini" 
                                            onClick={() => handleDelete(req)}
                                            style={{marginLeft:'5px', padding:'4px 6px', border:'1px solid #ccc', background:'#fff', color:'#555', borderRadius:'4px', cursor:'pointer'}}
                                            title="삭제"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
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