// src/components/partner/EmployeeAddTab.tsx

import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase-config';
import './EmployeeAddTab.css'; // (CSS는 하단에 제공)

// Cloud Function 호출
const createInvitation = httpsCallable(functions, 'createCompanyInvitation');

const EmployeeAddTab: React.FC = () => {
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  // 초대 링크 생성 핸들러
  const handleCreateInvitation = async () => {
    setIsCreatingLink(true);
    setGeneratedLink(null);
    try {
      const result: any = await createInvitation();
      
      if (result.data.success && result.data.inviteId) {
        const inviteId = result.data.inviteId;
        const link = `${window.location.origin}/join-company/${inviteId}`;
        setGeneratedLink(link);
      } else {
        throw new Error(result.data.message || '초대 코드 반환 실패');
      }
    } catch (error: any) {
      alert(`초대 링크 생성 실패: ${error.message}\n(대표 계정의 partnerInfo가 올바른지 확인하세요.)`);
    } finally {
      setIsCreatingLink(false);
    }
  };
  
  // 링크 복사 핸들러
  const copyToClipboard = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink).then(() => {
      alert('초대 링크가 클립보드에 복사되었습니다.');
    }).catch(err => {
      alert('복사 실패. 수동으로 복사해주세요.');
    });
  };

  return (
    <div>
      <h3>직원 등록 (초대)</h3>
      
      <div className="permission-invite-box">
        <h4>직원 초대</h4>
        <p>
          신규 직원이거나 아직 소속되지 않은 기존 회원을 초대합니다.
          생성된 링크를 직원에게 전달하세요. (링크는 1회용입니다)
        </p>
        <button 
          onClick={handleCreateInvitation}
          disabled={isCreatingLink}
          className="admin-save-button" // (스타일 재사용)
        >
          {isCreatingLink ? '생성 중...' : '1회용 초대 링크 생성'}
        </button>
        
        {generatedLink && (
          <div className="invite-link-wrapper">
            <input 
              type="text" 
              readOnly 
              value={generatedLink} 
              className="invite-link-input"
            />
            <button onClick={copyToClipboard} className="invite-link-copy">복사</button>
          </div>
        )}
      </div>

      <div className="invite-info-box">
        <h4>초대 진행 방법</h4>
        <ol>
          <li>링크를 생성하여 직원에게 전달합니다.</li>
          <li>직원이 링크를 클릭하여 로그인(또는 회원가입)합니다.</li>
          <li>직원이 "초대 수락" 버튼을 누르면 즉시 소속 직원으로 등록됩니다.</li>
          <li>등록된 직원은 '직원 목록' 탭에서 확인할 수 있습니다.</li>
        </ol>
      </div>
    </div>
  );
};

export default EmployeeAddTab;