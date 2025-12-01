import React, { useState, useEffect } from 'react';
import { 
  getFirestore, collection, query, where, getDocs, deleteDoc, doc, addDoc, serverTimestamp 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions'; // 문자 발송용은 유지 (선택사항)
import { functions } from '../../firebase-config'; // 문자 발송용
import './ContractorInviteModal.css'; 

interface Props {
  siteId: string;
  siteName: string;
  partnerUid: string;
  clientPhone: string; 
  onClose: () => void;
}

const LINK_COOLDOWN_MS = 0;
const SMS_COOLDOWN_MS = 10 * 60 * 1000; 

const ContractorInviteModal: React.FC<Props> = ({ siteId, siteName, partnerUid, clientPhone, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  
  const [linkRemaining, setLinkRemaining] = useState(0);
  const [smsRemaining, setSmsRemaining] = useState(0);

  const db = getFirestore();
  const STORAGE_KEY = `site_invite_${siteId}`;

  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      const { link, linkGeneratedAt, smsSentAt } = JSON.parse(savedData);
      const now = Date.now();

      if (link) setInviteLink(link);
      if (linkGeneratedAt) {
        const passed = now - linkGeneratedAt;
        if (passed < LINK_COOLDOWN_MS) setLinkRemaining(Math.ceil((LINK_COOLDOWN_MS - passed) / 1000));
      }
      if (smsSentAt) {
        const passed = now - smsSentAt;
        if (passed < SMS_COOLDOWN_MS) setSmsRemaining(Math.ceil((SMS_COOLDOWN_MS - passed) / 1000));
      }
    }
  }, [STORAGE_KEY]);

  useEffect(() => {
    const timer = setInterval(() => {
      setLinkRemaining(prev => (prev > 0 ? prev - 1 : 0));
      setSmsRemaining(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const updateStorage = (newData: any) => {
    const current = localStorage.getItem(STORAGE_KEY);
    const parsed = current ? JSON.parse(current) : {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, ...newData }));
  };

  // [기존 초대장 정리]
  const clearRevokedInvitations = async () => {
      try {
          const q = query(
              collection(db, 'siteInvitations'),
              where('siteId', '==', siteId),
              where('phone', '==', clientPhone.replace(/-/g, '')), 
              where('status', 'in', ['revoked', 'redeemed']) 
          );
          const snap = await getDocs(q);
          const deletePromises = snap.docs.map(d => deleteDoc(doc(db, 'siteInvitations', d.id)));
          await Promise.all(deletePromises);
      } catch (e) { console.error("기존 초대장 정리 실패:", e); }
  };

  // [⭐ 수정됨] 클라이언트에서 직접 DB 생성
  const handleGenerateLink = async () => {
    if (linkRemaining > 0) return alert(`링크 재생성까지 ${formatTime(linkRemaining)} 남았습니다.`);

    setIsLoading(true);
    try {
      // 1. 기존 무효 초대장 삭제
      await clearRevokedInvitations();

      // 2. [직접 생성] siteInvitations 컬렉션에 문서 추가
      // 이 코드가 실행되면 파이어스토어에 무조건 데이터가 생깁니다.
      const inviteRef = await addDoc(collection(db, 'siteInvitations'), {
          siteId: siteId,
          siteName: siteName,
          partnerUid: partnerUid,
          clientName: '고객', // 필요시 입력받거나 기본값
          phone: clientPhone.replace(/-/g, ''), // 하이픈 제거 저장
          status: 'pending', // 대기 상태
          createdAt: serverTimestamp(),
          expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 예: 3일 후 만료
      });

      const inviteId = inviteRef.id; // 생성된 문서 ID
      const link = `${window.location.origin}/join-site/${inviteId}`;
        
      setInviteLink(link);
      updateStorage({ link: link, linkGeneratedAt: Date.now() });
      setLinkRemaining(LINK_COOLDOWN_MS / 1000);

    } catch (error: any) {
      console.error("초대 생성 실패:", error);
      alert('초대 링크 생성 중 오류가 발생했습니다.\n' + (error.message || ''));
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteLink).then(() => alert('링크 복사 완료')).catch(() => alert('복사 실패'));
  };

  const handleSendSms = async () => {
    if (smsRemaining > 0) return alert(`문자 재발송까지 ${formatTime(smsRemaining)} 남았습니다.`);
    if (!clientPhone) return alert('등록된 연락처가 없습니다.');
    if (!confirm(`${clientPhone} 번호로 초대 문자를 발송하시겠습니까?`)) return;

    setIsLoading(true);
    try {
      // 문자 발송 전 링크가 없으면 생성 시도 (여기선 생략, 사용자가 생성 버튼을 누르게 유도)
      if (!inviteLink) {
          alert("먼저 초대 링크를 생성해주세요.");
          setIsLoading(false);
          return;
      }

      // 문자 발송은 서버 함수가 필요함 (SMS API 사용 때문)
      const sendInviteSms = httpsCallable(functions, 'sendContractorInviteSms');
      await sendInviteSms({ 
        phone: clientPhone, 
        message: `[초대] '${siteName}' 현장의 도급인으로 초대되었습니다.\n아래 링크를 눌러 수락해주세요.\n${inviteLink}`,
        siteName: siteName
      });
      alert('초대 문자가 발송되었습니다.');
      updateStorage({ smsSentAt: Date.now() });
      setSmsRemaining(SMS_COOLDOWN_MS / 1000);

    } catch (error) {
      console.error(error);
      alert('문자 발송에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="invite-modal-backdrop" onClick={onClose}>
      <div className="invite-modal-content" onClick={e => e.stopPropagation()}>
        <h3 className="invite-modal-title">도급인 초대</h3>
        
        <div className="invite-modal-body">
          {!inviteLink ? (
            <>
              <p className="invite-desc">
                <strong>[{siteName}]</strong> 현장의 도급인을 초대합니다.<br/>
                아래 버튼을 눌러 전용 초대 링크를 생성해주세요.
              </p>
              <div className="invite-actions">
                <button className="btn-generate-link" onClick={handleGenerateLink} disabled={isLoading}>
                  {isLoading ? '생성 중...' : '도급인 초대링크 생성'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="invite-desc">초대 링크가 생성되었습니다.</p>
              <div className="link-display-box">
                <input type="text" value={inviteLink} readOnly />
                <button onClick={copyToClipboard} className="btn-copy">복사</button>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <button className={`btn-regenerate ${linkRemaining > 0 ? 'disabled' : ''}`} onClick={handleGenerateLink} disabled={linkRemaining > 0 || isLoading}>
                    {linkRemaining > 0 ? `링크 재생성 대기 (${formatTime(linkRemaining)})` : '초대 링크 재생성'}
                </button>
              </div>
              <hr className="invite-divider" />
              <div className="sms-send-box">
                <label>문자로 링크 전송</label>
                <div className="sms-input-group">
                  <input type="tel" value={clientPhone || '연락처 없음'} readOnly className="input-readonly" style={{ backgroundColor: '#f5f5f5', color: '#555' }} />
                  <button className={`btn-send-sms ${smsRemaining > 0 ? 'disabled' : ''}`} onClick={handleSendSms} disabled={isLoading || smsRemaining > 0 || !clientPhone}>
                    {smsRemaining > 0 ? formatTime(smsRemaining) : (isLoading ? '전송 중...' : '문자 발송')}
                  </button>
                </div>
                {smsRemaining > 0 && <p style={{fontSize:'12px', color:'#dc3545', marginTop:'5px'}}>* 문자 재발송은 10분 뒤 가능합니다.</p>}
              </div>
            </>
          )}
        </div>
        <button className="btn-close-modal" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
};

export default ContractorInviteModal;