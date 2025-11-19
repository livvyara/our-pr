// src/components/partner/ContractorInviteModal.tsx

import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase-config';
import './ContractorInviteModal.css'; 

interface Props {
  siteId: string;
  siteName: string;
  partnerUid: string;
  clientPhone: string; // [⭐ 추가] 자동 입력될 전화번호
  onClose: () => void;
}

// 쿨타임 상수 (밀리초)
const LINK_COOLDOWN_MS = 30 * 60 * 1000; // 30분
const SMS_COOLDOWN_MS = 10 * 60 * 1000;  // 10분

const ContractorInviteModal: React.FC<Props> = ({ siteId, siteName, partnerUid, clientPhone, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  
  // 쿨타임 상태 (초 단위)
  const [linkRemaining, setLinkRemaining] = useState(0);
  const [smsRemaining, setSmsRemaining] = useState(0);

  // 로컬 스토리지 키 (현장별로 따로 관리)
  const STORAGE_KEY = `site_invite_${siteId}`;

  // [1] 초기화: 로컬 스토리지 확인 및 상태 복구
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      const { link, linkGeneratedAt, smsSentAt } = JSON.parse(savedData);
      const now = Date.now();

      // 링크 복구
      if (link) setInviteLink(link);

      // 링크 쿨타임 계산
      if (linkGeneratedAt) {
        const passed = now - linkGeneratedAt;
        if (passed < LINK_COOLDOWN_MS) {
          setLinkRemaining(Math.ceil((LINK_COOLDOWN_MS - passed) / 1000));
        }
      }

      // 문자 쿨타임 계산
      if (smsSentAt) {
        const passed = now - smsSentAt;
        if (passed < SMS_COOLDOWN_MS) {
          setSmsRemaining(Math.ceil((SMS_COOLDOWN_MS - passed) / 1000));
        }
      }
    }
  }, [STORAGE_KEY]);

  // [2] 타이머: 1초마다 감소
  useEffect(() => {
    const timer = setInterval(() => {
      setLinkRemaining(prev => (prev > 0 ? prev - 1 : 0));
      setSmsRemaining(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 시간 포맷 (MM:SS)
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // 로컬 스토리지 업데이트 헬퍼
  const updateStorage = (newData: any) => {
    const current = localStorage.getItem(STORAGE_KEY);
    const parsed = current ? JSON.parse(current) : {};
    const updated = { ...parsed, ...newData };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };


  // [3] 초대 링크 생성 핸들러
  const handleGenerateLink = async () => {
    if (linkRemaining > 0) {
      alert(`링크 재생성까지 ${formatTime(linkRemaining)} 남았습니다.`);
      return;
    }

    setIsLoading(true);
    try {
      const createInvite = httpsCallable(functions, 'createSiteInvitation');
      const result: any = await createInvite({ siteId, siteName, partnerUid });

      if (result.data.success) {
        const inviteId = result.data.inviteId;
        const link = `${window.location.origin}/join-site/${inviteId}`;
        
        setInviteLink(link);
        
        // 저장소 업데이트 (링크 + 생성 시간)
        updateStorage({
          link: link,
          linkGeneratedAt: Date.now()
        });
        
        // 쿨타임 시작
        setLinkRemaining(LINK_COOLDOWN_MS / 1000);
      }
    } catch (error: any) {
      console.error("초대 생성 실패:", error);
      alert('초대 링크 생성 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // [4] 링크 복사
  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      alert('링크가 클립보드에 복사되었습니다.');
    }).catch(() => alert('복사 실패. 수동으로 복사해주세요.'));
  };

  // [5] 문자 발송 핸들러
  const handleSendSms = async () => {
    if (smsRemaining > 0) {
      alert(`문자 재발송까지 ${formatTime(smsRemaining)} 남았습니다.`);
      return;
    }
    
    if (!clientPhone) {
      alert('등록된 연락처가 없습니다. 현장 정보에서 연락처1을 확인해주세요.');
      return;
    }

    if (!confirm(`${clientPhone} 번호로 초대 문자를 발송하시겠습니까?`)) return;

    setIsLoading(true);
    try {
      const sendInviteSms = httpsCallable(functions, 'sendContractorInviteSms');
      await sendInviteSms({ 
        phone: clientPhone, 
        message: `[초대] '${siteName}' 현장의 도급인으로 초대되었습니다.\n아래 링크를 눌러 수락해주세요.\n${inviteLink}`,
        siteName: siteName
      });

      alert('초대 문자가 발송되었습니다.');
      
      // 저장소 업데이트 (문자 발송 시간)
      updateStorage({ smsSentAt: Date.now() });
      
      // 쿨타임 시작
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
          {/* 링크가 없으면(최초) 생성 버튼 표시 */}
          {!inviteLink ? (
            <>
              <p className="invite-desc">
                <strong>[{siteName}]</strong> 현장의 도급인을 초대합니다.<br/>
                아래 버튼을 눌러 전용 초대 링크를 생성해주세요.
              </p>
              <div className="invite-actions">
                <button 
                  className="btn-generate-link" 
                  onClick={handleGenerateLink}
                  disabled={isLoading}
                >
                  {isLoading ? '생성 중...' : '도급인 초대링크 생성'}
                </button>
              </div>
            </>
          ) : (
            /* 링크가 있으면 생성된 화면 표시 (재생성 버튼 포함) */
            <>
              <p className="invite-desc">
                초대 링크가 생성되었습니다.
              </p>
              
              {/* 링크 표시 및 복사 */}
              <div className="link-display-box">
                <input type="text" value={inviteLink} readOnly />
                <button onClick={copyToClipboard} className="btn-copy">복사</button>
              </div>

              {/* 링크 재생성 버튼 (쿨타임 적용) */}
              <div style={{ marginBottom: '20px' }}>
                <button 
                    className={`btn-regenerate ${linkRemaining > 0 ? 'disabled' : ''}`}
                    onClick={handleGenerateLink}
                    disabled={linkRemaining > 0 || isLoading}
                >
                    {linkRemaining > 0 
                        ? `링크 재생성 대기 (${formatTime(linkRemaining)})` 
                        : '초대 링크 재생성'
                    }
                </button>
              </div>

              <hr className="invite-divider" />

              {/* 문자 발송 영역 */}
              <div className="sms-send-box">
                <label>문자로 링크 전송</label>
                <div className="sms-input-group">
                  <input 
                    type="tel" 
                    value={clientPhone || '연락처 없음'} 
                    readOnly // [⭐ 수정] 수정 불가
                    className="input-readonly"
                    style={{ backgroundColor: '#f5f5f5', color: '#555' }}
                  />
                  <button 
                    className={`btn-send-sms ${smsRemaining > 0 ? 'disabled' : ''}`} 
                    onClick={handleSendSms}
                    disabled={isLoading || smsRemaining > 0 || !clientPhone}
                  >
                    {smsRemaining > 0 ? formatTime(smsRemaining) : (isLoading ? '전송 중...' : '문자 발송')}
                  </button>
                </div>
                {smsRemaining > 0 && (
                    <p style={{fontSize:'12px', color:'#dc3545', marginTop:'5px'}}>
                        * 문자 재발송은 10분 뒤 가능합니다.
                    </p>
                )}
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